import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { Server } from 'node:http';
import { initDb, seedDb } from '../src/server/db.js';
import { createApp } from '../src/server/index.js';
import { MockAdapter } from '../src/server/judge/mockAdapter.js';

describe('Curriculum & Learning Content System', () => {
  let testDb: Database.Database;
  let server: Server;
  let baseUrl: string;
  let studentId: number;

  beforeEach(async () => {
    testDb = new Database(':memory:');
    testDb.pragma('foreign_keys = ON');
    initDb(testDb);
    seedDb(testDb);

    studentId = (testDb.prepare("SELECT id FROM users WHERE role = 'student'").get() as any).id;

    const mockAdapter = new MockAdapter('success');
    const app = createApp(testDb, mockAdapter);

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address() as any;
        baseUrl = `http://localhost:${addr.port}`;
        resolve();
      });
    });
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('GET /api/tracks returns Beginner and CP tracks with lesson counts', async () => {
    const res = await fetch(`${baseUrl}/api/tracks`);
    expect(res.status).toBe(200);
    const tracks = await res.json();

    expect(tracks.length).toBe(2);
    const beginner = tracks.find((t: any) => t.slug === 'beginner');
    const cp = tracks.find((t: any) => t.slug === 'cp');

    expect(beginner).toBeDefined();
    expect(beginner.title).toContain('Beginner Track');
    expect(beginner.lessonCount).toBeGreaterThan(0);

    expect(cp).toBeDefined();
    expect(cp.title).toContain('Competitive Programming');
    expect(cp.lessonCount).toBeGreaterThan(0);
  });

  it('GET /api/tracks/:slug returns track lessons ordered by position with user progress', async () => {
    const res = await fetch(`${baseUrl}/api/tracks/beginner`, {
      headers: { 'X-User-Id': String(studentId) },
    });
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.track.slug).toBe('beginner');
    expect(data.lessons.length).toBeGreaterThan(0);
    expect(data.lessons[0].status).toBe('not_started');
    expect(data.lessons[0].position).toBe(1);
  });

  it('GET /api/lessons provides searchable and filterable lesson catalog', async () => {
    // Filter by stage
    const resStage0 = await fetch(`${baseUrl}/api/lessons?stage=0`);
    const stage0Lessons = await resStage0.json();
    expect(stage0Lessons.length).toBe(1);
    expect(stage0Lessons[0].slug).toBe('variables-and-memory-basics');

    // Filter by track
    const resCp = await fetch(`${baseUrl}/api/lessons?track=cp`);
    const cpLessons = await resCp.json();
    expect(cpLessons.some((l: any) => l.slug === 'pointers-and-memory-mechanics')).toBe(true);

    // Search query
    const resSearch = await fetch(`${baseUrl}/api/lessons?q=Prefix`);
    const searchLessons = await resSearch.json();
    expect(searchLessons.length).toBe(1);
    expect(searchLessons[0].slug).toBe('prefix-sums-range-queries');
  });

  it('GET /api/lessons/:slug returns all 17 required curriculum sections', async () => {
    const res = await fetch(`${baseUrl}/api/lessons/prefix-sums-range-queries`, {
      headers: { 'X-User-Id': String(studentId) },
    });
    expect(res.status).toBe(200);
    const lesson = await res.json();

    expect(lesson.slug).toBe('prefix-sums-range-queries');
    expect(lesson.stage).toBe(2);
    expect(lesson.difficulty).toBe('D2');
    expect(lesson.learningObjectives.length).toBeGreaterThan(0);

    // Verify presence of all 17 critical sections
    const s = lesson.sections;
    expect(s.overview).toBeTruthy();
    expect(s.objectives).toBeTruthy();
    expect(s.prerequisites).toBeTruthy();
    expect(s.explanation).toBeTruthy();
    expect(s.workedExamples).toBeTruthy();
    expect(s.c17Implementation).toBeTruthy();
    expect(s.cpp17Implementation).toBeTruthy();
    expect(s.complexityAnalysis).toBeTruthy();
    expect(s.correctnessProof).toBeTruthy();
    expect(s.commonMistakes).toBeTruthy();
    expect(s.guidedPractice).toBeTruthy();
    expect(s.independentProblems).toBeTruthy();
    expect(s.testSpecifications).toBeTruthy();
    expect(s.progressiveHints.length).toBeGreaterThanOrEqual(3);
    expect(s.editorial).toBeTruthy();
    expect(s.masteryCriteria.length).toBeGreaterThan(0);
    expect(s.relatedTopics.length).toBeGreaterThan(0);

    // Verify linked problems
    expect(lesson.problems.length).toBeGreaterThan(0);
    expect(lesson.problems[0].slug).toBe('range-sum-query');
  });

  it('POST /api/lessons/:slug/progress updates and tracks user mastery', async () => {
    // 1. Mark in_progress
    const resProg = await fetch(`${baseUrl}/api/lessons/variables-and-memory-basics/progress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': String(studentId) },
      body: JSON.stringify({ status: 'in_progress' }),
    });
    expect(resProg.status).toBe(200);

    // 2. Mark completed
    const resDone = await fetch(`${baseUrl}/api/lessons/variables-and-memory-basics/progress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': String(studentId) },
      body: JSON.stringify({ status: 'completed' }),
    });
    expect(resDone.status).toBe(200);
    const doneBody = await resDone.json();
    expect(doneBody.status).toBe('completed');
    expect(doneBody.completedAt).toBeTruthy();

    // 3. Verify in progress dashboard
    const resDash = await fetch(`${baseUrl}/api/me/curriculum-progress`, {
      headers: { 'X-User-Id': String(studentId) },
    });
    expect(resDash.status).toBe(200);
    const dash = await resDash.json();

    expect(dash.completedLessons).toBe(1);
    expect(dash.overallPercentage).toBeGreaterThan(0);
    expect(dash.recentActivity.length).toBeGreaterThan(0);
    expect(dash.recentActivity[0].slug).toBe('variables-and-memory-basics');
  });

  it('GET /api/problems/:slug includes rich problem metadata, progressive hints, and editorial without leaking test data', async () => {
    const res = await fetch(`${baseUrl}/api/problems/range-sum-query`);
    expect(res.status).toBe(200);
    const problem = await res.json();

    expect(problem.slug).toBe('range-sum-query');
    expect(problem.difficulty).toBe('D2');
    expect(problem.tags).toContain('prefix-sums');
    expect(problem.hints.length).toBe(3);
    expect(problem.editorial).toContain('Editorial: Range Sum Query');

    // Private test packages and secret checksums must NOT be leaked
    expect(problem.manifest).toBeUndefined();
    expect(problem.checksum).toBeUndefined();
    expect(problem.test_packages).toBeUndefined();
  });
});
