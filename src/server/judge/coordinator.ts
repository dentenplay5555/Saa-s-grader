import Database from 'better-sqlite3';
import { db as defaultDb } from '../db.js';
import { JudgeAdapter, TestCaseData, JudgeVerdict } from './adapter.js';
import { FakeJudgeAdapter } from './fakeAdapter.js';
import { Judge0Adapter } from './judge0Adapter.js';
import { claimJob, completeJob, failJob, enqueueJob, reclaimStaleJobs } from './jobQueue.js';
import { buildTestPlan, latestManifest, TestPlanError } from './testPlan.js';
import { evaluateSubmissionScore, GroupOutcome, SubtaskMode } from '../scoring.js';

function createDefaultAdapter(): JudgeAdapter {
  if (process.env.NODE_ENV === 'test') return new FakeJudgeAdapter();

  const wanted = process.env.JUDGE_ENGINE; // 'judge0' | 'fake' | undefined
  if (wanted !== 'fake' && (process.env.JUDGE0_API_KEY || process.env.JUDGE0_URL)) {
    return new Judge0Adapter();
  }

  if (wanted === 'fake') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JUDGE_ENGINE=fake is not allowed when NODE_ENV=production.');
    }
    console.warn('⚠️  JUDGE_ENGINE=fake: every submission is marked AC without running code. Local UI development only.');
    return new FakeJudgeAdapter();
  }

  throw new Error('No judge engine configured. Set JUDGE0_API_KEY (or JUDGE0_URL), or JUDGE_ENGINE=fake for local UI development.');
}

export const defaultAdapter: JudgeAdapter = createDefaultAdapter();

export function createJudging(
  submissionId: number,
  database: Database.Database = defaultDb,
  adapter: JudgeAdapter = defaultAdapter
): number {
  const last = database.prepare('SELECT COALESCE(MAX(attempt),0) AS a FROM judgings WHERE submission_id = ?').get(submissionId) as any;
  const now = new Date().toISOString();
  const info = database.prepare('INSERT INTO judgings (submission_id, attempt, status, engine_name, engine_version, created_at) VALUES (?,?,?,?,?,?)')
    .run(submissionId, last.a + 1, 'QUEUED', adapter.name, adapter.version, now);
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
  const problem = database.prepare('SELECT slug FROM problems WHERE id = ?').get(version.problem_id) as any;

  // Build the test plan. A problem without a valid test package can never be judged: fail closed.
  let plan;
  try {
    plan = buildTestPlan(latestManifest(database, version.id));
  } catch (err: any) {
    if (!(err instanceof TestPlanError)) throw err;
    database.transaction(() => {
      database.prepare("UPDATE judgings SET status = 'JUDGE_ERROR', verdict = 'JUDGE_ERROR', error_message = ?, started_at = COALESCE(started_at, ?) WHERE id = ?")
        .run(err.message, new Date().toISOString(), judgingId);
      database.prepare("UPDATE submissions SET status = 'JUDGE_ERROR' WHERE id = ?").run(submission.id);
    })();
    return; // deterministic failure: retrying cannot help
  }
  const { testCases, subtaskSpecs } = plan;

  const now = new Date().toISOString();
  const engineName = adapter.name || 'default';
  const engineVersion = adapter.version || '1.0';
  database.prepare('UPDATE judgings SET status = ?, started_at = ?, engine_name = ?, engine_version = ? WHERE id = ?')
    .run('COMPILING', now, engineName, engineVersion, judgingId);

  const { engineJobId } = await adapter.submit({
    judgingId: String(judgingId),
    problemSlug: problem?.slug || '',
    language: submission.language,
    sourceCode: submission.source_code,
    timeLimitMs: version.time_limit_ms,
    memoryLimitMb: version.memory_limit_mb,
    testCases,
  });

  database.prepare('UPDATE judgings SET status = ? WHERE id = ?').run('RUNNING', judgingId);

  let status = await adapter.getStatus(engineJobId);
  let tries = 0;
  while (status.status !== 'DONE' && status.status !== 'JUDGE_ERROR' && tries < 30) {
    await new Promise(r => setTimeout(r, 50));
    status = await adapter.getStatus(engineJobId);
    tries++;
  }

  // Handle timeout or failure explicitly - DO NOT assume AC or read unready result!
  if (status.status !== 'DONE') {
    if (status.status === 'JUDGE_ERROR') {
      database.transaction(() => {
        database.prepare("UPDATE judgings SET status = 'JUDGE_ERROR', verdict = 'JUDGE_ERROR', error_message = ? WHERE id = ?")
          .run('Engine returned JUDGE_ERROR', judgingId);
        database.prepare("UPDATE submissions SET status = 'JUDGE_ERROR' WHERE id = ?").run(submission.id);
      })();
      return;
    }
    // Still in RUNNING/QUEUED state: Engine timed out or hung!
    throw new Error(`Judge engine timeout: execution did not complete within timeout (status: ${status.status})`);
  }

  const result = await adapter.getResult(engineJobId);

  // Validate schema and value ranges
  if ((result.runtimeMs !== null && result.runtimeMs < 0) || (result.memoryKb !== null && result.memoryKb < 0)) {
    throw new Error('Invalid runtime or memory range');
  }

  // ====================================================================
  // SERVER-SIDE SCORING: Compute total score and overall verdict via scoring.ts
  // The adapter's self-reported score is NEVER blindly trusted.
  // ====================================================================
  const evaluatedGroups: GroupOutcome[] = [];

  if (subtaskSpecs.length > 0) {
    for (const spec of subtaskSpecs) {
      const adapterGroup = result.groups.find(g => g.group === spec.name) || result.groups[0];
      const groupTests = adapterGroup ? adapterGroup.tests : [];
      const testMaxScore = spec.testsCount > 0 ? spec.score / spec.testsCount : spec.score;

      evaluatedGroups.push({
        name: spec.name,
        mode: spec.mode,
        maxScore: spec.score,
        dependsOn: spec.dependsOn,
        tests: groupTests.map(t => ({
          index: t.index,
          verdict: t.verdict,
          score: t.verdict === 'AC' ? testMaxScore : 0,
          maxScore: testMaxScore,
          runtimeMs: t.runtimeMs,
          memoryKb: t.memoryKb,
        })),
      });
    }
  } else {
    // Default group fallback if no subtasks defined
    evaluatedGroups.push(...result.groups.map(g => ({
      name: g.group,
      mode: 'all' as SubtaskMode,
      maxScore: g.maxScore,
      tests: g.tests.map(t => ({
        index: t.index,
        verdict: t.verdict,
        score: t.verdict === 'AC' ? (g.maxScore / Math.max(1, g.tests.length)) : 0,
        maxScore: g.maxScore / Math.max(1, g.tests.length),
        runtimeMs: t.runtimeMs,
        memoryKb: t.memoryKb,
      })),
    })));
  }

  const scoreResult = evaluateSubmissionScore(evaluatedGroups);
  const totalScore = scoreResult.totalScore;
  const maxScore = scoreResult.maxScore > 0 ? scoreResult.maxScore : 100;

  // Determine overall verdict
  let overallVerdict: JudgeVerdict = 'AC';
  const allTests = result.groups.flatMap(g => g.tests);
  const hasCe = allTests.some(t => t.verdict === 'CE');
  const hasJudgeErr = allTests.some(t => t.verdict === 'JUDGE_ERROR');
  const allAc = allTests.length > 0 && allTests.every(t => t.verdict === 'AC');

  if (hasCe) {
    overallVerdict = 'CE';
  } else if (hasJudgeErr) {
    overallVerdict = 'JUDGE_ERROR';
  } else if (allAc) {
    overallVerdict = 'AC';
  } else if (totalScore > 0 && totalScore < maxScore) {
    overallVerdict = 'PARTIAL';
  } else {
    // Pick first failing test verdict
    const firstFail = allTests.find(t => t.verdict !== 'AC');
    overallVerdict = firstFail ? firstFail.verdict : 'WA';
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
    ).run('DONE', overallVerdict, totalScore, maxScore, result.runtimeMs, result.memoryKb, result.compileMessage ?? null, judgingId);

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
  // Reclaim stuck claimed jobs first
  reclaimStaleJobs(timeoutMs, database);

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
