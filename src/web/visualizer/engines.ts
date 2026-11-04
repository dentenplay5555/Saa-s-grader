// Pure, DOM-free step engines for the visualizer. Each algorithm returns a list of Frames
// (a full snapshot per step) so the UI can play / pause / step back without re-running anything.

export type Role =
  | 'compare' | 'swap' | 'sorted' | 'found' | 'low' | 'high' | 'mid'
  | 'range' | 'active' | 'dim' | 'top' | 'front' | 'back';

export interface View {
  label: string;
  cells: Array<number | string>;
  marks: Record<number, Role[]>;
  /** number shown above the first cell (0 for arrays, 1 for the 1-indexed A in prefix sums) */
  indexBase: number;
}

export interface Frame {
  views: View[];
  note: string;
  /** primitive operations (comparisons / assignments / stack ops) done so far */
  ops: number;
  result?: string;
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

export const LIMITS = { maxItems: 20, minValue: -999, maxValue: 999, maxRanges: 10, maxOps: 30, stackCapacity: 10 };

// ---------------------------------------------------------------- helpers
type Marks = Record<number, Role[]>;

function addMark(m: Marks, i: number, r: Role) {
  (m[i] ||= []).push(r);
}

function view(label: string, cells: Array<number | string>, marks: Marks = {}, indexBase = 0): View {
  const copy: Marks = {};
  for (const k of Object.keys(marks)) copy[Number(k)] = [...marks[Number(k)]];
  return { label, cells: [...cells], marks: copy, indexBase };
}

/** actions first (so they win the colour), then `sorted` for [lo, hi] where nothing else is marked */
function withSorted(actions: Array<[number, Role]>, lo: number, hi: number): Marks {
  const m: Marks = {};
  for (const [i, r] of actions) addMark(m, i, r);
  for (let k = lo; k <= hi; k++) if (!m[k]) addMark(m, k, 'sorted');
  return m;
}

// ---------------------------------------------------------------- parsing
export function parseNumberList(text: string, opts: { min?: number; max?: number } = {}): Parsed<number[]> {
  const min = opts.min ?? 1;
  const max = opts.max ?? LIMITS.maxItems;
  const parts = text.split(/[\s,]+/).filter(Boolean);
  if (parts.length < min) return { ok: false, error: `ใส่ตัวเลขอย่างน้อย ${min} ตัว (คั่นด้วยเว้นวรรคหรือ ,)` };
  if (parts.length > max) return { ok: false, error: `ใส่ได้ไม่เกิน ${max} ตัว` };
  const out: number[] = [];
  for (const p of parts) {
    const v = Number(p);
    if (!Number.isInteger(v)) return { ok: false, error: `"${p}" ไม่ใช่จำนวนเต็ม` };
    if (v < LIMITS.minValue || v > LIMITS.maxValue) return { ok: false, error: `ค่าต้องอยู่ระหว่าง ${LIMITS.minValue} ถึง ${LIMITS.maxValue}` };
    out.push(v);
  }
  return { ok: true, value: out };
}

export function parseInteger(text: string): Parsed<number> {
  const t = text.trim();
  if (!/^-?\d+$/.test(t)) return { ok: false, error: `"${t}" ไม่ใช่จำนวนเต็ม` };
  const v = Number(t);
  if (v < LIMITS.minValue || v > LIMITS.maxValue) return { ok: false, error: `ค่าต้องอยู่ระหว่าง ${LIMITS.minValue} ถึง ${LIMITS.maxValue}` };
  return { ok: true, value: v };
}

/** "1 3, 2 5" -> [[1,3],[2,5]] (1-indexed, inclusive, 1 <= l <= r <= n) */
export function parseRanges(text: string, n: number): Parsed<Array<[number, number]>> {
  const parts = text.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
  if (parts.length === 0) return { ok: false, error: 'ใส่ช่วยอย่างน้อย 1 ช่วง เช่น 1 3' };
  if (parts.length > LIMITS.maxRanges) return { ok: false, error: `ใส่ได้ไม่เกิน ${LIMITS.maxRanges} ช่วง` };
  const out: Array<[number, number]> = [];
  for (const p of parts) {
    const m = p.match(/^(\d+)\s+(\d+)$/);
    if (!m) return { ok: false, error: `"${p}" ต้องเป็นรูปแบบ "l r" เช่น 2 4` };
    const l = Number(m[1]);
    const r = Number(m[2]);
    if (l < 1 || r > n || l > r) return { ok: false, error: `ช่วง "${p}" ต้องอยู่ใน 1..${n} และ l ≤ r` };
    out.push([l, r]);
  }
  return { ok: true, value: out };
}

export type OpKind = 'stack' | 'queue';
export interface Op { cmd: 'add' | 'remove' | 'peek'; value?: number }

export function parseOps(text: string, kind: OpKind): Parsed<Op[]> {
  const parts = text.split(/[,;\n]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
  if (parts.length === 0) return { ok: false, error: 'ใส่คำสั่งอย่างน้อย 1 คำสั่ง' };
  if (parts.length > LIMITS.maxOps) return { ok: false, error: `ใส่ได้ไม่เกิน ${LIMITS.maxOps} คำสั่ง` };
  const addWord = kind === 'stack' ? 'push' : 'enqueue';
  const removeWord = kind === 'stack' ? 'pop' : 'dequeue';
  const peekWord = kind === 'stack' ? 'peek' : 'front';
  const ops: Op[] = [];
  for (const p of parts) {
    const add = p.match(new RegExp(`^${addWord}\\s+(-?\\d+)$`));
    if (add) {
      const v = Number(add[1]);
      if (v < LIMITS.minValue || v > LIMITS.maxValue) return { ok: false, error: `ค่าต้องอยู่ระหว่าง ${LIMITS.minValue} ถึง ${LIMITS.maxValue}` };
      ops.push({ cmd: 'add', value: v });
    } else if (p === removeWord) ops.push({ cmd: 'remove' });
    else if (p === peekWord) ops.push({ cmd: 'peek' });
    else return { ok: false, error: `คำสั่ง "${p}" ไม่ถูกต้อง ใช้ได้: ${addWord} <เลข>, ${removeWord}, ${peekWord}` };
  }
  return { ok: true, value: ops };
}

// ---------------------------------------------------------------- sorting
export function bubbleSort(input: number[]): Frame[] {
  const a = [...input];
  const n = a.length;
  const F: Frame[] = [];
  let ops = 0;
  let sortedFrom = n;
  const snap = (actions: Array<[number, Role]>, note: string) =>
    F.push({ views: [view('อาร์เรย์', a, withSorted(actions, sortedFrom, n - 1))], note, ops });

  snap([], `เริ่มต้น: มีข้อมูล ${n} ตัว เปรียบเทียบคู่ที่อยู่ติดกันแล้วสลับถ้าซ้ายมากกว่าขวา`);
  let finished = false;
  for (let i = 0; i < n - 1 && !finished; i++) {
    let swapped = false;
    for (let j = 0; j < n - 1 - i; j++) {
      ops++;
      const x = a[j];
      const y = a[j + 1];
      snap([[j, 'compare'], [j + 1, 'compare']], `เปรียบเทียบ ${x} กับ ${y}`);
      if (x > y) {
        a[j] = y;
        a[j + 1] = x;
        swapped = true;
        ops++;
        snap([[j, 'swap'], [j + 1, 'swap']], `${x} มากกว่า ${y} จึงสลับตำแหน่ง`);
      }
    }
    sortedFrom = n - 1 - i;
    if (!swapped) {
      sortedFrom = 0;
      finished = true;
      snap([], 'รอบนี้ไม่มีการสลับเลย แปลว่าเรียงเสร็จแล้ว หยุดได้ทันที');
    } else {
      snap([], `จบรอบที่ ${i + 1}: ค่าที่มากที่สุดของรอบนี้ (${a[n - 1 - i]}) ไปอยู่ท้ายสุดแล้ว`);
    }
  }
  if (!finished) {
    sortedFrom = 0;
    snap([], 'เรียงเสร็จแล้ว');
  }
  return F;
}

export function insertionSort(input: number[]): Frame[] {
  const a = [...input];
  const n = a.length;
  const F: Frame[] = [];
  let ops = 0;
  let sortedTo = 0; // a[0..sortedTo] is the sorted prefix
  const snap = (actions: Array<[number, Role]>, note: string) =>
    F.push({ views: [view('อาร์เรย์', a, withSorted(actions, 0, sortedTo))], note, ops });

  sortedTo = n > 0 ? 0 : -1;
  snap([], 'เริ่มต้น: ถือว่าตัวแรกเรียงแล้ว แล้วหยิบตัวถัดไปมาแทรกให้ถูกตำแหน่ง');
  for (let i = 1; i < n; i++) {
    sortedTo = i;
    snap([[i, 'active']], `หยิบ ${a[i]} (ตำแหน่ง ${i}) มาแทรกในส่วนที่เรียงแล้ว`);
    let j = i;
    while (j > 0) {
      ops++;
      snap([[j - 1, 'compare'], [j, 'compare']], `เปรียบเทียบ ${a[j - 1]} กับ ${a[j]}`);
      if (a[j - 1] > a[j]) {
        const x = a[j - 1];
        const y = a[j];
        a[j - 1] = y;
        a[j] = x;
        ops++;
        snap([[j - 1, 'swap'], [j, 'swap']], `${x} > ${y} สลับ ${y} ไปทางซ้าย`);
        j--;
      } else {
        snap([[j, 'active']], `${a[j - 1]} ≤ ${a[j]} อยู่ถูกตำแหน่งแล้ว`);
        break;
      }
    }
  }
  sortedTo = n - 1;
  snap([], 'เรียงเสร็จแล้ว');
  return F;
}

// ---------------------------------------------------------------- binary search
export function binarySearch(input: number[], target: number): Frame[] {
  const a = [...input].sort((x, y) => x - y);
  const n = a.length;
  const F: Frame[] = [];
  let ops = 0;
  const dimOutside = (lo: number, hi: number, extra: Array<[number, Role]>): Marks => {
    const m: Marks = {};
    for (const [i, r] of extra) addMark(m, i, r);
    for (let k = 0; k < n; k++) if ((k < lo || k > hi) && !m[k]) addMark(m, k, 'dim');
    return m;
  };
  F.push({ views: [view('อาร์เรย์ (ต้องเรียงจากน้อยไปมาก)', a, {})], note: `ค้นหา ${target} — ระบบเรียงข้อมูลให้แล้ว`, ops });
  let lo = 0;
  let hi = n - 1;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    ops++;
    const extra: Array<[number, Role]> = [[mid, 'mid'], [lo, 'low'], [hi, 'high']];
    let note: string;
    if (a[mid] === target) {
      F.push({ views: [view('อาร์เรย์', a, dimOutside(lo, hi, [[mid, 'found']]))], note: `a[${mid}] = ${a[mid]} เท่ากับ ${target} เจอแล้ว!`, ops, result: `พบที่ตำแหน่ง ${mid}` });
      return F;
    } else if (a[mid] < target) {
      note = `a[${mid}] = ${a[mid]} < ${target} → ทิ้งครึ่งซ้าย ย้าย low ไป ${mid + 1}`;
    } else {
      note = `a[${mid}] = ${a[mid]} > ${target} → ทิ้งครึ่งขวา ย้าย high ไป ${mid - 1}`;
    }
    F.push({ views: [view('อาร์เรย์', a, dimOutside(lo, hi, extra))], note: `ดูตัวกลางที่ตำแหน่ง ${mid}: ${note}`, ops });
    if (a[mid] < target) lo = mid + 1;
    else hi = mid - 1;
  }
  F.push({ views: [view('อาร์เรย์', a, dimOutside(1, 0, []))], note: `low > high ไม่เหลือช่วงให้ค้นแล้ว ไม่พบ ${target}`, ops, result: 'ไม่พบ' });
  return F;
}

/** comparisons binary search needs on the implicit sorted array [1..n] (no allocation, usable for n = 10^6) */
export function binarySearchOps(n: number, target: number): number {
  let lo = 1;
  let hi = n;
  let ops = 0;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    ops++;
    if (mid === target) return ops;
    if (mid < target) lo = mid + 1;
    else hi = mid - 1;
  }
  return ops;
}

/** comparisons linear search needs on the implicit array [1..n] */
export function linearSearchOps(n: number, target: number): number {
  let ops = 0;
  for (let v = 1; v <= n; v++) {
    ops++;
    if (v === target) return ops;
  }
  return ops;
}

// ---------------------------------------------------------------- prefix sums
export function prefixSum(input: number[], ranges: Array<[number, number]>): Frame[] {
  const a = [...input];
  const n = a.length;
  const p: Array<number | string> = Array(n + 1).fill('?');
  p[0] = 0;
  const F: Frame[] = [];
  let ops = 0;
  const snap = (aMarks: Marks, pMarks: Marks, note: string, result?: string) =>
    F.push({ views: [view('A (เริ่มนับที่ 1)', a, aMarks, 1), view('P (ผลรวมสะสม P[i] = A[1]+…+A[i])', p, pMarks, 0)], note, ops, result });

  snap({}, { 0: ['active'] }, 'P[0] = 0 (ผลรวมของไม่มีตัวเลขเลย) แล้วสร้าง P ทีละตัว');
  for (let i = 1; i <= n; i++) {
    const prev = p[i - 1] as number;
    p[i] = prev + a[i - 1];
    ops++;
    snap({ [i - 1]: ['active'] }, { [i]: ['active'], [i - 1]: ['compare'] }, `P[${i}] = P[${i - 1}] + A[${i}] = ${prev} + ${a[i - 1]} = ${p[i]}`);
  }
  snap({}, {}, `สร้าง P เสร็จใน ${n} ขั้น ต่อไปตอบ query ได้ทีละ 1 ขั้น`);
  for (const [l, r] of ranges) {
    ops++;
    const pr = p[r] as number;
    const pl = p[l - 1] as number;
    const am: Marks = {};
    for (let k = l - 1; k <= r - 1; k++) addMark(am, k, 'range');
    const ans = pr - pl;
    snap(am, { [r]: ['active'], [l - 1]: ['active'] }, `ผลรวม A[${l}..${r}] = P[${r}] - P[${l - 1}] = ${pr} - ${pl} = ${ans}`, `ผลรวม A[${l}..${r}] = ${ans}`);
  }
  snap({}, {}, 'ตอบทุก query แล้ว: สร้างครั้งเดียว O(n) ตอบแต่ละครั้ง O(1)');
  return F;
}

// ---------------------------------------------------------------- stack / queue
export function stackSim(ops: Op[]): Frame[] {
  const s: number[] = [];
  const F: Frame[] = [];
  let count = 0;
  const snap = (marks: Marks, note: string) => F.push({ views: [view('Stack (ซ้าย = ล่างสุด, ขวา = บนสุด)', s, marks)], note, ops: count });
  const topMark = (): Marks => (s.length ? { [s.length - 1]: ['top'] } : {});
  snap({}, `Stack ว่าง (จุได้สูงสุด ${LIMITS.stackCapacity} ตัว) — เข้าทีหลังออกก่อน (LIFO)`);
  for (const op of ops) {
    count++;
    if (op.cmd === 'add') {
      if (s.length >= LIMITS.stackCapacity) snap(topMark(), `push ${op.value}: Stack เต็ม (overflow) ใส่ไม่ได้`);
      else {
        s.push(op.value!);
        snap(topMark(), `push ${op.value}: วางไว้บนสุด`);
      }
    } else if (op.cmd === 'remove') {
      if (!s.length) snap({}, 'pop: Stack ว่าง (underflow) เอาอะไรออกไม่ได้');
      else {
        const v = s.pop()!;
        snap(topMark(), `pop: เอา ${v} ออกจากบนสุด (ตัวที่ใส่หลังสุดออกก่อน)`);
      }
    } else if (!s.length) snap({}, 'peek: Stack ว่าง ไม่มีค่าให้ดู');
    else snap({ [s.length - 1]: ['top', 'compare'] }, `peek: ค่าบนสุดคือ ${s[s.length - 1]} (ดูเฉยๆ ไม่เอาออก)`);
  }
  snap(topMark(), 'จบการทำงาน');
  return F;
}

export function queueSim(ops: Op[]): Frame[] {
  const q: number[] = [];
  const F: Frame[] = [];
  let count = 0;
  const ends = (): Marks => {
    const m: Marks = {};
    if (q.length) {
      addMark(m, 0, 'front');
      addMark(m, q.length - 1, 'back');
    }
    return m;
  };
  const snap = (marks: Marks, note: string) => F.push({ views: [view('Queue (ซ้าย = หน้าแถว, ขวา = ท้ายแถว)', q, marks)], note, ops: count });
  snap({}, `Queue ว่าง (จุได้สูงสุด ${LIMITS.stackCapacity} ตัว) — เข้าก่อนออกก่อน (FIFO)`);
  for (const op of ops) {
    count++;
    if (op.cmd === 'add') {
      if (q.length >= LIMITS.stackCapacity) snap(ends(), `enqueue ${op.value}: Queue เต็ม ใส่ไม่ได้`);
      else {
        q.push(op.value!);
        snap(ends(), `enqueue ${op.value}: ต่อท้ายแถว`);
      }
    } else if (op.cmd === 'remove') {
      if (!q.length) snap({}, 'dequeue: Queue ว่าง เอาอะไรออกไม่ได้');
      else {
        const v = q.shift()!;
        snap(ends(), `dequeue: เอา ${v} ออกจากหน้าแถว (ตัวที่มาก่อนออกก่อน)`);
      }
    } else if (!q.length) snap({}, 'front: Queue ว่าง ไม่มีค่าให้ดู');
    else snap({ 0: ['front', 'compare'], ...(q.length > 1 ? { [q.length - 1]: ['back'] as Role[] } : {}) }, `front: ตัวหน้าแถวคือ ${q[0]} (ดูเฉยๆ ไม่เอาออก)`);
  }
  snap(ends(), 'จบการทำงาน');
  return F;
}

// ---------------------------------------------------------------- growth of functions
export const GROWTH_CURVES: Array<{ id: string; label: string; f: (n: number) => number }> = [
  { id: 'const', label: 'O(1)', f: () => 1 },
  { id: 'log', label: 'O(log n)', f: n => Math.log2(Math.max(1, n)) },
  { id: 'n', label: 'O(n)', f: n => n },
  { id: 'nlogn', label: 'O(n log n)', f: n => n * Math.log2(Math.max(1, n)) },
  { id: 'n2', label: 'O(n²)', f: n => n * n },
];

/** Worst-case comparisons (target absent) for linear vs binary search at size n, by actually running the counters. */
export function measureSearch(n: number): { linear: number; binary: number } {
  return { linear: linearSearchOps(n, n + 1), binary: binarySearchOps(n, n + 1) };
}

// ---------------------------------------------------------------- registry used by the UI
export interface FieldSpec {
  key: 'values' | 'target' | 'ranges' | 'ops';
  label: string;
  default: string;
  hint: string;
}

export interface AlgoDef {
  id: string;
  title: string;
  summary: string;
  complexity: string;
  fields: FieldSpec[];
  run(inputs: Record<string, string>): Parsed<Frame[]>;
}

const valuesField = (def: string): FieldSpec => ({ key: 'values', label: 'ข้อมูล', default: def, hint: `จำนวนเต็ม ไม่เกิน ${LIMITS.maxItems} ตัว คั่นด้วยเว้นวรรคหรือ ,` });

function err<T>(e: string): Parsed<T> {
  return { ok: false, error: e };
}

export const ALGORITHMS: AlgoDef[] = [
  {
    id: 'bubble-sort',
    title: 'Bubble Sort',
    summary: 'เปรียบเทียบคู่ที่อยู่ติดกัน สลับถ้าผิดลำดับ ค่าที่มากที่สุดจะ "ลอย" ไปท้ายสุดทีละรอบ',
    complexity: 'เวลา O(n²) กรณีแย่สุด / O(n) ถ้าเรียงอยู่แล้ว (หยุดเร็ว) • หน่วยความจำเพิ่ม O(1)',
    fields: [valuesField('5 2 9 1 5 6')],
    run: inp => {
      const v = parseNumberList(inp.values ?? '');
      return v.ok ? { ok: true, value: bubbleSort(v.value) } : err(v.error);
    },
  },
  {
    id: 'insertion-sort',
    title: 'Insertion Sort',
    summary: 'หยิบข้อมูลทีละตัวมาแทรกในส่วนที่เรียงแล้ว เหมือนจัดไพ่ในมือ',
    complexity: 'เวลา O(n²) กรณีแย่สุด / O(n) ถ้าเกือบเรียงอยู่แล้ว • หน่วยความจำเพิ่ม O(1)',
    fields: [valuesField('5 2 9 1 5 6')],
    run: inp => {
      const v = parseNumberList(inp.values ?? '');
      return v.ok ? { ok: true, value: insertionSort(v.value) } : err(v.error);
    },
  },
  {
    id: 'binary-search',
    title: 'Binary Search',
    summary: 'ค้นหาในข้อมูลที่เรียงแล้วโดยตัดครึ่งช่วงค้นหาทุกครั้ง',
    complexity: 'เวลา O(log n) • ต้องเรียงข้อมูลก่อน',
    fields: [valuesField('3 8 12 15 21 27 34 40'), { key: 'target', label: 'ค่าที่ค้นหา', default: '40', hint: 'จำนวนเต็ม (ลองใส่ค่าที่ไม่มีในข้อมูลดู)' }],
    run: inp => {
      const v = parseNumberList(inp.values ?? '');
      if (!v.ok) return err(v.error);
      const t = parseInteger(inp.target ?? '');
      if (!t.ok) return err(t.error);
      return { ok: true, value: binarySearch(v.value, t.value) };
    },
  },
  {
    id: 'prefix-sum',
    title: 'Prefix Sum (ผลรวมสะสม)',
    summary: 'สร้างอาร์เรย์ผลรวมสะสมครั้งเดียว แล้วตอบผลรวมช่วงใดก็ได้ในเวลาคงที่',
    complexity: 'สร้าง O(n) • ตอบแต่ละ query O(1)',
    fields: [valuesField('3 1 4 1 5 9 2 6'), { key: 'ranges', label: 'ช่วงที่ต้องการ (l r, เริ่มนับที่ 1)', default: '1 3, 2 5, 4 8', hint: 'เช่น 2 5 หมายถึง A[2]+…+A[5] คั่นหลายช่วงด้วย ,' }],
    run: inp => {
      const v = parseNumberList(inp.values ?? '');
      if (!v.ok) return err(v.error);
      const r = parseRanges(inp.ranges ?? '', v.value.length);
      if (!r.ok) return err(r.error);
      return { ok: true, value: prefixSum(v.value, r.value) };
    },
  },
  {
    id: 'stack',
    title: 'Stack',
    summary: 'โครงสร้างข้อมูลแบบเข้าทีหลังออกก่อน (LIFO) เหมือนกองจาน',
    complexity: 'push / pop / peek ทุกอย่าง O(1)',
    fields: [{ key: 'ops', label: 'คำสั่ง', default: 'push 4, push 7, push 2, pop, peek, pop, pop, pop', hint: 'ใช้ได้: push <เลข>, pop, peek คั่นด้วย ,' }],
    run: inp => {
      const o = parseOps(inp.ops ?? '', 'stack');
      return o.ok ? { ok: true, value: stackSim(o.value) } : err(o.error);
    },
  },
  {
    id: 'queue',
    title: 'Queue',
    summary: 'โครงสร้างข้อมูลแบบเข้าก่อนออกก่อน (FIFO) เหมือนต่อแถวซื้อของ',
    complexity: 'enqueue / dequeue / front ทุกอย่าง O(1) (เมื่อใช้ตัวชี้หัว-ท้าย)',
    fields: [{ key: 'ops', label: 'คำสั่ง', default: 'enqueue 4, enqueue 7, enqueue 2, dequeue, front, dequeue, dequeue, dequeue', hint: 'ใช้ได้: enqueue <เลข>, dequeue, front คั่นด้วย ,' }],
    run: inp => {
      const o = parseOps(inp.ops ?? '', 'queue');
      return o.ok ? { ok: true, value: queueSim(o.value) } : err(o.error);
    },
  },
];

export function findAlgo(id: string): AlgoDef | undefined {
  return ALGORITHMS.find(a => a.id === id);
}

/** lesson slug -> visualizer id */
export const VISUALIZER_FOR_LESSON: Record<string, string> = {
  'prefix-sums-range-queries': 'prefix-sum',
};

/** Human-readable duration in Thai, used by the growth page ("how long would this take at 10^8 ops/sec"). */
export function formatDuration(sec: number): string {
  if (sec < 0.001) return 'น้อยกว่า 1 มิลลิวินาที';
  if (sec < 1) return `${Math.round(sec * 1000)} มิลลิวินาที`;
  if (sec < 60) return `${sec.toFixed(1)} วินาที`;
  if (sec < 3600) return `${(sec / 60).toFixed(1)} นาที`;
  if (sec < 86400) return `${(sec / 3600).toFixed(1)} ชั่วโมง`;
  if (sec < 86400 * 365) return `${(sec / 86400).toFixed(1)} วัน`;
  return `${(sec / (86400 * 365)).toFixed(1)} ปี`;
}
