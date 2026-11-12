import { describe, expect, it } from "vitest";
import { activityByDate, availMin, catchup, catchupCount, catchupExtras, daysOn, extrasOn, fitIntoSpare, focusQueue, levelInfo, paceSignals, plannedOn, stats, taskXP } from "./planner";
import { COLLECTIONS, type Day, type Store } from "./types";

const T = "2026-10-28"; // a Wednesday
const day = (trackId: string, date: string, mins: number[], extra: Partial<Day> = {}): Day => ({
  trackId, date, dayNum: 1, title: `${trackId} ${date}`, kind: "lesson", tasks: mins.map((min, i) => ({ id: "t" + (i + 1), text: `task ${i + 1}`, min })), ...extra,
});
function mk(p: Partial<Store> = {}): Store {
  const s = Object.fromEntries(COLLECTIONS.map(c => [c, {}])) as Store;
  s.tracks = { a: { name: "A", rank: 1 }, b: { name: "B", rank: 2, milestones: [{ date: "2026-10-30", label: "OA" }] } };
  s.settings = { main: { hours: { 0: 240, 1: 180, 2: 180, 3: 180, 4: 180, 5: 180, 6: 240 } } };
  return { ...s, ...p };
}

describe("ordering", () => {
  it("puts the nearest deadline first, then rank", () => {
    const s = mk({ days: { a1: day("a", T, [30]), b1: day("b", T, [30]) } });
    expect(daysOn(s, T).map(d => d.id)).toEqual(["b1", "a1"]);
    delete s.tracks.b.milestones;
    expect(daysOn(s, T).map(d => d.id)).toEqual(["a1", "b1"]);
  });
  it("queues today's tasks before extras slotted for today", () => {
    const s = mk({ days: { a1: day("a", T, [30, 20]) }, progress: { a1: { dayId: "a1", trackId: "a", done: { t1: T } } },
      extras: { x1: { text: "carry", trackId: "a", min: 15, source: "carry", planFor: T, createdAt: "1" } } });
    expect(focusQueue(s, T).map(q => q.key)).toEqual(["a1:t2", "x:x1"]);
  });
});

describe("catch-up", () => {
  it("counts unfinished tasks without counting a past-date linked carry twice", () => {
    const s = mk({ days: { old: day("a", "2026-10-26", [30, 20, 10]) },
      progress: { old: { dayId: "old", trackId: "a", done: { t3: T } } },
      extras: { carry: { text: "copy", min: 30, source: "carry", fromDayId: "old", fromTaskId: "t1", planFor: "2026-10-27", createdAt: "1" } } });
    expect(catchupExtras(s, T)).toEqual([]);
    expect(catchupCount(s, T)).toBe(2);
  });
  it("counts a standalone manual extra once", () => {
    const s = mk({ extras: { manual: { text: "Practice", min: 20, source: "manual", createdAt: "1" } } });
    expect(catchupExtras(s, T).map(x => x.id)).toEqual(["manual"]);
    expect(catchupCount(s, T)).toBe(1);
  });
  it("keeps carries with deleted original days or no original task reachable", () => {
    const s = mk({ days: { old: day("a", "2026-10-26", [30]) }, extras: {
      orphan: { text: "Deleted day", min: 20, source: "carry", fromDayId: "deleted", fromTaskId: "t1", planFor: "2026-10-27", createdAt: "1" },
      standalone: { text: "Whole day", min: 10, source: "carry", fromDayId: "old", createdAt: "2" },
    } });
    expect(catchupExtras(s, T).map(x => x.id)).toEqual(["orphan", "standalone"]);
    expect(catchupCount(s, T)).toBe(3);
  });
  it("keeps a carry reachable when its original task was removed from the day", () => {
    const s = mk({ days: { old: day("a", "2026-10-26", [30]) }, extras: {
      gone: { text: "Removed task", min: 20, source: "carry", fromDayId: "old", fromTaskId: "t9", planFor: "2026-10-27", createdAt: "1" },
    } });
    expect(catchupExtras(s, T).map(x => x.id)).toEqual(["gone"]);
  });
  it("reschedules expired carries but skips tasks carried to today or a future date", () => {
    const s = mk({ days: { old: day("a", "2026-10-26", [30, 20, 10]) }, extras: {
      expired: { text: "Expired", min: 30, source: "carry", fromDayId: "old", fromTaskId: "t1", planFor: "2026-10-27", createdAt: "1" },
      future: { text: "Future", min: 20, source: "carry", fromDayId: "old", fromTaskId: "t2", planFor: "2026-10-29", createdAt: "2" },
      today: { text: "Today", min: 10, source: "carry", fromDayId: "old", fromTaskId: "t3", planFor: T, createdAt: "3" },
    } });
    expect(fitIntoSpare(s, T).map(x => [x.taskId, x.date])).toEqual([["t1", T]]);
  });
  it("keeps completed scheduled extras in the day and planned time but out of the focus queue", () => {
    const s = mk({ days: { d: day("a", T, [30]) }, extras: {
      done: { text: "done carry", trackId: "a", min: 15, source: "carry", planFor: T, doneAt: T, createdAt: "1" },
      open: { text: "open carry", min: 20, source: "carry", planFor: T, createdAt: "2" },
      paused: { text: "paused carry", trackId: "b", min: 40, source: "carry", planFor: T, doneAt: T, createdAt: "3" },
      later: { text: "later carry", min: 10, source: "carry", planFor: "2026-10-29", createdAt: "4" },
    } });
    s.tracks.b.paused = true;
    expect(extrasOn(s, T).map(x => x.id)).toEqual(["done", "open"]);
    expect(plannedOn(s, T)).toBe(65);
    expect(focusQueue(s, T).map(q => q.key)).toEqual(["d:t1", "x:open"]);
  });
  it("lists only past, unfinished days of active tracks", () => {
    const s = mk({ days: { old: day("a", "2026-10-26", [30]), done: day("a", "2026-10-27", [30]), now: day("a", T, [30]), paused: day("b", "2026-10-25", [30]) },
      progress: { done: { dayId: "done", trackId: "a", done: { t1: "2026-10-27" } } } });
    s.tracks.b.paused = true;
    expect(catchup(s, T).map(d => d.id)).toEqual(["old"]);
  });
  it("fits an unfinished task into the first day with enough spare time and skips carried ones", () => {
    const s = mk({ days: { old: day("a", "2026-10-26", [60, 40]), full: day("a", T, [180]) } });
    const p = fitIntoSpare(s, T);
    expect(p.map(x => [x.taskId, x.date])).toEqual([["t1", "2026-10-29"], ["t2", "2026-10-29"]]);
    s.extras = { c: { text: "x", min: 60, source: "carry", fromDayId: "old", fromTaskId: "t1", planFor: "2026-10-29", createdAt: "1" } };
    expect(fitIntoSpare(s, T).map(x => x.taskId)).toEqual(["t2"]);
  });
});

describe("hours", () => {
  it("lets a per-date override win over weekday hours", () => {
    const s = mk();
    expect(availMin(s.settings.main, T)).toBe(180);
    s.settings.main.overrides = { [T]: 60 };
    expect(availMin(s.settings.main, T)).toBe(60);
    expect(availMin(s.settings.main, "2026-11-01")).toBe(240);
  });
});

describe("streak and XP", () => {
  it("counts a completed carried task once while still counting standalone extras", () => {
    const s = mk({ days: { d: day("a", "2026-10-27", [30], { kind: "mock" }) },
      progress: { d: { dayId: "d", trackId: "a", done: { t1: T } } }, extras: {
        carry: { text: "carry", trackId: "a", min: 30, source: "carry", fromDayId: "d", fromTaskId: "t1", doneAt: T, createdAt: "1" },
      } });
    expect(stats(s, T)).toMatchObject({ mins: 30, tasks: 1, xp: 70, perTrack: { a: 1 }, streak: 1, studiedToday: true });
    s.extras.standalone = { text: "standalone carry", trackId: "a", min: 15, source: "carry", fromDayId: "d", doneAt: T, createdAt: "2" };
    expect(stats(s, T)).toMatchObject({ mins: 45, tasks: 2, xp: 85, perTrack: { a: 2 } });
  });
  it("counts consecutive days ending today or yesterday", () => {
    const s = mk({ days: { d: day("a", "2026-10-20", [10, 10, 10, 10]) },
      progress: { d: { dayId: "d", trackId: "a", done: { t1: "2026-10-25", t2: "2026-10-26", t3: "2026-10-27", t4: "2026-10-23" } } } });
    expect(stats(s, T).streak).toBe(3);
    expect(stats(s, "2026-10-30").streak).toBe(0);
  });
  it("weights XP by kind and adds a bonus for finished days", () => {
    expect(taskXP("lesson", 30)).toBe(30);
    expect(taskXP("mock", 30)).toBe(45);
    expect(taskXP("assessment", 30)).toBe(60);
    const s = mk({ days: { d: day("a", T, [50]) }, progress: { d: { dayId: "d", trackId: "a", done: { t1: T } } } });
    expect(stats(s, T).xp).toBe(75);
  });
  it("levels on a gentle curve", () => {
    expect(levelInfo(99)).toMatchObject({ level: 1, into: 99, need: 100 });
    expect(levelInfo(100)).toMatchObject({ level: 2, into: 0, need: 150 });
    expect(levelInfo(250)).toMatchObject({ level: 3, into: 0, need: 200 });
  });
});

describe("pace", () => {
  it("flags three hard days and running long", () => {
    const s = mk({ days: { d1: day("a", "2026-10-25", [60]), d2: day("a", "2026-10-26", [60]), d3: day("a", "2026-10-27", [60]) } });
    for (const [i, id] of ["d1", "d2", "d3"].entries())
      s.feedback[id] = { dayId: id, trackId: "a", rating: "hard", actualMin: 90, needsWork: [], comment: "", at: `2026-10-2${5 + i}` };
    const p = paceSignals(s, "a")!;
    expect(p.notes).toContain("Last 3 days felt too hard");
    expect(p.notes.some(n => n.startsWith("Taking 50% longer"))).toBe(true);
    expect(paceSignals(s, "b")).toBeNull();
  });
});

describe("activity by completion date", () => {
 it("aggregates checked task minutes on completion dates rather than planned dates", () => {
  const s = mk({ days: { d: day("a", "2026-10-01", [30, 50, 90]) }, progress: { d: { dayId: "d", trackId: "a", done: { t1: T, t2: "2026-10-29", deleted: T }, actual: { t1: 99 } } } });
  expect(activityByDate(s)).toEqual({ [T]: 30, "2026-10-29": 50 });
 });
 it("matches stats totals including paused history and extras, excluding linked carries and missing tracks", () => {
  const s = mk({ days: { d: day("a", T, [30]), missing: day("gone", T, [100]) }, progress: { d: { dayId: "d", trackId: "a", done: { t1: T } }, missing: { dayId: "missing", trackId: "gone", done: { t1: T } } }, extras: {
   linked: { text: "copy", min: 30, source: "carry", fromDayId: "d", fromTaskId: "t1", doneAt: T, createdAt: T },
   manual: { text: "extra", min: 20, source: "manual", doneAt: T, createdAt: T },
   standalone: { text: "review", min: 15, source: "carry", doneAt: "2026-10-29", createdAt: T },
   open: { text: "pending", min: 90, source: "manual", createdAt: T },
  } });
  s.tracks.a.paused = true;
  expect(activityByDate(s)).toEqual({ [T]: 50, "2026-10-29": 15 });
  expect(Object.values(activityByDate(s)).reduce((a, b) => a + b, 0)).toBe(stats(s, T).mins);
 });
 it("returns no activity for an empty store and groups ISO timestamps by their recorded date", () => {
  expect(activityByDate(mk())).toEqual({});
  expect(activityByDate(mk({ extras: { x: { text: "extra", min: 10, source: "manual", doneAt: T + "T23:00:00Z", createdAt: T } } }))).toEqual({ [T]: 10 });
 });
});
