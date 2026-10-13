const VERSION = "papeleria-v1.0.0";
const STATIC_CACHE = `${VERSION}-static`;
const RUNTIME_CACHE = `${VERSION}-runtime`;

const APP_SHELL = [
  "./index.html",
  "./manifest.webmanifest",
  "./css/styles.css",
  "./js/app.js",
  "./js/utils.js",
  "./js/storage.js",
  "./js/db.js",
  "./js/data.js",
  "./js/connection.js",
  "./js/cart.js",
  "./js/orders.js",
  "./js/forms.js",
  "./data/productos.json",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      await cache.addAll(APP_SHELL);
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const claves = await caches.keys();
      await Promise.all(
        claves
          .filter((clave) => !clave.startsWith(VERSION))
          .map((clave) => caches.delete(clave))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

async function redPrimero(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const respuesta = await fetch(request);
    if (respuesta.ok) cache.put(request, respuesta.clone());
    return respuesta;
  } catch (err) {
    const cacheada = await cache.match(request, { ignoreSearch: true });
    if (cacheada) return cacheada;
    throw err;
  }
}

async function cachePrimero(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cacheada = await cache.match(request, { ignoreSearch: true });
  if (cacheada) {
    fetch(request)
      .then((respuesta) => respuesta.ok && cache.put(request, respuesta.clone()))
      .catch(() => {});
    return cacheada;
  }
  const respuesta = await fetch(request);
  if (respuesta.ok && new URL(request.url).origin === self.location.origin) {
    cache.put(request, respuesta.clone());
  }
  return respuesta;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await redPrimero(request, STATIC_CACHE);
        } catch {
          const cache = await caches.open(STATIC_CACHE);
          return (await cache.match("./index.html")) || Response.error();
        }
      })()
    );
    return;
  }

  if (url.pathname.endsWith(".json") || url.pathname.includes("/data/")) {
    event.respondWith(redPrimero(request, STATIC_CACHE).catch(() => caches.match(request)));
    return;
  }

  event.respondWith(cachePrimero(request, STATIC_CACHE));
});
