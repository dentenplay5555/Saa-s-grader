import { JudgeAdapter, JudgeProgress, JudgeResult, JudgeSubmission, JudgeVerdict, TestCaseData } from './adapter.js';

const BASE = process.env.JUDGE0_URL || 'https://judge0-ce.p.rapidapi.com';
const KEY = process.env.JUDGE0_API_KEY || '';

// Language IDs in Judge0 (50 = C GCC 9.2.0, 54 = C++ GCC 9.2.0)
const LANG: Record<string, number> = {
  'C17': 50,
  'c17': 50,
  'c': 50,
  'C': 50,
  'C++17': 54,
  'cpp17': 54,
  'cpp': 54,
  'c++': 54,
  'C++': 54,
};

interface StoredJob {
  judgingId: string;
  createdAt: number;
  submittingTokens: Array<{
    token: string;
    group: string;
    index: number;
  }>;
  /** tokens already seen in a final state, so later polls skip them */
  finished: Set<string>;
}

const JOB_TTL_MS = 60 * 60 * 1000;

export class Judge0Adapter implements JudgeAdapter {
  readonly name = 'judge0';
  readonly version = '1.13.0';

  // Remote engine: poll gently and wait long enough for a real queue (override with env).
  readonly pollIntervalMs = Number(process.env.JUDGE0_POLL_MS) || 500;
  readonly maxWaitMs = Number(process.env.JUDGE0_MAX_WAIT_MS) || 120_000;

  private activeJobs = new Map<string, StoredJob>();
  private byJudging = new Map<string, string>(); // judgingId -> engineJobId

  private headers() {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    // Self-hosted Judge0 with AUTHN_TOKEN set (see deploy/judge0/judge0.conf.example)
    const authToken = process.env.JUDGE0_AUTH_TOKEN;
    if (authToken) h['X-Auth-Token'] = authToken;
    // RapidAPI-hosted Judge0
    if (KEY) {
      h['X-RapidAPI-Key'] = KEY;
      if (BASE.includes('rapidapi.com')) h['X-RapidAPI-Host'] = new URL(BASE).host;
    }
    return h;
  }

  /**
   * Submits code to Judge0 for each test case with explicit stdin and expected_output.
   */
  async submit(input: JudgeSubmission & { judgingId: string }): Promise<{ engineJobId: string }> {
    const langId = LANG[input.language] ?? 54;
    if (!input.testCases || input.testCases.length === 0) {
      throw new Error('Judge0Adapter.submit called without test cases (refusing to judge against empty input)');
    }
    const testCases: TestCaseData[] = input.testCases;

    // Idempotent per judging: a retry after a poll timeout continues the SAME Judge0 submissions
    // instead of re-sending every test (which would also leave the old ones running on the engine).
    this.prune();
    const existing = this.byJudging.get(input.judgingId);
    if (existing && this.activeJobs.has(existing)) return { engineJobId: existing };

    const engineJobId = `j0-${input.judgingId}-${Date.now()}`;
    const submittingTokens: StoredJob['submittingTokens'] = [];

    for (const tc of testCases) {
      const body: Record<string, any> = {
        source_code: Buffer.from(input.sourceCode).toString('base64'),
        language_id: langId,
        cpu_time_limit: Math.max(0.1, input.timeLimitMs / 1000),
        memory_limit: input.memoryLimitMb * 1024,
      };

      if (tc.input !== undefined) {
        body.stdin = Buffer.from(tc.input).toString('base64');
      }
      if (tc.expectedOutput !== undefined) {
        body.expected_output = Buffer.from(tc.expectedOutput).toString('base64');
      }

      const r = await fetch(`${BASE}/submissions?base64_encoded=true&wait=false`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(body),
      });

      if (!r.ok) {
        const errText = await r.text().catch(() => '');
        throw new Error(`Judge0 submission failed HTTP ${r.status}: ${errText}`);
      }

      const j = await r.json();
      if (!j.token) {
        throw new Error(`Judge0 submission did not return token: ${JSON.stringify(j)}`);
      }

      submittingTokens.push({
        token: j.token,
        group: tc.group,
        index: tc.index,
      });
    }

    this.activeJobs.set(engineJobId, { judgingId: input.judgingId, createdAt: Date.now(), submittingTokens, finished: new Set() });
    this.byJudging.set(input.judgingId, engineJobId);
    return { engineJobId };
  }

  private prune() {
    const cutoff = Date.now() - JOB_TTL_MS;
    for (const [id, job] of this.activeJobs) {
      if (job.createdAt < cutoff) this.forget(id);
    }
  }

  private forget(engineJobId: string) {
    const job = this.activeJobs.get(engineJobId);
    if (job && this.byJudging.get(job.judgingId) === engineJobId) this.byJudging.delete(job.judgingId);
    this.activeJobs.delete(engineJobId);
  }

  /**
   * Polls all test case tokens for this submission.
   */
  async getStatus(engineJobId: string): Promise<JudgeProgress> {
    const job = this.activeJobs.get(engineJobId);
    if (!job) return { status: 'JUDGE_ERROR' };

    let allDone = true;
    for (const item of job.submittingTokens) {
      if (job.finished.has(item.token)) continue;
      const r = await fetch(`${BASE}/submissions/${item.token}?base64_encoded=true&fields=status`, {
        headers: this.headers(),
      });
      if (!r.ok) {
        return { status: 'JUDGE_ERROR' };
      }
      const j = await r.json();
      const sid = j.status?.id ?? 0;

      // 1 = In Queue, 2 = Processing
      if (sid === 1 || sid === 2) {
        return { status: 'RUNNING' };
      }
      // 13 = Internal Error, 14 = Exec Format Error
      if (sid === 13 || sid === 14) {
        this.forget(engineJobId); // a retry must resubmit from scratch
        return { status: 'JUDGE_ERROR' };
      }
      if (sid < 3) {
        allDone = false;
      } else {
        job.finished.add(item.token);
      }
    }

    return { status: allDone ? 'DONE' : 'RUNNING' };
  }

  /**
   * Maps Judge0 status IDs strictly and explicitly according to official documentation.
   * Never defaults unknown statuses to AC.
   */
  private mapStatus(sid: number): { verdict: JudgeVerdict; isError: boolean } {
    switch (sid) {
      case 3:
        return { verdict: 'AC', isError: false };
      case 4:
        return { verdict: 'WA', isError: false };
      case 5:
        return { verdict: 'TLE', isError: false };
      case 6:
        return { verdict: 'CE', isError: false };
      case 7: // Runtime Error (SIGSEGV)
      case 8: // Runtime Error (SIGXFSZ)
      case 9: // Runtime Error (SIGFPE)
      case 10: // Runtime Error (SIGABRT)
      case 11: // Runtime Error (NZEC)
      case 12: // Runtime Error (Other)
        return { verdict: 'RE', isError: false };
      case 13: // Internal Error
      case 14: // Exec Format Error
        return { verdict: 'JUDGE_ERROR', isError: true };
      default:
        // Any unknown status must be treated as JUDGE_ERROR
        return { verdict: 'JUDGE_ERROR', isError: true };
    }
  }

  /**
   * Retrieves results for each test case and groups them.
   */
  async getResult(engineJobId: string): Promise<JudgeResult> {
    const job = this.activeJobs.get(engineJobId);
    if (!job) throw new Error(`Unknown engineJobId: ${engineJobId}`);

    const groupMap = new Map<string, Array<{ index: number; verdict: JudgeVerdict; runtimeMs: number | null; memoryKb: number | null }>>();
    let maxRuntime = 0;
    let maxMemory = 0;
    let compileMessage: string | undefined = undefined;

    for (const item of job.submittingTokens) {
      const r = await fetch(`${BASE}/submissions/${item.token}?base64_encoded=true`, {
        headers: this.headers(),
      });
      if (!r.ok) {
        throw new Error(`Failed to fetch Judge0 result for token ${item.token}`);
      }
      const j = await r.json();
      const sid = j.status?.id ?? 0;
      const { verdict } = this.mapStatus(sid);

      const runtimeMs = j.time ? Math.round(j.time * 1000) : null;
      const memoryKb = j.memory ?? null;

      if (runtimeMs && runtimeMs > maxRuntime) maxRuntime = runtimeMs;
      if (memoryKb && memoryKb > maxMemory) maxMemory = memoryKb;

      if (!compileMessage && j.compile_output) {
        compileMessage = Buffer.from(j.compile_output, 'base64').toString('utf8');
      }

      if (!groupMap.has(item.group)) {
        groupMap.set(item.group, []);
      }
      groupMap.get(item.group)!.push({
        index: item.index,
        verdict,
        runtimeMs,
        memoryKb,
      });
    }

    const groups: JudgeResult['groups'] = [];
    for (const [groupName, tests] of groupMap.entries()) {
      const allAc = tests.every(t => t.verdict === 'AC');
      groups.push({
        group: groupName,
        score: allAc ? 100 : 0,
        maxScore: 100,
        tests,
      });
    }

    // Overall provisional verdict (Coordinator will recompute true score and verdict using scoring.ts)
    const hasCe = groups.some(g => g.tests.some(t => t.verdict === 'CE'));
    const hasJudgeErr = groups.some(g => g.tests.some(t => t.verdict === 'JUDGE_ERROR'));
    const allAc = groups.every(g => g.tests.every(t => t.verdict === 'AC'));

    let overallVerdict: JudgeVerdict = 'WA';
    if (hasCe) overallVerdict = 'CE';
    else if (hasJudgeErr) overallVerdict = 'JUDGE_ERROR';
    else if (allAc) overallVerdict = 'AC';

    return {
      verdict: overallVerdict,
      score: allAc ? 100 : 0,
      maxScore: 100,
      runtimeMs: maxRuntime || null,
      memoryKb: maxMemory || null,
      groups,
      compileMessage,
    };
  }

  async rejudge(engineJobId: string) {
    return { engineJobId };
  }

  async cancel(_engineJobId: string) {}

  async health() {
    return { ok: true, workers: 1, queued: 0 };
  }
}
