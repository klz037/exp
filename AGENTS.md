Project: "Quest Panel", a Chrome extension (Manifest V3) that shows a gamified progress sidebar next to Google Calendar.

Goal: reduce overwhelm. Show progress and the next step, not the full backlog.

Stack: React + TypeScript + Vite, built as an MV3 extension (use CRXJS or Plasmo, pick the simpler one and tell me why). Chrome Side Panel API for the UI. No backend.

Data:
- Source of truth for tasks: Google Tasks API (tasks + subtasks via the `parent` field).
- Today's events: Google Calendar API (read-only).
- Game state (XP, level, streak, settings): chrome.storage.sync.

Design principles:
- Today view first; the rest of the backlog is collapsed by default.
- Never show red/overdue counters or guilt language.
- Streaks must be forgiving (weekly consistency or rest-day tokens).
- Animations short and optional (a "quiet mode" toggle).

Working style: make small commits, keep files small and typed, and after each step tell me exactly how to load and test the extension.