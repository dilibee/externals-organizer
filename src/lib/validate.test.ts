import { describe, expect, it } from "vitest";
import { parsePlan, planChanges } from "./validate";
import { COLLECTIONS, type Day, type Store } from "./types";

const T = "2026-10-28";
const day = (date: string, dayNum: number, tasks = ["read", "solve"]): Day => ({
  trackId: "cpp", date, dayNum, title: date, kind: "lesson", tasks: tasks.map((text, i) => ({ id: "t" + (i + 1), text, min: 30 })),
});
function mk(): Store {
  const s = Object.fromEntries(COLLECTIONS.map(c => [c, {}])) as Store;
  s.tracks = { cpp: { name: "C++", milestones: [{ date: "2026-11-01", label: "CIBC" }] } };
  s.days = { "cpp-001": day("2026-10-27", 1), "cpp-002": day("2026-10-29", 2), "cpp-003": day("2026-10-31", 3) };
  return s;
}
const day$ = (ch: ReturnType<typeof planChanges>, id: string) => ch.writes.find(w => w.collection === "days" && w.id === id)?.data;

describe("parsePlan", () => {
  it("reads JSON wrapped in a fence and prose", () => {
    expect(parsePlan('Here you go:\n```json\n{"days": []}\n```\nGood luck!')).toEqual({ days: [] });
    expect(() => parsePlan("no json here")).toThrow();
  });
});

describe("planChanges", () => {
  it("adds days with the next id and renumbers by date", () => {
    const ch = planChanges(mk(), { days: [{ date: "2026-10-30", title: "New", tasks: [{ text: "x", min: 20, url: "http://bad" }] }] }, T, "cpp");
    const d = day$(ch, "cpp-004");
    expect(d).toMatchObject({ date: "2026-10-30", dayNum: 3, title: "New" });
    expect(d.tasks[0].url).toBeUndefined();
    expect(day$(ch, "cpp-003").dayNum).toBe(4);
  });
  it("keeps checked tasks when replacing a day", () => {
    const s = mk(); s.progress["cpp-002"] = { dayId: "cpp-002", trackId: "cpp", done: { t2: T } };
    const ch = planChanges(s, { days: [{ id: "cpp-002", date: "2026-10-29", title: "Redo", tasks: [{ text: "new one", min: 25 }] }] }, T);
    const d = day$(ch, "cpp-002");
    expect(d.tasks.map((t: any) => [t.id, t.text])).toEqual([["t2", "solve"], ["t3", "new one"]]);
  });
  it("never rewrites the past or removes started days", () => {
    const s = mk(); s.progress["cpp-003"] = { dayId: "cpp-003", trackId: "cpp", done: { t1: T } };
    const ch = planChanges(s, { days: [{ id: "cpp-001", date: "2026-10-30", title: "x" }, { date: "2026-10-20", title: "old" }], remove: ["cpp-001", "cpp-003", "cpp-002"] }, T, "cpp");
    expect(ch.deletes).toEqual([{ collection: "days", id: "cpp-002" }]);
    expect(ch.skipped).toHaveLength(4);
    expect(day$(ch, "cpp-001")).toBeUndefined();
  });
  it("merges new milestones onto the default track without duplicates", () => {
    const ch = planChanges(mk(), { milestones: [{ date: "2026-11-01", label: "CIBC" }, { date: "2026-11-10", label: "Mock" }] }, T, "cpp");
    const w = ch.writes.find(w => w.collection === "tracks");
    expect(w?.data.milestones).toHaveLength(2);
  });
});
