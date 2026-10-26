export type JudgeVerdict = 'AC' | 'WA' | 'TLE' | 'MLE' | 'RE' | 'CE' | 'PARTIAL';

export interface JudgeSubmission {
  problemSlug: string;
  language: string;
  sourceCode: string;
  timeLimitMs: number;
  memoryLimitMb: number;
}

export interface JudgeProgress {
  status: 'QUEUED' | 'COMPILING' | 'RUNNING' | 'DONE' | 'JUDGE_ERROR';
}

export interface JudgeResult {
  verdict: JudgeVerdict;
  score: number;
  maxScore: number;
  runtimeMs: number | null;
  memoryKb: number | null;
  groups: Array<{
    group: string;
    score: number;
    maxScore: number;
    tests: Array<{ index: number; verdict: JudgeVerdict; runtimeMs: number | null; memoryKb: number | null }>;
  }>;
  compileMessage?: string;
}

export interface JudgeAdapter {
  submit(input: JudgeSubmission & { judgingId: string }): Promise<{ engineJobId: string }>;
  getStatus(engineJobId: string): Promise<JudgeProgress>;
  getResult(engineJobId: string): Promise<JudgeResult>;
  rejudge(engineJobId: string): Promise<{ engineJobId: string }>;
  cancel(engineJobId: string): Promise<void>;
  health(): Promise<{ ok: boolean; workers: number; queued: number }>;
}
