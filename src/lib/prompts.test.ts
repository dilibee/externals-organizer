import { describe, expect, it } from "vitest";
import { chatPrompt } from "./prompts";
import { COLLECTIONS, type Store, type WithId, type Day } from "./types";

const day: WithId<Day> = { id: "d1", trackId: "cpp", dayNum: 1, date: "2026-11-11", title: "Pointers", kind: "lesson", tasks: [] };
const fixture = () => {
  const s = Object.fromEntries(COLLECTIONS.map(c => [c, {}])) as Store;
  s.tracks.cpp = { name: "C++" }; s.days.d1 = day; return s;
};
describe("chatPrompt notes", () => {
  it("includes only this day's note and labels it as the student's own", () => {
    const s = fixture();
    s.notes.d1 = { dayId: "d1", trackId: "cpp", text: "I confuse pointers with references", updatedAt: "now" };
    s.notes.d2 = { dayId: "d2", trackId: "cpp", text: "Unrelated personal note", updatedAt: "now" };
    const prompt = chatPrompt(s, day, day.date, [{ role: "assistant", content: "Previous answer" }], "Help?");
    expect(prompt).toContain("Student's own notes for this day:\nI confuse pointers with references");
    expect(prompt).not.toContain("Unrelated personal note");
    expect(prompt).toContain("Coach: Previous answer"); expect(prompt).toContain("Dilibe's question:\nHelp?");
  });
  it("omits the notes block when the day has no note", () => {
    expect(chatPrompt(fixture(), day, day.date, [], "Quiz me")).not.toContain("Student's own notes");
  });
});
