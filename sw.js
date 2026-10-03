// Eventer Workspace — service worker. Only job: receive Web Push messages
// and show them as a notification, and focus/open the app on tap.
self.addEventListener('install', (event) => {
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { title: 'Eventer Workspace', body: event.data ? event.data.text() : '' }; }
  const title = data.title || 'Eventer Workspace';
  const options = {
    body: data.body || '',
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    data: { url: data.url || './' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const rawUrl = (event.notification.data && event.notification.data.url) || './';
  // IMPORTANT: clients.openWindow()/client.navigate() resolve a relative URL
  // against the service worker's OWN script location (sw.js), not the app's
  // page. A bare "#home" therefore opened ".../sw.js#home" -- the raw source
  // of this file -- instead of the app. Always resolve against the SW scope
  // (the app's root) first.
  const targetUrl = new URL(rawUrl, self.registration.scope).href;
  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of allClients) {
      if ('focus' in client) {
        client.navigate(targetUrl).catch(() => {});
        return client.focus();
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
  })());
});
