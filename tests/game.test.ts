import { describe, it, expect } from 'vitest';
import { LIMITS, judgeLevel, parseMap, parseProgram, runProgram, starsFor } from '../src/web/game/engine.js';
import { LEVELS, findLevel, stairs } from '../src/web/game/levels.js';

function rng(seed: number) {
  let s = seed;
  return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
}

describe('levels are well-formed and solvable', () => {
  it('ids are unique and every map parses (one start, one goal, rectangular)', () => {
    expect(new Set(LEVELS.map(l => l.id)).size).toBe(LEVELS.length);
    for (const l of LEVELS) for (const m of l.maps) expect(() => parseMap(m), l.id).not.toThrow();
  });

  it('the reference solution passes every map with 3 stars, and par equals its statement count', () => {
    for (const l of LEVELS) {
      const j = judgeLevel(l, l.solution);
      expect(j.ok, l.id).toBe(true);
      if (!j.ok) continue;
      expect(j.passed, `${l.id}: ${j.verdicts.map(v => v.message).join(' | ')}`).toBe(true);
      expect(j.stars, l.id).toBe(3);
      const p = parseProgram(l.solution);
      expect(p.ok && p.value.count, l.id).toBe(l.par);
    }
  });

  it('starter code never passes by accident (each level needs real work)', () => {
    for (const l of LEVELS) {
      const j = judgeLevel(l, l.starter);
      // starter either fails to parse or does not solve the level
      if (j.ok) expect(j.passed, `${l.id} starter already solves the level`).toBe(false);
    }
  });

  it('a program hard-coded for one map fails on the others (generality is required)', () => {
    const level = findLevel('while')!;
    const j = judgeLevel(level, 'forward\nforward\nforward');
    expect(j.ok && j.passed).toBe(false);
    const j2 = judgeLevel(findLevel('stairs-while')!, 'repeat 2 {\n forward\n right\n forward\n left\n}');
    expect(j2.ok && j2.passed).toBe(false);
  });

  it('alternative correct solutions are accepted (not only the reference one)', () => {
    expect(judgeLevel(findLevel('while')!, 'while not_goal {\n forward\n}')).toMatchObject({ ok: true, passed: true });
    expect(judgeLevel(findLevel('straight')!, 'repeat 4 { forward }')).toMatchObject({ ok: true, passed: true, stars: 3 });
    // longer but valid => fewer stars, still passes
    expect(judgeLevel(findLevel('repeat')!, 'forward\n'.repeat(7) + 'right\nforward\nforward')).toMatchObject({ ok: true, passed: true, stars: 1 });
  });
});

describe('interpreter', () => {
  const lvl = findLevel('turn')!;
  const map = parseMap(lvl.maps[0]);

  it('crashing into a wall or the edge ends the run with a crash outcome', () => {
    const p = parseProgram('right\nforward');
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    const r = runProgram(p.value, map, 1);
    expect(r.outcome).toBe('crash');
    expect(r.frames[r.frames.length - 1].note).toContain('ชน');
  });

  it('finishing away from the goal is notAtGoal, finishing on it is win', () => {
    const a = parseProgram('forward');
    const b = parseProgram(lvl.solution);
    if (!a.ok || !b.ok) throw new Error('parse');
    expect(runProgram(a.value, map, 1).outcome).toBe('notAtGoal');
    expect(runProgram(b.value, map, 1).outcome).toBe('win');
  });

  it('infinite loops are stopped (timeout) instead of hanging', () => {
    for (const src of ['while front_clear {\n}', 'while not_goal {\n  left\n}', 'repeat 50 {\n repeat 50 {\n repeat 50 {\n left\n }\n }\n}']) {
      const p = parseProgram(src);
      if (!p.ok) throw new Error(p.error);
      const t = Date.now();
      const r = runProgram(p.value, map, 1);
      expect(r.outcome, src).toBe('timeout');
      expect(Date.now() - t).toBeLessThan(500);
      expect(r.frames.length).toBeLessThanOrEqual(LIMITS.maxExec + 5);
    }
  });

  it('conditions behave (front_clear / front_blocked / on_goal / not_goal) and else-branch runs', () => {
    const m = parseMap(['S.G']);
    const p = parseProgram('if front_blocked {\n left\n} else {\n forward\n forward\n}');
    if (!p.ok) throw new Error(p.error);
    expect(runProgram(p.value, m, 1).outcome).toBe('win');
    const q = parseProgram('if on_goal {\n left\n}');
    if (!q.ok) throw new Error(q.error);
    expect(runProgram(q.value, m, 1).outcome).toBe('notAtGoal');
  });

  it('each frame is a consistent state (inside the map, never on a wall)', () => {
    const l = findLevel('stairs-while')!;
    for (const rows of l.maps) {
      const m = parseMap(rows);
      const j = judgeLevel({ ...l, maps: [rows] }, l.solution);
      if (!j.ok) throw new Error(j.error);
      for (const f of j.verdicts[0].frames) {
        expect(f.x).toBeGreaterThanOrEqual(0);
        expect(f.x).toBeLessThan(m.w);
        expect(f.y).toBeGreaterThanOrEqual(0);
        expect(f.y).toBeLessThan(m.h);
        expect(m.cells[f.y][f.x]).not.toBe('#');
      }
    }
    expect(stairs(3)).toEqual(['S.##', '#..#', '##..', '###G']);
  });
});

describe('parser gives clear Thai errors and never throws', () => {
  const err = (src: string) => {
    const r = parseProgram(src);
    expect(r.ok, src).toBe(false);
    return r.ok ? '' : r.error;
  };

  it('reports line numbers and the cause', () => {
    expect(err('forward\njump')).toMatch(/บรรทัด 2.*ไม่รู้จักคำสั่ง "jump"/);
    expect(err('repeat 3 {\n forward')).toMatch(/ต้องมี "\}"/);
    expect(err('forward\n}')).toMatch(/บรรทัด 2.*\} เกินมา/);
    expect(err('repeat x { forward }')).toMatch(/จำนวนครั้ง/);
    expect(err('repeat 0 { forward }')).toMatch(/1 ถึง/);
    expect(err('repeat 999 { forward }')).toMatch(/1 ถึง/);
    expect(err('while sunny {\n}')).toMatch(/ไม่รู้จักเงื่อนไข "sunny"/);
    expect(err('if front_clear forward')).toMatch(/ต้องมี "\{"/);
    expect(err('{ forward }')).toMatch(/\{/);
    expect(err('')).toMatch(/ยังไม่ได้เขียน/);
    expect(err('# only a comment')).toMatch(/ยังไม่ได้เขียน/);
  });

  it('enforces limits (depth, statements, size)', () => {
    const deep = 'repeat 1 {\n'.repeat(LIMITS.maxDepth + 2) + 'forward\n' + '}\n'.repeat(LIMITS.maxDepth + 2);
    expect(err(deep)).toMatch(/ซ้อนกันลึกเกิน/);
    expect(err('forward\n'.repeat(LIMITS.maxStatements + 1))).toMatch(/คำสั่งมากเกิน/);
    expect(err('forward '.repeat(LIMITS.maxChars))).toMatch(/ยาวเกิน/);
  });

  it('accepts comments, mixed case, braces on one line, and counts statements (else is free)', () => {
    const r = parseProgram('# note\nFORWARD // go\nRepeat 2 { right }\nif front_clear { forward } else { left }');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.count).toBe(1 + 2 + 3); // forward, repeat+right, if+forward+left
  });

  it('fuzz: random token soup never throws; random VALID programs always finish quickly with a result', () => {
    const vocab = ['forward', 'left', 'right', 'repeat', '3', '2', '{', '}', 'while', 'if', 'else', 'front_clear', 'front_blocked', 'on_goal', 'not_goal', 'x', '#c\n', '\n'];
    const r = rng(42);
    for (let t = 0; t < 3000; t++) {
      const n = 1 + Math.floor(r() * 25);
      const src = Array.from({ length: n }, () => vocab[Math.floor(r() * vocab.length)]).join(' ');
      expect(() => parseProgram(src), src).not.toThrow();
    }

    // grammar-based generator => (almost) always parses, so the interpreter is really exercised
    const conds = ['front_clear', 'front_blocked', 'on_goal', 'not_goal'];
    const gen = (depth: number): string => {
      const k = r();
      if (depth >= 3 || k < 0.5) return ['forward', 'left', 'right'][Math.floor(r() * 3)];
      const body = Array.from({ length: 1 + Math.floor(r() * 3) }, () => gen(depth + 1)).join('\n');
      if (k < 0.7) return `repeat ${1 + Math.floor(r() * 6)} {\n${body}\n}`;
      if (k < 0.85) return `while ${conds[Math.floor(r() * 4)]} {\n${body}\n}`;
      return `if ${conds[Math.floor(r() * 4)]} {\n${body}\n} else {\n${gen(depth + 1)}\n}`;
    };
    const maps = LEVELS.map(l => parseMap(l.maps[0]));
    const outcomes = new Set<string>();
    let ran = 0;
    for (let t = 0; t < 400; t++) {
      const src = Array.from({ length: 1 + Math.floor(r() * 5) }, () => gen(0)).join('\n');
      const p = parseProgram(src);
      if (!p.ok) continue; // e.g. too many statements
      for (const m of maps) {
        const res = runProgram(p.value, m, 1);
        outcomes.add(res.outcome);
        ran++;
        expect(res.frames.length).toBeLessThanOrEqual(LIMITS.maxExec + 5);
        for (const f of res.frames) {
          expect(f.x).toBeGreaterThanOrEqual(0);
          expect(f.x).toBeLessThan(m.w);
          expect(f.y).toBeGreaterThanOrEqual(0);
          expect(f.y).toBeLessThan(m.h);
        }
      }
    }
    expect(ran).toBeGreaterThan(1500);
    expect(outcomes.size).toBeGreaterThanOrEqual(3); // crash / timeout / notAtGoal / win all reachable
  });
});

describe('stars', () => {
  it('3 stars at par, 2 within par+2, otherwise 1', () => {
    expect(starsFor(4, 4)).toBe(3);
    expect(starsFor(3, 4)).toBe(3);
    expect(starsFor(5, 4)).toBe(2);
    expect(starsFor(6, 4)).toBe(2);
    expect(starsFor(7, 4)).toBe(1);
  });
});
