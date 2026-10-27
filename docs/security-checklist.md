# Judge Security & Isolation Checklist (Task 7)

เอกสารนี้ระบุข้อกำหนดด้านความปลอดภัยของเครื่อง Judge Engine และเกณฑ์การตรวจรับรอง (Security Audit Checklist) สำหรับระบบ TOI Grader ทั้งโหมด Self-Hosted Sandbox และ Hosted Judge (Judge0)

---

## 1. Sandbox Isolation Checklist (สำหรับ Self-Hosted Sandbox)

### 1.1 สิทธิ์และ Namespaces
- [x] **Unprivileged User:** โปรแกรมผู้ใช้รันใต้ user พิเศษที่ไม่มีสิทธิ์ `sudo` (`nobody` หรือ isolate sandbox user)
- [x] **PID Namespace:** โปรแกรมเห็นเฉพาะ process ของตัวเอง ไม่เห็น process อื่นของระบบหรือของ Coordinator
- [x] **Mount Namespace:** Mount namespace แยกเฉพาะ ไม่อนุญาตให้ mount หรือ unmount เพิ่มเติม
- [x] **Network Namespace:** ไม่มี network interface ภายนอก (ปิด network สมบูรณ์ ป้องกัน reverse shell, DNS query, หรือ scan เครื่องในวง LAN)
- [x] **IPC & UTS Namespace:** แยกออกจาก host ไม่สามารถแชร์ shared memory หรือเปลี่ยน hostname ได้

### 1.2 Resource Control (cgroups v2 & rlimit)
- [x] **CPU Limiting:** กำหนด quota ตาม `time_limit_ms` (วัดทั้ง CPU time และ Wall time ป้องกัน sleep)
- [x] **Memory Limiting:** กำหนด memory limit รวม swap = 0 (ห้ามใช้ swap ป้องกัน thrashing)
- [x] **Process / Thread Limit (`pids.max`):** จำกัดไม่เกิน 1–4 processes เพื่อบล็อก Fork bomb ทันที
- [x] **File Size Limit (`RLIMIT_FSIZE`):** จำกัดขนาดไฟล์ที่เขียนไม่เกิน 16MB ป้องกัน Disk Flood
- [x] **Core Dump Disabled (`RLIMIT_CORE = 0`):** ปิดการสร้าง core dump ป้องกันขโมยหน่วยความจำ

### 1.3 Filesystem & System Calls (Seccomp)
- [x] **Read-only Root:** Filesystem หลักเป็น Read-Only
- [x] **Tmpfs Sandbox:** ไดเรกทอรีทำงานเป็น tmpfs ขนาดจำกัด และถูกล้าง (cleanup) ทันทีหลังโปรแกรมจบ
- [x] **Hidden Data Protection:** โปรแกรมผู้ใช้ไม่สามารถเข้าถึง `/etc/passwd`, `/proc` เต็มรูปแบบ, หรือโฟลเดอร์เก็บ expected output ของโจทย์
- [x] **Seccomp Allowlist:** อนุญาตเฉพาะ system calls มาตรฐานที่โปรแกรมคำนวณต้องใช้ บล็อก `socket`, `connect`, `ptrace`, `mount`, `reboot`, `fork`

### 1.4 Compilation Stage
- [x] แยก sandbox ของขั้นตอน compile ออกจาก runtime
- [x] จำกัดทรัพยากรการ compile (CPU 10s, RAM 512MB) ป้องกัน Template Bomb, `#include` ลึก, และ `#embed` ไฟล์ใหญ่

---

## 2. Checklist สำหรับ Hosted Judge (Judge0 Compliance)

- [x] **Zero-Trust Network:** API key และ URL จัดเก็บใน Environment Variables ไม่ hardcode ใน repository
- [x] **PDPA Compliance:** ไม่ส่งข้อมูลส่วนบุคคล (Email, User ID, ชื่อ-สกุล) ไปยัง Judge0 โดยเด็ดขาด ส่งเฉพาะ Anonymous Job ID (`judgingId`) และโค้ด
- [x] **Source Code Retention:** โค้ดของนักเรียนเก็บในฐานข้อมูลเพื่อตรวจผลเท่านั้น ไม่นำไปเทรนโมเดลภายนอก
- [x] **Output Truncation:** ข้อความ stdout / stderr / compile output ถูกจำกัดขนาด (truncate) ฝั่ง server ไม่ส่ง raw stderr ขนาดยักษ์เข้าฐานข้อมูล

---

## 3. Attack Vector Test Matrix

| Attack Vector | กลไกที่ใช้ป้องกัน | Verdict ที่คาดหวัง |
|---|---|:---:|
| Fork bomb (`while(fork()){}`) | `pids.max = 1` หรือ rlimit | `RE` |
| Infinite loop (`while(1){}`) | CPU + Wall time limit | `TLE` |
| Memory exhaustion (`malloc(2GB)`) | cgroups `memory.max`, swap=0 | `MLE` |
| Output flood (`while(1) puts("A");`) | `RLIMIT_FSIZE`, max stdout buffer | `OLE` / `TLE` |
| File snooping (`ifstream("/etc/passwd")`) | Mount namespace, unprivileged user | `RE` / `WA` (เปิดไม่ได้) |
| Reverse shell / socket connection | Network namespace (no interface) | `RE` (Syscall blocked) |
| Compiler template bomb | Compiler timeout limit | `CE` / `TLE` |
| Spamming submissions | API Rate limiter (10/min) + Quota | `HTTP 429` |
