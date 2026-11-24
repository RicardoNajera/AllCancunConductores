/**
 * Acceso a Supabase con el SDK oficial (el mismo que usan la PWA del cliente
 * y el panel de comercios).
 *
 * Aquí sí hay cuentas reales: el conductor se registra con correo y
 * contraseña, y su perfil vive en public.perfiles. El permiso de conducir
 * se otorga con la tabla de permisos (`tipo_permiso = 'conducir'`), no
 * escribiendo el rol: la app nunca asigna roles.
 */

const SDK_URL =
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js";

let cliente = null;
let cargando = null;

export function config() {
  const url = window.ALL_CANCUN_SUPABASE_URL;
  const clave = window.ALL_CANCUN_SUPABASE_ANON_KEY;
  if (!url || !clave) throw new Error("Falta config.js: revisa las credenciales de Supabase.");
  return { url, clave };
}

function cargarSdk() {
  return new Promise((resolver, rechazar) => {
    if (window.supabase?.createClient) return resolver();

    const previo = document.querySelector(`script[src="${SDK_URL}"]`);
    if (previo) {
      previo.addEventListener("load", () => resolver());
      previo.addEventListener("error", () => rechazar(new Error("No se pudo cargar supabase-js")));
      return;
    }

    const script = document.createElement("script");
    script.src = SDK_URL;
    script.async = true;
    script.onload = () => resolver();
    script.onerror = () => rechazar(new Error("No se pudo cargar supabase-js"));
    document.head.appendChild(script);
  });
}

/** Cliente singleton. Lanza si faltan credenciales o no hay red para el SDK. */
export async function getSupabase() {
  if (cliente) return cliente;

  cargando =
    cargando ||
    (async () => {
      await cargarSdk();
      const { url, clave } = config();
      cliente = window.supabase.createClient(url, clave, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          flowType: "pkce",
        },
      });
      return cliente;
    })();

  try {
    return await cargando;
  } catch (err) {
    cargando = null;
    throw err;
  }
}

/* ---------------- Cuenta ---------------- */

export async function sesionActual() {
  const sb = await getSupabase();
  const { data } = await sb.auth.getSession();
  return data.session || null;
}

export async function registrarConCorreo(correo, contrasena) {
  const sb = await getSupabase();
  const { data, error } = await sb.auth.signUp({
    email: correo.trim().toLowerCase(),
    password: contrasena,
  });
  if (error) throw error;

  /* Si el proyecto exige confirmar el correo no hay sesión todavía:
     se avisa para que el conductor revise su bandeja. */
  if (!data.session) return { pendienteConfirmar: true, usuario: data.user };
  return { pendienteConfirmar: false, usuario: data.user };
}

export async function entrarConCorreo(correo, contrasena) {
  const sb = await getSupabase();
  const { data, error } = await sb.auth.signInWithPassword({
    email: correo.trim().toLowerCase(),
    password: contrasena,
  });
  if (error) throw error;
  return data.session;
}

export async function salir() {
  const sb = await getSupabase();
  await sb.auth.signOut();
}

/** Avisa cada cambio de sesión. Devuelve la función para dejar de escuchar. */
export async function alCambiarSesion(callback) {
  const sb = await getSupabase();
  const { data } = sb.auth.onAuthStateChange((evento, sesion) => callback(sesion || null, evento));
  return () => data.subscription.unsubscribe();
}

/* ---------------- Perfil y permiso ---------------- */

const CAMPOS_PERFIL = "id,rol,apodo,nombre_completo,foto_perfil_url,telefono";

/** Perfil del usuario. RLS limita la fila a id = auth.uid(). */
export async function leerPerfil(usuarioId) {
  const sb = await getSupabase();
  const { data, error } = await sb
    .from("perfiles")
    .select(CAMPOS_PERFIL)
    .eq("id", usuarioId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

/**
 * true si la cuenta tiene el permiso 'conducir'.
 * Se consulta la tabla de permisos, no se escribe el rol: el rol lo asigna
 * solo el sistema (trigger) y la app nunca lo toca.
 */
export async function tienePermisoConducir(perfilId) {
  const sb = await getSupabase();
  const { data, error } = await sb
    .from("permisos")
    .select("tipo")
    .eq("perfil_id", perfilId)
    .eq("tipo", "conducir")
    .maybeSingle();
  if (error) return false;
  return Boolean(data);
}

/* ---------------- Viajes ---------------- */

const CAMPOS_VIAJE =
  "id,folio,estado,origen,destino,precio_centavos,distancia_km,creado_en," +
  "programado_para,cliente_nombre,cliente_telefono,conductor_id";

/** Viajes asignados al perfil. Los más recientes primero. */
export async function viajesDeConductor(conductorId) {
  const sb = await getSupabase();
  const { data, error } = await sb
    .from("viajes")
    .select(CAMPOS_VIAJE)
    .eq("conductor_id", conductorId)
    .order("creado_en", { ascending: false })
    .limit(50);
  if (error) throw error;
  return data || [];
}

/**
 * Cambia el estado de un viaje propio. El filtro por conductor_id es la red:
 * aunque alguien manipule el navegador, solo puede tocar sus viajes.
 */
export async function actualizarEstado(viajeId, conductorId, estado) {
  const sb = await getSupabase();
  const { data, error } = await sb
    .from("viajes")
    .update({ estado })
    .eq("id", viajeId)
    .eq("conductor_id", conductorId)
    .select(CAMPOS_VIAJE)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("No se pudo actualizar: el viaje no es tuyo o ya cambió de estado.");
  return data;
}

export const soloDigitos = (v) => String(v || "").replace(/\D/g, "");
