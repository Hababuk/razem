// Service worker: offline app shell + push notifications.
const VERSION = 'razem-v14';
const SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'store/index.js', 'store/base.js', 'store/firebase.js', 'store/local.js', 'recur.js', 'cats.js', 'receipt.js', 'i18n.js', 'config.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/badge-96.png'];

self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Network-first for our own files (so updates land quickly), cache fallback when offline.
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok) { const copy = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
});

self.addEventListener('push', e => {
  let d = {}; try { d = e.data.json(); } catch { d = { title: 'Razem', body: e.data?.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Razem', {
    body: d.body || '', tag: d.tag, renotify: !!d.tag, icon: 'icons/icon-192.png', badge: 'icons/badge-96.png',
    data: d.data || {}, actions: d.actions || [], timestamp: Date.now(),
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const d = e.notification.data || {};
  const act = ['done', 'missed'].includes(e.action) ? e.action : null;
  const msg = { type: 'open', task: d.task, date: d.date, act };
  const scope = self.registration.scope;
  const url = d.task ? `${scope}?task=${encodeURIComponent(d.task)}&date=${d.date || ''}${act ? '&act=' + act : ''}` : scope;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    const c = cs.find(x => x.url.startsWith(scope));
    if (c) { c.postMessage(msg); return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
