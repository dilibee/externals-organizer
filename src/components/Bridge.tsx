// Supabase AI jobs with the original manual copy/paste flow as a fallback.
// mode "text" hands the pasted text to onText; mode "plan" parses plan JSON, previews it, then saves it.
import { useEffect, useMemo, useState } from "react";
import { getStore, useDB, mode as dbMode, createJob, transitionJob } from "../lib/db";
import { applyChanges } from "../lib/actions";
import { parsePlan, planChanges, type Changes, type PlanPatch } from "../lib/validate";
import { useToday, useUI } from "../ui";

import { consumeText, latestJob, workerOnline } from "../lib/jobs";

const SITES = [{ name: "Claude", url: "https://claude.ai/new" }, { name: "ChatGPT", url: "https://chatgpt.com/" }];

interface Props {
  jobKey: string;
  web?: boolean;
  context?: Record<string, string>;
  prompt: () => string;
  mode: "text" | "plan";
  pasteLabel?: string;
  cta?: string;
  trackId?: string;
  /** plan mode: run before saving (e.g. create the track) and return the track id to use */
  beforeSave?: (plan: PlanPatch, context?: Record<string, string>) => string | undefined;
  onText?: (text: string, context?: Record<string, string>) => void;
  onDone?: () => void;
}

export function Bridge({ jobKey, web, context, prompt, mode, pasteLabel, cta, trackId, beforeSave, onText, onDone }: Props) {
  const { store } = useDB(); const today = useToday(); const ui = useUI();
  const job = latestJob(store.jobs, jobKey);
  const [manual, setManual] = useState(dbMode === "local");
  const [clock, setClock] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  useEffect(() => { const t = setInterval(() => setClock(Date.now()), 15000); return () => clearInterval(t); }, []);
  const online = workerOnline(store.settings.worker?.lastSeen, clock);
  useEffect(() => {
    if (job?.status === "done" && mode === "plan") setText(job.result || "");
    if (job?.status === "done" && mode === "text") {
      void consumeText(job, () => transitionJob(job.id, "done", { status: "used" }), answer => {
        onText?.(answer, job.context); onDone?.();
      }).catch(() => setErr("Couldn't save the answer. Check your connection and reopen this view."));
    }
  }, [job?.id, job?.status]);
  const start = async () => {
    setBusy(true); setErr("");
    try {
      const retrying = job?.status === "error";
      const value = retrying ? job.prompt : prompt();
      const jobContext = retrying ? job.context : context;
      if (new TextEncoder().encode(value).length > 300 * 1024) throw new Error("The prompt is over 300 KB. Remove some context and try again.");
      await createJob(crypto.randomUUID(), { kind: mode, key: jobKey, label: cta || "Ask AI", prompt: value,
        ...(web ? { web: true } : {}), ...(jobContext ? { context: jobContext } : {}), status: "pending", createdAt: new Date().toISOString() });
      if (job) await transitionJob(job.id, job.status, { status: "used" });
      setText("");
    } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't queue the job."); }
    finally { setBusy(false); }
  };
  const discard = async () => { if (job) await transitionJob(job.id, job.status, { status: "used" }); setText(""); };
  const [copied, setCopied] = useState(false);
  const [text, setText] = useState("");
  const [err, setErr] = useState("");

  const preview = useMemo<{ plan: PlanPatch; ch: Changes } | null>(() => {
    if (mode !== "plan" || !text.trim()) return null;
    try { const plan = parsePlan(text); return { plan, ch: planChanges(store, plan, today, trackId || plan.trackId) }; }
    catch { return null; }
  }, [text, mode, store, today, trackId]);

  const copy = async (url?: string) => {
    const p = job?.prompt || prompt();
    try { await navigator.clipboard.writeText(p); setCopied(true); ui.toast("Prompt copied. Paste it into the chat."); }
    catch { setErr("Couldn't copy automatically. Select the prompt below and copy it."); setCopied(true); }
    if (url) window.open(url, "_blank", "noopener");
  };

  const save = async () => {
    setErr("");
    if (mode === "text") {
      if (!text.trim()) return;
      try {
        if (job && !await transitionJob(job.id, job.status, { status: "used" })) return;
        onText?.(text.trim(), job?.context); setText(""); onDone?.();
      } catch { setErr("Couldn't save. Check your connection and try again."); }
      return;
    }
    try {
      const plan = parsePlan(text);
      if (beforeSave && !(Array.isArray(plan.days) && plan.days.some(d => /^\d{4}-\d{2}-\d{2}$/.test(d?.date || "") && d.date! >= today))) { setErr("Nothing in that plan could be saved. "); return; }
      if (!beforeSave) {
        const check = planChanges(getStore(), plan, today, trackId || plan.trackId);
        if (!check.writes.length && !check.deletes.length) { setErr("Nothing in that plan could be saved. " + check.skipped.join(" ")); return; }
      }
      if (job && !await transitionJob(job.id, manual ? job.status : "done", { status: "used" })) return;
      const tid = beforeSave ? beforeSave(plan, job?.context) : trackId;
      const ch = planChanges(getStore(), plan, today, tid || plan.trackId);
      if (!ch.writes.length && !ch.deletes.length) {
        setErr("Nothing in that plan could be saved. " + ch.skipped.join(" "));
        if (job) await transitionJob(job.id, "used", { status: "done" });
        return;
      }
      applyChanges(ch); ui.toast(`Saved: ${ch.summary.length} change${ch.summary.length === 1 ? "" : "s"}`); setText(""); onDone?.();
    } catch (e: any) { setErr("That isn't valid plan JSON: " + (e?.message || e)); }
  };

  return <div className="bridge">
    {dbMode !== "local" && <div className="stack" style={{ gap: 8 }}>
      {!online && <p className="muted small">Laptop helper is offline. Your job will run when the laptop is on and the helper is running.</p>}
      {(job?.status === "pending" || job?.status === "running") ? <div className="row" role="status">
        <span>{job.status === "pending" ? "Waiting for laptop helper..." : "AI is working..."}</span>
        <button className="btn sm" onClick={() => void discard().catch(() => setErr("Couldn't cancel. Try again."))}>Cancel</button>
      </div> : job?.status === "error" ? <div className="stack"><p role="alert">{job.error}</p><div className="row"><button className="btn primary" disabled={busy} onClick={start}>Retry</button><button className="btn" disabled={busy} onClick={() => void discard().catch(() => setErr("Couldn't dismiss. Try again."))}>Dismiss</button></div></div>
        : job?.status !== "done" && <button className="btn primary" disabled={busy} onClick={start}>Ask AI</button>}
      <button className="btn ghost sm" onClick={() => setManual(v => !v)}>{manual ? "Hide manual flow" : "Do it manually"}</button>
    </div>}
    {manual && <>

    <div className="step"><span className="n">1</span><div className="stack" style={{ gap: 8 }}>
      <div><b>Copy the prompt</b> <span className="muted small">It includes this day's context. No API key, no cost.</span></div>
      <div className="row">{SITES.map(s => <button key={s.name} className="btn sm primary" onClick={() => copy(s.url)}>Copy &amp; open {s.name}</button>)}
        <button className="btn sm ghost" onClick={() => copy()}>Just copy</button></div>
      {copied && err.startsWith("Couldn't copy") && <textarea readOnly value={prompt()} onFocus={e => e.currentTarget.select()} style={{ minHeight: 140 }} />}
    </div></div>
    <div className="step"><span className="n">2</span><div className="field">
      <label htmlFor="bridge-paste">{pasteLabel || (mode === "plan" ? "Paste the JSON reply" : "Paste the reply")}</label>
      <textarea id="bridge-paste" value={text} onChange={e => setText(e.target.value)} placeholder={mode === "plan" ? '{"days": [ ... ]}' : "Paste the answer here"} style={{ minHeight: 120 }} />
    </div></div>
    </>}
    {preview && <div className="preview">
      <div className="label">Preview</div>
      <ul>{preview.ch.summary.map((x, i) => <li key={i}>{x}</li>)}</ul>
      {preview.ch.skipped.length > 0 && <ul className="skip">{preview.ch.skipped.map((x, i) => <li key={i}>{x}</li>)}</ul>}
    </div>}
    {err && <div className="pill bad" style={{ whiteSpace: "normal" }}>{err}</div>}
    {(manual || (mode === "plan" && job?.status === "done")) && <div className="row"><button className="btn primary" onClick={save} disabled={!text.trim()}>{manual ? cta || "Save" : "Apply"}</button>
      {!manual && <button className="btn" onClick={() => void discard().catch(() => setErr("Couldn't discard. Try again."))}>Discard</button>}</div>}
  </div>;
}
