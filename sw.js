// Offline support.
//
// The app shell alone isn't enough to be usable offline: every ayah, word
// meaning, tafsir and recitation comes from a third-party origin, and this
// worker used to skip cross-origin requests entirely - so offline the shell
// loaded and then had nothing to show. Each kind of request gets the
// strategy that suits it:
//
//   app shell   network-first  - whatever is deployed wins while online,
//                                cache covers offline (a stale-first shell
//                                used to hide deployed fixes for a reload
//                                or two)
//   Quran data  network-first  - text/meanings stay fresh online, and every
//                                response seen once is readable offline
//   fonts       cache-first    - immutable, versioned URLs
//   audio       cache-first    - a given ayah's recitation never changes;
//                                kept to a cap so it can't grow unbounded
//
// Anything an ayah's data was never fetched for can't be shown offline, so
// the settings panel offers a prefetch for the surahs actually in use.

const VERSION = "v8";
const SHELL_CACHE = `tadabbur-shell-${VERSION}`;
const DATA_CACHE = `tadabbur-data-${VERSION}`;
const FONT_CACHE = `tadabbur-fonts-${VERSION}`;
const AUDIO_CACHE = `tadabbur-audio-${VERSION}`;
const KEEP = [SHELL_CACHE, DATA_CACHE, FONT_CACHE, AUDIO_CACHE];

const SHELL = [
  "./",
  "index.html",
  "offline.html",
  "css/style.css",
  "js/app.js",
  "manifest.json",
  "icons/icon-192.png",
  "icons/icon-512.png",
];

const DATA_HOSTS = ["api.alquran.cloud", "api.quran.com"];
const FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];
const AUDIO_HOSTS = ["cdn.islamic.network"];
const AUDIO_MAX_ENTRIES = 400;
const SHELL_TIMEOUT = 4000;

self.addEventListener("install", (event) => {
  // cache: "reload" so the shell is taken from the server, not from the
  // browser's own HTTP cache: a worker installing right after a deploy
  // would otherwise be able to store the previous build's files and serve
  // them offline (and on any failed revalidation) long after they changed.
  event.waitUntil(
    caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: "reload" }))))
  );
  self.skipWaiting();
});

// A new worker normally has to wait for every tab using the old one to go
// away, which for an installed app can be days. The page asks it to take
// over as soon as it has installed, and reloads itself when it does - so a
// deployed fix arrives on the next time the app is brought to the front,
// not on the next time the person happens to pull-to-refresh.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

// A notification is only useful if tapping it lands you in the app. Focus a
// window that is already open rather than opening a second one - an
// installed app reopened into a duplicate window loses whatever the person
// had on screen.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ("focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow("./");
      return undefined;
    })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => !KEEP.includes(k)).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

// An opaque response (audio fetched no-cors by the <audio> element) reports
// status 0 but is still perfectly replayable from the cache.
function isCacheable(res) {
  return res && (res.ok || res.type === "opaque");
}

// A phone waking from the background often has a connection that is up but
// not yet carrying anything, and fetch has no timeout of its own: the
// request simply hangs. For the shell that is the worst case - the page sits
// there half-built waiting for a script that never arrives - and the cached
// copy we would have used is right here. So the shell gets a deadline and
// falls back rather than waiting forever. Data and media are left alone;
// they have their own handling and a slow ayah is not a broken app.
function fetchWithDeadline(request, ms) {
  if (!ms) return fetch(request);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    fetch(request).then(
      (res) => { clearTimeout(timer); resolve(res); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

async function networkFirst(request, cacheName, timeoutMs, event) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetchWithDeadline(request, timeoutMs);
    // The put is not awaited, so the response is not held up by the write -
    // but it is handed to waitUntil, because cache.put deletes the old entry
    // before writing the new one. A worker killed between those two (routine
    // on a phone) would otherwise leave the shell with a hole in it, and the
    // next offline start with nothing to open. A put can also legitimately
    // reject (a Vary:* or partial response), which must not surface as an
    // error in the worker.
    if (isCacheable(res)) {
      const write = cache.put(request, res.clone()).catch(() => {});
      if (event) event.waitUntil(write);
    }
    return res;
  } catch (e) {
    const cached = await cache.match(request, { ignoreVary: true });
    if (cached) return cached;
    throw e;
  }
}

async function cacheFirst(request, cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request, { ignoreVary: true });
  if (cached) return cached;
  const res = await fetch(request);
  if (isCacheable(res)) {
    await cache.put(request, res.clone()).catch(() => {});
    if (maxEntries) trimCache(cacheName, maxEntries);
  }
  return res;
}

// Oldest-first: cache.keys() returns insertion order.
async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - maxEntries; i++) await cache.delete(keys[i]);
}

// What a navigation gets when the network is unreachable. It must never
// resolve to undefined: respondWith(undefined) is a network error, which is
// the browser's own "this site can't be reached" page - the one thing a
// worker exists to prevent. So it tries the app, then the app under its
// other name, then the offline page, and finally a page it builds itself,
// which needs no cache at all and so cannot fail.
const OFFLINE_FALLBACK_HTML = `<!DOCTYPE html><html lang="ar" dir="rtl"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>تَدَبُّر — بلا اتصال</title><style>
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
padding:24px;background:#f7f5f0;color:#2b2620;font-family:"Tajawal",system-ui,sans-serif;
text-align:center;line-height:1.7}
@media(prefers-color-scheme:dark){body{background:#16150f;color:#ece7d9}}
.m{font-size:2.4rem;color:#b98b2a}h1{font-size:1.4rem;color:#1f6f5c;margin:10px 0 18px}
p{font-size:.9rem;color:#7a7364;margin:0 0 8px;max-width:340px}
button{margin-top:22px;padding:13px 28px;border:0;border-radius:999px;background:#1f6f5c;
color:#fff;font-family:inherit;font-size:.95rem;font-weight:700}
</style></head><body><div><div class="m">۞</div><h1>تَدَبُّر</h1>
<p>لا يوجد اتصال بالإنترنت، ولم تُحفَظ نسخةٌ من التطبيق على هذا الجهاز.</p>
<p>افتحه مرّةً وأنت متّصل، وبعدها يعمل دون اتصال.</p>
<button onclick="location.reload()">أعد المحاولة</button></div>
<script>addEventListener("online",function(){setTimeout(function(){location.replace("./")},400)})<\/script>
</body></html>`;

async function offlineNavigation() {
  for (const key of ["index.html", "./", "offline.html"]) {
    const hit = await caches.match(key, { ignoreSearch: true, ignoreVary: true });
    if (hit) return hit;
  }
  return new Response(OFFLINE_FALLBACK_HTML, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);

  // The page asking for a genuinely fresh shell (see refreshShell in app.js).
  // Left entirely to the network: answering it from this cache would let a
  // refresh "succeed" by handing back the very copy it means to replace, and
  // caching it would file the shell under a one-off URL.
  if (url.searchParams.has("shell-refresh")) return;

  if (url.origin === self.location.origin) {
    event.respondWith(
      networkFirst(event.request, SHELL_CACHE, SHELL_TIMEOUT, event).catch(() =>
        event.request.mode === "navigate" ? offlineNavigation() : Response.error()
      )
    );
    return;
  }

  if (DATA_HOSTS.includes(url.hostname)) {
    event.respondWith(networkFirst(event.request, DATA_CACHE));
    return;
  }
  if (FONT_HOSTS.includes(url.hostname)) {
    event.respondWith(cacheFirst(event.request, FONT_CACHE));
    return;
  }
  if (AUDIO_HOSTS.includes(url.hostname)) {
    // A ranged request is left to the network entirely. Media elements ask
    // for byte ranges, and a cached whole-file response answered with 200
    // where the element asked for 206 is something Safari refuses outright -
    // which is why recitations played on Android and failed on iPhone. The
    // unranged request (the first one, and every one Chrome makes) still
    // fills the cache, so offline playback is unaffected.
    if (event.request.headers.has("range")) return;
    event.respondWith(cacheFirst(event.request, AUDIO_CACHE, AUDIO_MAX_ENTRIES));
    return;
  }
  // anything else: leave it to the network untouched
});
