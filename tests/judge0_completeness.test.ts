import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { initDb, seedDb } from '../src/server/db.js';
import { assertCompleteResult, createJudging, processNextJob, runJudging } from '../src/server/judge/coordinator.js';
import { Judge0Adapter } from '../src/server/judge/judge0Adapter.js';
import type { JudgeAdapter } from '../src/server/judge/adapter.js';

const planned = [
  { group: 's1', index: 1, input: '', expectedOutput: '' },
  { group: 's1', index: 2, input: '', expectedOutput: '' },
];

describe('assertCompleteResult', () => {
  it('accepts exact match, rejects missing / duplicate / unexpected', () => {
    const ok = { groups: [{ group: 's1', tests: [{ index: 1 }, { index: 2 }] }] };
    expect(() => assertCompleteResult(planned, ok)).not.toThrow();
    expect(() => assertCompleteResult(planned, { groups: [{ group: 's1', tests: [{ index: 1 }] }] })).toThrow(/missing s1#2/);
    expect(() => assertCompleteResult(planned, { groups: [{ group: 's1', tests: [{ index: 1 }, { index: 1 }, { index: 2 }] }] })).toThrow(/duplicate/);
    expect(() => assertCompleteResult(planned, { groups: [{ group: 'x', tests: [{ index: 1 }, { index: 2 }] }] })).toThrow(/unexpected/);
    expect(() => assertCompleteResult(planned, { groups: [] })).toThrow(/missing/);
  });
});

describe('coordinator rejects incomplete engine results (never inflates score)', () => {
  let db: Database.Database;
  beforeEach(() => { db = new Database(':memory:'); db.pragma('foreign_keys = ON'); initDb(db); seedDb(db); });

  it('1 AC test reported for a 3-test problem → retries → JUDGE_ERROR, score null', async () => {
    const student = db.prepare("SELECT id FROM users WHERE role='student'").get() as any;
    const p = db.prepare("SELECT current_version_id v FROM problems WHERE slug='a-plus-b'").get() as any;
    const subId = Number(db.prepare("INSERT INTO submissions (user_id, problem_version_id, language, source_code, status, idempotency_key) VALUES (?,?,?,?,?,?)").run(student.id, p.v, 'C++17', 'x', 'QUEUED', 'inc1').lastInsertRowid);
    const jid = createJudging(subId, db);
    const partial: JudgeAdapter = {
      name: 'partial', version: '1',
      submit: async () => ({ engineJobId: 'p' }),
      getStatus: async () => ({ status: 'DONE' }),
      getResult: async () => ({ verdict: 'AC', score: 100, maxScore: 100, runtimeMs: 1, memoryKb: 1,
        groups: [{ group: 'subtask1', score: 100, maxScore: 100, tests: [{ index: 1, verdict: 'AC', runtimeMs: 1, memoryKb: 1 }] }] }),
      rejudge: async id => ({ engineJobId: id }), cancel: async () => {}, health: async () => ({ ok: true, workers: 1, queued: 0 }),
    };
    expect(await processNextJob('w', partial, db, 1)).toBe(false);
    const j = db.prepare('SELECT status, verdict, score, error_message FROM judgings WHERE id = ?').get(jid) as any;
    expect(j.verdict).toBe('JUDGE_ERROR');
    expect(j.score).toBeNull();
    expect(j.error_message).toContain('Incomplete judge result');
  });

  it('honours adapter.maxWaitMs / pollIntervalMs (slow engine finishing at ~300ms is NOT a timeout)', async () => {
    const student = db.prepare("SELECT id FROM users WHERE role='student'").get() as any;
    const p = db.prepare("SELECT current_version_id v FROM problems WHERE slug='a-plus-b'").get() as any;
    const subId = Number(db.prepare("INSERT INTO submissions (user_id, problem_version_id, language, source_code, status, idempotency_key) VALUES (?,?,?,?,?,?)").run(student.id, p.v, 'C++17', 'x', 'QUEUED', 'slow1').lastInsertRowid);
    const jid = createJudging(subId, db);
    const start = Date.now();
    const slow: JudgeAdapter = {
      name: 'slow', version: '1', pollIntervalMs: 20, maxWaitMs: 3000,
      submit: async () => ({ engineJobId: 's' }),
      getStatus: async () => ({ status: Date.now() - start > 300 ? 'DONE' : 'RUNNING' }),
      getResult: async () => ({ verdict: 'AC', score: 100, maxScore: 100, runtimeMs: 1, memoryKb: 1,
        groups: [{ group: 'subtask1', score: 100, maxScore: 100, tests: [1, 2, 3].map(index => ({ index, verdict: 'AC' as const, runtimeMs: 1, memoryKb: 1 })) }] }),
      rejudge: async id => ({ engineJobId: id }), cancel: async () => {}, health: async () => ({ ok: true, workers: 1, queued: 0 }),
    };
    await runJudging(jid, slow, db);
    expect((db.prepare('SELECT verdict, score FROM judgings WHERE id = ?').get(jid) as any)).toMatchObject({ verdict: 'AC', score: 100 });
  });
});

describe('Judge0Adapter with mocked HTTP', () => {
  let posts: number;
  let statuses: Record<string, number>;
  beforeEach(() => {
    posts = 0;
    statuses = {};
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: any) => {
      if (init?.method === 'POST') {
        posts++;
        return new Response(JSON.stringify({ token: `t${posts}` }), { status: 201 });
      }
      const token = String(url).match(/submissions\/(\w+)/)![1];
      return new Response(JSON.stringify({ status: { id: statuses[token] ?? 3 }, time: '0.01', memory: 100 }), { status: 200 });
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  const sub = { judgingId: '7', problemSlug: 'x', language: 'C++17', sourceCode: 'x', timeLimitMs: 1000, memoryLimitMb: 256,
    testCases: [1, 2, 3].map(index => ({ group: 's1', index, input: '1', expectedOutput: '1' })) };

  it('retry of the same judging reuses submissions instead of re-sending every test', async () => {
    const a = new Judge0Adapter();
    const first = await a.submit(sub);
    expect(posts).toBe(3);
    const second = await a.submit(sub);
    expect(second.engineJobId).toBe(first.engineJobId);
    expect(posts).toBe(3);
  });

  it('after an engine JUDGE_ERROR a retry resubmits from scratch', async () => {
    const a = new Judge0Adapter();
    const first = await a.submit(sub);
    statuses['t2'] = 13;
    expect((await a.getStatus(first.engineJobId)).status).toBe('JUDGE_ERROR');
    await new Promise(r => setTimeout(r, 2));
    const second = await a.submit(sub);
    expect(second.engineJobId).not.toBe(first.engineJobId);
    expect(posts).toBe(6);
  });

  it('polling skips already-finished tokens and reports full per-test results', async () => {
    const a = new Judge0Adapter();
    const { engineJobId } = await a.submit(sub);
    statuses['t3'] = 2; // still processing
    expect((await a.getStatus(engineJobId)).status).toBe('RUNNING');
    const calls1 = (fetch as any).mock.calls.length;
    statuses['t3'] = 3;
    expect((await a.getStatus(engineJobId)).status).toBe('DONE');
    // t1,t2 were finished on the first poll → only t3 is polled again
    expect((fetch as any).mock.calls.length - calls1).toBe(1);
    const res = await a.getResult(engineJobId);
    expect(res.groups[0].tests.map(t => t.index)).toEqual([1, 2, 3]);
  });

  it('unknown Judge0 status id is JUDGE_ERROR, never AC', async () => {
    const a = new Judge0Adapter();
    const { engineJobId } = await a.submit(sub);
    statuses['t1'] = 99;
    const res = await a.getResult(engineJobId);
    expect(res.groups[0].tests[0].verdict).toBe('JUDGE_ERROR');
    expect(res.verdict).toBe('JUDGE_ERROR');
  });

  it('sends X-Auth-Token for self-hosted Judge0 and never the RapidAPI headers without a key', async () => {
    process.env.JUDGE0_AUTH_TOKEN = 'secret-token';
    try {
      await new Judge0Adapter().submit(sub);
      const headers = (fetch as any).mock.calls[0][1].headers;
      expect(headers['X-Auth-Token']).toBe('secret-token');
      expect(headers['X-RapidAPI-Key']).toBeUndefined();
    } finally {
      delete process.env.JUDGE0_AUTH_TOKEN;
    }
  });
});
