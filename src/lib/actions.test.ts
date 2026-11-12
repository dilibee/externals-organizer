import { beforeEach, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ getStore: vi.fn(), setDoc: vi.fn(), deleteDoc: vi.fn(), mergeDoc: vi.fn() }));
vi.mock("./db", () => db);
import { saveNote } from "./actions";
beforeEach(() => { vi.clearAllMocks(); db.getStore.mockReturnValue({ days: { d1: { trackId: "cpp" } } }); });
it("saves the note with its day, track, text and timestamp", () => {
  saveNote("d1", "  My working notes\n");
  expect(db.setDoc).toHaveBeenCalledWith("notes", "d1", { dayId: "d1", trackId: "cpp", text: "  My working notes\n", updatedAt: expect.any(String) });
});
it("deletes whitespace-only notes", () => { saveNote("d1", " \n "); expect(db.deleteDoc).toHaveBeenCalledWith("notes", "d1"); expect(db.setDoc).not.toHaveBeenCalled(); });
it("does not write notes for missing days", () => { saveNote("missing", "test"); expect(db.setDoc).not.toHaveBeenCalled(); expect(db.deleteDoc).not.toHaveBeenCalled(); });
