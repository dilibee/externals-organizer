// Apply a plan JSON (same shape as the app's AI bridge) to Supabase.
//   npm run apply -- <plan.json> [--track <id>] [--today YYYY-MM-DD] [--resolve <requestId>] [--yes]
// Without --yes it only prints what would change. Past days and checked tasks are never touched.
import { readFileSync } from "node:fs";
import { loadStore, remove, upsert } from "./common";
import { todayISO } from "../src/lib/dates";
import { parsePlan, planChanges } from "../src/lib/validate";

const args = process.argv.slice(2);
const opt = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const file = args.find((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
if (!file) { console.error("Usage: npm run apply -- <plan.json> [--track id] [--today YYYY-MM-DD] [--resolve requestId] [--yes]"); process.exit(1); }

const s = await loadStore();
const plan = parsePlan(readFileSync(file, "utf8"));
const today = opt("--today") || todayISO();
const ch = planChanges(s, plan, today, opt("--track") || plan.trackId);

console.log(ch.summary.map(x => "  " + x).join("\n") || "  (nothing to change)");
if (ch.skipped.length) console.log("Skipped:\n" + ch.skipped.map(x => "  " + x).join("\n"));
if (!args.includes("--yes")) { console.log("\nDry run. Re-run with --yes to write."); process.exit(0); }

const rows = ch.writes.map(w => ({ collection: w.collection, id: w.id, data: w.merge ? { ...((s as any)[w.collection][w.id] || {}), ...w.data } : w.data }));
const req = opt("--resolve");
if (req && s.requests[req]) rows.push({ collection: "requests", id: req, data: { ...s.requests[req], status: "done", result: ch.summary.join("\n") } });
await upsert(rows);
await remove(ch.deletes);
console.log(`\nWrote ${rows.length} documents, removed ${ch.deletes.length}.`);
