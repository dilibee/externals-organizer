import { useState } from "react";
import { signIn } from "../lib/db";

export function Login() {
  const [email, setEmail] = useState(""); const [sent, setSent] = useState(false); const [err, setErr] = useState("");
  const go = async () => { setErr(""); try { await signIn(email.trim()); setSent(true); } catch (e: any) { setErr(e?.message || "Couldn't send the link."); } };
  return <div className="login"><div className="card">
    <img src={import.meta.env.BASE_URL + "icon.svg"} alt="" width={56} height={56} style={{ justifySelf: "center" }} />
    <h2>Externals Organizer</h2>
    {sent ? <p>Check <b>{email}</b> for a sign-in link. Open it on this device.</p> : <>
      <p className="muted" style={{ margin: 0 }}>Sign in with your email to load your plan on any device.</p>
      <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" aria-label="Email" onKeyDown={e => e.key === "Enter" && go()} />
      <button className="btn primary lg" onClick={go} disabled={!/.+@.+\..+/.test(email)}>Email me a sign-in link</button>
      {err && <span className="pill bad">{err}</span>}</>}
  </div></div>;
}
