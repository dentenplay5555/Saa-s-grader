-- TOI Grader & DSA Academy - Unified Schema
-- Enforces Core Grader MVP + Full Curriculum & Learning System

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('student','admin')),
  password_hash TEXT
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
  memory_limit_mb INTEGER NOT NULL,
  difficulty TEXT NOT NULL DEFAULT 'D1' CHECK (difficulty IN ('D0','D1','D2','D3','D4','D5','D6')),
  tags_json TEXT NOT NULL DEFAULT '[]',
  hints_json TEXT NOT NULL DEFAULT '[]',
  editorial_md TEXT,
  solution_cpp17 TEXT,
  solution_c17 TEXT,
  provenance TEXT DEFAULT 'DSA Academy Original'
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

-- ====================================================================
-- Curriculum & Learning Content Architecture (Stages 0 - 7)
-- ====================================================================

CREATE TABLE IF NOT EXISTS tracks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS lessons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  stage INTEGER NOT NULL CHECK (stage BETWEEN 0 AND 7),
  track_compatibility TEXT NOT NULL CHECK (track_compatibility IN ('beginner', 'cp', 'both')),
  topic TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  difficulty TEXT NOT NULL CHECK (difficulty IN ('D0','D1','D2','D3','D4','D5','D6')),
  prerequisites_json TEXT NOT NULL DEFAULT '[]',
  learning_objectives_json TEXT NOT NULL DEFAULT '[]',
  content_json TEXT NOT NULL,
  code_examples_json TEXT NOT NULL DEFAULT '[]',
  mastery_criteria_json TEXT NOT NULL DEFAULT '[]',
  estimated_minutes INTEGER NOT NULL DEFAULT 45,
  version INTEGER NOT NULL DEFAULT 1,
  published INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_lessons_stage ON lessons(stage);
CREATE INDEX IF NOT EXISTS idx_lessons_track ON lessons(track_compatibility);

CREATE TABLE IF NOT EXISTS track_lessons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  track_id INTEGER NOT NULL REFERENCES tracks(id),
  lesson_id INTEGER NOT NULL REFERENCES lessons(id),
  position INTEGER NOT NULL,
  UNIQUE(track_id, lesson_id)
);

CREATE TABLE IF NOT EXISTS lesson_problems (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lesson_id INTEGER NOT NULL REFERENCES lessons(id),
  problem_id INTEGER NOT NULL REFERENCES problems(id),
  role TEXT NOT NULL CHECK (role IN ('guided', 'practice', 'challenge')),
  position INTEGER NOT NULL,
  UNIQUE(lesson_id, problem_id)
);

CREATE TABLE IF NOT EXISTS lesson_progress (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  lesson_id INTEGER NOT NULL REFERENCES lessons(id),
  status TEXT NOT NULL CHECK (status IN ('not_started', 'in_progress', 'completed')),
  last_accessed_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  UNIQUE(user_id, lesson_id)
);
