// "Code Robot": a tiny, safe teaching language (no eval, no JS execution) interpreted step by step.
// Everything here is pure and DOM-free so it can be unit-tested and replayed frame by frame.

export type Dir = 0 | 1 | 2 | 3; // 0 = up, 1 = right, 2 = down, 3 = left
export const DIR_NAME = ['ขึ้น', 'ขวา', 'ลง', 'ซ้าย'] as const;
const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];

export type Cond = 'front_clear' | 'front_blocked' | 'on_goal' | 'not_goal';
export const CONDITIONS: Cond[] = ['front_clear', 'front_blocked', 'on_goal', 'not_goal'];

export type Stmt =
  | { t: 'forward' | 'left' | 'right'; line: number }
  | { t: 'repeat'; n: number; body: Stmt[]; line: number }
  | { t: 'while'; cond: Cond; body: Stmt[]; line: number }
  | { t: 'if'; cond: Cond; then: Stmt[]; else: Stmt[]; line: number };

export interface Program {
  body: Stmt[];
  /** number of statements (nested ones included; `else` is free). Used for the star rating. */
  count: number;
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

export const LIMITS = { maxChars: 2000, maxStatements: 60, maxDepth: 4, maxRepeat: 50, maxExec: 2000 };

// ------------------------------------------------------------------ parser
interface Tok { text: string; line: number }

function tokenize(src: string): Tok[] {
  const toks: Tok[] = [];
  src.split('\n').forEach((raw, i) => {
    const line = raw.replace(/(\/\/|#).*$/, '').replace(/\{/g, ' { ').replace(/\}/g, ' } ');
    for (const w of line.split(/\s+/)) if (w) toks.push({ text: w.toLowerCase(), line: i + 1 });
  });
  return toks;
}

class ParseError extends Error {}

export function parseProgram(src: string): Parsed<Program> {
  if (src.length > LIMITS.maxChars) return { ok: false, error: `โปรแกรมยาวเกิน ${LIMITS.maxChars} ตัวอักษร` };
  const toks = tokenize(src);
  let pos = 0;
  let count = 0;

  const fail = (line: number, msg: string): never => {
    throw new ParseError(`บรรทัด ${line}: ${msg}`);
  };
  const lastLine = () => (toks.length ? toks[toks.length - 1].line : 1);
  const expect = (text: string, why: string): Tok => {
    const t = toks[pos];
    if (!t) return fail(lastLine(), `ต้องมี "${text}" ${why} แต่โปรแกรมจบก่อน`);
    if (t.text !== text) return fail(t.line, `ต้องมี "${text}" ${why} แต่เจอ "${t.text}"`);
    pos++;
    return t;
  };
  const cond = (): Cond => {
    const t = toks[pos];
    if (!t) return fail(lastLine(), 'ต้องมีเงื่อนไข เช่น front_clear');
    if (!CONDITIONS.includes(t.text as Cond)) return fail(t.line, `ไม่รู้จักเงื่อนไข "${t.text}" ใช้ได้: ${CONDITIONS.join(', ')}`);
    pos++;
    return t.text as Cond;
  };

  function block(depth: number): Stmt[] {
    if (depth > LIMITS.maxDepth) fail(toks[pos]?.line ?? lastLine(), `ซ้อนกันลึกเกิน ${LIMITS.maxDepth} ชั้น`);
    const out: Stmt[] = [];
    while (pos < toks.length && toks[pos].text !== '}') {
      out.push(statement(depth));
    }
    return out;
  }

  function braces(depth: number, what: string): Stmt[] {
    expect('{', `หลัง ${what}`);
    const body = block(depth + 1);
    expect('}', `เพื่อปิดบล็อกของ ${what}`);
    return body;
  }

  function statement(depth: number): Stmt {
    const t = toks[pos++];
    if (++count > LIMITS.maxStatements) fail(t.line, `คำสั่งมากเกิน ${LIMITS.maxStatements} คำสั่ง ลองใช้ repeat หรือ while ช่วยให้สั้นลง`);
    switch (t.text) {
      case 'forward':
      case 'left':
      case 'right':
        return { t: t.text, line: t.line };
      case 'repeat': {
        const nTok = toks[pos];
        if (!nTok || !/^\d+$/.test(nTok.text)) return fail(t.line, 'หลัง repeat ต้องตามด้วยจำนวนครั้ง เช่น repeat 3 { ... }');
        pos++;
        const n = Number(nTok.text);
        if (n < 1 || n > LIMITS.maxRepeat) return fail(t.line, `repeat ทำได้ 1 ถึง ${LIMITS.maxRepeat} ครั้ง`);
        return { t: 'repeat', n, body: braces(depth, 'repeat'), line: t.line };
      }
      case 'while': {
        const c = cond();
        return { t: 'while', cond: c, body: braces(depth, 'while'), line: t.line };
      }
      case 'if': {
        const c = cond();
        const then = braces(depth, 'if');
        let els: Stmt[] = [];
        if (toks[pos]?.text === 'else') {
          pos++;
          els = braces(depth, 'else');
        }
        return { t: 'if', cond: c, then, else: els, line: t.line };
      }
      case '}':
        return fail(t.line, 'มี } เกินมา');
      case '{':
        return fail(t.line, 'มี { โดยไม่มีคำสั่งนำหน้า (เช่น repeat 3 { ... })');
      default:
        return fail(t.line, `ไม่รู้จักคำสั่ง "${t.text}" ใช้ได้: forward, left, right, repeat N { }, while เงื่อนไข { }, if เงื่อนไข { } else { }`);
    }
  }

  try {
    const body: Stmt[] = [];
    while (pos < toks.length) {
      if (toks[pos].text === '}') fail(toks[pos].line, 'มี } เกินมา');
      body.push(statement(0));
    }
    if (body.length === 0) return { ok: false, error: 'ยังไม่ได้เขียนคำสั่ง' };
    return { ok: true, value: { body, count } };
  } catch (e) {
    if (e instanceof ParseError) return { ok: false, error: e.message };
    throw e;
  }
}

// ------------------------------------------------------------------ maps
export type Cell = '#' | '.' | 'G';
export interface GameMap {
  w: number;
  h: number;
  cells: Cell[][]; // cells[y][x]
  start: { x: number; y: number };
}

/** 'S' start, 'G' goal, '.' floor, '#' wall. Throws on malformed maps (levels are validated by tests). */
export function parseMap(rows: string[]): GameMap {
  const h = rows.length;
  const w = rows[0]?.length ?? 0;
  if (h === 0 || w === 0) throw new Error('empty map');
  let start: { x: number; y: number } | null = null;
  let goals = 0;
  const cells: Cell[][] = rows.map((row, y) => {
    if (row.length !== w) throw new Error(`row ${y} has width ${row.length}, expected ${w}`);
    return [...row].map((ch, x): Cell => {
      if (ch === 'S') {
        if (start) throw new Error('more than one start');
        start = { x, y };
        return '.';
      }
      if (ch === 'G') { goals++; return 'G'; }
      if (ch === '#' || ch === '.') return ch;
      throw new Error(`bad map char "${ch}"`);
    });
  });
  if (!start) throw new Error('no start');
  if (goals !== 1) throw new Error('need exactly one goal');
  return { w, h, cells, start };
}

// ------------------------------------------------------------------ interpreter
export interface RunFrame {
  x: number;
  y: number;
  dir: Dir;
  /** 1-based source line being executed (null for the initial frame) */
  line: number | null;
  note: string;
  /** actions executed so far */
  moves: number;
}

export type Outcome = 'win' | 'notAtGoal' | 'crash' | 'timeout';

export interface RunResult {
  frames: RunFrame[];
  outcome: Outcome;
  message: string;
}

class Stop extends Error {
  constructor(public outcome: Outcome, public msg: string) {
    super(msg);
  }
}

export function runProgram(program: Program, map: GameMap, startDir: Dir = 1): RunResult {
  let x = map.start.x;
  let y = map.start.y;
  let dir: Dir = startDir;
  let moves = 0;
  let exec = 0;
  const frames: RunFrame[] = [];
  const snap = (line: number | null, note: string) => frames.push({ x, y, dir, line, note, moves });

  const cellAt = (cx: number, cy: number): Cell | null => (cx < 0 || cy < 0 || cx >= map.w || cy >= map.h ? null : map.cells[cy][cx]);
  const frontClear = () => {
    const c = cellAt(x + DX[dir], y + DY[dir]);
    return c !== null && c !== '#';
  };
  const test = (c: Cond): boolean => {
    switch (c) {
      case 'front_clear': return frontClear();
      case 'front_blocked': return !frontClear();
      case 'on_goal': return map.cells[y][x] === 'G';
      case 'not_goal': return map.cells[y][x] !== 'G';
    }
  };
  const tick = () => {
    if (++exec > LIMITS.maxExec) throw new Stop('timeout', `ทำงานเกิน ${LIMITS.maxExec} ขั้นแล้วยังไม่จบ อาจเป็นลูปที่ไม่มีวันหยุด (เช่น while ที่เงื่อนไขไม่เปลี่ยน)`);
  };

  function run(stmts: Stmt[]) {
    for (const s of stmts) {
      tick();
      switch (s.t) {
        case 'forward': {
          const nx = x + DX[dir];
          const ny = y + DY[dir];
          const c = cellAt(nx, ny);
          if (c === null || c === '#') {
            snap(s.line, `forward: ข้างหน้าเป็น${c === null ? 'ขอบแผนที่' : 'กำแพง'} หุ่นยนต์ชน!`);
            throw new Stop('crash', `บรรทัด ${s.line}: หุ่นยนต์ชน${c === null ? 'ขอบแผนที่' : 'กำแพง'}ที่ตำแหน่ง (${x}, ${y}) หันไปทาง${DIR_NAME[dir]}`);
          }
          x = nx;
          y = ny;
          moves++;
          snap(s.line, `forward: เดินไปที่ (${x}, ${y})${c === 'G' ? ' — ถึงช่องเป้าหมายแล้ว' : ''}`);
          break;
        }
        case 'left':
          dir = ((dir + 3) % 4) as Dir;
          moves++;
          snap(s.line, `left: เลี้ยวซ้าย ตอนนี้หันไปทาง${DIR_NAME[dir]}`);
          break;
        case 'right':
          dir = ((dir + 1) % 4) as Dir;
          moves++;
          snap(s.line, `right: เลี้ยวขวา ตอนนี้หันไปทาง${DIR_NAME[dir]}`);
          break;
        case 'repeat':
          for (let i = 0; i < s.n; i++) {
            tick();
            run(s.body);
          }
          break;
        case 'while':
          while (test(s.cond)) {
            tick();
            run(s.body);
          }
          break;
        case 'if':
          run(test(s.cond) ? s.then : s.else);
          break;
      }
    }
  }

  snap(null, 'เริ่มต้น');
  try {
    run(program.body);
  } catch (e) {
    if (e instanceof Stop) return { frames, outcome: e.outcome, message: e.msg };
    throw e;
  }
  if (map.cells[y][x] === 'G') {
    snap(null, 'โปรแกรมจบ และหุ่นยนต์อยู่ที่เป้าหมาย');
    return { frames, outcome: 'win', message: 'ถึงเป้าหมาย!' };
  }
  snap(null, 'โปรแกรมจบ แต่หุ่นยนต์ยังไม่อยู่ที่เป้าหมาย');
  return { frames, outcome: 'notAtGoal', message: `โปรแกรมจบแล้ว แต่หุ่นยนต์อยู่ที่ (${x}, ${y}) ยังไม่ถึงเป้าหมาย` };
}

// ------------------------------------------------------------------ levels & judging
export interface Level {
  id: string;
  title: string;
  story: string;
  learn: string;
  hint: string;
  /** several maps = the same program must work on all of them (that is what makes loops/conditions necessary) */
  maps: string[][];
  startDir: Dir;
  /** statement count of the reference solution; <= par gives 3 stars */
  par: number;
  solution: string;
  starter: string;
}

export interface MapVerdict {
  outcome: Outcome;
  message: string;
  frames: RunFrame[];
}

export type Judgement =
  | { ok: false; error: string }
  | { ok: true; passed: boolean; verdicts: MapVerdict[]; commandCount: number; stars: 0 | 1 | 2 | 3 };

export function starsFor(commandCount: number, par: number): 1 | 2 | 3 {
  if (commandCount <= par) return 3;
  if (commandCount <= par + 2) return 2;
  return 1;
}

export function judgeLevel(level: Level, src: string): Judgement {
  const parsed = parseProgram(src);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const verdicts = level.maps.map(rows => {
    const r = runProgram(parsed.value, parseMap(rows), level.startDir);
    return { outcome: r.outcome, message: r.message, frames: r.frames };
  });
  const passed = verdicts.every(v => v.outcome === 'win');
  return { ok: true, passed, verdicts, commandCount: parsed.value.count, stars: passed ? starsFor(parsed.value.count, level.par) : 0 };
}
