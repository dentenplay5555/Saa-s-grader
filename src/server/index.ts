import express from 'express';
import { db } from './db.js';
import { createJudging, runJudging } from './judge/coordinator.js';

const app = express();
app.use(express.json());

function userFromReq(req: express.Request): { id: number; role: string } | null {
  const id = Number(req.header('X-User-Id'));
  if (!id) return null;
  const u = db.prepare('SELECT id, role FROM users WHERE id = ?').get(id) as any;
  return u ?? null;
}

app.get('/api/problems', (_req, res) => {
  const rows = db.prepare('SELECT id, slug, title FROM problems').all();
  res.json(rows);
});

app.get('/api/problems/:slug', (req, res) => {
  const p = db.prepare('SELECT * FROM problems WHERE slug = ?').get(req.params.slug) as any;
  if (!p) return res.status(404).json({ error: 'not found' });
  const v = db.prepare('SELECT id, statement_md, time_limit_ms, memory_limit_mb FROM problem_versions WHERE id = ?').get(p.current_version_id) as any;
  res.json({ ...p, version: v });
});

app.post('/api/submissions', (req, res) => {
  const u = userFromReq(req);
  if (!u) return res.status(401).json({ error: 'unauthorized' });
  const { problemSlug, language, sourceCode, idempotencyKey } = req.body ?? {};
  const p = db.prepare('SELECT * FROM problems WHERE slug = ?').get(problemSlug) as any;
  if (!p) return res.status(404).json({ error: 'problem not found' });
  const existing = db.prepare('SELECT id FROM submissions WHERE user_id = ? AND idempotency_key = ?').get(u.id, idempotencyKey) as any;
  if (existing) return res.status(200).json({ id: existing.id });
  const info = db.prepare('INSERT INTO submissions (user_id, problem_version_id, language, source_code, status, idempotency_key, created_at) VALUES (?,?,?,?,?,?,?)')
    .run(u.id, p.current_version_id, language, sourceCode, 'QUEUED', idempotencyKey, new Date().toISOString());
  const id = Number(info.lastInsertRowid);
  const judgingId = createJudging(id);
  void runJudging(judgingId);
  res.status(201).json({ id });
});

app.get('/api/submissions/:id', (req, res) => {
  const sub = db.prepare('SELECT * FROM submissions WHERE id = ?').get(req.params.id) as any;
  if (!sub) return res.status(404).json({ error: 'not found' });
  const judging = db.prepare('SELECT * FROM judgings WHERE submission_id = ? ORDER BY attempt DESC LIMIT 1').get(sub.id) as any;
  const tests = judging ? db.prepare('SELECT * FROM test_results WHERE judging_id = ?').all(judging.id) : [];
  res.json({ submission: sub, judging, tests });
});

app.get('/api/me/submissions', (req, res) => {
  const u = userFromReq(req);
  if (!u) return res.status(401).json({ error: 'unauthorized' });
  const rows = db.prepare('SELECT * FROM submissions WHERE user_id = ? ORDER BY id DESC').all(u.id);
  res.json(rows);
});

app.post('/api/admin/problems', (req, res) => {
  const u = userFromReq(req);
  if (!u || u.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
  const { slug, title, statementMd, timeLimitMs, memoryLimitMb } = req.body ?? {};
  const info = db.prepare('INSERT INTO problems (slug, title) VALUES (?,?)').run(slug, title);
  const pid = Number(info.lastInsertRowid);
  const v = db.prepare('INSERT INTO problem_versions (problem_id, statement_md, time_limit_ms, memory_limit_mb) VALUES (?,?,?,?)').run(pid, statementMd, timeLimitMs, memoryLimitMb);
  db.prepare('UPDATE problems SET current_version_id = ? WHERE id = ?').run(v.lastInsertRowid, pid);
  res.status(201).json({ id: pid });
});

app.post('/api/admin/submissions/:id/rejudge', (req, res) => {
  const u = userFromReq(req);
  if (!u || u.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
  const sub = db.prepare('SELECT id FROM submissions WHERE id = ?').get(req.params.id) as any;
  if (!sub) return res.status(404).json({ error: 'not found' });
  const judgingId = createJudging(sub.id);
  void runJudging(judgingId);
  res.json({ judgingId });
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`api listening on ${port}`));
