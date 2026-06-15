import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { runCommand } from "../lib/parser";
import { roomBanner } from "../lib/svgScene";
import { avatarSvg } from "../lib/avatar";
import ArtStudio from "./ArtStudio";

let lineId = 0;
const TIERS = ["friend", "acquaintance", ""];

export default function Game({ characterId, onExit }) {
  const [tab, setTab] = useState("world");
  const [room, setRoom] = useState(null);
  const [lines, setLines] = useState([]);
  const [hubs, setHubs] = useState([]);
  const [friends, setFriends] = useState([]);
  const [dmWith, setDmWith] = useState(null);
  const [dms, setDms] = useState([]);
  const [userId, setUserId] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const logRef = useRef(null);
  const inputRef = useRef(null);
  const roomChanRef = useRef(null);
  const fightRef = useRef(false);

  const print = useCallback((kind, text) => {
    setLines((ls) => [...ls.slice(-300), { id: ++lineId, kind, text }]);
  }, []);

  // ---------- room view ----------
  const refreshRoom = useCallback(async (offset = 0) => {
    const { data, error } = await supabase.rpc("get_room_view", { p_offset: offset });
    if (error) return print("err", error.message);
    setRoom(data);
    print("title", data.title);
    print("desc", data.description);
    if (data.mobs?.length) {
      print("system", data.mobs.map((m) => `${m.name} is here.`).join("\n"));
    }
    print("system", `Exits: ${data.exits.join(", ") || "none"}.`);
    subscribeRoom(data.room_id);
  }, [print]);

  function subscribeRoom(roomId) {
    if (roomChanRef.current?.roomId === roomId) return;
    roomChanRef.current?.channel?.unsubscribe();
    const channel = supabase
      .channel(`room-${roomId}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "room_actions", filter: `room_id=eq.${roomId}` },
        (payload) => print(payload.new.action_type, payload.new.content))
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "fight_events" },
        (payload) => renderFightTick(payload.new))
      .subscribe();
    roomChanRef.current = { roomId, channel };
  }

  function renderFightTick(row) {
    fightRef.current = true;
    for (const ev of row.events) {
      if (ev.type === "hit") {
        print("combat", `${ev.actor} ${ev.crit ? "CRITICALLY strikes" : "strikes"} ${ev.target} for ${ev.damage}! (${ev.target_hp_pct}%)`);
      } else if (ev.type === "miss") {
        print("combat", `${ev.actor} swings at ${ev.target} and misses.`);
      } else if (ev.type === "flee") {
        print("combat", ev.success ? `${ev.actor} flees!` : `${ev.actor} tries to flee but can't escape!`);
      } else if (ev.type === "drink") {
        print("combat", `${ev.actor} drinks a ${ev.item}. (${ev.hp_pct}%)`);
      } else if (ev.type === "heal") {
        print("combat", `${ev.actor}'s wounds knit closed. (+${ev.amount})`);
      } else if (ev.type === "rescue") {
        print("combat", `${ev.actor} throws themselves into harm's way!`);
      } else if (ev.type === "death") {
        fightRef.current = false;
        print("combat", ev.respawned
          ? `${ev.actor} falls... and awakens at the temple.`
          : `${ev.actor} is slain!${ev.xp ? ` (+${ev.xp} xp)` : ""}${ev.loot?.length ? " Something drops." : ""}`);
      }
    }
  }

  // ---------- helpers handed to the parser ----------
  const ctx = {
    print,
    refreshRoom,
    inCombat: () => fightRef.current,
    findItem: async (nameLike, slot) => {
      let q = supabase.from("character_items")
        .select("id, item_templates!inner(name, slot)")
        .eq("character_id", characterId);
      const { data } = await q;
      const match = (data ?? []).find((r) =>
        r.item_templates.name.toLowerCase().includes(nameLike.toLowerCase()) &&
        (!slot || r.item_templates.slot === slot));
      return match ? { id: match.id, name: match.item_templates.name } : null;
    },
    showInventory: async () => {
      const { data } = await supabase.from("character_items")
        .select("equipped, item_templates(name, slot)")
        .eq("character_id", characterId);
      if (!data?.length) return print("system", "You are carrying nothing.");
      print("system", data.map((r) =>
        `${r.item_templates.name}${r.equipped ? " (equipped)" : ""}`).join("\n"));
    },
    showWho: async () => {
      const { data } = await supabase.from("characters")
        .select("name, level").eq("is_online", true).limit(50);
      print("system", `Adventurers abroad:\n` + (data ?? []).map((c) => `  ${c.name} (level ${c.level})`).join("\n"));
    },
    ignoreByName: async (name) => {
      const { data: target } = await supabase.from("characters")
        .select("user_id").ilike("name", name).limit(1).maybeSingle();
      if (!target) return print("err", "No one by that name.");
      const { error } = await supabase.from("ignores")
        .insert({ ignorer_id: userId, ignored_id: target.user_id });
      print("system", error ? error.message : `You will no longer hear ${name}.`);
    },
    talkToMob: async (mobName) => {
      const mob = room?.mobs?.find((m) => m.name.toLowerCase().includes(mobName.toLowerCase()));
      if (!mob) return print("err", "They are not here.");
      print("say", `You speak to ${mob.name}...`);
      const { data: tpl } = await supabase.from("mob_instances")
        .select("mob_templates(name, personality, fallback_lines)").eq("id", mob.id).single();
      const t = tpl.mob_templates;
      const { data: recent } = await supabase.from("room_actions")
        .select("content").eq("room_id", room.room_id)
        .order("created_at", { ascending: false }).limit(10);
      const { data: resp, error } = await supabase.functions.invoke("ai-proxy", {
        body: {
          purpose: "mob_dialogue",
          system: `You are ${t.name} in a fantasy MUD. Personality: ${t.personality}. Reply with one short in-character line of dialogue only.`,
          prompt: `Recent room events:\n${(recent ?? []).map((r) => r.content).reverse().join("\n")}\n\nA player addresses you. Respond in character.`,
          max_tokens: 120,
        },
      });
      if (error || resp?.ai_unavailable) {
        const fb = t.fallback_lines?.length
          ? t.fallback_lines[Math.floor(Math.random() * t.fallback_lines.length)]
          : `${t.name} regards you silently.`;
        print("say", fb);
        if (resp?.error) print("system", resp.error);
        return;
      }
      print("say", `${t.name} says, "${resp.text.replace(/^"|"$/g, "")}"`);
    },
  };

  async function onSubmit(e) {
    e.preventDefault();
    const value = inputRef.current.value;
    inputRef.current.value = "";
    await runCommand(value, ctx);
  }

  // ---------- friends & DMs ----------
  async function loadFriends() {
    const { data: rows } = await supabase.from("friendships")
      .select("requester_id, addressee_id").eq("status", "accepted");
    const me = userId;
    const ids = (rows ?? []).map((r) => (r.requester_id === me ? r.addressee_id : r.requester_id));
    if (!ids.length) return setFriends([]);
    const { data: profs } = await supabase.from("public_profiles")
      .select("user_id, display_name").in("user_id", ids);
    const { data: online } = await supabase.from("characters")
      .select("user_id, name").eq("is_online", true).in("user_id", ids);
    setFriends((profs ?? []).map((p) => ({
      ...p, online: online?.find((o) => o.user_id === p.user_id)?.name ?? null,
    })));
  }

  async function openDm(friend) {
    setDmWith(friend);
    const { data } = await supabase.from("direct_messages")
      .select("*")
      .or(`and(sender_id.eq.${userId},recipient_id.eq.${friend.user_id}),and(sender_id.eq.${friend.user_id},recipient_id.eq.${userId})`)
      .order("created_at").limit(100);
    setDms(data ?? []);
    await supabase.from("direct_messages").update({ read_at: new Date().toISOString() })
      .eq("recipient_id", userId).eq("sender_id", friend.user_id).is("read_at", null);
  }

  async function sendDm(body) {
    if (!body.trim()) return;
    const { data, error } = await supabase.from("direct_messages")
      .insert({ sender_id: userId, recipient_id: dmWith.user_id, body }).select().single();
    if (!error) setDms((d) => [...d, data]);
  }

  // ---------- boot ----------
  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      setUserId(u.user.id);
      const { data: prof } = await supabase.from("profiles")
        .select("is_admin").eq("user_id", u.user.id).single();
      setIsAdmin(!!prof?.is_admin);
      const { data: hubRooms } = await supabase.from("rooms")
        .select("id, hub_label").eq("is_hub", true);
      setHubs(hubRooms ?? []);
      print("system", "Welcome back to Ascentery. Type \"help\" for commands.");
      await refreshRoom();
    })();
    return () => roomChanRef.current?.channel?.unsubscribe();
  }, []);

  useEffect(() => {
    if (!userId) return;
    loadFriends();
    const ch = supabase.channel(`user-${userId}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "direct_messages", filter: `recipient_id=eq.${userId}` },
        (payload) => {
          if (payload.new.body.startsWith("[tell")) {
            print("tell", payload.new.body.replace(/^\[tell from (.+?)\] (.*)$/, '$1 tells you, "$2"'));
          } else if (dmWith && payload.new.sender_id === dmWith.user_id) {
            setDms((d) => [...d, payload.new]);
          }
        })
      .subscribe();
    return () => ch.unsubscribe();
  }, [userId, dmWith]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [lines]);

  // ---------- render ----------
  return (
    <div className="app">
      {tab === "world" && room && (
        <>
          <div className="banner">
            {room.banner_image_path ? (
              <img alt="" src={supabase.storage.from("art").getPublicUrl(room.banner_image_path).data.publicUrl}
                   style={{ display: "block", width: "100%", height: "auto" }} />
            ) : (
              <div dangerouslySetInnerHTML={{
                __html: room.cached_svg ?? roomBanner(room.tags, room.room_id) }} />
            )}
            <h2 className="room-title">{room.title}</h2>
          </div>
          {room.occupants?.length > 0 && (
            <div className="occupants">
              {room.occupants.map((o) => (
                <span key={o.id} className={`chip ${TIERS[o.tier]}`}>
                  <span dangerouslySetInnerHTML={{ __html: avatarSvg(o.name, o.avatar_opts, 22) }} />
                  {o.name} <span className="stance">{o.stance}</span>
                </span>
              ))}
              {room.occupant_total > room.occupants.length && (
                <button className="chip" onClick={() => refreshRoom(room.occupants.length)}>
                  +{room.occupant_total - room.occupants.length} more…
                </button>
              )}
            </div>
          )}
          <div className="log" ref={logRef}>
            {lines.map((l) => <div key={l.id} className={`line ${l.kind}`}>{l.text}</div>)}
          </div>
          <form className="prompt" onSubmit={onSubmit}>
            <span className="caret">›</span>
            <input ref={inputRef} placeholder="say hello…" autoCapitalize="none" autoComplete="off" />
          </form>
        </>
      )}

      {tab === "studio" && isAdmin && <ArtStudio onBack={() => setTab("world")} />}

      {tab === "travel" && (
        <div className="hub-grid">
          {hubs.map((h) => (
            <button key={h.id} className="hub-card" onClick={async () => {
              const { error } = await supabase.rpc("quick_travel", { p_room: h.id });
              if (error) { print("err", error.message); } else { await refreshRoom(); }
              setTab("world");
            }}>{h.hub_label}</button>
          ))}
        </div>
      )}

      {tab === "chat" && !dmWith && (
        <div className="friends">
          {friends.length === 0 && <p className="tagline">No friends yet — click a name in a room to add one.</p>}
          {friends.map((f) => (
            <button key={f.user_id} className="friend-row" onClick={() => openDm(f)}>
              <span className={`dot ${f.online ? "online" : ""}`} />
              <span>{f.display_name}{f.online ? ` · playing ${f.online}` : ""}</span>
            </button>
          ))}
          <button className="linkish" onClick={async () => {
            await supabase.rpc("logout_character"); onExit();
          }}>Leave the world</button>
        </div>
      )}

      {tab === "chat" && dmWith && (
        <>
          <button className="linkish" onClick={() => setDmWith(null)}>‹ {dmWith.display_name}</button>
          <div className="dm-thread">
            {dms.map((m) => (
              <div key={m.id} className={`dm ${m.sender_id === userId ? "mine" : ""}`}>
                {m.body}
                <span className="when">{new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
              </div>
            ))}
          </div>
          <form className="prompt" onSubmit={(e) => { e.preventDefault(); sendDm(e.target.msg.value); e.target.reset(); }}>
            <span className="caret">›</span>
            <input name="msg" placeholder={`Message ${dmWith.display_name}…`} autoComplete="off" />
          </form>
        </>
      )}

      <nav className="tabs">
        <button className={tab === "world" ? "active" : ""} onClick={() => setTab("world")}>World</button>
        <button className={tab === "travel" ? "active" : ""} onClick={() => setTab("travel")}>Travel</button>
        <button className={tab === "chat" ? "active" : ""} onClick={() => { setTab("chat"); loadFriends(); }}>Chat</button>
        {isAdmin && <button className={tab === "studio" ? "active" : ""} onClick={() => setTab("studio")}>Studio</button>}
      </nav>
    </div>
  );
}
