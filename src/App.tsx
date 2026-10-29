import { useEffect, useState } from "react";
import { useDB, setErrorHandler } from "./lib/db";
import { catchupCount, stats } from "./lib/planner";
import { UIProvider, useToday, useUI } from "./ui";
import { DaySheet } from "./components/DaySheet";
import { CheckIn } from "./components/CheckIn";
import { Today } from "./views/Today";
import { Week } from "./views/Week";
import { Goals } from "./views/Goals";
import { Catchup } from "./views/Catchup";
import { Login } from "./views/Login";

type View = "today" | "week" | "goals" | "catchup";
const VIEWS: { k: View; l: string; ic: string }[] = [{ k: "today", l: "Today", ic: "☀️" }, { k: "week", l: "Week", ic: "🗓️" }, { k: "goals", l: "Goals", ic: "🎯" }, { k: "catchup", l: "Catch-up", ic: "🧺" }];
const store = { get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch {} } };

function applyTheme(t: string | null) { if (t === "light" || t === "dark") document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; }

function Shell() {
  const db = useDB(); const ui = useUI(); const today = useToday();
  const initial = (location.hash.slice(1) || store.get("eo.view") || "today") as View;
  const [view, setView] = useState<View>(VIEWS.some(v => v.k === initial) ? initial : "today");
  const [theme, setTheme] = useState(store.get("eo.theme"));
  useEffect(() => { setErrorHandler(ui.toast); }, []);
  useEffect(() => { applyTheme(theme); }, [theme]);
  useEffect(() => {
    const onHash = () => { const h = location.hash.slice(1) as View; if (VIEWS.some(v => v.k === h)) setView(h); };
    addEventListener("hashchange", onHash); return () => removeEventListener("hashchange", onHash);
  }, []);
  const go = (v: string) => { setView(v as View); store.set("eo.view", v); history.replaceState(null, "", "#" + v); window.scrollTo(0, 0); };

  if (db.status === "loading") return <div className="loading">Opening your plan…</div>;
  if (db.status === "signedOut") return <Login />;
  if (db.status === "error") return <div className="loading">Couldn't load your plan: {db.error}</div>;

  const s = db.store; const st = stats(s, today); const cu = catchupCount(s, today);
  const nextTheme = () => { const order = [null, "light", "dark"]; const n = order[(order.indexOf(theme) + 1) % 3]; setTheme(n); if (n) store.set("eo.theme", n); else localStorage.removeItem("eo.theme"); };
  const nav = (cls: string) => VIEWS.map(v => <button key={v.k} className={cls} role="tab" aria-selected={view === v.k} onClick={() => go(v.k)}>
    {cls === "navbtn" && <span className="ic">{v.ic}</span>}{v.l}{v.k === "catchup" && cu > 0 && <span className="badge">{cu}</span>}</button>);

  return <>
    <header className="top"><div className="wrap top-row">
      <div className="brand"><img src={import.meta.env.BASE_URL + "icon.svg"} alt="" /><span className="hide-sm">Externals</span></div>
      <nav className="tabs" role="tablist">{nav("tab")}</nav>
      <div className="top-stats">
        <span className="chip" title="Days in a row with at least one task checked"><span className="ic">🔥</span>{st.streak}</span>
        <span className="chip lvl" title={`${st.into} / ${st.need} XP to level ${st.level + 1}`}><span className="ic">⭐</span>Lv {st.level}<span className="bar"><span style={{ width: `${(st.into / st.need) * 100}%` }} /></span></span>
        <button className="iconbtn" onClick={nextTheme} aria-label={`Theme: ${theme || "system"}`} title={`Theme: ${theme || "system"}`}>{theme === "dark" ? "🌙" : theme === "light" ? "☀️" : "🌓"}</button>
      </div>
    </div></header>
    <main className="wrap">
      {view === "today" && <Today go={go} />}
      {view === "week" && <Week />}
      {view === "goals" && <Goals />}
      {view === "catchup" && <Catchup />}
    </main>
    <nav className="bottomnav" role="tablist">{nav("navbtn")}</nav>
    {ui.sheet && <DaySheet dayId={ui.sheet.dayId} tab={ui.sheet.tab} />}
    {ui.checkIn && <CheckIn key={ui.checkIn} dayId={ui.checkIn} />}
  </>;
}

export default function App() { return <UIProvider><Shell /></UIProvider>; }
