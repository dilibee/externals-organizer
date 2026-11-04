import { describe, expect, it, vi } from "vitest";
import { lockIsStale, retryFinal } from "./worker-utils";

describe("worker lock freshness", () => {
  it("refuses fresh locks regardless of their PID", () => {
    expect(lockIsStale(100_000, 100_000)).toBe(false);
    expect(lockIsStale(10_000, 100_000)).toBe(false);
    expect(lockIsStale(100_001, 100_000)).toBe(false);
  });
  it("recovers locks older than 90 seconds, including after reboot", () => {
    expect(lockIsStale(9_999, 100_000)).toBe(true);
  });
});

describe("final update retries", () => {
  it("keeps retrying the same finished answer through a brief outage", async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(true);
    const wait = vi.fn().mockResolvedValue(undefined);
    expect(await retryFinal(save, wait)).toBe(true);
    expect(save).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledWith(2000);
  });
  it("propagates a persistent outage after four attempts", async () => {
    const error = new Error("offline");
    const save = vi.fn().mockRejectedValue(error);
    const wait = vi.fn().mockResolvedValue(undefined);
    await expect(retryFinal(save, wait)).rejects.toBe(error);
    expect(save).toHaveBeenCalledTimes(4);
    expect(wait).toHaveBeenCalledTimes(3);
  });
});
