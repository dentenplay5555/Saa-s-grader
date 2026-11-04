import type { Level } from './engine.js';

/** staircase map: right, down, right, down … ending at the bottom-right corner */
export function stairs(n: number): string[] {
  const g: string[][] = Array.from({ length: n + 1 }, () => Array(n + 1).fill('#'));
  for (let k = 0; k <= n; k++) g[k][k] = '.';
  for (let k = 0; k < n; k++) g[k][k + 1] = '.';
  g[0][0] = 'S';
  g[n][n] = 'G';
  return g.map(r => r.join(''));
}

export const LEVELS: Level[] = [
  {
    id: 'straight',
    title: '1. เดินตรง',
    story: 'พาหุ่นยนต์เดินไปที่ธง 🏁 หุ่นยนต์เริ่มต้นหันไปทางขวา',
    learn: 'ลำดับคำสั่ง (Sequence): คอมพิวเตอร์ทำทีละบรรทัดจากบนลงล่าง',
    hint: 'คำสั่ง forward เดินหน้า 1 ช่อง ต้องใช้กี่ครั้งถึงจะถึงธง? (หรือลองใช้ repeat)',
    maps: [['S...G']],
    startDir: 1,
    par: 4,
    solution: 'forward\nforward\nforward\nforward',
    starter: '# เขียนคำสั่งที่นี่ (บรรทัดที่ขึ้นต้นด้วย # คือหมายเหตุ)\nforward\n',
  },
  {
    id: 'turn',
    title: '2. เลี้ยว',
    story: 'ทางไม่ตรงแล้ว! ต้องเลี้ยวไปตามทาง',
    learn: 'ทิศทางของหุ่นยนต์ขึ้นกับว่ามันหันไปทางไหน right เลี้ยวขวา left เลี้ยวซ้าย (หมุนอยู่กับที่ ไม่ได้เดิน)',
    hint: 'เดินไปสุดทางขวาก่อน แล้วเลี้ยวขวาให้หันลง ค่อยเดินลง',
    maps: [['S..', '##.', '##G']],
    startDir: 1,
    par: 5,
    solution: 'forward\nforward\nright\nforward\nforward',
    starter: 'forward\n',
  },
  {
    id: 'repeat',
    title: '3. ทำซ้ำด้วย repeat',
    story: 'ทางยาวมาก! เขียน forward ซ้ำๆ หลายบรรทัดน่าเบื่อ ให้คอมพิวเตอร์ทำซ้ำแทน',
    learn: 'ลูป repeat: repeat 3 { forward } = forward 3 ครั้ง เขียนสั้นลง ผิดพลาดน้อยลง (ลองให้ได้ 3 ดาว)',
    hint: 'ทางขวา 7 ช่อง แล้วเลี้ยวขวา แล้วลงอีก 2 ช่อง ใช้ repeat ทั้งสองช่วง',
    maps: [['S.......', '#######.', '#######G']],
    startDir: 1,
    par: 5,
    solution: 'repeat 7 {\n  forward\n}\nright\nrepeat 2 {\n  forward\n}',
    starter: 'repeat 7 {\n  forward\n}\n',
  },
  {
    id: 'stairs',
    title: '4. ลูปที่ซ้ำเป็นลวดลาย',
    story: 'บันไดขึ้นไปหาธง! สังเกตว่าทางซ้ำกันเป็นรูปแบบเดิมๆ',
    learn: 'หา "รูปแบบที่ซ้ำ" แล้วเอาไปไว้ใน repeat ทั้งก้อน — นี่คือการคิดแบบโปรแกรมเมอร์',
    hint: 'ก้าวหนึ่งขั้น = ไปขวา 1 ช่อง, เลี้ยวขวา, ลง 1 ช่อง, เลี้ยวซ้าย (หันกลับมาทางขวา) มีกี่ขั้น?',
    maps: [stairs(3)],
    startDir: 1,
    par: 5,
    solution: 'repeat 3 {\n  forward\n  right\n  forward\n  left\n}',
    starter: 'repeat 3 {\n  forward\n}\n',
  },
  {
    id: 'while',
    title: '5. while: ทำจนกว่า…',
    story: 'คราวนี้มีทางเดินหลายแบบที่ความยาวไม่เท่ากัน โปรแกรมเดียวต้องใช้ได้กับ "ทุกแผนที่" (ดูแท็บแผนที่ด้านบน)',
    learn: 'while เงื่อนไข { … } ทำซ้ำตราบใดที่เงื่อนไขยังจริง ใช้เมื่อไม่รู้ล่วงหน้าว่าต้องซ้ำกี่ครั้ง',
    hint: 'ลองเงื่อนไข front_clear (ข้างหน้าเดินได้) หรือ not_goal (ยังไม่ถึงธง)',
    maps: [['S..G'], ['S.......G'], ['S....G']],
    startDir: 1,
    par: 2,
    solution: 'while front_clear {\n  forward\n}',
    starter: 'while not_goal {\n  \n}\n',
  },
  {
    id: 'if',
    title: '6. if: ตัดสินใจเอง',
    story: 'ทางวนเป็นกรอบสี่เหลี่ยม ขนาดไม่เท่ากัน หุ่นยนต์ต้อง "มองข้างหน้า" แล้วตัดสินใจเอง',
    learn: 'if เงื่อนไข { … } else { … } เลือกทำอย่างใดอย่างหนึ่ง รวมกับ while ได้โปรแกรมที่ใช้ได้กับหลายสถานการณ์',
    hint: 'ถ้าข้างหน้าเดินได้ (front_clear) ก็เดินหน้า ไม่งั้นเลี้ยวขวา — ทำซ้ำจนกว่าจะถึงธง',
    maps: [['S...', '###.', '###.', 'G...'], ['S....', '####.', 'G....'], ['S..', '##.', 'G..']],
    startDir: 1,
    par: 4,
    solution: 'while not_goal {\n  if front_clear {\n    forward\n  } else {\n    right\n  }\n}',
    starter: 'while not_goal {\n  if front_clear {\n    \n  } else {\n    \n  }\n}\n',
  },
  {
    id: 'stairs-while',
    title: '7. ท้าทาย: บันไดทุกความสูง',
    story: 'บันไดมีความสูงไม่เท่ากัน (2, 4 และ 6 ขั้น) เขียนโปรแกรมเดียวที่ขึ้นได้ทุกบันได',
    learn: 'รวมทุกอย่าง: หารูปแบบซ้ำ (ด่าน 4) + ซ้ำจนกว่าถึงเป้า (ด่าน 5) = โปรแกรมที่ทั่วไป (general) ใช้ได้กับขนาดข้อมูลใดก็ได้ นี่คือแนวคิดเดียวกับอัลกอริทึม',
    hint: 'เอาก้อนก้าวบันไดจากด่าน 4 ไปไว้ใน while not_goal',
    maps: [stairs(2), stairs(4), stairs(6)],
    startDir: 1,
    par: 5,
    solution: 'while not_goal {\n  forward\n  right\n  forward\n  left\n}',
    starter: 'while not_goal {\n  \n}\n',
  },
];

export function findLevel(id: string): Level | undefined {
  return LEVELS.find(l => l.id === id);
}
