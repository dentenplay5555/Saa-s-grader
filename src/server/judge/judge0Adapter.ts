import { JudgeAdapter, JudgeProgress, JudgeResult, JudgeSubmission } from './adapter.js';

const BASE = process.env.JUDGE0_URL || 'https://judge0-ce.p.rapidapi.com';
const KEY = process.env.JUDGE0_API_KEY || '';

const LANG: Record<string, number> = { 'C++17': 54, cpp: 54, 'c++': 54, c: 50 };

export class Judge0Adapter implements JudgeAdapter {
  private headers() {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (KEY) h['X-RapidAPI-Key'] = KEY;
    return h;
  }

  async submit(input: JudgeSubmission & { judgingId: string }) {
    const body = {
      source_code: Buffer.from(input.sourceCode).toString('base64'),
      language_id: LANG[input.language] ?? 54,
      cpu_time_limit: input.timeLimitMs / 1000,
      memory_limit: input.memoryLimitMb * 1024,
    };
    const r = await fetch(`${BASE}/submissions?base64_encoded=true&wait=false`, { method: 'POST', headers: this.headers(), body: JSON.stringify(body) });
    const j = await r.json();
    return { engineJobId: j.token };
  }

  async getStatus(engineJobId: string): Promise<JudgeProgress> {
    const r = await fetch(`${BASE}/submissions/${engineJobId}?base64_encoded=true&fields=status`, { headers: this.headers() });
    const j = await r.json();
    const id = j.status?.id ?? 1;
    if (id <= 2) return { status: 'QUEUED' };
    if (id === 3) return { status: 'DONE' };
    return { status: 'DONE' };
  }

  async getResult(engineJobId: string): Promise<JudgeResult> {
    const r = await fetch(`${BASE}/submissions/${engineJobId}?base64_encoded=true`, { headers: this.headers() });
    const j = await r.json();
    const sid = j.status?.id ?? 0;
    let verdict: JudgeResult['verdict'] = 'AC';
    if (sid === 4) verdict = 'WA';
    if (sid === 5) verdict = 'TLE';
    if (sid === 6) verdict = 'CE';
    if (sid === 7 || sid === 8 || sid === 9) verdict = sid === 7 ? 'MLE' : 'RE';
    if (sid === 10 || sid === 11) verdict = 'RE';
    const stdout = j.stdout ? Buffer.from(j.stdout, 'base64').toString() : '';
    const stderr = j.stderr ? Buffer.from(j.stderr, 'base64').toString() : '';
    return {
      verdict,
      score: verdict === 'AC' ? 100 : 0,
      maxScore: 100,
      runtimeMs: j.time ? Math.round(j.time * 1000) : null,
      memoryKb: j.memory ?? null,
      groups: [{ group: 'default', score: verdict === 'AC' ? 100 : 0, maxScore: 100, tests: [{ index: 0, verdict, runtimeMs: j.time ? Math.round(j.time * 1000) : null, memoryKb: j.memory ?? null }] }],
      compileMessage: j.compile_output ? Buffer.from(j.compile_output, 'base64').toString() : (stderr || undefined),
    };
  }

  async rejudge(engineJobId: string) { return { engineJobId }; }
  async cancel() {}
  async health() { return { ok: true, workers: 1, queued: 0 }; }
}
