import { useState } from "react";
import { signIn, signInWithPassword } from "../lib/db";

export function Login() {
  const [email, setEmail] = useState(""); const [pw, setPw] = useState("");
  const [usePw, setUsePw] = useState(false); const [sent, setSent] = useState(false); const [err, setErr] = useState("");
  const ok = /.+@.+\..+/.test(email) && (!usePw || pw.length > 0);
  const go = async () => {
    if (!ok) return; setErr("");
    try { if (usePw) await signInWithPassword(email.trim(), pw); else { await signIn(email.trim()); setSent(true); } }
    catch (e: any) { setErr(/rate limit/i.test(e?.message || "") ? "Too many sign-in emails this hour. Use your password instead, or try again later." : e?.message || "Couldn't sign in."); }
  };
  return <div className="login"><div className="card">
    <img src={import.meta.env.BASE_URL + "icon.svg"} alt="" width={56} height={56} style={{ justifySelf: "center" }} />
    <h2>Externals Organizer</h2>
    {sent ? <p>Check <b>{email}</b> for a sign-in link. Open it on this device.</p> : <>
      <p className="muted" style={{ margin: 0 }}>{usePw ? "Sign in with your email and password." : "Sign in with your email to load your plan on any device."}</p>
      <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" aria-label="Email" autoComplete="email" onKeyDown={e => e.key === "Enter" && go()} />
      {usePw && <input type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder="Password" aria-label="Password" autoComplete="current-password" onKeyDown={e => e.key === "Enter" && go()} />}
      <button className="btn primary lg" onClick={go} disabled={!ok}>{usePw ? "Sign in" : "Email me a sign-in link"}</button>
      <button className="btn ghost sm" onClick={() => { setUsePw(v => !v); setErr(""); }}>{usePw ? "Use an email link instead" : "Use a password instead"}</button>
      {err && <span className="pill bad" style={{ whiteSpace: "normal" }}>{err}</span>}</>}
  </div></div>;
}
