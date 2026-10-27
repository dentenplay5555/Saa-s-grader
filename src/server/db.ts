import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

export const SCHEMA_SQL_PATH = path.join(process.cwd(), 'schema.sql');
const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data.db');

export function initDb(targetDb: Database.Database = db) {
  const schema = fs.readFileSync(SCHEMA_SQL_PATH, 'utf8');
  targetDb.exec(schema);
}

export function seedDb(targetDb: Database.Database = db) {
  const userCount = targetDb.prepare('SELECT COUNT(*) AS c FROM users').get() as any;
  if (userCount.c === 0) {
    targetDb.prepare("INSERT INTO users (email, name, role) VALUES (?,?,?)").run('admin@local', 'Admin', 'admin');
    targetDb.prepare("INSERT INTO users (email, name, role) VALUES (?,?,?)").run('student@local', 'Student', 'student');
    targetDb.prepare("INSERT INTO languages (name, compiler_version, flags, enabled) VALUES (?,?,?,1)").run('C++17', 'g++ 13', '-O2 -std=c++17');
    const pInfo = targetDb.prepare("INSERT INTO problems (slug, title) VALUES (?,?)").run('a-plus-b', 'A + B');
    const vInfo = targetDb.prepare("INSERT INTO problem_versions (problem_id, statement_md, time_limit_ms, memory_limit_mb) VALUES (?,?,?,?)").run(pInfo.lastInsertRowid, '# A + B\nRead two integers, print their sum.', 1000, 256);
    targetDb.prepare("UPDATE problems SET current_version_id = ? WHERE id = ?").run(vInfo.lastInsertRowid, pInfo.lastInsertRowid);
  }
}

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

initDb(db);
seedDb(db);

export function resetDb(targetDb: Database.Database = db) {
  targetDb.exec(`
    DELETE FROM audit_logs;
    DELETE FROM jobs;
    DELETE FROM test_results;
    DELETE FROM judgings;
    DELETE FROM submissions;
    DELETE FROM test_packages;
    DELETE FROM problem_versions;
    DELETE FROM problems;
    DELETE FROM languages;
    DELETE FROM users;
  `);
}
