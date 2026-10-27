-- TOI Grader & DSA Academy - Appendix Features Schema
-- Covers Tasks 14 (Plagiarism Detection), 16 (Local Bridge), and 17 (User Settings)
-- Kept in separate schema migration to maintain strict MVP Task 1 boundary isolation.

CREATE TABLE IF NOT EXISTS similarity_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('problem', 'contest')),
  scope_id INTEGER NOT NULL,
  tool TEXT NOT NULL DEFAULT 'dsa-plagiarism-v1',
  tool_version TEXT NOT NULL DEFAULT '1.0.0',
  threshold REAL NOT NULL DEFAULT 0.75,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED'))
);

CREATE TABLE IF NOT EXISTS similarity_pairs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id INTEGER NOT NULL REFERENCES similarity_reports(id),
  submission_a INTEGER NOT NULL REFERENCES submissions(id),
  submission_b INTEGER NOT NULL REFERENCES submissions(id),
  score REAL NOT NULL,
  matched_tokens INTEGER NOT NULL DEFAULT 0,
  reviewed_status TEXT NOT NULL DEFAULT 'pending' CHECK (reviewed_status IN ('pending', 'cleared', 'confirmed')),
  reviewed_by INTEGER REFERENCES users(id),
  note TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_similarity_pairs_report ON similarity_pairs(report_id);

CREATE TABLE IF NOT EXISTS bridge_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  token TEXT NOT NULL UNIQUE,
  device_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_bridge_tokens_token ON bridge_tokens(token);

CREATE TABLE IF NOT EXISTS user_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  key TEXT NOT NULL,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, key)
);
