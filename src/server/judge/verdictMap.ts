import { JudgeVerdict } from './adapter.js';

const table: Record<string, JudgeVerdict> = {
  AC: 'AC', WA: 'WA', TLE: 'TLE', MLE: 'MLE', RE: 'RE', CE: 'CE',
  OLE: 'OLE', 'JUDGE_ERROR': 'JUDGE_ERROR', PARTIAL: 'PARTIAL', SKIPPED: 'SKIPPED',
};

export function mapVerdict(raw: string): JudgeVerdict {
  const v = table[raw];
  if (!v) throw new Error(`unknown verdict: ${raw}`);
  return v;
}

export function isTerminal(v: JudgeVerdict): boolean {
  return v !== 'JUDGE_ERROR';
}
