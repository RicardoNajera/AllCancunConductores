/**
 * All Conductor — Cliente de Supabase
 *
 * Igual que en All Cancún: las credenciales se leen de config.js, que
 * NO se versiona. La anon key es pública por diseño; la seguridad real
 * la da RLS en Postgres.
 *
 *   // config.js
 *   window.ALL_CONDUCTOR_SUPABASE_URL = "https://xxxx.supabase.co";
 *   window.ALL_CONDUCTOR_SUPABASE_ANON_KEY = "eyJhbGciOi...";
 */

const config = () => ({
  url: String(window.ALL_CONDUCTOR_SUPABASE_URL || '').trim(),
  anonKey: String(window.ALL_CONDUCTOR_SUPABASE_ANON_KEY || '').trim()
});

export const isConfigured = () => {
  const { url, anonKey } = config();
  return Boolean(url && anonKey);
};

let client = null;
let loading = null;

/**
 * Devuelve el cliente listo (singleton). Carga el SDK desde el CDN oficial
 * la primera vez, así no hace falta bundler ni dependencias nuevas.
 * Devuelve null si faltan credenciales.
 */
export async function getSupabase() {
  if (client) return client;
  if (!isConfigured()) return null;

  loading =
    loading ||
    (async () => {
      if (!window.supabase?.createClient) await loadSdk();
      const { url, anonKey } = config();
      client = window.supabase.createClient(url, anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          flowType: 'pkce'
        }
      });
      return client;
    })();

  try {
    return await loading;
  } catch {
    loading = null;
    return null;
  }
}

const SDK_URL =
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';

function loadSdk() {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${SDK_URL}"]`);
    if (existing) {
      if (window.supabase?.createClient) return resolve();
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('supabase sdk')));
      return;
    }
    const script = document.createElement('script');
    script.src = SDK_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('No se pudo cargar supabase-js'));
    document.head.appendChild(script);
  });
}

/* ---- Sesión ---- */

export async function getSession() {
  const supabase = await getSupabase();
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session || null;
}

/** Escucha cambios de sesión. Devuelve la función para dejar de escuchar. */
export async function onAuthChange(callback) {
  const supabase = await getSupabase();
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    callback(session || null, event);
  });
  return () => data.subscription.unsubscribe();
}

/* ---- OAuth social ---- */

/* Solo se listan los proveedores realmente activados en Supabase
   (Authentication → Providers). Si activas otro más adelante, agrégalo aquí. */
export const PROVIDERS = [{ id: 'google', label: 'Google' }];

/**
 * Abre el flujo OAuth del proveedor. La página se va del sitio y vuelve
 * a la misma URL con la sesión en el hash; el SDK la recoge solo
 * (detectSessionInUrl: true) y dispara onAuthChange.
 *
 * La URL de retorno debe estar en Authentication → URL Configuration →
 * Redirect URLs, o Supabase la rechaza.
 */
export async function signInWithProvider(provider) {
  const supabase = await getSupabase();
  if (!supabase) return { error: 'Falta configurar Supabase.' };
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      /* Vuelve exactamente a la página donde se inició sesión
         (localhost o GitHub Pages). */
      redirectTo: window.location.origin + window.location.pathname,
      queryParams: { prompt: 'select_account' }
    }
  });
  return { error: error?.message || null };
}

export async function signOut() {
  const supabase = await getSupabase();
  if (!supabase) return { error: 'Falta configurar Supabase.' };
  const { error } = await supabase.auth.signOut();
  return { error: error?.message || null };
}

/* ---- Perfiles (public.perfiles) ---- */

/* La tabla conductores referencia perfiles(id). Un usuario que entra por
   primera vez con Google todavía no tiene fila ahí, así que se crea antes
   de crear la ficha de conductor o se rompería la llave foránea. */

const PROFILE_FIELDS = ['id', 'rol', 'apodo', 'nombre_completo', 'foto_perfil_url'];
const PROFILE_SELECT = PROFILE_FIELDS.join(',');

/** Apodo válido: minúsculas, sin acentos ni espacios, 3-32 caracteres.
 *  Espeja el CHECK y la función normalizar_apodo() de la base. */
export function normalizarApodo(valor) {
  if (typeof valor !== 'string') return '';
  return valor
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9._-]/g, '')
    .slice(0, 32);
}

export function apodoValido(valor) {
  return /^[a-z0-9._-]{3,32}$/.test(String(valor || ''));
}

export async function getProfile(userId) {
  const supabase = await getSupabase();
  if (!supabase || !userId) return { profile: null, error: 'Sin sesión.' };

  const { data, error } = await supabase
    .from('perfiles')
    .select(PROFILE_SELECT)
    .eq('id', userId)
    .maybeSingle();

  return { profile: data || null, error: error?.message || null };
}

/**
 * Garantiza que exista la fila en public.perfiles. Si el trigger de alta
 * ya la generó, la devuelve tal cual.
 *
 * No se envía `rol`: es enum rol_usuario NOT NULL con default 'cliente'
 * y cambiarlo es un privilegio del sistema. Que el usuario sea conductor
 * lo determina su fila en public.conductores, no el rol del perfil.
 */
export async function ensureProfile(user) {
  const supabase = await getSupabase();
  if (!supabase || !user?.id) return { profile: null, error: 'Sin sesión.' };

  const existing = await getProfile(user.id);
  if (existing.profile) return existing;

  /* Si la consulta falla (RLS sin configurar) se devuelve el error pero
     con profile null: el login no se cae por esto. */
  const meta = user.user_metadata || {};
  const candidato =
    normalizarApodo(
      meta.preferred_username || meta.given_name || meta.name || user.email?.split('@')[0] || ''
    ) || null;

  const { data, error } = await supabase
    .from('perfiles')
    .insert({
      id: user.id,
      apodo: apodoValido(candidato) ? candidato : null,
      nombre_completo: meta.full_name || meta.name || null,
      foto_perfil_url: meta.avatar_url || meta.picture || null
    })
    .select(PROFILE_SELECT)
    .maybeSingle();

  return { profile: data || null, error: error?.message || null };
}
