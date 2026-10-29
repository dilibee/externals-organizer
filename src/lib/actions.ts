// Every write the UI makes. Optimistic: the store updates first, the backend follows.
import { deleteDoc, getStore, mergeDoc, setDoc } from "./db";
import { todayISO } from "./dates";
import { DEFAULT_HOURS, trackList } from "./planner";
import type { Extra, Feedback, Progress, Rating, Settings, Track } from "./types";
import type { Changes } from "./validate";

const now = () => new Date().toISOString();
const rid = (p: string) => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const progressOf = (dayId: string): Progress => {
  const s = getStore(); const p = s.progress[dayId];
  return p ? { ...p, done: { ...p.done } } : { dayId, trackId: s.days[dayId]?.trackId, done: {} };
};

export function toggleTask(dayId: string, taskId: string, on: boolean) {
  const p = progressOf(dayId);
  if (on) p.done[taskId] = todayISO(); else delete p.done[taskId];
  if (p.timer?.taskId === taskId) { if (on) p.actual = { ...p.actual, [taskId]: elapsedMin(p.timer.startedAt) + (p.actual?.[taskId] || 0) }; p.timer = null; }
  setDoc("progress", dayId, { ...p, updatedAt: now() });
}

// ---------- timer: start time lives in the progress doc so it survives reloads and devices ----------
export const elapsedMin = (startedAt: string) => Math.max(1, Math.round((Date.now() - new Date(startedAt).getTime()) / 60000));
export function startTimer(dayId: string, taskId: string) {
  const s = getStore();
  for (const [id, p] of Object.entries(s.progress)) if (p.timer && id !== dayId) stopTimer(id);
  const p = progressOf(dayId);
  if (p.timer && p.timer.taskId !== taskId) p.actual = { ...p.actual, [p.timer.taskId]: (p.actual?.[p.timer.taskId] || 0) + elapsedMin(p.timer.startedAt) };
  setDoc("progress", dayId, { ...p, timer: { taskId, startedAt: now() }, updatedAt: now() });
}
export function stopTimer(dayId: string) {
  const p = progressOf(dayId); if (!p.timer) return;
  const { taskId, startedAt } = p.timer;
  setDoc("progress", dayId, { ...p, timer: null, actual: { ...p.actual, [taskId]: (p.actual?.[taskId] || 0) + elapsedMin(startedAt) }, updatedAt: now() });
}
export const runningTimer = () => {
  for (const [dayId, p] of Object.entries(getStore().progress)) if (p.timer) return { dayId, ...p.timer };
  return null;
};

// ---------- check-in ----------
export function saveFeedback(dayId: string, f: { rating: Rating; actualMin: number; needsWork: string[]; comment: string }) {
  const d = getStore().days[dayId]; if (!d) return;
  const prev = getStore().feedback[dayId];
  const fb: Feedback = { dayId, trackId: d.trackId, ...f, needsWork: f.needsWork.map(x => x.trim()).filter(Boolean), at: now() };
  setDoc("feedback", dayId, fb);
  // each new "still need to work on" item becomes a catch-up extra
  const already = new Set(prev?.needsWork || []);
  for (const item of fb.needsWork) if (!already.has(item))
    addExtra({ text: `Revisit: ${item}`, trackId: d.trackId, min: 20, source: "needsWork", fromDayId: dayId });
}

// ---------- extras (manual + auto catch-up items) ----------
export function addExtra(x: Omit<Extra, "createdAt">) { setDoc("extras", rid("x"), { ...x, createdAt: now() }); }
export function completeExtra(id: string, on: boolean) { mergeDoc("extras", id, { doneAt: on ? todayISO() : null }); }
export function removeExtra(id: string) { deleteDoc("extras", id); }
export function carryTasks(items: { dayId: string; taskId: string; trackId: string; text: string; min: number; date: string }[]) {
  for (const it of items) addExtra({ text: it.text, trackId: it.trackId, min: it.min, source: "carry", fromDayId: it.dayId, fromTaskId: it.taskId, planFor: it.date });
}
/** Finishing a carried task also checks the original task, so the past day leaves catch-up. */
export function completeCarry(id: string, on: boolean) {
  const x = getStore().extras[id]; if (!x) return;
  completeExtra(id, on);
  if (x.source === "carry" && x.fromDayId && x.fromTaskId) toggleTask(x.fromDayId, x.fromTaskId, on);
}

// ---------- settings ----------
const settings = (): Settings => getStore().settings.main || { hours: DEFAULT_HOURS };
export function saveHours(hours: Settings["hours"]) { setDoc("settings", "main", { ...settings(), hours }); }
export function setOverride(date: string, min: number | null) {
  const overrides = { ...(settings().overrides || {}) };
  if (min == null) delete overrides[date]; else overrides[date] = Math.max(0, Math.round(min));
  setDoc("settings", "main", { ...settings(), overrides });
}

// ---------- tracks ----------
export function moveRank(tid: string, dir: number) {
  const order = trackList(getStore()).map(t => t.id); const i = order.indexOf(tid), j = i + dir;
  if (i < 0 || j < 0 || j >= order.length) return;
  [order[i], order[j]] = [order[j], order[i]];
  order.forEach((id, k) => { if (getStore().tracks[id].rank !== k + 1) mergeDoc("tracks", id, { rank: k + 1 }); });
}
export function updateTrack(tid: string, patch: Partial<Track>) { mergeDoc("tracks", tid, patch); }
export function createTrack(name: string, f: Partial<Track>) {
  const tl = trackList(getStore());
  const tid = (name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "goal") + "-" + Math.random().toString(36).slice(2, 6);
  const hues = new Set(tl.map(t => t.hue)); let hue = 0; while (hues.has(hue) && hue < 6) hue++;
  setDoc("tracks", tid, { name, short: name.slice(0, 14), hue: hue % 6, rank: Math.max(0, ...tl.map(t => t.rank ?? 0)) + 1, milestones: [], createdAt: todayISO(),
    learner: "Prefers rigorous step-by-step teaching, small pieces he writes himself, hints before answers.", ...f });
  return tid;
}

export async function addFiles(tid: string, list: File[], onMsg: (m: string) => void) {
  const files = [...(getStore().sources[tid]?.files || [])];
  for (const f of list) {
    const text = await f.text().catch(() => null);
    if (text == null || /\u0000/.test(text)) { onMsg(`${f.name} isn't a text file`); continue; }
    const i = files.findIndex(x => x.name === f.name); const entry = { name: f.name, content: text };
    if (i >= 0) files[i] = entry; else files.push(entry);
  }
  if (files.reduce((a, f) => a + f.content.length, 0) > 200000) { onMsg("That's over 200 KB of files. Add fewer or smaller files."); return; }
  setDoc("sources", tid, { files, updatedAt: now() }); onMsg("Files saved");
}
export function removeFile(tid: string, idx: number) {
  const files = [...(getStore().sources[tid]?.files || [])]; files.splice(idx, 1);
  setDoc("sources", tid, { files, updatedAt: now() });
}

// ---------- AI bridge results ----------
export function saveChat(dayId: string, turns: { role: "user" | "assistant"; content: string }[]) {
  setDoc("chats", dayId, { dayId, turns: turns.slice(-30), updatedAt: now() });
}
export function saveLessonFull(dayId: string, text: string) { mergeDoc("days", dayId, { lessonFull: text }); }

export function applyChanges(ch: Changes) {
  const s = getStore();
  for (const w of ch.writes) {
    if (w.merge) mergeDoc(w.collection, w.id, w.data);
    else setDoc(w.collection, w.id, w.data);
  }
  for (const d of ch.deletes) if ((s as any)[d.collection][d.id]) deleteDoc(d.collection, d.id);
}

// ---------- requests for Claude Code + suggestions ----------
export function queueRequest(type: "interview" | "adapt" | "newTrack", payload: Record<string, unknown>) {
  setDoc("requests", rid("rq"), { type, payload, status: "pending", createdAt: now() });
}
export function addMilestone(tid: string, date: string, label: string) {
  const t = getStore().tracks[tid]; if (!t) return;
  mergeDoc("tracks", tid, { milestones: [...(t.milestones || []), { date, label }] });
}
export function setSuggestion(id: string, status: "accepted" | "dismissed") { mergeDoc("suggestions", id, { status }); }
export function acceptSuggestion(id: string, date?: string) {
  const sg = getStore().suggestions[id]; if (!sg) return;
  addExtra({ text: sg.text, trackId: sg.trackId, min: sg.min || 20, source: "manual", ...(date ? { planFor: date } : {}) });
  setSuggestion(id, "accepted");
}
