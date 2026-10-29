// Derived data. Pure functions of the store so the app, the scripts and the tests share them.
import { addDays, diffDays, parse } from "./dates";
import type { Day, Extra, Kind, Settings, Store, Task, Track, WithId } from "./types";

export const KIND: Record<Kind, string> = { lesson: "Lesson", mock: "Mock test", assessment: "Assessment", review: "Review", project: "Project" };
export const DEFAULT_HOURS: Settings["hours"] = { 0: 240, 1: 180, 2: 180, 3: 180, 4: 180, 5: 180, 6: 240 };

export const trackList = (s: Store): WithId<Track>[] =>
  Object.entries(s.tracks).map(([id, t]) => ({ id, ...t })).sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
export const activeTracks = (s: Store) => trackList(s).filter(t => !t.paused);

/** Days of active tracks. Paused tracks keep their days but drop out of every schedule. */
export const dayList = (s: Store): WithId<Day>[] =>
  Object.entries(s.days).map(([id, d]) => ({ id, ...d })).filter(d => s.tracks[d.trackId] && !s.tracks[d.trackId].paused);

export const doneMap = (s: Store, dayId: string) => s.progress[dayId]?.done ?? {};
export const dayMinutes = (d: Day) => (d.tasks || []).reduce((a, t) => a + (Number(t.min) || 0), 0);
export const dayDoneCount = (s: Store, d: WithId<Day>) => (d.tasks || []).filter(t => doneMap(s, d.id)[t.id]).length;
export const dayComplete = (s: Store, d: WithId<Day>) => (d.tasks || []).length > 0 && dayDoneCount(s, d) === d.tasks.length;
export const doneMinutes = (s: Store, d: WithId<Day>) => (d.tasks || []).filter(t => doneMap(s, d.id)[t.id]).reduce((a, t) => a + (Number(t.min) || 0), 0);
export const leftTasks = (s: Store, d: WithId<Day>) => (d.tasks || []).filter(t => !doneMap(s, d.id)[t.id]);

export function nextDeadline(t: Track | undefined, from: string): string | null {
  if (!t) return null;
  const ds = [...(t.milestones || []).map(m => m.date), t.deadline].filter((x): x is string => !!x && x >= from).sort();
  return ds[0] || null;
}

/** Nearest deadline first, then the user's rank breaks ties. */
export function prioritize<T extends { trackId?: string }>(s: Store, items: T[], from: string): T[] {
  return items.sort((a, b) => {
    const ta = a.trackId ? s.tracks[a.trackId] : undefined, tb = b.trackId ? s.tracks[b.trackId] : undefined;
    const da = nextDeadline(ta, from) || "9999", db = nextDeadline(tb, from) || "9999";
    if (da !== db) return da < db ? -1 : 1;
    return (ta?.rank ?? 99) - (tb?.rank ?? 99);
  });
}

export const daysOn = (s: Store, date: string) => prioritize(s, dayList(s).filter(d => d.date === date), date);
export const catchup = (s: Store, today: string) =>
  dayList(s).filter(d => d.date < today && !dayComplete(s, d)).sort((a, b) => (a.date < b.date ? -1 : 1));

export const openExtras = (s: Store): WithId<Extra>[] =>
  Object.entries(s.extras).map(([id, x]) => ({ id, ...x }))
    .filter(x => !x.doneAt && (!x.trackId || (s.tracks[x.trackId] && !s.tracks[x.trackId].paused)))
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
/** Extras slotted into a date (carries), and the date-less ones still waiting. */
export const extrasOn = (s: Store, date: string) => openExtras(s).filter(x => x.planFor === date);
export const catchupCount = (s: Store, today: string) => catchup(s, today).length + openExtras(s).filter(x => !x.planFor || x.planFor < today).length;

export function availMin(settings: Settings | undefined, date: string) {
  const o = settings?.overrides?.[date];
  if (o != null) return Number(o);
  return Number((settings?.hours ?? DEFAULT_HOURS)[parse(date).getDay()] ?? 0);
}
export const plannedOn = (s: Store, date: string) =>
  daysOn(s, date).reduce((a, d) => a + dayMinutes(d), 0) + extrasOn(s, date).reduce((a, x) => a + (Number(x.min) || 0), 0);

// ---------- streak, XP, stats ----------
const KIND_MULT: Record<Kind, number> = { lesson: 1, review: 1, mock: 1.5, project: 1.5, assessment: 2 };
export const taskXP = (kind: Kind | undefined, min: number) => Math.round((Number(min) || 0) * (KIND_MULT[kind ?? "lesson"] ?? 1));
export const DAY_BONUS = 25;

/** Level L -> L+1 costs 100 + 50(L-1) XP: early levels come quickly, later ones slow down gently. */
export function levelInfo(xp: number) {
  let level = 1, need = 100, left = Math.max(0, Math.floor(xp));
  while (left >= need) { left -= need; level++; need = 100 + 50 * (level - 1); }
  return { level, into: left, need };
}

export function stats(s: Store, today: string) {
  const dates = new Set<string>(); let mins = 0, tasks = 0, xp = 0;
  const perTrack: Record<string, number> = {};
  for (const d of Object.entries(s.days).map(([id, d]) => ({ id, ...d })).filter(d => s.tracks[d.trackId])) {
    const dm = doneMap(s, d.id); let all = true;
    for (const t of d.tasks || []) {
      if (!dm[t.id]) { all = false; continue; }
      dates.add(dm[t.id]); mins += Number(t.min) || 0; tasks++; xp += taskXP(d.kind, t.min);
      perTrack[d.trackId] = (perTrack[d.trackId] || 0) + 1;
    }
    if (all && (d.tasks || []).length) xp += DAY_BONUS;
  }
  for (const x of Object.values(s.extras)) if (x.doneAt) {
    dates.add(x.doneAt); mins += Number(x.min) || 0; tasks++; xp += taskXP("review", x.min);
    if (x.trackId) perTrack[x.trackId] = (perTrack[x.trackId] || 0) + 1;
  }
  let streak = 0, cur = today;
  if (!dates.has(cur)) cur = addDays(cur, -1);
  while (dates.has(cur)) { streak++; cur = addDays(cur, -1); }
  return { streak, mins, tasks, perTrack, xp, studiedToday: dates.has(today), ...levelInfo(xp) };
}

export function trackProgress(s: Store, tid: string, today: string) {
  let all = 0, done = 0, due = 0, dueDone = 0;
  for (const d of dayList(s).filter(d => d.trackId === tid)) for (const k of d.tasks || []) {
    const ok = !!doneMap(s, d.id)[k.id]; all++; if (ok) done++;
    if (d.date <= today) { due++; if (ok) dueDone++; }
  }
  return { all, done, due, dueDone };
}

// ---------- focus queue ----------
export type QueueItem =
  | { kind: "task"; key: string; dayId: string; trackId: string; task: Task; day: WithId<Day> }
  | { kind: "extra"; key: string; extraId: string; trackId?: string; extra: WithId<Extra> };

/** What to do next today: today's tasks in priority order, then extras slotted for today, then older catch-up. */
export function focusQueue(s: Store, today: string): QueueItem[] {
  const q: QueueItem[] = [];
  for (const d of daysOn(s, today)) for (const t of leftTasks(s, d)) q.push({ kind: "task", key: `${d.id}:${t.id}`, dayId: d.id, trackId: d.trackId, task: t, day: d });
  for (const x of prioritize(s, extrasOn(s, today), today)) q.push({ kind: "extra", key: `x:${x.id}`, extraId: x.id, trackId: x.trackId, extra: x });
  return q;
}

// ---------- adaptation signals ----------
export function paceSignals(s: Store, tid: string) {
  const fb = Object.values(s.feedback).filter(f => f.trackId === tid).sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 5);
  if (!fb.length) return null;
  let planned = 0, actual = 0;
  for (const f of fb) { const d = s.days[f.dayId]; if (d) { planned += dayMinutes(d); actual += Number(f.actualMin) || 0; } }
  const last3 = fb.slice(0, 3).map(f => f.rating);
  const ratio = planned ? actual / planned : 1;
  const notes: string[] = [];
  if (last3.length === 3 && last3.every(r => r === "hard")) notes.push("Last 3 days felt too hard");
  else if (last3.length === 3 && last3.every(r => r === "easy")) notes.push("Last 3 days felt too easy");
  if (ratio > 1.25) notes.push(`Taking ${Math.round((ratio - 1) * 100)}% longer than planned`);
  else if (ratio < 0.75) notes.push(`Finishing ${Math.round((1 - ratio) * 100)}% faster than planned`);
  const counts = { easy: 0, right: 0, hard: 0 }; fb.forEach(f => counts[f.rating]++);
  return { counts, ratio, notes, n: fb.length };
}

/** Propose dates for unfinished catch-up tasks: the earliest day with spare time, before the track's next deadline when possible. */
export function fitIntoSpare(s: Store, today: string, horizon = 10) {
  const spare: Record<string, number> = {};
  for (let i = 0; i < horizon; i++) { const d = addDays(today, i); spare[d] = availMin(s.settings.main, d) - plannedOn(s, d); }
  const out: { dayId: string; taskId: string; trackId: string; text: string; min: number; date: string }[] = [];
  const carried = new Set(Object.values(s.extras).filter(x => x.source === "carry" && !x.doneAt).map(x => `${x.fromDayId}:${x.fromTaskId}`));
  for (const d of prioritize(s, catchup(s, today), today)) {
    const limit = nextDeadline(s.tracks[d.trackId], today) || addDays(today, horizon - 1);
    for (const t of leftTasks(s, d)) {
      if (carried.has(`${d.id}:${t.id}`)) continue;
      const min = Number(t.min) || 0;
      const date = Object.keys(spare).sort().find(x => x <= limit && spare[x] >= min) ?? Object.keys(spare).sort().find(x => spare[x] >= min);
      if (!date) continue;
      spare[date] -= min;
      out.push({ dayId: d.id, taskId: t.id, trackId: d.trackId, text: t.text, min, date });
    }
  }
  return out;
}

export const daysUntil = (today: string, date: string) => diffDays(today, date);

export function upcomingMilestones(s: Store, today: string, n = 6) {
  return activeTracks(s)
    .flatMap(t => (t.milestones || []).filter(m => m.date >= today).map(m => ({ ...m, track: t })))
    .sort((a, b) => (a.date < b.date ? -1 : 1)).slice(0, n);
}
