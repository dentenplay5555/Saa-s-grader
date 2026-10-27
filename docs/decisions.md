# Decisions

- Stack: Express + better-sqlite3 (dev/MVP). Postgres for prod.
- Job queue: SQLite jobs table (emulate SKIP LOCKED via transaction).
- Judge: FakeJudgeAdapter for MVP; real adapter in Task 6.
- Out-of-scope removal: Stripped similarity detection (plagiarism), contest/scoreboard, and learning track tables from schema.sql to strictly comply with GUIDE.md rules.
- Task 1 Schema: Enforced check constraints on statuses/verdicts, added engine_version, started_at, created_at, and index for reconciler on `judgings(status, started_at)`.
