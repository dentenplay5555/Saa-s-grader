import Database from 'better-sqlite3';
import { db as defaultDb } from './db.js';

export interface StructuredLogContext {
  requestId?: string;
  submissionId?: number;
  judgingId?: number;
  userId?: number;
  action?: string;
  durationMs?: number;
  [key: string]: any;
}

export function log(level: 'info' | 'warn' | 'error', message: string, context?: StructuredLogContext) {
  const entry: Record<string, any> = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...context,
  };
  // Audit compliance: Never log raw user source code or credentials
  if (entry.sourceCode) delete entry.sourceCode;
  if (entry.password) delete entry.password;
  if (entry.token) delete entry.token;

  if (process.env.NODE_ENV !== 'test') {
    console.log(JSON.stringify(entry));
  }
  return entry;
}

export interface GraderMetrics {
  queueLength: number;
  claimedJobs: number;
  deadLetterJobs: number;
  totalJudgings: number;
  judgeErrorCount: number;
  judgeErrorRatePercent: number;
  p95WaitTimeMs: number;
  avgRuntimeMs: number;
  submissionsLastMinute: number;
}

export function collectMetrics(database: Database.Database = defaultDb): GraderMetrics {
  const qCount = database.prepare("SELECT COUNT(*) AS c FROM jobs WHERE state = 'QUEUED'").get() as any;
  const claimedCount = database.prepare("SELECT COUNT(*) AS c FROM jobs WHERE state = 'CLAIMED'").get() as any;
  const deadLetterCount = database.prepare("SELECT COUNT(*) AS c FROM jobs WHERE state = 'DEAD_LETTER'").get() as any;

  const totalJudgingsRow = database.prepare('SELECT COUNT(*) AS c FROM judgings').get() as any;
  const errorJudgingsRow = database.prepare("SELECT COUNT(*) AS c FROM judgings WHERE verdict = 'JUDGE_ERROR'").get() as any;

  const total = totalJudgingsRow.c || 0;
  const errors = errorJudgingsRow.c || 0;
  const errorRate = total > 0 ? Number(((errors / total) * 100).toFixed(2)) : 0;

  // Calculate wait time: from submission created_at to judging started_at
  const waitTimes = database.prepare(`
    SELECT (strftime('%s', j.started_at) - strftime('%s', s.created_at)) * 1000 AS wait_ms
    FROM judgings j
    JOIN submissions s ON j.submission_id = s.id
    WHERE j.started_at IS NOT NULL AND j.started_at >= s.created_at
    ORDER BY wait_ms ASC
  `).all().map((r: any) => Number(r.wait_ms)).filter(n => !isNaN(n) && n >= 0);

  let p95 = 0;
  if (waitTimes.length > 0) {
    const idx = Math.floor(waitTimes.length * 0.95);
    p95 = waitTimes[Math.min(idx, waitTimes.length - 1)];
  }

  const avgRuntime = database.prepare('SELECT AVG(runtime_ms) AS a FROM judgings WHERE runtime_ms IS NOT NULL').get() as any;

  const oneMinuteAgo = new Date(Date.now() - 60000).toISOString();
  const subLastMin = database.prepare('SELECT COUNT(*) AS c FROM submissions WHERE created_at >= ?').get(oneMinuteAgo) as any;

  return {
    queueLength: qCount.c,
    claimedJobs: claimedCount.c,
    deadLetterJobs: deadLetterCount.c,
    totalJudgings: total,
    judgeErrorCount: errors,
    judgeErrorRatePercent: errorRate,
    p95WaitTimeMs: p95,
    avgRuntimeMs: Math.round(avgRuntime.a || 0),
    submissionsLastMinute: subLastMin.c,
  };
}

export function evaluateAlerts(metrics: GraderMetrics): { hasAlert: boolean; alerts: string[] } {
  const alerts: string[] = [];

  if (metrics.deadLetterJobs > 0) {
    alerts.push(`DEAD_LETTER_JOBS: ${metrics.deadLetterJobs} job(s) in dead-letter queue`);
  }

  if (metrics.judgeErrorRatePercent > 10 && metrics.totalJudgings >= 5) {
    alerts.push(`HIGH_JUDGE_ERROR_RATE: Error rate is ${metrics.judgeErrorRatePercent}% (>10%)`);
  }

  if (metrics.queueLength > 50) {
    alerts.push(`QUEUE_BACKLOG: Queue has ${metrics.queueLength} pending jobs`);
  }

  return {
    hasAlert: alerts.length > 0,
    alerts,
  };
}
