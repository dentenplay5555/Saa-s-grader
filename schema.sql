-- TOI Grader - Core Schema (Task 1: Foundation + Schema)
-- Adheres strictly to GUIDE.md and SPEC.md MVP architecture.

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('student','admin'))
);

CREATE TABLE IF NOT EXISTS languages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  compiler_version TEXT NOT NULL,
  flags TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS problems (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  current_version_id INTEGER
);

CREATE TABLE IF NOT EXISTS problem_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  problem_id INTEGER NOT NULL REFERENCES problems(id),
  statement_md TEXT NOT NULL,
  time_limit_ms INTEGER NOT NULL,
  memory_limit_mb INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS test_packages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  problem_version_id INTEGER NOT NULL REFERENCES problem_versions(id),
  manifest TEXT NOT NULL,
  checksum TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  problem_version_id INTEGER NOT NULL REFERENCES problem_versions(id),
  language TEXT NOT NULL,
  source_code TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('QUEUED','COMPILING','RUNNING','DONE','JUDGE_ERROR')),
  idempotency_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS judgings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id INTEGER NOT NULL REFERENCES submissions(id),
  attempt INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('QUEUED','COMPILING','RUNNING','DONE','JUDGE_ERROR')),
  verdict TEXT CHECK (verdict IS NULL OR verdict IN ('AC','WA','TLE','MLE','RE','CE','OLE','JUDGE_ERROR','PARTIAL','SKIPPED')),
  score INTEGER,
  max_score INTEGER,
  runtime_ms INTEGER,
  memory_kb INTEGER,
  engine_name TEXT NOT NULL,
  engine_version TEXT,
  error_message TEXT,
  started_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Index for reconciler / watchdog monitoring stale judgings
CREATE INDEX IF NOT EXISTS idx_judgings_status_started ON judgings(status, started_at);
CREATE INDEX IF NOT EXISTS idx_judgings_submission ON judgings(submission_id);

CREATE TABLE IF NOT EXISTS test_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  judging_id INTEGER NOT NULL REFERENCES judgings(id),
  group_name TEXT NOT NULL,
  test_index INTEGER NOT NULL,
  verdict TEXT NOT NULL CHECK (verdict IN ('AC','WA','TLE','MLE','RE','CE','OLE','JUDGE_ERROR','PARTIAL','SKIPPED')),
  runtime_ms INTEGER,
  memory_kb INTEGER
);

CREATE INDEX IF NOT EXISTS idx_test_results_judging ON test_results(judging_id);

CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  judging_id INTEGER NOT NULL REFERENCES judgings(id),
  state TEXT NOT NULL CHECK (state IN ('QUEUED','CLAIMED','DONE','DEAD_LETTER')),
  locked_by TEXT,
  locked_at TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  run_after TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_jobs_state_run_after ON jobs(state, run_after);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  detail TEXT
);
