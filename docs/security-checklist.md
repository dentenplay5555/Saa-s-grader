# Judge Security & Isolation Checklist (Task 7)

เอกสารนี้ระบุข้อกำหนดด้านความปลอดภัยของเครื่อง Judge Engine และเกณฑ์การตรวจรับรอง (Security Audit Checklist) สำหรับระบบ TOI Grader ทั้งโหมด Self-Hosted Sandbox และ Hosted Judge (Judge0)

---

## 1. Sandbox Isolation Checklist (สำหรับ Self-Hosted Sandbox ใน Phase 5)

> **สถานะปัจจุบัน:** โหมด MVP ใช้ Hosted Judge API (Judge0) รายการด้านล่างเป็นสเปกความปลอดภัยที่กำหนดไว้สำหรับการตั้ง Bare-metal Judgehost ในอนาคต ซึ่ง **ยังไม่ได้ทดสอบบนเครื่อง Bare-metal ของตนเอง**

### 1.1 สิทธิ์และ Namespaces
- [ ] **Unprivileged User:** โปรแกรมผู้ใช้รันใต้ user พิเศษที่ไม่มีสิทธิ์ `sudo` (`nobody` หรือ isolate sandbox user) — *ยังไม่ได้ทดสอบบน bare-metal host*
- [ ] **PID Namespace:** โปรแกรมเห็นเฉพาะ process ของตัวเอง ไม่เห็น process อื่นของระบบหรือของ Coordinator — *ยังไม่ได้ทดสอบบน bare-metal host*
- [ ] **Mount Namespace:** Mount namespace แยกเฉพาะ ไม่อนุญาตให้ mount หรือ unmount เพิ่มเติม — *ยังไม่ได้ทดสอบบน bare-metal host*
- [ ] **Network Namespace:** ไม่มี network interface ภายนอก (ปิด network สมบูรณ์ ป้องกัน reverse shell, DNS query, หรือ scan เครื่องในวง LAN) — *ยังไม่ได้ทดสอบบน bare-metal host*
- [ ] **IPC & UTS Namespace:** แยกออกจาก host ไม่สามารถแชร์ shared memory หรือเปลี่ยน hostname ได้ — *ยังไม่ได้ทดสอบบน bare-metal host*

### 1.2 Resource Control (cgroups v2 & rlimit)
- [ ] **CPU Limiting:** กำหนด quota ตาม `time_limit_ms` (วัดทั้ง CPU time และ Wall time ป้องกัน sleep) — *ยังไม่ได้ทดสอบบน bare-metal host*
- [ ] **Memory Limiting:** กำหนด memory limit รวม swap = 0 (ห้ามใช้ swap ป้องกัน thrashing) — *ยังไม่ได้ทดสอบบน bare-metal host*
- [ ] **Process / Thread Limit (`pids.max`):** จำกัดไม่เกิน 1–4 processes เพื่อบล็อก Fork bomb ทันที — *ยังไม่ได้ทดสอบบน bare-metal host*
- [ ] **File Size Limit (`RLIMIT_FSIZE`):** จำกัดขนาดไฟล์ที่เขียนไม่เกิน 16MB ป้องกัน Disk Flood — *ยังไม่ได้ทดสอบบน bare-metal host*
- [ ] **Core Dump Disabled (`RLIMIT_CORE = 0`):** ปิดการสร้าง core dump ป้องกันขโมยหน่วยความจำ — *ยังไม่ได้ทดสอบบน bare-metal host*

### 1.3 Filesystem & System Calls (Seccomp)
- [ ] **Read-only Root:** Filesystem หลักเป็น Read-Only — *ยังไม่ได้ทดสอบบน bare-metal host*
- [ ] **Tmpfs Sandbox:** ไดเรกทอรีทำงานเป็น tmpfs ขนาดจำกัด และถูกล้าง (cleanup) ทันทีหลังโปรแกรมจบ — *ยังไม่ได้ทดสอบบน bare-metal host*
- [ ] **Hidden Data Protection:** โปรแกรมผู้ใช้ไม่สามารถเข้าถึง `/etc/passwd`, `/proc` เต็มรูปแบบ, หรือโฟลเดอร์เก็บ expected output ของโจทย์ — *ยังไม่ได้ทดสอบบน bare-metal host*
- [ ] **Seccomp Allowlist:** อนุญาตเฉพาะ system calls มาตรฐานที่โปรแกรมคำนวณต้องใช้ บล็อก `socket`, `connect`, `ptrace`, `mount`, `reboot`, `fork` — *ยังไม่ได้ทดสอบบน bare-metal host*

### 1.4 Compilation Stage
- [ ] แยก sandbox ของขั้นตอน compile ออกจาก runtime — *ยังไม่ได้ทดสอบบน bare-metal host*
- [ ] จำกัดทรัพยากรการ compile (CPU 10s, RAM 512MB) ป้องกัน Template Bomb, `#include` ลึก, และ `#embed` ไฟล์ใหญ่ — *ยังไม่ได้ทดสอบบน bare-metal host*

---

## 2. Checklist สำหรับ Hosted Judge (Judge0 Compliance)

- [x] **Zero-Trust Network:** API key และ URL จัดเก็บใน Environment Variables ไม่ hardcode ใน repository
- [x] **PDPA Compliance:** ไม่ส่งข้อมูลส่วนบุคคล (Email, User ID, ชื่อ-สกุล) ไปยัง Judge0 โดยเด็ดขาด ส่งเฉพาะ Anonymous Job ID (`judgingId`) และโค้ด
- [x] **Source Code Retention:** โค้ดของนักเรียนเก็บในฐานข้อมูลเพื่อตรวจผลเท่านั้น ไม่นำไปเทรนโมเดลภายนอก
- [x] **Output Truncation:** ข้อความ stdout / stderr / compile output ถูกจำกัดขนาด (truncate) ฝั่ง server ไม่ส่ง raw stderr ขนาดยักษ์เข้าฐานข้อมูล
- [x] **Test Package Stdin/Expected Output:** ส่งคู่ทดสอบ (`stdin`, `expected_output`) ชัดเจนราย test case ป้องกันโปรแกรมที่ไม่พิมพ์คำตอบได้ Accepted

---

## 3. Attack Vector Matrix (การรับมือของระบบในระดับ API & Server)

| Attack Vector | กลไกที่ระบบเราควบคุม | สถานะการทดสอบ |
|---|---|:---:|
| Spamming submissions | API Rate limiter (10/min/user) + In-flight Quota | [x] ผ่านการทดสอบ (HTTP 429) |
| ID enumeration scraping | Role & Ownership check บน `GET /api/submissions/:id` | [x] ผ่านการทดสอบ (HTTP 403) |
| Privilege escalation via header | เลิกใช้ `X-User-Id`, ใช้ HMAC-SHA256 Token เท่านั้น | [x] ผ่านการทดสอบ (HTTP 401) |
| Web RCE via Local Bridge | ตัด `/bridge/run-sample` ออก, ตรวจ Host & Origin ตรงตัว | [x] ผ่านการทดสอบ (HTTP 403) |
| Engine hang / stuck queue | Watchdog timeout + retry backoff + dead-letter | [x] ผ่านการทดสอบ (Throw/Reclaim) |
| Fork bomb / Infinite loop ในโค้ดผู้ใช้ | พึ่งพา Sandbox ฝั่ง Judge0 (Hosted) | [ ] ยังไม่ได้ทดสอบบน bare-metal เราเอง |
