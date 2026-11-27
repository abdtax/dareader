// 다읽어 service worker (scope: this folder only; touches only caches named dareader-*): offline shell + receives files/links from the phone's Share menu
const VERSION = "dareader-v5";
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./cmaps-ko.json", "./examples.json", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith("dareader-") && k !== VERSION && k !== "dareader-share").map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method === "POST" && url.pathname.endsWith("/share-target")) {
    e.respondWith((async () => {
      const form = await e.request.formData();
      const cache = await caches.open("dareader-share");
      await Promise.all((await cache.keys()).map(k => cache.delete(k)));
      const files = form.getAll("file").filter(f => f && typeof f !== "string");
      const meta = { title: form.get("title") || "", text: form.get("text") || "", url: form.get("url") || "", files: [] };
      for (let i = 0; i < files.length; i++) {
        meta.files.push({ name: files[i].name || ("공유파일" + (i + 1)), type: files[i].type || "" });
        await cache.put("share/file" + i, new Response(files[i]));
      }
      await cache.put("share/meta", new Response(JSON.stringify(meta), { headers: { "Content-Type": "application/json" } }));
      return Response.redirect(new URL("./?shared=1", self.registration.scope).href, 303);
    })());
    return;
  }
  if (e.request.method !== "GET") return;
  // app files: network first so updates arrive, cache as fallback; libraries from CDNs: cache first
  const sameOrigin = url.origin === self.location.origin;
  if (sameOrigin) {
    e.respondWith(fetch(e.request).then(r => { if (r.ok) { const c = r.clone(); caches.open(VERSION).then(x => x.put(e.request, c)); } return r; })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match("./index.html"))));
  } else if (/cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|fonts\.(googleapis|gstatic)\.com/.test(url.hostname)) {
    e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(r => { if (r.ok || r.type === "opaque") { const c = r.clone(); caches.open(VERSION).then(x => x.put(e.request, c)); } return r; })));
  }
});
