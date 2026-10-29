// Pull the live plan from Supabase into .local/ so Claude Code can read it before adapting.
//   .local/snapshot.json  full data (minus chat logs)
//   .local/snapshot.md    readable summary: hours, deadlines, per-track history with check-ins, catch-up, requests
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, loadStore } from "./common";
import { addDays, todayISO } from "../src/lib/dates";
import { activeTracks, catchup, dayDoneCount, dayList, dayMinutes, openExtras, paceSignals, plannedOn, availMin, trackList, upcomingMilestones } from "../src/lib/planner";
import { hoursLine } from "../src/lib/prompts";

const s = await loadStore();
const today = process.argv.find(a => /^\d{4}-\d{2}-\d{2}$/.test(a)) || todayISO();
const L: string[] = [`# Plan snapshot ${today}`, "", `Hours: ${hoursLine(s)}`];
const ov = Object.entries(s.settings.main?.overrides || {}).filter(([d]) => d >= today);
if (ov.length) L.push(`Overrides: ${ov.map(([d, m]) => `${d} ${m} min`).join(", ")}`);
L.push("", "## Load, next 14 days");
for (let i = 0; i < 14; i++) { const d = addDays(today, i); L.push(`- ${d}: ${plannedOn(s, d)} / ${availMin(s.settings.main, d)} min`); }
L.push("", "## Deadlines", ...upcomingMilestones(s, today, 20).map(m => `- ${m.date} [${m.track.id}] ${m.label}`));
L.push("", "## Tracks (rank order)");
for (const t of trackList(s)) {
  L.push("", `### ${t.id}: ${t.name}${t.paused ? " (PAUSED)" : ""}`, `Goal: ${t.goal || ""}`, `Level: ${t.level || ""}`);
  const pace = paceSignals(s, t.id); if (pace) L.push(`Pace (last ${pace.n} check-ins): ${JSON.stringify(pace.counts)}, actual/planned ${pace.ratio.toFixed(2)}${pace.notes.length ? " — " + pace.notes.join("; ") : ""}`);
  for (const d of dayList(s).filter(d => d.trackId === t.id).sort((a, b) => (a.date < b.date ? -1 : 1))) {
    const f = s.feedback[d.id];
    L.push(`- ${d.id} ${d.date} ${d.kind} "${d.title}" ${dayDoneCount(s, d)}/${d.tasks.length} done, ${dayMinutes(d)} min${f ? ` | check-in: ${f.rating}, ${f.actualMin} min${f.needsWork.length ? ", needs work: " + f.needsWork.join("; ") : ""}${f.comment ? `, "${f.comment}"` : ""}` : ""}`);
  }
}
L.push("", "## Catch-up (unfinished past days)", ...catchup(s, today).map(d => `- ${d.id} ${d.date} ${d.title}`));
L.push("", "## Open extras", ...openExtras(s).map(x => `- ${x.id} [${x.trackId || "-"}] ${x.source}${x.planFor ? " for " + x.planFor : ""}: ${x.text} (${x.min} min)`));
L.push("", "## Pending requests", ...Object.entries(s.requests).filter(([, r]) => r.status === "pending").map(([id, r]) => `- ${id} ${r.type}: ${JSON.stringify(r.payload)}`));
L.push("", "## Open suggestions", ...Object.entries(s.suggestions).filter(([, x]) => x.status === "new").map(([id, x]) => `- ${id} [${x.trackId}] ${x.text}`));
L.push("", `Active tracks: ${activeTracks(s).map(t => t.id).join(", ")}`);

mkdirSync(join(ROOT, ".local"), { recursive: true });
writeFileSync(join(ROOT, ".local", "snapshot.json"), JSON.stringify({ ...s, chats: {} }, null, 1));
writeFileSync(join(ROOT, ".local", "snapshot.md"), L.join("\n"));
console.log(`Wrote .local/snapshot.md and .local/snapshot.json (${Object.keys(s.days).length} days, ${Object.keys(s.feedback).length} check-ins)`);
