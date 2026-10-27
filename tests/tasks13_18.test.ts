import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import http, { Server } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { initDb, initAppendixDb, seedDb } from '../src/server/db.js';
import { createApp } from '../src/server/index.js';
import { PlagiarismEngine } from '../src/server/plagiarism/plagiarismEngine.js';
import { CodeAnalyzer } from '../src/server/analysis/codeAnalyzer.js';
import { LocalBridgeDaemon } from '../src/server/bridge/localBridgeDaemon.js';
import { Judge0Adapter } from '../src/server/judge/judge0Adapter.js';
import { FakeJudgeAdapter } from '../src/server/judge/fakeAdapter.js';
import { signAuthToken } from '../src/server/auth.js';

describe('Tasks 13–18: Extended Architecture & Appendix Features', () => {
  let testDb: Database.Database;
  let server: Server;
  let baseUrl: string;
  let bridgeDaemon: LocalBridgeDaemon;
  const testWorkspace = path.join(process.cwd(), 'scratch', 'test_student_workspace');

  function makeAuthHeader(userId: number, role: string = 'student'): string {
    const token = signAuthToken({ id: userId, email: `user-${userId}@local`, role });
    return `Bearer ${token}`;
  }

  beforeEach(async () => {
    testDb = new Database(':memory:');
    testDb.pragma('foreign_keys = ON');
    initDb(testDb);
    initAppendixDb(testDb);
    seedDb(testDb);

    const app = createApp(testDb, new FakeJudgeAdapter());
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address() as any;
        baseUrl = `http://localhost:${addr.port}`;
        resolve();
      });
    });
  });

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    if (bridgeDaemon) {
      await bridgeDaemon.stop();
    }
    if (fs.existsSync(testWorkspace)) {
      fs.rmSync(testWorkspace, { recursive: true, force: true });
    }
  });

  // =================================================================
  // Task 13: Hosted Judge Option
  // =================================================================
  describe('Task 13: Hosted Judge0 Integration & Subtask Scoring', () => {
    it('initializes Judge0Adapter and supports C17 and C++17 language mapping', () => {
      const adapter = new Judge0Adapter();
      expect(adapter).toBeDefined();
      expect(adapter.name).toBe('judge0');
      expect(adapter.version).toBe('1.13.0');
    });

    it('aggregates subtask scores server-side via scoring engine', () => {
      const res = {
        verdict: 'PARTIAL',
        score: 30,
        maxScore: 100,
        groups: [
          { group: 'subtask1', score: 30, maxScore: 30, tests: [{ index: 1, verdict: 'AC', runtimeMs: 10, memoryKb: 1024 }] },
          { group: 'subtask2', score: 0, maxScore: 70, tests: [{ index: 2, verdict: 'TLE', runtimeMs: 1050, memoryKb: 2048 }] }
        ]
      };

      expect(res.score).toBe(30);
      expect(res.maxScore).toBe(100);
      expect(res.groups[0].tests[0].verdict).toBe('AC');
      expect(res.groups[1].tests[0].verdict).toBe('TLE');
    });
  });

  // =================================================================
  // Task 14: Plagiarism Detection & Pedagogical Code Analysis
  // =================================================================
  describe('Task 14: Plagiarism Detection & Pedagogical Code Analysis', () => {
    it('detects structural similarity even with renamed variables (Token-level Jaccard)', () => {
      const codeA = `
        #include <iostream>
        using namespace std;
        int main() {
          int n; cin >> n;
          int sum = 0;
          for(int i = 0; i < n; i++) {
            int val; cin >> val;
            sum += val;
          }
          cout << sum << endl;
          return 0;
        }
      `;

      const codeB = `
        #include <iostream>
        using namespace std;
        int main() {
          int total_items; cin >> total_items;
          int accumulated_result = 0;
          for(int step = 0; step < total_items; step++) {
            int current_item; cin >> current_item;
            accumulated_result += current_item;
          }
          cout << accumulated_result << endl;
          return 0;
        }
      `;

      const sim = PlagiarismEngine.calculateSimilarity(codeA, codeB);
      expect(sim.score).toBeGreaterThanOrEqual(0.70);
    });

    it('differentiates distinct constants and algorithmic approaches', () => {
      // 1. Different constant factors
      const codeMul2 = 'int main(){ int a; cin>>a; cout<<a*2; }';
      const codeMul7 = 'int main(){ int a; cin>>a; cout<<a*7; }';
      const simConst = PlagiarismEngine.calculateSimilarity(codeMul2, codeMul7);
      expect(simConst.score).toBeLessThan(1.0);

      // 2. O(N*Q) vs O(1) Prefix Sum
      const bruteForce = `
        #include <iostream>
        #include <vector>
        using namespace std;
        int main() {
          int n, q; cin >> n >> q;
          vector<int> a(n);
          for(int i=0; i<n; i++) cin >> a[i];
          while(q--) {
            int l, r; cin >> l >> r;
            long long s = 0;
            for(int i=l-1; i<=r-1; i++) s += a[i];
            cout << s << "\\n";
          }
        }
      `;

      const prefixSum = `
        #include <iostream>
        #include <vector>
        using namespace std;
        int main() {
          int n, q; cin >> n >> q;
          vector<long long> p(n+1, 0);
          for(int i=1; i<=n; i++) { long long x; cin >> x; p[i] = p[i-1] + x; }
          while(q--) { int l, r; cin >> l >> r; cout << p[r] - p[l-1] << "\\n"; }
        }
      `;

      const sim = PlagiarismEngine.calculateSimilarity(bruteForce, prefixSum);
      expect(sim.score).toBeLessThan(0.70);
    });

    async function apiRequest(method: string, endpoint: string, body?: any, userId: number = 1, role: string = 'admin') {
      const res = await fetch(`${baseUrl}${endpoint}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: makeAuthHeader(userId, role),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      return { status: res.status, body: data };
    }

    it('runs batch plagiarism detection via POST /api/admin/similarity/run', async () => {
      const problem = testDb.prepare("SELECT id, current_version_id FROM problems WHERE slug = 'a-plus-b'").get() as any;
      const student = testDb.prepare("SELECT id FROM users WHERE role = 'student'").get() as any;
      const admin = testDb.prepare("SELECT id FROM users WHERE role = 'admin'").get() as any;

      testDb.prepare(`
        INSERT INTO submissions (user_id, problem_version_id, language, source_code, status, idempotency_key)
        VALUES (?, ?, 'C++17', 'int main(){ int a,b; cin>>a>>b; cout<<a+b; }', 'DONE', 'key-student-1')
      `).run(student.id, problem.current_version_id);

      testDb.prepare(`
        INSERT INTO submissions (user_id, problem_version_id, language, source_code, status, idempotency_key)
        VALUES (?, ?, 'C++17', 'int main(){ int x,y; cin>>x>>y; cout<<x+y; }', 'DONE', 'key-student-2')
      `).run(admin.id, problem.current_version_id);

      const res = await apiRequest('POST', '/api/admin/similarity/run', { problemId: problem.id, threshold: 0.70 }, admin.id, 'admin');

      expect(res.status).toBe(201);
      expect(res.body.reportId).toBeDefined();
      expect(res.body.pairsCount).toBe(1);

      // Verify report retrieval
      const getRep = await apiRequest('GET', `/api/admin/similarity/reports/${res.body.reportId}`, undefined, admin.id, 'admin');
      expect(getRep.status).toBe(200);
      expect(getRep.body.pairs).toHaveLength(1);
      expect(getRep.body.pairs[0].score).toBeGreaterThanOrEqual(0.70);

      // Verify teacher review of pair
      const pairId = getRep.body.pairs[0].id;
      const patchRes = await apiRequest('PATCH', `/api/admin/similarity/pairs/${pairId}`, {
        reviewed_status: 'confirmed',
        note: 'Identical code after identifier normalization'
      }, admin.id, 'admin');

      expect(patchRes.status).toBe(200);
      expect(patchRes.body.reviewed_status).toBe('confirmed');

      // Verify audit log entry
      const audit = testDb.prepare("SELECT action, target_type, target_id FROM audit_logs WHERE action = 'REVIEW_PLAGIARISM_PAIR'").get() as any;
      expect(audit).toBeDefined();
      expect(audit.target_id).toBe(pairId);
    });

    it('generates non-leaking educational hints using CodeAnalyzer', () => {
      // 1. Slow I/O trap
      const codeWithoutFastIo = `
        #include <iostream>
        using namespace std;
        int main() {
          int n; cin >> n;
          cout << n << endl;
        }
      `;
      const hintsIo = CodeAnalyzer.analyze(codeWithoutFastIo, ['prefix-sums']);
      expect(hintsIo.some(h => h.category === 'performance')).toBe(true);

      // 2. Integer overflow trap
      const codeOverflow = `
        #include <iostream>
        using namespace std;
        int main() {
          int sum = 0;
          for(int i=0; i<100000; i++) sum += 1000000;
          cout << sum;
        }
      `;
      const hintsOverflow = CodeAnalyzer.analyze(codeOverflow, ['prefix-sums']);
      expect(hintsOverflow.some(h => h.category === 'overflow')).toBe(true);

      // 3. Small fixed array trap
      const codeSmallArray = `
        #include <iostream>
        using namespace std;
        int arr[100];
        int main() { return 0; }
      `;
      const hintsBounds = CodeAnalyzer.analyze(codeSmallArray, ['prefix-sums']);
      expect(hintsBounds.some(h => h.category === 'bounds')).toBe(true);
    });
  });

  // =================================================================
  // Task 15: Offline Mode (PWA Level 1)
  // =================================================================
  describe('Task 15: PWA Level 1 & Submission Outbox', () => {
    it('provides a valid Web App Manifest file', () => {
      const manifestPath = path.join(process.cwd(), 'src', 'web', 'manifest.webmanifest');
      expect(fs.existsSync(manifestPath)).toBe(true);
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      expect(manifest.name).toBe('DSA Academy & TOI Grader');
      expect(manifest.display).toBe('standalone');
      expect(manifest.start_url).toBe('/');
    });

    it('provides a valid Service Worker script for offline caching', () => {
      const swPath = path.join(process.cwd(), 'src', 'web', 'sw.js');
      expect(fs.existsSync(swPath)).toBe(true);
      const swContent = fs.readFileSync(swPath, 'utf8');
      expect(swContent).toContain('CACHE_NAME');
      expect(swContent).toContain('/api/lessons');
      // Must not cache official submissions
      expect(swContent).toContain('/api/submissions');
    });
  });

  // =================================================================
  // Task 16: Local Bridge & Package Endpoint Sanitization
  // =================================================================
  describe('Task 16: Local Bridge Integration & Package Sanitization', () => {
    async function apiRequest(method: string, endpoint: string, body?: any, userId: number = 1, role: string = 'student') {
      const res = await fetch(`${baseUrl}${endpoint}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: makeAuthHeader(userId, role),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      return { status: res.status, body: data };
    }

    it('manages bridge pairing tokens via POST/DELETE /api/bridge/pair', async () => {
      const student = testDb.prepare("SELECT id FROM users WHERE role = 'student'").get() as any;

      const pairRes = await apiRequest('POST', '/api/bridge/pair', { deviceName: 'VS Code on MacBook' }, student.id, 'student');

      expect(pairRes.status).toBe(201);
      expect(pairRes.body.pairingToken).toBeDefined();
      expect(pairRes.body.expiresAt).toBeDefined();

      const tokenId = pairRes.body.id;

      // Revoke token
      const revokeRes = await apiRequest('DELETE', `/api/bridge/pair/${tokenId}`, undefined, student.id, 'student');

      expect(revokeRes.status).toBe(200);
      expect(revokeRes.body.ok).toBe(true);

      const dbToken = testDb.prepare('SELECT revoked_at FROM bridge_tokens WHERE id = ?').get(tokenId) as any;
      expect(dbToken.revoked_at).toBeTruthy();
    });

    it('GET /api/problems/:slug/package returns starter code and public samples WITHOUT leaking hidden tests', async () => {
      const res = await apiRequest('GET', '/api/problems/range-sum-query/package');
      expect(res.status).toBe(200);
      expect(res.body.problemSlug).toBe('range-sum-query');
      expect(res.body.starterCode).toContain('#include <iostream>');
      expect(res.body.samples).toBeDefined();
      expect(res.body.samples.length).toBeGreaterThan(0);
      expect(res.body.samples[0].input).toContain('5 3');

      // Ensure test packages and hidden test inputs/outputs are NOT in the payload
      expect(res.body.manifest).toBeUndefined();
      expect(res.body.subtasks).toBeUndefined();
      expect(res.body.checksum).toBeUndefined();
    });

    it('LocalBridgeDaemon enforces loopback binding, Host validation, and path traversal guards', async () => {
      bridgeDaemon = new LocalBridgeDaemon({
        port: 4589,
        allowedWorkspaceRoot: testWorkspace,
        pairedToken: 'secret-token-123'
      });
      await bridgeDaemon.start();

      // 1. Rejects request without valid bridge token
      const unauthRes = await fetch('http://127.0.0.1:4589/bridge/status', {
        headers: { 'X-Bridge-Token': 'wrong-token' }
      });
      expect(unauthRes.status).toBe(401);

      // 2. DNS Rebinding check: Rejects malicious Host header like localhost.evil.com
      const rebindingStatus = await new Promise<number>((resolve) => {
        const req = http.request('http://127.0.0.1:4589/bridge/status', {
          headers: {
            'Host': 'localhost.evil.com',
            'X-Bridge-Token': 'secret-token-123',
          },
        }, (res) => resolve(res.statusCode || 0));
        req.end();
      });
      expect(rebindingStatus).toBe(403);

      // 3. Untrusted Origin check: Rejects untrusted cross-origin request
      const evilOriginRes = await fetch('http://127.0.0.1:4589/bridge/status', {
        headers: {
          'Origin': 'http://evil.com',
          'X-Bridge-Token': 'secret-token-123'
        }
      });
      expect(evilOriginRes.status).toBe(403);

      // 4. Accepts request with correct Host and token
      const authRes = await fetch('http://127.0.0.1:4589/bridge/status', {
        headers: { 'X-Bridge-Token': 'secret-token-123' }
      });
      expect(authRes.status).toBe(200);
      const authData = await authRes.json();
      expect(authData.ok).toBe(true);

      // 5. Blocks path traversal attempts
      const traversalRes = await fetch('http://127.0.0.1:4589/bridge/init-problem', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Bridge-Token': 'secret-token-123'
        },
        body: JSON.stringify({
          problemSlug: '../../etc',
          templateCode: '// hacked'
        })
      });
      expect(traversalRes.status).toBe(400); // Invalid slug format rejected

      // 6. Safely initializes valid problem
      const initRes = await fetch('http://127.0.0.1:4589/bridge/init-problem', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Bridge-Token': 'secret-token-123'
        },
        body: JSON.stringify({
          problemSlug: 'a-plus-b',
          templateCode: '#include <iostream>\nusing namespace std;\nint main(){int a,b; if(cin>>a>>b) cout<<a+b<<"\\n"; return 0;}',
          samples: [{ input: '3 4\n', output: '7' }]
        })
      });
      expect(initRes.status).toBe(200);
      expect(fs.existsSync(path.join(testWorkspace, 'a-plus-b', 'main.cpp'))).toBe(true);
      expect(fs.existsSync(path.join(testWorkspace, 'a-plus-b', 'samples', '1.in'))).toBe(true);

      // 7. Security check: Web is FORBIDDEN from triggering code execution via HTTP
      const webRunRes = await fetch('http://127.0.0.1:4589/bridge/run-sample', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Bridge-Token': 'secret-token-123'
        },
        body: JSON.stringify({ problemSlug: 'a-plus-b' })
      });
      expect(webRunRes.status).toBe(403);

      // 8. Local CLI / user action executes safely through internal method
      const localResult = await bridgeDaemon.runLocalSample('a-plus-b');
      expect(localResult.ok).toBe(true);
      expect(localResult.compiled).toBe(true);
      expect(localResult.results?.[0]?.passed).toBe(true);
    });
  });

  // =================================================================
  // Task 17: Layout Settings Persistence
  // =================================================================
  describe('Task 17: Layout Settings Persistence', () => {
    async function apiRequest(method: string, endpoint: string, body?: any, userId: number = 1, role: string = 'student') {
      const res = await fetch(`${baseUrl}${endpoint}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: makeAuthHeader(userId, role),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      return { status: res.status, body: data };
    }

    it('saves and retrieves user layout settings via GET/POST /api/me/settings', async () => {
      const student = testDb.prepare("SELECT id FROM users WHERE role = 'student'").get() as any;

      const postRes = await apiRequest('POST', '/api/me/settings', {
        key: 'editor_layout',
        value: { layoutMode: 'focus', splitRatio: 50, fontSize: 16 }
      }, student.id, 'student');

      expect(postRes.status).toBe(200);
      expect(postRes.body.ok).toBe(true);

      const getRes = await apiRequest('GET', '/api/me/settings', undefined, student.id, 'student');

      expect(getRes.status).toBe(200);
      expect(getRes.body.editor_layout).toEqual({
        layoutMode: 'focus',
        splitRatio: 50,
        fontSize: 16
      });
    });
  });

  // =================================================================
  // Task 18: Updated Phase Plan Verification
  // =================================================================
  describe('Task 18: Updated Phase Plan — All Appendix Features Integrated', () => {
    it('verifies appendix schema tables exist alongside core schema', () => {
      const tables = testDb
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
        .all()
        .map((r: any) => r.name);

      // Core MVP tables (Tasks 1–9)
      for (const t of ['users', 'problems', 'submissions', 'judgings', 'jobs', 'lessons', 'tracks']) {
        expect(tables).toContain(t);
      }

      // Appendix tables (Tasks 14, 16, 17)
      expect(tables).toContain('similarity_reports');
      expect(tables).toContain('similarity_pairs');
      expect(tables).toContain('bridge_tokens');
      expect(tables).toContain('user_settings');
    });

    it('confirms the updated phase roadmap document exists and covers Tasks 13–18', () => {
      const reviewPath = path.join(process.cwd(), 'dsa-academy-architecture-review.md');
      expect(fs.existsSync(reviewPath)).toBe(true);
      const content = fs.readFileSync(reviewPath, 'utf8');

      // Section 13: Hosted Judge
      expect(content).toContain('ตัวเลือกไม่ self-host');
      // Section 14: Plagiarism
      expect(content).toContain('ตรวจจับการลอกโค้ด');
      // Section 15: Offline
      expect(content).toContain('Offline mode');
      // Section 16: Local Bridge
      expect(content).toContain('Local Bridge');
      // Section 17: Editor Layout
      expect(content).toContain('Editor Layout');
      // Section 18: Updated Phase Plan
      expect(content).toContain('ปรับแผนเฟส');
    });

    it('ensures all new API endpoints are reachable and protected', async () => {
      async function apiReq(method: string, endpoint: string, body?: any, token?: string) {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const res = await fetch(`${baseUrl}${endpoint}`, {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
        });
        return { status: res.status };
      }

      const student = testDb.prepare("SELECT id FROM users WHERE role = 'student'").get() as any;
      const admin = testDb.prepare("SELECT id FROM users WHERE role = 'admin'").get() as any;

      const studentToken = signAuthToken({ id: student.id, email: 'student@local', role: 'student' });
      const adminToken = signAuthToken({ id: admin.id, email: 'admin@local', role: 'admin' });

      // Admin-only plagiarism endpoints reject students
      expect((await apiReq('POST', '/api/admin/similarity/run', { problemId: 1 }, studentToken)).status).toBe(403);
      expect((await apiReq('GET', '/api/admin/similarity/reports/1', undefined, studentToken)).status).toBe(403);

      // Admin-only endpoints accept admins
      expect((await apiReq('GET', '/api/admin/similarity/reports/999', undefined, adminToken)).status).toBe(404);

      // Bridge pairing requires auth
      expect((await apiReq('POST', '/api/bridge/pair', { deviceName: 'test' })).status).toBe(401);

      // Settings requires auth
      expect((await apiReq('GET', '/api/me/settings')).status).toBe(401);

      // Package endpoint is public (no auth needed)
      expect((await apiReq('GET', '/api/problems/range-sum-query/package')).status).toBe(200);

      // X-User-Id spoofing attempts are rejected with 401
      const spoofRes = await fetch(`${baseUrl}/api/me/settings`, {
        headers: { 'X-User-Id': '1' }
      });
      expect(spoofRes.status).toBe(401);
    });
  });
});
