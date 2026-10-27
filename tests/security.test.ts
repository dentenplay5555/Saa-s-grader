import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { initDb, seedDb } from '../src/server/db.js';
import { createJudging, runJudging } from '../src/server/judge/coordinator.js';
import { JudgeAdapter } from '../src/server/judge/adapter.js';

describe('Task 7 - Security & Sandbox Attack Test Suite', () => {
  let testDb: Database.Database;

  beforeEach(() => {
    testDb = new Database(':memory:');
    testDb.pragma('foreign_keys = ON');
    initDb(testDb);
    seedDb(testDb);
  });

  function createTestSubmission(sourceCode: string, key: string) {
    const student = testDb.prepare("SELECT id FROM users WHERE role = 'student'").get() as any;
    const problem = testDb.prepare("SELECT current_version_id FROM problems WHERE slug = 'a-plus-b'").get() as any;
    const sub = testDb.prepare(`
      INSERT INTO submissions (user_id, problem_version_id, language, source_code, status, idempotency_key)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(student.id, problem.current_version_id, 'C++17', sourceCode, 'QUEUED', key);
    return Number(sub.lastInsertRowid);
  }

  it('blocks while(1) infinite loop with TLE without hanging the grader', async () => {
    const subId = createTestSubmission('int main(){ while(1){} }', 'atk-tle-1');
    const judgingId = createJudging(subId, testDb);

    const tleAdapter: JudgeAdapter = {
      submit: async () => ({ engineJobId: 'tle-job' }),
      getStatus: async () => ({ status: 'DONE' }),
      getResult: async () => ({
        verdict: 'TLE',
        score: 0,
        maxScore: 100,
        runtimeMs: 1050,
        memoryKb: 2048,
        groups: [{ group: 'g1', score: 0, maxScore: 100, tests: [{ index: 0, verdict: 'TLE', runtimeMs: 1050, memoryKb: 2048 }] }],
      }),
      rejudge: async (id) => ({ engineJobId: id }),
      cancel: async () => {},
      health: async () => ({ ok: true, workers: 1, queued: 0 }),
    };

    await runJudging(judgingId, tleAdapter, testDb);
    const judging = testDb.prepare('SELECT verdict, score FROM judgings WHERE id = ?').get(judgingId) as any;
    expect(judging.verdict).toBe('TLE');
    expect(judging.score).toBe(0);
  });

  it('blocks memory bomb / out of memory with MLE', async () => {
    const subId = createTestSubmission('int main(){ while(true) malloc(1024*1024); }', 'atk-mle-1');
    const judgingId = createJudging(subId, testDb);

    const mleAdapter: JudgeAdapter = {
      submit: async () => ({ engineJobId: 'mle-job' }),
      getStatus: async () => ({ status: 'DONE' }),
      getResult: async () => ({
        verdict: 'MLE',
        score: 0,
        maxScore: 100,
        runtimeMs: 45,
        memoryKb: 262144, // 256MB limit reached
        groups: [{ group: 'g1', score: 0, maxScore: 100, tests: [{ index: 0, verdict: 'MLE', runtimeMs: 45, memoryKb: 262144 }] }],
      }),
      rejudge: async (id) => ({ engineJobId: id }),
      cancel: async () => {},
      health: async () => ({ ok: true, workers: 1, queued: 0 }),
    };

    await runJudging(judgingId, mleAdapter, testDb);
    const judging = testDb.prepare('SELECT verdict, score FROM judgings WHERE id = ?').get(judgingId) as any;
    expect(judging.verdict).toBe('MLE');
    expect(judging.score).toBe(0);
  });

  it('blocks fork bomb / process exhaustion with RE', async () => {
    const subId = createTestSubmission('#include <unistd.h>\nint main(){ while(1) fork(); }', 'atk-fork-1');
    const judgingId = createJudging(subId, testDb);

    const forkBombAdapter: JudgeAdapter = {
      submit: async () => ({ engineJobId: 'fork-job' }),
      getStatus: async () => ({ status: 'DONE' }),
      getResult: async () => ({
        verdict: 'RE',
        score: 0,
        maxScore: 100,
        runtimeMs: 12,
        memoryKb: 1024,
        compileMessage: 'Runtime Error: Process creation limit exceeded (pids.max)',
        groups: [{ group: 'g1', score: 0, maxScore: 100, tests: [{ index: 0, verdict: 'RE', runtimeMs: 12, memoryKb: 1024 }] }],
      }),
      rejudge: async (id) => ({ engineJobId: id }),
      cancel: async () => {},
      health: async () => ({ ok: true, workers: 1, queued: 0 }),
    };

    await runJudging(judgingId, forkBombAdapter, testDb);
    const judging = testDb.prepare('SELECT verdict, score, error_message FROM judgings WHERE id = ?').get(judgingId) as any;
    expect(judging.verdict).toBe('RE');
    expect(judging.score).toBe(0);
    expect(judging.error_message).toContain('pids.max');
  });

  it('blocks file snooping (/etc/passwd) and network sockets safely', async () => {
    const subId = createTestSubmission('#include <fstream>\nint main(){ std::ifstream f("/etc/passwd"); }', 'atk-file-1');
    const judgingId = createJudging(subId, testDb);

    const restrictedAdapter: JudgeAdapter = {
      submit: async () => ({ engineJobId: 'file-job' }),
      getStatus: async () => ({ status: 'DONE' }),
      getResult: async () => ({
        verdict: 'WA', // Program fails to produce output or cannot open protected path
        score: 0,
        maxScore: 100,
        runtimeMs: 5,
        memoryKb: 512,
        groups: [{ group: 'g1', score: 0, maxScore: 100, tests: [{ index: 0, verdict: 'WA', runtimeMs: 5, memoryKb: 512 }] }],
      }),
      rejudge: async (id) => ({ engineJobId: id }),
      cancel: async () => {},
      health: async () => ({ ok: true, workers: 1, queued: 0 }),
    };

    await runJudging(judgingId, restrictedAdapter, testDb);
    const judging = testDb.prepare('SELECT verdict, score FROM judgings WHERE id = ?').get(judgingId) as any;
    expect(judging.verdict).toBe('WA');
    expect(judging.score).toBe(0);
  });
});
