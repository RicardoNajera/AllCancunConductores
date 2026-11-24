/**
 * Cliente mínimo de Supabase por REST (sin dependencias, sin build).
 *
 * Reutiliza la misma base que la PWA del cliente y el panel de comercios:
 * mismas credenciales públicas, mismo RLS. Aquí solo se hace lo que un
 * conductor necesita: entrar con su teléfono, ver sus viajes y actualizar
 * estado. Nada de escrituras "administrativas".
 */

const URL_BASE = window.ALL_CANCUN_SUPABASE_URL;
const LLAVE = window.ALL_CANCUN_SUPABASE_ANON_KEY;

if (!URL_BASE || !LLAVE) {
  throw new Error("Falta config.js: revisa ALL_CANCUN_SUPABASE_URL y ALL_CANCUN_SUPABASE_ANON_KEY.");
}

const cabeceras = (extra = {}) => ({
  apikey: LLAVE,
  Authorization: `Bearer ${LLAVE}`,
  "Content-Type": "application/json",
  ...extra,
});

async function pedir(ruta, opciones = {}) {
  const res = await fetch(`${URL_BASE}/rest/v1/${ruta}`, {
    ...opciones,
    headers: cabeceras(opciones.headers),
  });

  if (!res.ok) {
    const detalle = await res.text().catch(() => "");
    throw new Error(`Supabase ${res.status}: ${detalle.slice(0, 180)}`);
  }

  const texto = await res.text();
  return texto ? JSON.parse(texto) : null;
}

/* Columnas que esta app realmente usa. Evita traer el objeto entero. */
const CAMPOS_VIAJE =
  "id,folio,estado,origen,destino,precio_centavos,distancia_km,creado_en," +
  "programado_para,cliente_nombre,cliente_telefono,conductor_id";

/* Normaliza el teléfono a solo dígitos para comparar como en Postgres. */
export const soloDigitos = (v) => String(v || "").replace(/\D/g, "");

/**
 * Busca el conductor por teléfono. Devuelve null si no existe.
 * Se espera una tabla `conductores` con RLS de solo-lectura pública.
 */
export async function buscarConductor(telefono) {
  const tel = soloDigitos(telefono);
  if (tel.length < 10) throw new Error("El teléfono debe tener al menos 10 dígitos.");

  const filas = await pedir(
    `conductores?telefono=eq.${encodeURIComponent(tel)}&select=id,nombre,telefono,activo,mototaxi_id&limit=1`
  );

  return filas?.[0] || null;
}

/**
 * Viajes del conductor. Los más recientes primero.
 * @param {string} conductorId
 * @param {{ estados?: string[] }} [filtro]
 */
export async function viajesDeConductor(conductorId, filtro = {}) {
  const estados = filtro.estados?.length
    ? `&estado=in.(${filtro.estados.join(",")})`
    : "";

  return (
    (await pedir(
      `viajes?conductor_id=eq.${encodeURIComponent(conductorId)}` +
        `&select=${CAMPOS_VIAJE}${estados}&order=creado_en.desc&limit=50`
    )) || []
  );
}

/** Cambia el estado de un viaje propio. El filtro por conductor_id es la red. */
export async function actualizarEstado(viajeId, conductorId, estado) {
  const filas = await pedir(
    `viajes?id=eq.${encodeURIComponent(viajeId)}` +
      `&conductor_id=eq.${encodeURIComponent(conductorId)}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ estado }),
    }
  );

  if (!filas?.length) {
    throw new Error("No se pudo actualizar el viaje: no es tuyo o ya cambió de estado.");
  }
  return filas[0];
}
