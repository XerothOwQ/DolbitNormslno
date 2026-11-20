// Все параметры, пресеты и сборка команд ffmpeg.

// ---------- Справочники ----------
export const CODECS = {
  h264:     { label: 'H.264',               enc: 'libx264',    kind: 'x26x', pix: 'yuv420p' },
  vp8:      { label: 'VP8',                 enc: 'libvpx',     kind: 'vpx',  pix: 'yuv420p' },
  mpeg4:    { label: 'MPEG-4 / DivX',       enc: 'mpeg4',      kind: 'old',  pix: 'yuv420p' },
  mpeg2:    { label: 'MPEG-2 (DVD)',        enc: 'mpeg2video', kind: 'old',  pix: 'yuv420p', stdfps: true },
  mpeg1:    { label: 'MPEG-1 (VCD)',        enc: 'mpeg1video', kind: 'old',  pix: 'yuv420p', stdfps: true },
  h263:     { label: 'H.263 (телефон 2005)',enc: 'h263',       kind: 'old',  pix: 'yuv420p', h263: true },
  flv:      { label: 'Sorenson FLV (старый YouTube)', enc: 'flv', kind: 'old', pix: 'yuv420p' },
  wmv2:     { label: 'WMV 8',               enc: 'wmv2',       kind: 'old',  pix: 'yuv420p' },
  mjpeg:    { label: 'Motion JPEG',         enc: 'mjpeg',      kind: 'old',  pix: 'yuvj420p' },
  cinepak:  { label: 'Cinepak (CD-ROM 90-х, медленно)', enc: 'cinepak',  kind: 'fixed', pix: 'rgb24' },
  msvideo1: { label: 'MS Video 1 (Win95)',  enc: 'msvideo1',   kind: 'fixed', pix: 'rgb555le' },
};

export const ACODECS = {
  aac:   { label: 'AAC',              enc: 'aac' },
  mp3:   { label: 'MP3',              enc: 'libmp3lame' },
  opus:  { label: 'Opus',             enc: 'libopus' },
  mp2:   { label: 'MP2 (старое радио/DVD)', enc: 'mp2' },
  mulaw: { label: 'μ-law (телефон)',  enc: 'pcm_mulaw', nobitrate: true },
  adpcm: { label: 'ADPCM (старые игры)', enc: 'adpcm_ima_wav', nobitrate: true },
  u8:    { label: 'PCM 8-bit',        enc: 'pcm_u8',    nobitrate: true },
};

const opt = (pairs) => pairs.map(([v, l]) => ({ v: String(v), l }));

// ---------- Схема параметров ----------
// type: select | range | toggle | number
// show(s): когда показывать; fmt(v): как подписать значение
export const SECTIONS = [
  {
    id: 'video', title: 'VIDEO', params: [
      { id: 'res', label: 'Разрешение', type: 'select', def: 'orig', options: opt([
        ['orig', 'Оригинал'], [1080, '1080p'], [720, '720p'], [480, '480p'], [360, '360p'],
        [240, '240p'], [144, '144p'], [96, '96p'], [48, '48p'], ['custom', 'Своё…']]) },
      { id: 'cw', label: 'Ширина', type: 'number', def: 320, min: 16, max: 3840, show: (s) => s.res === 'custom' },
      { id: 'ch', label: 'Высота', type: 'number', def: 240, min: 16, max: 2160, show: (s) => s.res === 'custom' },
      { id: 'fps', label: 'Частота кадров', type: 'range', def: 0, min: 0, max: 60, step: 1,
        fmt: (v) => (+v === 0 ? 'оригинал' : v + ' fps') },
      { id: 'codec', label: 'Кодек', type: 'select', def: 'h264',
        options: Object.entries(CODECS).map(([v, c]) => ({ v, l: c.label })) },
      { id: 'profile', label: 'Профиль кодирования', type: 'select', def: 'high',
        options: opt([['baseline', 'Baseline (старые телефоны)'], ['main', 'Main'], ['high', 'High']]),
        show: (s) => s.codec === 'h264' },
      { id: 'gop', label: 'Интервал ключевых кадров (GOP)', type: 'range', def: 250, min: 1, max: 600, step: 1,
        fmt: (v) => v + ' кадр.', show: (s) => CODECS[s.codec].kind !== 'fixed' && s.codec !== 'mjpeg' },
      { id: 'rc', label: 'Режим битрейта', type: 'select', def: 'vbr',
        options: opt([['cbr', 'CBR (постоянный)'], ['vbr', 'VBR (переменный)'], ['crf', 'CRF (постоянное качество)']]),
        show: (s) => CODECS[s.codec].kind !== 'fixed' },
      { id: 'vbr', label: 'Битрейт видео', type: 'range', def: 70, min: 0, max: 100, step: 1,
        fmt: (v) => fmtKbps(vbrKbps(v)), show: (s) => CODECS[s.codec].kind !== 'fixed' && s.rc !== 'crf' },
      { id: 'crf', label: 'CRF (больше = хуже)', type: 'range', def: 23, min: 0, max: 51, step: 1,
        show: (s) => CODECS[s.codec].kind !== 'fixed' && s.rc === 'crf' },
      { id: 'quality', label: 'Качество видео', type: 'range', def: 100, min: 0, max: 100, step: 1,
        fmt: (v) => v + '%', show: (s) => CODECS[s.codec].kind !== 'fixed' },
      { id: 'comp', label: 'Уровень сжатия', type: 'select', def: '1',
        options: opt([[0, 'Быстро и грязно'], [1, 'Быстро'], [2, 'Средне'], [3, 'Тщательно'], [4, 'Очень тщательно (долго)']]),
        show: (s) => ['x26x', 'vpx'].includes(CODECS[s.codec].kind) },
      { id: 'passes', label: 'Пережатий подряд', type: 'range', def: 1, min: 1, max: 5, step: 1,
        fmt: (v) => v + '×' },
      { id: 'pixfmt', label: 'Формат пикселей', type: 'select', def: 'normal', options: opt([
        ['normal', 'Обычный (YUV)'], ['gray', 'Ч/Б (gray)'], ['rgb565', 'RGB565 (16 бит)'],
        ['rgb555', 'RGB555 (15 бит)'], ['rgb444', 'RGB444 (12 бит)'], ['rgb8', 'RGB332 (8 бит)'],
        ['rgb4', 'RGB121 (4 бита)'], ['monob', '1 бит (ч/б точками)']]) },
      { id: 'depth', label: 'Глубина цвета', type: 'select', def: '8', options: opt([
        [8, '8 бит на канал'], [6, '6 бит'], [5, '5 бит'], [4, '4 бита'], [3, '3 бита'], [2, '2 бита'], [1, '1 бит']]) },
      { id: 'chroma', label: 'Субдискретизация цвета', type: 'select', def: '420', options: opt([
        ['444', '4:4:4 (полный цвет)'], ['422', '4:2:2'], ['420', '4:2:0 (обычно)'], ['411', '4:1:1 (DV)'], ['410', '4:1:0 (цвет кашей)']]) },
      { id: 'scaler', label: 'Фильтр масштабирования', type: 'select', def: 'bicubic', options: opt([
        ['neighbor', 'Ближайший (пиксели)'], ['fast_bilinear', 'Быстрый билинейный'], ['bilinear', 'Билинейный'],
        ['bicubic', 'Бикубический'], ['area', 'Area'], ['lanczos', 'Lanczos']]) },
      { id: 'aspect', label: 'Соотношение сторон', type: 'select', def: 'orig', options: opt([
        ['orig', 'Оригинал'], ['4:3', '4:3 (растянуть)'], ['16:9', '16:9 (растянуть)'], ['1:1', '1:1 (растянуть)'],
        ['9:16', '9:16 (растянуть)'], ['21:9', '21:9 (растянуть)']]) },
      { id: 'rotate', label: 'Поворот', type: 'select', def: '0', options: opt([
        [0, '0°'], [90, '90° вправо'], [180, '180°'], [270, '90° влево']]) },
      { id: 'upscale', label: 'Растянуть итог обратно (до 720p)', type: 'toggle', def: false },
    ],
  },
  {
    id: 'fx', title: 'EFFECTS', params: [
      { id: 'sat', label: 'Насыщенность', type: 'range', def: 100, min: 0, max: 300, step: 5, fmt: (v) => v + '%' },
      { id: 'contrast', label: 'Контраст', type: 'range', def: 100, min: 50, max: 300, step: 5, fmt: (v) => v + '%' },
      { id: 'sharpen', label: 'Резкость', type: 'range', def: 0, min: 0, max: 10, step: 1 },
      { id: 'blur', label: 'Размытие', type: 'range', def: 0, min: 0, max: 10, step: 1 },
      { id: 'noise', label: 'Шум', type: 'range', def: 0, min: 0, max: 100, step: 1, fmt: (v) => v + '%' },
      { id: 'vhs', label: 'Растёкшийся цвет (VHS)', type: 'toggle', def: false },
      { id: 'overlay', label: 'Надпись поверх', type: 'select', def: 'none', options: opt([
        ['none', 'Нет'], ['vhs', 'VHS: PLAY ►'], ['cctv', 'CCTV: CAM 01 + время'], ['cam', 'Дата как у мыльницы']]) },
    ],
  },
  {
    id: 'audio', title: 'AUDIO', params: [
      { id: 'acodec', label: 'Аудиокодек', type: 'select', def: 'aac',
        options: Object.entries(ACODECS).map(([v, c]) => ({ v, l: c.label })) },
      { id: 'abr', label: 'Битрейт аудио', type: 'select', def: '128', options: opt([
        [320, '320 kbps'], [192, '192 kbps'], [128, '128 kbps'], [96, '96 kbps'], [64, '64 kbps'], [48, '48 kbps'],
        [32, '32 kbps'], [24, '24 kbps'], [16, '16 kbps'], [12, '12 kbps'], [8, '8 kbps'], [6, '6 kbps']]),
        show: (s) => !ACODECS[s.acodec].nobitrate },
      { id: 'ar', label: 'Частота дискретизации', type: 'select', def: 'orig', options: opt([
        ['orig', 'Оригинал'], [48000, '48 000 Гц'], [44100, '44 100 Гц'], [32000, '32 000 Гц'], [22050, '22 050 Гц'],
        [16000, '16 000 Гц'], [11025, '11 025 Гц'], [8000, '8 000 Гц (телефон)'], [4000, '4 000 Гц'], [2000, '2 000 Гц']]) },
      { id: 'bits', label: 'Разрядность', type: 'select', def: '16', options: opt([
        [16, '16 бит'], [12, '12 бит'], [8, '8 бит'], [6, '6 бит'], [4, '4 бита'], [3, '3 бита'], [2, '2 бита']]) },
      { id: 'channels', label: 'Каналы', type: 'select', def: 'orig', options: opt([
        ['orig', 'Как в оригинале'], ['mono', 'Моно'], ['stereo', 'Стерео']]) },
      { id: 'volume', label: 'Громкость', type: 'range', def: 100, min: 0, max: 1000, step: 10,
        fmt: (v) => v + '%' + (+v > 100 ? ' (перегруз)' : '') },
      { id: 'speed', label: 'Скорость', type: 'range', def: 1, min: 0.25, max: 4, step: 0.05,
        fmt: (v) => (+v).toFixed(2) + '×' },
      { id: 'pitch', label: 'Высота тона', type: 'range', def: 0, min: -12, max: 12, step: 1,
        fmt: (v) => (+v > 0 ? '+' : '') + v + ' пт' },
      { id: 'aquality', label: 'Качество звука', type: 'range', def: 100, min: 0, max: 100, step: 1, fmt: (v) => v + '%' },
    ],
  },
];

export const ALL_PARAMS = SECTIONS.flatMap((s) => s.params);
export const DEFAULTS = Object.fromEntries(ALL_PARAMS.map((p) => [p.id, p.def]));

// Битрейт видео: ползунок 0..100 → 10..8000 kbps (логарифмически)
export const vbrKbps = (v) => Math.round(10 * Math.pow(800, v / 100));
export const sliderFromKbps = (k) => Math.round(100 * Math.log(k / 10) / Math.log(800));
const fmtKbps = (k) => (k >= 1000 ? (k / 1000).toFixed(1) + ' Mbps' : k + ' kbps');

// ---------- Пресеты ----------
const P = (o) => ({ ...DEFAULTS, ...o });
export const PRESETS = [
  { id: 'original', name: 'Original Quality', sub: 'без потерь на глаз',
    v: P({ rc: 'crf', crf: 18, comp: '1', abr: '192' }) },
  { id: 'potato', name: 'Potato Quality', sub: 'картошка',
    v: P({ res: 96, fps: 8, codec: 'mpeg4', rc: 'cbr', vbr: sliderFromKbps(12), quality: 0, gop: 600,
      chroma: '410', depth: '4', scaler: 'neighbor', upscale: true,
      acodec: 'mp3', abr: '8', ar: 8000, bits: '6', channels: 'mono', aquality: 25 }) },
  { id: '144p', name: '144p', sub: 'классика',
    v: P({ res: 144, fps: 15, vbr: sliderFromKbps(60), abr: '24', ar: 22050, channels: 'mono' }) },
  { id: '240p', name: '240p', sub: 'смотрибельно',
    v: P({ res: 240, fps: 24, vbr: sliderFromKbps(180), abr: '48', ar: 22050 }) },
  { id: 'phone2005', name: '2005 Mobile Phone', sub: 'H.263, 176×144',
    v: P({ res: 144, fps: 12, codec: 'h263', rc: 'cbr', vbr: sliderFromKbps(48), gop: 30, aspect: '4:3',
      pixfmt: 'rgb565', scaler: 'bilinear', upscale: true,
      acodec: 'aac', abr: '12', ar: 8000, channels: 'mono', aquality: 35 }) },
  { id: 'oldyt', name: 'Old YouTube', sub: '2007, FLV',
    v: P({ res: 240, codec: 'flv', vbr: sliderFromKbps(220), aspect: '4:3', upscale: true, scaler: 'bilinear',
      acodec: 'mp3', abr: '64', ar: 22050, channels: 'mono' }) },
  { id: 'whatsapp', name: 'WhatsApp Compression', sub: 'переслано много раз',
    v: P({ res: 480, vbr: sliderFromKbps(220), passes: 4, comp: '0', quality: 60, sat: 115,
      abr: '24', ar: 16000, channels: 'mono' }) },
  { id: 'vhs', name: 'VHS', sub: 'кассета из 90-х',
    v: P({ res: 240, codec: 'mpeg2', vbr: sliderFromKbps(1500), aspect: '4:3', vhs: true, noise: 18, blur: 1,
      sat: 135, overlay: 'vhs', upscale: true, scaler: 'bilinear',
      acodec: 'mp3', abr: '96', aquality: 45, bits: '12' }) },
  { id: 'cctv', name: 'CCTV', sub: 'камера наблюдения',
    v: P({ res: 240, fps: 6, rc: 'cbr', vbr: sliderFromKbps(90), pixfmt: 'gray', noise: 25, contrast: 130,
      overlay: 'cctv', gop: 600, upscale: true,
      acodec: 'mulaw', ar: 8000, channels: 'mono', aquality: 30, volume: 70 }) },
  { id: 'digicam', name: 'Retro Digital Camera', sub: 'мыльница 2004',
    v: P({ res: 480, fps: 15, codec: 'mjpeg', rc: 'crf', crf: 32, aspect: '4:3', sat: 140, sharpen: 3, noise: 8,
      overlay: 'cam', acodec: 'u8', ar: 11025, channels: 'mono', aquality: 50 }) },
  { id: 'deepfry', name: 'Deep Fried Video', sub: 'пережарено',
    v: P({ res: 360, rc: 'cbr', vbr: sliderFromKbps(70), quality: 15, passes: 3, comp: '0', depth: '3',
      sat: 300, contrast: 220, sharpen: 10, noise: 30, upscale: true, scaler: 'neighbor',
      acodec: 'aac', abr: '16', ar: 22050, bits: '6', volume: 800 }) },
  { id: 'custom', name: 'Custom Preset', sub: 'твой сохранённый', v: null },
];

// ---------- Сборка команд ----------
const even4 = (x) => Math.max(16, Math.round(x / 4) * 4);
const H263_SIZES = [[128, 96], [176, 144], [352, 288], [704, 576], [1408, 1152]];
const ASPECTS = { '4:3': 4 / 3, '16:9': 16 / 9, '1:1': 1, '9:16': 9 / 16, '21:9': 21 / 9 };
const STD_FPS = [24, 25, 30, 50, 60];

// Размеры кадра после ухудшения (encW×encH — для кодека, outW×outH — как показывать)
export function computeSize(s, src) {
  let sw = src.w, sh = src.h;
  if (s.rotate === '90' || s.rotate === '270') [sw, sh] = [sh, sw];
  const srcAspect = sw / sh;
  let w, h;
  if (s.res === 'custom') {
    w = +s.cw; h = +s.ch;
  } else {
    h = s.res === 'orig' ? sh : +s.res;
    const a = s.aspect === 'orig' ? srcAspect : ASPECTS[s.aspect];
    w = h * a;
  }
  const outW = even4(w), outH = even4(h);
  let encW = outW, encH = outH;
  if (CODECS[s.codec].h263) {
    // H.263 умеет только стандартные размеры: берём ближайший по высоте и растягиваем
    const best = H263_SIZES.reduce((a, b) => (Math.abs(b[1] - outH) < Math.abs(a[1] - outH) ? b : a));
    [encW, encH] = best;
  }
  // Итог: либо как есть, либо обратно до оригинала (с учётом выбранного соотношения)
  let finW = outW, finH = outH;
  if (s.upscale) {
    const tH = Math.min(sh, 720); // выше 720p растягивать незачем, только дольше
    finH = even4(tH);
    finW = even4(tH * (outW / outH));
  }
  return { encW, encH, outW, outH, finW, finH, srcW: sw, srcH: sh };
}

function esc(t) {
  // экранирование для drawtext внутри одинарных кавычек
  return t.replace(/\\/g, '\\\\').replace(/'/g, '').replace(/:/g, '\\:');
}

function overlayFilters(s, size) {
  if (s.overlay === 'none') return [];
  const H = size.encH;
  const fs = Math.max(10, Math.round(H / 14));
  const m = Math.round(H / 20);
  const font = "fontfile=/vcr.ttf";
  const sh = `shadowcolor=black@0.7:shadowx=${Math.max(1, fs >> 4)}:shadowy=${Math.max(1, fs >> 4)}`;
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  if (s.overlay === 'vhs') {
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const date = `${months[now.getMonth()]}. ${pad(now.getDate())} 1998`;
    return [
      `drawtext=${font}:text='PLAY ►':fontcolor=white:fontsize=${fs}:x=${m}:y=${m}:${sh}`,
      `drawtext=${font}:text='SP':fontcolor=white:fontsize=${fs}:x=w-tw-${m}:y=${m}:${sh}`,
      `drawtext=${font}:text='${esc(date)}':fontcolor=white:fontsize=${fs}:x=${m}:y=h-th-${m}:${sh}`,
    ];
  }
  if (s.overlay === 'cctv') {
    const date = `${pad(now.getDate())}-${pad(now.getMonth() + 1)}-${now.getFullYear()}`;
    return [
      `drawtext=${font}:text='CAM 01':fontcolor=white:fontsize=${fs}:x=${m}:y=${m}`,
      `drawtext=${font}:text='REC':fontcolor=red:fontsize=${fs}:x=w-tw-${m}:y=${m}:enable='lt(mod(t,1),0.6)'`,
      `drawtext=${font}:text='${esc(date)}  %{pts\\:hms}':fontcolor=white:fontsize=${Math.round(fs * 0.8)}:x=${m}:y=h-th-${m}`,
    ];
  }
  if (s.overlay === 'cam') {
    const date = `${pad(now.getMonth() + 1)} ${pad(now.getDate())} 2004`;
    return [`drawtext=${font}:text='${esc(date)}':fontcolor=0xff8a1c:fontsize=${fs}:x=w-tw-${m * 1.5 | 0}:y=h-th-${m}:${sh}`];
  }
  return [];
}

function videoFilters(s, size, src) {
  const f = [];
  const rot = { '90': 'transpose=1', '180': 'transpose=1,transpose=1', '270': 'transpose=2' }[s.rotate];
  if (rot) f.push(rot);
  if (+s.speed !== 1) f.push(`setpts=PTS/${+s.speed}`);
  if (+s.fps > 0) f.push(`fps=${+s.fps}`);
  f.push(`scale=${size.encW}:${size.encH}:flags=${s.scaler}`, 'setsar=1');
  f.push(...overlayFilters(s, size));
  if (+s.sat !== 100 || +s.contrast !== 100) f.push(`eq=saturation=${s.sat / 100}:contrast=${s.contrast / 100}`);
  if (+s.sharpen > 0) f.push(`unsharp=5:5:${(s.sharpen * 0.5).toFixed(1)}:5:5:${(s.sharpen * 0.3).toFixed(1)}`);
  if (+s.blur > 0) f.push(`gblur=sigma=${(s.blur * 0.5).toFixed(1)}`);
  if (s.vhs) {
    const r = Math.max(2, Math.round(size.encW / 60));
    f.push(`chromashift=cbh=${r}:crh=-${r}`, `boxblur=luma_radius=1:luma_power=1:chroma_radius=${r * 2}:chroma_power=2`);
  }
  if (+s.noise > 0) f.push(`noise=alls=${Math.round(s.noise * 0.6)}:allf=t+u`);
  if (+s.depth < 8) {
    const mask = (0xff << (8 - s.depth)) & 0xff;
    f.push('format=rgb24', `lutrgb=r='bitand(val,${mask})':g='bitand(val,${mask})':b='bitand(val,${mask})'`);
  }
  if (s.pixfmt !== 'normal') f.push(`format=${s.pixfmt}`);
  if (s.chroma !== '420') f.push(`format=yuv${s.chroma}p`);
  f.push(`format=${CODECS[s.codec].pix}`);
  return f.join(',');
}

const X26X_PRESETS = ['ultrafast', 'veryfast', 'medium', 'slow', 'veryslow'];

function videoEncoderArgs(s, fpsOut) {
  const c = CODECS[s.codec];
  const a = ['-c:v', c.enc];
  const kbps = vbrKbps(+s.vbr);
  const q = +s.quality;
  if (c.kind === 'fixed') return a;

  if (c.kind === 'x26x') {
    a.push('-preset', X26X_PRESETS[+s.comp]);
    if (s.codec === 'h264') a.push('-profile:v', s.profile);
    if (s.rc === 'crf') a.push('-crf', String(s.crf));
    if (q < 100) a.push('-qmin', String(Math.round((100 - q) / 100 * 51)));
  } else if (c.kind === 'vpx') {
    a.push('-deadline', +s.comp >= 3 ? 'good' : 'realtime', '-cpu-used', String(8 - +s.comp * 2));
    if (s.rc === 'crf') a.push('-crf', String(Math.round(4 + s.crf / 51 * 59)), '-b:v', '0');
    if (q < 100) a.push('-qmin', String(Math.round((100 - q) / 100 * 63)), '-qmax', '63');
  } else {
    if (s.rc === 'crf') a.push('-q:v', String(Math.round(2 + s.crf / 51 * 29)));
    a.push('-qmin', String(q < 100 ? Math.max(1, Math.round((100 - q) / 100 * 31)) : 2), '-qmax', '31');
  }
  if (s.rc === 'cbr') a.push('-b:v', kbps + 'k', '-minrate', kbps + 'k', '-maxrate', kbps + 'k', '-bufsize', kbps + 'k');
  if (s.rc === 'vbr') a.push('-b:v', kbps + 'k', '-maxrate', kbps * 2 + 'k', '-bufsize', kbps * 2 + 'k');
  if (s.codec !== 'mjpeg') a.push('-g', String(s.gop));
  if (c.stdfps) a.push('-r', String(fpsOut));
  return a;
}

function atempoChain(t) {
  const out = [];
  while (t > 2) { out.push('atempo=2'); t /= 2; }
  while (t < 0.5) { out.push('atempo=0.5'); t /= 0.5; }
  if (Math.abs(t - 1) > 1e-3) out.push(`atempo=${t.toFixed(4)}`);
  return out;
}

function audioPlan(s) {
  const c = ACODECS[s.acodec];
  const abr = +s.abr;
  // На какой частоте кодировать (кодеки капризные)
  let encRate = 44100;
  if (s.acodec === 'opus') encRate = 48000;
  if (s.acodec === 'mp3') encRate = abr >= 32 ? 44100 : abr >= 16 ? 22050 : 11025;
  if (s.acodec === 'mp2') encRate = abr >= 32 ? 44100 : 22050;
  if (s.acodec === 'mulaw') encRate = 8000;
  if (['adpcm', 'u8'].includes(s.acodec)) encRate = s.ar === 'orig' ? 22050 : Math.max(4000, Math.min(48000, +s.ar));
  if (s.acodec === 'aac' && abr <= 16) encRate = 22050;

  const f = ['aresample=44100'];
  if (+s.volume !== 100) {
    f.push(`volume=${(s.volume / 100).toFixed(2)}`);
    if (+s.volume > 100) f.push('asoftclip=type=hard');
  }
  const r = Math.pow(2, +s.pitch / 12);
  if (+s.pitch !== 0) f.push(`asetrate=${Math.round(44100 * r)}`, 'aresample=44100');
  f.push(...atempoChain(+s.speed / r));
  if (s.channels === 'mono') f.push('aformat=channel_layouts=mono');
  if (s.channels === 'stereo') f.push('aformat=channel_layouts=stereo');
  if (+s.aquality < 100) {
    const cut = Math.round(250 * Math.pow(16000 / 250, s.aquality / 100));
    f.push(`lowpass=f=${cut}`, `lowpass=f=${cut}`);
  }
  if (s.ar !== 'orig' && +s.ar < 44100) f.push(`aresample=${s.ar}`);
  if (+s.bits < 16) f.push(`acrusher=bits=${s.bits}:mode=lin:aa=0:mix=1`);
  f.push(`aresample=${encRate}`);
  if (s.acodec === 'mulaw') f.push('aformat=channel_layouts=mono');

  const a = ['-c:a', c.enc];
  if (!c.nobitrate) a.push('-b:a', abr + 'k');
  return { filter: f.join(','), args: a };
}

// Возвращает список проходов ffmpeg. dur — длительность исходника (с).
export function buildPlan(s, src) {
  const size = computeSize(s, src);
  const c = CODECS[s.codec];
  const outDur = src.dur / +s.speed;
  let fpsOut = +s.fps > 0 ? +s.fps : (src.fps || 30);
  if (c.stdfps) fpsOut = STD_FPS.find((x) => x >= fpsOut) || 60;
  const container = c.kind === 'vpx' ? 'webm' : 'matroska';
  const vext = c.kind === 'vpx' ? 'webm' : 'mkv';

  const passes = [];
  const n = +s.passes;
  for (let i = 0; i < n; i++) {
    const inp = i === 0 ? 'in' : `v${i - 1}.${vext}`;
    const vf = i === 0 ? videoFilters(s, size, src) : `format=${c.pix}`;
    passes.push({
      label: n > 1 ? `Видео, пережатие ${i + 1}/${n}` : 'Видео',
      dur: outDur, weight: 1,
      args: ['-i', inp, '-an', '-sn', '-vf', vf, ...videoEncoderArgs(s, fpsOut), '-f', container, `v${i}.${vext}`],
      cleanup: i > 0 ? [inp] : [],
    });
  }
  const vfile = `v${n - 1}.${vext}`;

  const ap = audioPlan(s);
  if (src.hasAudio) passes.push({
    label: 'Звук', dur: outDur, weight: 0.15, audio: true,
    args: ['-i', 'in', '-vn', '-sn', '-af', ap.filter, ...ap.args, '-f', 'matroska', 'a.mka'],
  });

  // Финальная сборка в MP4, который играет любой телефон
  const copyVideo = s.codec === 'h264' && size.encW === size.finW && size.encH === size.finH;
  const copyAudio = s.acodec === 'aac';
  const fin = src.hasAudio ? ['-i', vfile, '-i', 'a.mka', '-map', '0:v:0', '-map', '1:a:0'] : ['-i', vfile];
  if (copyVideo) fin.push('-c:v', 'copy');
  else fin.push('-vf', `scale=${size.finW}:${size.finH}:flags=${s.scaler},setsar=1,format=yuv420p`,
    '-c:v', 'libx264', '-preset', 'superfast', '-crf', '21', '-g', '60');
  if (!src.hasAudio) fin.push('-an');
  else if (copyAudio) fin.push('-c:a', 'copy');
  else fin.push('-c:a', 'aac', '-b:a', '192k', '-ar', '44100');
  fin.push('-movflags', '+faststart', '-shortest', 'out.mp4');
  passes.push({ label: 'Сборка MP4', dur: outDur, weight: copyVideo ? 0.05 : (size.finH > size.outH ? 1 : 0.4), args: fin, cleanup: src.hasAudio ? [vfile, 'a.mka'] : [vfile], final: true });

  return { passes, size };
}
