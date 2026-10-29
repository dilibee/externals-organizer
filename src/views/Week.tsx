import { useState } from "react";
import { DOW, MON, addDays, hrs, mondayOf, parse } from "../lib/dates";
import { useDB } from "../lib/db";
import { availMin, dayDoneCount, daysOn, extrasOn, plannedOn, trackList } from "../lib/planner";
import { useToday, useUI } from "../ui";
import { TrackTag, tcStyle } from "../components/bits";
import { OverrideEdit } from "./Today";

export function Week() {
  const { store: s } = useDB(); const today = useToday(); const ui = useUI();
  const [off, setOff] = useState(0);
  const monday = addDays(mondayOf(today), off * 7);
  const dates = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  let wkP = 0, wkA = 0;
  const cols = dates.map(date => {
    const items = daysOn(s, date); const planned = plannedOn(s, date); const avail = availMin(s.settings.main, date);
    wkP += planned; wkA += avail;
    const pct = avail ? Math.min(100, (planned / avail) * 100) : planned ? 100 : 0;
    const d = parse(date); const extras = extrasOn(s, date);
    return <div key={date} className={`wcol ${date === today ? "is-today" : ""} ${date < today ? "past" : ""}`}>
      <div className="wd"><b className="num">{d.getDate()}</b><span>{date === today && <em>Today · </em>}{DOW[d.getDay()]}</span></div>
      <div className="load"><div className="bar"><span className={planned > avail ? "over" : ""} style={{ width: `${pct}%` }} /></div>
        <span className="cap num"><span>{hrs(planned)} / {hrs(avail)}</span>{date >= today && <OverrideEdit date={date} avail={avail} />}</span></div>
      {trackList(s).flatMap(t => (t.milestones || []).filter(m => m.date === date).map((m, i) => <div key={t.id + i} className="flag">🚩 {m.label}</div>))}
      {items.map(x => { const t = s.tracks[x.trackId]; const n = x.tasks.length, dn = dayDoneCount(s, x);
        return <button key={x.id} className="witem" style={tcStyle(t)} onClick={() => ui.openDay(x.id)}><TrackTag t={t} /><span className="t">{x.title}</span>
          <span className="s"><span>Day {x.dayNum}{s.feedback[x.id] ? " · ✓" : ""}</span>{dn === n && n ? <span className="fin">Done ✓</span> : <span className="num">{dn}/{n}</span>}</span></button>; })}
      {extras.map(x => <div key={x.id} className="witem" style={tcStyle(x.trackId ? s.tracks[x.trackId] : undefined)}><span className="t">↪ {x.text}</span><span className="s"><span>carried</span>{x.doneAt && <span className="fin">Done ✓</span>}</span></div>)}
      {!items.length && !extras.length && <span className="free">Free</span>}
    </div>;
  });
  const fd = parse(dates[0]), ld = parse(dates[6]);
  return <>
    <div className="sec-head"><div><span className="label">{off === 0 ? "This week" : off > 0 ? `${off} week${off > 1 ? "s" : ""} ahead` : `${-off} week${off < -1 ? "s" : ""} back`} · {hrs(wkP)} planned of {hrs(wkA)}</span>
      <h2>{MON[fd.getMonth()]} {fd.getDate()} – {fd.getMonth() === ld.getMonth() ? "" : MON[ld.getMonth()] + " "}{ld.getDate()}</h2></div>
      <div className="row"><button className="btn circle" onClick={() => setOff(o => o - 1)} aria-label="Previous week">←</button><button className="btn sm" onClick={() => setOff(0)}>This week</button><button className="btn circle" onClick={() => setOff(o => o + 1)} aria-label="Next week">→</button></div></div>
    <div className="week">{cols}</div>
  </>;
}
