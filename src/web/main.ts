import { OfflineStore } from './offlineStore.js';

const app = document.getElementById('app')!;

let currentMonacoEditor: any = null;

// PWA Service Worker Registration
if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

function updateOnlineStatus() {
  const el = document.getElementById('offline-indicator');
  if (el) {
    el.style.display = navigator.onLine ? 'none' : 'block';
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', async () => {
    updateOnlineStatus();
    await OfflineStore.syncOutbox(async (sub) => {
      return api('/api/submissions', {
        method: 'POST',
        body: JSON.stringify({
          problemSlug: sub.problemSlug,
          language: sub.language,
          sourceCode: sub.sourceCode,
          idempotencyKey: sub.idempotencyKey,
        }),
      });
    });
  });
  window.addEventListener('offline', updateOnlineStatus);
  window.addEventListener('DOMContentLoaded', updateOnlineStatus);
}

async function api(path: string, opts?: RequestInit) {
  const token = localStorage.getItem('auth_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts?.headers as Record<string, string> || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(path, {
    ...opts,
    headers,
  });
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({ error: res.statusText }));
    if (res.status === 401 && path !== '/api/auth/login') {
      clearSession();
      location.hash = '#/login';
    }
    throw errorBody;
  }
  return res.json();
}

let currentUser: { id: number; email: string; name: string; role: string } | null = null;

function clearSession() {
  localStorage.removeItem('auth_token');
  localStorage.removeItem('auth_user');
  currentUser = null;
  renderAuthNav();
}

/** Asks the server who we are. No auto-login: no valid session means the login page. */
async function loadSession() {
  try {
    const res = await fetch('/api/auth/me', {
      headers: localStorage.getItem('auth_token') ? { Authorization: `Bearer ${localStorage.getItem('auth_token')}` } : {},
    });
    const data = res.ok ? await res.json() : { user: null };
    currentUser = data.user ?? null;
  } catch {
    // Offline: keep the cached user so reading/writing code still works; the server re-checks on sync.
    try { currentUser = JSON.parse(localStorage.getItem('auth_user') || 'null'); } catch { currentUser = null; }
  }
  if (!currentUser) clearSession();
  renderAuthNav();
}

function renderAuthNav() {
  const nav = document.querySelector('header nav');
  if (!nav) return;
  document.getElementById('nav-auth')?.remove();
  const el = document.createElement('a');
  el.id = 'nav-auth';
  el.href = '#/login';
  if (currentUser) {
    el.textContent = `🚪 ออกจากระบบ (${currentUser.name})`;
    el.addEventListener('click', async (e) => {
      e.preventDefault();
      try { await fetch('/api/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
      clearSession();
      location.hash = '#/login';
      route();
    });
  } else {
    el.textContent = '🔑 เข้าสู่ระบบ';
  }
  nav.appendChild(el);
}

function renderLoginView() {
  app.innerHTML = '';
  const box = document.createElement('div');
  box.style.cssText = 'max-width:380px;margin:3rem auto;padding:1.5rem;border:1px solid var(--border,#ccc);border-radius:12px;';
  box.innerHTML = `
    <h2 style="margin-top:0">เข้าสู่ระบบ</h2>
    <form id="login-form" style="display:grid;gap:.75rem">
      <input id="login-email" type="email" placeholder="อีเมล" autocomplete="username" required />
      <input id="login-password" type="password" placeholder="รหัสผ่าน" autocomplete="current-password" required />
      <button type="submit">เข้าสู่ระบบ</button>
      <div id="login-error" role="alert" style="color:#c0392b;min-height:1.2em"></div>
    </form>`;
  app.appendChild(box);
  const form = box.querySelector<HTMLFormElement>('#login-form')!;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = box.querySelector<HTMLElement>('#login-error')!;
    errEl.textContent = '';
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: (box.querySelector('#login-email') as HTMLInputElement).value.trim(),
          password: (box.querySelector('#login-password') as HTMLInputElement).value,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        errEl.textContent = res.status === 429 ? 'ลองผิดหลายครั้งเกินไป กรุณารอสักครู่' : (data.error || 'เข้าสู่ระบบไม่สำเร็จ');
        return;
      }
      localStorage.setItem('auth_token', data.token);
      localStorage.setItem('auth_user', JSON.stringify(data.user));
      currentUser = data.user;
      renderAuthNav();
      location.hash = '#/tracks';
      route();
    } catch {
      errEl.textContent = 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้';
    }
  });
}

// -------------------------------------------------------------
// View 1: Tracks Overview (#/ or #/tracks)
// -------------------------------------------------------------
async function renderTracksView() {
  try {
    const tracks = await api('/api/tracks');
    app.innerHTML = `
      <div style="margin-bottom:2rem; text-align:center;">
        <h1 style="margin-bottom:0.5rem">หลักสูตรวิทยาการคอมพิวเตอร์และการเขียนโปรแกรมแข่งขัน</h1>
        <p style="color:var(--text-muted); max-width:750px; margin:0 auto;">
          เลือกเส้นทางการเรียนรู้ที่เหมาะกับคุณ: เริ่มต้นจากศูนย์สู่การคิดเชิงอัลกอริทึม หรือมุ่งสู่การฝึกฝนขั้นสูงเพื่อการแข่งขันระดับ สอวน. และ TOI
        </p>
      </div>

      <div class="grid-2">
        ${tracks.map((t: any) => `
          <div class="track-card">
            <div>
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
                <span class="badge ${t.slug === 'beginner' ? 'badge-D1' : 'badge-D4'}">
                  ${t.slug === 'beginner' ? 'START FROM -1' : 'COMPETITIVE PROGRAMMING'}
                </span>
                <span style="font-size:0.85rem; color:var(--text-muted)">${t.lessonCount} บทเรียน</span>
              </div>
              <h2 style="margin:0 0 0.75rem 0">${escapeHtml(t.title)}</h2>
              <p style="color:var(--text-muted); font-size:0.95rem; margin-bottom:1.5rem">
                ${escapeHtml(t.description)}
              </p>
            </div>
            <a href="#/track/${t.slug}" class="btn-primary" style="text-decoration:none; justify-content:center;">
              เข้าสู่แผนการเรียน &rarr;
            </a>
          </div>
        `).join('')}
      </div>

      <div class="card" style="margin-top:2rem">
        <h3 style="margin-top:0">สถาปัตยกรรมหลักสูตร 8 ลำดับขั้น (Curriculum Stages 0 – 7)</h3>
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:1rem; margin-top:1rem;">
          <div style="padding:0.75rem; border:1px solid var(--border); border-radius:6px;">
            <strong>Stage 0:</strong> Programming from -1
            <div style="color:var(--text-muted); font-size:0.85rem">คิดเชิงคำนวณ, ตัวแปร, ลูป, ฟังก์ชัน</div>
          </div>
          <div style="padding:0.75rem; border:1px solid var(--border); border-radius:6px;">
            <strong>Stage 1:</strong> Language Foundations
            <div style="color:var(--text-muted); font-size:0.85rem">C17 Pointers, Memory, C++17 STL, Fast I/O</div>
          </div>
          <div style="padding:0.75rem; border:1px solid var(--border); border-radius:6px;">
            <strong>Stage 2:</strong> Algorithmic Thinking
            <div style="color:var(--text-muted); font-size:0.85rem">Complexity, Prefix Sums, Binary Search, Greedy</div>
          </div>
          <div style="padding:0.75rem; border:1px solid var(--border); border-radius:6px;">
            <strong>Stage 3:</strong> Core Data Structures
            <div style="color:var(--text-muted); font-size:0.85rem">Stack/Queue, DSU, Fenwick, Segment Tree</div>
          </div>
          <div style="padding:0.75rem; border:1px solid var(--border); border-radius:6px;">
            <strong>Stage 4:</strong> Graph Algorithms
            <div style="color:var(--text-muted); font-size:0.85rem">DFS/BFS, Dijkstra, MST, LCA, Tree Diameter</div>
          </div>
          <div style="padding:0.75rem; border:1px solid var(--border); border-radius:6px;">
            <strong>Stage 5:</strong> Dynamic Programming
            <div style="color:var(--text-muted); font-size:0.85rem">State Design, Knapsack, LIS, Tree DP, Bitmask</div>
          </div>
          <div style="padding:0.75rem; border:1px solid var(--border); border-radius:6px;">
            <strong>Stage 6:</strong> Advanced Algorithms
            <div style="color:var(--text-muted); font-size:0.85rem">Lazy Segment Tree, String KMP, Flow, Math</div>
          </div>
          <div style="padding:0.75rem; border:1px solid var(--border); border-radius:6px;">
            <strong>Stage 7:</strong> POSN/TOI Challenge Lab
            <div style="color:var(--text-muted); font-size:0.85rem">Subtask Hunting, Stress Testing, Mock Contests</div>
          </div>
        </div>
      </div>
    `;
  } catch (err: any) {
    app.innerHTML = `<div class="alert-box alert-error">เกิดข้อผิดพลาดในการโหลดหลักสูตร: ${err?.error || err}</div>`;
  }
}

// -------------------------------------------------------------
// View 2: Track Roadmap (#/track/:slug)
// -------------------------------------------------------------
async function renderTrackDetail(slug: string) {
  try {
    const data = await api(`/api/tracks/${slug}`);
    const { track, lessons } = data;

    app.innerHTML = `
      <div style="margin-bottom:1.5rem">
        <a href="#/tracks" style="color:var(--text-muted); text-decoration:none">&larr; กลับหน้ารวมแผนการเรียน</a>
        <h1 style="margin:0.5rem 0 0.25rem 0">${escapeHtml(track.title)}</h1>
        <p style="color:var(--text-muted)">${escapeHtml(track.description)}</p>
      </div>

      <div class="card" style="padding:0">
        <div style="padding:1rem 1.5rem; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center;">
          <h3 style="margin:0">ลำดับบทเรียน (${lessons.length} บท)</h3>
          <span style="font-size:0.85rem; color:var(--text-muted)">เรียนได้อย่างอิสระ ไม่ถูกล็อกลำดับ</span>
        </div>
        <div>
          ${lessons.map((l: any) => `
            <div class="lesson-item">
              <div>
                <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.25rem;">
                  <span class="stage-tag">Stage ${l.stage}</span>
                  <span class="badge badge-${l.difficulty}">${l.difficulty}</span>
                  <span style="color:var(--text-muted); font-size:0.85rem">⏱️ ~${l.estimated_minutes} นาที</span>
                  ${l.status === 'completed' ? '<span class="badge badge-AC">✓ เรียนแล้ว</span>' : ''}
                  ${l.status === 'in_progress' ? '<span class="badge badge-RUNNING">กำลังเรียน</span>' : ''}
                </div>
                <h4 style="margin:0 0 0.25rem 0">
                  <a href="#/lesson/${l.slug}" style="color:#fff; text-decoration:none">${escapeHtml(l.title)}</a>
                </h4>
                <p style="margin:0; font-size:0.85rem; color:var(--text-muted)">${escapeHtml(l.summary)}</p>
              </div>
              <div>
                <a href="#/lesson/${l.slug}" class="btn-secondary" style="text-decoration:none; white-space:nowrap;">
                  ${l.status === 'completed' ? 'ทบทวนบทเรียน' : 'เริ่มเรียน'} &rarr;
                </a>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  } catch (err: any) {
    app.innerHTML = `<div class="alert-box alert-error">ไม่พบแผนการเรียน: ${err?.error || err}</div>`;
  }
}

// -------------------------------------------------------------
// View 3: Searchable Lesson Catalog (#/lessons)
// -------------------------------------------------------------
async function renderLessonsCatalog() {
  try {
    const lessons = await api('/api/lessons');
    app.innerHTML = `
      <div style="margin-bottom:1.5rem">
        <h1 style="margin-bottom:0.5rem">คลังบทเรียนทั้งหมด (Lesson Library)</h1>
        <p style="color:var(--text-muted)">ค้นหาและเลือกเรียนหัวข้อที่สนใจได้อย่างอิสระตามความพร้อมของคุณ</p>
      </div>

      <div class="card">
        <div style="display:flex; gap:0.75rem; margin-bottom:1.5rem; flex-wrap:wrap;">
          <input type="text" id="lesson-search" placeholder="ค้นหาบทเรียน เช่น Prefix, Pointers..." 
                 style="flex:1; min-width:240px; background:#090d13; color:#fff; border:1px solid var(--border); padding:0.5rem 0.75rem; border-radius:6px; font-family:inherit;">
          <select id="stage-filter" style="background:#090d13; color:#fff; border:1px solid var(--border); padding:0.5rem 0.75rem; border-radius:6px; font-family:inherit;">
            <option value="">ทุก Stage (0 - 7)</option>
            <option value="0">Stage 0: Programming from -1</option>
            <option value="1">Stage 1: C17 & C++17 Foundations</option>
            <option value="2">Stage 2: Algorithmic Thinking</option>
            <option value="3">Stage 3: Core Data Structures</option>
            <option value="4">Stage 4: Graph Algorithms</option>
            <option value="5">Stage 5: Dynamic Programming</option>
            <option value="6">Stage 6: Advanced Algorithms</option>
            <option value="7">Stage 7: POSN/TOI Challenge Lab</option>
          </select>
        </div>

        <div id="lessons-list">
          ${renderLessonsList(lessons)}
        </div>
      </div>
    `;

    const searchInput = document.getElementById('lesson-search') as HTMLInputElement;
    const stageSelect = document.getElementById('stage-filter') as HTMLSelectElement;

    const filterLessons = async () => {
      const q = encodeURIComponent(searchInput.value.trim());
      const st = stageSelect.value;
      const res = await api(`/api/lessons?q=${q}&stage=${st}`);
      document.getElementById('lessons-list')!.innerHTML = renderLessonsList(res);
    };

    searchInput.oninput = filterLessons;
    stageSelect.onchange = filterLessons;
  } catch (err: any) {
    app.innerHTML = `<div class="alert-box alert-error">เกิดข้อผิดพลาด: ${err?.error || err}</div>`;
  }
}

function renderLessonsList(list: any[]) {
  if (list.length === 0) {
    return `<div style="text-align:center; padding:2rem; color:var(--text-muted)">ไม่พบบทเรียนที่ตรงกับเงื่อนไขการค้นหา</div>`;
  }
  return list.map(l => `
    <div class="lesson-item">
      <div>
        <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.25rem;">
          <span class="stage-tag">Stage ${l.stage}</span>
          <span class="badge badge-${l.difficulty}">${l.difficulty}</span>
          <span style="font-size:0.8rem; color:var(--text-muted)">หัวข้อ: ${escapeHtml(l.topic)}</span>
        </div>
        <h3 style="margin:0 0 0.25rem 0">
          <a href="#/lesson/${l.slug}" style="color:#fff; text-decoration:none">${escapeHtml(l.title)}</a>
        </h3>
        <p style="margin:0; font-size:0.85rem; color:var(--text-muted)">${escapeHtml(l.summary)}</p>
      </div>
      <div>
        <a href="#/lesson/${l.slug}" class="btn-primary" style="text-decoration:none; padding:0.4rem 0.9rem; font-size:0.85rem">
          เปิดอ่าน &rarr;
        </a>
      </div>
    </div>
  `).join('');
}

// -------------------------------------------------------------
// View 4: Full Lesson Viewer (#/lesson/:slug) with 17 Sections
// -------------------------------------------------------------
async function renderLessonDetail(slug: string) {
  try {
    const l = await api(`/api/lessons/${slug}`);
    const s = l.sections;

    app.innerHTML = `
      <div style="margin-bottom:1.5rem">
        <a href="#/lessons" style="color:var(--text-muted); text-decoration:none">&larr; กลับคลังบทเรียน</a>
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-top:0.5rem;">
          <div>
            <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.25rem;">
              <span class="stage-tag">Stage ${l.stage}</span>
              <span class="badge badge-${l.difficulty}">${l.difficulty}</span>
              <span style="color:var(--text-muted); font-size:0.85rem">⏱️ เวลาโดยประมาณ ${l.estimatedMinutes} นาที</span>
            </div>
            <h1 style="margin:0 0 0.5rem 0">${escapeHtml(l.title)}</h1>
          </div>
          <div>
            <button id="btn-toggle-progress" class="btn-secondary">
              ${l.userProgress === 'completed' ? '✓ เรียนจบแล้ว (Completed)' : 'ทำเครื่องหมายว่าเรียนจบ'}
            </button>
          </div>
        </div>
      </div>

      <!-- Tab Navigation for the 17 Sections -->
      <div class="card" style="padding:1.5rem">
        <div class="tab-bar">
          <button class="tab-btn active" data-tab="tab-overview">1. ภาพรวม & วัตถุประสงค์</button>
          <button class="tab-btn" data-tab="tab-theory">2. คำอธิบายทฤษฎี & ตัวอย่าง</button>
          <button class="tab-btn" data-tab="tab-code">3. โค้ดตัวอย่าง C17 & C++17</button>
          <button class="tab-btn" data-tab="tab-complexity">4. ความซับซ้อน & การพิสูจน์</button>
          <button class="tab-btn" data-tab="tab-mistakes">5. ข้อผิดพลาดที่พบบ่อย</button>
          <button class="tab-btn" data-tab="tab-practice">6. แบบฝึกหัด & โจทย์ส่งตรวจ</button>
          <button class="tab-btn" data-tab="tab-hints">7. คำใบ้ & เฉลยละเอียด</button>
        </div>

        <!-- Tab 1: Overview & Objectives -->
        <div id="tab-overview" class="tab-content">
          <h3>บทนำและความสำคัญ (Topic Overview & Motivation)</h3>
          <p style="white-space:pre-wrap">${escapeHtml(s.overview)}</p>

          <h3 style="margin-top:1.5rem">วัตถุประสงค์การเรียนรู้ (Explicit Learning Objectives)</h3>
          <ul>
            ${l.learningObjectives.map((obj: string) => `<li>${escapeHtml(obj)}</li>`).join('')}
          </ul>

          <h3 style="margin-top:1.5rem">ความรู้พื้นฐานที่ต้องมี (Prerequisites)</h3>
          <p>${escapeHtml(s.prerequisites)}</p>

          <h3 style="margin-top:1.5rem">เกณฑ์การผ่านระดับชำนาญ (Mastery Criteria)</h3>
          <ul>
            ${(s.masteryCriteria || []).map((m: string) => `<li>${escapeHtml(m)}</li>`).join('')}
          </ul>
        </div>

        <!-- Tab 2: Concept Explanation & Worked Examples -->
        <div id="tab-theory" class="tab-content" style="display:none">
          <h3>คำอธิบายหลักการ (Concept Explanation)</h3>
          <div style="white-space:pre-wrap; line-height:1.7">${escapeHtml(s.explanation)}</div>

          <h3 style="margin-top:1.5rem">ตัวอย่างการทำงานทีละขั้นตอน (Step-by-Step Worked Examples)</h3>
          <div style="white-space:pre-wrap; line-height:1.7">${escapeHtml(s.workedExamples)}</div>
        </div>

        <!-- Tab 3: C17 and C++17 Implementation -->
        <div id="tab-code" class="tab-content" style="display:none">
          <h3>การเขียนโปรแกรมด้วยภาษา C17</h3>
          <div class="code-box"><pre><code>${escapeHtml(s.c17Implementation || '// ไม่มีโค้ด C17 สำหรับหัวข้อนี้')}</code></pre></div>

          <h3 style="margin-top:1.5rem">การเขียนโปรแกรมด้วยภาษา C++17 (Modern Idioms & Fast I/O)</h3>
          <div class="code-box"><pre><code>${escapeHtml(s.cpp17Implementation)}</code></pre></div>
        </div>

        <!-- Tab 4: Complexity Analysis & Proof -->
        <div id="tab-complexity" class="tab-content" style="display:none">
          <h3>การวิเคราะห์ความซับซ้อน (Time & Space Complexity)</h3>
          <div style="white-space:pre-wrap">${escapeHtml(s.complexityAnalysis)}</div>

          <h3 style="margin-top:1.5rem">การพิสูจน์ความถูกต้อง (Correctness Reasoning / Proof)</h3>
          <div style="white-space:pre-wrap">${escapeHtml(s.correctnessProof)}</div>
        </div>

        <!-- Tab 5: Common Mistakes & Counterexamples -->
        <div id="tab-mistakes" class="tab-content" style="display:none">
          <h3>ข้อผิดพลาดคลาสสิกและกรณีตัวอย่างที่พัง (Common Mistakes & Counterexamples)</h3>
          <div style="white-space:pre-wrap">${escapeHtml(s.commonMistakes)}</div>
        </div>

        <!-- Tab 6: Guided Practice & Independent Problems -->
        <div id="tab-practice" class="tab-content" style="display:none">
          <h3>แบบฝึกหัดนำทำ (Guided Practice)</h3>
          <div style="white-space:pre-wrap">${escapeHtml(s.guidedPractice)}</div>

          <h3 style="margin-top:1.5rem">โจทย์ฝึกฝนอิสระ (Independent Problem Set)</h3>
          <div style="white-space:pre-wrap">${escapeHtml(s.independentProblems)}</div>

          ${l.problems && l.problems.length > 0 ? `
            <div class="alert-box" style="background:rgba(35,134,54,0.1); border-color:var(--primary); margin-top:1.5rem">
              <h4 style="margin:0 0 0.5rem 0">โจทย์สำหรับส่งตรวจจริงบน Online Judge:</h4>
              ${l.problems.map((p: any) => `
                <div style="display:flex; justify-content:space-between; align-items:center; padding:0.5rem 0;">
                  <span><strong>${escapeHtml(p.title)}</strong> (ระดับ ${p.difficulty || 'D1'})</span>
                  <a href="#/p/${p.slug}" class="btn-primary" style="text-decoration:none; padding:0.35rem 0.8rem; font-size:0.85rem">
                    ไปหน้าเขียนโค้ดส่งตรวจ &rarr;
                  </a>
                </div>
              `).join('')}
            </div>
          ` : ''}
        </div>

        <!-- Tab 7: Progressive Hints & Editorial -->
        <div id="tab-hints" class="tab-content" style="display:none">
          <h3>คำใบ้แบบไต่ระดับ (Progressive Hints)</h3>
          <p style="color:var(--text-muted); font-size:0.85rem">คลิกเปิดดูทีละระดับเมื่อติดขัด อย่าเพิ่งรีบดูเฉลยทันที</p>
          ${(s.progressiveHints || []).map((hint: string, idx: number) => `
            <details class="alert-box alert-hint" style="margin-bottom:0.75rem; cursor:pointer">
              <summary style="font-weight:600">💡 คำใบ้ระดับที่ ${idx + 1}</summary>
              <p style="margin:0.5rem 0 0 0">${escapeHtml(hint)}</p>
            </details>
          `).join('')}

          <h3 style="margin-top:1.5rem">บทวิเคราะห์เฉลย (Editorial & Solution Analysis)</h3>
          <div style="white-space:pre-wrap">${escapeHtml(s.editorial)}</div>
        </div>
      </div>
    `;

    // Tab switcher logic
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        tabBtns.forEach(b => b.classList.remove('active'));
        tabContents.forEach(c => (c as HTMLElement).style.display = 'none');
        btn.classList.add('active');
        const targetId = btn.getAttribute('data-tab')!;
        document.getElementById(targetId)!.style.display = 'block';
      });
    });

    // Toggle progress completion
    const toggleBtn = document.getElementById('btn-toggle-progress') as HTMLButtonElement;
    toggleBtn.onclick = async () => {
      const newStatus = l.userProgress === 'completed' ? 'in_progress' : 'completed';
      await api(`/api/lessons/${slug}/progress`, {
        method: 'POST',
        body: JSON.stringify({ status: newStatus }),
      });
      renderLessonDetail(slug);
    };
  } catch (err: any) {
    app.innerHTML = `<div class="alert-box alert-error">ไม่พบบทเรียน: ${err?.error || err}</div>`;
  }
}

// -------------------------------------------------------------
// View 5: Problems Catalog (#/problems)
// -------------------------------------------------------------
async function renderProblemsCatalog() {
  try {
    const problems = await api('/api/problems');
    app.innerHTML = `
      <div style="margin-bottom:1.5rem">
        <h1 style="margin-bottom:0.5rem">คลังโจทย์ทั้งหมด (Problem Set)</h1>
        <p style="color:var(--text-muted)">ฝึกแก้โจทย์จริง วัดความเร็ว หน่วยความจำ และเก็บคะแนน Subtask</p>
      </div>

      <div class="card">
        <table class="data-table">
          <thead>
            <tr>
              <th>ชื่อโจทย์</th>
              <th>Slug</th>
              <th style="text-align: right">การกระทำ</th>
            </tr>
          </thead>
          <tbody>
            ${problems.map((p: any) => `
              <tr>
                <td><strong>${escapeHtml(p.title)}</strong></td>
                <td><code style="color:var(--info)">${escapeHtml(p.slug)}</code></td>
                <td style="text-align: right">
                  <a href="#/p/${p.slug}" class="btn-primary" style="text-decoration:none; display:inline-block; padding:0.35rem 0.85rem">เขียนโค้ด &rarr;</a>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (err: any) {
    app.innerHTML = `<div class="alert-box alert-error">เกิดข้อผิดพลาด: ${err?.error || err}</div>`;
  }
}

// -------------------------------------------------------------
// View 6: Problem Solve & Editor (#/p/:slug)
// -------------------------------------------------------------
// -------------------------------------------------------------
// View 6: Problem Solve & Editor (#/p/:slug) — Tasks 15 & 17
// Supports Split View, Focus Mode, Problem Drawer, Autosave, and Offline Submit
// -------------------------------------------------------------
async function renderProblemSolve(slug: string) {
  try {
    const p = await api(`/api/problems/${slug}`);
    const layoutSettings = OfflineStore.loadLayoutSettings();
    let currentMode: 'split' | 'focus' = layoutSettings.layoutMode || 'split';
    let currentFontSize = layoutSettings.fontSize || 14;

    const savedDraft = OfflineStore.loadDraft(slug, 'C++17');
    const defaultCode = savedDraft || `#include <iostream>\nusing namespace std;\n\nint main() {\n    ios_base::sync_with_stdio(false);\n    cin.tie(NULL);\n    // เขียนโค้ด C++17 สำหรับโจทย์ ${p.slug} ที่นี่\n    return 0;\n}`;

    const statementContentHtml = `
      <div style="padding:1rem;">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:0.75rem;">
          <div style="display:flex; align-items:center; gap:0.5rem">
            <span class="badge badge-${p.difficulty || 'D1'}">${p.difficulty || 'D1'}</span>
            <h2 style="margin:0; font-size:1.25rem">${escapeHtml(p.title)}</h2>
          </div>
          <span style="font-size:0.8rem; color:var(--text-muted)">
            จำกัดเวลา: ${p.version?.time_limit_ms || 1000} ms | RAM: ${p.version?.memory_limit_mb || 256} MB
          </span>
        </div>
        <div style="white-space: pre-wrap; font-family: inherit; line-height:1.7;">${escapeHtml(p.version?.statement_md || '')}</div>

        ${p.hints && p.hints.length > 0 ? `
          <div style="margin-top:1.5rem; border-top:1px solid var(--border); padding-top:1rem">
            <h4 style="margin:0 0 0.5rem 0">💡 คำใบ้แบบไต่ระดับ (Progressive Hints)</h4>
            ${p.hints.map((h: string, idx: number) => `
              <details class="alert-box alert-hint" style="margin-bottom:0.5rem; cursor:pointer">
                <summary style="font-size:0.85rem; font-weight:600">คำใบ้ที่ ${idx + 1}</summary>
                <p style="margin:0.5rem 0 0 0; font-size:0.85rem">${escapeHtml(h)}</p>
              </details>
            `).join('')}
          </div>
        ` : ''}

        ${p.editorial ? `
          <details class="card" style="margin-top:1rem; cursor:pointer">
            <summary style="font-weight:600">📝 บทวิเคราะห์แนวคิดเฉลย (Editorial)</summary>
            <div style="white-space:pre-wrap; margin-top:0.75rem; font-size:0.9rem">${escapeHtml(p.editorial)}</div>
          </details>
        ` : ''}
      </div>
    `;

    app.innerHTML = `
      <!-- Slide-over Drawer for Focus Mode -->
      <div id="drawer-backdrop" class="drawer-backdrop"></div>
      <div id="problem-drawer" class="problem-drawer">
        <div class="panel-header" style="justify-content:space-between;">
          <span style="font-weight:600">📖 คำอธิบายโจทย์ (Problem Drawer)</span>
          <button id="btn-close-drawer" class="btn-secondary" style="padding:0.2rem 0.5rem">✕ ปิด (Esc)</button>
        </div>
        <div style="flex:1; overflow-y:auto;">
          ${statementContentHtml}
        </div>
      </div>

      <!-- Main Editor Container Wrapper -->
      <div id="editor-wrapper" class="editor-container-wrapper ${currentMode === 'focus' ? 'focus-mode-active' : ''}">
        <div class="split-layout">
          <!-- Split View Left Column: Statement Panel -->
          <div class="panel panel-statement">
            <div class="panel-header">
              <a href="#/problems" style="color:var(--text-muted); text-decoration:none; font-size:0.85rem">&larr; คลังโจทย์</a>
              <span style="font-size:0.8rem; color:var(--text-muted)">Split View</span>
            </div>
            <div class="panel-body" style="padding:0;">
              ${statementContentHtml}
            </div>
          </div>

          <!-- Editor Panel (Always preserved in DOM across mode switches) -->
          <div class="panel panel-editor">
            <div class="panel-header">
              <div style="display:flex; align-items:center; gap:0.75rem">
                <span style="font-weight:600; font-family:'JetBrains Mono'">C++17</span>
                <span id="autosave-indicator" style="font-size:0.78rem; color:var(--text-muted)">💾 ร่างพร้อม</span>
                <button id="btn-toggle-drawer" class="btn-secondary" style="display:${currentMode === 'focus' ? 'inline-flex' : 'none'}; font-size:0.8rem; padding:0.25rem 0.6rem;">
                  📖 เปิดโจทย์ (Ctrl+Shift+P)
                </button>
              </div>

              <div style="display:flex; align-items:center; gap:0.5rem">
                <!-- Font Size Selector -->
                <select id="select-font-size" style="background:#21262d; color:#c9d1d9; border:1px solid var(--border); border-radius:4px; padding:0.25rem 0.4rem; font-size:0.8rem;">
                  <option value="12" ${currentFontSize === 12 ? 'selected' : ''}>12px</option>
                  <option value="14" ${currentFontSize === 14 ? 'selected' : ''}>14px</option>
                  <option value="16" ${currentFontSize === 16 ? 'selected' : ''}>16px</option>
                  <option value="18" ${currentFontSize === 18 ? 'selected' : ''}>18px</option>
                </select>

                <!-- Dual Mode Toggle (Split vs Focus) -->
                <button id="btn-toggle-layout" class="btn-secondary" style="font-size:0.8rem; padding:0.3rem 0.7rem;">
                  ${currentMode === 'focus' ? '🪟 สลับเป็น Split View' : '🔲 Focus Mode'}
                </button>

                <!-- Submit Button -->
                <button id="btn-submit" class="btn-primary">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
                  ส่งตรวจ (Submit)
                </button>
              </div>
            </div>

            <div class="panel-body" style="padding:0; position:relative; flex:1;">
              <div id="monaco-container"></div>
              <textarea id="code-fallback" class="code-fallback" style="display:none">${escapeHtml(defaultCode)}</textarea>
            </div>

            <div id="submit-status" style="padding:0.6rem 1rem; border-top:1px solid var(--border); display:none;"></div>
          </div>
        </div>
      </div>
    `;

    // 1. Monaco Editor Initialization (Single Instance Preserved)
    let saveTimeout: any = null;
    const triggerAutosave = (codeContent: string) => {
      const indicator = document.getElementById('autosave-indicator');
      if (indicator) indicator.innerText = 'กำลังบันทึก...';
      clearTimeout(saveTimeout);
      saveTimeout = setTimeout(() => {
        OfflineStore.saveDraft(slug, 'C++17', codeContent);
        if (indicator) indicator.innerText = '💾 บันทึกร่างแล้ว';
      }, 1000);
    };

    if (typeof (window as any).require !== 'undefined') {
      (window as any).require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.44.0/min/vs' } });
      (window as any).require(['vs/editor/editor.main'], () => {
        const container = document.getElementById('monaco-container');
        if (container) {
          container.innerHTML = '';
          currentMonacoEditor = (window as any).monaco.editor.create(container, {
            value: defaultCode,
            language: 'cpp',
            theme: 'vs-dark',
            automaticLayout: true,
            fontSize: currentFontSize,
            minimap: { enabled: false },
          });

          currentMonacoEditor.onDidChangeModelContent(() => {
            triggerAutosave(currentMonacoEditor.getValue());
          });
        }
      });
    } else {
      const fallback = document.getElementById('code-fallback') as HTMLTextAreaElement;
      if (fallback) {
        fallback.style.display = 'block';
        fallback.oninput = () => triggerAutosave(fallback.value);
      }
    }

    // 2. Dual Mode Layout Switcher (No remount of Monaco, only CSS layout change)
    const editorWrapper = document.getElementById('editor-wrapper')!;
    const btnToggleLayout = document.getElementById('btn-toggle-layout') as HTMLButtonElement;
    const btnToggleDrawer = document.getElementById('btn-toggle-drawer') as HTMLButtonElement;
    const drawerBackdrop = document.getElementById('drawer-backdrop')!;
    const problemDrawer = document.getElementById('problem-drawer')!;
    const btnCloseDrawer = document.getElementById('btn-close-drawer')!;

    const setMode = (mode: 'split' | 'focus') => {
      currentMode = mode;
      OfflineStore.saveLayoutSettings({ layoutMode: mode, splitRatio: 50, fontSize: currentFontSize });

      if (mode === 'focus') {
        editorWrapper.classList.add('focus-mode-active');
        btnToggleLayout.innerText = '🪟 สลับเป็น Split View';
        btnToggleDrawer.style.display = 'inline-flex';
      } else {
        editorWrapper.classList.remove('focus-mode-active');
        btnToggleLayout.innerText = '🔲 Focus Mode';
        btnToggleDrawer.style.display = 'none';
        closeDrawer();
      }

      // Re-layout Monaco to fit new bounds
      if (currentMonacoEditor) {
        setTimeout(() => currentMonacoEditor.layout(), 50);
      }
    };

    btnToggleLayout.onclick = () => {
      setMode(currentMode === 'focus' ? 'split' : 'focus');
    };

    // 3. Problem Drawer Handlers
    const openDrawer = () => {
      problemDrawer.classList.add('open');
      drawerBackdrop.classList.add('open');
    };
    const closeDrawer = () => {
      problemDrawer.classList.remove('open');
      drawerBackdrop.classList.remove('open');
    };

    btnToggleDrawer.onclick = openDrawer;
    btnCloseDrawer.onclick = closeDrawer;
    drawerBackdrop.onclick = closeDrawer;

    // 4. Keyboard Shortcuts: Ctrl+Shift+P / Cmd+Shift+P to toggle drawer, Esc to close
    window.onkeydown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'P' || e.key === 'p')) {
        e.preventDefault();
        if (currentMode === 'focus') {
          if (problemDrawer.classList.contains('open')) closeDrawer();
          else openDrawer();
        }
      } else if (e.key === 'Escape') {
        closeDrawer();
      }
    };

    // 5. Font Size Selector
    const selectFontSize = document.getElementById('select-font-size') as HTMLSelectElement;
    selectFontSize.onchange = () => {
      currentFontSize = parseInt(selectFontSize.value, 10);
      OfflineStore.saveLayoutSettings({ layoutMode: currentMode, splitRatio: 50, fontSize: currentFontSize });
      if (currentMonacoEditor) {
        currentMonacoEditor.updateOptions({ fontSize: currentFontSize });
      } else {
        const fallback = document.getElementById('code-fallback') as HTMLTextAreaElement;
        if (fallback) fallback.style.fontSize = `${currentFontSize}px`;
      }
    };

    // 6. Submission Handler with Offline Outbox Support (Task 15)
    const submitBtn = document.getElementById('btn-submit') as HTMLButtonElement;
    submitBtn.onclick = async () => {
      let code = '';
      if (currentMonacoEditor) {
        code = currentMonacoEditor.getValue();
      } else {
        code = (document.getElementById('code-fallback') as HTMLTextAreaElement).value;
      }

      const statusDiv = document.getElementById('submit-status')!;
      statusDiv.style.display = 'block';

      // Check if user is offline
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        const idempotencyKey = crypto.randomUUID();
        OfflineStore.enqueueSubmission({
          idempotencyKey,
          problemSlug: slug,
          problemVersionId: p.version?.id || 1,
          language: 'C++17',
          sourceCode: code,
          localCreatedAt: new Date().toISOString(),
        });
        statusDiv.innerHTML = `
          <div class="alert-box alert-hint" style="margin:0;">
            <strong>📦 บันทึกเข้า Outbox เรียบร้อยแล้ว (Offline Mode)</strong><br />
            คุณไม่ได้เชื่อมต่ออินเทอร์เน็ต ระบบได้เก็บโค้ดลงคิวรอส่งในเครื่อง และจะส่งตรวจให้อัตโนมัติทันทีที่เครือข่ายกลับมาออนไลน์
          </div>
        `;
        return;
      }

      submitBtn.disabled = true;
      submitBtn.innerText = 'กำลังส่ง...';

      try {
        const idempotencyKey = crypto.randomUUID();
        const res = await api('/api/submissions', {
          method: 'POST',
          body: JSON.stringify({
            problemSlug: slug,
            language: 'C++17',
            sourceCode: code,
            idempotencyKey,
          }),
        });
        window.location.hash = `#/s/${res.id}`;
      } catch (err: any) {
        submitBtn.disabled = false;
        submitBtn.innerText = 'ส่งตรวจ (Submit)';
        statusDiv.innerHTML = `<span style="color:#f85149">เกิดข้อผิดพลาด: ${err?.error || JSON.stringify(err)}</span>`;
      }
    };
  } catch (err: any) {
    app.innerHTML = `<div class="alert-box alert-error">ไม่พบโจทย์: ${err?.error || err}</div>`;
  }
}

// -------------------------------------------------------------
// View 7: User Progress Dashboard (#/dashboard)
// -------------------------------------------------------------
async function renderDashboard() {
  try {
    const data = await api('/api/me/curriculum-progress');
    app.innerHTML = `
      <div style="margin-bottom:1.5rem">
        <h1 style="margin-bottom:0.5rem">ความก้าวหน้าในการเรียนรู้ (Learning Progress)</h1>
        <p style="color:var(--text-muted)">ติดตามสถิติการเรียนรู้ราย Stage และความก้าวหน้าของคุณ</p>
      </div>

      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:1rem; margin-bottom:1.5rem;">
        <div class="card" style="margin:0">
          <span style="color:var(--text-muted); font-size:0.85rem">บทเรียนที่เรียนจบแล้ว</span>
          <div style="font-size:2rem; font-weight:700; color:var(--success)">${data.completedLessons} / ${data.totalLessons}</div>
        </div>
        <div class="card" style="margin:0">
          <span style="color:var(--text-muted); font-size:0.85rem">เปอร์เซ็นต์รวมความก้าวหน้า</span>
          <div style="font-size:2rem; font-weight:700; color:var(--info)">${data.overallPercentage}%</div>
        </div>
      </div>

      <div class="card">
        <h3 style="margin-top:0">ความก้าวหน้าราย Stage</h3>
        <table class="data-table">
          <thead>
            <tr>
              <th>Stage</th>
              <th>จำนวนบทเรียนที่เรียนจบ</th>
              <th>สถานะ</th>
            </tr>
          </thead>
          <tbody>
            ${data.stages.map((st: any) => `
              <tr>
                <td><strong>Stage ${st.stage}</strong></td>
                <td>${st.completed} / ${st.total} บท</td>
                <td>
                  <span class="badge ${st.completed === st.total ? 'badge-AC' : (st.completed > 0 ? 'badge-RUNNING' : 'badge-D0')}">
                    ${st.completed === st.total ? 'MASTERED' : (st.completed > 0 ? 'IN PROGRESS' : 'NOT STARTED')}
                  </span>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <div class="card">
        <h3 style="margin-top:0">กิจกรรมล่าสุด (Recent Activity)</h3>
        ${data.recentActivity.length > 0 ? `
          <table class="data-table">
            <thead>
              <tr>
                <th>บทเรียน</th>
                <th>Stage</th>
                <th>สถานะ</th>
                <th>เวลาที่เข้าใช้งาน</th>
              </tr>
            </thead>
            <tbody>
              ${data.recentActivity.map((act: any) => `
                <tr>
                  <td><a href="#/lesson/${act.slug}" style="color:#fff; text-decoration:none">${escapeHtml(act.title)}</a></td>
                  <td>Stage ${act.stage}</td>
                  <td><span class="badge ${act.status === 'completed' ? 'badge-AC' : 'badge-RUNNING'}">${act.status}</span></td>
                  <td style="color:var(--text-muted)">${new Date(act.last_accessed_at).toLocaleString('th-TH')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : '<p style="color:var(--text-muted)">ยังไม่มีกิจกรรมการเรียนรู้</p>'}
      </div>
    `;
  } catch (err: any) {
    app.innerHTML = `<div class="alert-box alert-error">เกิดข้อผิดพลาด: ${err?.error || err}</div>`;
  }
}

// -------------------------------------------------------------
// View 8: Submission Result & Polling (#/s/:id)
// -------------------------------------------------------------
async function renderSubmissionResult(id: number) {
  app.innerHTML = `
    <div class="card" id="submission-card">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <h2 style="margin:0">ผลการตรวจ Submission #${id}</h2>
        <span id="badge-container"><span class="badge badge-QUEUED">กำลังโหลด...</span></span>
      </div>
      <div id="result-details" style="margin-top:1.5rem">กำลังรอผลตรวจจาก Judge Engine...</div>
    </div>
  `;

  let delay = 1000;
  const maxDelay = 10000;

  const poll = async () => {
    try {
      const data = await api(`/api/submissions/${id}`);
      const { submission, judging, groups } = data;

      const badgeContainer = document.getElementById('badge-container');
      const detailsContainer = document.getElementById('result-details');
      if (!badgeContainer || !detailsContainer) return;

      const status = judging?.status || submission.status;
      const verdict = judging?.verdict || status;

      badgeContainer.innerHTML = `<span class="badge badge-${verdict}">${verdict}</span>`;

      if (status === 'QUEUED' || status === 'COMPILING' || status === 'RUNNING') {
        detailsContainer.innerHTML = `
          <div style="text-align:center; padding:2rem;">
            <p>สถานะปัจจุบัน: <strong>${status}</strong></p>
            <p style="color:var(--text-muted); font-size:0.9rem">กำลังรันและประเมินผลชุดทดสอบ (polling ทุก ${delay / 1000}s)...</p>
          </div>
        `;
        setTimeout(poll, delay);
        delay = Math.min(delay * 2, maxDelay);
        return;
      }

      let content = `
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:1rem; margin-bottom:1.5rem;">
          <div class="card" style="margin:0; padding:1rem; background:rgba(255,255,255,0.02)">
            <span style="color:var(--text-muted); font-size:0.85rem">คะแนนรวม (Score)</span>
            <div style="font-size:1.75rem; font-weight:700; color: ${judging?.score === judging?.max_score ? 'var(--success)' : 'inherit'}">
              ${judging?.score ?? 0} / ${judging?.max_score ?? 100}
            </div>
          </div>
          <div class="card" style="margin:0; padding:1rem; background:rgba(255,255,255,0.02)">
            <span style="color:var(--text-muted); font-size:0.85rem">เวลาทำงาน (Runtime)</span>
            <div style="font-size:1.75rem; font-weight:600">${judging?.runtime_ms ?? 0} ms</div>
          </div>
          <div class="card" style="margin:0; padding:1rem; background:rgba(255,255,255,0.02)">
            <span style="color:var(--text-muted); font-size:0.85rem">หน่วยความจำ (Memory)</span>
            <div style="font-size:1.75rem; font-weight:600">${judging?.memory_kb ?? 0} KB</div>
          </div>
        </div>
      `;

      if (status === 'JUDGE_ERROR' || verdict === 'JUDGE_ERROR') {
        content += `
          <div class="alert-box alert-error">
            <h3 style="margin-top:0">⚠️ เกิดข้อผิดพลาดในการตรวจ (JUDGE_ERROR)</h3>
            <p>${escapeHtml(judging?.error_message || 'ระบบตรวจโค้ดขัดข้องชั่วคราว งานนี้ถูกบันทึกเพื่อตรวจสอบแล้ว')}</p>
            <button id="btn-resubmit" class="btn-primary" style="margin-top:0.5rem">
              กดเพื่อส่งใหม่อีกครั้ง (Resubmit)
            </button>
          </div>
        `;
      }

      if (groups && groups.length > 0) {
        content += `<h3 style="margin-top:1.5rem">ผลการทดสอบแยกตาม Subtask</h3>`;
        for (const g of groups) {
          content += `
            <div class="subtask-card" style="border:1px solid var(--border); border-radius:6px; margin-bottom:0.75rem; overflow:hidden">
              <div style="padding:0.6rem 1rem; background:rgba(255,255,255,0.03); display:flex; justify-content:space-between; font-weight:500;">
                <span>Subtask: <strong>${escapeHtml(g.group)}</strong></span>
                <span>${g.tests.length} Test cases</span>
              </div>
              <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(130px, 1fr)); gap:0.5rem; padding:0.75rem; background:rgba(0,0,0,0.2)">
                ${g.tests.map((t: any) => `
                  <div style="padding:0.4rem 0.6rem; border-radius:4px; background:var(--card-bg); border:1px solid var(--border); font-size:0.8rem; display:flex; justify-content:space-between">
                    <span>#${t.index + 1}</span>
                    <span class="badge badge-${t.verdict}">${t.verdict}</span>
                  </div>
                `).join('')}
              </div>
            </div>
          `;
        }
      }

      content += `
        <div style="margin-top:1.5rem">
          <a href="#/problems" class="btn-primary" style="text-decoration:none; margin-right:0.5rem">&larr; กลับหน้ารวมโจทย์</a>
        </div>
      `;

      detailsContainer.innerHTML = content;

      const resubmitBtn = document.getElementById('btn-resubmit');
      if (resubmitBtn) {
        resubmitBtn.onclick = () => { window.location.hash = '#/problems'; };
      }
    } catch (err: any) {
      const detailsContainer = document.getElementById('result-details');
      if (detailsContainer) {
        detailsContainer.innerHTML = `<div class="alert-box alert-error">ไม่สามารถเชื่อมต่อผลตรวจ: ${err?.error || err}</div>`;
      }
    }
  };

  poll();
}

// -------------------------------------------------------------
// View 9: My Submissions & Admin
// -------------------------------------------------------------
async function renderMySubmissions() {
  try {
    const list = await api('/api/me/submissions');
    app.innerHTML = `
      <div class="card">
        <h2 style="margin-top:0">ประวัติการส่งโค้ดของคุณ (My Submissions)</h2>
        <table class="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>ภาษา</th>
              <th>สถานะ</th>
              <th>เวลาที่ส่ง</th>
              <th style="text-align:right">ดูผล</th>
            </tr>
          </thead>
          <tbody>
            ${list.map((s: any) => `
              <tr>
                <td>#${s.id}</td>
                <td><code style="color:var(--info)">${escapeHtml(s.language)}</code></td>
                <td><span class="badge badge-${s.status}">${s.status}</span></td>
                <td>${new Date(s.created_at).toLocaleString('th-TH')}</td>
                <td style="text-align:right">
                  <a href="#/s/${s.id}" style="color:var(--info); text-decoration:none">ดูผลตรวจ &rarr;</a>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (err: any) {
    app.innerHTML = `<div class="alert-box alert-error">เกิดข้อผิดพลาด: ${err?.error || err}</div>`;
  }
}

async function renderAdmin() {
  try {
    const health = await api('/api/admin/judge-health');
    app.innerHTML = `
      <div class="card">
        <h2 style="margin-top:0">ระบบผู้ดูแล (Admin Health & Queue)</h2>
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:1rem; margin-top:1rem;">
          <div class="card" style="margin:0; background:rgba(255,255,255,0.02)">
            <span style="color:var(--text-muted)">สถานะ Engine</span>
            <div style="font-size:1.5rem; font-weight:700; color:${health.engine.ok ? 'var(--success)' : 'var(--danger)'}">
              ${health.engine.ok ? 'ONLINE' : 'OFFLINE'}
            </div>
            <div style="font-size:0.85rem; color:var(--text-muted)">Workers: ${health.engine.workers}</div>
          </div>
          <div class="card" style="margin:0; background:rgba(255,255,255,0.02)">
            <span style="color:var(--text-muted)">งานในคิว (Queued)</span>
            <div style="font-size:1.5rem; font-weight:700">${health.queue.queued}</div>
          </div>
          <div class="card" style="margin:0; background:rgba(255,255,255,0.02)">
            <span style="color:var(--text-muted)">กำลังประมวลผล (Claimed)</span>
            <div style="font-size:1.5rem; font-weight:700">${health.queue.claimed}</div>
          </div>
          <div class="card" style="margin:0; background:rgba(255,255,255,0.02)">
            <span style="color:var(--text-muted)">งานที่ล้มเหลว (Dead-Letter)</span>
            <div style="font-size:1.5rem; font-weight:700; color:${health.queue.deadLetter > 0 ? 'var(--danger)' : 'inherit'}">
              ${health.queue.deadLetter}
            </div>
          </div>
        </div>
      </div>
    `;
  } catch (err: any) {
    app.innerHTML = `<div class="alert-box alert-error">เฉพาะผู้ดูแลระบบเท่านั้น: ${err?.error || err}</div>`;
  }
}

function escapeHtml(str: string) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function route() {
  const hash = location.hash || '#/tracks';

  if (!currentUser || hash === '#/login') {
    if (currentUser) { location.hash = '#/tracks'; return; }
    renderLoginView();
    return;
  }

  if (hash.startsWith('#/track/')) {
    renderTrackDetail(hash.slice(8));
  } else if (hash.startsWith('#/lesson/')) {
    renderLessonDetail(hash.slice(9));
  } else if (hash === '#/lessons') {
    renderLessonsCatalog();
  } else if (hash.startsWith('#/p/')) {
    renderProblemSolve(hash.slice(4));
  } else if (hash === '#/problems') {
    renderProblemsCatalog();
  } else if (hash.startsWith('#/s/')) {
    const id = Number(hash.slice(4));
    renderSubmissionResult(id);
  } else if (hash === '#/dashboard') {
    renderDashboard();
  } else if (hash === '#/me') {
    renderMySubmissions();
  } else if (hash === '#/admin') {
    renderAdmin();
  } else {
    renderTracksView();
  }
}

window.addEventListener('hashchange', route);
loadSession().finally(() => route());
