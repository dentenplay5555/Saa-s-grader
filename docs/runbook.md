# TOI Grader — Operations Runbook (Task 8)

คู่มือการดูแลและกู้คืนระบบสำหรับวิศวกรระบบ (Site Reliability & DevOps)

---

## 1. Runbook: เมื่อ Judge Engine ล่ม (Incident Response)

### อาการ
- Metrics แสดงสถานะ `DEAD_LETTER_JOBS` หรือ `HIGH_JUDGE_ERROR_RATE`
- Submissions ค้างในสถานะ `COMPILING` หรือ `RUNNING` เกิน 5 นาที

### ขั้นตอนการแก้ปัญหา
1. **ตรวจสอบสถานะเครื่อง Judge / API:**
   ```bash
   # ตรวจสอบว่า API เชื่อมต่อ Judge Engine ได้หรือไม่
   curl -H "X-User-Id: 1" http://localhost:3000/api/admin/judge-health
   ```
2. **เรียกใช้ Watchdog / Reconciler อัตโนมัติ:**
   - Watchdog จะปรับสถานะ submission ที่ค้างเกิน 5 นาทีเป็น `JUDGE_ERROR`
   - นักเรียนจะเห็นสถานะ `JUDGE_ERROR` ทันทีและมีปุ่มกดส่งใหม่ได้ ไม่ค้างตลอดไป
3. **ตรวจสอบ Dead-Letter Queue:**
   - เมื่อซ่อมแซม Engine เสร็จสิ้น สามารถตรวจสอบรายการงานในตาราง `jobs` ที่มี `state = 'DEAD_LETTER'`
   - Requeue งานที่ค้างด้วยคำสั่ง SQL:
     ```sql
     UPDATE jobs SET state = 'QUEUED', attempts = 0, run_after = datetime('now') WHERE state = 'DEAD_LETTER';
     ```

---

## 2. การ Rejudge ทั้งโจทย์อย่างปลอดภัย (Bulk Rejudge)

### เงื่อนไข
- เมื่อมีการแก้ไข Test Case หรือ Checker ของโจทย์ และต้องการตรวจ Submission เก่าใหม่ทั้งหมด

### หลักการสถาปัตยกรรม (ห้ามฝ่าฝืน)
- **ห้ามเขียนทับ judging เก่า:** ทุกการ rejudge ต้องสร้างแถวใหม่ใน `judgings` พร้อม `attempt = attempt + 1` เสมอ เพื่อเก็บประวัติผลการตรวจ
- **ขั้นตอนการทำ:**
  1. ดึงรายการ `submissions` ล่าสุดของโจทย์นั้น
  2. รันฟังก์ชัน `createJudging(submissionId)` ซึ่งจะแทรกแถวใหม่ใน `judgings` และส่งงานเข้า `jobs`
  3. Coordinator จะหยิบงานไปตรวจใหม่ตามคิวโดยไม่ทำให้ระบบหยุดชะงัก

---

## 3. การเปลี่ยน Test Package อย่างปลอดภัย (Versioned Test Data)

1. ทุกการแก้ไขชุดทดสอบ ให้สร้าง `problem_versions` ใหม่ หรือสร้าง `test_packages` ใหม่พร้อมคำนวณ `checksum` (SHA-256) เสมอ
2. บันทึก Manifest และ Checksum ในตาราง `test_packages`
3. Coordinator จะตรวจ Checksum ของไฟล์ชุดทดสอบเทียบกับ Manifest ก่อนเริ่มรันทุกครั้ง หาก Hash ไม่ตรงจะปฏิเสธการรันและแจ้งเตือนทันที

---

## 4. แผนสำรองและกู้คืนข้อมูล (Backup & Restore)

### SQLite (ระยะ MVP / Dev)
- **Backup:**
  ```bash
  sqlite3 data.db ".backup 'backups/backup-$(date +%Y%m%d%H%M%S).db'"
  ```
- **Restore:**
  ```bash
  cp backups/backup-YYYYMMDDHHMMSS.db data.db
  ```

### PostgreSQL (ระยะ Production)
- **Backup:**
  ```bash
  pg_dump -Fc -U postgres -d toi_grader > "backups/toi_grader_$(date +%Y%m%d).dump"
  ```
- **Restore:**
  ```bash
  pg_restore -U postgres -d toi_grader -c "backups/toi_grader_YYYYMMDD.dump"
  ```

---

## 5. นโยบายคุ้มครองข้อมูลส่วนบุคคล (PDPA Retention Policy)

1. **การบันทึก Audit Logs:**
   - `audit_logs` **ห้ามจัดเก็บ source code ดิบ** หรือรหัสผ่าน/โทเค็นโดยเด็ดขาด จัดเก็บเฉพาะ `action`, `actor_id`, `target_type`, `target_id` และ metadata สรุป
2. **การเก็บรักษา Source Code ของนักเรียน:**
   - สำหรับนักเรียนทั่วไป เก็บซอร์สโค้ดไว้เป็นเวลา 1 ปีการศึกษาเพื่อการเรียนรู้ย้อนหลัง หลังจากนั้นระบบจะ purge หรือ anonymize ตามสิทธิของเจ้าของข้อมูล (Right to Erasure)
3. **ช่องทางลบข้อมูล:**
   - นักเรียนสามารถร้องขอการลบประวัติการส่งและบัญชีผู้ใช้ได้ผ่านการติดต่อผู้ดูแลระบบ

## Auth & judge engine configuration (required env)

| Variable | Required | Notes |
|---|---|---|
| `AUTH_SECRET` | yes (all envs except `NODE_ENV=test`/`development`) | ≥32 chars, `openssl rand -hex 32`. No default; server refuses to boot without it. |
| `JUDGE0_API_KEY` or `JUDGE0_URL` | yes in production | Real judge engine. |
| `JUDGE_ENGINE=fake` | dev only | Marks everything AC. Refused when `NODE_ENV=production`. `npm run dev:api` sets it. |
| `SEED_ADMIN_PASSWORD`, `SEED_STUDENT_PASSWORD` | optional | Used when seeding an empty DB. If unset: random password printed once (dev) or no password (production). |

Set / reset a password: `npm run set-password -- user@example.com [password]` (random one is printed if omitted).

Login: `POST /api/auth/login {email, password}`; 5 failures / 15 min per (ip, email) → 429.
Problems with no valid test package: submit → 409; existing queued jobs → `JUDGE_ERROR` (never AC).
Test package manifest must be `{ subtasks: [{ name, score, mode?, dependsOn?, tests: [{index, input, expectedOutput}] }] }`.

## Judge0 timing & completeness

| Variable | Default | Notes |
|---|---|---|
| `JUDGE0_POLL_MS` | 500 | Poll interval while waiting for results. |
| `JUDGE0_MAX_WAIT_MS` | 120000 | Max wait per attempt before the attempt is treated as hung (then retried, max 3). |

- The worker watchdog (`reconcileStaleJudgings`) runs with a 300s threshold; keep it larger than `JUDGE0_MAX_WAIT_MS`.
- A retry of the same judging reuses the already-created Judge0 submissions (state is in memory: a server restart resubmits).
- The coordinator requires the engine to report exactly the planned `(subtask, index)` tests; anything missing/duplicate/unexpected is a failed attempt → `JUDGE_ERROR` after retries, never a score.
