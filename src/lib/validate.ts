// Turns an AI-written plan (pasted into the app or written by Claude Code) into safe writes.
// Shared by the in-app bridge and scripts/apply.ts so both follow the same rules:
// past days and checked tasks are never changed, ids stay stable, URLs must be https.
import { KIND, doneMap } from "./planner";
import type { CollectionName, Day, Kind, Milestone, Store, Suggestion, Task, Track } from "./types";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const str = (v: unknown, max: number, dflt = "") => String(v ?? dflt).slice(0, max);

export interface RawDay {
  id?: string; trackId?: string; date?: string; title?: string; kind?: string; focus?: string; lesson?: string; lessonFull?: string;
  tasks?: { text?: string; min?: number; url?: string }[]; resources?: { label?: string; url?: string }[];
}
export interface PlanPatch {
  short?: string; goal?: string;                       // original artifact shape, for a single track
  milestones?: Milestone[];
  trackId?: string;
  tracks?: Record<string, Partial<Track>>;
  days?: RawDay[];
  remove?: string[];
  suggestions?: Partial<Suggestion>[];
}

export function cleanTasks(raw: RawDay["tasks"]): Task[] {
  return (Array.isArray(raw) ? raw : []).slice(0, 12).map((x, i) => ({
    id: "t" + (i + 1), text: str(x?.text, 300), min: Math.max(5, Math.min(240, Math.round(Number(x?.min) || 15))),
    ...(/^https:\/\//.test(x?.url || "") ? { url: x!.url } : {}),
  })).filter(t => t.text);
}

export function cleanDay(d: RawDay, trackId: string, dayNum: number): Day {
  return {
    trackId, dayNum, date: d.date!, title: str(d.title, 160, "Study"),
    kind: (d.kind && d.kind in KIND ? d.kind : "lesson") as Kind, focus: str(d.focus, 120),
    lesson: str(d.lesson, 20000), ...(d.lessonFull ? { lessonFull: str(d.lessonFull, 60000) } : {}),
    tasks: cleanTasks(d.tasks),
    resources: (Array.isArray(d.resources) ? d.resources : []).filter(r => /^https:\/\//.test(r?.url || "")).slice(0, 8)
      .map(r => ({ label: str(r.label || r.url, 120), url: r.url! })),
  };
}

export function parsePlan(text: string): PlanPatch {
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const start = t.indexOf("{"), end = t.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("No JSON object found.");
  const plan = JSON.parse(t.slice(start, end + 1));
  if (!plan || typeof plan !== "object") throw new Error("The plan isn't a JSON object.");
  return plan;
}

export interface Write { collection: CollectionName; id: string; data: any; merge?: boolean }
export interface Changes { writes: Write[]; deletes: { collection: CollectionName; id: string }[]; summary: string[]; skipped: string[] }

/**
 * Compute writes for a plan. `defaultTrackId` is used for days without a trackId.
 * Days with an existing id are replaced (keeping their checked tasks); others are added.
 * Every touched track is renumbered by date so "Day N of M" stays in order.
 */
export function planChanges(s: Store, plan: PlanPatch, today: string, defaultTrackId?: string): Changes {
  const ch: Changes = { writes: [], deletes: [], summary: [], skipped: [] };
  const days: Record<string, Day> = { ...s.days };
  const touched = new Set<string>(); const changed = new Set<string>();
  const hasProgress = (id: string) => Object.keys(doneMap(s, id)).length > 0;

  for (const [tid, patch] of Object.entries(plan.tracks || {})) {
    if (!s.tracks[tid] && !patch?.name) { ch.skipped.push(`Track ${tid}: unknown and has no name`); continue; }
    const allowed: (keyof Track)[] = ["name", "short", "goal", "deadline", "level", "learner", "milestones", "paused", "rank", "hue"];
    const clean: Partial<Track> = {};
    for (const k of allowed) if (k in patch) (clean as any)[k] = (patch as any)[k];
    if (clean.milestones) clean.milestones = clean.milestones.filter(m => DATE.test(m?.date || "")).map(m => ({ date: m.date, label: str(m.label, 160) }));
    ch.writes.push({ collection: "tracks", id: tid, data: clean, merge: true });
    ch.summary.push(`${s.tracks[tid] ? "Update" : "Create"} track ${tid}: ${Object.keys(clean).join(", ")}`);
  }
  if (plan.milestones?.length && defaultTrackId && s.tracks[defaultTrackId] && !plan.tracks?.[defaultTrackId]) {
    const have = s.tracks[defaultTrackId].milestones || [];
    const add = plan.milestones.filter(m => DATE.test(m?.date || "") && !have.some(h => h.date === m.date && h.label === m.label));
    if (add.length) {
      ch.writes.push({ collection: "tracks", id: defaultTrackId, data: { milestones: [...have, ...add.map(m => ({ date: m.date, label: str(m.label, 160) }))] }, merge: true });
      ch.summary.push(`Add ${add.length} milestone(s) to ${defaultTrackId}`);
    }
  }

  for (const id of plan.remove || []) {
    const d = days[id];
    if (!d) { ch.skipped.push(`Remove ${id}: no such day`); continue; }
    if (d.date < today) { ch.skipped.push(`Remove ${id}: it's in the past`); continue; }
    if (hasProgress(id)) { ch.skipped.push(`Remove ${id}: has checked tasks`); continue; }
    ch.deletes.push({ collection: "days", id }); delete days[id]; touched.add(d.trackId);
    ch.summary.push(`Remove ${id} (${d.date} ${d.title})`);
  }

  const nextNum: Record<string, number> = {};
  const newId = (tid: string) => {
    if (nextNum[tid] == null) nextNum[tid] = Math.max(0, ...Object.keys(days).filter(k => k.startsWith(tid + "-")).map(k => Number(k.slice(tid.length + 1)) || 0));
    let id: string; do { id = `${tid}-${String(++nextNum[tid]).padStart(3, "0")}`; } while (days[id]);
    return id;
  };
  for (const raw of plan.days || []) {
    const tid = raw.trackId || (raw.id && days[raw.id]?.trackId) || defaultTrackId;
    if (!tid || (!s.tracks[tid] && !plan.tracks?.[tid])) { ch.skipped.push(`Day "${raw.title}": no track`); continue; }
    if (!DATE.test(raw.date || "")) { ch.skipped.push(`Day "${raw.title}": bad date`); continue; }
    if (raw.date! < today) { ch.skipped.push(`Day "${raw.title}" (${raw.date}): dates before today are left alone`); continue; }
    const prev = raw.id ? days[raw.id] : undefined;
    if (prev && prev.date < today) { ch.skipped.push(`${raw.id}: past days are never rewritten`); continue; }
    const id = prev ? raw.id! : newId(tid);
    const day = cleanDay(raw, tid, prev?.dayNum ?? 0);
    if (prev) {
      // keep checked tasks exactly as they were, then the new ones with fresh ids
      const dm = doneMap(s, id); const kept = (prev.tasks || []).filter(t => dm[t.id]);
      let n = Math.max(0, ...kept.map(t => Number(t.id.slice(1)) || 0));
      day.tasks = [...kept, ...day.tasks.filter(t => !kept.some(k => k.text === t.text)).map(t => ({ ...t, id: "t" + ++n }))];
      if (!raw.lessonFull && prev.lessonFull && prev.lesson === day.lesson) day.lessonFull = prev.lessonFull;
    }
    days[id] = day; touched.add(tid); changed.add(id);
    ch.summary.push(`${prev ? "Replace" : "Add"} ${id}: ${day.date} ${day.title} (${day.tasks.reduce((a, t) => a + t.min, 0)} min)`);
  }

  for (const tid of touched) {
    const mine = Object.entries(days).filter(([, d]) => d.trackId === tid).sort(([a, x], [b, y]) => (x.date === y.date ? (a < b ? -1 : 1) : x.date < y.date ? -1 : 1));
    mine.forEach(([id, d], i) => {
      if (d.dayNum !== i + 1) { days[id] = { ...d, dayNum: i + 1 }; changed.add(id); }
    });
  }
  for (const id of changed) ch.writes.push({ collection: "days", id, data: days[id] });

  for (const sg of plan.suggestions || []) {
    if (!sg?.text) continue;
    const id = "sg-" + Math.random().toString(36).slice(2, 10);
    ch.writes.push({ collection: "suggestions", id, data: { trackId: sg.trackId || defaultTrackId, text: str(sg.text, 300), why: str(sg.why, 400), min: Number(sg.min) || 20, status: "new", createdAt: today } });
    ch.summary.push(`Suggest: ${str(sg.text, 80)}`);
  }
  return ch;
}
