const app = document.getElementById('app')!;

let currentMonacoEditor: any = null;

async function api(path: string, opts?: RequestInit) {
  const res = await fetch(path, {
    ...opts,
    headers: {
      'X-User-Id': '1',
      'Content-Type': 'application/json',
      ...(opts?.headers || {}),
    },
  });
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({ error: res.statusText }));
    throw errorBody;
  }
  return res.json();
}

// Route 1: Problem List
async function renderProblemList() {
  try {
    const problems = await api('/api/problems');
    app.innerHTML = `
      <div class="card">
        <h2 style="margin-top:0">คลังโจทย์ (Problems)</h2>
        <p style="color: var(--text-muted)">เลือกโจทย์สำหรับฝึกฝนการเขียนโปรแกรมแข่งขัน TOI / สอวน.</p>
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
                  <a href="#/p/${p.slug}" class="btn-primary" style="text-decoration:none; display:inline-block; padding:0.35rem 0.85rem">ทำโจทย์ &rarr;</a>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (err: any) {
    app.innerHTML = `<div class="alert-box alert-error">เกิดข้อผิดพลาดในการโหลดโจทย์: ${err?.error || err}</div>`;
  }
}

// Route 2: Problem Solve & Editor
async function renderProblemSolve(slug: string) {
  try {
    const p = await api(`/api/problems/${slug}`);
    app.innerHTML = `
      <div class="split-layout">
        <!-- Problem Statement Panel -->
        <div class="panel">
          <div class="panel-header">
            <div>
              <h2 style="margin:0; font-size:1.25rem">${escapeHtml(p.title)}</h2>
              <span style="font-size:0.8rem; color:var(--text-muted)">
                จำกัดเวลา: ${p.version?.time_limit_ms || 1000} ms | หน่วยความจำ: ${p.version?.memory_limit_mb || 256} MB
              </span>
            </div>
            <a href="#/" style="color:var(--text-muted); text-decoration:none; font-size:0.85rem">&larr; กลับหน้ารวม</a>
          </div>
          <div class="panel-body">
            <div style="white-space: pre-wrap; font-family: inherit;">${escapeHtml(p.version?.statement_md || '')}</div>
          </div>
        </div>

        <!-- Editor & Submit Panel -->
        <div class="panel">
          <div class="panel-header">
            <span style="font-weight:600; font-family:'JetBrains Mono'">C++17</span>
            <button id="btn-submit" class="btn-primary">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
              ส่งตรวจ (Submit)
            </button>
          </div>
          <div class="panel-body" style="padding:0; position:relative;">
            <div id="monaco-container"></div>
            <textarea id="code-fallback" class="code-fallback" style="display:none">#include <iostream>\nusing namespace std;\n\nint main() {\n    // เขียนโค้ด C++17 ที่นี่\n    int a, b;\n    if (cin >> a >> b) {\n        cout << a + b << "\\n";\n    }\n    return 0;\n}</textarea>
          </div>
          <div id="submit-status" style="padding:0.5rem 1rem; border-top:1px solid var(--border); display:none;"></div>
        </div>
      </div>
    `;

    const defaultCode = `#include <iostream>\nusing namespace std;\n\nint main() {\n    // เขียนโค้ด C++17 ที่นี่\n    int a, b;\n    if (cin >> a >> b) {\n        cout << a + b << "\\n";\n    }\n    return 0;\n}`;

    // Initialize Monaco if loader exists
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
            fontSize: 14,
            minimap: { enabled: false },
          });
        }
      });
    } else {
      const fallback = document.getElementById('code-fallback') as HTMLTextAreaElement;
      if (fallback) fallback.style.display = 'block';
    }

    // Submit handler
    const submitBtn = document.getElementById('btn-submit') as HTMLButtonElement;
    submitBtn.onclick = async () => {
      let code = '';
      if (currentMonacoEditor) {
        code = currentMonacoEditor.getValue();
      } else {
        code = (document.getElementById('code-fallback') as HTMLTextAreaElement).value;
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
        const statusDiv = document.getElementById('submit-status')!;
        statusDiv.style.display = 'block';
        statusDiv.innerHTML = `<span style="color:#f85149">เกิดข้อผิดพลาด: ${err?.error || JSON.stringify(err)}</span>`;
      }
    };
  } catch (err: any) {
    app.innerHTML = `<div class="alert-box alert-error">ไม่พบโจทย์: ${err?.error || err}</div>`;
  }
}

// Route 3: Submission Result & Polling (with Exponential Backoff)
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

      // Terminal state: DONE or JUDGE_ERROR
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
            <div class="subtask-card">
              <div class="subtask-header">
                <span>Subtask: <strong>${escapeHtml(g.group)}</strong></span>
                <span>${g.tests.length} Test cases</span>
              </div>
              <div class="test-grid">
                ${g.tests.map((t: any) => `
                  <div class="test-chip">
                    <span>#${t.index + 1}</span>
                    <span class="badge badge-${t.verdict}" style="padding:0.1rem 0.4rem; font-size:0.75rem">${t.verdict}</span>
                  </div>
                `).join('')}
              </div>
            </div>
          `;
        }
      }

      content += `
        <div style="margin-top:1.5rem">
          <a href="#/" class="btn-primary" style="text-decoration:none; margin-right:0.5rem">&larr; กลับหน้ารวมโจทย์</a>
        </div>
      `;

      detailsContainer.innerHTML = content;

      const resubmitBtn = document.getElementById('btn-resubmit');
      if (resubmitBtn) {
        resubmitBtn.onclick = () => {
          window.location.hash = '#/';
        };
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

// Route 4: My Submissions
async function renderMySubmissions() {
  try {
    const list = await api('/api/me/submissions');
    app.innerHTML = `
      <div class="card">
        <h2 style="margin-top:0">ประวัติการส่งของคุณ</h2>
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

// Route 5: Admin Dashboard
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
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function route() {
  const hash = location.hash || '#/';
  if (hash.startsWith('#/p/')) {
    renderProblemSolve(hash.slice(4));
  } else if (hash.startsWith('#/s/')) {
    const id = Number(hash.slice(4));
    renderSubmissionResult(id);
  } else if (hash === '#/me') {
    renderMySubmissions();
  } else if (hash === '#/admin') {
    renderAdmin();
  } else {
    renderProblemList();
  }
}

window.addEventListener('hashchange', route);
route();
