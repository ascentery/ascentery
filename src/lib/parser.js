// parser.js — typed command → backend call.
// Returns { local } lines to print, or runs an RPC. All game
// mutations go through the 007 RPCs; nothing writes tables directly.
import { supabase } from "./supabase";

const DIRS = ["north", "south", "east", "west", "up", "down",
  "northeast", "northwest", "southeast", "southwest"];
const DIR_SHORT = { n: "north", s: "south", e: "east", w: "west", u: "up", d: "down",
  ne: "northeast", nw: "northwest", se: "southeast", sw: "southwest" };

export async function runCommand(raw, ctx) {
  // ctx: { refreshRoom, print, talkToMob, queueAction, inCombat }
  const input = raw.trim();
  if (!input) return;
  const [head, ...rest] = input.split(/\s+/);
  const cmd = head.toLowerCase();
  const arg = rest.join(" ");

  const rpc = async (fn, params) => {
    const { data, error } = await supabase.rpc(fn, params);
    if (error) throw new Error(error.message.replace(/^.*?:\s*/, ""));
    return data;
  };

  try {
    // movement
    const dir = DIR_SHORT[cmd] ?? (DIRS.includes(cmd) ? cmd : null);
    if (dir || (cmd === "go" && arg)) {
      await rpc("cmd_move", { p_direction: dir ?? arg.toLowerCase() });
      return ctx.refreshRoom();
    }

    switch (cmd) {
      case "look":
      case "l":
        return ctx.refreshRoom();

      case "say":
      case "'":
        return rpc("cmd_say", { p_message: arg });

      case "emote":
      case "em":
      case ":":
        return rpc("cmd_emote", { p_action: arg });

      case "tell": {
        const [target, ...msg] = rest;
        await rpc("cmd_tell", { p_target_name: target, p_message: msg.join(" ") });
        return ctx.print("tell", `You tell ${target}, "${msg.join(" ")}"`);
      }

      case "sit": return rpc("cmd_stance", { p_stance: "sitting" });
      case "stand": return rpc("cmd_stance", { p_stance: "standing" });
      case "rest": return rpc("cmd_stance", { p_stance: "resting" });

      case "attack":
      case "kill":
      case "k":
        await rpc("cmd_attack", { p_target_name: arg });
        return;

      case "consider":
      case "con": {
        const hint = await rpc("cmd_consider", { p_target_name: arg });
        return ctx.print("system", hint);
      }

      case "flee":
        if (!ctx.inCombat()) return ctx.print("err", "You are not fighting.");
        await rpc("queue_combat_action", { p_action: { type: "flee" } });
        return ctx.print("combat", "You look for an opening to escape...");

      case "rescue":
        if (ctx.inCombat()) {
          await rpc("queue_combat_action", { p_action: { type: "rescue", ally: arg } });
          return ctx.print("combat", `You move to shield ${arg}!`);
        }
        await rpc("cmd_attack", { p_target_name: arg }); // joining = attack their foe flow
        return;

      case "cast":
        if (arg.toLowerCase() === "heal" && ctx.inCombat()) {
          await rpc("queue_combat_action", { p_action: { type: "cast", spell: "heal" } });
          return ctx.print("combat", "You begin chanting a healing prayer...");
        }
        return ctx.print("err", "You know only: cast heal (in combat).");

      case "drink": {
        const item = await ctx.findItem(arg, "consumable");
        if (!item) return ctx.print("err", `You have no ${arg}.`);
        if (ctx.inCombat()) {
          await rpc("queue_combat_action", { p_action: { type: "drink", item_id: item.id } });
          return ctx.print("combat", `You reach for the ${item.name}...`);
        }
        return rpc("drink_item", { p_item: item.id });
      }

      case "wield":
      case "wear": {
        const item = await ctx.findItem(arg);
        if (!item) return ctx.print("err", `You have no ${arg}.`);
        await rpc("equip_item", { p_item: item.id });
        return ctx.print("system", `You equip the ${item.name}.`);
      }

      case "remove": {
        const item = await ctx.findItem(arg);
        if (!item) return ctx.print("err", `You have no ${arg}.`);
        await rpc("remove_item", { p_item: item.id });
        return ctx.print("system", `You remove the ${item.name}.`);
      }

      case "inventory":
      case "inv":
      case "i":
        return ctx.showInventory();

      case "talk": {
        const name = arg.replace(/^to\s+/i, "");
        return ctx.talkToMob(name);
      }

      case "who":
        return ctx.showWho();

      case "ignore":
        return ctx.ignoreByName(arg);

      case "help":
        return ctx.print("system",
          "Commands: look, n/s/e/w/up/down, say, emote, tell <who> <msg>, who, sit, stand, rest,\n" +
          "attack <target>, consider <target>, flee, rescue <ally>, cast heal, drink <potion>,\n" +
          "wield/wear/remove <item>, inventory, talk to <mob>, ignore <player>");

      default:
        return ctx.print("err", `Unknown command: ${cmd} (try "help")`);
    }
  } catch (e) {
    ctx.print("err", e.message);
  }
}
