export type SubtaskMode = 'all' | 'min' | 'sum';

export interface TestOutcome {
  index: number;
  verdict: 'AC' | 'WA' | 'TLE' | 'MLE' | 'RE' | 'CE' | 'OLE' | 'JUDGE_ERROR' | 'PARTIAL' | 'SKIPPED';
  score: number;
  maxScore: number;
  runtimeMs?: number | null;
  memoryKb?: number | null;
}

export interface GroupOutcome {
  name: string;
  mode: SubtaskMode;
  maxScore: number;
  dependsOn?: string[]; // Names of prerequisite subtasks that must be full score
  tests: TestOutcome[];
}

export function scoreGroup(group: GroupOutcome, passedPrereqs: Set<string> = new Set()): number {
  // If this group depends on other groups that didn't pass with full score, group gets 0
  if (group.dependsOn && group.dependsOn.length > 0) {
    const allPrereqsMet = group.dependsOn.every(prereq => passedPrereqs.has(prereq));
    if (!allPrereqsMet) {
      return 0;
    }
  }

  if (!group.tests || group.tests.length === 0) {
    return 0;
  }

  // Any skipped test makes the subtask fail or receive 0
  if (group.tests.some(t => t.verdict === 'SKIPPED')) {
    return 0;
  }

  const allAc = group.tests.every(t => t.verdict === 'AC');

  if (group.mode === 'all') {
    // All-or-nothing (TOI standard subtask)
    return allAc ? group.maxScore : 0;
  }

  if (group.mode === 'min') {
    if (allAc) return group.maxScore;
    const minTestScore = Math.min(...group.tests.map(t => t.score));
    return Math.max(0, minTestScore);
  }

  if (group.mode === 'sum') {
    // Sum of test scores that achieved AC
    const sum = group.tests.reduce((acc, t) => acc + (t.verdict === 'AC' ? t.score : 0), 0);
    return Math.min(group.maxScore, sum);
  }

  return 0;
}

export function evaluateSubmissionScore(groups: GroupOutcome[]): {
  totalScore: number;
  maxScore: number;
  groupScores: Record<string, number>;
} {
  const groupScores: Record<string, number> = {};
  const passedPrereqs = new Set<string>();
  let total = 0;
  let maxTotal = 0;

  // Process in order so dependencies can be tracked
  for (const group of groups) {
    maxTotal += group.maxScore;
    const score = scoreGroup(group, passedPrereqs);
    groupScores[group.name] = score;
    total += score;

    // Prerequisite met only if full maxScore is achieved
    if (score === group.maxScore && group.maxScore > 0) {
      passedPrereqs.add(group.name);
    }
  }

  return {
    totalScore: total,
    maxScore: maxTotal,
    groupScores,
  };
}

export function totalScore(groups: GroupOutcome[]): number {
  return evaluateSubmissionScore(groups).totalScore;
}
