export interface LessonContentSection {
  title: string;
  bodyMd: string;
}

export interface LessonData {
  slug: string;
  stage: number;
  trackCompatibility: 'beginner' | 'cp' | 'both';
  topic: string;
  title: string;
  summary: string;
  difficulty: 'D0' | 'D1' | 'D2' | 'D3' | 'D4' | 'D5' | 'D6';
  prerequisites: string[];
  learningObjectives: string[];
  sections: {
    overview: string;
    objectives: string;
    prerequisites: string;
    explanation: string;
    workedExamples: string;
    c17Implementation: string;
    cpp17Implementation: string;
    complexityAnalysis: string;
    correctnessProof: string;
    commonMistakes: string;
    guidedPractice: string;
    independentProblems: string;
    testSpecifications: string;
    progressiveHints: string[];
    editorial: string;
    masteryCriteria: string[];
    relatedTopics: string[];
  };
  codeExamples: Array<{
    language: string;
    standard: string;
    title: string;
    code: string;
    explanation: string;
  }>;
  estimatedMinutes: number;
}

export const VERTICAL_SLICE_LESSONS: LessonData[] = [
  // --- Lesson 1: Stage 0 (Beginner Track) ---
  {
    slug: 'variables-and-memory-basics',
    stage: 0,
    trackCompatibility: 'beginner',
    topic: 'Programming from -1',
    title: 'ตัวแปร ชนิดข้อมูล และกลไกหน่วยความจำจากศูนย์ (Variables, Types & Memory)',
    summary: 'ทำความเข้าใจว่าคอมพิวเตอร์จัดเก็บข้อมูลอย่างไรในระดับบิตและไบต์ การเลือกชนิดตัวแปรที่ถูกต้อง และป้องกันข้อผิดพลาดคลาสสิกอย่าง Integer Overflow',
    difficulty: 'D0',
    prerequisites: [],
    learningObjectives: [
      'เข้าใจโมเดลกล่องความจำ (Memory Cells) และที่อยู่หน่วยความจำ (Memory Address)',
      'แยกความแตกต่างระหว่างชนิดข้อมูลจำนวนเต็ม (int, long long) และทศนิยม (double)',
      'คำนวณช่วงค่าต่ำสุดและสูงสุดของตัวแปรประเภทต่างๆ และระบุสาเหตุของ Overflow',
      'เขียนโปรแกรมรับค่า แสดงผล และคำนวณพื้นฐานใน C17 และ C++17 ได้อย่างถูกต้อง',
    ],
    sections: {
      overview: `คอมพิวเตอร์ไม่ได้เข้าใจ "ตัวแปร" ในแบบที่มนุษย์เข้าใจ ตัวแปรในภาษา C และ C++ เป็นเพียงชื่อเรียกแทน "พื้นที่ในหน่วยความจำ RAM" ขนาดกี่ไบต์ที่กำหนดไว้ล่วงหน้า หากเราเลือกกล่องขนาดเล็กเกินไป ข้อมูลจะล้น (Overflow) และทำให้คำตอบผิดทันที`,
      objectives: `1. สามารถอธิบายขนาดในหน่วยความจำและช่วงค่าของ int, long long, char, double\n2. เข้าใจการทำงานของตัวดำเนินการหารจำนวนเต็ม (Integer Division) และ Modulo\n3. สามารถเลือกใช้ Data Type ที่ปลอดภัยต่อโจทย์แข่งขัน`,
      prerequisites: `ไม่มี (เริ่มต้นจากศูนย์ เหมาะสำหรับผู้เรียนที่ไม่มีพื้นฐานเขียนโปรแกรมมาก่อน)`,
      explanation: `ในสถาปัตยกรรม 64-bit สมัยใหม่:\n- **char**: ขนาด 1 ไบต์ (8 บิต) เก็บค่า -128 ถึง 127 หรือตัวอักษร ASCII\n- **int**: ขนาด 4 ไบต์ (32 บิต) เก็บค่าประมาณ -2.14 x 10^9 ถึง 2.14 x 10^9 (~2 พันล้าน)\n- **long long**: ขนาด 8 ไบต์ (64 บิต) เก็บค่าประมาณ -9.22 x 10^18 ถึง 9.22 x 10^18 (~9 ล้านล้านล้าน)\n- **double**: ขนาด 8 ไบต์ เก็บเลขทศนิยมความละเอียด 15-17 ตำแหน่ง\n\n**กฎเหล็ก:** ในการแข่งขัน หากผลลัพธ์มีโอกาสเกิน 2 x 10^9 ต้องใช้ long long ทันที`,
      workedExamples: `**ตัวอย่างที่ 1: การคำนวณพื้นที่สี่เหลี่ยมผืนผ้า**\nกำหนดให้ความกว้าง $W = 10^6$ และความยาว $H = 10^6$\nหากใช้ int: พื้นที่ $W \\times H = 10^{12}$ ซึ่งเกิน $2 \\times 10^9$ ผลลัพธ์จะล้นกลายเป็นค่าติดลบ!\nวิธีแก้: ใช้ long long สำหรับตัวแปรคำนวณ`,
      c17Implementation: `#include <stdio.h>\n\nint main(void) {\n    long long width, height;\n    if (scanf("%lld %lld", &width, &height) == 2) {\n        long long area = width * height;\n        printf("%lld\\n", area);\n    }\n    return 0;\n}`,
      cpp17Implementation: `#include <iostream>\nusing namespace std;\n\nint main() {\n    ios_base::sync_with_stdio(false);\n    cin.tie(NULL);\n    \n    long long width, height;\n    if (cin >> width >> height) {\n        long long area = width * height;\n        cout << area << "\\n";\n    }\n    return 0;\n}`,
      complexityAnalysis: `Time Complexity: O(1) - การดำเนินการทางคณิตศาสตร์ระดับฮาร์ดแวร์ใช้เวลาคงที่\nSpace Complexity: O(1) - จองพื้นที่หน่วยความจำคงที่ 16 ไบต์สำหรับตัวแปรสองตัว`,
      correctnessProof: `เมื่อ $W, H \\le 10^9$ ค่าสูงสุดของ $W \\times H \\le 10^{18}$ ซึ่งน้อยกว่าขอบเขตสูงสุดของ 64-bit Signed Integer ($2^{63}-1 \\approx 9.22 \\times 10^{18}$) จึงรับประกันว่าจะไม่เกิด Integer Overflow อย่างแน่นอน`,
      commonMistakes: `1. ลืม casting ตอนคูณ: \`long long ans = a * b;\` หากทั้ง a และ b เป็น int ผลคูณจะถูกคำนวณเป็น int ก่อนแล้วค่อยแปลงเป็น long long ซึ่ง overflow ไปแล้ว ต้องเขียน \`long long ans = (long long)a * b;\`\n2. ใช้ float แทน double: float มีความละเอียดเพียง 6-7 หลัก จะเกิด rounding error ในการคำนวณที่แม่นยำ`,
      guidedPractice: `**แบบฝึกหัดพร้อมเฉลย:** จงรับรัศมีวงกลม $r$ (จำนวนจริง) และคำนวณเส้นรอบวง $2 \\times \\pi \\times r$\n- ต้องประกาศตัวแปรเป็น \`double\`\n- ใช้ค่าคงที่ $\\pi = 3.141592653589793$\n- แสดงผลทศนิยมด้วย \`printf("%.6f\\n", ans);\` หรือ \`cout << fixed << setprecision(6) << ans;\``,
      independentProblems: `1. ผลรวมของจำนวนเต็ม 3 จำนวน (Input สูงสุดแต่ละตัว $10^9$)\n2. แปลงวินาทีเป็น ชั่วโมง:นาที:วินาที ด้วยตัวดำเนินการ / และ %\n3. คำนวณดอกเบี้ยทบต้นด้วยสูตร $A = P(1 + r)^t$`,
      testSpecifications: `Input: สองจำนวนเต็มแยกด้วยช่องว่าง $a, b$ ($1 \\le a, b \\le 10^9$)\nOutput: บรรทัดเดียวแสดงผลคูณ $a \\times b$\nSubtask 1 (40%): $a, b \\le 10^4$\nSubtask 2 (60%): $a, b \\le 10^9$`,
      progressiveHints: [
        'ลองสังเกตว่าผลคูณสูงสุดของ Input มีค่าเท่าไหร่ และเกินช่วงของ int หรือไม่',
        'ตัวแปรประเภท int ในภาษา C++ รองรับค่าสูงสุดได้ประมาณ 2,147,483,647 (~2 x 10^9)',
        'เปลี่ยนชนิดตัวแปรของทั้ง $a$ และ $b$ ให้เป็น `long long` ทั้งหมด',
      ],
      editorial: `โจทย์ข้อนี้ทดสอบความเข้าใจเรื่องขอบเขตของประเภทข้อมูล เมื่อ $a, b \\le 10^9$ ค่า $a \\times b$ สูงสุดคือ $10^{18}$ ซึ่งเกินขอบเขตของ 32-bit int แต่ยังอยู่ในขอบเขตของ 64-bit signed int (long long) การประกาศตัวแปรเป็น long long ทั้งหมดจะแก้ปัญหานี้ได้อย่างสมบูรณ์`,
      masteryCriteria: [
        'สามารถระบุขนาดหน่วยความจำของ int, long long, char, double ได้ถูกต้องโดยไม่ต้องเปิดตาราง',
        'สามารถมองเห็นจุดเสี่ยง Integer Overflow จากโจทย์ที่มีตัวเลข $10^5$ คูณกัน',
        'เขียนโปรแกรมรับและแสดงผลด้วย Fast I/O ใน C++17 ได้อย่างคล่องแคล่ว',
      ],
      relatedTopics: ['S0-03: Boolean Logic & Conditions', 'S1-01: Memory Model & Pointers', 'S1-09: Number Representation & Overflow'],
    },
    codeExamples: [
      {
        language: 'c',
        standard: 'c17',
        title: 'C17 Safe Multiplication',
        code: `#include <stdio.h>\n\nint main(void) {\n    long long a, b;\n    if (scanf("%lld %lld", &a, &b) == 2) {\n        printf("%lld\\n", a * b);\n    }\n    return 0;\n}`,
        explanation: 'ใช้ %lld สำหรับการรับและพิมพ์ค่า 64-bit integer ใน C17 มาตรฐาน',
      },
      {
        language: 'cpp',
        standard: 'c++17',
        title: 'C++17 Fast I/O & Safe Types',
        code: `#include <iostream>\nusing namespace std;\n\nint main() {\n    ios_base::sync_with_stdio(false);\n    cin.tie(NULL);\n    \n    long long a, b;\n    if (cin >> a >> b) {\n        cout << a * b << "\\n";\n    }\n    return 0;\n}`,
        explanation: 'C++17 Fast I/O ช่วยลดเวลาในการอ่าน input ขนาดใหญ่จากวินาทีเหลือระดับมิลลิวินาที',
      },
    ],
    estimatedMinutes: 40,
  },

  // --- Lesson 2: Stage 1 (Language Foundations) ---
  {
    slug: 'pointers-and-memory-mechanics',
    stage: 1,
    trackCompatibility: 'both',
    topic: 'C17 and C++17 Foundations',
    title: 'พอยน์เตอร์ กลไกหน่วยความจำ Stack vs Heap และ References ใน C17/C++17',
    summary: 'เจาะลึกการทำงานของที่อยู่หน่วยความจำจริง การส่งค่าผ่าน Pass-by-value vs Pass-by-reference และวิธีหลีกเลี่ยงข้อผิดพลาด Undefined Behavior จาก Memory Corruptions',
    difficulty: 'D1',
    prerequisites: ['variables-and-memory-basics'],
    learningObjectives: [
      'เข้าใจความแตกต่างระหว่าง Stack Memory (ทำงานเร็วแต่ขนาดจำกัด) กับ Heap Memory (ยืดหยุ่น)',
      'ใช้งาน Address-of operator (&) และ Dereference operator (*) ได้อย่างถูกต้องแม่นยำ',
      'เปรียบเทียบการทำงานของ Pointer ใน C17 กับ Reference (&) ใน C++17',
      'ป้องกันข้อผิดพลาด Segmentation Fault, Null Pointer Dereference, และ Memory Leaks',
    ],
    sections: {
      overview: `ทำไมโปรแกรมของเราถึงเกิด Segmentation Fault? ทำไมฟังก์ชันสลับค่า (swap) ถึงไม่ทำงานเมื่อส่งตัวแปรเข้าไป? คำตอบอยู่ที่การทำความเข้าใจเรื่อง Pointer และ Reference ซึ่งเป็นหัวใจสำคัญของการเขียนโค้ดประสิทธิภาพสูงระดับอัลกอริทึม`,
      objectives: `1. เข้าใจโครงสร้าง Stack Frame ของฟังก์ชัน\n2. สามารถเขียนฟังก์ชันที่แก้ไขค่าของตัวแปรภายนอกได้ผ่าน Pointer หรือ Reference\n3. เข้าใจว่าอาเรย์กับพอยน์เตอร์สัมพันธ์กันอย่างไรในระดับฮาร์ดแวร์`,
      prerequisites: `S0-02 (ตัวแปรและหน่วยความจำ), ฟังก์ชันพื้นฐาน`,
      explanation: `**Stack Memory:**\nจัดสรรโดยคอมไพเลอร์อัตโนมัติเมื่อเรียกใช้ฟังก์ชัน ตัวแปรท้องถิ่น (Local variables) ทั้งหมดจะอยู่บน Stack มีความเร็วสูงมาก แต่มีขนาดจำกัด (บน Grader มักจำกัด Stack ไว้ 8MB ถึง 256MB) หากประกาศอาเรย์ขนาดใหญ่เกินไปในฟังก์ชัน จะเกิด Stack Overflow ทันที\n\n**Heap Memory:**\nพื้นที่หน่วยความจำขนาดใหญ่ที่จัดสรรแบบไดนามิกระหว่างรันไทม์ (ด้วย \`malloc\` ใน C หรือ \`new\` / \`std::vector\` ใน C++)\n\n**Pointer vs Reference:**\n- Pointer คือตัวแปรที่เก็บ "เลขที่อยู่" (Address) สามารถเปลี่ยนไปชี้ที่อื่นได้ และเป็น \`NULL\` ได้\n- Reference ใน C++ คือ "ชื่อเล่น" (Alias) ของตัวแปรเดิม ไม่สามารถเปลี่ยนที่ชี้ใหม่ได้ และไม่มีค่า null ปลอดภัยกว่า`,
      workedExamples: `**ตัวอย่าง: การทำงานของ Swap Function**\nหากส่งตัวแปรแบบ Pass-by-Value: ฟังก์ชันจะคัดลอกค่าลงใน Stack frame ใหม่ เมื่อจบฟังก์ชัน ค่าเดิมจะไม่เปลี่ยน\nการส่งแบบ Pass-by-Reference ใน C++17: \`void swap(int &a, int &b)\` จะอ้างอิงตรงไปยังหน่วยความจำเดิม ทำให้สลับค่าได้จริงโดยไม่มี overhead ในการ copy`,
      c17Implementation: `#include <stdio.h>\n\nvoid swap_c(int *a, int *b) {\n    int temp = *a;\n    *a = *b;\n    *b = temp;\n}\n\nint main(void) {\n    int x = 10, y = 20;\n    swap_c(&x, &y);\n    printf("%d %d\\n", x, y); // 20 10\n    return 0;\n}`,
      cpp17Implementation: `#include <iostream>\nusing namespace std;\n\nvoid swap_cpp(int &a, int &b) {\n    int temp = a;\n    a = b;\n    b = temp;\n}\n\nint main() {\n    int x = 10, y = 20;\n    swap_cpp(x, y);\n    cout << x << " " << y << "\\n"; // 20 10\n    return 0;\n}`,
      complexityAnalysis: `Time Complexity: O(1) - การส่งแบบ Reference ส่งเพียงที่อยู่ 8 ไบต์ ไม่ขึ้นกับขนาดของข้อมูล\nSpace Complexity: O(1) - ไม่มีการจัดสรรหน่วยความจำเพิ่มเติม`,
      correctnessProof: `เนื่องจาก Parameter \`int &a\` ถูกผูก (bound) กับตัวแปร \`x\` ใน Caller Frame ทุกการอ่านและเขียนผ่าน \`a\` จึงเป็นการแก้ข้อมูลในตำแหน่ง Memory Address เดียวกันกับ \`x\` ส่งผลให้ค่าเปลี่ยนทันที`,
      commonMistakes: `1. การคืนค่า Pointer หรือ Reference ของตัวแปร Local: ตัวแปรจะถูกทำลายเมื่อฟังก์ชันสิ้นสุดลง การเข้าถึงหลังจากนั้นคือ Undefined Behavior\n2. ลืมตรวจ Pointer เป็น NULL ก่อน Dereference นำไปสู่ Segmentation Fault\n3. ประกาศอาเรย์ขนาดใหญ่มาก (เช่น \`int arr[1000000]\`) ไว้ในฟังก์ชัน \`main()\` ซึ่งทำให้เกิด Stack Overflow ควรประกาศเป็นตัวแปรรอบนอก (Global) หรือใช้ \`std::vector\``,
      guidedPractice: `**แบบฝึกหัด:** เขียนฟังก์ชันรับ vector ของจำนวนเต็มแบบ Pass-by-Reference และหาค่าต่ำสุดและสูงสุดพร้อมกันโดยส่งผลลัพธ์กลับผ่านตัวแปรอ้างอิง\n\`void findMinMax(const vector<int> &vec, int &minVal, int &maxVal)\`\nข้อสังเกต: ใช้ \`const\` เพื่อป้องกันการแก้ไขข้อมูลและหลีกเลี่ยงการ Copy ข้อมูลขนาดใหญ่`,
      independentProblems: `1. สร้างฟังก์ชัน Reverse Array โดยใช้ Pointer สองตัวเลื่อนเข้าหากัน\n2. ตรวจจับการรั่วไหลของหน่วยความจำ (Memory Leak) จากการใช้ malloc โดยไม่มี free\n3. วัดเวลาการส่ง \`vector<int>\` ขนาด $10^7$ ช่องแบบ Pass-by-Value เทียบกับ Pass-by-Reference`,
      testSpecifications: `Input: อาเรย์ของจำนวนเต็ม $N$ ตัว ($1 \\le N \\le 10^5$)\nOutput: สลับสมาชิกตัวแรกและตัวสุดท้ายของอาเรย์แล้วแสดงผล\nSubtask 1 (100%): $N \\le 10^5$`,
      progressiveHints: [
        'พิจารณาว่าการส่งอาเรย์ขนาดใหญ่เข้าไปในฟังก์ชันโดยไม่ใช้ Reference จะใช้เวลาและหน่วยความจำเท่าใด',
        'จำไว้ว่าชื่อของอาเรย์ในภาษา C จะลดรูป (decay) เป็นพอยน์เตอร์ชี้ไปยังสมาชิกตัวแรก',
        'ใน C++ ควรใช้ `std::vector<int> &arr` เพื่อความปลอดภัยและความรวดเร็ว',
      ],
      editorial: `การใช้ Pass-by-Reference ช่วยลด Overhead ในการคัดลอกข้อมูลขนาดใหญ่จาก $O(N)$ เหลือ $O(1)$ เวลาในการทำงาน ซึ่งสำคัญอย่างยิ่งในโจทย์ที่มีการเรียกฟังก์ชันซ้ำๆ เช่น DFS หรือ Recursive Function`,
      masteryCriteria: [
        'สามารถอธิบายความต่างระหว่าง Stack และ Heap ได้ชัดเจน',
        'แยกความแตกต่างและเลือกใช้ระหว่าง Pointer ใน C และ Reference ใน C++ ได้ถูกต้อง',
        'เข้าใจสาเหตุและแก้ปัญหา Segmentation Fault ได้อย่างเป็นระบบ',
      ],
      relatedTopics: ['S1-04: C++17 References & Vectors', 'S3-01: Linear Memory & Stacks', 'S4-01: Graph Representations with Vectors'],
    },
    codeExamples: [
      {
        language: 'cpp',
        standard: 'c++17',
        title: 'Safe Const Reference Pattern',
        code: `#include <iostream>\n#include <vector>\nusing namespace std;\n\n// const & ป้องกันการ copy ข้อมูลขนาดใหญ่ และรับประกันว่าจะไม่แก้ไขข้อมูลต้นฉบับ\nlong long sumElements(const vector<long long> &arr) {\n    long long sum = 0;\n    for (const auto &val : arr) {\n        sum += val;\n    }\n    return sum;\n}\n\nint main() {\n    vector<long long> data = {1, 2, 3, 4, 5};\n    cout << sumElements(data) << "\\n";\n    return 0;\n}`,
        explanation: 'รูปแบบ const vector<T>& เป็น Best Practice มาตรฐานใน C++ เพื่อประสิทธิภาพสูงสุดและปลอดภัย',
      },
    ],
    estimatedMinutes: 50,
  },

  // --- Lesson 3: Stage 2 (Algorithmic Thinking & Complexity) ---
  {
    slug: 'prefix-sums-range-queries',
    stage: 2,
    trackCompatibility: 'both',
    topic: 'Algorithmic Thinking and Complexity',
    title: 'Prefix Sums: แปลงการค้นหาช่วงจาก O(N) สู่ O(1) (Range Queries)',
    summary: 'เรียนรู้เทคนิคการสะสมผลรวมล่วงหน้า (Precomputation) เพื่อตอบคำถามผลรวมช่วง $Q$ ครั้งได้ในเวลา $O(1)$ ต่อคำถาม พร้อมต่อยอดสู่ 2D Prefix Sums และ Difference Arrays',
    difficulty: 'D2',
    prerequisites: ['variables-and-memory-basics'],
    learningObjectives: [
      'เข้าใจปัญหาความซ้ำซ้อนของการคำนวณช่วงแบบ Brute Force เมื่อ $Q$ มีขนาดใหญ่',
      'สร้างอาร์เรย์ Prefix Sum ด้วยสูตร recurrence $P[i] = P[i-1] + A[i]$ ในเวลา $O(N)$',
      'คำนวณผลรวมช่วง $[L, R]$ ในเวลา $O(1)$ ด้วยสูตร $P[R] - P[L-1]$ (ใช้ 1-based indexing)',
      'ระวังและแก้ไขปัญหา Integer Overflow เมื่อบวกค่าจำนวนเต็มหลายตัวเข้าด้วยกัน',
    ],
    sections: {
      overview: `หากมีคำถามถามว่า "ผลรวมของตัวเลขตั้งแต่ตำแหน่งที่ L ถึง R มีค่าเท่าใด?" ถ้าเราใช้ลูปบวกตรงๆ ทุกครั้ง จะใช้เวลา $O(N)$ ต่อคำถาม หากมี $Q = 10^5$ คำถามและ $N = 10^5$ เวลารวมจะเป็น $O(NQ) = 10^{10}$ การคำนวณ ซึ่งจะติด Time Limit Exceeded (TLE) ทันที! Prefix Sums คือเทคนิคที่ทำให้ตอบได้ใน $O(1)$`,
      objectives: `1. สามารถอธิบายหลักการ Precomputation และ Time-Space Tradeoff\n2. เขียนโค้ดสร้างและสืบค้น 1D Prefix Sum ได้อย่างถูกต้อง ไม่ตกหล่น Off-by-one\n3. ประยุกต์ใช้กับโจทย์การนับความถี่และตรวจสอบคุณสมบัติของช่วง`,
      prerequisites: `ตัวแปรชนิด long long, 1D Arrays, ลูป for`,
      explanation: `กำหนดให้อาเรย์ $A$ มีสมาชิก $N$ ตัว\nเราสร้างอาเรย์ใหม่ $P$ (ขนาด $N+1$) โดยกำหนดให้:\n- $P[0] = 0$\n- $P[i] = P[i-1] + A[i]$ สำหรับ $i = 1, 2, \\dots, N$\n\nเมื่อต้องการผลรวมของ $A[L] + A[L+1] + \\dots + A[R]$:\nสังเกตว่า:\n$P[R] = A[1] + A[2] + \\dots + A[L-1] + A[L] + \\dots + A[R]$\n$P[L-1] = A[1] + A[2] + \\dots + A[L-1]$\nดังนั้น ผลรวมช่วงคือ:\n$$\\sum_{i=L}^{R} A[i] = P[R] - P[L-1]$$\nสามารถตอบได้ด้วยการลบเพียง 1 ครั้งในเวลา $O(1)$!`,
      workedExamples: `กำหนด $A = [3, 1, 4, 1, 5]$\nสร้าง Prefix Sum (1-based index):\n- $P[0] = 0$\n- $P[1] = 0 + 3 = 3$\n- $P[2] = 3 + 1 = 4$\n- $P[3] = 4 + 4 = 8$\n- $P[4] = 8 + 1 = 9$\n- $P[5] = 9 + 5 = 14$\n\nคำถาม: หาผลรวมตำแหน่ง $L=2$ ถึง $R=4$ ($1+4+1 = 6$)\nคำนวณจากสูตร: $P[4] - P[1] = 9 - 3 = 6$ ถูกต้องใน $O(1)$!`,
      c17Implementation: `#include <stdio.h>\n\n#define MAXN 200005\nlong long P[MAXN];\n\nint main(void) {\n    int n, q;\n    if (scanf("%d %d", &n, &q) != 2) return 0;\n    \n    P[0] = 0;\n    for (int i = 1; i <= n; i++) {\n        long long val;\n        scanf("%lld", &val);\n        P[i] = P[i - 1] + val;\n    }\n    \n    for (int i = 0; i < q; i++) {\n        int l, r;\n        scanf("%d %d", &l, &r);\n        printf("%lld\\n", P[r] - P[l - 1]);\n    }\n    return 0;\n}`,
      cpp17Implementation: `#include <iostream>\n#include <vector>\nusing namespace std;\n\nint main() {\n    ios_base::sync_with_stdio(false);\n    cin.tie(NULL);\n    \n    int n, q;\n    if (!(cin >> n >> q)) return 0;\n    \n    vector<long long> p(n + 1, 0);\n    for (int i = 1; i <= n; i++) {\n        long long val;\n        cin >> val;\n        p[i] = p[i - 1] + val;\n    }\n    \n    while (q--) {\n        int l, r;\n        cin >> l >> r;\n        cout << p[r] - p[l - 1] << "\\n";\n    }\n    return 0;\n}`,
      complexityAnalysis: `Preprocessing Time: O(N) - วนลูปบวกสะสม 1 รอบ\nQuery Time: O(1) - การลบตัวเลข 1 ครั้งต่อคำถาม\nTotal Time Complexity: O(N + Q) ซึ่งรันผ่านภายใน 0.1 วินาทีสำหรับ N, Q = 200,000\nSpace Complexity: O(N) - เก็บอาร์เรย์สะสมขนาด N+1`,
      correctnessProof: `พิสูจน์โดยการอุปนัยเชิงคณิตศาสตร์ (Mathematical Induction):\nสำหรับ Base case: $P[0] = 0$ ผลรวมของ 0 สมาชิกคือ 0\nสมมุติว่า $P[k] = \\sum_{i=1}^{k} A[i]$ เป็นจริง\nสำหรับ $k+1$: $P[k+1] = P[k] + A[k+1] = \\sum_{i=1}^{k} A[i] + A[k+1] = \\sum_{i=1}^{k+1} A[i]$\nดังนั้น $P[R] - P[L-1] = \\sum_{i=1}^{R} A[i] - \\sum_{i=1}^{L-1} A[i] = \\sum_{i=L}^{R} A[i]$ ถูกต้องเสมอสำหรับทุก $1 \\le L \\le R \\le N$`,
      commonMistakes: `1. ลืมใช้ 1-based indexing: หากใช้ 0-based indexing เมื่อ $L=0$ สูตร $P[L-1]$ จะเข้าถึงตำแหน่ง $P[-1]$ ซึ่งทำให้โปรแกรมแครช (Segfault)\n2. ไม่ใช้ Fast I/O: ในโจทย์ที่ $Q = 2 \\times 10^5$ การใช้ \`std::endl\` แทน \`"\\n"\` จะทำให้โปรแกรมช้าลงเกิน 1 วินาที\n3. Overflow ในการบวกสะสม: หากสมาชิกแต่ละตัวมีค่า $10^9$ และ $N = 10^5$ ผลรวมสะสมจะสูงถึง $10^{14}$ ต้องใช้อาร์เรย์ชนิด \`long long\` เสมอ`,
      guidedPractice: `**โจทย์ประยุกต์:** มีนักเรียน $N$ คน ยืนเรียงกัน แต่ละคนมีคะแนน จงหาว่ามีช่วงกี่ช่วงที่มีคะแนนเฉลี่ยมากกว่าหรือเท่ากับ $K$\n- จัดรูปใหม่: $A[i] - K$\n- หาผลรวมสะสม $P[i]$\n- เงื่อนไขกลายเป็น $P[R] - P[L-1] \\ge 0 \\iff P[R] \\ge P[L-1]$ ซึ่งสามารถนับคู่อันดับได้ด้วย Inversion counting หรือ Merge Sort ใน $O(N \\log N)$`,
      independentProblems: `1. Range Sum Query (Static 1D) - ส่งตรวจได้ใน Judge\n2. Subarray Sum Equals K (นับจำนวนช่วงที่ผลรวมเท่ากับ K ด้วย Hash map)\n3. 2D Range Sum Query (ผลรวมพื้นที่สี่เหลี่ยมในตาราง $N \\times M$)`,
      testSpecifications: `Input: บรรทัดแรก $N, Q$ ($1 \\le N, Q \\le 200,000$)\nบรรทัดที่สอง $A_1, A_2, \\dots, A_N$ ($-10^9 \\le A_i \\le 10^9$)\nอีก $Q$ บรรทัด แต่ละบรรทัดระบุ $L_i, R_i$ ($1 \\le L_i \\le R_i \\le N$)\nOutput: คำตอบ $Q$ บรรทัด แต่ละบรรทัดคือผลรวมช่วง\nSubtask 1 (30 คะแนน): $N, Q \\le 1000$\nSubtask 2 (70 คะแนน): $N, Q \\le 200,000$`,
      progressiveHints: [
        'หากใช้วิธีลูปบวกตรงๆ ทุก Query จะใช้เวลา $O(N)$ ต่อ Query รวมเป็น $O(N \\times Q) = 4 \\times 10^{10}$ ซึ่งช้าเกินไป',
        'เราสามารถบวกสะสมตัวเลขจากซ้ายไปขวาเก็บไว้ในอาเรย์ขนาด $N+1$ ไว้ล่วงหน้าได้หรือไม่?',
        'ผลรวมของช่วง $[L, R]$ คือ ผลรวมตั้งแต่ตัวแรกถึงตัวที่ $R$ ลบด้วยผลรวมตั้งแต่ตัวแรกถึงตัวที่ $L-1$',
      ],
      editorial: `ใช้เทคนิค 1D Prefix Sum โดยจองอาร์เรย์ \`long long P[N + 1]\` คำนวณ $P[i] = P[i-1] + A[i]$ ในเวลา $O(N)$ จากนั้นแต่ละ Query สามารถตอบได้ด้วยสูตร $P[R] - P[L-1]$ ในเวลา $O(1)$ เวลารวมคือ $O(N + Q)$ หน่วยความจำ $O(N)$ ผ่านเกณฑ์ 100 คะแนนเต็ม`,
      masteryCriteria: [
        'สร้างอาร์เรย์ Prefix Sum และตอบ Query ได้อย่างคล่องแคล่วโดยไม่เกิด Off-by-one',
        'เข้าใจเหตุผลที่ต้องใช้ long long ในการเก็บผลรวมสะสม',
        'สามารถอธิบายการขยายผลลัพธ์ไปสู่ 2D Prefix Sums ด้วยหลักการ Inclusion-Exclusion ได้',
      ],
      relatedTopics: ['S2-06: Difference Arrays', 'S2-07: Two Pointers & Sliding Window', 'S3-04: Fenwick Tree (Dynamic Prefix Sums)'],
    },
    codeExamples: [
      {
        language: 'cpp',
        standard: 'c++17',
        title: 'Complete Prefix Sum Implementation',
        code: `#include <iostream>\n#include <vector>\nusing namespace std;\n\nint main() {\n    // Fast I/O\n    ios_base::sync_with_stdio(false);\n    cin.tie(NULL);\n    \n    int n, q;\n    if (!(cin >> n >> q)) return 0;\n    \n    vector<long long> prefix(n + 1, 0);\n    for (int i = 1; i <= n; i++) {\n        long long val;\n        cin >> val;\n        prefix[i] = prefix[i - 1] + val;\n    }\n    \n    while (q--) {\n        int l, r;\n        cin >> l >> r;\n        cout << prefix[r] - prefix[l - 1] << "\\n";\n    }\n    return 0;\n}`,
        explanation: 'โค้ดมาตรฐานสำหรับโจทย์ Range Sum Query ใช้เวลา O(N + Q) และหน่วยความจำ O(N)',
      },
    ],
    estimatedMinutes: 45,
  },
];
