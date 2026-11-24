/**
 * Genera los iconos de la PWA sin dependencias: un PNG RGB dibujado a mano.
 * Marca: cuadro verde con degradado, una "A" blanca y una franja de camino.
 */
import zlib from "node:zlib";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const VERDE = [22, 197, 94];
const VERDE_OSCURO = [13, 122, 58];
const AZUL = [56, 189, 248];

function crear(tam) {
  const px = Buffer.alloc(tam * tam * 3, 0);
  const S = tam - 1;

  const punto = (x, y) => {
    const r = Math.round(x * S);
    const c = Math.round(y * S);
    if (r < 0 || c < 0 || r > S || c > S) return;
    const i = (r * tam + c) * 3;
    /* Degradado diagonal verde */
    const t = (x + y) / 2;
    const base = VERDE.map((v, k) => Math.round(v * (1 - t * 0.55) + VERDE_OSCURO[k] * t * 0.55));
    px[i] = base[0];
    px[i + 1] = base[1];
    px[i + 2] = base[2];
  };

  /* Fondo con esquinas redondeadas (radio 22%) */
  const radio = 0.22;
  for (let y = 0; y < tam; y++) {
    for (let x = 0; x < tam; x++) {
      const nx = x / S;
      const ny = y / S;
      let dentro = true;
      const esquinas = [
        [radio, radio], [1 - radio, radio],
        [radio, 1 - radio], [1 - radio, 1 - radio],
      ];
      if (nx < radio || nx > 1 - radio) {
        if (ny < radio || ny > 1 - radio) {
          const [cx, cy] = esquinas.find(
            ([a, b]) => Math.abs(nx - a) < radio + 0.001 && Math.abs(ny - b) < radio + 0.001
          ) || esquinas[0];
          dentro = Math.hypot(nx - cx, ny - cy) <= radio;
        }
      }
      if (dentro) punto(nx, ny);
    }
  }

  /* Geometría de la "A": dos trazos inclinados + travesaño */
  const grosor = 0.058;
  const vertice = [0.5, 0.245];
  const izqPie = [0.245, 0.775];
  const derPie = [0.755, 0.775];

  const distSegmento = (px0, py0, ax, ay, bx, by) => {
    const dx = bx - ax;
    const dy = by - ay;
    const l2 = dx * dx + dy * dy;
    let u = l2 ? ((px0 - ax) * dx + (py0 - ay) * dy) / l2 : 0;
    u = Math.max(0, Math.min(1, u));
    return Math.hypot(px0 - (ax + u * dx), py0 - (ay + u * dy));
  };

  const enA = (x, y) => {
    const d1 = distSegmento(x, y, vertice[0], vertice[1], izqPie[0], izqPie[1]);
    const d2 = distSegmento(x, y, vertice[0], vertice[1], derPie[0], derPie[1]);
    /* Travesaño: entre 58% y 66% de altura, del ancho interior de la A */
    const anchoTrazo = (y - 0.245) / (0.775 - 0.245);
    const trazo =
      y > 0.575 && y < 0.575 + grosor * 1.6 &&
      Math.abs(x - 0.5) < anchoTrazo * 0.255 - 0.008;
    return Math.min(d1, d2) <= grosor || trazo;
  };

  for (let y = 0; y < tam; y++) {
    for (let x = 0; x < tam; x++) {
      const nx = x / S;
      const ny = y / S;
      if (!enA(nx, ny)) continue;
      const i = (y * tam + x) * 3;
      px[i] = 255;
      px[i + 1] = 255;
      px[i + 2] = 255;
    }
  }

  /* Punto azul: el destino, arriba a la derecha de la A */
  for (let y = 0; y < tam; y++) {
    for (let x = 0; x < tam; x++) {
      const nx = x / S;
      const ny = y / S;
      const d = Math.hypot(nx - 0.755, ny - 0.245);
      if (d <= 0.072) {
        const i = (y * tam + x) * 3;
        px[i] = AZUL[0];
        px[i + 1] = AZUL[1];
        px[i + 2] = AZUL[2];
      }
    }
  }

  return px;
}

function png(tam) {
  const px = crear(tam);
  const filas = Buffer.alloc((tam * 3 + 1) * tam);
  for (let y = 0; y < tam; y++) {
    filas[y * (tam * 3 + 1)] = 0;
    px.copy(filas, y * (tam * 3 + 1) + 1, y * tam * 3, (y + 1) * tam * 3);
  }

  const trozo = (tipo, datos) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(datos.length);
    const cuerpo = Buffer.concat([Buffer.from(tipo, "ascii"), datos]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(cuerpo) >>> 0);
    return Buffer.concat([len, cuerpo, crc]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(tam, 0);
  ihdr.writeUInt32BE(tam, 4);
  ihdr[8] = 8;   // bits por canal
  ihdr[9] = 2;   // RGB

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    trozo("IHDR", ihdr),
    trozo("IDAT", zlib.deflateSync(filas, { level: 9 })),
    trozo("IEND", Buffer.alloc(0)),
  ]);
}

let tabla = null;
function crc32(buf) {
  if (!tabla) {
    tabla = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      tabla[n] = c;
    }
  }
  let c = -1;
  for (const b of buf) c = tabla[(c ^ b) & 0xff] ^ (c >>> 8);
  return c ^ -1;
}

const dir = fileURLToPath(new URL("../icons/", import.meta.url));
for (const tam of [192, 512]) {
  writeFileSync(dir + `icon-${tam}.png`, png(tam));
  console.log(`icons/icon-${tam}.png listo`);
}
