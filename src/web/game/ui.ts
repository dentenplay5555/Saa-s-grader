import { DIR_NAME, GameMap, Judgement, Level, RunFrame, judgeLevel, parseMap } from './engine.js';
import { LEVELS, findLevel } from './levels.js';

let timer: number | undefined;

/** Called by the router on every navigation so an old replay can never keep ticking in the background. */
export function stopGame() {
  if (timer !== undefined) {
    clearInterval(timer);
    timer = undefined;
  }
}

function esc(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

// ---- progress (per device; localStorage may be unavailable, so every access is guarded) ----
const STARS_KEY = 'dsa_game_stars_v1';
const draftKey = (id: string) => `dsa_game_code_v1_${id}`;

export function loadStars(): Record<string, number> {
  try {
    const raw = localStorage.getItem(STARS_KEY);
    const o = raw ? JSON.parse(raw) : {};
    return o && typeof o === 'object' ? o : {};
  } catch {
    return {};
  }
}

function saveStars(id: string, n: number) {
  try {
    const cur = loadStars();
    if ((cur[id] ?? 0) < n) {
      cur[id] = n;
      localStorage.setItem(STARS_KEY, JSON.stringify(cur));
    }
  } catch {
    /* progress just won't persist */
  }
}

function loadDraft(id: string): string | null {
  try { return localStorage.getItem(draftKey(id)); } catch { return null; }
}
function saveDraft(id: string, code: string) {
  try { localStorage.setItem(draftKey(id), code); } catch { /* ignore */ }
}

const starText = (n: number) => '★'.repeat(n) + '☆'.repeat(3 - n);

function ensureStyles() {
  if (document.getElementById('gm-styles')) return;
  const st = document.createElement('style');
  st.id = 'gm-styles';
  st.textContent = `
  .gm-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:1rem}
  .gm-card{display:block;text-decoration:none;color:var(--text);background:var(--card-bg);border:1px solid var(--border);border-radius:10px;padding:1rem}
  .gm-card:hover,.gm-card:focus-visible{border-color:var(--info);background:var(--card-hover)}
  .gm-card h3{margin:0 0 .35rem 0}
  .gm-card p{margin:0 0 .5rem 0;color:var(--text-muted);font-size:.88rem}
  .gm-stars{color:var(--warning);letter-spacing:.1em;font-size:1.05rem}
  .gm-layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:1.25rem;align-items:start}
  @media (max-width:820px){.gm-layout{grid-template-columns:1fr}}
  .gm-panel{background:var(--card-bg);border:1px solid var(--border);border-radius:10px;padding:1rem}
  .gm-learn{border-left:4px solid var(--accent);padding:.5rem .8rem;background:var(--card-bg);border-radius:0 8px 8px 0;margin:.75rem 0;font-size:.92rem}
  .gm-board{display:grid;gap:3px;justify-content:center;margin:.5rem auto;--cell:min(52px,calc((100vw - 80px) / var(--cols)))}
  .gm-cell{width:var(--cell);height:var(--cell);border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:calc(var(--cell) * .55);position:relative;background:#1f2a37;border:1px solid #2f3b4a}
  .gm-wall{background:repeating-linear-gradient(45deg,#141a22,#141a22 5px,#0a0d12 5px,#0a0d12 10px);border-color:#2a323d}
  .gm-goal{background:rgba(63,185,80,.2);border-color:var(--success)}
  .gm-robot{background:rgba(88,166,255,.25);border-color:var(--info)}
  .gm-crash{background:rgba(218,54,51,.35);border-color:var(--danger)}
  .gm-arrow{position:absolute;right:2px;bottom:-1px;font-size:calc(var(--cell) * .32);color:#fff;line-height:1}
  .gm-tabs,.gm-chips{display:flex;gap:.4rem;flex-wrap:wrap;margin:.4rem 0}
  .gm-tabs button,.gm-chips button{padding:.25rem .65rem;border-radius:999px;border:1px solid var(--border);background:var(--bg);color:var(--text);cursor:pointer;font-family:inherit;font-size:.82rem}
  .gm-tabs button[aria-pressed=true]{border-color:var(--info);background:rgba(88,166,255,.18)}
  .gm-ok{border-color:var(--success)!important}.gm-bad{border-color:var(--danger)!important}
  .gm-editor{width:100%;min-height:230px;resize:vertical;font-family:'JetBrains Mono',monospace;font-size:.92rem;line-height:1.5;padding:.7rem;border-radius:8px;border:1px solid var(--border);background:var(--bg);color:var(--text);tab-size:2}
  .gm-btns{display:flex;gap:.5rem;flex-wrap:wrap;margin:.6rem 0;align-items:center}
  .gm-btns button{padding:.45rem .85rem;border-radius:6px;border:1px solid var(--border);background:var(--card-bg);color:var(--text);cursor:pointer;font-family:inherit}
  .gm-btns button.gm-primary{background:var(--primary);border-color:var(--primary);color:#fff}
  .gm-btns button:hover:not(:disabled){border-color:var(--info)}
  .gm-btns button:disabled{opacity:.45;cursor:default}
  .gm-note{margin:.6rem 0;padding:.6rem .9rem;border-left:4px solid var(--info);background:var(--bg);border-radius:0 8px 8px 0;min-height:2.6rem;font-size:.92rem}
  .gm-error{color:#ff7b72;min-height:1.2em;font-size:.9rem;white-space:pre-wrap}
  .gm-banner{margin-top:.75rem;padding:.8rem 1rem;border-radius:8px;border:1px solid var(--border)}
  .gm-banner.gm-pass{border-color:var(--success);background:rgba(63,185,80,.12)}
  .gm-banner.gm-fail{border-color:var(--danger);background:rgba(218,54,51,.1)}
  .gm-ref code{background:var(--bg);padding:.05rem .3rem;border-radius:4px}
  .gm-pre{background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:.7rem;overflow-x:auto;font-family:'JetBrains Mono',monospace;font-size:.88rem}
  `;
  document.head.appendChild(st);
}

export function renderGame(app: HTMLElement, id?: string) {
  stopGame();
  ensureStyles();
  if (!id) return renderIndex(app);
  const level = findLevel(id);
  if (!level) {
    app.innerHTML = `<div class="card"><p>ไม่พบด่านนี้</p><a href="#/game">&larr; กลับ</a></div>`;
    return;
  }
  renderLevel(app, level);
}

function renderIndex(app: HTMLElement) {
  const stars = loadStars();
  const total = LEVELS.reduce((s, l) => s + (stars[l.id] ?? 0), 0);
  app.innerHTML = `
    <h1>🎮 Code Robot — เขียนโค้ดสั่งหุ่นยนต์</h1>
    <p style="color:var(--text-muted)">เขียนโปรแกรมสั้นๆ พาหุ่นยนต์ไปที่ธง ด่านแรกๆ ใช้แค่เดินกับเลี้ยว ด่านหลังๆ จะได้ใช้ลูปและเงื่อนไขซึ่งเป็นแกนของอัลกอริทึม คะแนนรวมของคุณ: <b class="gm-stars">${total} / ${LEVELS.length * 3} ★</b></p>
    <div class="gm-grid">
      ${LEVELS.map(l => `<a class="gm-card" href="#/game/${esc(l.id)}"><h3>${esc(l.title)}</h3><p>${esc(l.learn)}</p><div class="gm-stars" aria-label="ได้ ${stars[l.id] ?? 0} จาก 3 ดาว">${starText(stars[l.id] ?? 0)}</div></a>`).join('')}
    </div>
    <p style="color:var(--text-muted);font-size:.85rem;margin-top:1rem">คะแนนดาวเก็บไว้ในเบราว์เซอร์เครื่องนี้ (ไม่ถูกส่งขึ้นเซิร์ฟเวอร์) ถ้าล้างข้อมูลเบราว์เซอร์หรือเปลี่ยนเครื่อง คะแนนจะหายไป</p>`;
}

function renderLevel(app: HTMLElement, level: Level) {
  const maps: GameMap[] = level.maps.map(parseMap);
  const idxInLevels = LEVELS.indexOf(level);
  const next = LEVELS[idxInLevels + 1];

  let selected = 0;
  let judge: Extract<Judgement, { ok: true }> | null = null;
  let srcLines: string[] = [];
  let frames: RunFrame[] | null = null;
  let idx = 0;
  let dirty = true;
  let failedRuns = 0;
  let passedOnce = (loadStars()[level.id] ?? 0) > 0;

  app.innerHTML = `
    <a href="#/game" style="color:var(--text-muted);text-decoration:none">&larr; ด่านทั้งหมด</a>
    <h1 style="margin:.5rem 0">${esc(level.title)}</h1>
    <p>${esc(level.story)}</p>
    <div class="gm-learn">📘 <b>แนวคิด:</b> ${esc(level.learn)}</div>
    <div class="gm-layout">
      <div class="gm-panel">
        ${maps.length > 1 ? `<div class="gm-tabs" role="group" aria-label="เลือกแผนที่">${maps.map((_, i) => `<button type="button" data-map="${i}" aria-pressed="${i === 0}">แผนที่ ${i + 1}</button>`).join('')}</div>` : ''}
        <div id="gm-board" class="gm-board" role="img" aria-label="แผนที่เกม"></div>
        <div class="gm-chips" id="gm-chips" aria-label="ผลแต่ละแผนที่"></div>
        <div class="gm-note" id="gm-note" aria-live="polite"></div>
        <div id="gm-status" style="color:var(--text-muted);font-size:.85rem"></div>
      </div>
      <div class="gm-panel">
        <label for="gm-code" style="font-weight:600">โปรแกรมของคุณ</label>
        <textarea id="gm-code" class="gm-editor" spellcheck="false" autocomplete="off" autocapitalize="off" aria-describedby="gm-error"></textarea>
        <div class="gm-error" id="gm-error" role="alert"></div>
        <div class="gm-btns">
          <button type="button" id="gm-run" class="gm-primary" title="Ctrl+Enter">▶ รันโปรแกรม</button>
          <button type="button" id="gm-step">⏭ ทีละขั้น</button>
          <button type="button" id="gm-reset">↺ เริ่มใหม่</button>
          <label style="font-size:.85rem;display:flex;gap:.3rem;align-items:center">ความเร็ว
            <select id="gm-speed" style="padding:.3rem;border-radius:6px;background:var(--bg);color:var(--text);border:1px solid var(--border)"><option value="700">ช้า</option><option value="350" selected>ปกติ</option><option value="150">เร็ว</option></select>
          </label>
        </div>
        <details class="gm-ref"><summary>📖 คำสั่งที่ใช้ได้</summary>
          <ul style="margin:.4rem 0;padding-left:1.2rem;font-size:.9rem;line-height:1.7">
            <li><code>forward</code> เดินหน้า 1 ช่อง (ชนกำแพงคือแพ้)</li>
            <li><code>left</code> / <code>right</code> เลี้ยวซ้าย/ขวา อยู่กับที่</li>
            <li><code>repeat 3 { … }</code> ทำซ้ำ 3 ครั้ง</li>
            <li><code>while เงื่อนไข { … }</code> ทำซ้ำตราบที่เงื่อนไขจริง</li>
            <li><code>if เงื่อนไข { … } else { … }</code> เลือกทำอย่างใดอย่างหนึ่ง</li>
            <li>เงื่อนไข: <code>front_clear</code> ข้างหน้าเดินได้ • <code>front_blocked</code> ข้างหน้าตัน • <code>on_goal</code> อยู่ที่ธง • <code>not_goal</code> ยังไม่ถึงธง</li>
            <li>บรรทัดที่ขึ้นต้นด้วย <code>#</code> หรือ <code>//</code> เป็นหมายเหตุ</li>
          </ul>
        </details>
        <details class="gm-ref"><summary>💡 คำใบ้</summary><p style="font-size:.9rem">${esc(level.hint)}</p></details>
        <details class="gm-ref" id="gm-sol-wrap"><summary id="gm-sol-sum">🔒 เฉลย (ปลดล็อกหลังลองผิด 3 ครั้ง หรือผ่านด่านแล้ว)</summary><pre class="gm-pre" id="gm-sol"></pre></details>
        <div id="gm-banner" aria-live="polite"></div>
      </div>
    </div>`;

  const $ = <T extends HTMLElement>(sel: string) => app.querySelector<T>(sel)!;
  const board = $('#gm-board');
  const note = $('#gm-note');
  const status = $('#gm-status');
  const chips = $('#gm-chips');
  const code = $<HTMLTextAreaElement>('#gm-code');
  const errEl = $('#gm-error');
  const banner = $('#gm-banner');
  const speed = $<HTMLSelectElement>('#gm-speed');
  const runBtn = $<HTMLButtonElement>('#gm-run');
  const stepBtn = $<HTMLButtonElement>('#gm-step');

  code.value = loadDraft(level.id) ?? level.starter;

  function unlockSolution() {
    if (!(passedOnce || failedRuns >= 3)) return;
    $('#gm-sol-sum').textContent = '🔓 เฉลย (ลองทำความเข้าใจ แล้วพิมพ์เองอีกครั้งนะ)';
    $('#gm-sol').textContent = level.solution;
  }
  unlockSolution();

  function draw() {
    const m = maps[selected];
    const f: RunFrame | null = frames ? frames[idx] : null;
    const rx = f ? f.x : m.start.x;
    const ry = f ? f.y : m.start.y;
    const rd = f ? f.dir : level.startDir;
    const crashed = !!(frames && judge && judge.verdicts[selected].outcome === 'crash' && idx === frames.length - 1);
    board.style.gridTemplateColumns = `repeat(${m.w}, var(--cell))`;
    board.style.setProperty('--cols', String(m.w));
    let html = '';
    for (let y = 0; y < m.h; y++) {
      for (let x = 0; x < m.w; x++) {
        const c = m.cells[y][x];
        const isRobot = x === rx && y === ry;
        let cls = 'gm-cell';
        let inner = '';
        if (c === '#') cls += ' gm-wall';
        if (c === 'G') { cls += ' gm-goal'; inner = '🏁'; }
        if (isRobot) {
          cls += crashed ? ' gm-crash' : ' gm-robot';
          inner = `${crashed ? '💥' : '🤖'}<span class="gm-arrow">${['▲', '▶', '▼', '◀'][rd]}</span>`;
        }
        html += `<div class="${cls}">${inner}</div>`;
      }
    }
    board.innerHTML = html;
    board.setAttribute('aria-label', `แผนที่ ${selected + 1} หุ่นยนต์อยู่ที่คอลัมน์ ${rx} แถว ${ry} หันไปทาง${DIR_NAME[rd]}`);
    if (f) {
      const lineTxt = f.line ? ` (บรรทัด ${f.line}: ${srcLines[f.line - 1]?.trim() ?? ''})` : '';
      note.textContent = `${f.note}${lineTxt}`;
      status.textContent = `ขั้นที่ ${idx + 1} / ${frames!.length} • การกระทำสะสม ${f.moves}`;
    } else {
      note.textContent = 'เขียนโปรแกรมทางขวา แล้วกด "รันโปรแกรม"';
      status.textContent = '';
    }
  }

  function drawChips() {
    if (!judge) {
      chips.innerHTML = '';
      return;
    }
    chips.innerHTML = judge.verdicts
      .map((v, i) => `<button type="button" data-chip="${i}" class="${v.outcome === 'win' ? 'gm-ok' : 'gm-bad'}" aria-label="แผนที่ ${i + 1}: ${v.outcome === 'win' ? 'ผ่าน' : 'ไม่ผ่าน'}">${v.outcome === 'win' ? '✅' : '❌'} แผนที่ ${i + 1}</button>`)
      .join('');
  }

  function selectMap(i: number) {
    selected = i;
    app.querySelectorAll<HTMLButtonElement>('[data-map]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.map) === i)));
    stopGame();
    runBtn.textContent = '▶ รันโปรแกรม';
    frames = judge ? judge.verdicts[i].frames : null;
    idx = 0;
    draw();
  }

  function compute(): boolean {
    stopGame();
    const j = judgeLevel(level, code.value);
    if (!j.ok) {
      errEl.textContent = j.error;
      judge = null;
      frames = null;
      idx = 0;
      banner.innerHTML = '';
      drawChips();
      draw();
      return false;
    }
    errEl.textContent = '';
    judge = j;
    srcLines = code.value.split('\n');
    dirty = false;
    const firstFail = j.verdicts.findIndex(v => v.outcome !== 'win');
    selected = firstFail >= 0 ? firstFail : selected;
    app.querySelectorAll<HTMLButtonElement>('[data-map]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.map) === selected)));
    frames = j.verdicts[selected].frames;
    idx = 0;
    banner.innerHTML = '';
    drawChips();
    draw();
    return true;
  }

  function showResult() {
    if (!judge) return;
    if (judge.passed) {
      saveStars(level.id, judge.stars);
      passedOnce = true;
      unlockSolution();
      const tip = judge.stars === 3 ? 'คะแนนเต็ม โปรแกรมสั้นกระชับ' : `ลองทำให้สั้นลงเหลือไม่เกิน ${level.par} คำสั่งเพื่อให้ได้ ★★★ (ตอนนี้ ${judge.commandCount} คำสั่ง)`;
      banner.innerHTML = `<div class="gm-banner gm-pass"><b>🎉 ผ่านด่านแล้ว!</b> <span class="gm-stars">${starText(judge.stars)}</span><br>${esc(tip)}<br>${next ? `<a href="#/game/${esc(next.id)}" style="color:var(--info)">ด่านต่อไป: ${esc(next.title)} &rarr;</a>` : '<a href="#/game" style="color:var(--info)">ครบทุกด่านแล้ว! กลับหน้าด่านทั้งหมด</a>'}</div>`;
    } else {
      failedRuns++;
      unlockSolution();
      const failIdx = judge.verdicts.findIndex(v => v.outcome !== 'win');
      const v = judge.verdicts[failIdx];
      const others = level.maps.length > 1 ? ` (แผนที่ที่ผ่านแล้ว ${judge.verdicts.filter(x => x.outcome === 'win').length}/${level.maps.length}: โปรแกรมต้องใช้ได้ทุกแผนที่)` : '';
      banner.innerHTML = `<div class="gm-banner gm-fail"><b>ยังไม่ผ่าน</b> — แผนที่ ${failIdx + 1}: ${esc(v.message)}${esc(others)}</div>`;
    }
  }

  function play() {
    if (!frames) return;
    const n = frames.length;
    // very long runs (e.g. an endless loop = 2000 frames) would take minutes to replay: show the start, then jump to the end
    const order: number[] = n > 120 ? [...Array.from({ length: 60 }, (_, i) => i), n - 1] : Array.from({ length: n }, (_, i) => i);
    let k = 0;
    idx = 0;
    draw();
    runBtn.textContent = '⏸ หยุด';
    timer = window.setInterval(() => {
      if (!frames || k >= order.length - 1) {
        stopGame();
        runBtn.textContent = '▶ รันโปรแกรม';
        showResult();
        return;
      }
      k++;
      idx = order[k];
      draw();
      if (n > 120 && k === order.length - 1) note.textContent += ' — (โปรแกรมทำงานยาวมาก จึงข้ามไปที่ผลลัพธ์ ใช้ปุ่ม "ทีละขั้น" ถ้าอยากดูทุกขั้น)';
    }, Number(speed.value));
  }

  runBtn.addEventListener('click', () => {
    if (timer !== undefined) {
      stopGame();
      runBtn.textContent = '▶ รันโปรแกรม';
      return;
    }
    saveDraft(level.id, code.value);
    if (dirty || !judge) {
      if (!compute()) return;
    }
    play();
  });

  stepBtn.addEventListener('click', () => {
    stopGame();
    runBtn.textContent = '▶ รันโปรแกรม';
    if (dirty || !judge) {
      if (!compute()) return;
    }
    if (!frames) return;
    if (idx < frames.length - 1) {
      idx++;
      draw();
      if (idx === frames.length - 1) showResult();
    }
  });

  $('#gm-reset').addEventListener('click', () => {
    stopGame();
    runBtn.textContent = '▶ รันโปรแกรม';
    frames = null;
    idx = 0;
    errEl.textContent = '';
    banner.innerHTML = '';
    draw();
  });

  code.addEventListener('input', () => {
    dirty = true;
    saveDraft(level.id, code.value);
  });
  code.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      runBtn.click();
    }
  });
  app.querySelectorAll<HTMLButtonElement>('[data-map]').forEach(b => b.addEventListener('click', () => selectMap(Number(b.dataset.map))));
  chips.addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-chip]');
    if (b) selectMap(Number(b.dataset.chip));
  });

  draw();
}
