/**
 * Service worker de All Cancún Conductores.
 *
 * Cachea el cascarón para que la app abra aunque no haya señal en la calle.
 * Los datos del viaje NUNCA se cachean: siempre se piden frescos para que
 * el conductor no vea un viaje cancelado como si siguiera vivo.
 */

const CACHE_VERSION = "v99";
const CACHE = `conductores-${CACHE_VERSION}`;

const CASCARON = [
  "./",
  "index.html",
  "config.js",
  "src/app.js",
  "src/supabase.js",
  "styles/app.css",
  "manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(CASCARON)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((llaves) => Promise.all(llaves.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Supabase y el Worker de fotos: red directa, sin caché.
  if (url.origin !== location.origin) return;

  // Navegación: cascarón primero desde caché, refuerzo en segundo plano.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copia = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copia));
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match("index.html")))
    );
    return;
  }

  // Estáticos: caché primero, red de respaldo.
  event.respondWith(
    caches.match(req).then(
      (cacheado) =>
        cacheado ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copia = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copia));
          }
          return res;
        })
    )
  );
});
