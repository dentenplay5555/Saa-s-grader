# Decisions

- Stack: Express + better-sqlite3 (dev/MVP). Postgres for prod.
- Job queue: SQLite jobs table (emulate SKIP LOCKED via transaction).
- Judge: FakeJudgeAdapter for MVP; real adapter in Task 6.
- Out-of-scope removal: Stripped similarity detection (plagiarism), contest/scoreboard, and learning track tables from schema.sql to strictly comply with GUIDE.md rules.
- Task 1 Schema: Enforced check constraints on statuses/verdicts, added engine_version, started_at, created_at, and index for reconciler on `judgings(status, started_at)`.
- Task 13 (Hosted Judge): Judge0Adapter created for Hosted/Container variants. Subtask scoring stays server-side via `scoring.ts`; the adapter returns per-test-case verdicts only. Hybrid approach lets us start hosted then migrate to self-host behind the same `JudgeAdapter` interface.
- Task 14 (Plagiarism): Token-level k-gram Jaccard similarity engine (`PlagiarismEngine`). Runs as a batch job per problem, not real-time. Teacher reviews flagged pairs; no automatic punishment. Appendix schema (`similarity_reports`, `similarity_pairs`) kept in `schema.appendix.sql` to isolate from core MVP. Static `CodeAnalyzer` provides pedagogical hints without leaking hidden tests.
- Task 15 (Offline): PWA Level 1 via `manifest.webmanifest` + `sw.js` service worker. Cache-first for static assets, network-first for public curriculum API. Offline submissions queued in `OfflineStore` outbox (localStorage) and synced via idempotency key on reconnect. Never caches hidden test data.
- Task 16 (Bridge): `LocalBridgeDaemon` on `127.0.0.1` only. Token pairing with 15-min expiry. Path traversal guard via slug regex + `path.resolve` check. Safe compile/run via `execFile` (no shell interpolation). `GET /api/problems/:slug/package` returns starter code and public samples only.
- Task 17 (Editor Layout): Split View / Focus Mode toggle via CSS class on single container. Monaco instance never remounted across mode switches (preserves undo/cursor). Problem statement accessible via slide-over drawer in Focus Mode (`Ctrl+Shift+P`). Font size persisted in `user_settings` table and localStorage. Keyboard shortcut `Esc` closes drawer without trapping focus.
- Task 18 (Phase Plan): Updated phase roadmap integrates all appendix features. Phase 1 adds Hosted Judge option, Phase 2 adds editor dual modes, Phase 3 adds PWA Level 1, Phase 4 adds plagiarism batch + static analysis hints, Phase 5 adds bridge + extension, Phase 6+ adds WASM runner and timeline telemetry.
