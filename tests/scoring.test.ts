import { describe, it, expect } from 'vitest';
import { scoreGroup, evaluateSubmissionScore, totalScore, GroupOutcome } from '../src/server/scoring.js';

describe('Task 4 - Scoring Engine', () => {
  it('all-or-nothing mode requires every test in the group to be AC', () => {
    const passedGroup: GroupOutcome = {
      name: 'subtask1',
      mode: 'all',
      maxScore: 30,
      tests: [
        { index: 1, verdict: 'AC', score: 10, maxScore: 10 },
        { index: 2, verdict: 'AC', score: 10, maxScore: 10 },
        { index: 3, verdict: 'AC', score: 10, maxScore: 10 },
      ],
    };
    expect(scoreGroup(passedGroup)).toBe(30);

    const failedGroup: GroupOutcome = {
      name: 'subtask1',
      mode: 'all',
      maxScore: 30,
      tests: [
        { index: 1, verdict: 'AC', score: 10, maxScore: 10 },
        { index: 2, verdict: 'WA', score: 0, maxScore: 10 },
        { index: 3, verdict: 'AC', score: 10, maxScore: 10 },
      ],
    };
    expect(scoreGroup(failedGroup)).toBe(0);
  });

  it('sum mode accumulates AC test scores up to maxScore', () => {
    const group: GroupOutcome = {
      name: 'subtask2',
      mode: 'sum',
      maxScore: 25,
      tests: [
        { index: 1, verdict: 'AC', score: 10, maxScore: 10 },
        { index: 2, verdict: 'WA', score: 0, maxScore: 10 },
        { index: 3, verdict: 'AC', score: 15, maxScore: 15 },
      ],
    };
    expect(scoreGroup(group)).toBe(25);
  });

  it('min mode awards minimum score across tests unless all AC', () => {
    const allAc: GroupOutcome = {
      name: 'subtask-min',
      mode: 'min',
      maxScore: 20,
      tests: [
        { index: 1, verdict: 'AC', score: 20, maxScore: 20 },
        { index: 2, verdict: 'AC', score: 20, maxScore: 20 },
      ],
    };
    expect(scoreGroup(allAc)).toBe(20);

    const partialAc: GroupOutcome = {
      name: 'subtask-min',
      mode: 'min',
      maxScore: 20,
      tests: [
        { index: 1, verdict: 'PARTIAL', score: 12, maxScore: 20 },
        { index: 2, verdict: 'PARTIAL', score: 8, maxScore: 20 },
      ],
    };
    expect(scoreGroup(partialAc)).toBe(8);
  });

  it('awards 0 if any test is SKIPPED', () => {
    const skippedGroup: GroupOutcome = {
      name: 'subtask-skip',
      mode: 'sum',
      maxScore: 20,
      tests: [
        { index: 1, verdict: 'AC', score: 10, maxScore: 10 },
        { index: 2, verdict: 'SKIPPED', score: 0, maxScore: 10 },
      ],
    };
    expect(scoreGroup(skippedGroup)).toBe(0);
  });

  it('handles dependent subtasks correctly', () => {
    const groups: GroupOutcome[] = [
      {
        name: 'subtask1',
        mode: 'all',
        maxScore: 40,
        tests: [
          { index: 1, verdict: 'AC', score: 20, maxScore: 20 },
          { index: 2, verdict: 'AC', score: 20, maxScore: 20 },
        ],
      },
      {
        name: 'subtask2',
        mode: 'all',
        maxScore: 60,
        dependsOn: ['subtask1'],
        tests: [
          { index: 1, verdict: 'AC', score: 30, maxScore: 30 },
          { index: 2, verdict: 'AC', score: 30, maxScore: 30 },
        ],
      },
    ];

    const result = evaluateSubmissionScore(groups);
    expect(result.totalScore).toBe(100);
    expect(result.groupScores['subtask1']).toBe(40);
    expect(result.groupScores['subtask2']).toBe(60);

    // If subtask1 fails, subtask2 gets 0 even if subtask2 tests are AC
    groups[0].tests[0].verdict = 'WA';
    const failedResult = evaluateSubmissionScore(groups);
    expect(failedResult.groupScores['subtask1']).toBe(0);
    expect(failedResult.groupScores['subtask2']).toBe(0);
    expect(failedResult.totalScore).toBe(0);
  });

  it('handles empty groups safely', () => {
    const emptyGroup: GroupOutcome = {
      name: 'empty',
      mode: 'all',
      maxScore: 10,
      tests: [],
    };
    expect(scoreGroup(emptyGroup)).toBe(0);
    expect(totalScore([emptyGroup])).toBe(0);
  });
});
