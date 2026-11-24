/**
 * All Cancún Conductores
 *
 * Panel del conductor. Cuenta real con Google (Supabase Auth),
 * perfil en public.perfiles y permiso de conducir en public.permisos.
 * Los viajes son los que tiene asignados su perfil.
 *
 * Sin framework ni build: HTML + módulos nativos, como las otras dos PWA.
 */

import {
  getSupabase,
  sesionActual,
  entrarConGoogle,
  salir,
  alCambiarSesion,
  leerPerfil,
  tienePermisoConducir,
  viajesDeConductor,
  actualizarEstado,
  soloDigitos,
} from "./supabase.js";

const $ = (sel, raiz = document) => raiz.querySelector(sel);

const memoria = {
  sesion: null,
  perfil: null,
  permiteConducir: false,
  viajes: [],
  pestaña: "viajes",
  cargando: false,
  error: "",
};

const ACTIVOS = ["asignado", "aceptado", "en_curso"];

const ETIQUETAS = {
  asignado: "Nuevo",
  aceptado: "Aceptado",
  en_curso: "En curso",
  completado: "Completado",
  cancelado: "Cancelado",
};

const centavosATexto = (centavos) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(
    (Number(centavos) || 0) / 100
  );

const escapar = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);

const primerNombre = (p) =>
  (p?.nombre_completo || p?.apodo || "conductor").split(" ")[0];

/* ---------------- Vistas de cuenta ---------------- */

const ICONO_GOOGLE = `
  <svg class="google__logo" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
  </svg>`;

function vistaEntrada(aviso = "") {
  return `
    <div class="acceso">
      <div class="acceso__marca">
        <img class="acceso__logo" src="icons/icon-192.png" alt="" width="88" height="88" />
        <h1 class="acceso__titulo">All Cancún</h1>
        <p class="acceso__lema">Conductores</p>
      </div>

      <p class="acceso__texto">
        Entra con tu cuenta de Google para ver los viajes que te asigna la central.
      </p>

      ${aviso ? `<div class="aviso" role="alert">${escapar(aviso)}</div>` : ""}

      <button class="google" id="btn-google" type="button">
        ${ICONO_GOOGLE}
        <span>Continuar con Google</span>
      </button>

      <p class="acceso__nota">
        Solo entran conductores dados de alta en la central. Si tu cuenta
        todavía no está autorizada, pide que activen tu permiso.
      </p>
    </div>
  `;
}

function vistaSinPermiso() {
  const p = memoria.perfil || {};
  return `
    <h1>Hola, ${escapar(primerNombre(p))}</h1>
    <div class="aviso">
      Tu cuenta existe, pero todavía <strong>no tiene el permiso de conducir</strong>.
      Pide a la central que te lo activen y vuelve a abrir la app.
    </div>
    <div class="card">
      <div class="fila"><span>Cuenta</span><strong>${escapar(p.nombre_completo || p.apodo || "—")}</strong></div>
      <div class="fila"><span>Permiso</span><strong>Conducir: pendiente</strong></div>
    </div>
    <button class="btn btn--ghost" id="btn-cerrar" type="button">Cerrar sesión</button>
  `;
}


function vistaViajes() {
  if (memoria.cargando) return `<h1>Mis viajes</h1><div class="cargando">Cargando</div>`;

  const activos = memoria.viajes.filter((v) => ACTIVOS.includes(v.estado));
  const historial = memoria.viajes.filter((v) => !ACTIVOS.includes(v.estado));

  const bloqueActivo = activos.length
    ? activos.map(tarjetaViaje).join("")
    : `<div class="card vacio"><span class="vacio__icono">🛣️</span>
         <div>No tienes viajes pendientes.</div>
         <div class="sutil" style="margin-top:6px">Te avisamos aquí cuando te asignen uno.</div>
       </div>`;

  const bloqueHistorial = historial.length
    ? `<h2>Historial</h2>${historial.slice(0, 10).map(tarjetaViaje).join("")}`
    : "";

  return `
    <h1>Hola, ${escapar(primerNombre(memoria.perfil))}</h1>
    ${bloqueActivo}
    ${bloqueHistorial}
  `;
}

function tarjetaViaje(v) {
  const estado = String(v.estado || "");
  const etiqueta = ETIQUETAS[estado] || estado || "—";
  const distancia = v.distancia_km ? `${Number(v.distancia_km).toFixed(1)} km` : "";
  const cuando = v.programado_para || v.creado_en;
  const fecha = cuando
    ? new Date(cuando).toLocaleString("es-MX", {
        day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
      })
    : "";

  let acciones = "";
  if (estado === "asignado") {
    acciones = `
      <div class="acciones">
        <button class="btn btn--ghost" type="button" data-accion="rechazar" data-id="${escapar(v.id)}">Rechazar</button>
        <button class="btn" type="button" data-accion="aceptar" data-id="${escapar(v.id)}">Aceptar</button>
      </div>`;
  } else if (estado === "aceptado") {
    acciones = `
      <div class="acciones">
        <button class="btn btn--ghost" type="button" data-accion="cancelar" data-id="${escapar(v.id)}">Cancelar</button>
        <button class="btn btn--azul" type="button" data-accion="iniciar" data-id="${escapar(v.id)}">Iniciar viaje</button>
      </div>`;
  } else if (estado === "en_curso") {
    acciones = `
      <div class="acciones">
        <button class="btn btn--ghost" type="button" data-accion="llamar" data-tel="${escapar(v.cliente_telefono)}">Llamar</button>
        <button class="btn" type="button" data-accion="finalizar" data-id="${escapar(v.id)}">Terminar</button>
      </div>`;
  }

  return `
    <article class="card">
      <div class="viaje__top">
        <span class="viaje__folio">${escapar(v.folio || v.id?.slice(0, 8) || "")}</span>
        <span class="viaje__estado viaje__estado--${escapar(estado)}">${escapar(etiqueta)}</span>
      </div>
      <div class="ruta">
        <div class="ruta__linea">
          <span class="ruta__punto ruta__punto--a"></span>
          <span class="ruta__texto"><span class="ruta__etiqueta">Recoger</span>${escapar(v.origen || "Sin origen")}</span>
        </div>
        <div class="ruta__linea">
          <span class="ruta__punto ruta__punto--b"></span>
          <span class="ruta__texto"><span class="ruta__etiqueta">Llevar</span>${escapar(v.destino || "Sin destino")}</span>
        </div>
      </div>
      <div class="viaje__meta">
        <span class="viaje__precio">${centavosATexto(v.precio_centavos)}</span>
        ${distancia ? `<span>· ${distancia}</span>` : ""}
        ${fecha ? `<span>· ${escapar(fecha)}</span>` : ""}
      </div>
      ${acciones}
    </article>`;
}

function vistaGanancias() {
  const hechos = memoria.viajes.filter((v) => v.estado === "completado");
  const hoy = new Date().toDateString();
  const ahora = new Date();

  const deHoy = hechos.filter((v) => new Date(v.creado_en).toDateString() === hoy);
  const delMes = hechos.filter((v) => {
    const f = new Date(v.creado_en);
    return f.getMonth() === ahora.getMonth() && f.getFullYear() === ahora.getFullYear();
  });

  const suma = (lista) => lista.reduce((s, v) => s + (Number(v.precio_centavos) || 0), 0);

  return `
    <h1>Ganancias</h1>
    <div class="card">
      <div class="fila"><span>Viajes hoy</span><strong>${deHoy.length}</strong></div>
      <div class="fila"><span>Hoy</span><strong>${centavosATexto(suma(deHoy))}</strong></div>
      <div class="fila"><span>Este mes</span><strong>${centavosATexto(suma(delMes))}</strong></div>
      <div class="fila"><span>Completados</span><strong>${hechos.length}</strong></div>
    </div>
    <p class="sutil">Solo cuentan los viajes marcados como completados.</p>
  `;
}

function vistaPerfil() {
  const p = memoria.perfil || {};
  return `
    <h1>Mi perfil</h1>
    <div class="card">
      <div class="fila"><span>Nombre</span><strong>${escapar(p.nombre_completo || "—")}</strong></div>
      <div class="fila"><span>Apodo</span><strong>${escapar(p.apodo || "—")}</strong></div>
      <div class="fila"><span>Correo</span><strong>${escapar(memoria.sesion?.user?.email || "—")}</strong></div>
      <div class="fila"><span>Permiso conducir</span><strong>${memoria.permiteConducir ? "Activo" : "Pendiente"}</strong></div>
    </div>
    <button class="btn btn--ghost" id="btn-cerrar" type="button">Cerrar sesión</button>
    <p class="sutil" style="margin-top:16px">All Cancún Conductores · versión 1.0</p>
  `;
}

/* ---------------- Pintado ---------------- */

let avisoEntrada = "";

function pintar() {
  const vista = $("#vista");
  const dock = $("#dock");
  const btnSalir = $("#btn-salir");
  const pill = $("#estado-conexion");

  const dentro = Boolean(memoria.sesion) && memoria.permiteConducir;
  dock.hidden = !dentro;
  btnSalir.hidden = !dentro;

  if (pill) {
    pill.textContent = memoria.sesion ? "Conectado" : "Sin sesión";
    pill.classList.toggle("pill--on", Boolean(memoria.sesion));
  }

  if (!memoria.sesion) {
    vista.innerHTML = vistaEntrada(avisoEntrada);
    conectarEventosCuenta();
    return;
  }

  if (!memoria.permiteConducir) {
    vista.innerHTML = vistaSinPermiso();
    $("#btn-cerrar")?.addEventListener("click", cerrarSesion);
    return;
  }

  if (memoria.pestaña === "ganancias") vista.innerHTML = vistaGanancias();
  else if (memoria.pestaña === "perfil") vista.innerHTML = vistaPerfil();
  else vista.innerHTML = vistaViajes();

  $("#btn-cerrar")?.addEventListener("click", cerrarSesion);

  document.querySelectorAll(".dock__item").forEach((b) => {
    b.classList.toggle("is-active", b.dataset.tab === memoria.pestaña);
  });
}

function conectarEventosCuenta() {
  $("#btn-google")?.addEventListener("click", entrarConGoogleDesdeUi);
}

/* ---------------- Acciones de cuenta ---------------- */

/** Traduce los errores más comunes de Supabase Auth a algo entendible. */
function mensajePorError(err, porDefecto = "") {
  const m = String(err?.message || err || "").toLowerCase();
  if (m.includes("provider is not enabled"))
    return "Google no está activo en Supabase (Authentication → Providers).";
  if (m.includes("redirect") && m.includes("not allowed"))
    return "Falta autorizar esta dirección en Supabase (URL Configuration).";
  if (m.includes("popup") || m.includes("closed by user"))
    return "Se cerró la ventana de Google. Intenta otra vez.";
  if (m.includes("failed to fetch") || m.includes("network"))
    return "Sin conexión. Revisa tu internet.";
  return porDefecto || err?.message || "Algo salió mal. Intenta de nuevo.";
}

async function entrarConGoogleDesdeUi() {
  const boton = $("#btn-google");
  if (boton?.disabled) return;

  avisoEntrada = "";
  if (boton) {
    boton.disabled = true;
    boton.classList.add("google--cargando");
    boton.querySelector("span").textContent = "Abriendo Google…";
  }

  try {
    /* Redirige a Google: la página se va y vuelve con la sesión puesta. */
    await entrarConGoogle();
  } catch (err) {
    avisoEntrada = mensajePorError(err, "No se pudo abrir Google.");
    pintar();
  }
}


/* ---------------- Sesión y datos ---------------- */

async function arrancarSesion() {
  memoria.error = "";
  const sesion = await sesionActual();

  if (!sesion) {
    memoria.sesion = null;
    pintar();
    return;
  }

  memoria.sesion = sesion;

  try {
    memoria.perfil = await leerPerfil(sesion.user.id);
    memoria.permiteConducir = memoria.perfil ? await tienePermisoConducir(memoria.perfil.id) : false;
  } catch (err) {
    memoria.permiteConducir = false;
    memoria.error = err.message;
  }

  pintar();

  if (memoria.permiteConducir) await cargarViajes();
  else if (memoria.perfil) {
    /* Sin permiso todavía: se reintenta al volver a la app, por si la
       central ya lo activó mientras estaba abierta. */
    setTimeout(() => {
      if (memoria.sesion && !memoria.permiteConducir) arrancarSesion().catch(() => {});
    }, 60000);
  }
}

async function cargarViajes() {
  if (!memoria.perfil || !memoria.permiteConducir) return;
  memoria.cargando = true;
  pintar();

  try {
    memoria.viajes = await viajesDeConductor(memoria.perfil.id);
  } catch (err) {
    console.error(err);
  } finally {
    memoria.cargando = false;
    pintar();
  }
}

async function cerrarSesion() {
  try {
    await salir();
  } catch {
    /* Si falla la red, la sesión local igual se borra abajo. */
  }
  memoria.sesion = null;
  memoria.perfil = null;
  memoria.permiteConducir = false;
  memoria.viajes = [];
  avisoEntrada = "";
  pintar();
}

/* ---------------- Acciones de viaje ---------------- */

const SIGUIENTE = {
  aceptar: "aceptado",
  iniciar: "en_curso",
  finalizar: "completado",
  cancelar: "cancelado",
  rechazar: "cancelado",
};

async function accionar(evento) {
  const boton = evento.target.closest("[data-accion]");
  if (!boton) return;

  const { accion, id, tel } = boton.dataset;

  if (accion === "llamar") {
    if (tel) location.href = `tel:${soloDigitos(tel)}`;
    return;
  }

  const nuevoEstado = SIGUIENTE[accion];
  if (!nuevoEstado || !id) return;

  /* Doble toque accidental: se bloquea el grupo mientras se guarda. */
  const grupo = boton.closest(".acciones") || boton;
  grupo.querySelectorAll("button").forEach((b) => (b.disabled = true));
  boton.textContent = "Guardando…";

  try {
    await actualizarEstado(id, memoria.perfil.id, nuevoEstado);
    await cargarViajes();
    if (nuevoEstado === "completado" && navigator.vibrate) navigator.vibrate(60);
  } catch (err) {
    alert(mensajePorError(err, "No se pudo actualizar el viaje."));
    pintar();
  }
}

/* ---------------- Arranque ---------------- */

async function iniciar() {
  $("#dock")?.addEventListener("click", (e) => {
    const boton = e.target.closest("[data-tab]");
    if (!boton) return;
    memoria.pestaña = boton.dataset.tab;
    pintar();
  });

  $("#vista")?.addEventListener("click", (e) => {
    if (e.target.closest("[data-accion]")) accionar(e);
  });

  $("#btn-salir")?.addEventListener("click", () => {
    if (confirm("¿Cerrar sesión en este teléfono?")) cerrarSesion();
  });

  window.addEventListener("online", () => pintar());
  window.addEventListener("offline", () => pintar());

  try {
    await getSupabase();

    /* Al volver de confirmar el correo, la sesión ya viene puesta (PKCE). */
    alCambiarSesion(() => {
      if (memoria.sesion === null) arrancarSesion().catch(() => {});
    });

    await arrancarSesion();
  } catch (err) {
    avisoEntrada = mensajePorError(err, "No pudimos conectar con Supabase.");
    pintar();
  }

  /* Refresco silencioso mientras la pestaña está visible. */
  setInterval(() => {
    if (memoria.permiteConducir && document.visibilityState === "visible") cargarViajes();
  }, 30000);

  if ("serviceWorker" in navigator && location.hostname !== "127.0.0.1" && location.hostname !== "localhost") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

iniciar();
