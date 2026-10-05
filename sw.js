/** My Journal Book offline shell. */
const CACHE_NAME = "offline-journal-shell-v5";
const SHELL_ASSETS = [
  "./",
  "./index.html",
  "./style.css?v=journal-book-style-4",
  "./app.js?v=journal-book-app-4",
  "./ai.js?v=ollama-3",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];
self.addEventListener("install", (event) => event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)).then(() => self.skipWaiting())));
self.addEventListener("activate", (event) => event.waitUntil(caches.keys().then((keys) => Promise.all(keys.map((key) => key.startsWith("offline-journal-") && key !== CACHE_NAME ? caches.delete(key) : undefined))).then(() => self.clients.claim())));
self.addEventListener("fetch", (event) => { if (event.request.method !== "GET") return; const url = new URL(event.request.url); if (url.origin !== self.location.origin) return; if (!SHELL_ASSETS.some((asset) => new URL(asset, self.registration.scope).href === url.href)) return; event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => { if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone())); return response; }).catch(() => caches.match("./index.html")))); });
