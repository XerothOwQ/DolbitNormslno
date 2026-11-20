import { FFmpeg } from './lib/ffmpeg/index.js';
import { SECTIONS, ALL_PARAMS, DEFAULTS, PRESETS, buildPlan } from './params.js';

const $ = (id) => document.getElementById(id);
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

// ---------- Загрузочный экран ----------
const BOOT = [
  'SHAKAL BIOS (C) 1998 ELEMENTAL DESTRUCTION',
  'MEMORY TEST ........ 640K OK',
  'MOUNTING /DEV/VIDEO  OK',
];
(async () => {
  const el = $('boot');
  for (const line of BOOT) {
    for (const ch of line) { el.textContent += ch; await new Promise((r) => setTimeout(r, 6)); }
    el.textContent += '\n';
  }
})();

// ---------- Состояние ----------
let state = { ...DEFAULTS, ...(store.get('shakal:last') || {}) };
for (const k of Object.keys(state)) if (!(k in DEFAULTS)) delete state[k];
for (const p of ALL_PARAMS) {
  if (p.type === 'select' && !p.options.some((o) => o.v === String(state[p.id]))) state[p.id] = p.def;
}
let activePreset = store.get('shakal:preset') || null;

// ---------- Рендер параметров ----------
const sectionsEl = $('sections');
const controls = {};

SECTIONS.forEach((sec, i) => {
  const win = document.createElement('details');
  win.className = 'win';
  win.open = store.get('shakal:open:' + sec.id) ?? (sec.id === 'video');
  win.addEventListener('toggle', () => store.set('shakal:open:' + sec.id, win.open));
  win.innerHTML = `<summary class="wt">[ 0${i + 3} // ${sec.title} ]</summary>`;
  let pairBox = null;
  for (const p of sec.params) {
    const row = document.createElement('div');
    row.className = 'row';
    let input;
    if (p.type === 'toggle') {
      row.innerHTML = `<label class="toggle"><input type="checkbox"><span class="box"></span><span>${p.label}</span></label>`;
      input = row.querySelector('input');
      input.addEventListener('change', () => setParam(p.id, input.checked));
    } else {
      row.innerHTML = `<label><span class="l">${p.label}</span><b></b></label>`;
      if (p.type === 'select') {
        input = document.createElement('select');
        input.innerHTML = p.options.map((o) => `<option value="${o.v}">${o.l}</option>`).join('');
        input.addEventListener('change', () => setParam(p.id, input.value));
      } else if (p.type === 'range') {
        input = document.createElement('input');
        Object.assign(input, { type: 'range', min: p.min, max: p.max, step: p.step });
        input.addEventListener('input', () => setParam(p.id, +input.value));
      } else {
        input = document.createElement('input');
        Object.assign(input, { type: 'number', min: p.min, max: p.max, inputMode: 'numeric' });
        input.addEventListener('change', () => setParam(p.id, Math.max(p.min, Math.min(p.max, +input.value || p.def))));
      }
      row.appendChild(input);
    }
    // Ширина и высота — в одну строку
    if (p.type === 'number') {
      if (!pairBox) { pairBox = document.createElement('div'); pairBox.className = 'pair'; win.appendChild(pairBox); }
      pairBox.appendChild(row);
    } else {
      pairBox = null;
      win.appendChild(row);
    }
    controls[p.id] = { p, row, input, val: row.querySelector('b') };
  }
  sectionsEl.appendChild(win);
});

function syncUI() {
  for (const { p, row, input, val } of Object.values(controls)) {
    const v = state[p.id];
    if (p.type === 'toggle') input.checked = !!v;
    else if (String(input.value) !== String(v)) input.value = v;
    if (val) val.textContent = p.fmt ? p.fmt(v) : (p.type === 'range' ? String(v) : '');
    row.hidden = p.show ? !p.show(state) : false;
  }
  document.querySelectorAll('.preset').forEach((b) => b.classList.toggle('on', b.dataset.id === activePreset));
}

function setParam(id, v) {
  const p = controls[id].p;
  if (p.type === 'select') v = String(v);
  state[id] = v;
  activePreset = 'custom-edit';
  saveState();
  syncUI();
}

function saveState() {
  store.set('shakal:last', state);
  store.set('shakal:preset', activePreset);
}

// ---------- Пресеты ----------
const presetsEl = $('presets');
PRESETS.forEach((pr) => {
  const b = document.createElement('button');
  b.className = 'preset';
  b.dataset.id = pr.id;
  b.innerHTML = `${pr.name}<small>${pr.sub}</small>`;
  b.addEventListener('click', () => applyPreset(pr.id));
  presetsEl.appendChild(b);
});

function applyPreset(id) {
  const pr = PRESETS.find((x) => x.id === id);
  const values = id === 'custom' ? store.get('shakal:custom') : pr.v;
  if (!values) { flash($('saveCustom'), '> СНАЧАЛА НАСТРОЙ И СОХРАНИ'); return; }
  state = { ...DEFAULTS, ...values };
  for (const p of ALL_PARAMS) if (p.type === 'select') state[p.id] = String(state[p.id]);
  activePreset = id;
  saveState();
  syncUI();
}

$('saveCustom').addEventListener('click', () => {
  store.set('shakal:custom', state);
  activePreset = 'custom';
  saveState();
  syncUI();
  flash($('saveCustom'), '> СОХРАНЕНО В CUSTOM');
});

function flash(btn, text) {
  const old = btn.textContent;
  btn.textContent = text;
  setTimeout(() => { btn.textContent = old; }, 1600);
}

syncUI();

// ---------- ffmpeg ----------
let ffmpeg = null;
let wasmBlobURL = null;
let enginePromise = null;
let logSink = null; // куда сейчас идёт лог (для проб)

function log(line) {
  const el = $('log');
  el.textContent += line + '\n';
  if (el.textContent.length > 30000) el.textContent = el.textContent.slice(-20000);
  el.scrollTop = el.scrollHeight;
}
const engine = (t) => { $('engine').textContent = '> ДВИЖОК: ' + t; };

async function fetchWasm() {
  const res = await fetch('lib/core/ffmpeg-core.wasm');
  const total = +res.headers.get('Content-Length') || 0;
  const reader = res.body.getReader();
  const chunks = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    engine(`загрузка ${(got / 1048576).toFixed(1)}${total ? '/' + (total / 1048576).toFixed(1) : ''} МБ`);
  }
  return URL.createObjectURL(new Blob(chunks, { type: 'application/wasm' }));
}

let progressHook = null;

function ensureFFmpeg() {
  if (ffmpeg) return Promise.resolve(ffmpeg);
  if (enginePromise) return enginePromise;
  enginePromise = (async () => {
    if (!wasmBlobURL) wasmBlobURL = await fetchWasm();
    engine('запуск…');
    const ff = new FFmpeg();
    ff.on('log', ({ message }) => {
      if (logSink) logSink.push(message);
      log(message);
      const m = message.match(/time=\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
      if (m && progressHook) progressHook((+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]));
    });
    await ff.load({ coreURL: new URL('lib/core/ffmpeg-core.js', location.href).href, wasmURL: wasmBlobURL });
    const font = await (await fetch('fonts/vcr.ttf')).arrayBuffer();
    await ff.writeFile('/vcr.ttf', new Uint8Array(font));
    ffmpeg = ff;
    engine('ГОТОВ');
    return ff;
  })();
  enginePromise.catch((e) => { engine('ОШИБКА ' + e); enginePromise = null; });
  return enginePromise;
}
ensureFFmpeg(); // качаем движок сразу, пока выбираются настройки

// ---------- Выбор видео ----------
let inputFile = null;
let src = null;
let inputWritten = false;

$('file').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  inputFile = f;
  inputWritten = false;
  src = null;
  $('fileInfo').hidden = false;
  $('fileInfo').textContent = `${f.name} // ${(f.size / 1048576).toFixed(1)} МБ // анализ…`;
  $('go').disabled = true;
  try {
    const ff = await ensureFFmpeg();
    await writeInput(ff);
    src = await probe(ff);
    $('fileInfo').textContent = `${f.name}\n${src.w}×${src.h} // ${src.fps ? src.fps.toFixed(0) + ' fps' : '? fps'} // ${src.dur.toFixed(1)} c // ${(f.size / 1048576).toFixed(1)} МБ${src.hasAudio ? '' : ' // без звука'}`;
    $('fileInfo').style.whiteSpace = 'pre-wrap';
    if (src.dur > 65) $('fileInfo').textContent += '\nДЛИННОЕ: будет долго';
    $('go').disabled = false;
  } catch (err) {
    $('fileInfo').textContent = 'ОШИБКА: не удалось прочитать видео (' + (err.message || err) + ')';
  }
});

async function writeInput(ff) {
  if (inputWritten) return;
  await ff.writeFile('in', new Uint8Array(await inputFile.arrayBuffer()));
  inputWritten = true;
}

async function probe(ff) {
  logSink = [];
  await ff.exec(['-hide_banner', '-i', 'in']);
  const text = logSink.join('\n');
  logSink = null;
  const d = text.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  const v = text.match(/Stream #.*Video:.*?(\d{2,5})x(\d{2,5})/);
  const fps = text.match(/Stream #.*Video:.*?([\d.]+) fps/);
  const rot = text.match(/rotation of (-?[\d.]+) degrees/) || text.match(/rotate\s*:\s*(-?\d+)/);
  if (!v) throw new Error('нет видеодорожки');
  let w = +v[1], h = +v[2];
  if (rot && Math.abs(Math.round(+rot[1])) % 180 === 90) [w, h] = [h, w]; // ffmpeg сам поворачивает
  return {
    w, h,
    dur: d ? (+d[1]) * 3600 + (+d[2]) * 60 + parseFloat(d[3]) : 0,
    fps: fps ? parseFloat(fps[1]) : 0,
    hasAudio: /Stream #.*Audio:/.test(text),
  };
}

// ---------- Ухудшение ----------
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function drawBar(frac) {
  const W = Math.max(10, Math.min(30, Math.floor(($('bar').clientWidth || 300) / 10) - 8));
  const n = Math.round(Math.max(0, Math.min(1, frac)) * W);
  $('bar').textContent = '[' + '#'.repeat(n) + '.'.repeat(W - n) + '] ' + String(Math.round(frac * 100)).padStart(3) + '%';
}

let running = false;

$('go').addEventListener('click', async () => {
  if (!inputFile || running) return;
  running = true;
  $('go').disabled = true;
  $('resultWin').hidden = true;
  $('progressWin').hidden = false;
  $('progressWin').scrollIntoView({ behavior: 'smooth', block: 'center' });
  $('eta').textContent = '';
  drawBar(0);
  const t0 = performance.now();
  try {
    const ff = await ensureFFmpeg();
    await writeInput(ff);
    src = await probe(ff); // заодно «прогревает» свежий движок
    const { passes, size } = buildPlan(state, src);
    const totalW = passes.reduce((a, p) => a + p.weight, 0);
    let doneW = 0;
    for (let i = 0; i < passes.length; i++) {
      const pass = passes[i];
      $('stage').textContent = `> ШАГ ${i + 1}/${passes.length}: ${pass.label.toUpperCase()}`;
      progressHook = (t) => {
        const local = pass.dur > 0 ? Math.min(1, t / pass.dur) : 0;
        const frac = (doneW + local * pass.weight) / totalW;
        drawBar(frac);
        const el = (performance.now() - t0) / 1000;
        $('eta').textContent = frac > 0.03 ? `прошло ${fmt(el)} // осталось ~${fmt(el / frac - el)}` : `прошло ${fmt(el)}`;
      };
      log('\n> ffmpeg ' + pass.args.join(' '));
      const code = await ff.exec(['-hide_banner', '-y', ...pass.args]);
      if (code !== 0) throw new Error(`шаг «${pass.label}» упал (код ${code}), смотри лог`);
      for (const f of pass.cleanup || []) await ff.deleteFile(f).catch(() => {});
      doneW += pass.weight;
      drawBar(doneW / totalW);
    }
    progressHook = null;
    const data = await ff.readFile('out.mp4');
    await ff.deleteFile('out.mp4').catch(() => {});
    showResult(data, (performance.now() - t0) / 1000, size);
    $('progressWin').hidden = true;
    // свежий движок на следующий раз (wasm-память сама не освобождается)
    ffmpeg.terminate();
    ffmpeg = null; enginePromise = null; inputWritten = false;
    ensureFFmpeg();
  } catch (err) {
    progressHook = null;
    if (String(err).includes('terminate')) {
      $('stage').textContent = '> ОТМЕНЕНО';
    } else {
      $('stage').textContent = '> ОШИБКА: ' + (err.message || err);
      log(String(err));
      // после падения движок может быть сломан: перезапускаем
      try { ffmpeg && ffmpeg.terminate(); } catch {}
      ffmpeg = null; enginePromise = null; inputWritten = false;
      ensureFFmpeg();
    }
    $('eta').textContent = '';
  }
  running = false;
  $('go').disabled = !inputFile;
});

$('cancel').addEventListener('click', () => {
  if (ffmpeg && running) {
    ffmpeg.terminate();
    ffmpeg = null; enginePromise = null; inputWritten = false;
    ensureFFmpeg();
  }
});

let resultURL = null;
function showResult(data, seconds, size) {
  if (resultURL) URL.revokeObjectURL(resultURL);
  const blob = new Blob([data.buffer], { type: 'video/mp4' });
  resultURL = URL.createObjectURL(blob);
  $('result').src = resultURL;
  $('download').href = resultURL;
  const tag = (PRESETS.find((p) => p.id === activePreset)?.id) || 'custom';
  $('download').download = `${inputFile.name.replace(/\.[^.]+$/, '')}_shakal_${tag}.mp4`;
  $('resultInfo').textContent =
    `${(inputFile.size / 1048576).toFixed(1)} МБ -> ${(blob.size / 1048576).toFixed(2)} МБ // ` +
    `${size.outW}×${size.outH}${size.finW !== size.outW ? ' (растянуто до ' + size.finW + '×' + size.finH + ')' : ''} // ${fmt(seconds)}`;
  $('resultWin').hidden = false;
  $('resultWin').scrollIntoView({ behavior: 'smooth' });
}
