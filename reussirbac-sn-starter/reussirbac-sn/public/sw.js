// Service worker RéussirBac SN : interface rapide + page hors ligne + calculatrice.
// Les cours, vidéos et PDF ne sont PAS stockés hors ligne (ils viennent toujours du réseau).
const VERSION = 'v1';
const SHELL = `rb-shell-${VERSION}`;
const STATIC = `rb-static-${VERSION}`;
const FONTS = `rb-fonts-${VERSION}`;
const PAGES = ['/', '/moyenne', '/hors-ligne'];
const PRECACHE = [...PAGES, '/manifest.webmanifest', '/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(SHELL).then((c) => Promise.allSettled(PRECACHE.map((u) => c.add(u)))).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => ![SHELL, STATIC, FONTS].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function reseauAvecDelai(req, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    fetch(req).then((r) => { clearTimeout(t); resolve(r); }, (err) => { clearTimeout(t); reject(err); });
  });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Polices Google : on garde une copie
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(
      caches.open(FONTS).then(async (c) => {
        const hit = await c.match(req);
        const maj = fetch(req).then((r) => { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; }).catch(() => hit);
        return hit || maj;
      })
    );
    return;
  }

  // Tout ce qui n'est pas notre site (Supabase, YouTube...) : réseau seulement
  if (url.origin !== self.location.origin) return;

  // Fichiers générés par Next.js (nom unique par version) : cache d'abord
  if (url.pathname.startsWith('/_next/static/')) {
    e.respondWith(
      caches.open(STATIC).then(async (c) => {
        const hit = await c.match(req);
        if (hit) return hit;
        const r = await fetch(req);
        if (r.ok) c.put(req, r.clone());
        return r;
      })
    );
    return;
  }

  // Pages : réseau d'abord (3 s max sur connexion lente), sinon copie, sinon page hors ligne
  if (req.mode === 'navigate') {
    e.respondWith(
      (async () => {
        const c = await caches.open(SHELL);
        try {
          const r = await reseauAvecDelai(req, 3500);
          if (r.ok && PAGES.includes(url.pathname)) c.put(url.pathname, r.clone());
          return r;
        } catch (err) {
          if (PAGES.includes(url.pathname)) {
            const hit = await c.match(url.pathname);
            if (hit) return hit;
          }
          return (await c.match('/hors-ligne')) || new Response('Hors ligne', { status: 503 });
        }
      })()
    );
    return;
  }

  // Icônes et manifeste
  if (url.pathname === '/manifest.webmanifest' || url.pathname.startsWith('/icon-')) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
  }
});
