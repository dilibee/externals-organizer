import { Type, ArrowLeft, ArrowRight } from "lucide-react";
import { Icon } from "../components/bits";
import { useEffect, useRef, useState } from "react";
import { fmtMin, nice } from "../lib/dates";
import { mode, useDB } from "../lib/db";
import { saveChat, saveLessonFull, saveNote } from "../lib/actions";
import { dayDoneCount, dayList, dayMinutes } from "../lib/planner";
import { chatPrompt, expandPrompt } from "../lib/prompts";
import { useToday, useUI, replaceDay, type SheetTab } from "../ui";
import { latestJob } from "../lib/jobs";
import { Bridge, useTextJob } from "../components/Bridge";
import { Bubbles, Inline, KindPill, Prose, Segs, TaskList, TrackTag, tcStyle } from "../components/bits";

import type { Day, Store, WithId } from "../lib/types";
const QUICK = [
  ["Quiz me", "Quiz me on today's lesson: one question at a time, starting easy."],
  ["Hint for a task", "I'm stuck on this task: [which task]. Give me only the next small step."],
  ["Review my code", "Review my code. Don't fix it for me; point me at the problem.\n\n```cpp\n// paste here\n```"],
];


type PanelProps = { s: Store; d: WithId<Day> };
function LessonBody({ s, d, large }: PanelProps & { large: boolean }) {
  const ui = useUI(), dayId = d.id;
  const [short, setShort] = useState(false), [expand, setExpand] = useState(false);
    const text = short || !d.lessonFull ? d.lesson || "" : d.lessonFull;
    return <div className="stack">
      {text ? <Prose text={text} large={large} /> : <p className="muted">No lesson text for this day yet.</p>}
      <div className="row">
        <button className="btn" onClick={() => setExpand(v => !v)}>{d.lessonFull ? "Rewrite the full lesson" : <><Icon name="Sparkles" /> Expand lesson</>}</button>
        {d.lessonFull && <button className="btn ghost sm" onClick={() => setShort(v => !v)}>{short ? "Show the full lesson" : "Show the short version"}</button>}
      </div>
      {(expand || latestJob(s.jobs, `expand:${dayId}`)) && <Bridge jobKey={`expand:${dayId}`} mode="text" prompt={() => expandPrompt(s, d)} pasteLabel="Paste the lesson Markdown" cta="Save full lesson"
        onText={txt => { saveLessonFull(dayId, txt); setShort(false); ui.toast("Full lesson saved"); }} onDone={() => setExpand(false)} />}
    </div>;

}
function TasksPanel({ s, d }: PanelProps) {
    return <div className="stack" style={{ maxWidth: "72ch" }}><Segs s={s} d={d} /><TaskList s={s} d={d} />
      <p className="muted small">Total {fmtMin(dayMinutes(d))}. Checked tasks count toward your streak on the day you check them.</p></div>;

}
function LinksPanel({ d }: PanelProps) {
  const links = d.tasks.filter(x => x.url);
    return <div className="stack">
      {(d.resources || []).length > 0 && <div><div className="label" style={{ marginBottom: 10 }}>Reading</div>
        <ul className="stack" style={{ gap: 6, paddingLeft: 18, margin: 0 }}>{d.resources!.map(r => <li key={r.url}><a href={r.url} target="_blank" rel="noopener">{r.label} <Icon name="ArrowUpRight" /></a></li>)}</ul></div>}
      {links.length > 0 && <div><div className="label" style={{ marginBottom: 10 }}>Practice</div>
        <ul className="stack" style={{ gap: 6, paddingLeft: 18, margin: 0 }}>{links.map(x => <li key={x.id}><a href={x.url} target="_blank" rel="noopener"><Inline text={x.text} /> <Icon name="ArrowUpRight" /></a></li>)}</ul></div>}
      {!(d.resources || []).length && !links.length && <p className="muted">No links for this day.</p>}
    </div>;

}
function Notes({ dayId }: { dayId: string }) {
  const { store: s } = useDB(); const remote = s.notes[dayId]?.text || "";
  const [text, setText] = useState(remote), [saved, setSaved] = useState(true);
  const draft = useRef(remote), dirty = useRef(false), focused = useRef(false), timer = useRef(0);
  const persist = () => { clearTimeout(timer.current); if (!dirty.current) return; dirty.current = false; void saveNote(dayId, draft.current)?.then(() => { if (!dirty.current) setSaved(true); }); };
  useEffect(() => { if (!dirty.current && !focused.current) { draft.current = remote; setText(remote); } }, [remote]);
  useEffect(() => () => { clearTimeout(timer.current); if (dirty.current) void saveNote(dayId, draft.current); }, [dayId]);
  return <section className="stack"><div className="spread"><h3>My notes</h3><span className="muted small" role="status">{saved ? "Saved" : "Saving…"}</span></div>
    <textarea aria-label="My notes" value={text} onFocus={() => { focused.current = true; }} onBlur={() => { focused.current = false; persist(); }} onChange={e => { draft.current = e.target.value; dirty.current = true; setText(e.target.value); setSaved(false); clearTimeout(timer.current); timer.current = window.setTimeout(persist, 600); }} /></section>;
}
function AskPanel({ s, d, focus }: PanelProps & { focus: boolean }) {
  const today = useToday(), dayId = d.id, turns = s.chats[dayId]?.turns || [];
  const [q, setQ] = useState(""), [manual, setManual] = useState(false);
  const composer = useRef<HTMLTextAreaElement>(null), list = useRef<HTMLDivElement>(null);
  const save = (answer: string, context?: Record<string, string>) => { saveChat(dayId, [...turns, { role: "user", content: context?.question || q.trim() }, { role: "assistant", content: answer }]); };
  const worker = useTextJob(`chat:${dayId}`, save);
  const { job, busy, online, err } = worker;
  const waiting = job?.status === "pending" || job?.status === "running";
  useEffect(() => { if (focus) composer.current?.focus(); }, [focus]);
  useEffect(() => { if (list.current) list.current.scrollTop = list.current.scrollHeight; }, [turns.length, job?.status, err]);
  const send = async () => { const question = q.trim(); if (!question || busy || waiting || job?.status === "error") return; if (await worker.start(chatPrompt(s, d, today, turns, question), { question })) setQ(""); };
  return <div className="stack">
    <div className="chat lesson-chat" ref={list} aria-live="polite">{turns.map((m, i) => <div key={i} className={`msg ${m.role === "user" ? "user" : "ai"}`}>{m.role === "user" ? m.content : <Prose text={m.content} />}</div>)}
      {!turns.length && !job && <p className="muted">Ask about this day. The laptop helper includes your lesson, checklist, notes and conversation.</p>}
      {job && <div className="msg user">{job.context?.question}</div>}
      {waiting && <div className="msg ai" role="status"><span className="thinking">● ● ●</span> {job.status === "pending" ? "Waiting for laptop helper…" : "Thinking…"}
        {!online && <p className="muted small">Laptop helper is offline. Your job will run when the laptop is on and the helper is running.</p>}<button className="btn sm" onClick={() => void worker.discard()}>Cancel</button></div>}
      {job?.status === "error" && <div className="msg ai" role="alert">{job.error}<div className="row"><button className="btn sm" disabled={busy} onClick={() => void worker.retry()}>Retry</button><button className="btn sm" onClick={() => void worker.discard()}>Dismiss</button></div></div>}
      {err && <div className="msg ai" role="alert">{err}</div>}
    </div>
    <div className="row">{QUICK.map(([l, v]) => <button key={l} className="btn sm" onClick={() => { setQ(v); composer.current?.focus(); }}>{l}</button>)}
    {!!turns.length && <button className="btn ghost sm" disabled={waiting || busy} onClick={() => saveChat(dayId, [])}>Clear chat</button>}</div>
    <div className="field"><label htmlFor="ask-q">Your question</label><textarea id="ask-q" ref={composer} value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (mode !== "local" && e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }} /></div>
    {mode !== "local" && <><button className="btn primary" disabled={!q.trim() || busy || waiting || !!job} onClick={() => void send()}>Send</button><button className="btn ghost sm" onClick={() => setManual(v => !v)}>Other ways</button></>}
    {(mode === "local" || manual) && <Bridge jobKey={`chat:${dayId}`} manualOnly mode="text" context={{ question: q.trim() }} prompt={() => chatPrompt(s, d, today, turns, q)} pasteLabel="Paste the answer" cta="Save to this day" onText={(answer, ctx) => { save(answer, ctx); setQ(""); }} />}
  </div>;
}
export function Lesson({ dayId, tab }: { dayId: string; tab: SheetTab }) {
  const { store: s } = useDB(); const ui = useUI();
  const [large, setLarge] = useState(() => { try { return localStorage.getItem("eo.readSize") === "large"; } catch { return false; } });
  const raw = s.days[dayId];
  if (!raw) return <div className="stack"><h2>Day not found</h2><a className="btn" href="#today">Today</a></div>;
  const d = { ...raw, id: dayId }, t = s.tracks[d.trackId];
  const days = dayList(s).filter(x => x.trackId === d.trackId).sort((a, b) => a.date.localeCompare(b.date) || a.dayNum - b.dayNum), index = days.findIndex(x => x.id === dayId);
  const tabs: [SheetTab, string][] = [["lesson", "Lesson"], ["tasks", `Tasks ${dayDoneCount(s, d)}/${d.tasks.length}`], ["links", "Links"], ["ask", "Ask AI"]];
  return <article className={`lesson-page tab-${tab}`} style={tcStyle(t)}>
    <header className="lesson-head stack"><Bubbles /><div className="row"><button className="btn sm" onClick={ui.closeDay}><Icon name="ArrowLeft" /> Back</button><TrackTag t={t} /><span className="muted small">{nice(d.date)} · Day {d.dayNum} of {days.length} · {fmtMin(dayMinutes(d))}</span><KindPill kind={d.kind} /></div>
      <h2>{d.title}</h2><div className="spread"><div className="row"><button className="btn circle sm" aria-label={large ? "Use normal lesson text" : "Use large lesson text"} aria-pressed={large} onClick={() => { const v = !large; setLarge(v); try { localStorage.setItem("eo.readSize", v ? "large" : "normal"); } catch {} }}><Type aria-hidden="true" /></button></div><button className="btn sm" onClick={() => ui.openCheckIn(dayId)}>{s.feedback[dayId] ? <><Icon name="Check" /> Checked in</> : "Wrap up"}</button></div>
      <nav className="lesson-tabs" role="tablist">{tabs.map(([k, l]) => <button key={k} className="tab" role="tab" aria-selected={tab === k} onClick={() => replaceDay(dayId, k)}>{l}</button>)}</nav>
    </header>
    <div className="lesson-grid"><div className="lesson-left">
      <section className="lesson-panel panel-lesson stack"><LessonBody s={s} d={d} large={large} /></section>
      <section className="lesson-panel panel-links card stack"><h3>Links</h3><LinksPanel s={s} d={d} /></section>
      <div className="lesson-panel panel-lesson stack"><Notes dayId={dayId} /><nav className="lesson-neighbours">{[days[index - 1], days[index + 1]].map((x, i) => <button key={i} className="btn" disabled={!x} onClick={() => { if (x) replaceDay(x.id); }}>{i ? <ArrowRight aria-hidden="true" /> : <ArrowLeft aria-hidden="true" />}{x ? `${i ? "Next" : "Previous"}: Day ${x.dayNum} · ${x.title}` : i ? "Last day" : "First day"}</button>)}</nav></div>
    </div><aside className="lesson-right stack"><section className="lesson-panel panel-tasks card stack"><h3>Tasks</h3><TasksPanel s={s} d={d} /></section><section className="lesson-panel panel-ask card stack"><h3>Ask AI</h3><AskPanel s={s} d={d} focus={tab === "ask"} /></section></aside></div>
  </article>;
}
