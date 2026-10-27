import { describe, it, expect } from 'vitest';
import { JudgeAdapter } from '../src/server/judge/adapter.js';
import { FakeJudgeAdapter } from '../src/server/judge/fakeAdapter.js';
import { MockAdapter } from '../src/server/judge/mockAdapter.js';

function runAdapterContractTests(name: string, createAdapter: () => JudgeAdapter) {
  describe(`JudgeAdapter Contract: ${name}`, () => {
    it('implements complete lifecycle: submit -> getStatus -> getResult', async () => {
      const adapter = createAdapter();
      const submission = {
        judgingId: '101',
        problemSlug: 'a-plus-b',
        language: 'C++17',
        sourceCode: '#include <iostream>\nint main(){ int a, b; std::cin >> a >> b; std::cout << a+b; }',
        timeLimitMs: 1000,
        memoryLimitMb: 256,
      };

      const { engineJobId } = await adapter.submit(submission);
      expect(engineJobId).toBeTruthy();

      // Idempotency: submitting again with same judgingId returns same engineJobId
      const resubmit = await adapter.submit(submission);
      expect(resubmit.engineJobId).toBe(engineJobId);

      const status = await adapter.getStatus(engineJobId);
      expect(['QUEUED', 'COMPILING', 'RUNNING', 'DONE', 'JUDGE_ERROR']).toContain(status.status);

      if (status.status === 'DONE' || status.status === 'JUDGE_ERROR') {
        const result = await adapter.getResult(engineJobId);
        expect(result).toHaveProperty('verdict');
        expect(result).toHaveProperty('score');
        expect(result).toHaveProperty('maxScore');
        expect(Array.isArray(result.groups)).toBe(true);
      }
    });

    it('implements rejudge, cancel, and health checks', async () => {
      const adapter = createAdapter();
      const submission = {
        judgingId: '102',
        problemSlug: 'a-plus-b',
        language: 'C++17',
        sourceCode: 'int main(){}',
        timeLimitMs: 1000,
        memoryLimitMb: 256,
      };

      const { engineJobId } = await adapter.submit(submission);
      const rejudgeResult = await adapter.rejudge(engineJobId);
      expect(rejudgeResult.engineJobId).toBeTruthy();

      await expect(adapter.cancel(engineJobId)).resolves.not.toThrow();

      const health = await adapter.health();
      expect(typeof health.ok).toBe('boolean');
      expect(typeof health.workers).toBe('number');
      expect(typeof health.queued).toBe('number');
    });
  });
}

runAdapterContractTests('FakeJudgeAdapter', () => new FakeJudgeAdapter());
runAdapterContractTests('MockAdapter (success)', () => new MockAdapter('success'));
runAdapterContractTests('MockAdapter (fail)', () => new MockAdapter('fail'));
runAdapterContractTests('MockAdapter (hang)', () => new MockAdapter('hang'));
