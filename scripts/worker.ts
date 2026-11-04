import { mkdirSync, openSync, closeSync, readFileSync, unlinkSync, writeFileSync, appendFileSync, statSync, utimesSync } from "node:fs";
import { join } from "node:path";
import { admin, ROOT } from "./common";
import { runCodex } from "./codex-runner";
import { parsePlan } from "../src/lib/validate";
import type { Job } from "../src/lib/types";
import { delay, lockIsStale, retryFinal } from "./worker-utils";

const dir = join(ROOT, ".local"); mkdirSync(dir, { recursive: true });
const lock = join(dir, "worker.lock");
function acquire() {
  try { const fd = openSync(lock, "wx"); writeFileSync(fd, String(process.pid)); closeSync(fd); }
  catch (e: any) {
    if (e.code !== "EEXIST") throw e;
    if (lockIsStale(statSync(lock).mtimeMs)) { unlinkSync(lock); return acquire(); }
    throw new Error("Another laptop helper is already running.");
  }
}
const log = (line: string) => appendFileSync(join(dir, "worker.log"), `${new Date().toISOString()} ${line}\n`);
acquire();
process.on("exit", () => { try { if (readFileSync(lock, "utf8") === String(process.pid)) unlinkSync(lock); } catch {} });
const { db, owner } = (() => {
  try { return admin(); }
  catch { log("Helper configuration missing or invalid: set VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and OWNER_USER_ID in .env"); process.exit(1); }
})();
const query = () => db.from("docs").select("id,data").match({ user_id: owner, collection: "jobs" });
async function update(id: string, old: Job, patch: Partial<Job>) {
  const { data, error } = await db.from("docs").update({ data: { ...old, ...patch }, updated_at: new Date().toISOString() })
    .match({ user_id: owner, collection: "jobs", id }).eq("data->>status", old.status).select("id");
  if (error) throw error;
  return !!data?.length;
}
async function heartbeat() {
  const { error } = await db.from("docs").upsert({ user_id: owner, collection: "settings", id: "worker", data: { lastSeen: new Date().toISOString() }, updated_at: new Date().toISOString() });
  if (error) throw error;
}
async function startup() {
  let from = 0;
  const rows: { id: string; data: Job }[] = [];
  for (;;) { const { data, error } = await query().order("id").range(from, from + 999); if (error) throw error; rows.push(...data); if (data.length < 1000) break; from += 1000; }
  for (const { id, data: j } of rows) {
    if (Date.parse(j.createdAt) < Date.now() - 7 * 86400000) {
      const { error } = await db.from("docs").delete().match({ user_id: owner, collection: "jobs", id }); if (error) throw error;
    } else if (j.status === "running") await update(id, j, (j.retries || 0) >= 1
      ? { status: "error", error: "The helper stopped twice while processing this job. Please retry.", finishedAt: new Date().toISOString() }
      : { status: "pending", retries: 1 });
  }
}
async function pending() {
  const { data, error } = await query().eq("data->>status", "pending").order("data->>createdAt").limit(1);
  if (error) throw error;
  const row = data?.[0]; if (!row) return false;
  const j: Job = { ...row.data, status: "running", startedAt: new Date().toISOString() };
  if (!await update(row.id, row.data, j)) return true;
  log("Job claimed");
  let final: Partial<Job>;
  try {
    if (!['text', 'plan'].includes(j.kind) || typeof j.prompt !== "string") throw new Error("Invalid AI job. Please create it again.");
    const deadline = Date.now() + 300_000;
    let result = await runCodex(j.prompt, j.web === true && j.key.startsWith("interview:"));
    if (j.kind === "plan") {
      try { parsePlan(result); }
      catch (e) { result = await runCodex(j.prompt + "\n\nYour previous reply failed JSON validation: " + (e instanceof SyntaxError ? "Invalid JSON syntax" : "No JSON object found") + ". Return a valid plan JSON object only.", j.web === true && j.key.startsWith("interview:"), Math.max(1, deadline - Date.now())); parsePlan(result); }
    }
    final = { status: "done", result, finishedAt: new Date().toISOString() };
  } catch (e) {
    const error = e instanceof SyntaxError ? "The AI returned invalid plan JSON twice. Please retry or use the manual flow." : e instanceof Error ? e.message : "AI job failed. Please retry.";
    final = { status: "error", error, finishedAt: new Date().toISOString() };
  }
  await retryFinal(() => update(row.id, j, final));
  log(final.status === "done" ? "Job finished" : "Job failed");
  return true;
}
// Touch synchronously before any network work, including during startup outages.
let heartbeatBusy = false;
function tick() {
  try { const now = new Date(); utimesSync(lock, now, now); }
  catch { log("Lock heartbeat failed"); }
  if (heartbeatBusy) return;
  heartbeatBusy = true;
  void heartbeat().catch(() => log("Heartbeat failed")).finally(() => { heartbeatBusy = false; });
}
const beat = setInterval(tick, 30000);
tick();
let lastRecovery = 0;
let backoff = 5000;
log("Helper started");
try {
  for (;;) {
    try {
      // No job is in progress here. Repeat recovery after interrupted final writes.
      if (!lastRecovery || Date.now() - lastRecovery >= 300_000) {
        await startup(); lastRecovery = Date.now();
      }
      const worked = await pending();
      backoff = 5000;
      if (!worked) {
        if (process.argv.includes("--once")) break;
        await delay(5000);
      }
    } catch {
      log("Helper operation failed; retrying after connection or service error");
      if (process.argv.includes("--once")) { process.exitCode = 1; break; }
      await delay(backoff);
      backoff = Math.min(backoff * 2, 60000);
    }
  }
} finally { clearInterval(beat); }
