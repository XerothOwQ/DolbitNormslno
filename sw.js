// Сервис-воркер: работа без интернета и приём видео через «Поделиться».
const SHELL = 'shakal-shell-v3';
const CORE = 'shakal-core-0.12.10'; // движок 31 МБ, меняется только при обновлении ffmpeg
const SHELL_FILES = [
  './', 'index.html', 'app.js', 'params.js', 'style.css', 'manifest.webmanifest', 'fonts/vcr.ttf',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png',
  'lib/ffmpeg/index.js', 'lib/ffmpeg/classes.js', 'lib/ffmpeg/const.js', 'lib/ffmpeg/errors.js',
  'lib/ffmpeg/types.js', 'lib/ffmpeg/utils.js', 'lib/ffmpeg/worker.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) {
      if (k.startsWith('shakal-') && ![SHELL, CORE, 'shakal-share'].includes(k)) await caches.delete(k);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;

  // «Поделиться → Шакалилка»: кладём видео в кэш и открываем приложение
  if (e.request.method === 'POST' && url.pathname.endsWith('/share')) {
    e.respondWith((async () => {
      try {
        const form = await e.request.formData();
        const file = form.get('video');
        if (file) {
          const c = await caches.open('shakal-share');
          await c.put('shared-video', new Response(file, {
            headers: { 'Content-Type': file.type || 'video/mp4', 'x-name': encodeURIComponent(file.name || 'video.mp4') },
          }));
        }
      } catch {}
      return Response.redirect(new URL('./?shared=1', self.registration.scope).href, 303);
    })());
    return;
  }
  if (e.request.method !== 'GET') return;

  // Движок: сначала из кэша (он большой и не меняется)
  if (url.pathname.includes('/lib/core/')) {
    e.respondWith((async () => {
      const c = await caches.open(CORE);
      const hit = await c.match(e.request);
      if (hit) return hit;
      const res = await fetch(e.request);
      if (res.ok) c.put(e.request, res.clone());
      return res;
    })());
    return;
  }

  // Остальное: сначала сеть (чтобы приходили обновления), без сети — из кэша
  e.respondWith((async () => {
    const c = await caches.open(SHELL);
    try {
      const res = await fetch(e.request);
      if (res.ok) c.put(e.request, res.clone());
      return res;
    } catch {
      return (await c.match(e.request, { ignoreSearch: true })) || Response.error();
    }
  })());
});
