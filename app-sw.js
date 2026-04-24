const DB_NAME = 'StratusAppStore';
const DB_VER = 2;
const CACHE_NAME = 'stratus-shell-v1';

// Files needed for offline app shell
const CORE_ASSETS = [
  '/index.html',
  '/app-sw.js'
];

// ---------- IndexedDB ----------
function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, DB_VER);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains('files')) d.createObjectStore('files');
      if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta');
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

function getFile(key) {
  return new Promise((res, rej) => {
    openDB().then(db => {
      const req = db.transaction('files', 'readonly').objectStore('files').get(key);
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
  });
}

// ---------- MIME ----------
function mime(path) {
  const ext = path.split('.').pop().toLowerCase().split('?')[0];
  return ({
    html:'text/html; charset=utf-8', htm:'text/html; charset=utf-8',
    css:'text/css; charset=utf-8', js:'application/javascript; charset=utf-8',
    mjs:'application/javascript; charset=utf-8', json:'application/json; charset=utf-8',
    png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', gif:'image/gif',
    svg:'image/svg+xml', ico:'image/x-icon', webp:'image/webp', bmp:'image/bmp',
    mp3:'audio/mpeg', ogg:'audio/ogg', wav:'audio/wav', mp4:'video/mp4',
    webm:'video/webm', woff:'font/woff', woff2:'font/woff2', ttf:'font/ttf',
    wasm:'application/wasm', txt:'text/plain; charset=utf-8', xml:'application/xml',
    dat:'application/octet-stream', gz:'application/gzip',
    unityweb:'application/octet-stream',
  })[ext] || 'application/octet-stream';
}

// ---------- INSTALL ----------
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

// ---------- ACTIVATE ----------
self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

// ---------- FETCH ----------
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Only same-origin
  if (url.origin !== self.location.origin) return;

  // 1. Handle IndexedDB app files
  if (url.pathname.startsWith('/apps/')) {
    event.respondWith((async () => {
      const key = decodeURIComponent(url.pathname.replace(/^\//, ''));
      const data = await getFile(key).catch(() => null);

      if (data != null) {
        const mimeType = mime(key);
        const headers = { 'Content-Type': mimeType };


        return new Response(data, { status: 200, headers });
      }

      return new Response('Not found: ' + key, {
        status: 404,
        headers: { 'Content-Type': 'text/plain' }
      });
    })());
    return;
  }

  // 2. App shell (index.html, sw.js, etc.)
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);

    // Try cache first
    const cached = await cache.match(event.request);
    if (cached) return cached;

    try {
      // Fetch from network and cache it
      const response = await fetch(event.request);
      cache.put(event.request, response.clone());
      return response;
    } catch (err) {
      // Offline fallback to index.html (SPA style)
      return cache.match('/index.html');
    }
  })());
});
