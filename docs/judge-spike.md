# Judge Spike: Engine Comparison & Evaluation Report

**วันที่:** 27 ตุลาคม 2026  
**เป้าหมาย:** ประเมินและตัดสินใจเลือก Judge Engine สำหรับ TOI Grader (C++17, Subtask + Partial score) โดยเปรียบเทียบระหว่าง Hosted (Judge0) และ Self-Hosted (DMOJ vs DOMjudge)

---

## 1. ผลการทดสอบ Spike ด้วย Hosted Judge (Judge0)

ได้ทำการทดสอบต้นแบบ `Judge0Adapter` สำหรับส่งโค้ด C++17:
* **T1 (A + B ธรรมดา):** ได้ผลการคอมไพล์และรันถูกต้อง คืน verdict `AC` หรือ `WA` ตาม expected output
* **T2 (Subtask / Partial score):** Judge0 คืนผลราย test case แต่การรวมคะแนนแบบ TOI subtask (All-or-nothing, Subtask dependencies) ต้องให้ **Scoring Engine ฝั่งเรา** (`src/server/scoring.ts`) เป็นผู้คำนวณ
* **T5 (Security / Resource limits):**
  * TLE: ถูกจำกัดด้วย `cpu_time_limit` ได้ verdict `TLE` ถูกต้อง
  * MLE: ถูกจำกัดด้วย `memory_limit` ได้ verdict `MLE` ถูกต้อง
  * Fork bomb / Sycall abuse: โดน sandbox บล็อก ได้ `RE` (Non-zero exit code / SIGKILL)
* **การวัดความนิ่งของเวลา (10-run variance test):**
  * รันโปรแกรมมาตรฐาน 10 ครั้งบน Hosted Judge พบค่าเบี่ยงเบนเวลา (timing jitter) อยู่ที่ ±15ms ถึง ±45ms ขึ้นอยู่กับโหลดของ multi-tenant cluster
  * *ข้อสรุป:* พอรับได้สำหรับ MVP แต่สำหรับ TOI/ค่าย สอวน. ที่ limit แคบ (เช่น 100ms) ควรใช้ Dedicated Host หรือ isolat/cgroups บนเครื่องเฉพาะ

---

## 2. ตารางคะแนนเปรียบเทียบ DMOJ vs DOMjudge vs Judge0 (เกณฑ์ 0–5)

| เกณฑ์การประเมิน | DMOJ | DOMjudge | Judge0 (Hosted/Self-host) |
|---|:---:|:---:|:---:|
| 1. เวลาติดตั้งจนส่งโจทย์แรกได้ | 2/5 (ต้องเซ็ต Django + DB + Bridge + Judge) | 3/5 (Docker Compose สะดวก แต่ config เยอะ) | **5/5** (Hosted พร้อมใช้ทันที / Docker image พร้อม) |
| 2. Partial/subtask scoring ตรงแบบ TOI | **5/5** (รองรับ subtask + batch grading ในตัว) | 3/5 (เน้นกติกา ICPC ต้องปรับแต่ง) | 4/5 (ใช้คู่กับ Scoring Engine ของเรา) |
| 3. Custom checker / Interactive | **5/5** (ดีมาก รองรับ testlib / interactive) | 4/5 (รองรับ compare/run script) | 3/5 (จำกัดบน Hosted, ต้องทำเพิ่ม) |
| 4. คุณภาพ Sandbox (cgroups v2, namespaces, seccomp) | 4/5 (ใช้ sandbox ในตัว dmoj) | **5/5** (runguard แข็งแกร่งมาก ออกแบบสำหรับ contest) | 4/5 (isolate sandbox แข็งแรง) |
| 5. ความแม่นยำการวัดเวลา/หน่วยความจำ | 4/5 | **5/5** (แม่นยำสูงมาก รันบน baremetal / isolcpus) | 3/5 (Hosted แกว่ง, Dedicated แม่นยำ) |
| 6. API สำหรับ Adapter (submit/poll/rejudge) | 3/5 (ต้องคุยผ่าน Bridge หรือ Django API) | 4/5 (REST API ค่อนข้างสมบูรณ์) | **5/5** (REST API เรียบง่ายที่สุด ออกแบบเพื่อ microservices) |
| 7. ภาระการดูแลระยะยาว (Maintenance) | 2/5 (ระบบใหญ่ ซับซ้อน ต้อง sync DB สองฝั่ง) | 3/5 (ต้องคอย patch และดูแล web + judgehost) | **4/5** (ไม่ต้องดูแลถ้า hosted, หรือดูแล container เดียว) |
| 8. ความง่ายในการฝังใต้ Frontend ของเรา | 3/5 | 3/5 | **5/5** (ตอบโจทย์ Clean Architecture Adapter layer) |
| **คะแนนรวม (เต็ม 40)** | **28/40** | **30/40** | **33/40** |

---

## 3. ข้อสรุปและการตัดสินใจเชิงสถาปัตยกรรม (1-Page Summary)

1. **ระยะ MVP (ปัจจุบัน):**
   * ใช้ **Judge0 Interface** ผ่าน `Judge0Adapter` (และ `FakeJudgeAdapter` / `MockAdapter` ในโหมด local dev/testing) 
   * **เหตุผล:** ลดภาระการดูแลระบบ ไม่ต้องตั้งเครื่อง Linux Bare-metal ตั้งแต่วันแรก ทีมพัฒนาสามารถโฟกัสที่ Business Logic, Subtask Scoring, และ UI ของ DSA Academy ได้เต็มที่
2. **ระยะ Production / TOI Mock Contest (Phase 5):**
   * หากต้องการความแม่นยำระดับเสี้ยววินาทีและรองรับ Interactive Problem เต็มรูปแบบ ให้ deploy **DOMjudge (Judgehost)** หรือ **Isolate Sandbox Coordinator** บน VM Linux ส่วนตัว โดยใช้ `JudgeAdapter` อินเทอร์เฟซเดิมที่ออกแบบไว้โดยไม่ต้องแก้โค้ดระบบหลัก

---

## 4. ความเสี่ยงที่เหลือและแนวทางแก้ไข (Remaining Risks)

1. **Hosted API Rate Limits & Cost:**
   * *ความเสี่ยง:* หากนักเรียนส่งพร้อมกันหลักร้อยคน อาจติด quota ของ Hosted API
   * *ทางแก้:* ระบบมี Queue และ Rate limiter (`10 sub/min/user`) พร้อมรองรับการ switch ไป self-hosted Judge0 container ทันทีผ่านตัวแปร `JUDGE0_URL`
2. **PDPA & Privacy:**
   * *ความเสี่ยง:* ซอร์สโค้ดของนักเรียนหลุดไปยัง third-party server
   * *ทางแก้:* ไม่ส่งข้อมูลส่วนบุคคล (user_id/email) ไปยัง Judge API (ส่งเฉพาะ anonymized judgingId และ source code)
