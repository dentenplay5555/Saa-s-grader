import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data.db');

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schema = fs.readFileSync(path.join(process.cwd(), 'schema.sql'), 'utf8');
db.exec(schema);

export function resetDb() {
  db.exec('DELETE FROM test_results; DELETE FROM judgings; DELETE FROM submissions; DELETE FROM problem_versions; DELETE FROM problems; DELETE FROM users;');
}
