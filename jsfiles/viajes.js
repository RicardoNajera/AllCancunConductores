/**
 * All Conductor — Viajes
 *
 * Toda la comunicación con la tabla `public.viajes` vive aquí.
 *
 * Regla del negocio: el viaje nace en estado `solicitado` y el PRIMER
 * conductor que lo acepta se lo queda. No hay asignación automática:
 * por eso `aceptarViaje()` usa un `update ... eq('estado','solicitado')`
 * condicional. Si otro conductor llegó primero, el update no toca
 * ninguna fila y sabemos que perdimos la carrera.
 */

import { getSupabase } from './supabase.js';

/* Estados del enum public.estado_viaje */
export const ESTADO = {
  SOLICITADO: 'solicitado',
  ACEPTADO: 'aceptado',
  EN_CAMINO: 'en_camino',
  A_BORDO: 'a_bordo',
  COMPLETADO: 'completado',
  CANCELADO: 'cancelado'
};

const CAMPOS = [
  'id',
  'cliente_id',
  'conductor_id',
  'estado',
  'tipo',
  'origen_texto',
  'origen_lat',
  'origen_lng',
  'destino_texto',
  'destino_lat',
  'destino_lng',
  'precio_centavos',
  'moneda',
  'notas',
  'codigo_abordaje',
  'solicitado_en',
  'aceptado_en',
  'iniciado_en',
  'terminado_en',
  'cancelado_en'
].join(',');

/* ---------------------------------------------------------------- */
/*  Ficha del conductor                                              */
/* ---------------------------------------------------------------- */

/**
 * Lee la ficha de conductor del usuario logueado.
 * RLS solo deja ver la propia.
 */
export async function getMiFichaConductor(perfilId) {
  const supabase = await getSupabase();
  if (!supabase || !perfilId) return { conductor: null, error: 'Sin sesión.' };

  const { data, error } = await supabase
    .from('conductores')
    .select('id, perfil_id, estado, en_linea, vehiculo, marca, modelo, color, placas, telefono, latitude, longitude, viajes_completados')
    .eq('perfil_id', perfilId)
    .maybeSingle();

  return { conductor: data || null, error: error?.message || null };
}

/**
 * Alta de la ficha si todavía no existe.
 * El constraint único en perfil_id evita duplicados.
 */
export async function crearFichaConductor(perfilId, datos = {}) {
  const supabase = await getSupabase();
  if (!supabase || !perfilId) return { conductor: null, error: 'Sin sesión.' };

  const { data, error } = await supabase
    .from('conductores')
    .insert({
      perfil_id: perfilId,
      estado: 'pendiente',
      vehiculo: datos.vehiculo || 'mototaxi',
      marca: datos.marca || null,
      modelo: datos.modelo || null,
      color: datos.color || null,
      placas: datos.placas || null,
      telefono: datos.telefono || null
    })
    .select('id, perfil_id, estado, en_linea, vehiculo')
    .maybeSingle();

  return { conductor: data || null, error: error?.message || null };
}

/** Pone al conductor en línea / fuera de línea. */
export async function setEnLinea(conductorId, enLinea) {
  const supabase = await getSupabase();
  if (!supabase || !conductorId) return { error: 'Sin ficha.' };

  const { error } = await supabase
    .from('conductores')
    .update({ en_linea: Boolean(enLinea), actualizado_en: new Date().toISOString() })
    .eq('id', conductorId);

  return { error: error?.message || null };
}

/**
 * Guarda la última posición conocida. Se llama al activarse y cada
 * cierto tiempo mientras está en línea.
 */
export async function actualizarUbicacion(conductorId, lat, lng) {
  const supabase = await getSupabase();
  if (!supabase || !conductorId) return { error: 'Sin ficha.' };

  const { error } = await supabase
    .from('conductores')
    .update({
      latitude: lat,
      longitude: lng,
      ubicado_en: new Date().toISOString(),
      actualizado_en: new Date().toISOString()
    })
    .eq('id', conductorId);

  return { error: error?.message || null };
}

/* ---------------------------------------------------------------- */
/*  Viajes                                                           */
/* ---------------------------------------------------------------- */

/**
 * Acepta un viaje. Devuelve { viaje, perdido }.
 *
 * Se usa la función `public.tomar_viaje(uuid)` de Postgres y no un
 * update directo. Motivo: la política "Actualizar viaje" solo deja
 * tocar filas donde conductor_id YA eres tú, pero al aceptar está en
 * null. La función corre como security definer, valida que quien llama
 * sea conductor aprobado y hace el update condicional: el primero gana.
 *
 * `perdido: true` significa que otro conductor lo tomó primero (la
 * función devolvió false) o que tu cuenta no está aprobada.
 */
export async function aceptarViaje(viajeId) {
  const supabase = await getSupabase();
  if (!supabase) return { viaje: null, perdido: false, error: 'Sin conexión.' };

  const { data: gano, error } = await supabase.rpc('tomar_viaje', {
    p_viaje_id: viajeId
  });

  if (error) return { viaje: null, perdido: false, error: error.message };

  if (!gano) return { viaje: null, perdido: true, error: null };

  /* El update ya quedó: se relee para tener la fila completa. */
  const { data: fila, error: errLectura } = await supabase
    .from('viajes')
    .select(CAMPOS)
    .eq('id', viajeId)
    .maybeSingle();

  return { viaje: fila || null, perdido: false, error: errLectura?.message || null };
}

/** Avanza el estado del viaje (en_camino → a_bordo → completado). */
export async function cambiarEstado(viajeId, nuevoEstado, extra = {}) {
  const supabase = await getSupabase();
  if (!supabase) return { viaje: null, error: 'Sin conexión.' };

  const ahora = new Date().toISOString();
  const parche = { estado: nuevoEstado, ...extra };

  if (nuevoEstado === ESTADO.EN_CAMINO && !parche.aceptado_en) parche.aceptado_en = ahora;
  if (nuevoEstado === ESTADO.A_BORDO) parche.iniciado_en = ahora;
  if (nuevoEstado === ESTADO.COMPLETADO) parche.terminado_en = ahora;
  if (nuevoEstado === ESTADO.CANCELADO) parche.cancelado_en = ahora;

  const { data, error } = await supabase
    .from('viajes')
    .update(parche)
    .eq('id', viajeId)
    .select(CAMPOS)
    .maybeSingle();

  return { viaje: data || null, error: error?.message || null };
}

/** El conductor suelta el viaje y vuelve a quedar libre. */
export async function rechazarViaje(viajeId) {
  const supabase = await getSupabase();
  if (!supabase) return { error: 'Sin conexión.' };

  /* Solo se puede liberar un viaje que siga solicitado: no se toca el
     que ya tomó alguien más. Aquí todavía no hay conductor asignado. */
  const { error } = await supabase
    .from('viajes')
    .update({ estado: ESTADO.SOLICITADO, conductor_id: null })
    .eq('id', viajeId)
    .eq('estado', ESTADO.SOLICITADO);

  return { error: error?.message || null };
}

/** Viajes que este conductor tiene activos ahora. */
export async function getMiViajeActivo(conductorId) {
  const supabase = await getSupabase();
  if (!supabase || !conductorId) return { viaje: null, error: null };

  const { data, error } = await supabase
    .from('viajes')
    .select(CAMPOS)
    .eq('conductor_id', conductorId)
    .in('estado', [ESTADO.ACEPTADO, ESTADO.EN_CAMINO, ESTADO.A_BORDO])
    .order('solicitado_en', { ascending: false })
    .limit(1)
    .maybeSingle();

  return { viaje: data || null, error: error?.message || null };
}


/* ---------------------------------------------------------------- */
/*  Tiempo real                                                      */
/* ---------------------------------------------------------------- */

/**
 * Escucha viajes en estado `solicitado`.
 *
 * Requiere que la tabla viajes tenga Realtime activado en Supabase
 * (Database → Replication → public.viajes). Si no está activado, el
 * canal simplemente no emite y la app sigue funcionando por polling
 * (`listarSolicitados`).
 *
 * Devuelve la función para cerrar el canal.
 */
export async function escucharViajesNuevos(onNuevo) {
  const supabase = await getSupabase();
  if (!supabase) return () => {};

  const canal = supabase
    .channel('viajes-solicitados')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'viajes', filter: 'estado=eq.solicitado' },
      (payload) => {
        if (payload?.new) onNuevo(payload.new);
      }
    )
    .subscribe();

  return () => {
    try {
      supabase.removeChannel(canal);
    } catch {
      /* canal ya cerrado */
    }
  };
}

/**
 * Respaldo por si Realtime no está activado: trae los viajes
 * solicitados más recientes. Se llama cada N segundos.
 */
export async function listarSolicitados(limite = 5) {
  const supabase = await getSupabase();
  if (!supabase) return { viajes: [], error: null };

  const { data, error } = await supabase
    .from('viajes')
    .select(CAMPOS)
    .eq('estado', ESTADO.SOLICITADO)
    .is('conductor_id', null)
    .order('solicitado_en', { ascending: false })
    .limit(limite);

  return { viajes: data || [], error: error?.message || null };
}

/* ---------------------------------------------------------------- */
/*  Mapeo fila → objeto de la interfaz                               */
/* ---------------------------------------------------------------- */

/**
 * Convierte una fila de Supabase al formato que ya usa All Conductor
 * (`req.origin.name`, `req.quote.fare`, etc.). Así la interfaz y el
 * mapa no cambian: solo cambia de dónde salen los datos.
 */
export function filaARequest(fila) {
  if (!fila) return null;

  const fare = fila.precio_centavos != null ? fila.precio_centavos / 100 : 0;
  const km = distanciaKm(
    fila.origen_lat, fila.origen_lng,
    fila.destino_lat, fila.destino_lng
  );

  return {
    id: fila.id,
    passenger: fila.notas?.slice(0, 40) || 'Pasajero',
    origin: {
      id: 'db',
      name: fila.origen_texto || 'Origen',
      area: 'Punto de recogida',
      lat: fila.origen_lat,
      lng: fila.origen_lng
    },
    dest: {
      id: 'db',
      name: fila.destino_texto || 'Destino',
      area: 'Destino',
      lat: fila.destino_lat,
      lng: fila.destino_lng
    },
    quote: { km, fare, base: fare, perKm: 0 },
    pickupKm: 0.4,
    codigoAbordaje: fila.codigo_abordaje || null,
    estado: fila.estado,
    createdAt: fila.solicitado_en ? new Date(fila.solicitado_en).getTime() : Date.now()
  };
}

/** Distancia en km entre dos puntos (Haversine). */
function distanciaKm(lat1, lng1, lat2, lng2) {
  if ([lat1, lng1, lat2, lng2].some((v) => v == null)) return 0;
  const R = 6371;
  const rad = (g) => (g * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10;
}
