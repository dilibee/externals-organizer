import { useEffect, useRef, type CSSProperties } from "react";
import { fmtMin } from "../lib/dates";
import { md, inline } from "../lib/markdown";
import { DAY_BONUS, KIND, dayComplete, doneMap, taskXP } from "../lib/planner";
import { toggleTask } from "../lib/actions";
import { getStore } from "../lib/db";
import type { Day, Store, Track, WithId } from "../lib/types";
import { useUI } from "../ui";

export const tColor = (t?: Track) => `var(--t${(((t?.hue ?? 0) % 6) + 6) % 6})`;
export const tcStyle = (t?: Track) => ({ "--tc": tColor(t) }) as CSSProperties;

export function TrackTag({ t }: { t?: Track }) {
  return <span className="tname" style={tcStyle(t)}><span className="dot" />{t?.short || t?.name || "General"}</span>;
}
export function KindPill({ kind }: { kind: Day["kind"] }) {
  return <span className={`pill ${kind === "assessment" ? "bad" : kind === "mock" ? "warn" : kind === "project" ? "ok" : "info"}`}>{KIND[kind] || "Lesson"}</span>;
}
export function Segs({ s, d }: { s: Store; d: WithId<Day> }) {
  const dm = doneMap(s, d.id);
  return <div className="segs" aria-hidden="true">{(d.tasks || []).map(t => <i key={t.id} className={dm[t.id] ? "on" : ""} />)}</div>;
}
export const Inline = ({ text }: { text: string }) => <span dangerouslySetInnerHTML={{ __html: inline(text) }} />;

/** Markdown with working Copy buttons on code blocks. */
export function Prose({ text }: { text: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const onClick = (e: MouseEvent) => {
      const b = (e.target as HTMLElement).closest("[data-copy]") as HTMLButtonElement | null; if (!b) return;
      const code = b.closest(".codewin")?.querySelector("code")?.textContent || "";
      navigator.clipboard.writeText(code).then(() => { b.textContent = "Copied"; setTimeout(() => (b.textContent = "Copy"), 1500); }, () => {});
    };
    el.addEventListener("click", onClick); return () => el.removeEventListener("click", onClick);
  }, []);
  return <div ref={ref} className="prose" dangerouslySetInnerHTML={{ __html: md(text) }} />;
}

/** Check a task off; if that finishes the day, celebrate and open the check-in. */
export function useCheck() {
  const ui = useUI();
  return (dayId: string, taskId: string, on: boolean) => {
    toggleTask(dayId, taskId, on);
    if (!on) return;
    const s = getStore(); const d = s.days[dayId]; if (!d) return;
    const t = d.tasks.find(x => x.id === taskId);
    const finished = dayComplete(s, { id: dayId, ...d });
    ui.celebrate(taskXP(d.kind, t?.min || 0) + (finished ? DAY_BONUS : 0));
    if (finished && !s.feedback[dayId]) setTimeout(() => ui.openCheckIn(dayId), 900);
  };
}

export function TaskList({ s, d }: { s: Store; d: WithId<Day> }) {
  const check = useCheck(); const dm = doneMap(s, d.id); const p = s.progress[d.id];
  return <ul className="tasks">{(d.tasks || []).map(t => {
    const on = !!dm[t.id]; const id = `cb-${d.id}-${t.id}`; const act = p?.actual?.[t.id];
    return <li key={t.id} className={`task ${on ? "done" : ""}`}>
      <input type="checkbox" className="check" id={id} checked={on} onChange={e => check(d.id, t.id, e.target.checked)} />
      <label className="tx" htmlFor={id}><Inline text={t.text} />{t.url && <a className="lc" href={t.url} target="_blank" rel="noopener" onClick={e => e.stopPropagation()}>{/leetcode/.test(t.url) ? "LeetCode" : "Open"} ↗</a>}</label>
      <span className="mins num">{p?.timer?.taskId === t.id ? <span className="run">● timing</span> : act ? `${fmtMin(act)} / ${fmtMin(t.min)}` : fmtMin(Number(t.min) || 0)}</span>
    </li>;
  })}</ul>;
}

/** Time ring: green = done, ink = still planned, red when over the available time. */
export function TimeRing({ done, planned, avail }: { done: number; planned: number; avail: number }) {
  const total = Math.max(planned, avail, 1), C = 2 * Math.PI * 46;
  const a = (done / total) * C, b = (Math.max(0, planned - done) / total) * C;
  return <svg viewBox="0 0 112 112" aria-hidden="true">
    <circle cx="56" cy="56" r="46" fill="none" stroke="var(--sunk)" strokeWidth="12" />
    {b > 0 && <circle cx="56" cy="56" r="46" fill="none" stroke={planned > avail ? "var(--bad)" : "var(--accent)"} strokeWidth="12" strokeDasharray={`${b} ${C}`} strokeDashoffset={-a} strokeLinecap="round" />}
    {a > 0 && <circle cx="56" cy="56" r="46" fill="none" stroke="var(--ok)" strokeWidth="12" strokeDasharray={`${a} ${C}`} strokeLinecap="round" />}
  </svg>;
}
export function MiniRing({ frac, color }: { frac: number; color: string }) {
  const C = 2 * Math.PI * 12;
  return <svg viewBox="0 0 30 30" aria-hidden="true" style={{ transform: "rotate(-90deg)" }}>
    <circle cx="15" cy="15" r="12" fill="none" stroke="var(--sunk)" strokeWidth="4.5" />
    {frac > 0 && <circle cx="15" cy="15" r="12" fill="none" stroke={color} strokeWidth="4.5" strokeDasharray={`${Math.min(1, frac) * C} ${C}`} strokeLinecap="round" />}
  </svg>;
}

export const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
