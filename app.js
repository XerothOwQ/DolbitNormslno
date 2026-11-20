import { FFmpeg } from './lib/ffmpeg/index.js';

const $ = (id) => document.getElementById(id);

// ---------- Параметры ----------
// Битрейт видео: ползунок 0..100, логарифмически 20 kbps .. 4000 kbps
const vbrFromSlider = (v) => Math.round(20 * Math.pow(4000 / 20, v / 100));

function showValues() {
  $('fpsVal').textContent = $('fps').value + ' fps';
  $('vbrVal').textContent = vbrFromSlider(+$('vbr').value) + ' kbps';
}
['fps', 'vbr'].forEach((id) => $(id).addEventListener('input', showValues));
showValues();

// ---------- Выбор видео ----------
let inputFile = null;
let inputDuration = 0;

$('file').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  inputFile = f;
  inputDuration = await getDuration(f);
  const mb = (f.size / 1048576).toFixed(1);
  $('fileInfo').hidden = false;
  $('fileInfo').textContent = `${f.name} · ${mb} МБ · ${inputDuration.toFixed(1)} с`;
  if (inputDuration > 65) $('fileInfo').textContent += ' · длинное, будет долго!';
  $('go').disabled = false;
});

function getDuration(file) {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => { resolve(isFinite(v.duration) ? v.duration : 0); URL.revokeObjectURL(v.src); };
    v.onerror = () => resolve(0);
    v.src = URL.createObjectURL(file);
  });
}

// ---------- ffmpeg ----------
let ffmpeg = null;
let wasmBlobURL = null;

function log(line) {
  const el = $('log');
  el.textContent += line + '\n';
  if (el.textContent.length > 20000) el.textContent = el.textContent.slice(-15000);
  el.scrollTop = el.scrollHeight;
}

function setStage(text, frac) {
  $('stage').textContent = text;
  $('barFill').style.width = (frac == null ? 0 : Math.max(0, Math.min(1, frac)) * 100) + '%';
}

// Качаем движок (31 МБ) с прогрессом, один раз за сессию
async function fetchWithProgress(url, label) {
  const res = await fetch(url);
  const total = +res.headers.get('Content-Length') || 0;
  const reader = res.body.getReader();
  const chunks = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    setStage(`${label} ${(got / 1048576).toFixed(1)}${total ? ' / ' + (total / 1048576).toFixed(1) : ''} МБ`, total ? got / total : null);
  }
  return new Blob(chunks, { type: 'application/wasm' });
}

let durationForProgress = 0;

async function ensureFFmpeg() {
  if (ffmpeg) return ffmpeg;
  if (!wasmBlobURL) {
    const blob = await fetchWithProgress('lib/core/ffmpeg-core.wasm', 'Загружаю движок…');
    wasmBlobURL = URL.createObjectURL(blob);
  }
  setStage('Запускаю движок…', 1);
  const ff = new FFmpeg();
  ff.on('log', ({ message }) => {
    log(message);
    const m = message.match(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/);
    if (m && durationForProgress > 0) {
      const t = (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]);
      onProgress(t / durationForProgress);
    }
  });
  await ff.load({
    coreURL: new URL('lib/core/ffmpeg-core.js', location.href).href,
    wasmURL: wasmBlobURL,
  });
  ffmpeg = ff;
  return ff;
}

// ---------- Ухудшение ----------
let startTime = 0;

function onProgress(frac) {
  setStage('Шакалю… ' + Math.round(frac * 100) + '%', frac);
  const elapsed = (performance.now() - startTime) / 1000;
  if (frac > 0.03) {
    const left = elapsed / frac - elapsed;
    $('eta').textContent = `прошло ${fmt(elapsed)} · осталось ~${fmt(left)}`;
  } else {
    $('eta').textContent = `прошло ${fmt(elapsed)}`;
  }
}
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function buildArgs() {
  const h = +$('res').value;
  const fps = +$('fps').value;
  const vbr = vbrFromSlider(+$('vbr').value);
  const abr = +$('abr').value;

  const vf = [];
  if (h) vf.push(`scale=-2:${h}:flags=bilinear`);
  vf.push(`fps=${fps}`);
  vf.push('format=yuv420p');

  // Низкий аудиобитрейт требует низкой частоты дискретизации
  const ar = abr <= 8 ? 8000 : abr <= 16 ? 16000 : abr <= 32 ? 22050 : 44100;

  return [
    '-i', 'in',
    '-vf', vf.join(','),
    '-c:v', 'libx264', '-preset', 'ultrafast',
    '-b:v', vbr + 'k', '-maxrate', vbr + 'k', '-bufsize', vbr * 2 + 'k',
    '-c:a', 'aac', '-b:a', abr + 'k', '-ar', String(ar),
    '-movflags', '+faststart',
    'out.mp4',
  ];
}

$('go').addEventListener('click', async () => {
  if (!inputFile) return;
  $('go').disabled = true;
  $('resultCard').hidden = true;
  $('progressCard').hidden = false;
  $('eta').textContent = '';
  try {
    const ff = await ensureFFmpeg();
    setStage('Читаю видео…', 0);
    await ff.writeFile('in', new Uint8Array(await inputFile.arrayBuffer()));
    const args = buildArgs();
    log('> ffmpeg ' + args.join(' '));
    durationForProgress = inputDuration;
    startTime = performance.now();
    onProgress(0);
    const code = await ff.exec(args);
    if (code !== 0) throw new Error('ffmpeg завершился с кодом ' + code + ' (смотри лог внизу)');
    const data = await ff.readFile('out.mp4');
    await ff.deleteFile('in').catch(() => {});
    await ff.deleteFile('out.mp4').catch(() => {});
    showResult(data, (performance.now() - startTime) / 1000);
  } catch (err) {
    if (String(err).includes('terminate')) {
      setStage('Отменено', 0);
    } else {
      setStage('Ошибка: ' + (err.message || err), 0);
      log(String(err));
    }
    $('eta').textContent = '';
    $('go').disabled = false;
    return;
  }
  $('progressCard').hidden = true;
  $('go').disabled = false;
});

$('cancel').addEventListener('click', () => {
  if (ffmpeg) { ffmpeg.terminate(); ffmpeg = null; }
});

let resultURL = null;
function showResult(data, seconds) {
  if (resultURL) URL.revokeObjectURL(resultURL);
  const blob = new Blob([data.buffer], { type: 'video/mp4' });
  resultURL = URL.createObjectURL(blob);
  $('result').src = resultURL;
  $('download').href = resultURL;
  const base = inputFile.name.replace(/\.[^.]+$/, '');
  $('download').download = `${base}_shakal.mp4`;
  const was = (inputFile.size / 1048576).toFixed(1);
  const now = (blob.size / 1048576).toFixed(2);
  $('resultInfo').textContent = `было ${was} МБ → стало ${now} МБ · обработка заняла ${fmt(seconds)}`;
  $('resultCard').hidden = false;
  $('resultCard').scrollIntoView({ behavior: 'smooth' });
}
