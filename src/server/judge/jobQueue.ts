import Database from 'better-sqlite3';
import { db as defaultDb } from '../db.js';

export function enqueueJob(judgingId: number, runAfter = new Date().toISOString(), database: Database.Database = defaultDb) {
  // Idempotency: if job already exists for this judgingId in active/pending states, don't re-enqueue
  const existing = database.prepare("SELECT id FROM jobs WHERE judging_id = ? AND state IN ('QUEUED', 'CLAIMED')").get(judgingId);
  if (existing) return;

  database.prepare('INSERT INTO jobs (judging_id, state, attempts, run_after) VALUES (?,?,0,?)')
    .run(judgingId, 'QUEUED', runAfter);
}

export function claimJob(workerId: string, database: Database.Database = defaultDb): { id: number; judgingId: number; attempts: number } | null {
  const tx = database.transaction(() => {
    const row = database
      .prepare("SELECT id, judging_id, attempts FROM jobs WHERE state = 'QUEUED' AND run_after <= ? ORDER BY id LIMIT 1")
      .get(new Date().toISOString()) as any;
    if (!row) return null;

    const info = database
      .prepare("UPDATE jobs SET state = 'CLAIMED', locked_by = ?, locked_at = ? WHERE id = ? AND state = 'QUEUED'")
      .run(workerId, new Date().toISOString(), row.id);

    if (info.changes === 0) return null;
    return { id: row.id, judgingId: row.judging_id, attempts: row.attempts };
  });
  return tx();
}

export function completeJob(jobId: number, database: Database.Database = defaultDb) {
  database.prepare("UPDATE jobs SET state = 'DONE' WHERE id = ?").run(jobId);
}

export function failJob(
  jobId: number,
  attempts: number,
  maxAttempts: number = 3,
  backoffMs: number = 1000,
  database: Database.Database = defaultDb
) {
  const nextAttempts = attempts + 1;
  if (nextAttempts >= maxAttempts) {
    database.prepare("UPDATE jobs SET state = 'DEAD_LETTER', attempts = ? WHERE id = ?").run(nextAttempts, jobId);
    return 'DEAD_LETTER';
  }
  const runAfter = new Date(Date.now() + backoffMs * Math.pow(2, attempts)).toISOString();
  database
    .prepare("UPDATE jobs SET state = 'QUEUED', attempts = ?, run_after = ?, locked_by = NULL, locked_at = NULL WHERE id = ?")
    .run(nextAttempts, runAfter, jobId);
  return 'RETRY';
}

/**
 * Reclaims jobs that remained in CLAIMED state beyond stale threshold (e.g. worker process crashed).
 */
export function reclaimStaleJobs(staleAfterMs: number = 60000, database: Database.Database = defaultDb): number {
  const cutoff = new Date(Date.now() - staleAfterMs).toISOString();
  const info = database.prepare(
    "UPDATE jobs SET state = 'QUEUED', locked_by = NULL, locked_at = NULL WHERE state = 'CLAIMED' AND locked_at <= ?"
  ).run(cutoff);
  return info.changes;
}
