/**
 * Servidor de desarrollo sin dependencias.
 *
 *   node dev-server.mjs        →  http://127.0.0.1:8767
 *
 * Sirve archivos estáticos del directorio actual. Puerto 8767 para no chocar
 * con la PWA del cliente (8766) ni con el panel de comercios.
 */

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";

const PUERTO = Number(process.env.PORT) || 8767;
const RAIZ = resolve(process.cwd());

const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

async function existeRuta(ruta) {
  try {
    const info = await stat(ruta);
    return info.isFile() ? ruta : null;
  } catch {
    return null;
  }
}

const servidor = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    let relativa = decodeURIComponent(url.pathname);

    // Sin escapes fuera de la raíz.
    const destino = normalize(join(RAIZ, relativa));
    if (!destino.startsWith(RAIZ)) {
      res.writeHead(403).end("Prohibido");
      return;
    }

    let archivo = await existeRuta(destino);

    // /ruta → /ruta/index.html
    if (!archivo) {
      archivo = await existeRuta(join(destino, "index.html"));
    }

    // Ruta desconocida sin extensión → cascarón (SPA).
    if (!archivo && !extname(relativa)) {
      archivo = await existeRuta(join(RAIZ, "index.html"));
    }

    if (!archivo) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("No encontrado");
      return;
    }

    const cuerpo = await readFile(archivo);
    res.writeHead(200, {
      "Content-Type": TIPOS[extname(archivo)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(cuerpo);
  } catch (err) {
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" }).end(`Error: ${err.message}`);
  }
});

servidor.listen(PUERTO, "127.0.0.1", () => {
  console.log(`All Cancún Conductores → http://127.0.0.1:${PUERTO}`);
});
