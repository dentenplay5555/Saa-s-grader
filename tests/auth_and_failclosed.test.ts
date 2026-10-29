import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { Server } from 'node:http';
import { initDb, seedDb } from '../src/server/db.js';
import { createApp } from '../src/server/index.js';
import { MockAdapter } from '../src/server/judge/mockAdapter.js';
import { createJudging, runJudging } from '../src/server/judge/coordinator.js';
import { Judge0Adapter } from '../src/server/judge/judge0Adapter.js';
import { buildTestPlan } from '../src/server/judge/testPlan.js';
import { hashPassword, verifyPassword } from '../src/server/password.js';
import { signAuthToken } from '../src/server/auth.js';

describe('password hashing', () => {
  it('verifies correct password, rejects wrong/missing/malformed', async () => {
    const h = await hashPassword('correct horse');
    expect(await verifyPassword('correct horse', h)).toBe(true);
    expect(await verifyPassword('wrong horse', h)).toBe(false);
    expect(await verifyPassword('x', null)).toBe(false);
    expect(await verifyPassword('x', 'garbage')).toBe(false);
    await expect(hashPassword('short')).rejects.toThrow();
  });
});

describe('login', () => {
  let db: Database.Database;
  let server: Server;
  let base: string;

  beforeEach(async () => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    initDb(db);
    seedDb(db); // seeded accounts have NO password in test env
    const hash = await hashPassword('s3cret-pass');
    db.prepare("UPDATE users SET password_hash = ? WHERE email = 'student@local'").run(hash);
    const app = createApp(db, new MockAdapter('success'));
    await new Promise<void>(r => { server = app.listen(0, () => { base = `http://localhost:${(server.address() as any).port}`; r(); }); });
  });
  afterEach(async () => { await new Promise<void>(r => server.close(() => r())); });

  const login = (body: any) => fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  it('rejects email-only and userId-only login', async () => {
    expect((await login({ email: 'student@local' })).status).toBe(400);
    expect((await login({ userId: 1 })).status).toBe(400);
    expect((await login({ email: 'admin@local', password: '' })).status).toBe(400);
  });

  it('rejects wrong password and accounts with no password set', async () => {
    expect((await login({ email: 'student@local', password: 'nope-nope' })).status).toBe(401);
    expect((await login({ email: 'admin@local', password: 'anything-here' })).status).toBe(401); // no hash
    expect((await login({ email: 'ghost@local', password: 'anything-here' })).status).toBe(401);
  });

  it('accepts correct password, returns working token, HttpOnly cookie, never the hash', async () => {
    const res = await login({ email: 'student@local', password: 's3cret-pass' });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.user.email).toBe('student@local');
    expect(JSON.stringify(data)).not.toContain('scrypt$');
    expect(res.headers.get('set-cookie')).toContain('HttpOnly');
    const me = await (await fetch(`${base}/api/auth/me`, { headers: { Authorization: `Bearer ${data.token}` } })).json();
    expect(me.user.email).toBe('student@local');
  });

  it('throttles after 5 failures even with the right password afterwards', async () => {
    for (let i = 0; i < 5; i++) expect((await login({ email: 'student@local', password: 'bad-password' })).status).toBe(401);
    const blocked = await login({ email: 'student@local', password: 's3cret-pass' });
    expect(blocked.status).toBe(429);
    expect(blocked.headers.has('Retry-After')).toBe(true);
  });

  it('a token signed with a different secret is rejected', async () => {
    const forged = signAuthToken({ id: 1, email: 'admin@local', role: 'admin' }).split('.');
    forged[2] = forged[2].slice(0, -2) + 'AA';
    const r = await fetch(`${base}/api/auth/me`, { headers: { Authorization: `Bearer ${forged.join('.')}` } });
    expect((await r.json()).user).toBeNull();
  });
});

describe('fail-closed judging', () => {
  let db: Database.Database;
  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    initDb(db);
    seedDb(db);
  });

  function submissionFor(slug: string, key: string) {
    const student = db.prepare("SELECT id FROM users WHERE role='student'").get() as any;
    const p = db.prepare('SELECT current_version_id FROM problems WHERE slug = ?').get(slug) as any;
    return Number(db.prepare("INSERT INTO submissions (user_id, problem_version_id, language, source_code, status, idempotency_key) VALUES (?,?,?,?,?,?)")
      .run(student.id, p.current_version_id, 'C++17', 'int main(){}', 'QUEUED', key).lastInsertRowid);
  }

  it('problem without any test package → JUDGE_ERROR, engine never called, never AC/100', async () => {
    const pid = Number(db.prepare("INSERT INTO problems (slug, title) VALUES ('empty','Empty')").run().lastInsertRowid);
    const vid = Number(db.prepare("INSERT INTO problem_versions (problem_id, statement_md, time_limit_ms, memory_limit_mb) VALUES (?,?,?,?)").run(pid, '# x', 1000, 256).lastInsertRowid);
    db.prepare('UPDATE problems SET current_version_id = ? WHERE id = ?').run(vid, pid);

    const subId = submissionFor('empty', 'k1');
    const jid = createJudging(subId, db);
    let called = false;
    const adapter: any = new MockAdapter('success');
    const orig = adapter.submit.bind(adapter);
    adapter.submit = async (x: any) => { called = true; return orig(x); };
    await runJudging(jid, adapter, db);

    const j = db.prepare('SELECT status, verdict, score, error_message FROM judgings WHERE id = ?').get(jid) as any;
    expect(called).toBe(false);
    expect(j.verdict).toBe('JUDGE_ERROR');
    expect(j.score).toBeNull();
    expect(j.error_message).toContain('No test package');
    expect((db.prepare('SELECT status FROM submissions WHERE id = ?').get(subId) as any).status).toBe('JUDGE_ERROR');
  });

  it('manifest with empty subtasks / empty tests is rejected by buildTestPlan', () => {
    expect(() => buildTestPlan(null)).toThrow();
    expect(() => buildTestPlan('{not json')).toThrow();
    expect(() => buildTestPlan(JSON.stringify({ subtasks: [] }))).toThrow();
    expect(() => buildTestPlan(JSON.stringify({ subtasks: [{ name: 'a', score: 100, tests: [] }] }))).toThrow();
    expect(() => buildTestPlan(JSON.stringify({ subtasks: [{ name: 'a', score: 100, dependsOn: ['zzz'], tests: [{ index: 1, input: '', expectedOutput: '' }] }] }))).toThrow();
    expect(buildTestPlan(JSON.stringify({ subtasks: [{ name: 'a', score: 100, tests: [{ index: 1, input: '1', expectedOutput: '1' }] }] })).testCases).toHaveLength(1);
  });

  it('uses the LATEST uploaded test package', async () => {
    const vid = (db.prepare("SELECT current_version_id v FROM problems WHERE slug='a-plus-b'").get() as any).v;
    db.prepare("INSERT INTO test_packages (problem_version_id, manifest, checksum) VALUES (?,?,?)").run(vid, JSON.stringify({ subtasks: [{ name: 'new', score: 100, tests: [{ index: 1, input: '9', expectedOutput: '9' }] }] }), 'c2');
    const seen: any[] = [];
    const adapter: any = new MockAdapter('success');
    const orig = adapter.submit.bind(adapter);
    adapter.submit = async (x: any) => { seen.push(...x.testCases); return orig(x); };
    await runJudging(createJudging(submissionFor('a-plus-b', 'k2'), db), adapter, db);
    expect(seen).toHaveLength(1);
    expect(seen[0].group).toBe('new');
  });

  it('Judge0Adapter refuses to submit without test cases', async () => {
    const a = new Judge0Adapter();
    await expect(a.submit({ judgingId: '1', problemSlug: 'x', language: 'C++17', sourceCode: 'x', timeLimitMs: 1000, memoryLimitMb: 256 } as any)).rejects.toThrow(/without test cases/);
  });
});

describe('submit API on problem without tests', () => {
  it('returns 409', async () => {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    initDb(db); seedDb(db);
    const pid = Number(db.prepare("INSERT INTO problems (slug, title) VALUES ('empty','Empty')").run().lastInsertRowid);
    const vid = Number(db.prepare("INSERT INTO problem_versions (problem_id, statement_md, time_limit_ms, memory_limit_mb) VALUES (?,?,?,?)").run(pid, '# x', 1000, 256).lastInsertRowid);
    db.prepare('UPDATE problems SET current_version_id = ? WHERE id = ?').run(vid, pid);
    const sid = (db.prepare("SELECT id FROM users WHERE role='student'").get() as any).id;
    const app = createApp(db, new MockAdapter('success'));
    const server: Server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
    try {
      const r = await fetch(`http://localhost:${(server.address() as any).port}/api/submissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${signAuthToken({ id: sid, email: 'student@local', role: 'student' })}` },
        body: JSON.stringify({ problemSlug: 'empty', language: 'C++17', sourceCode: 'int main(){}', idempotencyKey: 'x1' }),
      });
      expect(r.status).toBe(409);
    } finally { await new Promise<void>(r => server.close(() => r())); }
  });
});
