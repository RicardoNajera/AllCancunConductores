/**
 * All Conductor — Configuración
 *
 * Credenciales públicas que necesita el navegador para funcionar.
 *
 * La anon key de Supabase es pública por diseño (viaja en el bundle de
 * cualquier app web con Supabase). La seguridad real la da RLS en
 * Postgres: cada fila se protege por políticas en la base, no ocultando
 * la clave.
 *
 * Nunca poner aquí una service_role key: esa sí es secreta y solo vive
 * en el servidor.
 */

window.ALL_CONDUCTOR_SUPABASE_URL = "https://djyrqcjvcibnhvwwarlq.supabase.co";
window.ALL_CONDUCTOR_SUPABASE_ANON_KEY = "sb_publishable_i-ysyzM729ZSxO9TtVjp_Q_CTuR39Kt";
