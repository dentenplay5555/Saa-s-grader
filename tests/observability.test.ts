import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { initDb, seedDb } from '../src/server/db.js';
import { log, collectMetrics, evaluateAlerts } from '../src/server/observability.js';
import { createJudging } from '../src/server/judge/coordinator.js';

describe('Task 8 - Observability & Metrics', () => {
  let testDb: Database.Database;

  beforeEach(() => {
    testDb = new Database(':memory:');
    testDb.pragma('foreign_keys = ON');
    initDb(testDb);
    seedDb(testDb);
  });

  it('structured log filters out sensitive fields and formats correctly', () => {
    const entry = log('info', 'Submission received', {
      requestId: 'req-123',
      submissionId: 42,
      sourceCode: 'int main(){}', // Must be stripped
      token: 'secret-token',      // Must be stripped
    });

    expect(entry.message).toBe('Submission received');
    expect(entry.requestId).toBe('req-123');
    expect(entry.submissionId).toBe(42);
    expect((entry as any).sourceCode).toBeUndefined();
    expect((entry as any).token).toBeUndefined();
  });

  it('collects metrics and detects alerts for backlog and errors', () => {
    const student = testDb.prepare("SELECT id FROM users WHERE role = 'student'").get() as any;
    const problem = testDb.prepare("SELECT current_version_id FROM problems WHERE slug = 'a-plus-b'").get() as any;

    // Create 3 submissions
    for (let i = 1; i <= 3; i++) {
      const sub = testDb.prepare(`
        INSERT INTO submissions (user_id, problem_version_id, language, source_code, status, idempotency_key)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(student.id, problem.current_version_id, 'C++17', 'code', 'DONE', `obs-key-${i}`);

      const subId = Number(sub.lastInsertRowid);
      const judgingId = createJudging(subId, testDb);

      const verdict = i === 1 ? 'JUDGE_ERROR' : 'AC';
      testDb.prepare(`
        UPDATE judgings SET status = 'DONE', verdict = ?, score = ?, runtime_ms = ? WHERE id = ?
      `).run(verdict, verdict === 'AC' ? 100 : 0, i * 10, judgingId);
    }

    const metrics = collectMetrics(testDb);
    expect(metrics.totalJudgings).toBe(3);
    expect(metrics.judgeErrorCount).toBe(1);
    expect(metrics.judgeErrorRatePercent).toBeGreaterThan(0);
    expect(metrics.avgRuntimeMs).toBeGreaterThan(0);

    // Alert testing
    const alertResult = evaluateAlerts({
      ...metrics,
      deadLetterJobs: 2,
      queueLength: 60,
      judgeErrorRatePercent: 25,
      totalJudgings: 10,
    });

    expect(alertResult.hasAlert).toBe(true);
    expect(alertResult.alerts.some(a => a.includes('DEAD_LETTER_JOBS'))).toBe(true);
    expect(alertResult.alerts.some(a => a.includes('QUEUE_BACKLOG'))).toBe(true);
    expect(alertResult.alerts.some(a => a.includes('HIGH_JUDGE_ERROR_RATE'))).toBe(true);
  });
});
