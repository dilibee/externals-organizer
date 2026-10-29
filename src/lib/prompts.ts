// Prompts for the AI bridge. Ported from the artifact; the app copies these to claude.ai / ChatGPT,
// and Claude Code uses the same rules when it adapts the plan through scripts/apply.ts.
import { DOW, addDays, fmtMin, nice } from "./dates";
import { KIND, catchup, dayDoneCount, dayList, dayMinutes, daysOn, doneMap, openExtras, paceSignals, trackList } from "./planner";
import type { Day, Store, Track, WithId } from "./types";

export function learnerBlock(t: Track) {
  return `About the learner (Dilibe): ${t.level || ""}\nHow to teach him: ${t.learner || "Step by step, small pieces he writes himself, hints before answers."}`;
}

export function sourcesBlock(s: Store, tid: string) {
  const files = s.sources[tid]?.files || [];
  if (!files.length) return "";
  let out = "\n\nPROJECT SOURCE FILES (the real code for this track; base every answer about the project on these, cite file names and quote the relevant lines, never guess or say you can't see the code):\n", used = 0;
  for (const f of files) {
    const body = String(f.content || "");
    if (used + body.length > 150000) { out += `\n(${f.name} omitted: too long)\n`; continue; }
    used += body.length; out += `\n=== ${f.name} ===\n${body}\n`;
  }
  return out;
}

const dayOfTotal = (s: Store, d: WithId<Day>) => `Day ${d.dayNum} of ${dayList(s).filter(x => x.trackId === d.trackId).length}`;

export function dayContext(s: Store, d: WithId<Day>, today: string) {
  const t = s.tracks[d.trackId]; const dm = doneMap(s, d.id);
  const lesson = (d.lessonFull || d.lesson || "").slice(0, 9000);
  return `Track: ${t.name}. Goal: ${t.goal || ""}\n${learnerBlock(t)}\nToday is ${nice(today)}. This is ${dayOfTotal(s, d)} (${nice(d.date)}): "${d.title}".\nTasks:\n${(d.tasks || []).map(x => `- [${dm[x.id] ? "x" : " "}] ${x.text} (${x.min} min)${x.url ? " " + x.url : ""}`).join("\n")}\n\nLesson for this day:\n${lesson}${sourcesBlock(s, d.trackId)}`;
}

export const CHAT_RULES = `You are the study coach inside Dilibe's planner. Rules:
- When project source files are included below, answer from that real code and point to file names and lines.
- Teach in C++ unless he asks otherwise (or the track's code is in another language). Be rigorous and concrete; short paragraphs; code in fenced blocks.
- For a practice problem, never hand over a full solution unless he explicitly writes "show solution". Give the smallest next step or one hint at a time, then ask him to write that piece.
- When he pastes code, find the bug by pointing at the line and asking a guiding question first; mention which item of his pre-submit checklist it matches if any (= vs ==, < vs <=, 0<=x<n, indexing an empty vector, if/else-if order, read-before-write, long long / % MOD).
- For quizzes, ask one question at a time; for multiple choice, vary which letter is correct and don't make the longest option the answer.
- Format with Markdown: ## headings, - lists, \`code\`, fenced code blocks, **bold**.`;

export function chatPrompt(s: Store, d: WithId<Day>, today: string, turns: { role: string; content: string }[], question: string) {
  const history = turns.slice(-10).map(m => `${m.role === "user" ? "Dilibe" : "Coach"}: ${m.content}`).join("\n\n");
  return `${CHAT_RULES}\n\n${dayContext(s, d, today)}\n\n${history ? `Conversation so far:\n${history}\n\n` : ""}Dilibe's question:\n${question}`;
}

export function expandPrompt(s: Store, d: WithId<Day>) {
  const t = s.tracks[d.trackId];
  return `Write the full lesson for one day of a self-study plan, in Markdown.\n${learnerBlock(t)}\nTrack: ${t.name}. Day: "${d.title}" (${KIND[d.kind] || "Lesson"}, about ${fmtMin(dayMinutes(d))} total including practice).\nTasks he will do after reading:\n${(d.tasks || []).map(x => "- " + x.text).join("\n")}\n\nShort outline to expand:\n${d.lesson}${sourcesBlock(s, d.trackId)}\n\nRequirements:\n- Teach every concept the tasks need, step by step, with small examples (from the project's real code when source files are given) that are NOT solutions to the listed practice problems.\n- Use ## for sections, fenced code blocks, short paragraphs. About 900–1400 words.\n- End with 2–3 self-check questions, each written as:\n:::hint Question text\nanswer\n:::\n- Reply with only the lesson Markdown.`;
}

export const PLAN_SHAPE = `Reply with only JSON of this shape:
{"short": "2-12 char label", "goal": "one sentence", "milestones": [{"date":"YYYY-MM-DD","label":"..."}],
 "days": [{"id":"existing day id to replace it (omit for a new day)","date":"YYYY-MM-DD","title":"...","kind":"lesson|mock|assessment|review|project","focus":"few words",
   "lesson":"Markdown, 120-250 words: what to learn today, with one small code example if relevant",
   "tasks":[{"text":"concrete task","min":20,"url":"https://... (optional, only real well-known URLs such as official docs or leetcode.com/problems/<slug>/)"}],
   "resources":[{"label":"...","url":"https://..."}]}],
 "remove": ["ids of upcoming days to drop (optional)"],
 "suggestions": [{"text":"something worth learning next","why":"one line","min":20}]}
Each day's task minutes must add up to that day's minutes budget. Only include URLs you are confident exist.`;

const LOAD_RULE = `Load rule: at most 3 tracks on any day; the top-ranked track gets the largest share; never two brand-new complex topics on the same day; mix review of weak spots into new material.`;

export function hoursLine(s: Store) {
  const h = s.settings.main?.hours || {};
  return [1, 2, 3, 4, 5, 6, 0].map(i => `${DOW[i]} ${Number(h[i] ?? 0)} min`).join(", ");
}
export function busyLine(s: Store, from: string, to: string, exceptTrack?: string) {
  const out: string[] = [];
  for (let x = from; x <= to; x = addDays(x, 1)) {
    const items = daysOn(s, x).filter(d => d.trackId !== exceptTrack);
    const m = items.reduce((a, d) => a + dayMinutes(d), 0);
    const o = s.settings.main?.overrides?.[x];
    if (m || o != null) out.push(`${x}: ${m} min already planned${o != null ? ` (only ${o} min available that day)` : ""}`);
  }
  return out.join("\n") || "nothing else planned";
}

export interface GoalDraft { name: string; goal: string; level?: string; deadline?: string; mins?: number; paste?: string }
export function draftPrompt(s: Store, f: GoalDraft, today: string) {
  const end = f.deadline && f.deadline < addDays(today, 13) ? f.deadline : addDays(today, 13);
  return `Plan a day-by-day self-study schedule.\nLearner: Dilibe, first-year Computer Engineering student at Waterloo (also taking ECE150, an intro C++ course); prefers rigorous, step-by-step learning in small pieces.\nGoal name: ${f.name}\nWhat he wants to be able to do: ${f.goal}\nCurrent level: ${f.level || "not stated"}\nDeadline: ${f.deadline || "none (ongoing)"}\nMinutes per day for this goal: about ${f.mins || 45}, but never more than his free time.\nHis weekly hours across ALL goals: ${hoursLine(s)}.\nAlready planned for other goals:\n${busyLine(s, today, end)}\n${f.paste ? `Earlier plan he wants to build from (continue from where he is, don't repeat what he finished):\n${String(f.paste).slice(0, 12000)}\n` : ""}Plan dates ${today} to ${end}. If a deadline exists, put it in milestones and leave a review day before it. Don't use "id" or "remove" (this is a new track).\n${LOAD_RULE}\n${PLAN_SHAPE}`;
}

function trackHistory(s: Store, tid: string) {
  const mine = dayList(s).filter(d => d.trackId === tid).sort((a, b) => (a.date < b.date ? -1 : 1));
  return mine.slice(-21).map(d => {
    const f = s.feedback[d.id];
    return `${d.id} ${d.date} Day ${d.dayNum}: ${d.title} (${dayDoneCount(s, d)}/${(d.tasks || []).length} tasks done)${f ? ` — felt ${f.rating === "right" ? "about right" : "too " + f.rating}, ${f.actualMin} of ${dayMinutes(d)} min${f.needsWork.length ? `, needs work: ${f.needsWork.join("; ")}` : ""}${f.comment ? `, note: "${f.comment}"` : ""}` : ""}`;
  }).join("\n");
}

export function adaptPrompt(s: Store, tid: string, today: string, note = "", days = 7) {
  const t = s.tracks[tid]; const end = addDays(today, days - 1);
  const behind = catchup(s, today).filter(d => d.trackId === tid).map(d => `${d.id} ${d.date}: ${d.title}`).join("\n") || "none";
  const extras = openExtras(s).filter(x => x.trackId === tid).map(x => `- ${x.text} (${x.source})`).join("\n") || "none";
  const upcoming = dayList(s).filter(d => d.trackId === tid && d.date >= today && d.date <= end).map(d => `${d.id} ${d.date}: ${d.title} — ${(d.tasks || []).map(x => x.text).join(" | ")}`).join("\n") || "none";
  const pace = paceSignals(s, tid);
  return `Adapt an existing self-study track for the next ${days} days based on how it's going.\nTrack: ${t.name} (id ${tid}). Goal: ${t.goal}\n${learnerBlock(t)}\nUpcoming deadlines: ${(t.milestones || []).filter(m => m.date >= today).map(m => `${m.date} ${m.label}`).join("; ") || "none"}\nRecent days, completion and his check-ins:\n${trackHistory(s, tid)}\nPace: ${pace ? pace.notes.join("; ") || "on pace" : "no check-ins yet"}\nUnfinished past days:\n${behind}\nThings he flagged to revisit:\n${extras}\nCurrently planned ${today} to ${end} (replace these by id, or remove them):\n${upcoming}\nHis note: ${note || "none"}\nHis weekly hours across ALL goals: ${hoursLine(s)}.\nAlready planned for other tracks:\n${busyLine(s, today, end, tid)}\nRewrite the days from ${today} to ${end}: harder if days felt too easy, smaller steps and more review if too hard, fold in the flagged weak spots, and keep deadline prep intact. Use "id" to replace an existing day; keep "milestones": [] unless adding one.\n${LOAD_RULE}\n${PLAN_SHAPE}`;
}

export interface InterviewInfo { company: string; role: string; date: string; time?: string; type: string; posting?: string; notes?: string; trackId: string }
export function interviewPrompt(s: Store, f: InterviewInfo, today: string) {
  const t = s.tracks[f.trackId];
  return `Dilibe has an interview coming up. First research it, then plan his prep.\nCompany: ${f.company}\nRole: ${f.role}\nDate: ${f.date}${f.time ? " at " + f.time : ""} (today is ${today})\nType: ${f.type}\n${f.posting ? `Posting:\n${f.posting.slice(0, 6000)}\n` : ""}${f.notes ? `His notes: ${f.notes}\n` : ""}\n1. Research (search the web if you can): ${f.company}'s interview/OA process for this kind of role, the platform (HackerRank, CodeSignal, etc.), typical question style and difficulty, and behavioral themes (company values). Write a short summary for him first.\n2. Then plan prep days from ${today} to ${addDays(f.date, -1)} in track "${t?.name}" (id ${f.trackId}), fitting his free time, plus an assessment day on ${f.date} (warm-up, setup checklist, take it) and a debrief day after.\n${t ? learnerBlock(t) : ""}\nHis weekly hours: ${hoursLine(s)}.\nAlready planned:\n${busyLine(s, today, f.date)}\nAfter the summary, give the plan as a JSON block, with the interview in "milestones".\n${LOAD_RULE}\n${PLAN_SHAPE}`;
}

export const trackNames = (s: Store) => trackList(s).map(t => `${t.short || t.name}`);
