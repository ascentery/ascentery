import { useState } from "react";
import { supabase } from "../lib/supabase";

export default function Auth() {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit() {
    setError(""); setNotice(""); setBusy(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({
          email: form.email, password: form.password,
        });
        if (error) throw error;
      } else {
        const dob = new Date(form.dob);
        const adult = new Date(); adult.setFullYear(adult.getFullYear() - 18);
        if (!(dob <= adult)) throw new Error("Ascentery is for adults — you must be 18 or older.");

        const { data, error } = await supabase.auth.signUp({
          email: form.email, password: form.password,
        });
        if (error) throw error;
        const { error: pErr } = await supabase.from("profiles").insert({
          user_id: data.user.id,
          username: form.username,
          display_name: form.display_name,
          country: form.country || null,
          date_of_birth: form.dob,
        });
        if (pErr) throw new Error(pErr.message.includes("unique") ? "That username is taken." : pErr.message);
        setNotice("Check your email to confirm your account, then log in.");
        setMode("login");
      }
    } catch (e) { setError(e.message); }
    setBusy(false);
  }

  return (
    <div className="centered">
      <h1 className="wordmark">Ascentery</h1>
      <p className="tagline">a living world in text · 18+</p>

      {mode === "signup" && (
        <>
          <div className="field"><label>Display name</label>
            <input value={form.display_name ?? ""} onChange={set("display_name")} /></div>
          <div className="field"><label>Username</label>
            <input value={form.username ?? ""} onChange={set("username")} autoCapitalize="none" /></div>
          <div className="field"><label>Date of birth</label>
            <input type="date" value={form.dob ?? ""} onChange={set("dob")} /></div>
          <div className="field"><label>Country</label>
            <input value={form.country ?? ""} onChange={set("country")} /></div>
        </>
      )}

      <div className="field"><label>Email</label>
        <input type="email" value={form.email ?? ""} onChange={set("email")} autoCapitalize="none" /></div>
      <div className="field"><label>Password</label>
        <input type="password" value={form.password ?? ""} onChange={set("password")} /></div>

      {error && <p className="error">{error}</p>}
      {notice && <p className="notice">{notice}</p>}

      <button className="primary" disabled={busy} onClick={submit}>
        {mode === "login" ? "Enter Ascentery" : "Create account"}
      </button>
      <button className="linkish" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); }}>
        {mode === "login" ? "New here? Create an account" : "Have an account? Log in"}
      </button>
    </div>
  );
}
