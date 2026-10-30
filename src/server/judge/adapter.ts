export type JudgeVerdict = 'AC' | 'WA' | 'TLE' | 'MLE' | 'RE' | 'CE' | 'OLE' | 'JUDGE_ERROR' | 'PARTIAL' | 'SKIPPED';

export interface TestCaseData {
  group: string;
  index: number;
  input: string;
  expectedOutput: string;
}

export interface JudgeSubmission {
  problemSlug: string;
  language: string;
  sourceCode: string;
  timeLimitMs: number;
  memoryLimitMb: number;
  testCases?: TestCaseData[];
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
  readonly name: string;
  readonly version: string;
  /** How often the coordinator polls getStatus (default 50ms). Remote engines should use something gentler. */
  readonly pollIntervalMs?: number;
  /** Max time the coordinator waits for DONE before treating the engine as hung (default 1500ms). */
  readonly maxWaitMs?: number;
  submit(input: JudgeSubmission & { judgingId: string }): Promise<{ engineJobId: string }>;
  getStatus(engineJobId: string): Promise<JudgeProgress>;
  getResult(engineJobId: string): Promise<JudgeResult>;
  rejudge(engineJobId: string): Promise<{ engineJobId: string }>;
  cancel(engineJobId: string): Promise<void>;
  health(): Promise<{ ok: boolean; workers: number; queued: number }>;
}

/** Groups the requested tests by subtask, all AC. Falls back to one sample test when none were requested. */
export function acGroupsFor(testCases: TestCaseData[] | undefined, fallbackGroup: string): JudgeResult['groups'] {
  if (!testCases || testCases.length === 0) {
    return [{ group: fallbackGroup, score: 100, maxScore: 100, tests: [{ index: 0, verdict: 'AC', runtimeMs: 5, memoryKb: 512 }] }];
  }
  const byGroup = new Map<string, TestCaseData[]>();
  for (const t of testCases) byGroup.set(t.group, [...(byGroup.get(t.group) ?? []), t]);
  return [...byGroup].map(([group, ts]) => ({
    group,
    score: 100,
    maxScore: 100,
    tests: ts.map(t => ({ index: t.index, verdict: 'AC' as const, runtimeMs: 5, memoryKb: 512 })),
  }));
}
