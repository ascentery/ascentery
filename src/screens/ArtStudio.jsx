import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { roomBanner } from "../lib/svgScene";

// Admin Art Studio — generate and approve AI art for rooms, mobs,
// and items. Spend is shown live from ai_usage_logs.

const KINDS = {
  room: {
    label: "Rooms", table: "rooms",
    cols: "id, title, description, tags, image_prompt, banner_image_path, image_approved",
    name: (r) => r.title, pathCol: "banner_image_path",
    defaultPrompt: (r) =>
      `Wide establishing shot of ${r.title}: ${r.description}`,
  },
  mob: {
    label: "Mobs", table: "mob_templates",
    cols: "id, name, description, personality, image_prompt, image_path, image_approved",
    name: (r) => r.name, pathCol: "image_path",
    defaultPrompt: (r) =>
      `Full-body character portrait of ${r.name}: ${r.description}`,
  },
  item: {
    label: "Equipment", table: "item_templates",
    cols: "id, name, description, rarity, image_prompt, image_path, image_approved",
    name: (r) => r.name, pathCol: "image_path",
    defaultPrompt: (r) =>
      `Single ${r.rarity} item on a dark background, centered: ${r.name}. ${r.description}`,
  },
};

function artUrl(path) {
  return path
    ? supabase.storage.from("art").getPublicUrl(path).data.publicUrl
    : null;
}

export default function ArtStudio({ onBack }) {
  const [kind, setKind] = useState("room");
  const [rows, setRows] = useState([]);
  const [prompts, setPrompts] = useState({});
  const [status, setStatus] = useState({});   // id -> generating|error:<msg>
  const [spend, setSpend] = useState(null);
  const [cfgPrice, setCfgPrice] = useState(null);

  const K = KINDS[kind];

  async function load() {
    const { data } = await supabase.from(K.table).select(K.cols).order("created_at");
    setRows(data ?? []);
    const { data: sp } = await supabase.rpc("art_spend");
    setSpend(sp);
    const { data: st } = await supabase.from("game_settings")
      .select("value").eq("key", "art_ai").single();
    setCfgPrice(st?.value?.prices?.[st?.value?.quality ?? "medium"] ?? null);
  }
  useEffect(() => { load(); }, [kind]);

  const promptFor = (r) => prompts[r.id] ?? r.image_prompt ?? K.defaultPrompt(r);

  async function generate(r) {
    setStatus((s) => ({ ...s, [r.id]: "generating" }));
    const { data, error } = await supabase.functions.invoke("generate-art", {
      body: { entity_type: kind, entity_id: r.id, prompt: promptFor(r) },
    });
    if (error || data?.error) {
      setStatus((s) => ({ ...s, [r.id]: "error:" + (data?.error ?? error.message) }));
      return;
    }
    setStatus((s) => ({ ...s, [r.id]: undefined }));
    await load();
  }

  async function approve(r, value) {
    await supabase.from(K.table).update({ image_approved: value }).eq("id", r.id);
    await load();
  }

  const missing = rows.filter((r) => !r[K.pathCol]).length;

  async function generateAllMissing() {
    for (const r of rows.filter((x) => !x[K.pathCol])) {
      await generate(r);   // sequential: respects provider rate limits
    }
  }

  return (
    <div className="studio">
      <header className="studio-head">
        <button className="linkish" onClick={onBack}>‹ World</button>
        <h2>Art Studio</h2>
        {spend && (
          <div className="spend" title="OpenAI image API spend (from usage logs)">
            <span>${Number(spend.this_month).toFixed(2)} this month</span>
            <span className="spend-dim">${Number(spend.total).toFixed(2)} all-time · {spend.images} images</span>
          </div>
        )}
      </header>

      <nav className="studio-tabs">
        {Object.entries(KINDS).map(([k, v]) => (
          <button key={k} className={kind === k ? "active" : ""} onClick={() => setKind(k)}>
            {v.label}
          </button>
        ))}
        {missing > 0 && cfgPrice != null && (
          <button className="primary batch" onClick={generateAllMissing}>
            Generate {missing} missing (~${(missing * cfgPrice).toFixed(2)})
          </button>
        )}
      </nav>

      <div className="studio-rows">
        {rows.map((r) => {
          const url = artUrl(r[K.pathCol]);
          const st = status[r.id];
          return (
            <div key={r.id} className="art-row">
              <div className="art-slot">
                {url ? (
                  <img src={url} alt={K.name(r)} />
                ) : kind === "room" ? (
                  <div className="art-fallback"
                       dangerouslySetInnerHTML={{ __html: roomBanner(r.tags ?? [], r.id, 400, 110) }} />
                ) : (
                  <div className="art-empty">no art</div>
                )}
                {st === "generating" && <div className="art-busy">painting…</div>}
              </div>
              <div className="art-meta">
                <div className="art-title">
                  {K.name(r)}
                  {r[K.pathCol] && (
                    <span className={`badge ${r.image_approved ? "ok" : "pending"}`}>
                      {r.image_approved ? "live" : "unapproved"}
                    </span>
                  )}
                </div>
                <textarea rows="3" value={promptFor(r)}
                  onChange={(e) => setPrompts((p) => ({ ...p, [r.id]: e.target.value }))} />
                {st?.startsWith("error:") && <p className="error">{st.slice(6)}</p>}
                <div className="art-actions">
                  <button disabled={st === "generating"} onClick={() => generate(r)}>
                    {r[K.pathCol] ? "Regenerate" : "Generate"}
                    {cfgPrice != null && ` ($${cfgPrice})`}
                  </button>
                  {r[K.pathCol] && !r.image_approved && (
                    <button className="primary" onClick={() => approve(r, true)}>Approve</button>
                  )}
                  {r.image_approved && (
                    <button onClick={() => approve(r, false)}>Unapprove</button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
