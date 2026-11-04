import { ALGORITHMS, Frame, GROWTH_CURVES, Role, View, findAlgo, formatDuration, measureSearch } from './engines.js';

let timer: number | undefined;

/** Called by the router on every navigation so an old animation can never keep ticking in the background. */
export function stopVisualizer() {
  if (timer !== undefined) {
    clearInterval(timer);
    timer = undefined;
  }
}

function esc(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

const ROLE_TEXT: Partial<Record<Role, string>> = {
  compare: 'เทียบ', swap: 'สลับ', sorted: '✓ เรียงแล้ว', found: 'เจอ!', low: 'low', high: 'high', mid: 'mid',
  range: 'ในช่วง', active: '●', top: 'top', front: 'front', back: 'back',
};

const LEGEND_TEXT: Partial<Record<Role, string>> = {
  compare: 'กำลังเทียบ', swap: 'กำลังสลับ', sorted: 'เรียงแล้ว', found: 'เจอ', low: 'ขอบซ้าย (low)', high: 'ขอบขวา (high)',
  mid: 'ตัวกลาง (mid)', range: 'อยู่ในช่วงที่ถาม', active: 'ตัวที่กำลังใช้', top: 'บนสุด (top)', front: 'หน้าแถว (front)', back: 'ท้ายแถว (back)',
};

function ensureStyles() {
  if (document.getElementById('vz-styles')) return;
  const st = document.createElement('style');
  st.id = 'vz-styles';
  st.textContent = `
  .vz-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:1rem}
  .vz-card{display:block;text-decoration:none;color:var(--text);background:var(--card-bg);border:1px solid var(--border);border-radius:10px;padding:1rem}
  .vz-card:hover,.vz-card:focus-visible{border-color:var(--info);background:var(--card-hover)}
  .vz-card h3{margin:0 0 .35rem 0}
  .vz-card p{margin:0;color:var(--text-muted);font-size:.9rem}
  .vz-stage{background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:1rem;overflow-x:auto}
  .vz-view{margin-bottom:1.25rem}
  .vz-label{color:var(--text-muted);font-size:.85rem;margin-bottom:.4rem}
  .vz-row{display:flex;gap:6px;flex-wrap:wrap;min-height:84px;align-items:flex-start}
  .vz-cell-wrap{display:flex;flex-direction:column;align-items:center;width:52px}
  .vz-idx{font-size:.7rem;color:var(--text-muted)}
  .vz-cell{width:48px;height:48px;display:flex;align-items:center;justify-content:center;border:2px solid var(--border);border-radius:8px;font-family:'JetBrains Mono',monospace;font-weight:600;background:var(--card-bg)}
  .vz-tag{font-size:.68rem;color:var(--text-muted);min-height:1em;text-align:center;line-height:1.1}
  .vz-empty{color:var(--text-muted);padding:1rem 0}
  .vz-compare{border-color:var(--info);background:rgba(88,166,255,.18)}
  .vz-swap{border-color:var(--warning);background:rgba(210,153,34,.25);border-style:dashed}
  .vz-sorted{border-color:var(--success);background:rgba(63,185,80,.14)}
  .vz-found{border-color:var(--success);background:rgba(63,185,80,.45)}
  .vz-low,.vz-high{border-color:var(--accent);background:rgba(163,113,247,.15)}
  .vz-mid{border-color:var(--info);background:rgba(88,166,255,.3);border-width:3px}
  .vz-range{border-color:var(--accent);background:rgba(163,113,247,.3)}
  .vz-active,.vz-top,.vz-front,.vz-back{border-color:var(--warning);background:rgba(210,153,34,.2)}
  .vz-dim{opacity:.35}
  .vz-note{margin:.75rem 0;padding:.75rem 1rem;border-left:4px solid var(--info);background:var(--card-bg);border-radius:0 8px 8px 0;min-height:3rem}
  .vz-result{margin-top:.35rem;font-weight:600;color:var(--success)}
  .vz-controls{display:flex;gap:.5rem;flex-wrap:wrap;align-items:center;margin:.75rem 0}
  .vz-controls button,.vz-form button{padding:.45rem .8rem;border-radius:6px;border:1px solid var(--border);background:var(--card-bg);color:var(--text);cursor:pointer;font-family:inherit}
  .vz-controls button:hover:not(:disabled),.vz-form button:hover{border-color:var(--info)}
  .vz-controls button:disabled{opacity:.4;cursor:default}
  .vz-controls input[type=range]{flex:1;min-width:140px}
  .vz-form{display:grid;gap:.6rem;margin:1rem 0}
  .vz-form label{display:grid;gap:.2rem;font-size:.9rem}
  .vz-form input,.vz-form select,.vz-controls select{padding:.45rem .6rem;border-radius:6px;border:1px solid var(--border);background:var(--bg);color:var(--text);font-family:'JetBrains Mono',monospace}
  .vz-form small{color:var(--text-muted)}
  .vz-error{color:#ff7b72;min-height:1.2em}
  .vz-legend{display:flex;gap:.5rem;flex-wrap:wrap;font-size:.78rem;color:var(--text-muted);margin-top:.5rem}
  .vz-legend span{display:inline-flex;align-items:center;gap:.3rem}
  .vz-legend i{display:inline-block;width:14px;height:14px;border-radius:4px;border:2px solid var(--border)}
  .vz-table{width:100%;border-collapse:collapse;margin:.5rem 0 1rem 0;font-size:.9rem}
  .vz-table th,.vz-table td{border-bottom:1px solid var(--border);padding:.4rem .5rem;text-align:right}
  .vz-table th:first-child,.vz-table td:first-child{text-align:left}
  .vz-chart{width:100%;height:auto;background:var(--bg);border:1px solid var(--border);border-radius:10px}
  @media (prefers-reduced-motion: no-preference){.vz-cell{transition:background .15s,border-color .15s}}
  `;
  document.head.appendChild(st);
}

function viewHtml(v: View): string {
  const cells = v.cells
    .map((c, i) => {
      const roles = v.marks[i] ?? [];
      const cls = roles.length ? `vz-${roles[0]}` : '';
      const tag = roles.map(r => ROLE_TEXT[r]).filter(Boolean).join(' ');
      return `<div class="vz-cell-wrap"><div class="vz-idx">${v.indexBase + i}</div><div class="vz-cell ${cls}">${esc(String(c))}</div><div class="vz-tag">${esc(tag)}</div></div>`;
    })
    .join('');
  return `<div class="vz-view"><div class="vz-label">${esc(v.label)}</div><div class="vz-row">${cells || '<span class="vz-empty">(ว่าง)</span>'}</div></div>`;
}

function legendHtml(frames: Frame[]): string {
  const used = new Set<Role>();
  for (const f of frames) for (const v of f.views) for (const k of Object.keys(v.marks)) for (const r of v.marks[Number(k)]) used.add(r);
  const items = [...used].filter(r => r !== 'dim').map(r => `<span><i class="vz-cell vz-${r}" style="width:14px;height:14px"></i>${esc(LEGEND_TEXT[r] ?? r)}</span>`);
  if (used.has('dim')) items.push('<span><i class="vz-cell vz-dim" style="width:14px;height:14px"></i>ตัดทิ้งแล้ว</span>');
  return items.join('');
}

export function renderVisualizer(app: HTMLElement, id?: string) {
  stopVisualizer();
  ensureStyles();
  if (!id) return renderIndex(app);
  if (id === 'growth') return renderGrowth(app);
  return renderPlayer(app, id);
}

function renderIndex(app: HTMLElement) {
  app.innerHTML = `
    <h1>🎬 ตัวจำลองการทำงาน (Visualizer)</h1>
    <p style="color:var(--text-muted)">ดูทีละขั้นว่าอัลกอริทึมและโครงสร้างข้อมูลทำงานอย่างไร ใส่ข้อมูลของตัวเองแล้วกดเดินทีละขั้นหรือเล่นอัตโนมัติได้</p>
    <div class="vz-grid">
      ${ALGORITHMS.map(a => `<a class="vz-card" href="#/visualizer/${esc(a.id)}"><h3>${esc(a.title)}</h3><p>${esc(a.summary)}</p></a>`).join('')}
      <a class="vz-card" href="#/visualizer/growth"><h3>📈 อัตราการเติบโต (Big-O)</h3><p>เปรียบเทียบ O(1), O(log n), O(n), O(n log n), O(n²) ด้วยกราฟและตัวเลขจริง</p></a>
    </div>`;
}

function renderPlayer(app: HTMLElement, id: string) {
  const algo = findAlgo(id);
  if (!algo) {
    app.innerHTML = `<div class="card"><p>ไม่พบตัวจำลองนี้</p><a href="#/visualizer">&larr; กลับ</a></div>`;
    return;
  }
  let frames: Frame[] = [];
  let idx = 0;

  app.innerHTML = `
    <a href="#/visualizer" style="color:var(--text-muted);text-decoration:none">&larr; ตัวจำลองทั้งหมด</a>
    <h1 style="margin:.5rem 0">${esc(algo.title)}</h1>
    <p>${esc(algo.summary)}</p>
    <p style="color:var(--text-muted);font-size:.9rem">⏱️ ${esc(algo.complexity)}</p>
    <form class="vz-form" id="vz-form">
      ${algo.fields.map(f => `<label>${esc(f.label)}<input name="${f.key}" value="${esc(f.default)}" autocomplete="off" spellcheck="false" /><small>${esc(f.hint)}</small></label>`).join('')}
      <div style="display:flex;gap:.5rem;flex-wrap:wrap">
        <button type="submit">▶ ใช้ข้อมูลนี้</button>
        ${algo.fields.some(f => f.key === 'values') ? '<button type="button" id="vz-random">🎲 สุ่มข้อมูล</button>' : ''}
      </div>
      <div class="vz-error" id="vz-error" role="alert"></div>
    </form>
    <div id="vz-root" tabindex="0" aria-label="ตัวจำลอง ใช้ลูกศรซ้ายขวาเพื่อเดินทีละขั้น">
      <div class="vz-stage" id="vz-stage"></div>
      <div class="vz-legend" id="vz-legend"></div>
      <div class="vz-note" id="vz-note" aria-live="polite"></div>
      <div class="vz-controls">
        <button type="button" id="vz-first" title="กลับไปจุดเริ่มต้น">⏮</button>
        <button type="button" id="vz-prev" title="ถอยหลัง 1 ขั้น">◀</button>
        <button type="button" id="vz-play" title="เล่น/หยุด">▶ เล่น</button>
        <button type="button" id="vz-next" title="เดินหน้า 1 ขั้น">▶|</button>
        <input type="range" id="vz-slider" min="0" max="0" value="0" aria-label="ขั้นที่" />
        <label style="display:flex;gap:.35rem;align-items:center;font-size:.85rem">ความเร็ว
          <select id="vz-speed"><option value="1200">ช้า</option><option value="700" selected>ปกติ</option><option value="300">เร็ว</option><option value="120">เร็วมาก</option></select>
        </label>
      </div>
      <div id="vz-status" style="color:var(--text-muted);font-size:.9rem"></div>
    </div>`;

  const $ = <T extends HTMLElement>(sel: string) => app.querySelector<T>(sel)!;
  const form = $<HTMLFormElement>('#vz-form');
  const stage = $('#vz-stage');
  const note = $('#vz-note');
  const status = $('#vz-status');
  const slider = $<HTMLInputElement>('#vz-slider');
  const playBtn = $<HTMLButtonElement>('#vz-play');
  const prevBtn = $<HTMLButtonElement>('#vz-prev');
  const nextBtn = $<HTMLButtonElement>('#vz-next');
  const firstBtn = $<HTMLButtonElement>('#vz-first');
  const speed = $<HTMLSelectElement>('#vz-speed');
  const errEl = $('#vz-error');

  const playing = () => timer !== undefined;

  function pause() {
    stopVisualizer();
    playBtn.textContent = '▶ เล่น';
  }

  function draw() {
    const f = frames[idx];
    stage.innerHTML = f.views.map(viewHtml).join('');
    note.innerHTML = `${esc(f.note)}${f.result ? `<div class="vz-result">${esc(f.result)}</div>` : ''}`;
    status.textContent = `ขั้นที่ ${idx + 1} / ${frames.length} • จำนวนการทำงานสะสม: ${f.ops}`;
    slider.max = String(frames.length - 1);
    slider.value = String(idx);
    firstBtn.disabled = prevBtn.disabled = idx === 0;
    nextBtn.disabled = idx >= frames.length - 1;
  }

  function load() {
    const inputs: Record<string, string> = {};
    for (const f of algo!.fields) inputs[f.key] = (form.elements.namedItem(f.key) as HTMLInputElement).value;
    const res = algo!.run(inputs);
    if (!res.ok) {
      errEl.textContent = res.error;
      return;
    }
    errEl.textContent = '';
    pause();
    frames = res.value;
    idx = 0;
    $('#vz-legend').innerHTML = legendHtml(frames);
    draw();
  }

  function play() {
    if (idx >= frames.length - 1) idx = 0;
    playBtn.textContent = '⏸ หยุด';
    draw();
    timer = window.setInterval(() => {
      if (idx >= frames.length - 1) return pause();
      idx++;
      draw();
      if (idx >= frames.length - 1) pause();
    }, Number(speed.value));
  }

  form.addEventListener('submit', e => {
    e.preventDefault();
    load();
  });
  app.querySelector('#vz-random')?.addEventListener('click', () => {
    const input = form.elements.namedItem('values') as HTMLInputElement;
    input.value = Array.from({ length: 8 }, () => 1 + Math.floor(Math.random() * 99)).join(' ');
    load();
  });
  playBtn.addEventListener('click', () => (playing() ? pause() : play()));
  nextBtn.addEventListener('click', () => { pause(); if (idx < frames.length - 1) { idx++; draw(); } });
  prevBtn.addEventListener('click', () => { pause(); if (idx > 0) { idx--; draw(); } });
  firstBtn.addEventListener('click', () => { pause(); idx = 0; draw(); });
  slider.addEventListener('input', () => { pause(); idx = Number(slider.value); draw(); });
  speed.addEventListener('change', () => { if (playing()) { pause(); play(); } });
  $('#vz-root').addEventListener('keydown', e => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'BUTTON') return;
    if (e.key === 'ArrowRight') { e.preventDefault(); nextBtn.click(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); prevBtn.click(); }
    else if (e.key === ' ') { e.preventDefault(); playBtn.click(); }
  });

  load();
}

function fmtBig(n: number): string {
  if (n >= 1e15) return n.toExponential(1);
  return Math.round(n).toLocaleString('en-US');
}

function renderGrowth(app: HTMLElement) {
  const OPS_PER_SEC = 1e8;
  const SIZES = [10, 100, 1000, 100000, 1000000];
  const COLORS = ['#8b949e', '#3fb950', '#58a6ff', '#d29922', '#ff7b72'];
  const DASH = ['2 4', '', '8 3', '4 3 1 3', ''];

  app.innerHTML = `
    <a href="#/visualizer" style="color:var(--text-muted);text-decoration:none">&larr; ตัวจำลองทั้งหมด</a>
    <h1 style="margin:.5rem 0">📈 อัตราการเติบโต (Big-O)</h1>
    <p>จำนวนขั้นตอนที่อัลกอริทึมต้องทำเมื่อข้อมูลมี n ตัว กราฟนี้ตัดแกนตั้งที่ค่าของ n log n เพื่อให้เห็นว่า O(n²) พุ่งทะลุไปไกลแค่ไหน</p>
    <label style="display:flex;gap:.6rem;align-items:center;margin:.75rem 0">n สูงสุดในกราฟ: <input id="gr-n" type="range" min="10" max="200" value="60" /> <b id="gr-nval">60</b></label>
    <svg id="gr-chart" class="vz-chart" viewBox="0 0 640 340" role="img" aria-label="กราฟเปรียบเทียบอัตราการเติบโตของฟังก์ชัน"></svg>
    <h2 style="margin-top:1.5rem">ถ้าข้อมูลมี n ตัว ต้องทำกี่ขั้น และใช้เวลาเท่าไร?</h2>
    <p style="color:var(--text-muted);font-size:.9rem">สมมติเครื่องทำได้ ${fmtBig(OPS_PER_SEC)} ขั้นต่อวินาที (ประมาณการคร่าวๆ ไม่ใช่ค่าที่วัดจริง) ข้อสอบ สอวน./TOI ส่วนใหญ่จำกัดเวลาราว 1–2 วินาที</p>
    <label>เลือก n: <select id="gr-size">${SIZES.map(n => `<option value="${n}" ${n === 100000 ? 'selected' : ''}>${n.toLocaleString('en-US')}</option>`).join('')}</select></label>
    <table class="vz-table" id="gr-table"></table>
    <h2 style="margin-top:1.5rem">วัดจริง: ค้นหาแบบเรียงตัว (Linear) เทียบกับ Binary Search</h2>
    <p style="color:var(--text-muted);font-size:.9rem">นับจำนวนการเปรียบเทียบกรณีแย่สุด (ไม่พบค่า) จากฟังก์ชันนับจริงชุดเดียวกับที่ตัวจำลอง Binary Search ใช้</p>
    <table class="vz-table"><tr><th>n</th><th>Linear</th><th>Binary</th><th>Linear ช้ากว่า</th></tr>
      ${SIZES.concat([10000]).sort((a, b) => a - b).map(n => { const m = measureSearch(n); return `<tr><td>${n.toLocaleString('en-US')}</td><td>${fmtBig(m.linear)}</td><td>${fmtBig(m.binary)}</td><td>${Math.round(m.linear / m.binary).toLocaleString('en-US')} เท่า</td></tr>`; }).join('')}
    </table>`;

  const slider = app.querySelector<HTMLInputElement>('#gr-n')!;
  const nval = app.querySelector('#gr-nval')!;
  const svg = app.querySelector<SVGSVGElement>('#gr-chart')!;
  const sizeSel = app.querySelector<HTMLSelectElement>('#gr-size')!;
  const table = app.querySelector('#gr-table')!;

  function drawChart() {
    const N = Number(slider.value);
    nval.textContent = String(N);
    const W = 640, H = 340, L = 44, R = 96, T = 12, B = 30;
    const pw = W - L - R, ph = H - T - B;
    const ymax = GROWTH_CURVES[3].f(N) * 1.05;
    const x = (n: number) => L + ((n - 1) / (N - 1)) * pw;
    const yRaw = (v: number) => T + ph - (v / ymax) * ph; // may leave the plot area; clipPath cuts it
    const yClamp = (v: number) => Math.max(T + 8, Math.min(T + ph, yRaw(v)));
    let g = `<defs><clipPath id="gr-clip"><rect x="${L}" y="${T}" width="${pw}" height="${ph}"/></clipPath></defs>`;
    g += `<line x1="${L}" y1="${T + ph}" x2="${L + pw}" y2="${T + ph}" stroke="#30363d"/><line x1="${L}" y1="${T}" x2="${L}" y2="${T + ph}" stroke="#30363d"/>`;
    g += `<text x="${L + pw / 2}" y="${H - 6}" fill="#8b949e" font-size="11" text-anchor="middle">n (จำนวนข้อมูล)</text>`;
    g += `<text x="6" y="${T + 10}" fill="#8b949e" font-size="11">ขั้นตอน</text>`;
    GROWTH_CURVES.forEach((c, i) => {
      const pts: string[] = [];
      for (let n = 1; n <= N; n++) pts.push(`${x(n).toFixed(1)},${yRaw(c.f(n)).toFixed(1)}`);
      g += `<polyline clip-path="url(#gr-clip)" fill="none" stroke="${COLORS[i]}" stroke-width="2.5" stroke-dasharray="${DASH[i]}" points="${pts.join(' ')}"/>`;
    });
    // end-of-line labels: keep them at least 14px apart so they never overlap
    const labels = GROWTH_CURVES.map((c, i) => ({ i, y: yClamp(c.f(N)) })).sort((p, q) => p.y - q.y);
    for (let k = 1; k < labels.length; k++) if (labels[k].y - labels[k - 1].y < 14) labels[k].y = labels[k - 1].y + 14;
    const overflow = labels[labels.length - 1].y - (T + ph);
    if (overflow > 0) for (const l of labels) l.y -= overflow;
    for (const l of labels) g += `<text x="${L + pw + 6}" y="${(l.y + 4).toFixed(1)}" fill="${COLORS[l.i]}" font-size="12">${esc(GROWTH_CURVES[l.i].label)}</text>`;
    svg.innerHTML = g;
  }

  function drawTable() {
    const n = Number(sizeSel.value);
    table.innerHTML = `<tr><th>ความซับซ้อน</th><th>จำนวนขั้น</th><th>เวลาโดยประมาณ</th></tr>` +
      GROWTH_CURVES.map(c => { const ops = c.f(n); return `<tr><td>${esc(c.label)}</td><td>${fmtBig(ops)}</td><td>${esc(formatDuration(ops / OPS_PER_SEC))}</td></tr>`; }).join('');
  }

  slider.addEventListener('input', drawChart);
  sizeSel.addEventListener('change', drawTable);
  drawChart();
  drawTable();
}
