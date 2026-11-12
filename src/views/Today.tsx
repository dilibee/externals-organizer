import { Icon } from "../components/bits";
import { useState } from "react";
import { addDays, diffDays, fmtMin, nice, relDays } from "../lib/dates";
import { useDB } from "../lib/db";
import { acceptSuggestion, completeCarry, elapsedMin, setOverride, setSuggestion, startTimer, stopTimer } from "../lib/actions";
import { availMin, catchup, catchupCount, catchupExtras, dayComplete, dayDoneCount, dayList, dayMinutes, daysOn, doneMinutes, extrasOn, focusQueue, leftTasks, openExtras, plannedOn, trackList, upcomingMilestones, type QueueItem } from "../lib/planner";
import type { Store } from "../lib/types";
import { useTick, useToday, useUI } from "../ui";
import { Bubbles, Inline, KindPill, MiniRing, Segs, TaskList, TimeRing, TrackTag, plural, tColor, tcStyle, useCheck } from "../components/bits";

const WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight"];
const mmss = (startedAt: string) => { const s = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

export function Today({ go }: { go: (v: string) => void }) {
  const { store: s } = useDB(); const today = useToday(); const ui = useUI();
  const items = daysOn(s, today); const extras = extrasOn(s, today);
  const q = focusQueue(s, today);
  const avail = availMin(s.settings.main, today);
  const planned = plannedOn(s, today);
  const done = items.reduce((a, d) => a + doneMinutes(s, d), 0) + Object.values(s.extras).filter(x => x.planFor === today && x.doneAt).reduce((a, x) => a + x.min, 0);
  const left = Math.max(0, planned - done);
  const over = planned - avail;
  const ms = [...upcomingMilestones(s, today, 6), ...trackList(s).filter(t => !t.paused && t.deadline && t.deadline >= today && !(t.milestones || []).some(m => m.date === t.deadline)).map(t => ({ date: t.deadline!, label: `${t.name}: deadline`, track: t }))].sort((a, b) => a.date.localeCompare(b.date));
  const cu = catchup(s, today);
  const cuMin = cu.reduce((a, d) => a + leftTasks(s, d).reduce((x, t) => x + t.min, 0), 0) + catchupExtras(s, today).reduce((a, x) => a + x.min, 0);
  const sugg = Object.entries(s.suggestions).filter(([, x]) => x.status === "new").slice(0, 3);
  const unchecked = dayList(s).filter(d => d.date <= today && d.date >= addDays(today, -3) && dayComplete(s, d) && !s.feedback[d.id]);
  const tracksToday = [...new Set(items.map(d => d.trackId))];

  const n = items.length;
  const headline = !n && !extras.length ? <>A free day.</> : !q.length ? <>All done for <em>today</em>! 🎉</> : <>{WORDS[n] || n} session{n === 1 ? "" : "s"}, <em>{fmtMin(left)}</em> to go.</>;

  return <div className="today">
    <section className="stack">
      <div className="hello"><Bubbles /><span className="label">Your study desk</span>
        <span className="label">{nice(today)} · {fmtMin(avail)} set aside</span>
        <h2>{headline}</h2>
        {over > 0 && <span className="pill bad" style={{ justifySelf: "start" }}>{fmtMin(over)} more than you set aside</span>}
      </div>
      {tracksToday.length > 0 && <div className="rings">{tracksToday.map(tid => {
        const ds = items.filter(d => d.trackId === tid); const tot = ds.reduce((a, d) => a + d.tasks.length, 0); const dn = ds.reduce((a, d) => a + dayDoneCount(s, d), 0);
        return <span key={tid} className="tring"><MiniRing frac={tot ? dn / tot : 0} color={tColor(s.tracks[tid])} />{s.tracks[tid]?.short || s.tracks[tid]?.name} <span className="muted">{dn}/{tot}</span></span>;
      })}</div>}

      <section className="card summary-strip"><div className="summary-cell"><div className="ring"><TimeRing done={done} planned={planned} avail={avail} /></div><div className="small"><b>{fmtMin(done)} done · {fmtMin(left)} left</b><div className="muted">{over > 0 ? `${fmtMin(over)} over` : `${fmtMin(Math.max(0, avail - planned))} spare`}</div><OverrideEdit date={today} avail={avail} /></div></div>
      <div className="summary-cell stack"><span className="label">Next deadline</span>{ms[0] ? <><b>{nice(ms[0].date)} · {ms[0].label}</b><div className="row small">{relDays(diffDays(today, ms[0].date))}<TrackTag t={ms[0].track} /></div><a href="#goals">All deadlines</a></> : <span className="muted">No upcoming deadlines</span>}</div>
      <div className="summary-cell stack"><span className="label">Catch-up</span>{catchupCount(s, today) ? <><b>{catchupCount(s, today)} items · {fmtMin(cuMin)}</b><a href="#catchup">Open Catch-up</a></> : <span className="muted">Nothing behind</span>}</div></section>

      {unchecked.length > 0 && <div className="banner info"><span><Icon name="NotebookPen" /> {plural(unchecked.length, "finished day")} waiting for a check-in. It helps tune your next days.</span>
        <button className="btn sm primary" onClick={() => ui.openCheckIn(unchecked[0].id)}>Check in: {s.tracks[unchecked[0].trackId]?.short} Day {unchecked[0].dayNum}</button></div>}

      {q.length ? <NextUp s={s} item={q[0]} /> : (n || extras.length) ? <div className="alldone"><Bubbles /><div className="big">🏆</div><h3>Everything for today is checked off</h3><p className="muted">{cu.length ? "Feeling good? Knock something out of Catch-up." : "Rest up. Tomorrow's plan is ready."}</p>{cu.length > 0 && <button className="btn primary" onClick={() => go("catchup")}>Open Catch-up</button>}</div>
        : <div className="empty"><Bubbles /><div className="big"><Icon name="CloudSun" /></div><h3>Nothing on the desk</h3><p>{cu.length ? "A good day to clear something from Catch-up." : "Rest, or add a goal on the Goals screen."}</p></div>}

      {q.length > 1 && <div className="then"><span>Then:</span>{q.slice(1, 4).map(it => <span key={it.key} className="item" style={tcStyle(it.trackId ? s.tracks[it.trackId] : undefined)}><Inline text={it.kind === "task" ? it.task.text : it.extra.text} /></span>)}{q.length > 4 && <span>+{q.length - 4} more</span>}</div>}

      <div className="stack">
        {items.map(d => { const t = s.tracks[d.trackId];
          return <article key={d.id} className="card tc daycard" style={tcStyle(t)}>
            <div className="meta"><TrackTag t={t} /><span>Day {d.dayNum}</span>{q[0]?.kind === "task" && q[0].dayId === d.id && <span className="pill info">In progress</span>}<KindPill kind={d.kind} /><span className="num">{fmtMin(dayMinutes(d))}</span>{s.feedback[d.id] && <span className="pill ok">Checked in</span>}</div>
            <h3>{d.title}</h3>{d.focus && <p className="focus">{d.focus}</p>}
            <Segs s={s} d={d} /><TaskList s={s} d={d} />
            <div className="foot"><button className="btn primary sm" onClick={() => ui.openDay(d.id, "lesson")}>Open lesson</button><button className="btn sm" onClick={() => ui.openDay(d.id, "ask")}>Ask AI</button>
              <span className="count num">{dayDoneCount(s, d)}/{d.tasks.length}</span></div>
          </article>; })}
        {extras.length > 0 && <article className="card"><span className="label">Carried over to today</span><ExtraList s={s} items={extras} /></article>}
      </div>
      {sugg.length > 0 && <div className="card"><span className="label"><Icon name="Lightbulb" /> Suggestions</span>
        <div className="stack" style={{ gap: 10, marginTop: 10 }}>{sugg.map(([id, x]) => <div key={id} className="stack" style={{ gap: 4 }}>
          <div className="row"><TrackTag t={x.trackId ? s.tracks[x.trackId] : undefined} /><span className="muted small">{fmtMin(x.min || 20)}</span></div>
          <b style={{ color: "var(--ink)" }}><Inline text={x.text} /></b>{x.why && <span className="muted small">{x.why}</span>}
          <div className="row"><button className="btn sm primary" onClick={() => { acceptSuggestion(id, today); ui.toast("Added to today"); }}>Add to today</button><button className="btn sm" onClick={() => { acceptSuggestion(id); ui.toast("Added to Catch-up"); }}>Later</button><button className="btn sm ghost" onClick={() => setSuggestion(id, "dismissed")}>Dismiss</button></div>
        </div>)}</div></div>}

    </section>


  </div>;
}

function NextUp({ s, item }: { s: Store; item: QueueItem }) {
  const ui = useUI(); const check = useCheck();
  const t = item.trackId ? s.tracks[item.trackId] : undefined;
  const timer = item.kind === "task" ? s.progress[item.dayId]?.timer : null;
  const running = !!timer && item.kind === "task" && timer.taskId === item.task.id;
  useTick(running);
  const actual = item.kind === "task" ? s.progress[item.dayId]?.actual?.[item.task.id] : 0;
  return <article className="nextup" style={tcStyle(t)}><Bubbles white />
    <span className="label"><Icon name="Zap" /> Next up</span>
    <h3><Inline text={item.kind === "task" ? item.task.text : item.extra.text} /></h3>
    <div className="meta">
      <span className="tag">{t?.short || t?.name || "Extra"}</span>
      {item.kind === "task" ? <><span>Day {item.day.dayNum} · {item.day.title}</span><span>· {fmtMin(item.task.min)}</span>{actual ? <span>· {fmtMin(actual)} logged</span> : null}</>
        : <span>{item.extra.source === "carry" ? "Carried over" : "Catch-up"} · {fmtMin(item.extra.min)}</span>}
      {item.kind === "task" && item.task.url && <a href={item.task.url} target="_blank" rel="noopener">{/leetcode/.test(item.task.url) ? "LeetCode" : "Open"} <Icon name="ArrowUpRight" /></a>}
    </div>
    <div className="acts">
      {item.kind === "task" && (running
        ? <button className="btn glass lg" onClick={() => stopTimer(item.dayId)} aria-label="Pause timer"><Icon name="Pause" /> <span className="timer">{mmss(timer!.startedAt)}</span></button>
        : <button className="btn glass lg" onClick={() => startTimer(item.dayId, item.task.id)}><Icon name="Play" /> Start</button>)}
      <button className="btn white lg" onClick={() => item.kind === "task" ? check(item.dayId, item.task.id, true) : (completeCarry(item.extraId, true), ui.celebrate(Math.round(item.extra.min)))}><Icon name="Check" /> Done{running ? ` (${elapsedMin(timer!.startedAt)} min)` : ""}</button>
      {item.kind === "task" && <button className="btn glass" onClick={() => ui.openDay(item.dayId, "lesson")}>Open lesson</button>}
    </div>
  </article>;
}

export function ExtraList({ s, items, onRemove }: { s: Store; items: ReturnType<typeof openExtras>; onRemove?: (id: string) => void }) {
  const ui = useUI();
  return <ul className="tasks" style={{ marginTop: 8 }}>{items.map(x => <li key={x.id} className="task">
    <input type="checkbox" className="check" id={`x-${x.id}`} style={tcStyle(x.trackId ? s.tracks[x.trackId] : undefined)} checked={!!x.doneAt} onChange={e => { completeCarry(x.id, e.target.checked); if (e.target.checked) ui.celebrate(Math.round(x.min)); }} />
    <label className="tx" htmlFor={`x-${x.id}`}><Inline text={x.text} /> {x.trackId && <TrackTag t={s.tracks[x.trackId]} />}</label>
    {onRemove ? <div className="stack" style={{ gap: 4, alignItems: "end" }}><span className="mins num">{fmtMin(x.min)}</span>
      <button className="btn ghost sm" onClick={() => onRemove(x.id)} aria-label={`Remove ${x.text}`}>Remove</button></div>
      : <span className="mins num">{fmtMin(x.min)}</span>}
  </li>)}</ul>;
}

export function OverrideEdit({ date, avail }: { date: string; avail: number }) {
  const { store: s } = useDB(); const [open, setOpen] = useState(false); const [v, setV] = useState("");
  const has = s.settings.main?.overrides?.[date] != null;
  if (!open) return <button className="btn ghost sm" onClick={() => { setV(String(+(avail / 60).toFixed(2))); setOpen(true); }}>{has ? "Edited" : "Change"} <Icon name="Pencil" /></button>;
  return <span className="row" style={{ gap: 4 }}>
    <input type="number" min={0} max={16} step={0.25} value={v} onChange={e => setV(e.target.value)} aria-label="Hours available" style={{ width: 70, minHeight: 32, padding: "4px 8px" }} /><span className="small muted">h</span>
    <button className="btn sm primary" onClick={() => { setOverride(date, (Number(v) || 0) * 60); setOpen(false); }}>Set</button>
    {has && <button className="btn sm ghost" onClick={() => { setOverride(date, null); setOpen(false); }}>Reset</button>}
  </span>;
}
