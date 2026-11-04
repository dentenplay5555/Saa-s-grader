import { describe, it, expect } from 'vitest';
import {
  ALGORITHMS, GROWTH_CURVES, LIMITS, binarySearch, binarySearchOps, bubbleSort, insertionSort, linearSearchOps,
  measureSearch, parseInteger, parseNumberList, parseOps, parseRanges, prefixSum, queueSim, stackSim, findAlgo,
} from '../src/web/visualizer/engines.js';

const lastCells = (f: ReturnType<typeof bubbleSort>) => f[f.length - 1].views[0].cells;

function rng(seed: number) {
  let s = seed;
  return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
}

describe('sorting engines', () => {
  it('bubble & insertion produce the sorted array for many random inputs', () => {
    const r = rng(7);
    for (let t = 0; t < 200; t++) {
      const n = 1 + Math.floor(r() * 20);
      const a = Array.from({ length: n }, () => Math.floor(r() * 200) - 100);
      const want = [...a].sort((x, y) => x - y);
      expect(lastCells(bubbleSort(a))).toEqual(want);
      expect(lastCells(insertionSort(a))).toEqual(want);
    }
  });

  it('does not mutate the input and handles n = 1', () => {
    const a = [3, 1, 2];
    bubbleSort(a);
    insertionSort(a);
    expect(a).toEqual([3, 1, 2]);
    expect(lastCells(bubbleSort([5]))).toEqual([5]);
    expect(lastCells(insertionSort([5]))).toEqual([5]);
  });

  it('every frame is a permutation of the input (no value is lost or invented)', () => {
    const a = [5, 2, 9, 1, 5, 6];
    const want = [...a].sort((x, y) => x - y);
    for (const f of [...bubbleSort(a), ...insertionSort(a)]) {
      expect([...f.views[0].cells].sort((x, y) => (x as number) - (y as number))).toEqual(want);
    }
  });

  it('ops never decrease; bubble stops early on sorted input; worst case is quadratic', () => {
    for (const f of [bubbleSort([4, 3, 2, 1]), insertionSort([4, 3, 2, 1])]) {
      for (let i = 1; i < f.length; i++) expect(f[i].ops).toBeGreaterThanOrEqual(f[i - 1].ops);
    }
    const sortedRun = bubbleSort([1, 2, 3, 4, 5]);
    expect(sortedRun[sortedRun.length - 1].ops).toBe(4); // one pass of n-1 comparisons, then stop
    expect(sortedRun[sortedRun.length - 1].note).toContain('หยุด');
    const rev = bubbleSort([5, 4, 3, 2, 1]);
    expect(rev[rev.length - 1].ops).toBe(10 + 10); // 10 comparisons + 10 swaps
  });

  it('final frame marks every cell sorted', () => {
    const f = bubbleSort([3, 1, 2]);
    const m = f[f.length - 1].views[0].marks;
    expect(Object.keys(m).length).toBe(3);
    for (const k of [0, 1, 2]) expect(m[k]).toContain('sorted');
  });
});

describe('binary search', () => {
  it('finds every present value and reports absence otherwise (random sweep)', () => {
    const r = rng(3);
    for (let t = 0; t < 200; t++) {
      const n = 1 + Math.floor(r() * 20);
      const a = Array.from({ length: n }, () => Math.floor(r() * 50));
      const sorted = [...a].sort((x, y) => x - y);
      const target = Math.floor(r() * 55) - 2;
      const f = binarySearch(a, target);
      const last = f[f.length - 1];
      if (sorted.includes(target)) {
        expect(last.result).toMatch(/^พบที่ตำแหน่ง/);
        const idx = Number(last.result!.match(/\d+/)![0]);
        expect(sorted[idx]).toBe(target);
      } else {
        expect(last.result).toBe('ไม่พบ');
      }
    }
  });

  it('count helper matches the framed engine and is logarithmic', () => {
    for (const n of [1, 2, 7, 8, 100, 1000]) {
      const arr = Array.from({ length: n }, (_, i) => i + 1);
      for (const target of [1, Math.ceil(n / 2), n, n + 1, 0]) {
        const f = binarySearch(arr, target);
        expect(f[f.length - 1].ops).toBe(binarySearchOps(n, target));
      }
    }
    expect(measureSearch(1_000_000)).toEqual({ linear: 1_000_000, binary: 20 });
    expect(measureSearch(1000).binary).toBe(10);
    expect(linearSearchOps(5, 3)).toBe(3);
  });
});

describe('prefix sum', () => {
  it('every query answer equals the brute-force sum', () => {
    const r = rng(11);
    for (let t = 0; t < 100; t++) {
      const n = 1 + Math.floor(r() * 20);
      const a = Array.from({ length: n }, () => Math.floor(r() * 100) - 50);
      const ranges: Array<[number, number]> = [];
      for (let k = 0; k < 5; k++) {
        const l = 1 + Math.floor(r() * n);
        const rr = l + Math.floor(r() * (n - l + 1));
        ranges.push([l, rr]);
      }
      const results = prefixSum(a, ranges).filter(f => f.result).map(f => f.result!);
      expect(results.length).toBe(ranges.length);
      ranges.forEach(([l, rr], i) => {
        const brute = a.slice(l - 1, rr).reduce((x, y) => x + y, 0);
        expect(results[i]).toBe(`ผลรวม A[${l}..${rr}] = ${brute}`);
      });
    }
  });

  it('final P array is the running sum', () => {
    const f = prefixSum([3, 1, 4], [[1, 3]]);
    expect(f[f.length - 1].views[1].cells).toEqual([0, 3, 4, 8]);
  });
});

describe('stack / queue', () => {
  it('stack is LIFO and survives underflow/overflow without throwing', () => {
    const ok = parseOps('push 1, push 2, push 3, pop, pop', 'stack');
    expect(ok.ok).toBe(true);
    const f = stackSim((ok as any).value);
    expect(f[f.length - 1].views[0].cells).toEqual([1]);

    const under = stackSim((parseOps('pop, peek', 'stack') as any).value);
    expect(under.some(x => x.note.includes('underflow'))).toBe(true);

    const many = Array.from({ length: LIMITS.stackCapacity + 2 }, (_, i) => `push ${i}`).join(',');
    const over = stackSim((parseOps(many, 'stack') as any).value);
    expect(over.some(x => x.note.includes('overflow'))).toBe(true);
    expect(over[over.length - 1].views[0].cells.length).toBe(LIMITS.stackCapacity);
  });

  it('queue is FIFO', () => {
    const f = queueSim((parseOps('enqueue 1, enqueue 2, enqueue 3, dequeue', 'queue') as any).value);
    expect(f[f.length - 1].views[0].cells).toEqual([2, 3]);
    expect(f[f.length - 1].views[0].marks[0]).toContain('front');
  });
});

describe('input parsing is strict', () => {
  it('rejects bad numbers, too many items, out-of-range, bad ranges, wrong commands', () => {
    expect(parseNumberList('').ok).toBe(false);
    expect(parseNumberList('1 2 x').ok).toBe(false);
    expect(parseNumberList('1.5 2').ok).toBe(false);
    expect(parseNumberList('1000').ok).toBe(false);
    expect(parseNumberList(Array(21).fill(1).join(' ')).ok).toBe(false);
    expect(parseNumberList('1,2 3').ok).toBe(true);
    expect(parseInteger('abc').ok).toBe(false);
    expect(parseRanges('0 3', 5).ok).toBe(false);
    expect(parseRanges('3 2', 5).ok).toBe(false);
    expect(parseRanges('1 6', 5).ok).toBe(false);
    expect(parseRanges('1 3, 2 5', 5).ok).toBe(true);
    expect(parseOps('push 1', 'queue').ok).toBe(false);
    expect(parseOps('dequeue', 'stack').ok).toBe(false);
    expect(parseOps('push abc', 'stack').ok).toBe(false);
    expect(parseOps(Array(31).fill('pop').join(','), 'stack').ok).toBe(false);
  });
});

describe('registry', () => {
  it('every algorithm runs with its default inputs and returns well-formed frames', () => {
    for (const algo of ALGORITHMS) {
      const inputs = Object.fromEntries(algo.fields.map(f => [f.key, f.default]));
      const res = algo.run(inputs);
      expect(res.ok, algo.id).toBe(true);
      if (!res.ok) continue;
      expect(res.value.length).toBeGreaterThan(1);
      expect(res.value.length).toBeLessThan(1000);
      for (const fr of res.value) {
        expect(fr.note.length).toBeGreaterThan(0);
        expect(fr.views.length).toBeGreaterThan(0);
        for (const v of fr.views) for (const k of Object.keys(v.marks)) {
          expect(Number(k)).toBeGreaterThanOrEqual(0);
          expect(Number(k)).toBeLessThan(Math.max(1, v.cells.length));
        }
      }
    }
    expect(findAlgo('nope')).toBeUndefined();
  });

  it('bad input surfaces as a Thai error, not an exception', () => {
    const r = findAlgo('binary-search')!.run({ values: '1 2 3', target: 'x' });
    expect(r.ok).toBe(false);
  });

  it('growth curves are ordered at n = 100', () => {
    const v = GROWTH_CURVES.map(c => c.f(100));
    for (let i = 1; i < v.length; i++) expect(v[i]).toBeGreaterThan(v[i - 1]);
  });
});

describe('formatDuration', () => {
  it('picks a sensible Thai unit', async () => {
    const { formatDuration } = await import('../src/web/visualizer/engines.js');
    expect(formatDuration(0.0000001)).toContain('น้อยกว่า');
    expect(formatDuration(0.25)).toBe('250 มิลลิวินาที');
    expect(formatDuration(5)).toBe('5.0 วินาที');
    expect(formatDuration(120)).toBe('2.0 นาที');
    expect(formatDuration(1e12 / 1e8)).toBe('2.8 ชั่วโมง');
    expect(formatDuration(86400 * 3)).toBe('3.0 วัน');
    expect(formatDuration(86400 * 365 * 2)).toBe('2.0 ปี');
  });
});
