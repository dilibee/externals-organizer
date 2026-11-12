import { Flame } from "lucide-react";
import { useDB } from "../lib/db";
import { activityByDate, stats, trackList } from "../lib/planner";
import { addDays, parse, short, fmtMin, MON } from "../lib/dates";
import { useToday } from "../ui";
import { Bubbles, TrackTag, tcStyle } from "../components/bits";
export function Progress() {
 const { store: s } = useDB(); const today = useToday(), st = stats(s, today), tl = trackList(s), activity = activityByDate(s);
 const max = Math.max(1, ...Object.values(st.perTrack));
 const monday = addDays(today, -((parse(today).getDay() + 6) % 7));
 const weeks = Array.from({ length: 12 }, (_, i) => addDays(monday, (i - 11) * 7));
 const shade = (min: number) => min <= 0 ? 0 : min < 30 ? 1 : min < 60 ? 2 : min < 120 ? 3 : 4;
 return <div className="stack narrow"><header className="card progress-head stack"><Bubbles /><span className="label">Since you started · {st.xp.toLocaleString()} XP</span><h2>Level {st.level}</h2><div className="pbar"><span style={{ width: `${st.into / st.need * 100}%` }} /></div><span>{st.into} / {st.need} XP to level {st.level + 1}</span></header>
 <section className="card bigstats"><div><b className="num"><Flame aria-hidden="true" /> {st.streak}</b><span className="label">day streak</span></div><div><b className="num">{fmtMin(st.mins)}</b><span className="label">time logged</span></div><div><b className="num">{st.tasks}</b><span className="label">tasks done</span></div></section>
 <section className="card stack"><h3>Across your tracks</h3><div className="bars">{tl.map(t => <div key={t.id} className="b" style={tcStyle(t)}><TrackTag t={t} /><span className="track"><span style={{ width: `${(st.perTrack[t.id] || 0) / max * 100}%` }} /></span><span className="num">{st.perTrack[t.id] || 0}</span></div>)}</div></section>
 <section className="card stack"><h3>Study activity</h3><p className="muted small">The last 12 weeks · minutes studied each day</p><div className="activity-scroll"><div className="activity"><div className="activity-week"><span /><div className="activity-days">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(d => <span key={d}>{d}</span>)}</div></div>{weeks.map((w, i) => <div className="activity-week" key={w}><span className="small muted">{i === 0 || parse(w).getMonth() !== parse(weeks[i - 1]).getMonth() ? MON[parse(w).getMonth()] : ""}</span><div className="activity-days">{Array.from({ length: 7 }, (_, n) => { const date = addDays(w, n), label = `${short(date)}: ${fmtMin(activity[date] || 0)}`; return <span key={date} className={`activity-cell shade-${shade(activity[date] || 0)} ${date > today ? "future" : ""}`} title={label} aria-label={label} role="img" />; })}</div></div>)}</div></div><div className="row activity-legend"><span>Less</span>{[0,1,2,3,4].map(n => <i key={n} className={`activity-cell shade-${n}`} />)}<span>More</span></div></section></div>;
}
