import type { Job } from "./types";
export function latestJob(jobs: Record<string, Job>, key: string) {
  return Object.entries(jobs).filter(([, j]) => j.key === key && j.status !== "used")
    .sort(([a, x], [b, y]) => y.createdAt.localeCompare(x.createdAt) || b.localeCompare(a))
    .map(([id, job]) => ({ id, ...job }))[0];
}
export const workerOnline = (lastSeen?: string, now = Date.now()) => {
  const age = now - Date.parse(lastSeen || ""); return age >= 0 && age < 90_000;
};
export const canConsumeText = (job: Job) => job.kind === "text" && job.status === "done" && !!job.result?.trim();
/** Callback runs only for the winner of the database compare-and-swap. */
export async function consumeText(job: Job, claim: () => Promise<boolean>, save: (text: string) => void) {
  if (!canConsumeText(job) || !await claim()) return false;
  save(job.result!); return true;
}
