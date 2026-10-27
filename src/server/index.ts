import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { db as defaultDb } from './db.js';
import { createJudging, defaultAdapter, processNextJob, reconcileStaleJudgings } from './judge/coordinator.js';
import { PlagiarismEngine } from './plagiarism/plagiarismEngine.js';
import { CodeAnalyzer } from './analysis/codeAnalyzer.js';
import { AuthUser, signAuthToken, userFromRequest } from './auth.js';

export function createApp(database = defaultDb, judgeAdapter = defaultAdapter) {
  const app = express();
  app.use(express.json({ limit: '128kb' }));

  // In-memory rate limiting tracker (per user: timestamp array)
  const userRateLimits = new Map<number, number[]>();
  const RATE_LIMIT_WINDOW_MS = 60 * 1000;
  const MAX_SUBMISSIONS_PER_WINDOW = 10;
  const MAX_PENDING_SUBMISSIONS = 3;
  const MAX_SOURCE_CODE_BYTES = 64 * 1024; // 64KB

  function userFromReq(req: express.Request): AuthUser | null {
    return userFromRequest(req, database);
  }

  function writeAuditLog(actorId: number | null, action: string, targetType: string, targetId: number | null, detail?: string) {
    database.prepare(
      'INSERT INTO audit_logs (actor_id, action, target_type, target_id, created_at, detail) VALUES (?,?,?,?,?,?)'
    ).run(actorId, action, targetType, targetId, new Date().toISOString(), detail ?? null);
  }

  // --- Authentication Endpoints ---

  app.post('/api/auth/login', (req, res) => {
    const { email, userId } = req.body ?? {};
    let user: any = null;

    if (userId) {
      user = database.prepare('SELECT id, email, name, role FROM users WHERE id = ?').get(userId);
    } else if (email) {
      user = database.prepare('SELECT id, email, name, role FROM users WHERE email = ?').get(email);
    }

    if (!user) {
      return res.status(401).json({ error: 'User not found or invalid credentials' });
    }

    const token = signAuthToken(user);
    res.setHeader('Set-Cookie', `session=${token}; Path=/; HttpOnly; SameSite=Lax`);
    res.json({ ok: true, token, user });
  });

  app.post('/api/auth/logout', (_req, res) => {
    res.setHeader('Set-Cookie', 'session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT');
    res.json({ ok: true });
  });

  app.get('/api/auth/me', (req, res) => {
    const u = userFromReq(req);
    res.json({ user: u });
  });

  // --- Public / Student Endpoints ---

  app.get('/api/problems', (_req, res) => {
    const rows = database.prepare('SELECT id, slug, title FROM problems').all();
    res.json(rows);
  });

  app.get('/api/problems/:slug', (req, res) => {
    const p = database.prepare('SELECT * FROM problems WHERE slug = ?').get(req.params.slug) as any;
    if (!p) return res.status(404).json({ error: 'Problem not found' });

    const v = database.prepare(
      'SELECT id, statement_md, time_limit_ms, memory_limit_mb, difficulty, tags_json, hints_json, editorial_md FROM problem_versions WHERE id = ?'
    ).get(p.current_version_id) as any;

    // Never return hidden test package details to client
    const tags = v?.tags_json ? JSON.parse(v.tags_json) : [];
    const hints = v?.hints_json ? JSON.parse(v.hints_json) : [];

    res.json({
      id: p.id,
      slug: p.slug,
      title: p.title,
      difficulty: v?.difficulty || 'D1',
      tags,
      hints,
      editorial: v?.editorial_md || null,
      version: v ? {
        id: v.id,
        statement_md: v.statement_md,
        time_limit_ms: v.time_limit_ms,
        memory_limit_mb: v.memory_limit_mb,
      } : null,
    });
  });

  // --- Curriculum Endpoints ---

  app.get('/api/tracks', (_req, res) => {
    const tracks = database.prepare('SELECT id, slug, title, description FROM tracks').all() as any[];
    const result = tracks.map(t => {
      const count = database.prepare('SELECT COUNT(*) AS c FROM track_lessons WHERE track_id = ?').get(t.id) as any;
      return { ...t, lessonCount: count.c };
    });
    res.json(result);
  });

  app.get('/api/tracks/:slug', (req, res) => {
    const u = userFromReq(req);
    const track = database.prepare('SELECT * FROM tracks WHERE slug = ?').get(req.params.slug) as any;
    if (!track) return res.status(404).json({ error: 'Track not found' });

    const lessons = database.prepare(`
      SELECT l.id, l.slug, l.stage, l.topic, l.title, l.summary, l.difficulty, l.estimated_minutes, tl.position
      FROM track_lessons tl
      JOIN lessons l ON tl.lesson_id = l.id
      WHERE tl.track_id = ?
      ORDER BY tl.position ASC
    `).all(track.id) as any[];

    // Annotate with user progress if logged in
    const progressMap = new Map<number, string>();
    if (u) {
      const progressList = database.prepare('SELECT lesson_id, status FROM lesson_progress WHERE user_id = ?').all(u.id) as any[];
      for (const p of progressList) {
        progressMap.set(p.lesson_id, p.status);
      }
    }

    const annotatedLessons = lessons.map(l => ({
      ...l,
      userProgress: progressMap.get(l.id) || 'not_started',
    }));

    res.json({
      track: {
        id: track.id,
        slug: track.slug,
        title: track.title,
        description: track.description,
      },
      lessons: annotatedLessons,
    });
  });

  app.get('/api/lessons', (req, res) => {
    const stage = req.query.stage !== undefined ? Number(req.query.stage) : undefined;
    const track = req.query.track as string | undefined;
    const difficulty = req.query.difficulty as string | undefined;
    const q = req.query.q as string | undefined;

    let query = 'SELECT id, slug, stage, track_compatibility, topic, title, summary, difficulty, estimated_minutes FROM lessons WHERE published = 1';
    const params: any[] = [];

    if (stage !== undefined && !isNaN(stage)) {
      query += ' AND stage = ?';
      params.push(stage);
    }
    if (track) {
      query += " AND (track_compatibility = ? OR track_compatibility = 'both')";
      params.push(track);
    }
    if (difficulty) {
      query += ' AND difficulty = ?';
      params.push(difficulty);
    }
    if (q) {
      query += ' AND (title LIKE ? OR summary LIKE ? OR topic LIKE ?)';
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }

    query += ' ORDER BY stage ASC, id ASC';
    const rows = database.prepare(query).all(...params);
    res.json(rows);
  });

  app.get('/api/lessons/:slug', (req, res) => {
    const u = userFromReq(req);
    const l = database.prepare('SELECT * FROM lessons WHERE slug = ? AND published = 1').get(req.params.slug) as any;
    if (!l) return res.status(404).json({ error: 'Lesson not found' });

    // Parse JSON fields
    const prerequisites = JSON.parse(l.prerequisites_json || '[]');
    const learningObjectives = JSON.parse(l.learning_objectives_json || '[]');
    const sections = JSON.parse(l.content_json || '{}');
    const codeExamples = JSON.parse(l.code_examples_json || '[]');
    const masteryCriteria = JSON.parse(l.mastery_criteria_json || '[]');

    // Fetch linked exercises / problems
    const linkedProblems = database.prepare(`
      SELECT p.id, p.slug, p.title, pv.difficulty, lp.role, lp.position
      FROM lesson_problems lp
      JOIN problems p ON lp.problem_id = p.id
      LEFT JOIN problem_versions pv ON p.current_version_id = pv.id
      WHERE lp.lesson_id = ?
      ORDER BY lp.position ASC
    `).all(l.id) as any[];

    let userProgress = 'not_started';
    if (u) {
      const prog = database.prepare('SELECT status FROM lesson_progress WHERE user_id = ? AND lesson_id = ?').get(u.id, l.id) as any;
      if (prog) userProgress = prog.status;
    }

    res.json({
      id: l.id,
      slug: l.slug,
      stage: l.stage,
      trackCompatibility: l.track_compatibility,
      topic: l.topic,
      title: l.title,
      summary: l.summary,
      difficulty: l.difficulty,
      estimatedMinutes: l.estimated_minutes,
      prerequisites,
      learningObjectives,
      sections,
      codeExamples,
      masteryCriteria,
      problems: linkedProblems,
      userProgress,
      version: l.version,
    });
  });

  app.post('/api/lessons/:slug/progress', (req, res) => {
    const u = userFromReq(req);
    if (!u) return res.status(401).json({ error: 'unauthorized' });

    const l = database.prepare('SELECT id FROM lessons WHERE slug = ?').get(req.params.slug) as any;
    if (!l) return res.status(404).json({ error: 'Lesson not found' });

    const { status } = req.body ?? {};
    if (!status || !['not_started', 'in_progress', 'completed'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const now = new Date().toISOString();
    const completedAt = status === 'completed' ? now : null;

    // Spec rule: "completed ไม่ย้อนกลับ" - Once marked completed, status never regresses to in_progress or not_started
    database.prepare(`
      INSERT INTO lesson_progress (user_id, lesson_id, status, last_accessed_at, completed_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id, lesson_id) DO UPDATE SET
        status = CASE WHEN lesson_progress.status = 'completed' THEN 'completed' ELSE excluded.status END,
        last_accessed_at = excluded.last_accessed_at,
        completed_at = COALESCE(lesson_progress.completed_at, excluded.completed_at)
    `).run(u.id, l.id, status, now, completedAt);

    writeAuditLog(u.id, 'UPDATE_PROGRESS', 'lessons', l.id, `Status updated (requested: ${status})`);
    res.json({ ok: true, status, completedAt });
  });

  app.get('/api/me/curriculum-progress', (req, res) => {
    const u = userFromReq(req);
    if (!u) return res.status(401).json({ error: 'unauthorized' });

    const totalLessons = (database.prepare('SELECT COUNT(*) AS c FROM lessons WHERE published = 1').get() as any).c;
    const completedLessons = (database.prepare("SELECT COUNT(*) AS c FROM lesson_progress WHERE user_id = ? AND status = 'completed'").get(u.id) as any).c;

    const progressByStage = database.prepare(`
      SELECT l.stage, COUNT(l.id) AS total,
             SUM(CASE WHEN lp.status = 'completed' THEN 1 ELSE 0 END) AS completed
      FROM lessons l
      LEFT JOIN lesson_progress lp ON l.id = lp.lesson_id AND lp.user_id = ?
      WHERE l.published = 1
      GROUP BY l.stage
      ORDER BY l.stage ASC
    `).all(u.id);

    const recentActivity = database.prepare(`
      SELECT l.slug, l.title, l.stage, lp.status, lp.last_accessed_at
      FROM lesson_progress lp
      JOIN lessons l ON lp.lesson_id = l.id
      WHERE lp.user_id = ?
      ORDER BY lp.last_accessed_at DESC
      LIMIT 5
    `).all(u.id);

    res.json({
      totalLessons,
      completedLessons,
      overallPercentage: totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0,
      stages: progressByStage,
      recentActivity,
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
    createJudging(subId, database, judgeAdapter);

    res.status(201).json({ id: subId });
  });

  // Authorization checked: only the submission author or an admin can view submission details
  app.get('/api/submissions/:id', (req, res) => {
    const u = userFromReq(req);
    if (!u) return res.status(401).json({ error: 'unauthorized' });

    const sub = database.prepare('SELECT id, user_id, problem_version_id, language, status, created_at FROM submissions WHERE id = ?').get(req.params.id) as any;
    if (!sub) return res.status(404).json({ error: 'Submission not found' });

    if (u.role !== 'admin' && u.id !== sub.user_id) {
      return res.status(403).json({ error: 'forbidden' });
    }

    const judging = database.prepare(
      'SELECT id, attempt, status, verdict, score, max_score, runtime_ms, memory_kb, started_at, created_at FROM judgings WHERE submission_id = ? ORDER BY attempt DESC LIMIT 1'
    ).get(sub.id) as any;

    let testGroups: any[] = [];
    if (judging) {
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

    const pid = tx();
    res.status(201).json({ id: pid, slug });
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
    if (!sub) return res.status(404).json({ error: 'Submission not found' });

    const jid = createJudging(sub.id, database, judgeAdapter);
    database.prepare("UPDATE submissions SET status = 'QUEUED' WHERE id = ?").run(sub.id);

    writeAuditLog(u.id, 'REJUDGE', 'submissions', sub.id, `Created judging ${jid}`);
    res.status(202).json({ judgingId: jid });
  });

  app.post('/api/admin/rejudge', (req, res) => {
    const u = userFromReq(req);
    if (!u || u.role !== 'admin') return res.status(403).json({ error: 'forbidden' });

    const { submissionId } = req.body ?? {};
    if (!submissionId) return res.status(400).json({ error: 'Missing submissionId' });

    const sub = database.prepare('SELECT id FROM submissions WHERE id = ?').get(submissionId) as any;
    if (!sub) return res.status(404).json({ error: 'Submission not found' });

    const jid = createJudging(submissionId, database, judgeAdapter);
    database.prepare("UPDATE submissions SET status = 'QUEUED' WHERE id = ?").run(submissionId);

    writeAuditLog(u.id, 'REJUDGE', 'submissions', submissionId, `Created judging ${jid}`);
    res.status(202).json({ judgingId: jid });
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

  // --- Task 14: Plagiarism & Code Analysis Endpoints ---

  app.post('/api/admin/similarity/run', (req, res) => {
    const u = userFromReq(req);
    if (!u || u.role !== 'admin') return res.status(403).json({ error: 'forbidden' });

    const { problemId, threshold } = req.body ?? {};
    if (!problemId) return res.status(400).json({ error: 'problemId is required' });

    const thresh = typeof threshold === 'number' ? threshold : 0.70;
    const report = PlagiarismEngine.runBatch(database, Number(problemId), thresh, u.id);
    res.status(201).json(report);
  });

  app.get('/api/admin/similarity/reports/:id', (req, res) => {
    const u = userFromReq(req);
    if (!u || u.role !== 'admin') return res.status(403).json({ error: 'forbidden' });

    const report = database.prepare('SELECT * FROM similarity_reports WHERE id = ?').get(req.params.id) as any;
    if (!report) return res.status(404).json({ error: 'Report not found' });

    const pairs = database.prepare(`
      SELECT id, submission_a, submission_b, score, matched_tokens, reviewed_status, reviewed_by, updated_at, note
      FROM similarity_pairs WHERE report_id = ? ORDER BY score DESC
    `).all(report.id);

    res.json({ report, pairs });
  });

  app.patch('/api/admin/similarity/pairs/:id', (req, res) => {
    const u = userFromReq(req);
    if (!u || u.role !== 'admin') return res.status(403).json({ error: 'forbidden' });

    const { reviewed_status, note } = req.body ?? {};
    if (!reviewed_status || !['pending', 'cleared', 'confirmed'].includes(reviewed_status)) {
      return res.status(400).json({ error: 'Invalid reviewed_status' });
    }

    database.prepare(`
      UPDATE similarity_pairs
      SET reviewed_status = ?, reviewed_by = ?, updated_at = datetime('now'), note = ?
      WHERE id = ?
    `).run(reviewed_status, u.id, note || null, req.params.id);

    writeAuditLog(u.id, 'REVIEW_PLAGIARISM_PAIR', 'similarity_pairs', Number(req.params.id), `Status: ${reviewed_status}`);
    res.json({ ok: true, id: req.params.id, reviewed_status });
  });

  app.get('/api/submissions/:id/hints', (req, res) => {
    const u = userFromReq(req);
    if (!u) return res.status(401).json({ error: 'unauthorized' });

    const sub = database.prepare('SELECT id, user_id, problem_version_id, source_code FROM submissions WHERE id = ?').get(req.params.id) as any;
    if (!sub) return res.status(404).json({ error: 'Submission not found' });

    if (u.role !== 'admin' && u.id !== sub.user_id) {
      return res.status(403).json({ error: 'forbidden' });
    }

    const pv = database.prepare('SELECT tags_json FROM problem_versions WHERE id = ?').get(sub.problem_version_id) as any;
    const tags: string[] = pv?.tags_json ? JSON.parse(pv.tags_json) : [];

    const hints = CodeAnalyzer.analyze(sub.source_code, tags);
    res.json({ submissionId: sub.id, hints });
  });

  // --- Task 16: Local Bridge Integration Endpoints ---

  app.post('/api/bridge/pair', (req, res) => {
    const u = userFromReq(req);
    if (!u) return res.status(401).json({ error: 'unauthorized' });

    const { deviceName } = req.body ?? {};
    const rawToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 mins expiry

    const info = database.prepare(`
      INSERT INTO bridge_tokens (user_id, token, device_name, expires_at)
      VALUES (?, ?, ?, ?)
    `).run(u.id, rawToken, deviceName || 'Local Machine', expiresAt);

    writeAuditLog(u.id, 'PAIR_BRIDGE', 'bridge_tokens', Number(info.lastInsertRowid), `Device: ${deviceName}`);

    res.status(201).json({
      id: info.lastInsertRowid,
      pairingToken: rawToken,
      expiresAt,
    });
  });

  app.delete('/api/bridge/pair/:id', (req, res) => {
    const u = userFromReq(req);
    if (!u) return res.status(401).json({ error: 'unauthorized' });

    const tokenRow = database.prepare('SELECT id, user_id FROM bridge_tokens WHERE id = ?').get(req.params.id) as any;
    if (!tokenRow) return res.status(404).json({ error: 'Token not found' });
    if (u.role !== 'admin' && tokenRow.user_id !== u.id) return res.status(403).json({ error: 'forbidden' });

    database.prepare("UPDATE bridge_tokens SET revoked_at = datetime('now') WHERE id = ?").run(tokenRow.id);
    writeAuditLog(u.id, 'REVOKE_BRIDGE', 'bridge_tokens', tokenRow.id);
    res.json({ ok: true, revokedId: tokenRow.id });
  });

  app.get('/api/problems/:slug/package', (req, res) => {
    const p = database.prepare('SELECT id, slug, title, current_version_id FROM problems WHERE slug = ?').get(req.params.slug) as any;
    if (!p) return res.status(404).json({ error: 'Problem not found' });

    const v = database.prepare(`
      SELECT id, statement_md, time_limit_ms, memory_limit_mb
      FROM problem_versions WHERE id = ?
    `).get(p.current_version_id) as any;

    if (!v) return res.status(404).json({ error: 'Problem version not found' });

    const pkg = database.prepare('SELECT manifest FROM test_packages WHERE problem_version_id = ?').get(v.id) as any;
    const manifest = pkg?.manifest ? JSON.parse(pkg.manifest) : null;
    const samples = manifest?.publicSamples || [
      { index: 1, input: "2 3\n", output: "5\n" }
    ];

    const starterTemplate = `// Solution for: ${p.title}\n#include <iostream>\nusing namespace std;\n\nint main() {\n    ios_base::sync_with_stdio(false);\n    cin.tie(NULL);\n    // Write your code here\n    return 0;\n}\n`;

    res.json({
      problemSlug: p.slug,
      title: p.title,
      versionId: v.id,
      statementMd: v.statement_md,
      timeLimitMs: v.time_limit_ms,
      memoryLimitMb: v.memory_limit_mb,
      starterCode: starterTemplate,
      samples,
    });
  });

  // --- Task 17: User Settings (Split/Focus Layout) ---

  app.get('/api/me/settings', (req, res) => {
    const u = userFromReq(req);
    if (!u) return res.status(401).json({ error: 'unauthorized' });

    const rows = database.prepare('SELECT key, value_json FROM user_settings WHERE user_id = ?').all(u.id) as any[];
    const settings: Record<string, any> = {};
    for (const r of rows) {
      try { settings[r.key] = JSON.parse(r.value_json); } catch { settings[r.key] = r.value_json; }
    }
    res.json(settings);
  });

  app.post('/api/me/settings', (req, res) => {
    const u = userFromReq(req);
    if (!u) return res.status(401).json({ error: 'unauthorized' });

    const { key, value } = req.body ?? {};
    if (!key) return res.status(400).json({ error: 'key is required' });

    const valueJson = typeof value === 'string' ? value : JSON.stringify(value);
    database.prepare(`
      INSERT INTO user_settings (user_id, key, value_json, updated_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(user_id, key) DO UPDATE SET value_json = excluded.value_json, updated_at = datetime('now')
    `).run(u.id, key, valueJson);

    res.json({ ok: true, key, value });
  });

  // Centralized JSON Error Handler: Never return raw HTML stack traces
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err?.code === 'SQLITE_CONSTRAINT_UNIQUE' || err?.message?.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'Conflict: A resource with this identifier already exists' });
    }
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  });

  // Serve production web application bundle if built
  const webDist = path.join(process.cwd(), 'dist', 'web');
  if (fs.existsSync(webDist)) {
    app.use(express.static(webDist));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      res.sendFile(path.join(webDist, 'index.html'));
    });
  }

  return app;
}

export function startWorker(database = defaultDb, judgeAdapter = defaultAdapter, intervalMs = 500) {
  let isRunning = false;
  let watchdogCounter = 0;

  const timer = setInterval(async () => {
    // Run watchdog every 30 seconds (~60 ticks at 500ms)
    watchdogCounter++;
    if (watchdogCounter >= 60) {
      watchdogCounter = 0;
      try {
        reconcileStaleJudgings(120000, 3, database);
      } catch {
        // ignore watchdog error
      }
    }

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
