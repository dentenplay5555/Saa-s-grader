# DSA Academy + TOI Grader — Architecture Review & Implementation Guide

เอกสารนี้รีวิวสเปกเวอร์ชัน 1.0 (26 ต.ค. 2026) ชี้จุดเสี่ยง เสนอทางแก้ แผนทดสอบ Judge Engine (spike) แผนทำ MVP เป็นเฟส และ security checklist สำหรับส่วน isolation ที่สเปกเดิมถูกตัดไป

> หมายเหตุ: รายละเอียดเฉพาะเวอร์ชันของ Cloudflare, DMOJ, DOMjudge เปลี่ยนได้ ควรตรวจกับเอกสารทางการก่อนลงมือจริง

---

## 1. สรุปผู้บริหาร

**ส่วนที่ดีอยู่แล้ว**
- Adapter layer กัน frontend/business logic ไม่ผูกกับ Engine ตัวเดียว
- แยก `submissions` ออกจาก `judgings` รองรับ rejudge โดยไม่เขียนทับประวัติ
- ทุก submission อ้าง `problem_version_id` ผลย้อนหลังจึงไม่เพี้ยน
- หลัก content-first และ incremental architecture (ไม่แตก microservices ตั้งแต่วันแรก)
- Threat model ใน section 6 ครอบคลุมภัยหลัก

**ส่วนที่ต้องแก้/ตัดสินใจก่อนลงมือ**

| # | ประเด็น | ระดับ |
|---|---------|-------|
| 1 | Workers ต่อ Postgres | สูง |
| 2 | รอยต่อ Queue → Judge ไม่ชัด | สูง |
| 3 | "ใช้ DMOJ" กำกวม (judge vs site) | สูง |
| 4 | คิว 2 ชั้น / ความจริง 2 แหล่ง | สูง |
| 5 | Test data sync ไป Judge | กลาง |
| 6 | Judge ล่ม / งานค้าง | กลาง |
| 7 | ภาระช่วง contest + scoreboard | กลาง |
| 8 | Rate limit / credentials | กลาง |
| 9 | Stack กระจายหลายที่ เกินกำลังทีมเล็ก | แผนงาน |

---

## 2. ความเสี่ยงสูง

### 2.1 Workers ↔ PostgreSQL

**ปัญหา:** Cloudflare Workers ไม่ถือ TCP connection pool ข้ามคำขอแบบ server ทั่วไป ถ้าต่อ Postgres ตรง ๆ ทุกคำขอ connection จะหมดเร็ว โดยเฉพาะช่วงคนส่งโค้ดพร้อมกัน

**ทางเลือก**
1. **Hyperdrive** (connection pooling + caching ของ Cloudflare) ต่อกับ Postgres ที่ host ไว้ที่ไหนก็ได้
2. **Postgres แบบ serverless/HTTP driver** เช่น Neon (ผ่าน serverless driver) หรือ Supabase ผ่าน pooler
3. **ย้าย API ไปรันบน VPS/VM** ใกล้ DB แล้วไม่ต้องใช้ Workers ในระยะแรก

**ข้อเสนอ**
- ระบุในสเปกว่า Postgres host ที่ไหน ภูมิภาคใด ต่อผ่านอะไร
- วัด latency Worker→DB จริงก่อนยืนยันสถาปัตยกรรม (ภูมิภาคไม่ตรงกันทำให้ช้าทุก query)
- ใช้ Drizzle กับ driver ที่รองรับ edge runtime และตรวจว่า transaction ที่ต้องการใช้ได้จริงใน driver นั้น

### 2.2 รอยต่อ Queue → Judge

**ปัญหา:** แผนภาพมีลูกศร `Q --> J` แต่ Cloudflare Queues ไม่ได้ push งานไปเครื่อง Linux ของเรา มีสองรูปแบบหลัก: Worker เป็น consumer หรือให้ภายนอก pull ผ่าน HTTP

**ทางเลือก**

| แบบ | วิธี | ข้อดี | ข้อเสีย |
|-----|------|-------|---------|
| A | Coordinator บนเครื่อง Judge **pull** งานจาก Queue/API | เครื่อง Judge ไม่ต้องเปิดพอร์ตรับ inbound | ต้องจัดการ ack/visibility timeout เอง |
| B | Worker consumer เรียก Coordinator ผ่าน HTTPS | ใช้ Queue ได้เต็ม | ต้องเปิด endpoint ที่เครื่อง Judge และป้องกันด้วยการยืนยันตัวตน |
| C | ไม่ใช้ Cloudflare Queues ใช้ตาราง job ใน Postgres (`FOR UPDATE SKIP LOCKED`) | เรียบง่าย ความจริงแหล่งเดียว | ต้องดูแลโหลด DB เอง |

**ข้อเสนอ MVP:** แบบ C หรือ A เพราะง่ายที่สุดและเครื่อง Judge ไม่ต้องรับ inbound จากอินเทอร์เน็ต

### 2.3 คิว 2 ชั้นและความจริง 2 แหล่ง

Engine มีคิวและฐานข้อมูลของตัวเองอยู่แล้ว ถ้าเรามี Queue + Postgres ด้วย จะเกิดปัญหา state ไม่ตรงกัน (เราบอก QUEUED แต่ Engine ไม่รู้จัก หรือกลับกัน)

**หลักการที่ต้องเขียนลงสเปก**
- **Postgres ของเราเป็น source of truth** ของ submission/verdict/score
- Engine เป็นแค่ตัวรันที่ถูกสั่ง ผลของมันถูกแปลงแล้วเขียนกลับโดย Coordinator เท่านั้น
- ทุก job มี idempotency key (`judging_id`) ส่งซ้ำได้โดยไม่เกิดผลซ้ำ
- มี reconciler วนตรวจ submission ที่ค้างสถานะเกินเวลาที่กำหนด แล้ว retry หรือตั้ง `JUDGE_ERROR`
- ระบุเจ้าของ `outbox_events` ให้ชัด: เขียนใน transaction เดียวกับ submission แล้ว publisher ส่งเข้าคิวและทำเครื่องหมาย `published_at`

### 2.4 "ใช้ DMOJ Judge" กำกวม

DMOJ แยกเป็นสองส่วน: **judge** (ตัว compile/รัน/sandbox) และ **site** (Django + DB + หน้าเว็บ + bridge ที่คุยกับ judge) การเอาเฉพาะ judge มาใช้หมายถึงต้องเขียนหรือรันตัวกลาง (bridge) ที่พูด protocol ของ judge ให้ได้ หรือรัน DMOJ site ไว้หลังบ้านแล้วเรียกผ่าน API/DB

**ตัวเลือกการฝัง**
1. รัน DMOJ site เต็มรูปแบบแบบ headless แล้ว adapter ของเราคุยกับมัน (งานน้อยกว่า แต่มี DB/ระบบที่สองต้องดูแล)
2. เขียน bridge ของเราเองให้คุยกับ judge โดยตรง (ควบคุมได้เต็ม แต่งานเยอะ ต้องศึกษา protocol)
3. ใช้ DOMjudge ถ้าเป้าหมายหลักคือ contest

อย่าตัดสินใจจากเอกสารอย่างเดียว ให้ทำ spike (หัวข้อ 4)

---

## 3. ความเสี่ยงกลาง

### 3.1 Test data sync
- เก็บ test package ใน R2 พร้อม checksum (manifest + hash)
- Coordinator ดึงมา cache ในเครื่อง Judge ตรวจ checksum ก่อนใช้ทุกครั้ง
- รัน hidden tests ใน path ที่ **โปรแกรมผู้ใช้มองไม่เห็น** (sandbox ได้เฉพาะ input ของ test case ปัจจุบัน)
- เมื่อโจทย์เปลี่ยนเวอร์ชัน cache เก่าต้องไม่ถูกใช้กับเวอร์ชันใหม่ (key ด้วย `test_package_id`)

### 3.2 Judge ล่ม / งานค้าง
- เพิ่ม retry policy พร้อม backoff และจำนวนครั้งสูงสุด
- Dead-letter สำหรับงานที่ล้มเหลวซ้ำ แล้วแจ้ง admin ผ่าน `/admin/judge-health`
- Watchdog: submission ที่อยู่ `COMPILING`/`RUNNING` เกิน N นาที ให้ requeue หรือ mark `JUDGE_ERROR`
- ผู้ใช้เห็นสถานะ `JUDGE_ERROR` พร้อมปุ่มส่งใหม่ ไม่ใช่ติดค้างตลอดไป

### 3.3 ช่วง contest
- แยกคิวหรือ priority: contest > practice
- วางแผน capacity: จำนวน submission สูงสุดต่อนาที × เวลาตรวจเฉลี่ย ÷ จำนวน worker
- Scoreboard cache ระยะสั้น (เช่น 5–15 วินาที) ไม่ query สดทุกคำขอ รองรับ `freeze_at`
- Frontend ใช้ polling แบบถอยระยะ (backoff) หรือ SSE แทนยิงถี่คงที่

### 3.4 Rate limit
- ต่อผู้ใช้ ต่อ IP และต่อโจทย์ (เช่น ส่งได้ไม่เกิน X ครั้ง/นาที)
- โควตางานค้างในคิวต่อผู้ใช้ (ไม่ให้คนเดียวอัดคิวเต็ม)
- ใช้กลไกของ platform (Rate Limiting binding หรือ Durable Objects) หรือ Redis ถ้าอยู่บน VPS
- ตอบ `429` พร้อม `Retry-After`

### 3.5 Credentials และขอบเขตสิทธิ์
- Sandbox ที่รันโค้ดผู้ใช้: ไม่มี network, ไม่เห็น env/secret ใด ๆ, ไม่เห็นไฟล์ของ Coordinator
- Coordinator: มีสิทธิ์เฉพาะที่ต้องใช้ (อ่าน test package, เขียนผลตรวจ) ใช้ token อายุสั้น/สิทธิ์แคบ
- API: ไม่มีสิทธิ์เขียน verdict อย่างเป็นทางการ นอกจากผ่าน Coordinator ที่ยืนยันตัวตนแล้ว
- แยก DB role: `api_rw` (ไม่แตะ verdict ได้ตรง ๆ) กับ `judge_writer`

### 3.6 ข้อมูลและความเป็นส่วนตัว
- ผู้ใช้เป็นนักเรียน (อาจรวมผู้เยาว์) กำหนด retention ของ `source_code` และข้อมูลส่วนบุคคล ตามกฎหมายคุ้มครองข้อมูลส่วนบุคคลของไทย (PDPA)
- เก็บ email เท่าที่จำเป็น มีช่องทางลบบัญชี
- `audit_logs` ไม่เก็บ source code หรือข้อมูลอ่อนไหวในรูปข้อความดิบ

---

## 4. Spike: เปรียบเทียบ DMOJ vs DOMjudge (2–3 วัน)

เป้าหมาย: ตัดสินใจ Engine ด้วยข้อมูลจริง ไม่ใช่เอกสาร

### 4.1 เตรียมสภาพแวดล้อม
- VM Linux แยก 1 เครื่องต่อ Engine (หรือ container แยกที่ไม่ใช่เครื่อง production)
- ติดตั้ง GCC/G++ รุ่นที่ต้องการ (C17, C++17)
- บันทึกเวลาและปัญหาที่ใช้ติดตั้ง (ถือเป็นเกณฑ์ข้อ "ภาระการดูแล")

### 4.2 โจทย์ทดสอบ 5 ข้อ

| ข้อ | ลักษณะ | ทดสอบอะไร |
|-----|--------|-----------|
| T1 | A+B ธรรมดา | pipeline พื้นฐาน, verdict AC/WA |
| T2 | หลาย subtask + partial score | การให้คะแนนแบบ TOI |
| T3 | Special checker (หลายคำตอบถูก) | custom validator/checker |
| T4 | Interactive | โจทย์ interactive ถ้าต้องใช้ |
| T5 | โจทย์ TLE/MLE/RE/fork bomb/เปิดไฟล์ | ความถูกต้องของ sandbox และ verdict |

### 4.3 ตารางเกณฑ์ให้คะแนน (0–5)

| เกณฑ์ | DMOJ | DOMjudge |
|-------|------|----------|
| เวลาติดตั้งจนส่งโจทย์แรกได้ | | |
| Partial/subtask scoring ตรงแบบ TOI | | |
| Custom checker / interactive | | |
| คุณภาพ sandbox (จำกัด CPU/RAM/PID/ไฟล์/เครือข่าย) | | |
| ความแม่นยำการวัดเวลา/หน่วยความจำ (รันซ้ำ 10 ครั้ง ค่าแกว่งแค่ไหน) | | |
| API สำหรับ adapter (submit/poll/rejudge) | | |
| การจัดการ contest/scoreboard | | |
| ภาระการดูแลระยะยาว (อัปเดต, เอกสาร, ชุมชน) | | |
| ความง่ายในการฝังใต้ frontend ของเราเอง | | |

### 4.4 การทดสอบความทนทาน
1. ส่ง 200 submission พร้อมกัน ดูเวลารอและอัตราล้ม
2. kill judge process กลางงาน ดูว่างานค้างหรือกู้ได้
3. ส่งโปรแกรมอันตราย (fork bomb, อ่าน `/etc/passwd`, เปิด socket, เขียนดิสก์ไม่หยุด) ตรวจว่าโดนบล็อกและเครื่องไม่กระทบ
4. ตรวจว่าโปรแกรมผู้ใช้อ่าน hidden test/expected output ไม่ได้

### 4.5 ผลลัพธ์ที่ต้องส่งมอบ
- ตารางคะแนนที่กรอกแล้ว
- ข้อสรุป 1 หน้า: เลือกตัวไหน เพราะอะไร ความเสี่ยงที่เหลือ
- โค้ด adapter ต้นแบบที่ส่ง–รับผลได้จริง 1 ภาษา

**ทางเลือกอื่นที่ควรเทียบเพิ่ม (ถ้าเวลาพอ):** ใช้ sandbox เดี่ยว (เช่น `isolate` หรือ `nsjail`) ประกอบกับ judge ที่เราเขียนเองแบบบาง ๆ จะคุมได้เต็มที่แต่งานมากกว่า ควรเทียบกับต้นทุนการฝัง Engine สำเร็จรูป

---

## 5. ข้อเสนอสถาปัตยกรรม MVP (ลดความซับซ้อน)

สเปกเดิมกระจายสามที่ (Cloudflare + Postgres + เครื่อง Judge) สำหรับทีมเล็กควรเริ่มด้วยสิ่งที่ดูแลได้

```
[Browser] → [Frontend static] → [API (1 service)] ↔ [PostgreSQL]
                                      │
                                  jobs ในตาราง Postgres
                                      │
                         [Judge Coordinator] → [Engine + Sandbox]
                                      │
                               ผลกลับเข้า Postgres
```

- **เฟสแรก:** API + Postgres + Coordinator + Engine บน VM/VPS ชุดเดียวหรือสองเครื่อง (API อีกเครื่อง, Judge อีกเครื่อง) ใช้ job table แทน Queue ภายนอก
- เก็บ test data ใน object storage แบบ private หรือดิสก์ที่ API ไม่เปิดให้ดาวน์โหลด
- ย้ายไป Workers/Queues/R2 ภายหลังเมื่อโหลดต้องการจริง adapter layer รองรับการย้ายอยู่แล้ว
- **ต้องไม่สลับ** ข้อกำหนดนี้: เครื่องที่รันโค้ดผู้ใช้ต้องแยกจากเครื่องที่เก็บฐานข้อมูลหลักและความลับ

---

## 6. แผนทำงานเป็นเฟส

### Phase 0 — Foundations (สัปดาห์ 1)
- เลือก hosting, ภูมิภาค, วิธีต่อ DB
- ตั้ง repo, CI, lint/format, migration pipeline (Drizzle)
- ตัดสินใจ auth (email + OAuth) และ role model

### Phase 1 — Judge spike (สัปดาห์ 1–2)
- ทำตามหัวข้อ 4 แล้วเลือก Engine
- **Exit criteria:** adapter ต้นแบบส่ง C++17 แล้วได้ AC/WA/TLE ถูกต้อง + partial score

### Phase 2 — Core MVP (สัปดาห์ 3–6)
- Schema หลัก: users, problems, problem_versions, test_packages, submissions, judgings, test_results
- API: ส่งโค้ด, ดูผล, รายการโจทย์, statement
- Frontend: หน้าโจทย์ + Monaco editor + หน้าผลตรวจ
- Admin: อัปโหลดโจทย์/test package, rejudge
- **Exit criteria:** ผู้ใช้ทดลอง 10–20 คนส่งโจทย์ได้ ผลตรวจถูกต้อง

### Phase 3 — Learning + Progress (สัปดาห์ 7–9)
- lessons, tracks, track_items, lesson_progress
- Dashboard พัฒนาการพื้นฐาน, hint ตาม unlock_policy

### Phase 4 — Hardening (สัปดาห์ 10–11)
- Rate limit, watchdog, retry/dead-letter, monitoring, backup/restore ทดสอบจริง
- Security review ของ judge (หัวข้อ 7) + ทดสอบโจมตีเอง

### Phase 5 — Contest + TOI Arena (สัปดาห์ 12+)
- contests, scoreboard + freeze, priority queue, สนามสอบจำลอง
- Load test ตามขนาดผู้ใช้จริง

### Phase 6 — Analytics/Weakness (หลังจากนั้น)
- `/me/weaknesses`, ระบบแนะนำโจทย์, Algorithm Lab

---

## 7. Judge Security — Isolation Checklist (ส่วนที่สเปกขาด)

### 7.1 ข้อกำหนดขั้นต่ำของเครื่อง Judge
- [ ] เครื่อง/VM เฉพาะ ไม่เก็บฐานข้อมูลหลัก ความลับของระบบ หรือข้อมูลผู้ใช้อื่น
- [ ] ไม่มี SSH เปิดสาธารณะ เข้าผ่าน VPN/bastion และ key เท่านั้น
- [ ] Firewall: ขาออกอนุญาตเฉพาะปลายทางที่ Coordinator ต้องใช้ (allowlist)
- [ ] ระบบปฏิบัติการอัปเดตความปลอดภัยสม่ำเสมอ รวมถึง kernel และ toolchain

### 7.2 Sandbox สำหรับโปรแกรมผู้ใช้
- [ ] รันเป็น **unprivileged user** แยกต่อการรัน (หรือ user namespace)
- [ ] **Namespaces:** PID, mount, network (ไม่มี interface ภายนอก), IPC, UTS
- [ ] **cgroups v2:** จำกัด CPU, memory (รวม swap = 0 หรือปิด), `pids.max`, I/O
- [ ] **rlimit:** ขนาดไฟล์ที่เขียน, จำนวน file descriptor, stack, core dump ปิด
- [ ] **seccomp:** allowlist syscall เท่าที่โปรแกรมแข่งต้องใช้ (บล็อก `socket`, `ptrace`, `mount`, `fork` ถ้าไม่จำเป็น)
- [ ] **Filesystem:** root แบบ read-only, ไดเรกทอรีทำงานเป็น tmpfs ขนาดจำกัด, ไม่ mount `/proc` `/sys` แบบเต็ม, ไม่เห็น home หรือ test data ส่วนที่เหลือ
- [ ] ตั้งเวลาแบบ CPU time **และ** wall time (กันโปรแกรมนอนรอ)
- [ ] ล้าง sandbox ทุกครั้งหลังรัน ไม่ใช้ซ้ำข้ามผู้ใช้

### 7.3 Compile stage
- [ ] คอมไพล์ใน sandbox ที่แยกจาก runtime และมีทรัพยากรจำกัด (compiler bomb: template ลึก, `#include` ไฟล์ใหญ่, `#embed`/`.incbin`)
- [ ] จำกัดขนาดซอร์ส เวลา และหน่วยความจำของ compile
- [ ] ไม่อนุญาต flag ที่ผู้ใช้กำหนดเอง ใช้ flag จาก allowlist ฝั่ง server
- [ ] ตรวจ `#include` ที่ชี้ path นอก sandbox หรือพึ่งพาไฟล์ระบบอ่อนไหว

### 7.4 Output และ checker
- [ ] จำกัดขนาด stdout/stderr (output flood)
- [ ] Checker/validator ที่ผู้เขียนโจทย์ทำเป็นโค้ดที่เชื่อถือได้ รันแยกจากโปรแกรมผู้ใช้ และผู้ใช้ไม่เห็น
- [ ] ไม่ส่ง stderr ดิบของ runtime กลับถึงผู้ใช้ทั้งหมด (อาจมี path ภายใน)
- [ ] ตอบ verdict เป็นรหัสมาตรฐาน ไม่เปิดเผย expected output หรือ test case ที่ล้มเหลวของ hidden tests

### 7.5 ผลลัพธ์และความน่าเชื่อถือ
- [ ] Coordinator เท่านั้นที่เขียนผลตรวจอย่างเป็นทางการ
- [ ] ผลที่ได้จากเครื่อง Judge ถูกตรวจ schema/ช่วงค่าก่อนบันทึก
- [ ] บันทึก audit log สำหรับ rejudge, การแก้ test package และการเปลี่ยนสถานะโจทย์
- [ ] ตรวจจับการลอกโค้ด (ไม่บังคับใน MVP) และ rate limit ป้องกันการเดา hidden test ผ่าน verdict ซ้ำ ๆ

### 7.6 การทดสอบโจมตีด้วยตนเอง (ทำก่อนเปิดใช้งานจริง)
| การทดสอบ | ผลที่คาดหวัง |
|----------|-------------|
| Fork bomb | ถูกฆ่า, เครื่อง Judge ไม่ช้าลง |
| `while(1)` | TLE ตามเวลาที่ตั้ง |
| จองหน่วยความจำไม่หยุด | MLE ไม่กระทบเครื่อง |
| เขียนไฟล์ใหญ่ | ถูกจำกัด, ไม่เต็มดิสก์ |
| อ่าน `/etc/passwd`, `/proc`, ไฟล์ test | ถูกบล็อก/ไม่มีไฟล์ |
| เปิด socket/DNS | ล้มเหลว |
| `ptrace`, `mount`, `unshare` | ถูกบล็อกด้วย seccomp |
| พิมพ์ output จำนวนมหาศาล | ตัดและเป็น OLE/RE |
| คอมไพล์ template bomb | CE/เวลาหมด, เครื่องไม่ค้าง |
| ส่งซ้ำรัว ๆ | 429 |

---

## 8. Adapter Interface — ข้อเสนอปรับปรุง

Interface เดิมเรียบง่ายเกินไป ควรเพิ่มอย่างน้อย:

```typescript
export interface JudgeAdapter {
  // idempotent: เรียกซ้ำด้วย judgingId เดิมต้องไม่สร้างงานซ้ำ
  submit(input: JudgeSubmission & { judgingId: string }): Promise<{ engineJobId: string }>;

  // คืนสถานะระหว่างรันได้ ไม่ใช่เฉพาะผลสุดท้าย
  getStatus(engineJobId: string): Promise<JudgeProgress>;

  // ผลรายละเอียดระดับ test group/test case
  getResult(engineJobId: string): Promise<JudgeResult>;

  rejudge(engineJobId: string): Promise<{ engineJobId: string }>;
  cancel(engineJobId: string): Promise<void>;
  health(): Promise<{ ok: boolean; workers: number; queued: number }>;
}

export interface JudgeResult {
  verdict: JudgeVerdict;
  score: number;
  maxScore: number;
  runtimeMs: number | null;
  memoryKb: number | null;
  groups: Array<{
    group: string;
    score: number;
    maxScore: number;
    tests: Array<{ index: number; verdict: JudgeVerdict; runtimeMs: number | null; memoryKb: number | null }>;
  }>;
  compileMessage?: string; // ผ่านการกรองก่อนส่งถึงผู้ใช้
}
```

หมายเหตุ
- แยก verdict เป็นระดับ submission และระดับ test ชัดเจน
- แมป verdict ของ Engine เข้าชุดกลางแบบ table-driven และมีเทสต์ครอบ
- เพิ่ม `PARTIAL`/`SKIPPED` ถ้าโจทย์ subtask ต้องแสดงผลละเอียด
- เวอร์ชันของ adapter ควรบันทึกใน `judgings.engine_name` พร้อมเวอร์ชัน Engine เพื่อไล่ปัญหาย้อนหลัง

---

## 9. ข้อเสนอแก้ Schema ย่อย ๆ

- `submissions.status` และ `judgings.status` ใช้ enum ที่นิยามชัดเจน
- เพิ่ม `judgings.attempt` และ `judgings.error_message` (ภายใน ไม่ส่งถึงผู้ใช้)
- เพิ่ม `submissions.idempotency_key` พร้อม unique `(user_id, idempotency_key)`
- เพิ่ม `jobs` (ถ้าใช้แบบ job table): `id, judging_id, state, locked_by, locked_at, attempts, run_after`
- Index สำหรับ reconciler: `judgings(status, started_at)`
- ตาราง `languages` (id, compiler version, flags, enabled) แทนการ hardcode ใน enum อย่างเดียว
- ทบทวน `test_results` ที่จะโตเร็ว (ผู้ใช้ × test จำนวนมาก) พิจารณา partition ตามเวลาหรือเก็บสรุประดับ group สำหรับ submission เก่า
- ความถูกต้องของคะแนนรวมให้ **คำนวณฝั่ง server ตามกติกาของ problem version** เสมอ

---

## 10. Observability & Operations

- **Metrics:** ความยาวคิว, เวลารอเฉลี่ย/p95, เวลาตรวจ, อัตรา JUDGE_ERROR, CPU/RAM เครื่อง Judge, จำนวน submission/นาที
- **Alert:** คิวค้างเกินเกณฑ์, JUDGE_ERROR พุ่ง, ดิสก์ใกล้เต็ม, worker ไม่ส่ง heartbeat
- **Logs แบบ structured** พร้อม `requestId`, `submissionId`, `judgingId`
- **Backup:** Postgres (PITR ถ้าได้) + test packages, **ซ้อมกู้คืนจริง** อย่างน้อยหนึ่งครั้งก่อนเปิดใช้
- **Runbook:** ขั้นตอนเมื่อ Judge ล่ม, วิธี rejudge ทั้งโจทย์, วิธีเปลี่ยน test package อย่างปลอดภัย

---

## 11. การตัดสินใจที่ต้องปิดก่อนเริ่มเขียนโค้ด

| # | คำถาม | ตัวเลือก |
|---|-------|---------|
| 1 | Postgres host ที่ไหน ต่ออย่างไร | Hyperdrive / Neon / Supabase / self-host |
| 2 | API รันที่ไหน | Workers / VPS |
| 3 | กลไกคิว | job table / Cloudflare Queues |
| 4 | Judge Engine | ผลจาก spike |
| 5 | Auth | email+password / OAuth / ผูกบัญชีโรงเรียน |
| 6 | ขนาดผู้ใช้เป้าหมายช่วง 6 เดือน | กำหนดตัวเลข เพื่อวางขนาด Judge |
| 7 | นโยบายข้อมูลผู้ใช้ | retention, ผู้เยาว์, PDPA |
| 8 | งบประมาณ/ทรัพยากรเครื่อง | กำหนดเพดาน |

---

## 12. สรุปคำแนะนำ

1. ทำ **Judge spike** ก่อนทุกอย่าง ผลของมันกำหนดรูปร่างที่เหลือ
2. เริ่ม MVP ด้วย **stack เล็กที่สุดที่ดูแลได้** (API + Postgres + job table + Judge) แล้วค่อยย้ายส่วนใดไป edge ตามหลักฐาน
3. ยึด **Postgres เป็น source of truth** และให้ Coordinator เป็นผู้เขียนผลตรวจเพียงทางเดียว
4. ลงทุนกับ **sandbox และการทดสอบโจมตีตัวเอง** ก่อนเปิดให้คนภายนอกส่งโค้ด
5. วาง **watchdog, retry, rate limit** ตั้งแต่ MVP เพราะเป็นสิ่งแรกที่พังเมื่อคนใช้จริง
6. เก็บ content (บทเรียน/โจทย์) ให้ดีควบคู่ไป เพราะเป็นคุณค่าจริงของแพลตฟอร์ม ไม่ใช่ตัว judge

---

# ภาคผนวก: ฟีเจอร์เพิ่มเติม

## 13. ตัวเลือกไม่ self-host Judge (Hosted Judge)

ใช้ใต้ `JudgeAdapter` เดิมได้ ไม่ต้องแก้ส่วนอื่น

| ทาง | ตัวอย่าง | ข้อดี | ข้อเสีย |
|-----|---------|-------|---------|
| 1. Code execution API | Judge0 (hosted/RapidAPI), Sphere Engine, Piston | เริ่มเร็วสุด ไม่ต้องดูแลเครื่อง | จำกัด checker/interactive, ราคาและ rate limit |
| 2. Managed sandbox + ตัวตัดสินบางของเราเอง | Vercel Sandbox, E2B, Fly Machines, Cloud Run, Cloudflare Containers | คุมลูป compile→run→เทียบ→รวมคะแนนเอง | ต้องเขียน checker/subtask scoring เอง |
| 3. Hybrid (แนะนำ) | เริ่ม Judge0/Sphere Engine ผ่าน adapter แล้วย้ายไป self-host Judge0 หรือ DMOJ ทีหลัง | เริ่มไว ย้ายได้ | ต้องรักษา adapter ให้เป็นกลาง |

**ข้อควรระวัง**
- **Partial score แบบ TOI:** Judge0 คืนผลรายต่อ test case ต้องรวมคะแนน subtask ใน API ของเราเอง (คำนวณตามกติกาของ problem version)
- **Special checker / interactive:** ส่วนใหญ่ไม่รองรับตรง ๆ ต้องรันรอบ checker แยก หรือเลือกบริการที่รองรับ
- **ความแม่นยำเวลา:** เครื่องแชร์ทำให้เวลาแกว่ง ทดสอบรันซ้ำ 10 ครั้งก่อนเชื่อกับโจทย์ TL ตึง
- **Hidden tests ไปอยู่กับบุคคลที่สาม:** ตรวจเงื่อนไขการเก็บข้อมูลของผู้ให้บริการ
- **ต้นทุน:** ราคาต่อ submission × จำนวน test ช่วงแข่งอาจพุ่ง คำนวณก่อน
- **PDPA:** โค้ดนักเรียนวิ่งผ่านผู้ให้บริการภายนอก ต้องสอดคล้องกับนโยบายข้อมูล

**Spike ที่ปรับ:** เริ่มจาก Judge0 hosted 1 วัน (โจทย์ T1, T2, T5 ในหัวข้อ 4.2) ถ้าความแม่นยำเวลาและ subtask พอใช้ ไปต่อได้โดยไม่ต้องมีเครื่อง Judge

**ผลต่อหัวข้อ 11:** ข้อ "Judge Engine" เพิ่มตัวเลือก "Hosted (Judge0/Sphere Engine)" และข้อ checklist ความปลอดภัยหัวข้อ 7 เปลี่ยนจาก "เราทำ" เป็น "ตรวจว่าผู้ให้บริการทำ" สำหรับส่วน sandbox

---

## 14. ตรวจจับการลอกโค้ด + วิเคราะห์โค้ดนักเรียน

**ปัญหาที่แก้:** ครูตรวจลอกด้วยตาไม่ไหว

### 14.1 หลักการ
- เป็น **ตัวช่วยครู** ให้ข้อสังเกตเพื่อตรวจต่อ **ไม่ลงโทษอัตโนมัติ**
- ใช้เครื่องมือที่มีอยู่ ไม่เขียนอัลกอริทึมเปรียบเทียบเอง

### 14.2 เครื่องมือ
| เครื่องมือ | หมายเหตุ |
|-----------|---------|
| JPlag | โอเพนซอร์ส รองรับ C/C++ เทียบระดับ token |
| Dolos | โอเพนซอร์ส มี visualization ใช้ง่าย |
| MOSS | ใช้ได้แต่ต้องส่งโค้ดออกภายนอก ตรวจ PDPA ก่อน |

เครื่องมือเหล่านี้แปลงโค้ดเป็น token/AST ก่อนเทียบ จึงจับกรณีเปลี่ยนชื่อตัวแปร ลบคอมเมนต์ สลับลำดับได้ (ควรทดสอบกับโค้ดตัวอย่างจริงก่อนเชื่อผล)

### 14.3 สถาปัตยกรรม
```
submissions (AC แล้ว) → job: similarity_batch(problem / contest)
        → JPlag/Dolos (worker แยก ไม่ใช่เครื่อง Judge)
        → similarity_reports + similarity_pairs
        → หน้าครู: ตาราง, กลุ่ม, diff เทียบสองฝั่ง
```
- รันเป็น **batch** ต่อโจทย์หรือ contest ไม่ต้อง real-time
- รันบน worker ที่แยกจาก Judge (ไม่ต้องรันโค้ดนักเรียน อ่านเป็นข้อความอย่างเดียว)

### 14.4 Schema เพิ่มเติม
- `similarity_reports`: `id, scope_type (problem|contest), scope_id, tool, tool_version, threshold, created_by, created_at, status`
- `similarity_pairs`: `report_id, submission_a, submission_b, score, matched_tokens, reviewed_status (pending|cleared|confirmed), reviewed_by, note`
- ทุกการเปลี่ยน `reviewed_status` เขียน `audit_logs`

### 14.5 สัญญาณเสริม (ไม่ใช้ตัดสินเดี่ยว ๆ)
- โค้ดก้อนใหญ่โผล่ในครั้งเดียว (ถ้ามี timeline จากข้อ 16)
- เวลาแก้สั้นผิดปกติเทียบความยาก
- โครงสร้างเหมือนกันทั้งที่เฉพาะตัวมาก (ชื่อ helper function, comment ผิดที่เหมือนกัน)

### 14.6 ข้อควรระวัง
- โจทย์สั้นและโค้ดจาก template คล้ายกันโดยธรรมชาติ ตั้ง **threshold ต่อโจทย์** และอนุญาตให้ครูใส่ template/โค้ดฐานที่ต้องยกเว้น
- ความเป็นธรรม: ต้องมีขั้นตอนให้นักเรียนชี้แจงก่อนสรุป
- PDPA: ผลเปรียบเทียบเป็นข้อมูลอ่อนไหวเชิงวินัย จำกัดสิทธิ์ดูเฉพาะครูผู้สอน กำหนด retention

### 14.7 วิเคราะห์โค้ดเพื่อการเรียน
- รัน **clang-tidy / cppcheck** แบบ static และ **ASan/UBSan** เมื่อ WA/RE ใน sandbox แยก เพื่อให้ hint เช่น อ่านเกินอาร์เรย์ ตัวแปรไม่ได้กำหนดค่า integer overflow
- จัดหมวดข้อผิดพลาดแล้วป้อนเข้า `/me/weaknesses`
- การประเมิน complexity อัตโนมัติจากโค้ดไม่แม่นยำ ให้ใช้รูปแบบ TLE ตาม test group เป็นสัญญาณแทน
- Hint ต้องไม่เผย hidden test หรือเฉลยโจทย์

### 14.8 Admin API เพิ่มเติม
- `POST /admin/similarity/run` (scope, threshold, ข้อยกเว้น)
- `GET /admin/similarity/reports/:id`
- `PATCH /admin/similarity/pairs/:id` (บันทึกผลการพิจารณา)

---

## 15. Offline mode (เรียนได้ ตรวจต้องออนไลน์)

**ต้องปรับหลักการ "Online-only" ในสเปก** เป็น: *การตรวจอย่างเป็นทางการต้องออนไลน์ แต่การเรียนและฝึกเขียนทำได้ออฟไลน์*

### 15.1 ระดับ
| ระดับ | ทำอะไร | ลำดับ |
|-------|--------|------|
| 1 | PWA + service worker แคชบทเรียน/โจทย์/sample, เก็บ draft และความคืบหน้าใน IndexedDB แล้ว sync ตอนออนไลน์ | ทำก่อน |
| 2 | รัน C/C++ ในเบราว์เซอร์ผ่าน WASM เพื่อลอง sample (ไม่ใช่ผลตรวจจริง) | ทีหลัง |
| 3 | ผ่าน bridge ข้อ 16: คอมไพล์/รัน sample ในเครื่อง | พร้อม bridge |

### 15.2 สิ่งที่ไม่ทำออฟไลน์
- Hidden tests และคะแนนจริง
- การส่งในโหมด contest
- โค้ดที่ส่งตอนออฟไลน์เข้า **คิวรอส่ง** และตรวจเมื่อออนไลน์ พร้อมแสดงเวลาที่เขียนจริงและเวลาที่ส่งจริง

### 15.3 Sync และความขัดแย้ง
- Draft: เก็บ `updated_at` และ `device_id`; ถ้าสองเครื่องแก้ต่างกัน ให้ผู้ใช้เลือก (อย่า merge เงียบ ๆ)
- ความคืบหน้าบทเรียน: ใช้กติกา "completed ไม่ย้อนกลับ" และเวลาใหม่กว่าชนะ
- ใช้ idempotency key ตอนอัปโหลดคิวรอส่ง กันส่งซ้ำ
- Cache แยกเวอร์ชัน (`statementVersion`) และมีวิธีล้างแคชเมื่อโจทย์ถูกแก้
- แคชเฉพาะข้อมูล public ห้ามแคช test package หรือเนื้อหาที่ยังไม่เผยแพร่

### 15.4 ข้อควรระวัง
- iOS Safari บีบ storage และอาจล้างข้อมูลเมื่อไม่ได้ใช้นาน ขอ persistent storage (`navigator.storage.persist()`) และเตือนเมื่อพื้นที่เหลือน้อย
- ข้อมูลในเครื่องที่แชร์ (เครื่องโรงเรียน) ต้องมีการออกจากระบบ/ล้างข้อมูลชัดเจน

---

## 16. Local Bridge + Extension (เชื่อมเว็บ → เครื่อง → IDE)

### 16.1 สถาปัตยกรรม
```
เว็บ DSA Academy → Browser extension → Bridge (daemon บนเครื่อง 127.0.0.1)
                                           ↓
                                  โฟลเดอร์งานของนักเรียน → IDE/editor ใดก็ได้
                                           ↓
                              compile/run sample ในเครื่อง, ส่งโค้ดเข้า API
```
ทางลัด: ทำ **VS Code extension ตัวเดียว** คุยกับ bridge หรือ API ได้ตรง ๆ โดยข้าม browser extension

### 16.2 ความสามารถ
1. **Import โจทย์:** กดปุ่มบนหน้าโจทย์ → bridge สร้างไฟล์ template + sample tests ในโฟลเดอร์ (เช่น `problem-slug/main.cpp`, `samples/1.in`, `1.out`)
2. **รัน sample ในเครื่อง:** คอมไพล์ด้วย compiler ของนักเรียนและเทียบ output (ใช้ได้ตอนออฟไลน์)
3. **Submit จาก IDE:** bridge ส่งซอร์สเข้า `POST /submissions` ด้วย token ที่ pair ไว้ แล้วแสดงผลกลับใน IDE
4. **Timeline (ไม่บังคับ):** บันทึกจังหวะการแก้ไฟล์ส่งให้ระบบตรวจลอกใช้ (ต้องได้รับความยินยอมชัดเจน)

### 16.3 ความปลอดภัยของ bridge (สำคัญที่สุด)
- [ ] ผูก `127.0.0.1` เท่านั้น ไม่เปิดสู่เครือข่าย
- [ ] **Pairing:** ครั้งแรกผู้ใช้อนุมัติ ได้ token สุ่มอายุจำกัด เก็บใน keychain/ไฟล์สิทธิ์จำกัด
- [ ] ตรวจ `Origin` และ `Host` header (กัน DNS rebinding และเว็บอื่นยิง localhost)
- [ ] เว็บสั่งได้แค่ "สร้างโฟลเดอร์โจทย์ด้วย template/sample ที่ระบุ" ภายใต้ root ที่ตั้งไว้
- [ ] **ห้ามรับคำสั่งรันโปรแกรมหรือ shell จากเว็บ** การคอมไพล์/รันเกิดจากผู้ใช้กดเองในเครื่องเท่านั้น
- [ ] ป้องกัน path traversal (`..`, symlink) และจำกัดขนาด/จำนวนไฟล์
- [ ] อัปเดตอัตโนมัติ ลงลายเซ็น และมีวิธีถอนการ pair
- [ ] ตรวจ sample ที่ดึงมาไม่ใช่ไฟล์ปฏิบัติการ

### 16.4 ความเป็นส่วนตัว
- Timeline telemetry ปิดเป็นค่าเริ่มต้น เปิดได้เมื่อครู/โรงเรียนกำหนดและนักเรียน (หรือผู้ปกครองสำหรับผู้เยาว์) รับทราบ
- แจ้งชัดว่าเก็บอะไร เก็บนานแค่ไหน ใครดูได้

### 16.5 API เพิ่มเติม
- `POST /bridge/pair` (ขอ token), `DELETE /bridge/pair/:id` (ถอน)
- `GET /problems/:slug/package` ให้ข้อมูลที่ bridge ใช้สร้างโฟลเดอร์ (statement, sample, template) **ไม่รวม hidden tests**

---

## 17. Editor Layout: Split view และ Focus mode

### 17.1 สองโหมด
1. **Split view (โจทย์ | editor):** ซ้าย statement/sample/hint/ผลตรวจ ขวา editor ลากเส้นแบ่งปรับสัดส่วนได้
2. **Focus mode (full screen editor):** editor เต็มหน้าต่าง โจทย์ย่อเป็น drawer เปิดทับด้วยปุ่มลัด (เช่น `Ctrl+Shift+P`) ผลตรวจขึ้นแถบล่าง

### 17.2 ข้อกำหนดทางเทคนิค
- **ใช้ Monaco instance เดียว** สลับโหมดด้วย layout/CSS ไม่ remount เพื่อรักษา undo history, cursor, selection
- **Auto-save draft** ใน IndexedDB ต่อโจทย์ต่อภาษา (debounce) เชื่อมกับ offline mode ข้อ 15
- **Fullscreen API เป็นตัวเลือกเสริม** แยกจาก Focus mode (เบราว์เซอร์บางตัว เช่น iOS จำกัด) Focus mode ต้องทำงานด้วย CSS เต็มหน้าต่างเป็นหลัก
- **จอแคบ/มือถือ:** เปลี่ยนเป็นแท็บ "โจทย์ / โค้ด / ผลตรวจ"
- **ห้องสอบ/contest:** ครูกำหนดโหมดที่อนุญาตได้ และ Focus mode ต้องไม่ซ่อนนาฬิกานับเวลา
- **Accessibility:** ปรับขนาดฟอนต์ได้ keyboard shortcut ครบ ไม่ล็อกโฟกัส (`Esc` แล้ว Tab ออกได้)

### 17.3 State และ schema
- Frontend: `layoutMode: "split" | "focus"`, `splitRatio: number`
- เก็บใน localStorage เป็นค่าเริ่มต้น และ `user_settings (user_id, key, value_json, updated_at)` ถ้าต้องการข้ามเครื่อง

---

## 18. ปรับแผนเฟส (รวมฟีเจอร์ภาคผนวก)

| เฟส | เพิ่มเติม |
|-----|----------|
| Phase 1 (Spike) | เพิ่มทางเลือก Hosted Judge (ข้อ 13) |
| Phase 2 (Core MVP) | Editor สองโหมด + auto-save draft (ข้อ 17) |
| Phase 3 | PWA ระดับ 1 (ข้อ 15) ทำคู่กับ lessons/progress |
| Phase 4 | ตรวจลอกแบบ batch + static analysis hint (ข้อ 14) ซึ่งตอบปัญหาครูได้เร็วสุด |
| Phase 5 | Bridge + extension (ข้อ 16) ทำหลังระบบ auth/token นิ่งแล้ว |
| Phase 6+ | WASM runner, timeline telemetry, ปรับ threshold ตรวจลอกจากข้อมูลจริง |

**ลำดับความสำคัญสำหรับผู้ใช้จริง:** ตรวจลอก (ครู) → editor สองโหมด (นักเรียน) → PWA → bridge

**การตัดสินใจเพิ่มในหัวข้อ 11**
| # | คำถาม | ตัวเลือก |
|---|-------|---------|
| 9 | Judge: self-host หรือ hosted | ผลจาก spike |
| 10 | ตรวจลอกใช้เครื่องมืออะไร / threshold เริ่มต้น | JPlag / Dolos |
| 11 | นโยบาย telemetry และความยินยอม (ผู้เยาว์) | ปิดเป็นค่าเริ่มต้น + ครู/โรงเรียนกำหนด |
| 12 | Offline ระดับไหนใน MVP | ระดับ 1 |
| 13 | Bridge: browser extension หรือ VS Code extension ก่อน | VS Code extension ตรงกว่า |
