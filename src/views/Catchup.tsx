import { Icon } from "../components/bits";
import { CalendarDays, ChevronDown } from "lucide-react";
import { useState } from "react";
import { diffDays, fmtMin, nice, short } from "../lib/dates";
import { useDB } from "../lib/db";
import { addExtra, carryTasks, removeExtra } from "../lib/actions";
import { activeTracks, catchup, catchupCount, catchupExtras, fitIntoSpare, leftTasks, openExtras } from "../lib/planner";
import { useToday, useUI } from "../ui";
import { Bubbles, Segs, TaskList, TrackTag, tcStyle } from "../components/bits";
import { ExtraList } from "./Today";
import { Bridge } from '../components/Bridge';

export function Catchup() {
  const { store: s } = useDB(); const today = useToday(); const ui = useUI();
  const [fit, setFit] = useState(false), [adding, setAdding] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [text, setText] = useState(""); const [tid, setTid] = useState(""); const [min, setMin] = useState("30");
  const cu = catchup(s, today);
  const extras = catchupExtras(s, today);
  const planned = openExtras(s).filter(x => x.planFor && x.planFor >= today);
  const tasksLeft = catchupCount(s, today);
  const mins = cu.reduce((a, d) => a + leftTasks(s, d).reduce((x, t) => x + t.min, 0), 0) + extras.reduce((a, x) => a + x.min, 0);
  const proposals = fit ? fitIntoSpare(s, today) : [];
  const add = () => { if (!text.trim()) return; addExtra({ text: text.trim(), trackId: tid || undefined, min: Math.max(5, Number(min) || 30), source: "manual" }); setText(""); ui.toast("Added to Catch-up"); };

  return <div className="stack" style={{ gap: 18 }}>
    {Object.entries(s.jobs).filter(([,j])=>j.key.startsWith('nightly-catchup:')&&j.status!=='used').map(([id,j])=><section className="card stack" key={id}>
      <h3>Overnight catch-up proposal</h3><p className="muted">Review the changes, then Apply or dismiss them.</p>
      <Bridge jobKey={j.key} mode="plan" prompt={()=>j.prompt} cta="Apply" />
    </section>)}
    <section className="callout"><Bubbles /><div><span className="label">Catch-up</span><h2>{tasksLeft ? `${tasksLeft} thing${tasksLeft === 1 ? "" : "s"} still open.` : <>All caught up! <Icon name="Sparkles" /></>}</h2>
      <p className="muted" style={{ margin: "4px 0 0" }}>Missed tasks, weak spots from your check-ins, and anything you add yourself. Oldest first.</p></div>
      <div className="figs"><div><b className="num">{tasksLeft}</b><span>items</span></div><div><b className="num">{fmtMin(mins)}</b><span>of work</span></div></div><div className="row"><button className="btn" disabled={!cu.length} aria-expanded={fit} onClick={() => setFit(v => !v)}><CalendarDays aria-hidden="true" />Suggest a schedule</button><button className="btn primary" aria-expanded={adding} onClick={() => setAdding(v => !v)}>Add item</button></div></section>

    {cu.map(d => { const t = s.tracks[d.trackId]; const rest = leftTasks(s, d); const ago = diffDays(d.date, today);
      return <article key={d.id} className="card tc daycard" style={tcStyle(t)}>
        <div className="spread"><div className="row"><TrackTag t={t} /><b className="catchup-title">{d.title}</b><span className="muted small num">{nice(d.date)} · Day {d.dayNum}</span><span className="late">{ago === 1 ? "yesterday" : `${ago} days ago`}</span></div>
          <div className="row"><span className="pill warn">{rest.length} left · {fmtMin(rest.reduce((a, x) => a + x.min, 0))}</span><button className="btn circle sm" aria-label={`Details for ${d.title}`} aria-expanded={!!expanded[d.id]} onClick={() => setExpanded(v => ({ ...v, [d.id]: !v[d.id] }))}><ChevronDown aria-hidden="true" style={{ transform: expanded[d.id] ? "rotate(180deg)" : undefined }} /></button></div></div>
        {expanded[d.id] && <><Segs s={s} d={d} /><TaskList s={s} d={d} /><div><button className="btn sm" onClick={() => ui.openDay(d.id)}>Open lesson</button></div></>}
      </article>; })}
    {extras.length > 0 && <div className="card"><span className="label">Your own items</span><ExtraList s={s} items={extras} onRemove={removeExtra} /></div>}
    {fit && cu.length > 0 && <div className="card stack">
      <div className="spread"><div><h3>Fit into spare time</h3><span className="muted small">Finds the earliest days with free minutes, before each track's next deadline when possible. Original dates stay put.</span></div>
        <button className="btn primary" onClick={() => setFit(v => !v)}>{fit ? "Hide" : <><Icon name="WandSparkles" /> Suggest a schedule</>}</button></div>
      {fit && (proposals.length ? <div className="preview"><ul>{proposals.map(p => <li key={p.dayId + p.taskId}><b>{short(p.date)}</b> · {s.tracks[p.trackId]?.short}: {p.text} ({fmtMin(p.min)})</li>)}</ul>
        <div className="row"><button className="btn primary sm" onClick={() => { carryTasks(proposals); setFit(false); ui.toast(`Scheduled ${proposals.length} task${proposals.length === 1 ? "" : "s"}`); }}>Schedule these</button></div></div>
        : <p className="muted">No spare time in the next 10 days. Raise your hours on a day (Week view) or finish something first.</p>)}
    </div>}

    {adding && <div className="card stack"><h3>Add something you missed</h3>
      <div className="grid2"><div className="field"><label htmlFor="cx-t">What</label><input id="cx-t" value={text} onChange={e => setText(e.target.value)} placeholder="e.g. Redo the BFS template from memory" onKeyDown={e => e.key === "Enter" && add()} /></div>
        <div className="grid2"><div className="field"><label htmlFor="cx-tr">Track</label><select id="cx-tr" value={tid} onChange={e => setTid(e.target.value)}><option value="">None</option>{activeTracks(s).map(t => <option key={t.id} value={t.id}>{t.short || t.name}</option>)}</select></div>
          <div className="field"><label htmlFor="cx-m">Minutes</label><input id="cx-m" type="number" min={5} step={5} value={min} onChange={e => setMin(e.target.value)} /></div></div></div>
      <div className="row"><button className="btn primary" onClick={add} disabled={!text.trim()}>Add to Catch-up</button></div></div>}

    {planned.length > 0 && <div className="card"><span className="label">Scheduled ahead</span>
      <ul className="tasks" style={{ marginTop: 8 }}>{planned.map(x => <li key={x.id} className="task"><span><Icon name="CornerDownRight" /></span><span className="tx">{x.text} <span className="muted small"><Icon name="ArrowRight" /> {nice(x.planFor!)}</span></span><button className="btn ghost sm" onClick={() => removeExtra(x.id)}>Unschedule</button></li>)}</ul></div>}

    {!cu.length && !extras.length && <div className="empty"><Bubbles /><div className="big"><Icon name="Sparkles" /></div><h3>Nothing behind</h3><p>Past days with unchecked tasks, and weak spots from your check-ins, show up here.</p></div>}
  </div>;
}
