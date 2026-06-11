/* =====================================================================
 * sw.js — service worker: installable PWA + full offline play.
 *
 * Strategy: precache everything on install (the whole game is ~static
 * files), then STALE-WHILE-REVALIDATE on fetch — cached responses serve
 * instantly (and offline), while a background refetch quietly updates the
 * cache so the NEXT load picks up any deploy. No version-bump discipline
 * required for routine deploys; bump VERSION to force-drop old caches.
 *
 * Registered from index.html over https only — file:// play is untouched.
 * ===================================================================== */
'use strict';

const VERSION = 'kis-v1';
const CACHE = 'knotz-invade-space-' + VERSION;

const PRECACHE = [
  './',
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  // sprite sheets (repo root)
  'player.png', 'player_jets.png', 'beetlemorph.png', 'rhinomorph.png', 'boss.png',
  // backdrops + icons
  'assets/background.png', 'assets/background2.png', 'assets/background3.png',
  'assets/background4.png', 'assets/background5.png', 'assets/background6.png',
  'assets/background7.png', 'assets/background8.png', 'assets/background10.png',
  'assets/backgroundEarth.png',
  'assets/icon-64.png', 'assets/icon-180.png', 'assets/icon-192.png', 'assets/icon-512.png',
  // game source, in load order
  'src/config.js', 'src/utils.js', 'src/glowatlas.js', 'src/audio.js', 'src/input.js',
  'src/particles.js', 'src/postfx.js', 'src/starfield.js', 'src/projectile.js', 'src/powerup.js',
  'src/meta.js', 'src/achievements.js', 'src/daily.js', 'src/player.js',
  'src/enemy.js', 'src/boss.js', 'src/campaign.js', 'src/wave.js', 'src/drone.js', 'src/hazard.js',
  'src/ui.js', 'src/hangar.js', 'src/settings.js', 'src/game.js', 'src/main.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // fonts etc. hit the network

  e.respondWith(
    caches.open(CACHE).then((cache) =>
      cache.match(req, { ignoreSearch: true }).then((cached) => {
        const refetch = fetch(req)
          .then((res) => {
            if (res && res.ok) cache.put(req, res.clone());
            return res;
          })
          .catch(() => cached);   // offline: whatever we have
        return cached || refetch;
      })
    )
  );
});
