import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { avatarSvg } from "../lib/avatar";

export default function CharacterSelect({ onEnter }) {
  const [chars, setChars] = useState(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({});
  const [error, setError] = useState("");

  async function load() {
    const { data } = await supabase.from("characters")
      .select("id, name, level, bio").order("created_at");
    setChars(data ?? []);
  }
  useEffect(() => { load(); }, []);

  async function create() {
    setError("");
    const { error } = await supabase.from("characters").insert({
      user_id: (await supabase.auth.getUser()).data.user.id,
      name: form.name, bio: form.bio ?? "", age: Number(form.age) || 18,
    });
    if (error) {
      setError(error.message.includes("unique") ? "That name is taken." : error.message);
      return;
    }
    setCreating(false); setForm({}); load();
  }

  async function enter(id) {
    const { error } = await supabase.rpc("select_character", { p_character: id });
    if (error) { setError(error.message); return; }
    onEnter(id);
  }

  if (chars === null) return <div className="centered"><p className="tagline">Waking the world…</p></div>;

  return (
    <div className="centered">
      <h1 className="wordmark">Ascentery</h1>
      <p className="tagline">Choose who you'll be tonight</p>

      {chars.map((c) => (
        <button key={c.id} className="char-card" onClick={() => enter(c.id)}>
          <span dangerouslySetInnerHTML={{ __html: avatarSvg(c.name, {}, 44) }} />
          <span>
            <span className="name">{c.name}</span><br />
            <span className="meta">Level {c.level}{c.bio ? ` · ${c.bio.slice(0, 60)}` : ""}</span>
          </span>
        </button>
      ))}

      {creating ? (
        <>
          <div className="field"><label>Character name</label>
            <input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="field"><label>Age (in-world, 18+)</label>
            <input type="number" min="18" value={form.age ?? ""} onChange={(e) => setForm({ ...form, age: e.target.value })} /></div>
          <div className="field"><label>Bio</label>
            <input value={form.bio ?? ""} onChange={(e) => setForm({ ...form, bio: e.target.value })} /></div>
          {error && <p className="error">{error}</p>}
          <button className="primary" onClick={create}>Create character</button>
          <button className="linkish" onClick={() => setCreating(false)}>Cancel</button>
        </>
      ) : (
        <>
          {error && <p className="error">{error}</p>}
          {chars.length < 3 && <button onClick={() => setCreating(true)}>New character</button>}
          <button className="linkish" onClick={() => supabase.auth.signOut()}>Log out</button>
        </>
      )}
    </div>
  );
}
