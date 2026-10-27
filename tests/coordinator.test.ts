import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { initDb, seedDb } from '../src/server/db.js';
import { createJudging, processNextJob, reconcileStaleJudgings } from '../src/server/judge/coordinator.js';
import { claimJob, enqueueJob } from '../src/server/judge/jobQueue.js';
import { MockAdapter } from '../src/server/judge/mockAdapter.js';

describe('Task 3 - Job Queue & Coordinator', () => {
  let testDb: Database.Database;

  beforeEach(() => {
    testDb = new Database(':memory:');
    testDb.pragma('foreign_keys = ON');
    initDb(testDb);
    seedDb(testDb);
  });

  function createTestSubmission(idempotencyKey = 'coord-sub-1') {
    const student = testDb.prepare("SELECT id FROM users WHERE role = 'student'").get() as any;
    const problem = testDb.prepare("SELECT current_version_id FROM problems WHERE slug = 'a-plus-b'").get() as any;
    const sub = testDb.prepare(`
      INSERT INTO submissions (user_id, problem_version_id, language, source_code, status, idempotency_key)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(student.id, problem.current_version_id, 'C++17', 'int main(){}', 'QUEUED', idempotencyKey);
    return Number(sub.lastInsertRowid);
  }

  it('ensures two workers do not race or claim the same job', async () => {
    const subId = createTestSubmission('race-test-key');
    const judgingId = createJudging(subId, testDb);

    const worker1Claim = claimJob('worker-1', testDb);
    const worker2Claim = claimJob('worker-2', testDb);

    expect(worker1Claim).not.toBeNull();
    expect(worker1Claim?.judgingId).toBe(judgingId);
    // Worker 2 should get null because worker 1 already claimed it
    expect(worker2Claim).toBeNull();
  });

  it('processes job end-to-end and writes results atomically with MockAdapter', async () => {
    const subId = createTestSubmission('process-key-1');
    const judgingId = createJudging(subId, testDb);
    const mockAdapter = new MockAdapter('success');

    const processed = await processNextJob('worker-1', mockAdapter, testDb);
    expect(processed).toBe(true);

    const judging = testDb.prepare('SELECT * FROM judgings WHERE id = ?').get(judgingId) as any;
    expect(judging.status).toBe('DONE');
    expect(judging.verdict).toBe('AC');
    expect(judging.score).toBe(100);

    const sub = testDb.prepare('SELECT status FROM submissions WHERE id = ?').get(subId) as any;
    expect(sub.status).toBe('DONE');

    const tests = testDb.prepare('SELECT * FROM test_results WHERE judging_id = ?').all(judgingId);
    expect(tests.length).toBeGreaterThan(0);
  });

  it('retries on failure and moves to dead-letter with JUDGE_ERROR after max attempts', async () => {
    const subId = createTestSubmission('fail-key-1');
    const judgingId = createJudging(subId, testDb);

    // Faulty adapter that always throws
    const failingAdapter = {
      submit: async () => { throw new Error('Judge engine network error'); },
      getStatus: async () => ({ status: 'JUDGE_ERROR' as const }),
      getResult: async () => { throw new Error('Unreachable'); },
      rejudge: async (id: string) => ({ engineJobId: id }),
      cancel: async () => {},
      health: async () => ({ ok: false, workers: 0, queued: 0 }),
    };

    // Attempt 1: fails, requeued with backoff
    const p1 = await processNextJob('worker-1', failingAdapter, testDb, 2);
    expect(p1).toBe(false);

    // Job state in queue should be QUEUED or run_after in future
    const jobRow1 = testDb.prepare('SELECT state, attempts FROM jobs WHERE judging_id = ?').get(judgingId) as any;
    expect(jobRow1.state).toBe('QUEUED');
    expect(jobRow1.attempts).toBe(1);

    // Fast-forward run_after so it can be claimed again
    testDb.prepare("UPDATE jobs SET run_after = datetime('now', '-1 minute') WHERE judging_id = ?").run(judgingId);

    // Attempt 2: exceeds maxAttempts (2) -> DEAD_LETTER and marks judging & submission as JUDGE_ERROR
    const p2 = await processNextJob('worker-1', failingAdapter, testDb, 2);
    expect(p2).toBe(false);

    const jobRow2 = testDb.prepare('SELECT state, attempts FROM jobs WHERE judging_id = ?').get(judgingId) as any;
    expect(jobRow2.state).toBe('DEAD_LETTER');
    expect(jobRow2.attempts).toBe(2);

    const judging = testDb.prepare('SELECT status, verdict, error_message FROM judgings WHERE id = ?').get(judgingId) as any;
    expect(judging.status).toBe('JUDGE_ERROR');
    expect(judging.verdict).toBe('JUDGE_ERROR');

    const sub = testDb.prepare('SELECT status FROM submissions WHERE id = ?').get(subId) as any;
    expect(sub.status).toBe('JUDGE_ERROR');
  });

  it('watchdog / reconciler recovers stale jobs stuck in COMPILING or RUNNING', () => {
    const subId = createTestSubmission('stale-key-1');
    const judgingId = createJudging(subId, testDb);

    // Simulate job got stuck in RUNNING 10 minutes ago
    const tenMinutesAgo = new Date(Date.now() - 600000).toISOString();
    testDb.prepare("UPDATE judgings SET status = 'RUNNING', started_at = ? WHERE id = ?").run(tenMinutesAgo, judgingId);

    // Run watchdog with 5 minutes (300,000ms) threshold
    const reconciledCount = reconcileStaleJudgings(300000, 3, testDb);
    expect(reconciledCount).toBe(1);

    const judging = testDb.prepare('SELECT status, verdict, error_message FROM judgings WHERE id = ?').get(judgingId) as any;
    expect(judging.status).toBe('JUDGE_ERROR');
    expect(judging.verdict).toBe('JUDGE_ERROR');
    expect(judging.error_message).toContain('Watchdog timeout');

    const sub = testDb.prepare('SELECT status FROM submissions WHERE id = ?').get(subId) as any;
    expect(sub.status).toBe('JUDGE_ERROR');
  });

  it('does not duplicate jobs when re-enqueueing the same active judging', () => {
    const subId = createTestSubmission('dup-test-key');
    const judgingId = createJudging(subId, testDb);

    // Try enqueuing again
    enqueueJob(judgingId, new Date().toISOString(), testDb);

    const count = testDb.prepare('SELECT COUNT(*) AS c FROM jobs WHERE judging_id = ?').get(judgingId) as any;
    expect(count.c).toBe(1);
  });
});
