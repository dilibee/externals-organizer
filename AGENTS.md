# Externals Organizer

Study planner for Dilibe's self-study tracks outside of classes (C++, AWS, Python, Git, JavaScript, Rust, EventFlow project, drop-ins). Breaks each goal into dated days of tasks and lessons, with a Today view, Week view, Goals & deadlines, Catch-up, streaks, and a per-lesson AI tutor chat.

## Where this came from
- `original/index.html` is the claude.ai artifact version (https://claude.ai/artifact/7jvvahTdevPcb2J4jvCYKr). It is the reference for features and look; don't edit it.
- `original/data/<collection>/*.json` is the full export of its database (collections: tracks, days, progress, sources, chats, settings). `days` holds the lesson content; `progress` holds what's been checked off.
- The artifact stored data via `window.claude.use("db")` and used Claude itself (the `sample` capability) to generate plans and answer lesson questions. Outside claude.ai those AI features need a real API (Claude API or similar), which costs money.

## Goal
Rebuild it as a standalone app that runs outside claude.ai, keeping the existing features and importing the exported data.

## Rules
- Ask before choosing a stack, hosting, or anything that costs money (APIs, hosting plans).
- Keep the UI working on phone widths and in light/dark mode.

## Stack (v2)
- Vite + React + TypeScript in `src/`. Pure logic lives in `src/lib/` (`planner.ts`, `validate.ts`, `prompts.ts`, `markdown.ts`) and is shared with the Node scripts in `scripts/`.
- Data: Supabase table `docs` (see `scripts/schema.sql`), one row per document, keyed by (user, collection, id). Collections are the artifact's six plus `feedback` (per-day check-ins), `extras` (catch-up items), `requests` (work queued for Claude Code) and `suggestions`.
- Without Supabase env vars the app runs in local mode (localStorage). In dev it seeds from `.local/seed.json` (`npm run seed:local`).
- Live: https://dilibee.github.io/externals-organizer/ (Supabase project `pnnpiretbukbnaejxjsk`). Deploy: GitHub Pages via `.github/workflows/deploy.yml`, with repo variables `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.
- Node is at `C:\Program Files\nodejs` and may not be on PATH; prepend it.

## Study priorities (agreed 2026-10-28)
- Rank: 1 C++ interview prep (primary), 2 DropIn project, 3 AWS, 4 Git, 5 Python (light maintenance: 1-2 short sessions a week, re-solving known problems). Rust and JavaScript paused; EventFlow done.
- Outcomes: pass OAs and coding interviews, resume-ready projects, cloud experience he can describe honestly.
- He also takes ECE150 (intro C++). Don't duplicate it; use those topics as warm-ups.
- Load rule: at most 3 tracks a day, the top-ranked track gets the biggest share, never two brand-new complex topics on one day.
- Hours: 3h on weekdays, 4h on weekends (editable; per-date overrides in `settings.main.overrides`).
- The job-search / co-op hub is a separate app. Out of scope here.

## How to adapt the plan (Claude Code / Codex)
1. `npm run snapshot` writes `.local/snapshot.md` (readable) and `.local/snapshot.json`: hours, load for the next 14 days, deadlines, every day with completion and check-ins, catch-up, extras, pending `requests` and suggestions.
2. Handle pending requests:
   - `adapt`: reshape the next ~7 days of that track.
   - `interview`: research the company's process with web search, add prep days before the date, an assessment day on it and a debrief after.
   - `newTrack`: draft a plan.
   Use check-ins: harder if days felt too easy, smaller steps and review if too hard, and fold in flagged weak spots.
3. Write a plan JSON (shape: `PLAN_SHAPE` in `src/lib/prompts.ts`; multi-track via `"tracks": {id: {...}}` and per-day `trackId`) to `.local/plan-*.json`.
4. `npm run apply -- .local/plan-x.json --track <id> [--resolve <requestId>]` prints a dry-run diff. Show it to Dilibe, then re-run with `--yes`.
   - `apply` never changes past days or checked tasks, keeps day ids when replacing, and renumbers `dayNum` by date.
   - It needs `.env` with `SUPABASE_SERVICE_ROLE_KEY` and `OWNER_USER_ID`.
