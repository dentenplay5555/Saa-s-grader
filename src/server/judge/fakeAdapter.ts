import { acGroupsFor, JudgeAdapter, JudgeProgress, JudgeResult, JudgeSubmission } from './adapter.js';

export class FakeJudgeAdapter implements JudgeAdapter {
  readonly name = 'fake';
  readonly version = '1.0';
  private jobs = new Map<string, { status: JudgeProgress['status']; result: JudgeResult }>();

  async submit(input: JudgeSubmission & { judgingId: string }) {
    const engineJobId = `fake-${input.judgingId}`;
    this.jobs.set(engineJobId, {
      status: 'DONE',
      result: {
        verdict: 'AC',
        score: 100,
        maxScore: 100,
        runtimeMs: 12,
        memoryKb: 1024,
        groups: acGroupsFor(input.testCases, 'sample'),
      },
    });
    return { engineJobId };
  }

  async getStatus(engineJobId: string) {
    return { status: this.jobs.get(engineJobId)?.status ?? 'QUEUED' };
  }

  async getResult(engineJobId: string): Promise<JudgeResult> {
    const job = this.jobs.get(engineJobId);
    if (!job) throw new Error('unknown job');
    return job.result;
  }

  async rejudge(engineJobId: string) {
    return { engineJobId };
  }

  async cancel() {}

  async health() {
    return { ok: true, workers: 1, queued: 0 };
  }
}
