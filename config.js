/**
 * All Cancún Conductores — Configuración
 *
 * Es la MISMA base de datos que la PWA del cliente y el panel de comercios.
 * Lo que cambia es la cara, no el backend: RLS decide qué filas ve cada quien.
 *
 * La anon/publishable key es pública por diseño. La seguridad la da RLS en
 * Postgres. Nunca poner aquí una service_role key ni claves de escritura R2.
 */

window.ALL_CANCUN_SUPABASE_URL = "https://djyrqcjvcibnhvwwarlq.supabase.co";
window.ALL_CANCUN_SUPABASE_ANON_KEY = "sb_publishable_i-ysyzM729ZSxO9TtVjp_Q_CTuR39Kt";

/* Fotos: solo la base pública de lectura. Las claves de escritura viven en
   el Worker, nunca en el navegador. */
window.ALL_CANCUN_FOTOS_URL = "https://pub-29c2c6b56ddd4b2681e97331c0334d1f.r2.dev";
window.ALL_CANCUN_FOTOS_WORKER = "https://all-cancun-fotos.auraradio-cloud.workers.dev";
