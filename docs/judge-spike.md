# Judge Spike: Engine Comparison & Evaluation Report

**วันที่:** 27 ตุลาคม 2026  
**เป้าหมาย:** ประเมินและตัดสินใจเลือก Judge Engine สำหรับ TOI Grader (C++17, Subtask + Partial score) โดยเปรียบเทียบระหว่าง Hosted (Judge0) และ Self-Hosted (DMOJ vs DOMjudge)

---

## 1. สถานะและการทดสอบ Spike ด้วย Hosted Judge (Judge0)

จากการวิเคราะห์และปรับปรุง `Judge0Adapter` ล่าสุด:
* **T1 (การส่งและตรวจคำตอบ):**
  * Adapter ส่งซอร์สโค้ดพร้อม `stdin` และ `expected_output` ไปยัง Judge0 ราย test case
  * Judge0 เปรียบเทียบผลลัพธ์เพื่อส่งคืน status (3: AC, 4: WA, 5: TLE, 6: CE, 7-12: RE, 13-14: JUDGE_ERROR)
* **T2 (Subtask / Partial score):**
  * Judge0 ส่งคืนผลเฉพาะราย test case
  * การรวมคะแนนตามกติกา TOI (โหมด all/min/sum และ dependency ระหว่าง subtasks) ดำเนินการโดย **Scoring Engine ฝั่งเรา** (`src/server/scoring.ts`) บน Coordinator เสมอ
* **T5 (Security / Resource limits):**
  * กำหนด `cpu_time_limit` และ `memory_limit` ต่อ test case
  * *หมายเหตุความจริงใจ:* ในโหมด Hosted เราพึ่งพา sandbox ภายนอกของ Judge0 ซึ่งยังไม่ได้เข้าถึงการปรับแต่ง cgroups/seccomp ในระดับ Bare-metal เอง
* **ความนิ่งของเวลา (Timing Jitter):**
  * จากรายงานสถิติของ Multi-tenant cluster ค่า jitter อาจแกว่งได้ ±15ms ถึง ±45ms ตามโหลดของเซิร์ฟเวอร์ส่วนกลาง
  * *ข้อสรุป:* เหมาะสำหรับช่วงเริ่มต้นและ MVP แต่สำหรับงานแข่ง TOI ทางการควรขยับไป Self-hosted Isolate/DOMjudge

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
