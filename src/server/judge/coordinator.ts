import Database from 'better-sqlite3';
import { db as defaultDb } from '../db.js';
import { JudgeAdapter } from './adapter.js';
import { FakeJudgeAdapter } from './fakeAdapter.js';
import { Judge0Adapter } from './judge0Adapter.js';
import { claimJob, completeJob, failJob, enqueueJob } from './jobQueue.js';

export const defaultAdapter: JudgeAdapter = process.env.JUDGE0_API_KEY
  ? new Judge0Adapter()
  : new FakeJudgeAdapter();

export function createJudging(submissionId: number, database: Database.Database = defaultDb): number {
  const last = database.prepare('SELECT COALESCE(MAX(attempt),0) AS a FROM judgings WHERE submission_id = ?').get(submissionId) as any;
  const now = new Date().toISOString();
  const info = database.prepare('INSERT INTO judgings (submission_id, attempt, status, engine_name, engine_version, created_at) VALUES (?,?,?,?,?,?)')
    .run(submissionId, last.a + 1, 'QUEUED', 'fake', '1.0', now);
  const judgingId = Number(info.lastInsertRowid);
  enqueueJob(judgingId, now, database);
  return judgingId;
}

export async function runJudging(
  judgingId: number,
  adapter: JudgeAdapter = defaultAdapter,
  database: Database.Database = defaultDb
) {
  const judging = database.prepare('SELECT * FROM judgings WHERE id = ?').get(judgingId) as any;
  if (!judging) throw new Error(`Judging ${judgingId} not found`);

  const submission = database.prepare('SELECT * FROM submissions WHERE id = ?').get(judging.submission_id) as any;
  const version = database.prepare('SELECT * FROM problem_versions WHERE id = ?').get(submission.problem_version_id) as any;

  const now = new Date().toISOString();
  database.prepare('UPDATE judgings SET status = ?, started_at = ? WHERE id = ?').run('COMPILING', now, judgingId);

  const { engineJobId } = await adapter.submit({
    judgingId: String(judgingId),
    problemSlug: '',
    language: submission.language,
    sourceCode: submission.source_code,
    timeLimitMs: version.time_limit_ms,
    memoryLimitMb: version.memory_limit_mb,
  });

  database.prepare('UPDATE judgings SET status = ? WHERE id = ?').run('RUNNING', judgingId);

  let status = await adapter.getStatus(engineJobId);
  let tries = 0;
  while (status.status !== 'DONE' && status.status !== 'JUDGE_ERROR' && tries < 60) {
    await new Promise(r => setTimeout(r, 100));
    status = await adapter.getStatus(engineJobId);
    tries++;
  }

  if (status.status === 'JUDGE_ERROR') {
    database.transaction(() => {
      database.prepare("UPDATE judgings SET status = 'JUDGE_ERROR', verdict = 'JUDGE_ERROR', error_message = ? WHERE id = ?")
        .run('Engine returned JUDGE_ERROR', judgingId);
      database.prepare("UPDATE submissions SET status = 'JUDGE_ERROR' WHERE id = ?").run(submission.id);
    })();
    return;
  }

  const result = await adapter.getResult(engineJobId);

  // Validate schema and value ranges
  if (result.score < 0 || result.maxScore < 0) {
    throw new Error(`Invalid score range: score=${result.score}, maxScore=${result.maxScore}`);
  }
  if ((result.runtimeMs !== null && result.runtimeMs < 0) || (result.memoryKb !== null && result.memoryKb < 0)) {
    throw new Error('Invalid runtime or memory range');
  }

  // Atomic write back to database
  database.transaction(() => {
    const insertTest = database.prepare(
      'INSERT INTO test_results (judging_id, group_name, test_index, verdict, runtime_ms, memory_kb) VALUES (?,?,?,?,?,?)'
    );
    for (const g of result.groups) {
      for (const t of g.tests) {
        insertTest.run(judgingId, g.group, t.index, t.verdict, t.runtimeMs, t.memoryKb);
      }
    }

    database.prepare(
      'UPDATE judgings SET status = ?, verdict = ?, score = ?, max_score = ?, runtime_ms = ?, memory_kb = ?, error_message = ? WHERE id = ?'
    ).run('DONE', result.verdict, result.score, result.maxScore, result.runtimeMs, result.memoryKb, result.compileMessage ?? null, judgingId);

    database.prepare('UPDATE submissions SET status = ? WHERE id = ?').run('DONE', submission.id);
  })();
}

export async function processNextJob(
  workerId: string,
  adapter: JudgeAdapter = defaultAdapter,
  database: Database.Database = defaultDb,
  maxAttempts: number = 3
): Promise<boolean> {
  const job = claimJob(workerId, database);
  if (!job) return false;

  try {
    await runJudging(job.judgingId, adapter, database);
    completeJob(job.id, database);
    return true;
  } catch (err: any) {
    const state = failJob(job.id, job.attempts, maxAttempts, 500, database);
    if (state === 'DEAD_LETTER') {
      // Mark judging and submission as JUDGE_ERROR so user sees the status and can resubmit
      database.transaction(() => {
        database.prepare("UPDATE judgings SET status = 'JUDGE_ERROR', verdict = 'JUDGE_ERROR', error_message = ? WHERE id = ?")
          .run(err?.message ?? 'Execution failed after max retries', job.judgingId);
        const judging = database.prepare('SELECT submission_id FROM judgings WHERE id = ?').get(job.judgingId) as any;
        if (judging) {
          database.prepare("UPDATE submissions SET status = 'JUDGE_ERROR' WHERE id = ?").run(judging.submission_id);
        }
      })();
    }
    return false;
  }
}

export function reconcileStaleJudgings(
  timeoutMs: number = 300000,
  maxAttempts: number = 3,
  database: Database.Database = defaultDb
): number {
  const cutoff = new Date(Date.now() - timeoutMs).toISOString();
  // Find judgings stuck in COMPILING or RUNNING
  const stale = database.prepare(
    "SELECT id, submission_id FROM judgings WHERE status IN ('COMPILING', 'RUNNING') AND started_at <= ?"
  ).all(cutoff) as Array<{ id: number; submission_id: number }>;

  for (const j of stale) {
    database.transaction(() => {
      // Mark as JUDGE_ERROR
      database.prepare("UPDATE judgings SET status = 'JUDGE_ERROR', verdict = 'JUDGE_ERROR', error_message = ? WHERE id = ?")
        .run(`Watchdog timeout: execution exceeded ${timeoutMs}ms`, j.id);
      database.prepare("UPDATE submissions SET status = 'JUDGE_ERROR' WHERE id = ?").run(j.submission_id);
      // Clean active jobs for this judging
      database.prepare("UPDATE jobs SET state = 'DEAD_LETTER' WHERE judging_id = ? AND state IN ('QUEUED', 'CLAIMED')").run(j.id);
    })();
  }

  return stale.length;
}
