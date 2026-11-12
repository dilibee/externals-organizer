import { useState } from "react";
import { DOW, fmtMin } from "../lib/dates";
import { exportStore, mode, setPassword, signOut, useDB } from "../lib/db";
import { saveHours } from "../lib/actions";
import { DEFAULT_HOURS } from "../lib/planner";
import type { Store } from "../lib/types";
import { useToday, useUI } from "../ui";
export function Settings({ theme, setTheme }: { theme: string | null; setTheme: (t: string | null) => void }) {
 const { store: s } = useDB(); const today = useToday();
 return <div className="stack narrow"><div><h2>Settings</h2><p className="muted">Make room for your study routine.</p></div>
 <section className="card stack"><h3>Appearance</h3><div className="segmented" role="group" aria-label="Theme">{[null, "light", "dark"].map(t => <button key={t || "system"} className="btn sm" aria-pressed={theme === t} onClick={() => setTheme(t)}>{t ? t[0].toUpperCase() + t.slice(1) : "System"}</button>)}</div></section>
 <HoursCard s={s} /><div className="card row"><span className="label">Data · {mode === "supabase" ? "synced with Supabase" : "stored in this browser"}</span><button className="btn sm" onClick={() => { const a = document.createElement("a"), url = URL.createObjectURL(new Blob([exportStore()], { type: "application/json" })); a.href = url; a.download = `externals-backup-${today}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }}>Download backup</button></div>
 {mode === "supabase" && <><PasswordCard /><div><button className="btn" onClick={() => signOut()}>Sign out</button></div></>}</div>;
}
function HoursCard({ s }: { s: Store }) {
  const ui = useUI(); const hrs = s.settings.main?.hours || DEFAULT_HOURS;
  const [draft, setDraft] = useState<Record<string, string> | null>(null);
  const order = [1, 2, 3, 4, 5, 6, 0];
  const week = order.reduce((a, i) => a + Number(hrs[i] ?? 0), 0);
  const val = (i: number) => draft ? draft[i] : String(Number(hrs[i] ?? 0) / 60);
  return <section className="card stack"><div><span className="label">{fmtMin(week)} a week</span><h3>Your weekly hours</h3>
    <p className="muted small" style={{ margin: "4px 0 0" }}>Hours you can study each day. Change a single day from Today or Week.</p></div>
    <div className="hours">{order.map(i => <label key={i} htmlFor={`hr-${i}`}>{DOW[i]}<input id={`hr-${i}`} type="number" min={0} max={16} step={0.25} value={val(i)}
      onChange={e => setDraft(d => ({ ...(d || Object.fromEntries(order.map(k => [k, String(Number(hrs[k] ?? 0) / 60)]))), [i]: e.target.value }))} /></label>)}</div>
    <div className="row"><button className="btn primary sm" disabled={!draft} onClick={() => { saveHours(Object.fromEntries(order.map(i => [i, Math.max(0, Math.round((Number(draft![i]) || 0) * 60))]))); setDraft(null); ui.toast("Hours saved"); }}>Save hours</button></div>
  </section>;
}

function PasswordCard() {
  const ui = useUI(); const [pw, setPw] = useState(""); const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { await setPassword(pw); setPw(""); ui.toast("Password set. Use it to sign in on other devices."); }
    catch (e: any) { ui.toast(e?.message || "Couldn't set the password."); }
    setBusy(false);
  };
  return <section className="card stack"><div><span className="label">Sign-in</span><h3>Password for other devices</h3>
    <p className="muted small" style={{ margin: "4px 0 0" }}>Set a password here, then choose "Use a password instead" on the sign-in screen of another device. No email needed.</p></div>
    <div className="row"><input type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder="New password (8+ characters)" aria-label="New password" autoComplete="new-password" style={{ maxWidth: 320 }} />
      <button className="btn primary sm" disabled={pw.length < 8 || busy} onClick={save}>Set password</button></div>
  </section>;
}
