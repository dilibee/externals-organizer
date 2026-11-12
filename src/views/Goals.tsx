import { Icon } from "../components/bits";
import { ChevronDown, Play, Pause } from "lucide-react";
import { useState } from "react";
import { relDays, diffDays, short } from "../lib/dates";
import { useDB } from "../lib/db";
import { addFiles, addMilestone, createTrack, moveRank, queueRequest, removeFile, updateTrack } from "../lib/actions";
import { catchup, dayList, nextDeadline, paceSignals, trackList, trackProgress } from "../lib/planner";
import { adaptPrompt, draftPrompt, interviewPrompt, type GoalDraft, type InterviewInfo } from "../lib/prompts";
import type { Store, Track, WithId } from "../lib/types";
import { useToday, useUI } from "../ui";
import { latestJob } from "../lib/jobs";
import { Bridge } from "../components/Bridge";
import { Inline, TrackTag, tcStyle } from "../components/bits";

export function Goals() {
 const { store: s } = useDB(); const today = useToday(); const tl = trackList(s);
 const [goal, setGoal] = useState(false), [interview, setInterview] = useState(false);
 const resumed = Object.values(s.jobs).some(j => j.key.startsWith("interview:") && j.status !== "used" && j.context?.interview);
 return <div className="stack"><div className="sec-head"><div><h2>Goals &amp; deadlines</h2><p className="muted">Your ranked tracks, milestones and next steps.</p></div><div className="row"><button className="btn primary" aria-expanded={goal} onClick={() => setGoal(v => !v)}>Add goal</button><button className="btn" aria-expanded={interview} onClick={() => setInterview(v => !v)}>Add interview</button></div></div>
 {(goal || latestJob(s.jobs, "goal:new")) && <NewGoal s={s} today={today} />}
 {(interview || resumed) && <InterviewCard s={s} today={today} />}
 <div className="stack">{tl.map((t, i) => <GoalRow key={t.id} s={s} t={t} idx={i} n={tl.length} today={today} />)}</div></div>;
}

function GoalRow({ s, t, idx, n, today }: { s: Store; t: WithId<Track>; idx: number; n: number; today: string }) {
  const ui = useUI();
  const [expanded, setExpanded] = useState(() => !!latestJob(s.jobs, `adapt:${t.id}`));
  const [adapt, setAdapt] = useState(false); const [note, setNote] = useState("");
  const p = trackProgress(s, t.id, today); const nd = nextDeadline(t, today);
  const behind = catchup(s, today).filter(d => d.trackId === t.id).length;
  const tdays = dayList(s).filter(d => d.trackId === t.id).map(d => d.date).sort();
  const pace = paceSignals(s, t.id);
  const mss = (t.milestones || []).slice().sort((a, b) => (a.date < b.date ? -1 : 1));
  const files = s.sources[t.id]?.files || [];
  return <article className={`card goal ${t.paused ? "paused" : ""}`} style={tcStyle(t)}>
    <div className="rankcol"><span className="rankno num">{idx + 1}</span>
      <div className="rankbtns"><button className="btn circle sm" disabled={idx === 0} onClick={() => moveRank(t.id, -1)} aria-label={`Move ${t.short || t.name} up`}><Icon name="ArrowUp" /></button>
        <button className="btn circle sm" disabled={idx === n - 1} onClick={() => moveRank(t.id, 1)} aria-label={`Move ${t.short || t.name} down`}><Icon name="ArrowDown" /></button></div></div>
    <div className="goal-main"><div className="goal-overview">
      <div className="stack" style={{ gap: 6 }}><div className="row"><TrackTag t={t} />{t.paused ? <span className="pill">Paused</span> : behind ? <span className="pill warn">{behind} in catch-up</span> : <span className="pill ok">On track</span>}</div><h3>{t.name}</h3></div>
      <span className="small muted">{nd ? `Next deadline: ${short(nd)}` : "No upcoming deadline"}</span>
      <div className="goal-progress"><span className="small muted">{p.done}/{p.all} tasks</span><div className="pbar"><span style={{ width: `${p.all ? p.done / p.all * 100 : 0}%` }} /></div></div>
      <button className="btn circle sm" aria-label={`Details for ${t.name}`} aria-expanded={expanded} onClick={() => setExpanded(v => !v)}><ChevronDown aria-hidden="true" style={{ transform: expanded ? "rotate(180deg)" : undefined }} /></button>
    </div>
      {expanded && <div className="stack"><div><button className="btn sm" onClick={() => updateTrack(t.id, { paused: !t.paused })}>{t.paused ? <><Play aria-hidden="true" /> Resume</> : <><Pause aria-hidden="true" /> Pause</>}</button></div>
      {t.goal && <p className="muted" style={{ margin: 0 }}><Inline text={t.goal} /></p>}
      {!t.paused && <div className="facts">
        <div><span className="label">Next deadline</span><span className="v num">{nd ? <>{short(nd)}<small>{relDays(diffDays(today, nd)).toLowerCase()}</small></> : "None"}</span></div>
        <div><span className="label">Due so far</span><span className="v num">{p.dueDone}/{p.due}<small>tasks</small></span><div className="pbar"><span style={{ width: `${p.due ? (p.dueDone / p.due) * 100 : 0}%` }} /></div></div>
        <div><span className="label">Whole plan</span><span className="v num">{p.done}/{p.all}<small>tasks</small></span><div className="pbar"><span style={{ width: `${p.all ? (p.done / p.all) * 100 : 0}%` }} /></div></div>
      </div>}
      {pace && <div className="pace"><span className="pill">😎 {pace.counts.easy} · 👌 {pace.counts.right} · 🥵 {pace.counts.hard}</span>{pace.notes.map(x => <span key={x} className="pill warn">{x}</span>)}</div>}
      {mss.length > 0 && <details><summary className="label" style={{ cursor: "pointer" }}>Milestones ({mss.length})</summary>
        <ul className="mslist" style={{ marginTop: 8 }}>{mss.map((m, i) => <li key={i} className={m.date < today ? "past" : ""}><span className="d">{short(m.date)}</span><span>{m.label}</span></li>)}</ul></details>}
      <details><summary className="label" style={{ cursor: "pointer" }}>Files the AI helper reads ({files.length})</summary>
        <div className="stack" style={{ gap: 8, marginTop: 8 }}>
          {files.length > 0 && <div className="row">{files.map((f, i) => <span key={f.name} className="fchip">{f.name}<button className="btn ghost sm circle" onClick={() => removeFile(t.id, i)} aria-label={`Remove ${f.name}`}><Icon name="X" /></button></span>)}</div>}
          <div><label className="btn sm" htmlFor={`files-${t.id}`}>Add files</label><input type="file" id={`files-${t.id}`} hidden multiple accept=".js,.gs,.ts,.tsx,.py,.cpp,.h,.hpp,.c,.java,.html,.css,.md,.txt,.json,.csv,.sql,.yml,.yaml"
            onChange={e => { addFiles(t.id, [...(e.target.files || [])], ui.toast); e.target.value = ""; }} /></div>
        </div></details>
      <div className="spread"><span className="muted small">{tdays.length ? `${tdays.length} days, ${short(tdays[0])} to ${short(tdays[tdays.length - 1])}` : "No days yet."}</span>
        {!t.paused && <div className="row"><button className="btn sm" onClick={() => setAdapt(v => !v)}><Icon name="RefreshCw" /> Adapt next week</button></div>}</div>
      {(adapt || latestJob(s.jobs, `adapt:${t.id}`)) && <div className="stack">
        <div className="field"><label htmlFor={`note-${t.id}`}>Anything to focus on or avoid? (optional)</label>
          <textarea id={`note-${t.id}`} value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Graphs felt hard; more timed mocks; I'm busy Thursday" style={{ minHeight: 60 }} /></div>
        <div className="row"><button className="btn sm primary" onClick={() => { queueRequest("adapt", { trackId: t.id, note }); ui.toast("Queued. The next Claude Code session will adapt this track."); setAdapt(false); }}>Ask Claude Code to do it</button>
          <span className="muted small">or ask the laptop helper:</span></div>
        <Bridge jobKey={`adapt:${t.id}`} mode="plan" trackId={t.id} prompt={() => adaptPrompt(s, t.id, today, note)} cta="Apply these changes" onDone={() => setAdapt(false)} />
      </div>}
    </div>}
    </div>
  </article>;
}

const TYPES = ["Online assessment (OA)", "Technical interview", "Behavioral interview", "Mixed / multiple rounds"];
function InterviewCard({ s, today }: { s: Store; today: string }) {
  const ui = useUI(); const [open, setOpen] = useState(true); const [saved, setSaved] = useState<InterviewInfo | null>(null);
  const resumed = Object.values(s.jobs).filter(j => j.key.startsWith("interview:") && j.status !== "used" && j.context?.interview).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const interview = saved || (resumed ? JSON.parse(resumed.context!.interview) as InterviewInfo : null);
  const first = trackList(s).find(t => !t.paused);
  const [f, setF] = useState<InterviewInfo>({ company: "", role: "", date: "", time: "", type: TYPES[0], posting: "", notes: "", trackId: first?.id || "" });
  const set = (k: keyof InterviewInfo) => (e: { target: { value: string } }) => setF(v => ({ ...v, [k]: e.target.value }));
  const save = () => {
    if (!f.company || !f.date || !f.trackId) return;
    addMilestone(f.trackId, f.date, `${f.company}: ${f.role || "interview"} (${f.type.replace(/ \(.*\)/, "")})${f.time ? ", " + f.time : ""}`);
    queueRequest("interview", { ...f });
    setSaved(f); ui.toast("Interview added. Prep will be researched and planned.");
  };
  return <section className="card stack">
    <div className="spread"><div><span className="label"><Icon name="Target" /> Interviews &amp; deadlines</span><h3 style={{ marginTop: 4 }}>Got an interview or OA coming up?</h3>
      <p style={{ margin: "4px 0 0" }}>Add it and your plan bends around it: company research, tailored mocks before the date, a debrief after.</p></div>
      {!open && <button className="btn" onClick={() => setOpen(true)}>+ Add interview</button>}</div>
    {open && !saved && <div className="stack" style={{ background: "var(--card)", color: "var(--body)", borderRadius: 16, padding: 16 }}>
      <div className="grid2">
        <div className="field"><label htmlFor="iv-c">Company</label><input id="iv-c" value={f.company} onChange={set("company")} placeholder="e.g. CIBC" /></div>
        <div className="field"><label htmlFor="iv-r">Role</label><input id="iv-r" value={f.role} onChange={set("role")} placeholder="e.g. Software Developer Co-op" /></div>
        <div className="field"><label htmlFor="iv-d">Date</label><input id="iv-d" type="date" min={today} value={f.date} onChange={set("date")} /></div>
        <div className="field"><label htmlFor="iv-tm">Time (optional)</label><input id="iv-tm" type="time" value={f.time} onChange={set("time")} /></div>
        <div className="field"><label htmlFor="iv-ty">Type</label><select id="iv-ty" value={f.type} onChange={set("type")}>{TYPES.map(x => <option key={x}>{x}</option>)}</select></div>
        <div className="field"><label htmlFor="iv-tr">Track to prep in</label><select id="iv-tr" value={f.trackId} onChange={set("trackId")}>{trackList(s).filter(t => !t.paused).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
      </div>
      <div className="field"><label htmlFor="iv-p">Job posting (paste the text or a link)</label><textarea id="iv-p" value={f.posting} onChange={set("posting")} placeholder="Paste the posting: responsibilities and required skills help tailor the prep" /></div>
      <div className="field"><label htmlFor="iv-n">Notes (optional)</label><input id="iv-n" value={f.notes} onChange={set("notes")} placeholder="e.g. 60 min HackerRank, 3 questions; recruiter said SQL may come up" /></div>
      <div className="row"><button className="btn primary" disabled={!f.company || !f.date || !f.trackId} onClick={save}>Add interview</button><button className="btn ghost" onClick={() => setOpen(false)}>Cancel</button></div>
    </div>}
    {interview && <div className="stack" style={{ background: "var(--card)", color: "var(--body)", borderRadius: 16, padding: 16 }}>
      <b style={{ color: "var(--ink)" }}><Icon name="Check" /> {interview.company} on {short(interview.date)} is on your timeline.</b>
      <span className="muted">The next Claude Code session will research it and add prep days (it's queued). You can also ask the laptop helper with web search:</span>
      <Bridge jobKey={`interview:${interview.trackId}:${interview.company}:${interview.date}`} context={{ interview: JSON.stringify(interview) }} web mode="plan" trackId={interview.trackId} prompt={() => interviewPrompt(s, interview, today)} pasteLabel="Paste the reply (the JSON part is picked out automatically)" cta="Add prep days" onDone={() => { setSaved(null); setOpen(false); }} />
      <div><button className="btn ghost sm" onClick={() => { setSaved(null); setOpen(false); }}>Done</button></div>
    </div>}
  </section>;
}

function NewGoal({ s, today }: { s: Store; today: string }) {
  const ui = useUI();
  const [f, setF] = useState<GoalDraft>({ name: "", goal: "", level: "", deadline: "", mins: 45, paste: "" });
  const [step, setStep] = useState(false);
  const set = (k: keyof GoalDraft) => (e: { target: { value: string } }) => setF(v => ({ ...v, [k]: k === "mins" ? Number(e.target.value) : e.target.value }));
  return <section className="card stack"><div><span className="label">New track</span><h3>Add a goal</h3>
    <p className="muted small" style={{ margin: "4px 0 0" }}>Describe what you want to learn and by when. A day-by-day plan gets drafted to fit your weekly hours; you review it before saving.</p></div>
    <div className="grid2"><div className="field"><label htmlFor="g-name">Name</label><input id="g-name" value={f.name} onChange={set("name")} placeholder="e.g. SQL for interviews" /></div>
      <div className="field"><label htmlFor="g-dl">Deadline (optional)</label><input id="g-dl" type="date" value={f.deadline} onChange={set("deadline")} /></div></div>
    <div className="field"><label htmlFor="g-goal">What do you want to be able to do?</label><textarea id="g-goal" value={f.goal} onChange={set("goal")} placeholder="e.g. Solve medium SQL questions; explain joins and indexes" style={{ minHeight: 60 }} /></div>
    <div className="grid2"><div className="field"><label htmlFor="g-lv">Where are you now?</label><input id="g-lv" value={f.level} onChange={set("level")} placeholder="e.g. Never used it" /></div>
      <div className="field"><label htmlFor="g-m">Minutes per day</label><input id="g-m" type="number" min={15} step={15} value={f.mins} onChange={set("mins")} /></div></div>
    <div className="row"><button className="btn primary" disabled={!f.name || !f.goal} onClick={() => setStep(true)}>Draft plan</button>
      <button className="btn" disabled={!f.name || !f.goal} onClick={() => { queueRequest("newTrack", { ...f }); ui.toast("Queued for the next Claude Code session"); }}>Ask Claude Code instead</button></div>
    {(step || latestJob(s.jobs, "goal:new")) && <Bridge jobKey="goal:new" context={{ draft: JSON.stringify(f) }} mode="plan" prompt={() => draftPrompt(s, f, today)} cta="Save goal and plan"
      beforeSave={(plan, context) => { const draft: GoalDraft = context?.draft ? JSON.parse(context.draft) : f; return createTrack(draft.name, { short: String(plan.short || draft.name).slice(0, 14), goal: String(plan.goal || draft.goal), level: draft.level, deadline: draft.deadline || null,
        milestones: [...(plan.milestones || []), ...(draft.deadline ? [{ date: draft.deadline, label: `${draft.name}: deadline` }] : [])] }); }}
      onDone={() => { setStep(false); setF({ name: "", goal: "", level: "", deadline: "", mins: 45, paste: "" }); }} />}
  </section>;
}
