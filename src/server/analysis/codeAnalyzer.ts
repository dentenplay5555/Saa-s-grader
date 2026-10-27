export interface PedagogicalHint {
  category: 'performance' | 'overflow' | 'bounds' | 'initialization' | 'conceptual';
  severity: 'suggestion' | 'warning' | 'critical';
  title: string;
  message: string;
  remediationSnippet?: string;
}

export class CodeAnalyzer {
  /**
   * Analyzes student C/C++ source code to produce non-leaking educational hints
   * for common algorithmic and language pitfalls.
   */
  public static analyze(sourceCode: string, problemTags: string[] = []): PedagogicalHint[] {
    const hints: PedagogicalHint[] = [];

    // 1. Check for Fast I/O in C++
    const usesCinCout = /(cin\s*>>|cout\s*<<)/.test(sourceCode);
    const hasFastIo = /(sync_with_stdio\s*\(\s*(false|0)\s*\)|cin\.tie\s*\(\s*(NULL|nullptr|0)\s*\))/.test(sourceCode);
    if (usesCinCout && !hasFastIo) {
      hints.push({
        category: 'performance',
        severity: 'warning',
        title: 'การเพิ่มความเร็วการรับส่งข้อมูล (Fast I/O)',
        message: 'โค้ดของคุณใช้ `cin` หรือ `cout` โดยไม่ได้ปิดการซิงก์กับ C stdio สำหรับโจทย์ที่มีข้อมูลนำเข้าหรือส่งออกจำนวนมาก (เช่น $N \\ge 10^5$) อาจทำให้เกิด Time Limit Exceeded (TLE) ได้',
        remediationSnippet: 'ios_base::sync_with_stdio(false);\ncin.tie(NULL);'
      });
    }

    // 2. Check for Potential 32-bit Integer Overflow
    const isPrefixSumOrLargeMath = problemTags.some(t => ['prefix-sums', 'math', 'dp', 'range-query'].includes(t));
    const usesLongLong = /\blong\s+long\b|\bint64_t\b/.test(sourceCode);
    const declaresIntAccumulator = /\bint\s+(sum|ans|total|prefix|res|acc)\b/.test(sourceCode);
    if (isPrefixSumOrLargeMath && !usesLongLong && declaresIntAccumulator) {
      hints.push({
        category: 'overflow',
        severity: 'critical',
        title: 'ระวังปัญหา Integer Overflow',
        message: 'โจทย์หัวข้อนี้มักมีผลรวมหรือผลคูณที่เกินช่วงของจำนวนเต็ม 32 บิต (`int` เก็บค่าได้ประมาณ $\\pm 2 \\times 10^9$) หากผลรวมสะสมเกินค่านี้จะเกิดภาวะ Overflow และให้คำตอบผิดพลาดทันที แนะนำให้เปลี่ยนตัวแปรสะสมเป็น `long long`',
        remediationSnippet: 'long long sum = 0;'
      });
    }

    // 3. Check for Small Fixed Array Bounds
    const smallArrayMatch = /\bint\s+[a-zA-Z0-9_]+\s*\[\s*(100|1000|1005|2000)\s*\]/.test(sourceCode);
    const requiresLargeArray = problemTags.some(t => ['prefix-sums', 'arrays', 'graphs'].includes(t));
    if (smallArrayMatch && requiresLargeArray) {
      hints.push({
        category: 'bounds',
        severity: 'warning',
        title: 'ขนาดของอาร์เรย์ (Array Out of Bounds)',
        message: 'ตรวจพบการประกาศขนาดของอาร์เรย์ที่มีขนาดเล็ก ($N \\le 2000$) โปรดตรวจสอบ Constraints ของโจทย์ว่า $N$ สูงสุดเท่าใด หากโจทย์กำหนด $N \\le 200,000$ การประกาศอาร์เรย์ขนาดเล็กจะทำให้เข้าถึงหน่วยความจำเกิน (Out of Bounds / SIGSEGV)',
        remediationSnippet: 'const int MAXN = 200005;\nlong long a[MAXN];'
      });
    }

    // 4. Check for Uninitialized Accumulator Variable
    const uninitializedAccumulator = /\b(int|long\s+long)\s+(sum|ans|total|res)\s*;/i.test(sourceCode);
    if (uninitializedAccumulator) {
      hints.push({
        category: 'initialization',
        severity: 'critical',
        title: 'ตัวแปรสะสมยังไม่ได้กำหนดค่าเริ่มต้น (Garbage Value)',
        message: 'ในภาษา C/C++ ตัวแปรแบบ local variable ที่ไม่ได้กำหนดค่าเริ่มต้นจะมีค่าขยะ (Garbage Value) ตกค้างในหน่วยความจำ ควรกำหนดค่าเริ่มต้นให้ตัวแปรสะสมเป็น 0 ก่อนเริ่มบวกสะสมเสมอ',
        remediationSnippet: 'long long sum = 0;'
      });
    }

    return hints;
  }
}
