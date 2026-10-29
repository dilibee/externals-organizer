import { useEffect, useState } from "react";
import { fmtMin, nice } from "../lib/dates";
import { useDB } from "../lib/db";
import { saveChat, saveLessonFull } from "../lib/actions";
import { dayDoneCount, dayList, dayMinutes } from "../lib/planner";
import { chatPrompt, expandPrompt } from "../lib/prompts";
import { useToday, useUI, type SheetTab } from "../ui";
import { Bridge } from "./Bridge";
import { Inline, KindPill, Prose, Segs, TaskList, TrackTag, tcStyle } from "./bits";

const QUICK = [
  ["Quiz me", "Quiz me on today's lesson: one question at a time, starting easy."],
  ["Hint for a task", "I'm stuck on this task: [which task]. Give me only the next small step."],
  ["Review my code", "Review my code. Don't fix it for me; point me at the problem.\n\n```cpp\n// paste here\n```"],
];

export function DaySheet({ dayId, tab }: { dayId: string; tab: SheetTab }) {
  const { store: s } = useDB(); const ui = useUI(); const today = useToday();
  const [cur, setCur] = useState<SheetTab>(tab);
  const [short, setShort] = useState(false);
  const [expand, setExpand] = useState(false);
  const [q, setQ] = useState("");
  useEffect(() => { setCur(tab); }, [dayId, tab]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") ui.closeDay(); };
    document.addEventListener("keydown", onKey); document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, []);
  const raw = s.days[dayId]; if (!raw) return null;
  const d = { id: dayId, ...raw }; const t = s.tracks[d.trackId];
  const n = d.tasks.length, dn = dayDoneCount(s, d);
  const total = dayList(s).filter(x => x.trackId === d.trackId).length;
  const turns = s.chats[dayId]?.turns || [];
  const fb = s.feedback[dayId];
  const tabs: [SheetTab, string][] = [["lesson", "Lesson"], ["tasks", `Tasks ${dn}/${n}`], ["links", "Links"], ["ask", "Ask AI"]];
  const links = d.tasks.filter(x => x.url);

  let body;
  if (cur === "lesson") {
    const text = short || !d.lessonFull ? d.lesson || "" : d.lessonFull;
    body = <div className="stack">
      {text ? <Prose text={text} /> : <p className="muted">No lesson text for this day yet.</p>}
      <div className="row">
        <button className="btn" onClick={() => setExpand(v => !v)}>{d.lessonFull ? "Rewrite the full lesson" : "✨ Expand lesson"}</button>
        {d.lessonFull && <button className="btn ghost sm" onClick={() => setShort(v => !v)}>{short ? "Show the full lesson" : "Show the short version"}</button>}
      </div>
      {expand && <Bridge mode="text" prompt={() => expandPrompt(s, d)} pasteLabel="Paste the lesson Markdown" cta="Save full lesson"
        onText={txt => { saveLessonFull(dayId, txt); setShort(false); ui.toast("Full lesson saved"); }} onDone={() => setExpand(false)} />}
    </div>;
  } else if (cur === "tasks") {
    body = <div className="stack" style={{ maxWidth: "72ch" }}><Segs s={s} d={d} /><TaskList s={s} d={d} />
      <p className="muted small">Total {fmtMin(dayMinutes(d))}. Checked tasks count toward your streak on the day you check them.</p></div>;
  } else if (cur === "links") {
    body = <div className="stack">
      {(d.resources || []).length > 0 && <div><div className="label" style={{ marginBottom: 10 }}>Reading</div>
        <ul className="stack" style={{ gap: 6, paddingLeft: 18, margin: 0 }}>{d.resources!.map(r => <li key={r.url}><a href={r.url} target="_blank" rel="noopener">{r.label} ↗</a></li>)}</ul></div>}
      {links.length > 0 && <div><div className="label" style={{ marginBottom: 10 }}>Practice</div>
        <ul className="stack" style={{ gap: 6, paddingLeft: 18, margin: 0 }}>{links.map(x => <li key={x.id}><a href={x.url} target="_blank" rel="noopener"><Inline text={x.text} /> ↗</a></li>)}</ul></div>}
      {!(d.resources || []).length && !links.length && <p className="muted">No links for this day.</p>}
    </div>;
  } else {
    body = <div className="stack">
      <div className="chat">{turns.length ? turns.map((m, i) => m.role === "user"
        ? <div key={i} className="msg user">{m.content}</div>
        : <div key={i} className="msg ai"><Prose text={m.content} /></div>)
        : <div className="card"><b>Ask about this day.</b> <span className="muted">Write a question, copy the prompt into Claude or ChatGPT (it carries this lesson, your checklist and the track's files), then paste the answer back to keep it here.</span></div>}</div>
      <div className="row">{QUICK.map(([l, v]) => <button key={l} className="btn sm" onClick={() => setQ(v)}>{l}</button>)}
        {turns.length > 0 && <button className="btn sm ghost" style={{ marginLeft: "auto" }} onClick={() => saveChat(dayId, [])}>Clear chat</button>}</div>
      <div className="field"><label htmlFor="ask-q">Your question</label>
        <textarea id="ask-q" value={q} onChange={e => setQ(e.target.value)} placeholder="e.g. Why does the comparator need const auto&?" /></div>
      {q.trim() && <Bridge mode="text" prompt={() => chatPrompt(s, d, today, turns, q)} pasteLabel="Paste the answer" cta="Save to this day"
        onText={a => { saveChat(dayId, [...turns, { role: "user", content: q.trim() }, { role: "assistant", content: a }]); setQ(""); }} />}
    </div>;
  }

  return <>
    <div className="scrim" onClick={ui.closeDay} />
    <aside className="sheet" role="dialog" aria-modal="true" aria-labelledby="sTitle" style={tcStyle(t)}>
      <div className="shead">
        <div className="spread"><div className="row"><TrackTag t={t} /><span className="muted small num">{nice(d.date)} · Day {d.dayNum} of {total} · {fmtMin(dayMinutes(d))}</span><KindPill kind={d.kind} /></div>
          <div className="row"><button className="btn sm" onClick={() => ui.openCheckIn(dayId)}>{fb ? "✓ Checked in" : "Wrap up"}</button><button className="btn circle ghost" onClick={ui.closeDay} aria-label="Close">✕</button></div></div>
        <h2 id="sTitle">{d.title}</h2>
        <div className="stabs" role="tablist">{tabs.map(([k, l]) => <button key={k} className="tab" role="tab" aria-selected={cur === k} onClick={() => setCur(k)}>{l}</button>)}</div>
      </div>
      <div className="sbody">{body}</div>
    </aside>
  </>;
}
