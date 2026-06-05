const CACHE_NAME = 'dnd-sheet-v53';
const APP_SHELL = [
  './',
  './index.html',
  './obr-sheet-link/manifest.json',
  './obr-sheet-link/index.html',
  './obr-sheet-link/context.html',
  './obr-sheet-link/spells.html',
  './obr-sheet-link/abilities.html',
  './obr-sheet-link/background.html',
  './obr-sheet-link/background.js',
  './obr-sheet-link/main.js',
  './obr-sheet-link/context.js',
  './obr-sheet-link/spells.js',
  './obr-sheet-link/abilities.js',
  './obr-sheet-link/popover-window.js',
  './obr-sheet-link/style.css',
  './obr-sheet-link/icon.svg',
  './obr-sheet-link/icon.png',
  './table.html',
  './vtt.css',
  './vtt.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(key => {
        if (key !== CACHE_NAME) return caches.delete(key);
        return null;
      })))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    let fallback = './index.html';
    if (url.pathname.endsWith('/table.html')) fallback = './table.html';
    if (url.pathname.endsWith('/obr-sheet-link/index.html')) fallback = './obr-sheet-link/index.html';
    if (url.pathname.endsWith('/obr-sheet-link/spells.html')) fallback = './obr-sheet-link/spells.html';
    if (url.pathname.endsWith('/obr-sheet-link/abilities.html')) fallback = './obr-sheet-link/abilities.html';
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(fallback, copy));
          return response;
        })
        .catch(() => caches.match(fallback))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        return response;
      });
    })
  );
});
