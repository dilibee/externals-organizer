import { expect, it } from "vitest";
import { parseHash, dayHash } from "./ui";
it("parses main routes and defaults unknown routes", () => {
  for (const view of ["today", "week", "goals", "catchup", "settings", "progress"]) expect(parseHash("#" + view)).toEqual({ view });
  expect(parseHash("#unknown")).toEqual({ view: "today" });
});
it("parses lesson links, encoded ids, and optional tabs", () => {
  expect(parseHash("#day/a%20b/ask")).toEqual({ view: "day", dayId: "a b", tab: "ask" });
  expect(parseHash("#day/d1")).toEqual({ view: "day", dayId: "d1", tab: "lesson" });
  expect(parseHash("#day/d1/invalid").tab).toBe("lesson");
  expect(parseHash(dayHash("a/b", "tasks"))).toEqual({ view: "day", dayId: "a/b", tab: "tasks" });
  expect(parseHash("#day/%invalid")).toEqual({ view: "today" });
});
