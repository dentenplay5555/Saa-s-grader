import { z } from 'zod';
import type { TestCaseData } from './adapter.js';
import type { SubtaskMode } from '../scoring.js';

const testSchema = z.object({
  index: z.number().int().nonnegative(),
  input: z.string(),
  expectedOutput: z.string(),
});

const subtaskSchema = z.object({
  name: z.string().min(1),
  score: z.number().min(0),
  mode: z.enum(['all', 'min', 'sum']).optional(),
  dependsOn: z.array(z.string()).optional(),
  tests: z.array(testSchema).min(1, 'each subtask needs at least one test'),
});

export const manifestSchema = z
  .object({
    subtasks: z.array(subtaskSchema).min(1, 'manifest needs at least one subtask'),
  })
  .passthrough()
  .superRefine((m, ctx) => {
    const names = new Set<string>();
    for (const st of m.subtasks) {
      if (names.has(st.name)) ctx.addIssue({ code: 'custom', message: `duplicate subtask name: ${st.name}` });
      names.add(st.name);
    }
    for (const st of m.subtasks) {
      for (const dep of st.dependsOn ?? []) {
        if (!names.has(dep)) ctx.addIssue({ code: 'custom', message: `subtask ${st.name} depends on unknown subtask ${dep}` });
      }
    }
    if (!m.subtasks.some(s => s.score > 0)) ctx.addIssue({ code: 'custom', message: 'total score must be > 0' });
  });

export interface TestPlan {
  testCases: TestCaseData[];
  subtaskSpecs: Array<{ name: string; score: number; mode: SubtaskMode; dependsOn?: string[]; testsCount: number }>;
}

export class TestPlanError extends Error {}

/** Parses + validates a stored manifest. Throws TestPlanError when the problem cannot be judged. Never returns an empty plan. */
export function buildTestPlan(manifestJson: string | null | undefined): TestPlan {
  if (!manifestJson) throw new TestPlanError('No test package uploaded for this problem version');
  let raw: unknown;
  try {
    raw = JSON.parse(manifestJson);
  } catch {
    throw new TestPlanError('Test package manifest is not valid JSON');
  }
  const parsed = manifestSchema.safeParse(raw);
  if (!parsed.success) {
    throw new TestPlanError(`Invalid test package: ${parsed.error.issues.map(i => `${i.path.join('.') || 'manifest'}: ${i.message}`).join('; ')}`);
  }
  const plan: TestPlan = { testCases: [], subtaskSpecs: [] };
  for (const st of parsed.data.subtasks) {
    plan.subtaskSpecs.push({ name: st.name, score: st.score, mode: st.mode ?? 'all', dependsOn: st.dependsOn, testsCount: st.tests.length });
    for (const t of st.tests) plan.testCases.push({ group: st.name, index: t.index, input: t.input, expectedOutput: t.expectedOutput });
  }
  return plan;
}

/** Latest uploaded package manifest for a problem version, or null. */
export function latestManifest(database: import('better-sqlite3').Database, problemVersionId: number): string | null {
  const row = database
    .prepare('SELECT manifest FROM test_packages WHERE problem_version_id = ? ORDER BY id DESC LIMIT 1')
    .get(problemVersionId) as { manifest: string } | undefined;
  return row?.manifest ?? null;
}
