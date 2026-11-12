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
const PRECACHE = [{"url":"/app/settings/index.html","hash":"7be667c16b6b63be"},{"url":"/app/share/index.html","hash":"b41ffe02cf7798e8"},{"url":"/assets/archivo-latin-400-normal-C81ewxNO.woff2","hash":"07f9160163da2ec0"},{"url":"/assets/archivo-latin-500-normal-CGugC8dq.woff2","hash":"ab74eca5ad115fe4"},{"url":"/assets/archivo-latin-600-normal-3BBy0ZsW.woff2","hash":"d9e8c29fdd348edd"},{"url":"/assets/archivo-latin-700-normal-D9cHMWGj.woff2","hash":"abada6cd4c92a9a7"},{"url":"/assets/backup-BgKKnVbH.js","hash":"cce2e36c40dd3dc2"},{"url":"/assets/coming-ChJsoUKE.css","hash":"24d1918f79ce94c7"},{"url":"/assets/coming-CxWUI-Qd.js","hash":"8fc9fdc2870e764e"},{"url":"/assets/IBMPlexMono-Medium-Latin1-CfBEoGIJ.woff2","hash":"41201b658a328b9d"},{"url":"/assets/IBMPlexMono-Regular-Latin1-DYPusg7z.woff2","hash":"e8993d946649b9d0"},{"url":"/assets/inbox-Czugqkq5.js","hash":"507723549974bd07"},{"url":"/assets/incoming-CDwqfWnA.js","hash":"eaf08c90856cbd16"},{"url":"/assets/launcher-BDKqw69Y.js","hash":"aa561ab84b116c79"},{"url":"/assets/launcher-C1RZApzm.css","hash":"cac57dff629bb42d"},{"url":"/assets/page-CAFftNWF.js","hash":"47d2a6a2a45aba3c"},{"url":"/assets/page-Di5jCSKJ.css","hash":"166398fbc5fe4777"},{"url":"/assets/reach-BmyiDXDU.js","hash":"87cd80b61691cc7f"},{"url":"/assets/scanner-BeL4Nrfd.css","hash":"a6512629882ed9a0"},{"url":"/assets/scanner-r4F5A_Mc.js","hash":"20ba21aa59598a5e"},{"url":"/assets/settings-DK0Fdb9y.js","hash":"d93e9ee1b6b8ad8c"},{"url":"/assets/settings-kZtIkZbj.css","hash":"ee4d370fd190afd6"},{"url":"/assets/share-CcYEYH1O.css","hash":"b4a1dfa00b283361"},{"url":"/assets/share-CY5KsSK_.js","hash":"cfb058004c8adc35"},{"url":"/assets/tools-AoK7GdGH.js","hash":"4652607dddc116d2"},{"url":"/assets/worker-CsI4wp_i.js","hash":"27e9d0eee12db932"},{"url":"/doc-scanner/index.html","hash":"13b4dda575a24bb5"},{"url":"/expense-log/index.html","hash":"07ae16bb39e6de64"},{"url":"/icons/icon-192.png","hash":"7ce6ef9092c7e0d5"},{"url":"/icons/icon-512.png","hash":"ac3e9fe717d18561"},{"url":"/icons/icon-maskable-512.png","hash":"9b26cce36ac706cf"},{"url":"/icons/shortcut-card-96.png","hash":"dd6a2402751e4401"},{"url":"/icons/shortcut-expenses-96.png","hash":"275311cf3d0a1790"},{"url":"/icons/shortcut-scanner-96.png","hash":"8187a77f82056ab3"},{"url":"/index.html","hash":"68ceb912f99ca335"},{"url":"/licences/archivo-licence.txt","hash":"c3c8402eec0e31dc"},{"url":"/licences/ibm-plex-mono-licence.txt","hash":"37784b44044a4ffd"},{"url":"/manifest.webmanifest","hash":"8d86aadcae2607b3"},{"url":"/qr-card/index.html","hash":"b1fa4cf3f44eeeda"},{"url":"/robots.txt","hash":"331ea9090db0c9f6"},{"url":"/sign-and-fill/index.html","hash":"d5a3d0f357a6732b"}];
const BUILD_ID = "0.1.0+c6ca0df.2026-11-12";

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
  // What did not arrive, for the landing page to say: a share that lost files without a word
  // would read as "it is all in the app now".
  let missed = 0;
  let unread = false;
  try {
    const form = await request.formData();
    const cache = await caches.open(INCOMING_CACHE);
    // A form sent with no file chosen still carries one part: an unnamed file of no bytes. That
    // is nothing shared, and listing it would show a "shared-file, 0 B" that never existed.
    const files = form.getAll('files').filter((value) => typeof value !== 'string' && (value.size > 0 || value.name));
    for (const file of files) {
      try {
        const id = self.crypto.randomUUID();
        const headers = new Headers({
          'Content-Type': file.type || 'application/octet-stream',
          'Content-Length': String(file.size),
          'X-Tools-Name': encodeURIComponent(file.name || 'shared-file'),
          'X-Tools-Received': String(Date.now()),
        });
        await cache.put('/__incoming/' + id, new Response(file, { headers }));
      } catch {
        // One file that cannot be kept (a full device) does not cost the ones after it.
        missed++;
      }
    }
  } catch {
    unread = true;
  }
  // Always the landing page, never an error page. app/src/share-in.ts reads `missed`.
  const told = unread ? '?missed=all' : missed > 0 ? '?missed=' + missed : '';
  return Response.redirect(SHARE_LANDING + told, 303);
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
