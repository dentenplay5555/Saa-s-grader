import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { initDb, seedDb, SCHEMA_SQL_PATH } from '../src/server/db.js';
import fs from 'node:fs';

describe('Task 1 - Schema & Constraints', () => {
  let testDb: Database.Database;

  beforeEach(() => {
    // In-memory database for clean isolated tests
    testDb = new Database(':memory:');
    testDb.pragma('foreign_keys = ON');
    initDb(testDb);
  });

  it('initializes schema without errors and executes up/down migration cycle', () => {
    // Check tables exist
    const tables = testDb
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all()
      .map((r: any) => r.name);

    const expectedTables = [
      'users',
      'languages',
      'problems',
      'problem_versions',
      'test_packages',
      'submissions',
      'judgings',
      'test_results',
      'jobs',
      'audit_logs',
    ];

    for (const t of expectedTables) {
      expect(tables).toContain(t);
    }

    // Out-of-scope tables must NOT exist
    const forbiddenTables = [
      'similarity_reports',
      'similarity_pairs',
      'contests',
      'contest_problems',
      'contest_submissions',
      'lessons',
      'tracks',
      'track_items',
      'lesson_progress',
      'user_settings',
    ];

    for (const ft of forbiddenTables) {
      expect(tables).not.toContain(ft);
    }

    // Down migration / Drop all tables
    for (const t of expectedTables.reverse()) {
      testDb.exec(`DROP TABLE IF EXISTS ${t}`);
    }

    const remaining = testDb
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all();
    expect(remaining.length).toBe(0);

    // Re-up migration
    initDb(testDb);
    const restored = testDb
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all();
    expect(restored.length).toBe(expectedTables.length);
  });

  it('seeds default data properly', () => {
    seedDb(testDb);

    const users = testDb.prepare('SELECT email, role FROM users').all() as any[];
    expect(users).toHaveLength(2);
    expect(users.find(u => u.role === 'admin')?.email).toBe('admin@local');
    expect(users.find(u => u.role === 'student')?.email).toBe('student@local');

    const langs = testDb.prepare('SELECT name, flags FROM languages').all() as any[];
    expect(langs.some(l => l.name === 'C++17')).toBe(true);

    const problems = testDb.prepare('SELECT slug, current_version_id FROM problems').all() as any[];
    expect(problems.find(p => p.slug === 'a-plus-b')?.current_version_id).toBeTruthy();
  });

  it('enforces UNIQUE(user_id, idempotency_key) constraint on submissions', () => {
    seedDb(testDb);

    const student = testDb.prepare("SELECT id FROM users WHERE role = 'student'").get() as any;
    const admin = testDb.prepare("SELECT id FROM users WHERE role = 'admin'").get() as any;
    const problem = testDb.prepare("SELECT current_version_id FROM problems WHERE slug = 'a-plus-b'").get() as any;

    const insertSub = testDb.prepare(`
      INSERT INTO submissions (user_id, problem_version_id, language, source_code, status, idempotency_key)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    // First insert succeeds
    insertSub.run(student.id, problem.current_version_id, 'C++17', 'int main(){}', 'QUEUED', 'key-123');

    // Duplicate (same user, same idempotency key) MUST fail
    expect(() => {
      insertSub.run(student.id, problem.current_version_id, 'C++17', 'int main(){}', 'QUEUED', 'key-123');
    }).toThrow(/UNIQUE constraint failed: submissions\.user_id, submissions\.idempotency_key/);

    // Different idempotency key for same user succeeds
    expect(() => {
      insertSub.run(student.id, problem.current_version_id, 'C++17', 'int main(){}', 'QUEUED', 'key-456');
    }).not.toThrow();

    // Same idempotency key for DIFFERENT user succeeds
    expect(() => {
      insertSub.run(admin.id, problem.current_version_id, 'C++17', 'int main(){}', 'QUEUED', 'key-123');
    }).not.toThrow();
  });

  it('enforces enum status and check constraints', () => {
    seedDb(testDb);
    const student = testDb.prepare("SELECT id FROM users WHERE role = 'student'").get() as any;
    const problem = testDb.prepare("SELECT current_version_id FROM problems WHERE slug = 'a-plus-b'").get() as any;

    // Invalid submission status
    expect(() => {
      testDb.prepare(`
        INSERT INTO submissions (user_id, problem_version_id, language, source_code, status, idempotency_key)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(student.id, problem.current_version_id, 'C++17', 'code', 'INVALID_STATUS', 'key-999');
    }).toThrow(/CHECK constraint failed/);

    // Valid submission insert
    const sub = testDb.prepare(`
      INSERT INTO submissions (user_id, problem_version_id, language, source_code, status, idempotency_key)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(student.id, problem.current_version_id, 'C++17', 'code', 'QUEUED', 'key-valid');

    const subId = Number(sub.lastInsertRowid);

    // Invalid judging status
    expect(() => {
      testDb.prepare(`
        INSERT INTO judgings (submission_id, attempt, status, engine_name)
        VALUES (?, ?, ?, ?)
      `).run(subId, 1, 'UNKNOWN_STATUS', 'fake');
    }).toThrow(/CHECK constraint failed/);

    // Invalid verdict
    expect(() => {
      testDb.prepare(`
        INSERT INTO judgings (submission_id, attempt, status, verdict, engine_name)
        VALUES (?, ?, ?, ?, ?)
      `).run(subId, 1, 'DONE', 'INVALID_VERDICT', 'fake');
    }).toThrow(/CHECK constraint failed/);

    // Valid judging insert
    const judging = testDb.prepare(`
      INSERT INTO judgings (submission_id, attempt, status, verdict, engine_name, engine_version, started_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(subId, 1, 'DONE', 'AC', 'fake', '1.0', new Date().toISOString());

    const judgingId = Number(judging.lastInsertRowid);

    // Invalid test_result verdict
    expect(() => {
      testDb.prepare(`
        INSERT INTO test_results (judging_id, group_name, test_index, verdict)
        VALUES (?, ?, ?, ?)
      `).run(judgingId, 'g1', 0, 'BAD_VERDICT');
    }).toThrow(/CHECK constraint failed/);
  });

  it('verifies indexes required for reconciler and queue', () => {
    const indexes = testDb
      .prepare("SELECT name FROM sqlite_master WHERE type='index'")
      .all()
      .map((r: any) => r.name);

    expect(indexes).toContain('idx_judgings_status_started');
    expect(indexes).toContain('idx_jobs_state_run_after');
    expect(indexes).toContain('idx_test_results_judging');
  });

  it('enforces foreign key constraints', () => {
    expect(() => {
      testDb.prepare(`
        INSERT INTO submissions (user_id, problem_version_id, language, source_code, status, idempotency_key)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(999999, 999999, 'C++17', 'code', 'QUEUED', 'fk-fail');
    }).toThrow(/FOREIGN KEY constraint failed/);
  });
});
