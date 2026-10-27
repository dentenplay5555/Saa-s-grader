import { JudgeAdapter, JudgeProgress, JudgeResult, JudgeSubmission } from './adapter.js';

export type MockMode = 'success' | 'fail' | 'hang';

export class MockAdapter implements JudgeAdapter {
  readonly name = 'mock';
  readonly version = '1.0';
  constructor(private mode: MockMode = 'success') {}
  private jobs = new Map<string, { status: JudgeProgress['status']; result: JudgeResult }>();

  async submit(input: JudgeSubmission & { judgingId: string }) {
    const engineJobId = `mock-${input.judgingId}`;
    if (this.mode === 'fail') {
      this.jobs.set(engineJobId, { status: 'JUDGE_ERROR', result: { verdict: 'JUDGE_ERROR', score: 0, maxScore: 100, runtimeMs: null, memoryKb: null, groups: [] } });
    } else if (this.mode === 'hang') {
      this.jobs.set(engineJobId, { status: 'RUNNING', result: { verdict: 'AC', score: 100, maxScore: 100, runtimeMs: 1, memoryKb: 1, groups: [] } });
    } else {
      this.jobs.set(engineJobId, { status: 'DONE', result: { verdict: 'AC', score: 100, maxScore: 100, runtimeMs: 5, memoryKb: 512, groups: [{ group: 'g1', score: 100, maxScore: 100, tests: [{ index: 0, verdict: 'AC', runtimeMs: 5, memoryKb: 512 }] }] } });
    }
    return { engineJobId };
  }
  async getStatus(id: string) { return { status: this.jobs.get(id)?.status ?? 'QUEUED' }; }
  async getResult(id: string): Promise<JudgeResult> {
    const j = this.jobs.get(id);
    if (!j) throw new Error('unknown');
    return j.result;
  }
  async rejudge(id: string) { return { engineJobId: id }; }
  async cancel() {}
  async health() { return { ok: true, workers: 1, queued: 0 }; }
}
