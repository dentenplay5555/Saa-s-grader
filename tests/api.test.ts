import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { Server } from 'node:http';
import { initDb, seedDb } from '../src/server/db.js';
import { createApp } from '../src/server/index.js';
import { MockAdapter } from '../src/server/judge/mockAdapter.js';
import { signAuthToken } from '../src/server/auth.js';

describe('Task 5 - Core API', () => {
  let testDb: Database.Database;
  let server: Server;
  let baseUrl: string;
  let studentId: number;
  let adminId: number;
  let studentToken: string;
  let adminToken: string;

  beforeEach(async () => {
    testDb = new Database(':memory:');
    testDb.pragma('foreign_keys = ON');
    initDb(testDb);
    seedDb(testDb);

    studentId = (testDb.prepare("SELECT id FROM users WHERE role = 'student'").get() as any).id;
    adminId = (testDb.prepare("SELECT id FROM users WHERE role = 'admin'").get() as any).id;

    studentToken = signAuthToken({ id: studentId, email: 'student@local', role: 'student' });
    adminToken = signAuthToken({ id: adminId, email: 'admin@local', role: 'admin' });

    const mockAdapter = new MockAdapter('success');
    const app = createApp(testDb, mockAdapter);

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address() as any;
        baseUrl = `http://localhost:${addr.port}`;
        resolve();
      });
    });
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('GET /api/problems and GET /api/problems/:slug return statement without leaking hidden test packages', async () => {
    const resList = await fetch(`${baseUrl}/api/problems`);
    expect(resList.status).toBe(200);
    const problems = await resList.json();
    expect(problems.length).toBeGreaterThan(0);
    expect(problems[0].slug).toBe('a-plus-b');

    const resDetail = await fetch(`${baseUrl}/api/problems/a-plus-b`);
    expect(resDetail.status).toBe(200);
    const detail = await resDetail.json();
    expect(detail.title).toBe('A + B');
    expect(detail.version.statement_md).toContain('# A + B');
    // Ensure hidden test files or packages are not leaked
    expect(detail.test_packages).toBeUndefined();
    expect(detail.tests).toBeUndefined();
  });

  it('rejects spoofed X-User-Id header and requires valid signed Bearer token', async () => {
    const payload = {
      problemSlug: 'a-plus-b',
      language: 'C++17',
      sourceCode: '#include <iostream>\nint main(){ return 0; }',
      idempotencyKey: 'spoof-test-1',
    };

    // Attempting to spoof admin or student identity via X-User-Id MUST fail
    const spoofReq = await fetch(`${baseUrl}/api/submissions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': '1' },
      body: JSON.stringify(payload),
    });
    expect(spoofReq.status).toBe(401);
  });

  it('POST /api/submissions handles validation and idempotency', async () => {
    const payload = {
      problemSlug: 'a-plus-b',
      language: 'C++17',
      sourceCode: '#include <iostream>\nint main(){ return 0; }',
      idempotencyKey: 'api-idem-1',
    };

    // Unauthorized without token
    const unauth = await fetch(`${baseUrl}/api/submissions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    expect(unauth.status).toBe(401);

    // Authorized submission
    const res1 = await fetch(`${baseUrl}/api/submissions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify(payload),
    });
    expect(res1.status).toBe(201);
    const data1 = await res1.json();
    expect(data1.id).toBeTruthy();

    // Idempotent re-submission returns same ID
    const res2 = await fetch(`${baseUrl}/api/submissions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify(payload),
    });
    expect(res2.status).toBe(200);
    const data2 = await res2.json();
    expect(data2.id).toBe(data1.id);
    expect(data2.idempotent).toBe(true);
  });

  it('enforces rate limiting: 10 submissions/min/user responds with 429 and Retry-After', async () => {
    const basePayload = {
      problemSlug: 'a-plus-b',
      language: 'C++17',
      sourceCode: 'int main(){}',
    };

    // Send 10 submissions marking each as DONE to avoid in-flight quota tripping before rate limit
    for (let i = 1; i <= 10; i++) {
      const res = await fetch(`${baseUrl}/api/submissions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${studentToken}`,
        },
        body: JSON.stringify({ ...basePayload, idempotencyKey: `rate-key-${i}` }),
      });
      expect(res.status).toBe(201);
      const data = await res.json();
      testDb.prepare("UPDATE submissions SET status = 'DONE' WHERE id = ?").run(data.id);
    }

    // 11th submission in the same minute must be rate limited
    const rateLimited = await fetch(`${baseUrl}/api/submissions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify({ ...basePayload, idempotencyKey: 'rate-key-11' }),
    });

    expect(rateLimited.status).toBe(429);
    expect(rateLimited.headers.has('Retry-After')).toBe(true);
    const body = await rateLimited.json();
    expect(body.error).toContain('Rate limit exceeded');
  });

  it('GET /api/submissions/:id enforces ownership authorization and does NOT leak hidden test cases', async () => {
    const res = await fetch(`${baseUrl}/api/submissions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify({
        problemSlug: 'a-plus-b',
        language: 'C++17',
        sourceCode: 'int main(){}',
        idempotencyKey: 'safe-inspect-key',
      }),
    });
    const { id } = await res.json();

    // 1. Unauthenticated request rejected
    const unauth = await fetch(`${baseUrl}/api/submissions/${id}`);
    expect(unauth.status).toBe(401);

    // 2. Different user (another student in database) attempting to scrape is rejected with 403 Forbidden
    testDb.prepare("INSERT INTO users (email, name, role) VALUES ('other@local', 'Other Student', 'student')").run();
    const otherUser = testDb.prepare("SELECT id FROM users WHERE email = 'other@local'").get() as any;
    const otherStudentToken = signAuthToken({ id: otherUser.id, email: 'other@local', role: 'student' });
    const forbidden = await fetch(`${baseUrl}/api/submissions/${id}`, {
      headers: { Authorization: `Bearer ${otherStudentToken}` },
    });
    expect(forbidden.status).toBe(403);

    // 3. Owner student can view their own submission
    const detailRes = await fetch(`${baseUrl}/api/submissions/${id}`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    expect(detailRes.status).toBe(200);
    const detail = await detailRes.json();

    expect(detail.submission).toHaveProperty('id');
    expect(detail.submission).toHaveProperty('status');
    expect(detail).toHaveProperty('groups');
    // Ensure hidden input/output/expected fields are not leaked
    expect(detail).not.toHaveProperty('expectedOutput');
    expect(detail).not.toHaveProperty('input');
    expect(detail).not.toHaveProperty('hiddenTests');
  });

  it('admin operations are protected, function correctly, and record audit logs', async () => {
    // Non-admin cannot create problem
    const forbidden = await fetch(`${baseUrl}/api/admin/problems`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify({ slug: 'new-problem', title: 'New', statementMd: '# Statement' }),
    });
    expect(forbidden.status).toBe(403);

    // Admin creates problem
    const adminCreate = await fetch(`${baseUrl}/api/admin/problems`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        slug: 'new-problem',
        title: 'New Problem',
        statementMd: '# New Problem Statement',
        timeLimitMs: 1500,
        memoryLimitMb: 512,
      }),
    });
    expect(adminCreate.status).toBe(201);
    const { id: problemId } = await adminCreate.json();

    // Admin uploads test package
    const uploadPkg = await fetch(`${baseUrl}/api/admin/problems/${problemId}/test-package`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        manifest: { version: '1.0', subtasks: [{ name: 's1', score: 100, tests: [{ index: 1, input: '1 2\n', expectedOutput: '3\n' }] }] },
        checksum: 'sha256-abcdef1234567890',
      }),
    });
    expect(uploadPkg.status).toBe(201);

    // Admin checks judge health
    const health = await fetch(`${baseUrl}/api/admin/judge-health`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(health.status).toBe(200);
    const healthData = await health.json();
    expect(healthData).toHaveProperty('engine');
    expect(healthData).toHaveProperty('queue');

    // Verify audit logs were written
    const logs = testDb.prepare('SELECT action, target_type FROM audit_logs WHERE actor_id = ?').all(adminId) as any[];
    expect(logs.some(l => l.action === 'CREATE_PROBLEM')).toBe(true);
    expect(logs.some(l => l.action === 'UPLOAD_TEST_PACKAGE')).toBe(true);
    expect(logs.some(l => l.action === 'CHECK_HEALTH')).toBe(true);
  });
});
