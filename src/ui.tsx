// App-wide UI state: which day sheet / check-in is open, toasts, and celebrations.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { todayISO } from "./lib/dates";

export type SheetTab = "lesson" | "tasks" | "links" | "ask" | "wrap";
interface UI {
  sheet: { dayId: string; tab: SheetTab } | null;
  openDay: (dayId: string, tab?: SheetTab) => void;
  closeDay: () => void;
  checkIn: string | null;
  openCheckIn: (dayId: string) => void;
  closeCheckIn: () => void;
  toast: (msg: string) => void;
  celebrate: (xp: number) => void;
}
const Ctx = createContext<UI>(null!);
export const useUI = () => useContext(Ctx);

const COLORS = ["#6d5dfc", "#ff7a45", "#12b886", "#e64980", "#1c9be6", "#f2a516"];

export function UIProvider({ children }: { children: ReactNode }) {
  const [sheet, setSheet] = useState<UI["sheet"]>(null);
  const [checkIn, setCheckIn] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [party, setParty] = useState<{ xp: number; k: number } | null>(null);
  const t = useRef<number>(0), p = useRef<number>(0);
  const toast = useCallback((m: string) => { setMsg(m); clearTimeout(t.current); t.current = window.setTimeout(() => setMsg(null), 2800); }, []);
  const celebrate = useCallback((xp: number) => { setParty({ xp, k: Date.now() }); clearTimeout(p.current); p.current = window.setTimeout(() => setParty(null), 1800); }, []);
  const value = useMemo<UI>(() => ({
    sheet, openDay: (dayId, tab = "lesson") => setSheet({ dayId, tab }), closeDay: () => setSheet(null),
    checkIn, openCheckIn: setCheckIn, closeCheckIn: () => setCheckIn(null), toast, celebrate,
  }), [sheet, checkIn, toast, celebrate]);
  const pieces = useMemo(() => party ? Array.from({ length: 70 }, (_, i) => ({
    left: Math.random() * 100, delay: Math.random() * 0.4, color: COLORS[i % COLORS.length], dur: 1.1 + Math.random() * 0.7,
  })) : [], [party?.k]);
  return <Ctx.Provider value={value}>
    {children}
    {msg && <div className="toast" role="status">{msg}</div>}
    {party && <>
      <div className="confetti" aria-hidden="true">{pieces.map((c, i) => <i key={i} style={{ left: `${c.left}%`, background: c.color, animationDelay: `${c.delay}s`, animationDuration: `${c.dur}s` }} />)}</div>
      <div className="xpfloat" aria-live="polite">+{party.xp} XP</div>
    </>}
  </Ctx.Provider>;
}

/** Today's date, refreshed each minute so the app rolls over at midnight. */
export function useToday() {
  const [d, setD] = useState(todayISO());
  useEffect(() => { const i = setInterval(() => setD(todayISO()), 60000); return () => clearInterval(i); }, []);
  return d;
}
/** Re-render every second while `on`, for the live timer. */
export function useTick(on: boolean) {
  const [, setN] = useState(0);
  useEffect(() => { if (!on) return; const i = setInterval(() => setN(n => n + 1), 1000); return () => clearInterval(i); }, [on]);
}
