import { db } from '../db.js';
import { FakeJudgeAdapter } from './fakeAdapter.js';

const adapter = new FakeJudgeAdapter();

export async function runJudging(judgingId: number) {
  const judging = db.prepare('SELECT * FROM judgings WHERE id = ?').get(judgingId) as any;
  const submission = db.prepare('SELECT * FROM submissions WHERE id = ?').get(judging.submission_id) as any;
  const version = db.prepare('SELECT * FROM problem_versions WHERE id = ?').get(submission.problem_version_id) as any;

  db.prepare('UPDATE judgings SET status = ? WHERE id = ?').run('COMPILING', judgingId);

  const { engineJobId } = await adapter.submit({
    judgingId: String(judgingId),
    problemSlug: '',
    language: submission.language,
    sourceCode: submission.source_code,
    timeLimitMs: version.time_limit_ms,
    memoryLimitMb: version.memory_limit_mb,
  });

  db.prepare('UPDATE judgings SET status = ? WHERE id = ?').run('RUNNING', judgingId);

  const result = await adapter.getResult(engineJobId);

  const insert = db.prepare('INSERT INTO test_results (judging_id, group_name, test_index, verdict, runtime_ms, memory_kb) VALUES (?,?,?,?,?,?)');
  for (const g of result.groups) {
    for (const t of g.tests) {
      insert.run(judgingId, g.group, t.index, t.verdict, t.runtimeMs, t.memoryKb);
    }
  }

  db.prepare('UPDATE judgings SET status = ?, verdict = ?, score = ?, max_score = ?, runtime_ms = ?, memory_kb = ?, error_message = ? WHERE id = ?')
    .run('DONE', result.verdict, result.score, result.maxScore, result.runtimeMs, result.memoryKb, result.compileMessage ?? null, judgingId);

  db.prepare('UPDATE submissions SET status = ? WHERE id = ?').run('DONE', submission.id);
}

export function createJudging(submissionId: number): number {
  const last = db.prepare('SELECT COALESCE(MAX(attempt),0) AS a FROM judgings WHERE submission_id = ?').get(submissionId) as any;
  const info = db.prepare('INSERT INTO judgings (submission_id, attempt, status, engine_name) VALUES (?,?,?,?)')
    .run(submissionId, last.a + 1, 'QUEUED', 'fake');
  return Number(info.lastInsertRowid);
}
