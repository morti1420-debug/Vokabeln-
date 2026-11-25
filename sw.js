// App-shell cache so the app opens and works fully offline. Bump VERSION on every release.
const VERSION = 'ev-v88';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './icons/icon.svg',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './data/vocabulary.js',
  './data/vocabulary-zh.js',
  './data/sentence-alternatives.js',
  './data/topics.js',
  './data/vocabulary-topics.js',
  './data/grammar.js',
  './data/situations.js',
  './data/confusables.js',
  './data/stories.js',
  './data/songs.js',
  './js/engine/grammar.js',
  './js/engine/dialogs.js',
  './js/app.js',
  './js/version.js',
  './js/audio.js',
  './js/courses.js',
  './js/i18n-zh.js',
  './js/i18n.js',
  './js/prefs.js',
  './js/tts.js',
  './js/sync.js',
  './js/reminder.js',
  './js/music-service.js',
  './js/sync-config.js',
  './js/store.js',
  './js/engine/answer.js',
  './js/engine/dates.js',
  './js/engine/games.js',
  './js/engine/fungames.js',
  './js/engine/lesson.js',
  './js/engine/library.js',
  './js/engine/merge.js',
  './js/engine/music.js',
  './js/engine/load.js',
  './js/engine/practice.js',
  './js/engine/placement.js',
  './js/engine/puzzle.js',
  './js/engine/random.js',
  './js/engine/review.js',
  './js/engine/selection.js',
  './js/engine/sentences.js',
  './js/engine/srs.js',
  './js/engine/state.js',
  './js/engine/stats.js',
  './js/engine/tests.js',
];

self.addEventListener('install', (event) => {
  // cache: 'reload' – Safari would otherwise fill the new cache from its HTTP cache with the old files.
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      // Keep the ElevenLabs audio cache (ev-tts-*) across app updates – it costs credits to rebuild.
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && !k.startsWith('ev-tts')).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Files are always checked with the server (a quick "not modified" when nothing changed), never taken from a stale
// HTTP cache – Safari kept old app files that way. Page requests stay as they are (they cannot be copied).
function fresh(request) {
  if (request.mode === 'navigate') return request;
  try {
    return new Request(request, { cache: 'no-cache' });
  } catch {
    return request;
  }
}

// The saved copy of a file; for a page, the saved app.
function offline(request) {
  return caches.match(request, { ignoreSearch: true }).then((hit) => hit ?? (request.mode === 'navigate' ? caches.match('./index.html') : undefined));
}

// Network first (so updates arrive), cache as offline fallback.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  // The voice API is never cached here (audio is kept by the app in its own cache).
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname.includes('/audio/')) return;
  event.respondWith(
    fetch(fresh(request))
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(VERSION).then((cache) => cache.put(request, copy));
          return response;
        }
        // The host answers with an error (paused, payment required, server down): the saved app keeps working.
        if (response.status >= 400 && response.status !== 404) return offline(request).then((hit) => hit ?? response);
        return response;
      })
      .catch(() => offline(request).then((hit) => hit ?? Response.error())),
  );
});

// Daily reminder (js/reminder.js): show what the server sends, and open the app when it is tapped.
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data?.json() ?? {};
  } catch {}
  event.waitUntil(
    self.registration.showNotification(data.title || 'English Vocabulary', {
      body: data.body || '',
      icon: './icons/icon-192.png',
      badge: './icons/icon-192.png',
      tag: 'daily-reminder',
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const open = list.find((client) => client.url.startsWith(self.registration.scope));
      return open ? open.focus() : self.clients.openWindow('./');
    }),
  );
});
