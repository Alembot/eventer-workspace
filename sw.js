// Eventer Workspace — service worker. Only job: receive Web Push messages
// and show them as a notification, focus/open the app on tap, and keep the
// home-screen app-icon badge (the little number on the icon) in sync so a
// push is visible even with sound/vibration off and no banner on screen.
self.addEventListener('install', (event) => {
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Tiny IndexedDB-backed counter: the service worker gets killed and restarted
// between pushes, so the unread badge count can't live in a plain JS variable
// — it has to be persisted somewhere that survives that.
const BADGE_DB = 'ew-badge';
function withBadgeStore(mode, fn) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(BADGE_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction('kv', mode);
      const store = tx.objectStore('kv');
      Promise.resolve(fn(store)).then((result) => {
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error);
      }, reject);
    };
  });
}
function getBadgeCount() {
  return withBadgeStore('readonly', (store) => new Promise((resolve) => {
    const r = store.get('count');
    r.onsuccess = () => resolve(r.result || 0);
    r.onerror = () => resolve(0);
  })).catch(() => 0);
}
function setBadgeCount(n) {
  const count = Math.max(0, n);
  return withBadgeStore('readwrite', (store) => store.put(count, 'count'))
    .then(() => applyBadge(count))
    .catch(() => {});
}
async function applyBadge(count) {
  try {
    if (count > 0 && 'setAppBadge' in self.navigator) await self.navigator.setAppBadge(count);
    else if (count === 0 && 'clearAppBadge' in self.navigator) await self.navigator.clearAppBadge();
  } catch (e) { /* Badging API not supported here -- notification itself still shows */ }
}

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
  event.waitUntil((async () => {
    await self.registration.showNotification(title, options);
    const count = await getBadgeCount();
    await setBadgeCount(count + 1);
  })());
});

// Fires when the person swipes the notification away WITHOUT tapping it.
// Where the platform supports this event, the badge count drops right back
// down instead of sitting there for an item already dismissed.
self.addEventListener('notificationclose', (event) => {
  event.waitUntil((async () => {
    const count = await getBadgeCount();
    await setBadgeCount(count - 1);
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(setBadgeCount(0));
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
