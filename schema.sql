CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('student','admin'))
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

CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  problem_version_id INTEGER NOT NULL REFERENCES problem_versions(id),
  language TEXT NOT NULL,
  source_code TEXT NOT NULL,
  status TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(user_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS judgings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id INTEGER NOT NULL REFERENCES submissions(id),
  attempt INTEGER NOT NULL,
  status TEXT NOT NULL,
  verdict TEXT,
  score INTEGER,
  max_score INTEGER,
  runtime_ms INTEGER,
  memory_kb INTEGER,
  engine_name TEXT NOT NULL,
  error_message TEXT
);

CREATE TABLE IF NOT EXISTS test_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  judging_id INTEGER NOT NULL REFERENCES judgings(id),
  group_name TEXT NOT NULL,
  test_index INTEGER NOT NULL,
  verdict TEXT NOT NULL,
  runtime_ms INTEGER,
  memory_kb INTEGER
);
