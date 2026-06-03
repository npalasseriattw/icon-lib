const CACHE = 'iconlib-shell-v4';
const SHELL = [
  '.',
  'index.html',
  'popup.css',
  'popup.js',
  'auth.js',
  'store.js',
  'thumb-cache.js',
  'lib/drive.js',
  'lib/utils.js',
  'manifest.webmanifest',
  'icons/icon-16.png',
  'icons/icon-48.png',
  'icons/icon-128.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  // Never cache Google hosts: Drive API, thumbnails, and GIS must always be live.
  if (url.hostname.endsWith('googleapis.com') || url.hostname.endsWith('google.com') || url.hostname.endsWith('gstatic.com')) {
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
