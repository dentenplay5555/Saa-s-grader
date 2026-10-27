import { describe, it, expect } from 'vitest';
import { mapVerdict } from '../src/server/judge/verdictMap.js';

describe('verdictMap', () => {
  it('maps all verdicts', () => {
    for (const v of ['AC','WA','TLE','MLE','RE','CE','OLE','JUDGE_ERROR','PARTIAL','SKIPPED']) {
      expect(mapVerdict(v)).toBe(v);
    }
  });
  it('throws on unknown', () => {
    expect(() => mapVerdict('NOPE')).toThrow();
  });
});
