import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { VERTICAL_SLICE_LESSONS } from './curriculum/curriculumData.js';

export const SCHEMA_SQL_PATH = path.join(process.cwd(), 'schema.sql');
export const APPENDIX_SCHEMA_SQL_PATH = path.join(process.cwd(), 'schema.appendix.sql');
const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data.db');

export function initDb(targetDb: Database.Database = db) {
  const schema = fs.readFileSync(SCHEMA_SQL_PATH, 'utf8');
  targetDb.exec(schema);
}

export function initAppendixDb(targetDb: Database.Database = db) {
  if (fs.existsSync(APPENDIX_SCHEMA_SQL_PATH)) {
    const appendixSchema = fs.readFileSync(APPENDIX_SCHEMA_SQL_PATH, 'utf8');
    targetDb.exec(appendixSchema);
  }
}

export function seedDb(targetDb: Database.Database = db) {
  const userCount = targetDb.prepare('SELECT COUNT(*) AS c FROM users').get() as any;
  if (userCount.c === 0) {
    // 1. Users
    targetDb.prepare("INSERT INTO users (email, name, role) VALUES (?,?,?)").run('admin@local', 'Admin', 'admin');
    targetDb.prepare("INSERT INTO users (email, name, role) VALUES (?,?,?)").run('student@local', 'Student', 'student');

    // 2. Languages
    targetDb.prepare("INSERT INTO languages (name, compiler_version, flags, enabled) VALUES (?,?,?,1)").run('C++17', 'g++ 16.2', '-O2 -std=c++17');
    targetDb.prepare("INSERT INTO languages (name, compiler_version, flags, enabled) VALUES (?,?,?,1)").run('C17', 'gcc 16.2', '-O2 -std=c17');

    // 3. Tracks
    const tBeginner = targetDb.prepare("INSERT INTO tracks (slug, title, description) VALUES (?,?,?)")
      .run('beginner', 'Beginner Track', 'เริ่มต้นจากศูนย์ (-1) สู่การคิดเชิงอัลกอริทึมและเขียนโค้ดแก้ปัญหาอย่างเป็นระบบ');
    const tCp = targetDb.prepare("INSERT INTO tracks (slug, title, description) VALUES (?,?,?)")
      .run('cp', 'Competitive Programming Track', 'มุ่งสู่การสอบแข่งขัน สอวน. / TOI เจาะลึกอัลกอริทึมขั้นสูง เทคนิคการ Optimize และการทำ Subtask');

    const beginnerTrackId = Number(tBeginner.lastInsertRowid);
    const cpTrackId = Number(tCp.lastInsertRowid);

    // 4. Lessons
    const insertLesson = targetDb.prepare(`
      INSERT INTO lessons (
        slug, stage, track_compatibility, topic, title, summary, difficulty,
        prerequisites_json, learning_objectives_json, content_json, code_examples_json,
        mastery_criteria_json, estimated_minutes
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    `);

    const linkTrack = targetDb.prepare('INSERT INTO track_lessons (track_id, lesson_id, position) VALUES (?,?,?)');

    let pos = 1;
    for (const l of VERTICAL_SLICE_LESSONS) {
      const info = insertLesson.run(
        l.slug,
        l.stage,
        l.trackCompatibility,
        l.topic,
        l.title,
        l.summary,
        l.difficulty,
        JSON.stringify(l.prerequisites),
        JSON.stringify(l.learningObjectives),
        JSON.stringify(l.sections),
        JSON.stringify(l.codeExamples),
        JSON.stringify(l.sections.masteryCriteria),
        l.estimatedMinutes
      );
      const lessonId = Number(info.lastInsertRowid);

      if (l.trackCompatibility === 'beginner' || l.trackCompatibility === 'both') {
        linkTrack.run(beginnerTrackId, lessonId, pos);
      }
      if (l.trackCompatibility === 'cp' || l.trackCompatibility === 'both') {
        linkTrack.run(cpTrackId, lessonId, pos);
      }
      pos++;
    }

    // 5. Problems
    // Problem 1: A + B
    const pInfo1 = targetDb.prepare("INSERT INTO problems (slug, title) VALUES (?,?)").run('a-plus-b', 'A + B');
    const vInfo1 = targetDb.prepare(`
      INSERT INTO problem_versions (
        problem_id, statement_md, time_limit_ms, memory_limit_mb, difficulty, tags_json, hints_json, editorial_md, provenance
      ) VALUES (?,?,?,?,?,?,?,?,?)
    `).run(
      pInfo1.lastInsertRowid,
      '# A + B\nคำนวณผลรวมของจำนวนเต็มสองจำนวน $A$ และ $B$\n\n### Input\nจำนวนเต็ม $A, B$ ($1 \\le A, B \\le 10^9$)\n\n### Output\nผลรวม $A + B$',
      1000,
      256,
      'D0',
      JSON.stringify(['math', 'basics']),
      JSON.stringify(['ระวัง Integer Overflow เมื่อบวกค่าจำนวนเต็มขนาดใหญ่', 'ใช้ long long']),
      'ใช้ตัวแปรประเภท long long เพื่อป้องกัน overflow',
      'DSA Academy Original'
    );
    targetDb.prepare("UPDATE problems SET current_version_id = ? WHERE id = ?").run(vInfo1.lastInsertRowid, pInfo1.lastInsertRowid);

    // Problem 2: Range Sum Query (Judge-backed Prefix Sum Problem)
    const pInfo2 = targetDb.prepare("INSERT INTO problems (slug, title) VALUES (?,?)").run('range-sum-query', 'Range Sum Query (การหาผลรวมช่วง)');
    const vInfo2 = targetDb.prepare(`
      INSERT INTO problem_versions (
        problem_id, statement_md, time_limit_ms, memory_limit_mb, difficulty, tags_json, hints_json, editorial_md, solution_cpp17, provenance
      ) VALUES (?,?,?,?,?,?,?,?,?,?)
    `).run(
      pInfo2.lastInsertRowid,
      `# Range Sum Query (การหาผลรวมช่วง)

กำหนดให้อาเรย์ $A$ มีสมาชิก $N$ ตัว จงตอบคำถาม $Q$ ครั้ง แต่ละคำถามระบุช่วง $[L, R]$ ให้หาผลรวมของสมาชิกตั้งแต่ตัวที่ $L$ ถึงตัวที่ $R$ ($A[L] + A[L+1] + \\dots + A[R]$)

### ข้อมูลนำเข้า (Input)
- บรรทัดแรกประกอบด้วยจำนวนเต็มสองจำนวน $N$ และ $Q$ ($1 \\le N, Q \\le 200,000$)
- บรรทัดที่สองมีจำนวนเต็ม $N$ จำนวน $A_1, A_2, \\dots, A_N$ ($-10^9 \\le A_i \\le 10^9$)
- อีก $Q$ บรรทัดถัดมา แต่ละบรรทัดประกอบด้วยจำนวนเต็มสองจำนวน $L_i, R_i$ ($1 \\le L_i \\le R_i \\le N$)

### ข้อมูลส่งออก (Output)
สำหรับแต่ละคำถาม ให้แสดงผลลัพธ์ผลรวมช่วง $A[L_i] + \\dots + A[R_i]$ บรรทัดละหนึ่งคำตอบ

### Subtasks
- **Subtask 1 (30 คะแนน):** $N, Q \\le 1,000$
- **Subtask 2 (70 คะแนน):** $N, Q \\le 200,000$ (ไม่มีเงื่อนไขเพิ่มเติม)`,
      1000,
      256,
      'D2',
      JSON.stringify(['prefix-sums', 'range-query', 'arrays']),
      JSON.stringify([
        'การบวกตรงๆ ทุก Query จะใช้เวลา $O(N)$ ต่อ Query รวมเป็น $O(N \\times Q)$ ซึ่งจะติด Time Limit Exceeded ใน Subtask 2',
        'เราสามารถบวกสะสมตัวเลขจากซ้ายไปขวาเก็บไว้ในอาเรย์ขนาด $N+1$ ไว้ล่วงหน้าได้ในเวลา $O(N)$',
        'ผลรวมช่วง $[L, R]$ สามารถคำนวณได้ใน $O(1)$ ด้วยสูตร: prefix[R] - prefix[L - 1]',
      ]),
      `## Editorial: Range Sum Query

### สังเกต
- ถ้าตอบแต่ละ Query ด้วยการวนลูป $L$ ถึง $R$:
  - เวลาต่อ Query: $O(N)$
  - เวลารวม $Q$ Queries: $O(N \\times Q) = 200,000 \\times 200,000 = 4 \\times 10^{10}$ การคำนวณ ซึ่งเกิน $10^8$ การคำนวณต่อวินาที จะได้เพียง 30 คะแนนจาก Subtask 1

### วิธีการแก้ด้วย Prefix Sum
1. สร้างอาเรย์สะสม $P$ ขนาด $N+1$ (ใช้ 1-based index) โดย $P[0] = 0$
2. สำหรับแต่ละ $i$ จาก $1$ ถึง $N$: $P[i] = P[i-1] + A[i]$
3. แต่ละ Query $[L, R]$ คำตอบคือ $P[R] - P[L-1]$ ในเวลา $O(1)$
4. เนื่องจาก $A_i$ สูงสุด $10^9$ ผลรวมสูงสุดอาจถึง $2 \\times 10^{14}$ จึงต้องใช้ \`long long\` เสมอ`,
      `#include <iostream>\n#include <vector>\nusing namespace std;\n\nint main() {\n    ios_base::sync_with_stdio(false);\n    cin.tie(NULL);\n    \n    int n, q;\n    if (!(cin >> n >> q)) return 0;\n    \n    vector<long long> p(n + 1, 0);\n    for (int i = 1; i <= n; i++) {\n        long long val;\n        cin >> val;\n        p[i] = p[i - 1] + val;\n    }\n    \n    while (q--) {\n        int l, r;\n        cin >> l >> r;\n        cout << p[r] - p[l - 1] << "\\n";\n    }\n    return 0;\n}`,
      'DSA Academy Original (TOI Training Suite)'
    );

    const rsqProblemId = Number(pInfo2.lastInsertRowid);
    const rsqVersionId = Number(vInfo2.lastInsertRowid);
    targetDb.prepare("UPDATE problems SET current_version_id = ? WHERE id = ?").run(rsqVersionId, rsqProblemId);

    // Link problem to prefix sum lesson
    const prefixLesson = targetDb.prepare("SELECT id FROM lessons WHERE slug = 'prefix-sums-range-queries'").get() as any;
    if (prefixLesson) {
      targetDb.prepare("INSERT INTO lesson_problems (lesson_id, problem_id, role, position) VALUES (?,?,?,?)")
        .run(prefixLesson.id, rsqProblemId, 'practice', 1);
    }

    // Test package manifest for Range Sum Query
    targetDb.prepare("INSERT INTO test_packages (problem_version_id, manifest, checksum) VALUES (?,?,?)").run(
      rsqVersionId,
      JSON.stringify({
        problemSlug: 'range-sum-query',
        version: 1,
        subtasks: [
          { name: 'subtask1', score: 30, testCount: 5 },
          { name: 'subtask2', score: 70, testCount: 15 },
        ],
      }),
      'sha256-rsq-prefix-sum-package-v1'
    );
  }
}

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

initDb(db);
initAppendixDb(db);
seedDb(db);

export function resetDb(targetDb: Database.Database = db) {
  targetDb.exec(`
    DELETE FROM audit_logs;
    DELETE FROM jobs;
    DELETE FROM test_results;
    DELETE FROM judgings;
    DELETE FROM submissions;
    DELETE FROM test_packages;
    DELETE FROM lesson_problems;
    DELETE FROM lesson_progress;
    DELETE FROM track_lessons;
    DELETE FROM tracks;
    DELETE FROM lessons;
    DELETE FROM problem_versions;
    DELETE FROM problems;
    DELETE FROM languages;
    DELETE FROM users;
  `);
}
