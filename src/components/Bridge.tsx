// The free "AI bridge": copy a ready prompt to claude.ai or ChatGPT, paste the reply back.
// mode "text" hands the pasted text to onText; mode "plan" parses plan JSON, previews it, then saves it.
import { useMemo, useState } from "react";
import { getStore, useDB } from "../lib/db";
import { applyChanges } from "../lib/actions";
import { parsePlan, planChanges, type Changes, type PlanPatch } from "../lib/validate";
import { useToday, useUI } from "../ui";

const SITES = [{ name: "Claude", url: "https://claude.ai/new" }, { name: "ChatGPT", url: "https://chatgpt.com/" }];

interface Props {
  prompt: () => string;
  mode: "text" | "plan";
  pasteLabel?: string;
  cta?: string;
  trackId?: string;
  /** plan mode: run before saving (e.g. create the track) and return the track id to use */
  beforeSave?: (plan: PlanPatch) => string | undefined;
  onText?: (text: string) => void;
  onDone?: () => void;
}

export function Bridge({ prompt, mode, pasteLabel, cta, trackId, beforeSave, onText, onDone }: Props) {
  const { store } = useDB(); const today = useToday(); const ui = useUI();
  const [copied, setCopied] = useState(false);
  const [text, setText] = useState("");
  const [err, setErr] = useState("");

  const preview = useMemo<{ plan: PlanPatch; ch: Changes } | null>(() => {
    if (mode !== "plan" || !text.trim()) return null;
    try { const plan = parsePlan(text); return { plan, ch: planChanges(store, plan, today, trackId || plan.trackId) }; }
    catch { return null; }
  }, [text, mode, store, today, trackId]);

  const copy = async (url?: string) => {
    const p = prompt();
    try { await navigator.clipboard.writeText(p); setCopied(true); ui.toast("Prompt copied. Paste it into the chat."); }
    catch { setErr("Couldn't copy automatically. Select the prompt below and copy it."); setCopied(true); }
    if (url) window.open(url, "_blank", "noopener");
  };

  const save = () => {
    setErr("");
    if (mode === "text") { if (!text.trim()) return; onText?.(text.trim()); setText(""); onDone?.(); return; }
    try {
      const plan = parsePlan(text);
      if (beforeSave && !(Array.isArray(plan.days) && plan.days.some(d => /^\d{4}-\d{2}-\d{2}$/.test(d?.date || "") && d.date! >= today))) { setErr("Nothing in that plan could be saved. "); return; }
      const tid = beforeSave ? beforeSave(plan) : trackId;
      const ch = planChanges(getStore(), plan, today, tid || plan.trackId);
      if (!ch.writes.length && !ch.deletes.length) { setErr("Nothing in that plan could be saved. " + ch.skipped.join(" ")); return; }
      applyChanges(ch); ui.toast(`Saved: ${ch.summary.length} change${ch.summary.length === 1 ? "" : "s"}`); setText(""); onDone?.();
    } catch (e: any) { setErr("That isn't valid plan JSON: " + (e?.message || e)); }
  };

  return <div className="bridge">
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
    {preview && <div className="preview">
      <div className="label">Preview</div>
      <ul>{preview.ch.summary.map((x, i) => <li key={i}>{x}</li>)}</ul>
      {preview.ch.skipped.length > 0 && <ul className="skip">{preview.ch.skipped.map((x, i) => <li key={i}>{x}</li>)}</ul>}
    </div>}
    {err && <div className="pill bad" style={{ whiteSpace: "normal" }}>{err}</div>}
    <div className="row"><button className="btn primary" onClick={save} disabled={!text.trim()}>{cta || "Save"}</button></div>
  </div>;
}
