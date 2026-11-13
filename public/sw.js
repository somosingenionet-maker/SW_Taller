// Service worker de Doonty Motor. Es deliberadamente CONSERVADOR: la aplicación vive de datos en
// vivo, así que aquí no se guarda ningún dato ni se sirve nada viejo por error. Solo hace dos cosas:
//   1) Archivos con nombre único (/assets/*): una vez bajados se guardan y se sirven al instante.
//      Su nombre cambia con cada versión, así que nunca puede quedar uno desfasado.
//   2) Si abres la aplicación sin conexión, enseña una pantalla clara de «Sin conexión» en vez del
//      error del navegador.
// Las páginas (HTML) se piden SIEMPRE a la red primero: una publicación nueva se ve al recargar.
// Todo lo demás (Supabase, funciones, tipografías, otros dominios) lo gestiona el navegador sin
// pasar por aquí.

const VERSION = 'v1';
const CACHE_APP = `doonty-app-${VERSION}`;
const CACHE_ASSETS = `doonty-assets-${VERSION}`;
const OFFLINE_URL = '/offline.html';
const MAX_ASSETS = 80; // los de versiones viejas se van borrando, los más antiguos primero

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_APP)
      .then((c) => c.addAll([OFFLINE_URL, '/icon-192.png']))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((nombres) => Promise.all(nombres.filter((n) => n !== CACHE_APP && n !== CACHE_ASSETS).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

async function recortar(cache) {
  const claves = await cache.keys();
  for (const clave of claves.slice(0, Math.max(0, claves.length - MAX_ASSETS))) await cache.delete(clave);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Páginas: red primero; sin red, la pantalla de «Sin conexión».
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(async () => (await caches.match(OFFLINE_URL)) || Response.error()),
    );
    return;
  }

  // Archivos con nombre único: guardados tras la primera vez.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.open(CACHE_ASSETS).then(async (cache) => {
        const guardado = await cache.match(req);
        if (guardado) return guardado;
        const respuesta = await fetch(req);
        // Solo se guarda lo que de verdad es un archivo de la aplicación. Si un archivo viejo ya no existe,
        // el servidor responde con la página principal (HTML, código 200): eso NO se guarda como si fuera
        // el archivo, o la pestaña se quedaría rota con él.
        const tipo = respuesta.headers.get('content-type') || '';
        if (respuesta.ok && !/text\/html/i.test(tipo)) {
          cache.put(req, respuesta.clone()).then(() => recortar(cache)).catch(() => undefined);
        }
        return respuesta;
      }),
    );
  }
});
