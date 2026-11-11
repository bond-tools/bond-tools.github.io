/*
 * The service worker: what makes the app work with no connection, and what receives files that
 * other apps share into it. Plain JavaScript, no library. The build step in vite.config.js
 * replaces the two markers below with the list of built files and the build id.
 *
 * Rules (docs/ARCHITECTURE.md section 5):
 *  - Install caches every file of this build. If one file fails, the install fails and the
 *    previous version keeps running: never a half-cached app.
 *  - Never take over on its own. The page shows "Update ready"; the owner's tap sends
 *    {type: 'SKIP_WAITING'}.
 *  - Only this app's own files are ever fetched. Nothing is requested from another server.
 */

/** @type {{url: string, hash: string}[]} */
const PRECACHE = [{"url":"/app/settings/index.html","hash":"25ab04e55e904c6f"},{"url":"/app/share/index.html","hash":"77a07cf4e9288691"},{"url":"/assets/archivo-latin-400-normal-C81ewxNO.woff2","hash":"07f9160163da2ec0"},{"url":"/assets/archivo-latin-500-normal-CGugC8dq.woff2","hash":"ab74eca5ad115fe4"},{"url":"/assets/archivo-latin-600-normal-3BBy0ZsW.woff2","hash":"d9e8c29fdd348edd"},{"url":"/assets/archivo-latin-700-normal-D9cHMWGj.woff2","hash":"abada6cd4c92a9a7"},{"url":"/assets/IBMPlexMono-Medium-Latin1-CfBEoGIJ.woff2","hash":"41201b658a328b9d"},{"url":"/assets/IBMPlexMono-Regular-Latin1-DYPusg7z.woff2","hash":"e8993d946649b9d0"},{"url":"/assets/placeholder-DCt0NaFY.css","hash":"d4b99a8ca11ad5a7"},{"url":"/assets/placeholder-DkWrITIN.js","hash":"418c206484b89b68"},{"url":"/doc-scanner/index.html","hash":"991174292e2691c8"},{"url":"/expense-log/index.html","hash":"4146e79e0126aea4"},{"url":"/index.html","hash":"c09af2cc60070d90"},{"url":"/manifest.webmanifest","hash":"8d86aadcae2607b3"},{"url":"/qr-card/index.html","hash":"7bebe947505799f2"},{"url":"/robots.txt","hash":"331ea9090db0c9f6"},{"url":"/sign-and-fill/index.html","hash":"ea8caeb68b17f201"}];
const BUILD_ID = "0.1.0+f7a4b7d.2026-11-11";

const CACHE_PREFIX = 'tools-build-';
const CACHE_NAME = CACHE_PREFIX + BUILD_ID;
const INCOMING_CACHE = 'tools-incoming';
const SHARE_ACTION = '/app/share/receive';
const SHARE_LANDING = '/app/share/';

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // cache: 'reload' goes to the network, past the browser's own HTTP cache, so a new build
      // never stores a stale copy of a file.
      await Promise.all(
        PRECACHE.map(async (entry) => {
          const response = await fetch(new Request(entry.url, { cache: 'reload' }));
          if (!response.ok) throw new Error('could not cache ' + entry.url + ': ' + response.status);
          await cache.put(entry.url, response);
        }),
      );
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (data && data.type === 'SKIP_WAITING') self.skipWaiting();
  if (data && data.type === 'GET_BUILD_ID' && event.ports && event.ports[0]) {
    event.ports[0].postMessage({ buildId: BUILD_ID });
  }
});

/** A folder path means that folder's index.html. */
function cacheKeyFor(url) {
  let path = url.pathname;
  if (path.endsWith('/')) path += 'index.html';
  return path;
}

async function fromCache(request) {
  const url = new URL(request.url);
  const cache = await caches.open(CACHE_NAME);
  const hit = await cache.match(cacheKeyFor(url));
  if (hit) return hit;
  // Not part of this build (a file from a newer or older build, or a mistyped path): try the
  // network, and if there is none say so plainly.
  try {
    return await fetch(request);
  } catch {
    return new Response('This page is not saved on the device and there is no connection.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}

/** Files shared into the app arrive as a form POST that only the service worker can read. */
async function receiveShare(request) {
  try {
    const form = await request.formData();
    const cache = await caches.open(INCOMING_CACHE);
    const files = form.getAll('files').filter((value) => typeof value !== 'string');
    for (const file of files) {
      const id = self.crypto.randomUUID();
      const headers = new Headers({
        'Content-Type': file.type || 'application/octet-stream',
        'Content-Length': String(file.size),
        'X-Tools-Name': encodeURIComponent(file.name || 'shared-file'),
        'X-Tools-Received': String(Date.now()),
      });
      await cache.put('/__incoming/' + id, new Response(file, { headers }));
    }
  } catch {
    // Fall through: the landing page shows "nothing arrived" rather than an error page.
  }
  return Response.redirect(SHARE_LANDING, 303);
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.method === 'POST' && url.pathname === SHARE_ACTION) {
    event.respondWith(receiveShare(request));
    return;
  }
  if (request.method !== 'GET') return;
  if (url.pathname.startsWith('/__incoming/')) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(INCOMING_CACHE);
        return (await cache.match(url.pathname)) || new Response('', { status: 404 });
      })(),
    );
    return;
  }
  event.respondWith(fromCache(request));
});
