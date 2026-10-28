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
