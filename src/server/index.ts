import express from 'express';
import { db as defaultDb } from './db.js';
import { createJudging, defaultAdapter, processNextJob } from './judge/coordinator.js';

export function createApp(database = defaultDb, judgeAdapter = defaultAdapter) {
  const app = express();
  app.use(express.json({ limit: '128kb' }));

  // In-memory rate limiting tracker (per user: timestamp array)
  const userRateLimits = new Map<number, number[]>();
  const RATE_LIMIT_WINDOW_MS = 60 * 1000;
  const MAX_SUBMISSIONS_PER_WINDOW = 10;
  const MAX_PENDING_SUBMISSIONS = 3;
  const MAX_SOURCE_CODE_BYTES = 64 * 1024; // 64KB

  function userFromReq(req: express.Request): { id: number; email: string; name: string; role: string } | null {
    const id = Number(req.header('X-User-Id'));
    if (!id) return null;
    const u = database.prepare('SELECT id, email, name, role FROM users WHERE id = ?').get(id) as any;
    return u ?? null;
  }

  function writeAuditLog(actorId: number | null, action: string, targetType: string, targetId: number | null, detail?: string) {
    database.prepare(
      'INSERT INTO audit_logs (actor_id, action, target_type, target_id, created_at, detail) VALUES (?,?,?,?,?,?)'
    ).run(actorId, action, targetType, targetId, new Date().toISOString(), detail ?? null);
  }

  // --- Public / Student Endpoints ---

  app.get('/api/problems', (_req, res) => {
    const rows = database.prepare('SELECT id, slug, title FROM problems').all();
    res.json(rows);
  });

  app.get('/api/problems/:slug', (req, res) => {
    const p = database.prepare('SELECT * FROM problems WHERE slug = ?').get(req.params.slug) as any;
    if (!p) return res.status(404).json({ error: 'Problem not found' });

    const v = database.prepare(
      'SELECT id, statement_md, time_limit_ms, memory_limit_mb FROM problem_versions WHERE id = ?'
    ).get(p.current_version_id) as any;

    // Never return hidden test package details to client
    res.json({
      id: p.id,
      slug: p.slug,
      title: p.title,
      version: v ?? null,
    });
  });

  app.post('/api/submissions', (req, res) => {
    const u = userFromReq(req);
    if (!u) return res.status(401).json({ error: 'unauthorized' });

    const { problemSlug, language, sourceCode, idempotencyKey } = req.body ?? {};

    if (!problemSlug || !language || !sourceCode || !idempotencyKey) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (Buffer.byteLength(sourceCode, 'utf8') > MAX_SOURCE_CODE_BYTES) {
      return res.status(400).json({ error: 'Source code exceeds maximum allowed size (64KB)' });
    }

    // Verify language is enabled
    const lang = database.prepare('SELECT * FROM languages WHERE name = ? AND enabled = 1').get(language) as any;
    if (!lang) {
      return res.status(400).json({ error: `Language '${language}' is not supported or enabled` });
    }

    // Verify problem exists
    const p = database.prepare('SELECT * FROM problems WHERE slug = ?').get(problemSlug) as any;
    if (!p || !p.current_version_id) {
      return res.status(404).json({ error: 'Problem not found' });
    }

    // Idempotency: return existing submission if same (user_id, idempotency_key)
    const existing = database.prepare(
      'SELECT id FROM submissions WHERE user_id = ? AND idempotency_key = ?'
    ).get(u.id, idempotencyKey) as any;
    if (existing) {
      return res.status(200).json({ id: existing.id, idempotent: true });
    }

    // Check rate limit: 10 submissions/min/user
    const now = Date.now();
    const timestamps = (userRateLimits.get(u.id) || []).filter(t => now - t < RATE_LIMIT_WINDOW_MS);
    if (timestamps.length >= MAX_SUBMISSIONS_PER_WINDOW) {
      const oldestInWindow = timestamps[0];
      const retryAfterSec = Math.ceil((oldestInWindow + RATE_LIMIT_WINDOW_MS - now) / 1000);
      res.setHeader('Retry-After', String(Math.max(1, retryAfterSec)));
      return res.status(429).json({ error: 'Rate limit exceeded. Too many submissions.', retryAfter: retryAfterSec });
    }

    // Check in-flight quota: max pending submissions
    const pendingCount = database.prepare(
      "SELECT COUNT(*) AS c FROM submissions WHERE user_id = ? AND status IN ('QUEUED', 'COMPILING', 'RUNNING')"
    ).get(u.id) as any;
    if (pendingCount.c >= MAX_PENDING_SUBMISSIONS) {
      res.setHeader('Retry-After', '5');
      return res.status(429).json({ error: 'Too many pending submissions. Please wait for current submissions to finish.', retryAfter: 5 });
    }

    // Record submission timestamp for rate limiting
    timestamps.push(now);
    userRateLimits.set(u.id, timestamps);

    const createdAt = new Date().toISOString();
    const info = database.prepare(
      'INSERT INTO submissions (user_id, problem_version_id, language, source_code, status, idempotency_key, created_at) VALUES (?,?,?,?,?,?,?)'
    ).run(u.id, p.current_version_id, language, sourceCode, 'QUEUED', idempotencyKey, createdAt);

    const subId = Number(info.lastInsertRowid);
    createJudging(subId, database);

    res.status(201).json({ id: subId });
  });

  app.get('/api/submissions/:id', (req, res) => {
    const sub = database.prepare('SELECT id, user_id, problem_version_id, language, status, created_at FROM submissions WHERE id = ?').get(req.params.id) as any;
    if (!sub) return res.status(404).json({ error: 'Submission not found' });

    const judging = database.prepare(
      'SELECT id, attempt, status, verdict, score, max_score, runtime_ms, memory_kb, started_at, created_at FROM judgings WHERE submission_id = ? ORDER BY attempt DESC LIMIT 1'
    ).get(sub.id) as any;

    let testGroups: any[] = [];
    if (judging) {
      // Group results aggregated safely without exposing hidden inputs/outputs
      const tests = database.prepare(
        'SELECT group_name, test_index, verdict, runtime_ms, memory_kb FROM test_results WHERE judging_id = ? ORDER BY group_name, test_index'
      ).all(judging.id) as any[];

      const groupMap = new Map<string, any[]>();
      for (const t of tests) {
        if (!groupMap.has(t.group_name)) groupMap.set(t.group_name, []);
        groupMap.get(t.group_name)!.push({
          index: t.test_index,
          verdict: t.verdict,
          runtimeMs: t.runtime_ms,
          memoryKb: t.memory_kb,
        });
      }

      testGroups = Array.from(groupMap.entries()).map(([group, tests]) => ({ group, tests }));
    }

    res.json({
      submission: sub,
      judging: judging ?? null,
      groups: testGroups,
    });
  });

  app.get('/api/me/submissions', (req, res) => {
    const u = userFromReq(req);
    if (!u) return res.status(401).json({ error: 'unauthorized' });
    const rows = database.prepare(
      'SELECT id, problem_version_id, language, status, created_at FROM submissions WHERE user_id = ? ORDER BY id DESC'
    ).all(u.id);
    res.json(rows);
  });

  // --- Admin Endpoints ---

  app.post('/api/admin/problems', (req, res) => {
    const u = userFromReq(req);
    if (!u || u.role !== 'admin') return res.status(403).json({ error: 'forbidden' });

    const { slug, title, statementMd, timeLimitMs, memoryLimitMb } = req.body ?? {};
    if (!slug || !title || !statementMd) {
      return res.status(400).json({ error: 'Missing required problem fields' });
    }

    const tx = database.transaction(() => {
      const pInfo = database.prepare('INSERT INTO problems (slug, title) VALUES (?,?)').run(slug, title);
      const pid = Number(pInfo.lastInsertRowid);
      const vInfo = database.prepare(
        'INSERT INTO problem_versions (problem_id, statement_md, time_limit_ms, memory_limit_mb) VALUES (?,?,?,?)'
      ).run(pid, statementMd, timeLimitMs || 1000, memoryLimitMb || 256);
      const vid = Number(vInfo.lastInsertRowid);
      database.prepare('UPDATE problems SET current_version_id = ? WHERE id = ?').run(vid, pid);

      writeAuditLog(u.id, 'CREATE_PROBLEM', 'problems', pid, `Created problem ${slug}`);
      return pid;
    });

    const id = tx();
    res.status(201).json({ id });
  });

  app.post('/api/admin/problems/:id/test-package', (req, res) => {
    const u = userFromReq(req);
    if (!u || u.role !== 'admin') return res.status(403).json({ error: 'forbidden' });

    const p = database.prepare('SELECT current_version_id FROM problems WHERE id = ?').get(req.params.id) as any;
    if (!p || !p.current_version_id) return res.status(404).json({ error: 'Problem or version not found' });

    const { manifest, checksum } = req.body ?? {};
    if (!manifest || !checksum) {
      return res.status(400).json({ error: 'manifest and checksum are required' });
    }

    const info = database.prepare(
      'INSERT INTO test_packages (problem_version_id, manifest, checksum) VALUES (?,?,?)'
    ).run(p.current_version_id, typeof manifest === 'string' ? manifest : JSON.stringify(manifest), checksum);

    writeAuditLog(u.id, 'UPLOAD_TEST_PACKAGE', 'test_packages', Number(info.lastInsertRowid), `Checksum: ${checksum}`);
    res.status(201).json({ id: Number(info.lastInsertRowid) });
  });

  app.post('/api/admin/submissions/:id/rejudge', (req, res) => {
    const u = userFromReq(req);
    if (!u || u.role !== 'admin') return res.status(403).json({ error: 'forbidden' });

    const sub = database.prepare('SELECT id FROM submissions WHERE id = ?').get(req.params.id) as any;
    if (!sub) return res.status(404).json({ error: 'submission not found' });

    const judgingId = createJudging(sub.id, database);
    writeAuditLog(u.id, 'REJUDGE', 'submissions', sub.id, `Created judging attempt ID ${judgingId}`);

    res.json({ judgingId });
  });

  app.get('/api/admin/judge-health', async (req, res) => {
    const u = userFromReq(req);
    if (!u || u.role !== 'admin') return res.status(403).json({ error: 'forbidden' });

    const health = await judgeAdapter.health();
    const queueLength = database.prepare("SELECT COUNT(*) AS c FROM jobs WHERE state = 'QUEUED'").get() as any;
    const claimedCount = database.prepare("SELECT COUNT(*) AS c FROM jobs WHERE state = 'CLAIMED'").get() as any;
    const deadLetterCount = database.prepare("SELECT COUNT(*) AS c FROM jobs WHERE state = 'DEAD_LETTER'").get() as any;

    writeAuditLog(u.id, 'CHECK_HEALTH', 'system', null);

    res.json({
      engine: health,
      queue: {
        queued: queueLength.c,
        claimed: claimedCount.c,
        deadLetter: deadLetterCount.c,
      },
    });
  });

  return app;
}

export function startWorker(database = defaultDb, judgeAdapter = defaultAdapter, intervalMs = 500) {
  let isRunning = false;
  const timer = setInterval(async () => {
    if (isRunning) return;
    isRunning = true;
    try {
      let processed = true;
      while (processed) {
        processed = await processNextJob('worker-main', judgeAdapter, database);
      }
    } catch {
      // ignore
    } finally {
      isRunning = false;
    }
  }, intervalMs);
  return () => clearInterval(timer);
}

export const app = createApp();

if (process.env.NODE_ENV !== 'test') {
  const port = Number(process.env.PORT || 3000);
  app.listen(port, () => {
    console.log(`api listening on port ${port}`);
    startWorker();
    console.log('judge worker started and polling queue');
  });
}
