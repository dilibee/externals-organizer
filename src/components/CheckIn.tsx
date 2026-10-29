// End-of-day check-in: how it felt, real time spent, what still needs work. Feeds adaptation.
import { useState } from "react";
import { fmtMin } from "../lib/dates";
import { useDB } from "../lib/db";
import { saveFeedback } from "../lib/actions";
import { dayMinutes } from "../lib/planner";
import type { Rating } from "../lib/types";
import { useUI } from "../ui";
import { Inline, TrackTag } from "./bits";

const RATINGS: { k: Rating; e: string; l: string }[] = [{ k: "easy", e: "😎", l: "Too easy" }, { k: "right", e: "👌", l: "About right" }, { k: "hard", e: "🥵", l: "Too hard" }];

export function CheckIn({ dayId }: { dayId: string }) {
  const { store: s } = useDB(); const ui = useUI();
  const d = s.days[dayId]; const prev = s.feedback[dayId]; const p = s.progress[dayId];
  const timed = Object.values(p?.actual || {}).reduce((a, m) => a + m, 0);
  const [rating, setRating] = useState<Rating | null>(prev?.rating ?? null);
  const [mins, setMins] = useState(String(prev?.actualMin ?? (timed || (d ? dayMinutes(d) : 0))));
  const [picked, setPicked] = useState<string[]>(prev?.needsWork ?? []);
  const [other, setOther] = useState("");
  const [comment, setComment] = useState(prev?.comment ?? "");
  if (!d) return null;
  const t = s.tracks[d.trackId];
  const options = [d.focus, ...d.tasks.map(x => x.text)].filter((x): x is string => !!x).map(x => x.replace(/\s*\(.*?\)\s*$/, "").slice(0, 80));
  const toggle = (x: string) => setPicked(v => v.includes(x) ? v.filter(y => y !== x) : [...v, x]);
  const save = () => {
    if (!rating) return;
    saveFeedback(dayId, { rating, actualMin: Math.max(0, Math.round(Number(mins) || 0)), needsWork: [...picked, ...other.split(/[\n;]/)].map(x => x.trim()).filter(Boolean), comment: comment.trim() });
    ui.toast(picked.length || other.trim() ? "Check-in saved. Weak spots added to Catch-up." : "Check-in saved");
    ui.closeCheckIn();
  };
  return <>
    <div className="scrim modal-scrim" onClick={ui.closeCheckIn} />
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="ciTitle">
      <div className="spread"><TrackTag t={t} /><button className="btn circle ghost" onClick={ui.closeCheckIn} aria-label="Close">✕</button></div>
      <div><h3 id="ciTitle">How did “{d.title}” go?</h3><p className="muted small" style={{ margin: "4px 0 0" }}>Your answers reshape the next days: harder if it was easy, smaller steps if it was hard.</p></div>
      <div className="ratings" role="group" aria-label="Difficulty">{RATINGS.map(r =>
        <button key={r.k} aria-pressed={rating === r.k} onClick={() => setRating(r.k)}><span className="e">{r.e}</span>{r.l}</button>)}</div>
      <div className="field"><label htmlFor="ci-min">Time it actually took (minutes)</label>
        <input id="ci-min" type="number" min={0} step={5} value={mins} onChange={e => setMins(e.target.value)} />
        <span className="muted small">Planned {fmtMin(dayMinutes(d))}{timed ? ` · timer logged ${fmtMin(timed)}` : ""}</span></div>
      <div className="field"><span className="label" style={{ color: "var(--ink)" }}>Still need to work on (tap any)</span>
        <div className="chips">{options.map(x => <button key={x} aria-pressed={picked.includes(x)} onClick={() => toggle(x)}><Inline text={x} /></button>)}</div>
        <input placeholder="Something else? Separate with ;" value={other} onChange={e => setOther(e.target.value)} aria-label="Other weak spots" /></div>
      <div className="field"><label htmlFor="ci-c">Comment (optional)</label>
        <textarea id="ci-c" value={comment} onChange={e => setComment(e.target.value)} placeholder="e.g. BFS clicked, but I kept forgetting the visited check" style={{ minHeight: 70 }} /></div>
      <div className="row"><button className="btn primary lg" onClick={save} disabled={!rating}>Save check-in</button><button className="btn ghost" onClick={ui.closeCheckIn}>Later</button></div>
    </div>
  </>;
}
