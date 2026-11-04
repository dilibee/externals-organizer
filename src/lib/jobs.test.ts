import { describe, expect, it, vi } from "vitest";
import { consumeText, latestJob, workerOnline } from "./jobs";
import type { Job } from "./types";
const job = (patch: Partial<Job> = {}): Job => ({ kind: "text", key: "chat:a", label: "AI", prompt: "test", status: "done", result: "answer", createdAt: "2026-11-03T12:00:00Z", ...patch });
describe("job lifecycle", () => {
  it("resumes only the latest unresolved job for the exact key", () => {
    expect(latestJob({ old: job(), newer: job({ createdAt: "2026-11-03T13:00:00Z" }), used: job({ status: "used", createdAt: "2026-11-03T14:00:00Z" }), other: job({ key: "chat:b" }) }, "chat:a")?.id).toBe("newer");
    expect(latestJob({ used: job({ status: "used" }) }, "chat:a")).toBeUndefined();
  });
  it("saves once across competing devices and a remount", async () => {
    let status = "done";
    const claim = async () => { if (status !== "done") return false; status = "used"; return true; };
    const save = vi.fn();
    await Promise.all([consumeText(job(), claim, save), consumeText(job(), claim, save)]);
    await consumeText(job(), claim, save);
    expect(save).toHaveBeenCalledExactlyOnceWith("answer");
  });
  it("does not consume incomplete, plan, empty or failed-claim jobs", async () => {
    const save = vi.fn(), claim = vi.fn(async () => true);
    for (const j of [job({ status: "running" }), job({ kind: "plan" }), job({ result: " " })]) await consumeText(j, claim, save);
    expect(claim).not.toHaveBeenCalled();
    await consumeText(job(), async () => false, save); expect(save).not.toHaveBeenCalled();
  });
  it("considers the helper online for less than 90 seconds", () => {
    const now = Date.parse("2026-11-03T12:00:00Z");
    expect(workerOnline(new Date(now - 89999).toISOString(), now)).toBe(true);
    for (const value of [undefined, "invalid", new Date(now - 90000).toISOString(), new Date(now + 1).toISOString()]) expect(workerOnline(value, now)).toBe(false);
  });
});
