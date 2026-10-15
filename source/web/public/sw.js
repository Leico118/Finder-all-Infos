// Service worker : cache hors ligne + notifications push.
const VERSION = 'fx10u-v1';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/badge-96.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // API : réseau d'abord, dernière réponse en cache si hors ligne
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(req).then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
        return res;
      }).catch(() => caches.match(req).then(r => r || new Response(JSON.stringify({ error: 'Hors ligne' }), {
        status: 503, headers: { 'content-type': 'application/json' } })))
    );
    return;
  }
  // Navigation : réseau d'abord, coquille en cache sinon
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match('/index.html')));
    return;
  }
  // Fichiers statiques (noms versionnés par Vite) : cache d'abord
  event.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return res;
    }))
  );
});

self.addEventListener('push', event => {
  event.waitUntil((async () => {
    let n = { title: 'Find X10 Ultra', body: 'Nouvelles actualités disponibles', url: '/' };
    try {
      if (event.data) n = { ...n, ...event.data.json() };
      else {
        const res = await fetch('/api/notification', { cache: 'no-store' });
        if (res.ok) n = { ...n, ...(await res.json()) };
      }
    } catch { /* message par défaut */ }
    await self.registration.showNotification(n.title, {
      body: n.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      tag: 'fx10u',
      renotify: true,
      data: { url: n.url || '/' },
    });
  })());
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if ('focus' in c) { await c.navigate(target).catch(() => {}); return c.focus(); }
    }
    return self.clients.openWindow(target);
  })());
});
