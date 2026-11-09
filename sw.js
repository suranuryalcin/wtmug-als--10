const CACHE = 'p2p-koprusu-v99';
const ASSETS = [
  './',
  './index.html',
  './desktop.html',
  './mobile.html',
  './manifest.json',
  './css/style.css',
  './js/utils.js',
  './js/qrcode.js',
  './js/webrtc.js',
  './js/filetransfer.js',
  './js/chat.js',
  './js/broadcast.js',
  './js/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS).catch(() => {
        // Eksik dosya varsa (ör. icons yoksa) yine de kur
        return Promise.allSettled(ASSETS.map(a => c.add(a)));
      }))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

  // CDN istekleri (PeerJS, html5-qrcode, qrcode-generator): network-first
  if (!e.request.url.startsWith(location.origin)) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
    return;
  }

  // Yerel: cache-first, arka planda güncelle
  e.respondWith(
    caches.match(e.request).then(cached => {
      const net = fetch(e.request).then(res => {
        if (res && res.ok) {
          caches.open(CACHE).then(c => c.put(e.request, res.clone())).catch(() => { });
        }
        return res;
      }).catch(() => cached);
      return cached || net;
    })
  );
});

// Bildirim tıklaması
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window' }).then(cs => {
      for (const c of cs) { if ('focus' in c) return c.focus(); }
      if (self.clients.openWindow) return self.clients.openWindow('./');
    })
  );
});