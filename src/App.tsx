import { Sun, Moon, Monitor, CalendarDays, Target, Inbox, Flame, Star, Settings as Gear, type LucideIcon } from "lucide-react";
import { Settings } from "./views/Settings";
import { Progress } from "./views/Progress";
import { useEffect, useLayoutEffect, useState } from "react";
import { useDB, setErrorHandler } from "./lib/db";
import { catchupCount, stats } from "./lib/planner";
import { UIProvider, useToday, useUI, parseHash, MAIN_VIEWS } from "./ui";
import { Lesson } from "./views/Lesson";
import { CheckIn } from "./components/CheckIn";
import { Today } from "./views/Today";
import { Week } from "./views/Week";
import { Goals } from "./views/Goals";
import { Catchup } from "./views/Catchup";
import { Login } from "./views/Login";

type View = "today" | "week" | "goals" | "catchup";
const VIEWS: { k: View; l: string; ic: LucideIcon }[] = [{ k: "today", l: "Today", ic: Sun }, { k: "week", l: "Week", ic: CalendarDays }, { k: "goals", l: "Goals", ic: Target }, { k: "catchup", l: "Catch-up", ic: Inbox }];
const store = { get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch {} } };

function applyTheme(t: string | null) { if (t === "light" || t === "dark") document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; }

function Shell() {
  const db = useDB(); const ui = useUI(); const today = useToday();
  const [route, setRoute] = useState(() => parseHash(location.hash || "#" + (store.get("eo.view") || "today")));
  const view = route.view;
  useLayoutEffect(() => { window.scrollTo(0, view === "day" ? 0 : history.state?.lessonScroll || 0); }, [view, route.dayId, db.status]);
  useEffect(() => { if (MAIN_VIEWS.includes(view as View)) store.set("eo.view", view); }, [view]);
  const [theme, saveTheme] = useState(store.get("eo.theme"));
  const setTheme = (t: string | null) => { saveTheme(t); if (t) store.set("eo.theme", t); else { try { localStorage.removeItem("eo.theme"); } catch {} } };
  useEffect(() => { setErrorHandler(ui.toast); history.scrollRestoration = "manual"; if (!location.hash) history.replaceState(history.state, "", "#" + view); }, []);
  useEffect(() => { applyTheme(theme); }, [theme]);
  useEffect(() => {
    const onHash = () => { setRoute(parseHash(location.hash)); };
    addEventListener("hashchange", onHash); return () => removeEventListener("hashchange", onHash);
  }, []);
  const go = (v: string) => { setRoute(parseHash("#" + v)); if (MAIN_VIEWS.includes(v as View)) store.set("eo.view", v); history.replaceState(null, "", "#" + v); window.scrollTo(0, 0); };

  if (db.status === "loading") return <div className="loading">Opening your plan…</div>;
  if (db.status === "signedOut") return <Login />;
  if (db.status === "error") return <div className="loading">Couldn't load your plan: {db.error}</div>;

  const s = db.store; const st = stats(s, today); const cu = catchupCount(s, today);
  const nextTheme = () => { const order = [null, "light", "dark"]; const n = order[(order.indexOf(theme) + 1) % 3]; setTheme(n);  };
  const nav = (cls: string) => VIEWS.map(v => <button key={v.k} className={cls} role="tab" aria-selected={view === v.k} onClick={() => go(v.k)}>
    <v.ic aria-hidden="true" />{v.l}{v.k === "catchup" && cu > 0 && <span className="badge">{cu}</span>}</button>);

  return <>
    <header className="top"><div className="wrap top-row">
      <div className="brand"><img src={import.meta.env.BASE_URL + "icon.svg"} alt="" /><span className="hide-sm">Externals</span></div>
      <nav className="tabs" role="tablist">{nav("tab")}</nav>
      <div className="top-stats">
        <button className="chip lvl" onClick={() => go("progress")} aria-label={`Progress: ${st.streak} day streak, level ${st.level}`} title={`${st.into} / ${st.need} XP to level ${st.level + 1}`}><Flame aria-hidden="true" />{st.streak}<Star aria-hidden="true" />Lv {st.level}<span className="bar"><span style={{ width: `${st.into / st.need * 100}%` }} /></span></button>
        <button className="iconbtn" onClick={() => go("settings")} aria-label="Settings"><Gear aria-hidden="true" /></button>
        <button className="iconbtn" onClick={nextTheme} aria-label={`Theme: ${theme || "system"}`} title={`Theme: ${theme || "system"}`}>{theme === "dark" ? <Moon aria-hidden="true" /> : theme === "light" ? <Sun aria-hidden="true" /> : <Monitor aria-hidden="true" />}</button>
      </div>
    </div></header>
    <main className="wrap">
      {view === "day" && <Lesson key={route.dayId} dayId={route.dayId!} tab={route.tab!} />}
      {view === "settings" && <Settings theme={theme} setTheme={setTheme} />}
      {view === "progress" && <Progress />}
      {view === "today" && <Today go={go} />}
      {view === "week" && <Week />}
      {view === "goals" && <Goals />}
      {view === "catchup" && <Catchup />}
    </main>
    <nav className="bottomnav" role="tablist">{nav("navbtn")}</nav>
    {ui.checkIn && <CheckIn key={ui.checkIn} dayId={ui.checkIn} />}
  </>;
}

export default function App() { return <UIProvider><Shell /></UIProvider>; }
