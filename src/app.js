/**
 * All Cancún Conductores
 *
 * Panel del conductor: entra con su teléfono, ve los viajes que le tocan,
 * acepta o rechaza y marca inicio/fin. Pide todo al mismo Supabase que el
 * resto de All Cancún; aquí no hay backend propio.
 *
 * Sin framework ni build: HTML + módulos nativos, como las otras dos PWA.
 */

import {
  buscarConductor,
  viajesDeConductor,
  actualizarEstado,
  soloDigitos,
} from "./supabase.js";

const LLAVE_SESION = "all-cancun-conductor";

const $ = (sel, raiz = document) => raiz.querySelector(sel);

const memoria = {
  conductor: null,
  viajes: [],
  pestaña: "viajes",
  cargando: false,
};

const centavosATexto = (centavos) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(
    (Number(centavos) || 0) / 100
  );

const escapar = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);

/* ---------------- Sesión ---------------- */

function leerSesion() {
  try {
    const crudo = localStorage.getItem(LLAVE_SESION);
    if (!crudo) return null;
    const datos = JSON.parse(crudo);
    return datos?.id ? datos : null;
  } catch {
    return null;
  }
}

function guardarSesion(conductor) {
  localStorage.setItem(LLAVE_SESION, JSON.stringify(conductor));
  memoria.conductor = conductor;
}

function cerrarSesion() {
  localStorage.removeItem(LLAVE_SESION);
  memoria.conductor = null;
  memoria.viajes = [];
  pintar();
}

/* ---------------- Filtros ---------------- */

const ACTIVOS = ["asignado", "aceptado", "en_curso"];

const ETIQUETAS = {
  asignado: "Nuevo",
  aceptado: "Aceptado",
  en_curso: "En curso",
  completado: "Completado",
  cancelado: "Cancelado",
};

const ORDEN = ["asignado", "aceptado", "en_curso", "completado", "cancelado"];

/* ---------------- Vistas ---------------- */

function vistaEntrada(error = "") {
  return `
    <h1>Entrar</h1>
    <p class="sutil">Escribe el teléfono con el que te registró All Cancún. Te mandamos a tus viajes, sin contraseña.</p>
    ${error ? `<div class="aviso">${escapar(error)}</div>` : ""}
    <div class="card">
      <label for="tel">Teléfono</label>
      <input id="tel" type="tel" inputmode="numeric" autocomplete="tel"
             placeholder="10 dígitos" maxlength="15" value="">
      <button class="btn" id="btn-entrar" type="button">Ver mis viajes</button>
    </div>
    <p class="sutil">Si tu número no aparece, pide a la central que te den de alta como conductor.</p>
  `;
}

function tarjetaViaje(v) {
  const estado = String(v.estado || "");
  const etiqueta = ETIQUETAS[estado] || estado || "—";
  const precio = centavosATexto(v.precio_centavos);
  const distancia = v.distancia_km ? `${Number(v.distancia_km).toFixed(1)} km` : "";
  const cuando = v.programado_para || v.creado_en;

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
        <span class="viaje__precio">${precio}</span>
        ${distancia ? `<span>· ${distancia}</span>` : ""}
        ${cuando ? `<span>· ${escapar(new Date(cuando).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }))}</span>` : ""}
      </div>
      ${acciones}
    </article>`;
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
    <h1>Hola, ${escapar(memoria.conductor?.nombre?.split(" ")[0] || "conductor")}</h1>
    ${bloqueActivo}
    ${bloqueHistorial}
  `;
}

function vistaGanancias() {
  const hechos = memoria.viajes.filter((v) => v.estado === "completado");
  const hoy = new Date().toDateString();

  const deHoy = hechos.filter((v) => new Date(v.creado_en).toDateString() === hoy);
  const totalHoy = deHoy.reduce((s, v) => s + (Number(v.precio_centavos) || 0), 0);
  const totalMes = hechos
    .filter((v) => {
      const f = new Date(v.creado_en);
      const ahora = new Date();
      return f.getMonth() === ahora.getMonth() && f.getFullYear() === ahora.getFullYear();
    })
    .reduce((s, v) => s + (Number(v.precio_centavos) || 0), 0);

  return `
    <h1>Ganancias</h1>
    <div class="card">
      <div class="fila"><span>Viajes hoy</span><strong>${deHoy.length}</strong></div>
      <div class="fila"><span>Hoy</span><strong>${centavosATexto(totalHoy)}</strong></div>
      <div class="fila"><span>Este mes</span><strong>${centavosATexto(totalMes)}</strong></div>
      <div class="fila"><span>Viajes completados</span><strong>${hechos.length}</strong></div>
    </div>
    <p class="sutil">Cuenta solo los viajes marcados como completados desde esta app.</p>
  `;
}

function vistaPerfil() {
  const c = memoria.conductor || {};
  return `
    <h1>Mi perfil</h1>
    <div class="card">
      <div class="fila"><span>Nombre</span><strong>${escapar(c.nombre || "—")}</strong></div>
      <div class="fila"><span>Teléfono</span><strong>${escapar(c.telefono || "—")}</strong></div>
      <div class="fila"><span>Estado</span><strong>${c.activo === false ? "Inactivo" : "Activo"}</strong></div>
    </div>
    <button class="btn btn--ghost" id="btn-cerrar" type="button">Cerrar sesión</button>
    <p class="sutil" style="margin-top:16px">All Cancún Conductores · versión 1.0</p>
  `;
}

/* ---------------- Pintado y eventos ---------------- */

let errorVisible = "";

function pintar() {
  const vista = $("#vista");
  const dock = $("#dock");
  const salir = $("#btn-salir");
  const haySesion = Boolean(memoria.conductor);

  dock.hidden = !haySesion;
  salir.hidden = !haySesion;

  if (!haySesion) {
    vista.innerHTML = vistaEntrada(errorVisible);
    $("#btn-entrar")?.addEventListener("click", entrar);
    $("#tel")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") entrar();
    });
    return;
  }

  errorVisible = "";

  if (memoria.pestaña === "ganancias") vista.innerHTML = vistaGanancias();
  else if (memoria.pestaña === "perfil") vista.innerHTML = vistaPerfil();
  else vista.innerHTML = vistaViajes();

  $("#btn-cerrar")?.addEventListener("click", cerrarSesion);

  document.querySelectorAll(".dock__item").forEach((b) => {
    b.classList.toggle("is-active", b.dataset.tab === memoria.pestaña);
  });
}

async function entrar() {
  const campo = $("#tel");
  const boton = $("#btn-entrar");
  const tel = soloDigitos(campo?.value);

  if (tel.length < 10) {
    errorVisible = "Escribe tu teléfono completo (10 dígitos).";
    pintar();
    return;
  }

  boton.disabled = true;
  boton.textContent = "Buscando…";

  try {
    const conductor = await buscarConductor(tel);
    if (!conductor) {
      errorVisible = "Ese número no está registrado como conductor.";
      pintar();
      return;
    }
    if (conductor.activo === false) {
      errorVisible = "Tu cuenta está inactiva. Habla con la central.";
      pintar();
      return;
    }
    guardarSesion(conductor);
    await cargarViajes();
  } catch (err) {
    errorVisible = `No pudimos entrar: ${err.message}`;
    pintar();
  }
}

async function cargarViajes() {
  if (!memoria.conductor) return;
  memoria.cargando = true;
  pintar();

  try {
    memoria.viajes = await viajesDeConductor(memoria.conductor.id);
    marcarConexion(true);
  } catch (err) {
    marcarConexion(false);
    errorVisible = "";
    console.error(err);
  } finally {
    memoria.cargando = false;
    pintar();
  }
}

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

  // Doble toque accidental: se bloquea el grupo mientras se guarda.
  const grupo = boton.closest(".acciones") || boton;
  grupo.querySelectorAll("button").forEach((b) => (b.disabled = true));
  boton.textContent = "Guardando…";

  try {
    await actualizarEstado(id, memoria.conductor.id, nuevoEstado);
    await cargarViajes();
    if (nuevoEstado === "completado" && navigator.vibrate) navigator.vibrate(60);
  } catch (err) {
    alert(err.message);
    grupo.querySelectorAll("button").forEach((b) => (b.disabled = false));
    pintar();
  }
}

function marcarConexion(activa) {
  const pill = $("#estado-conexion");
  if (!pill) return;
  pill.textContent = activa ? "Conectado" : "Sin conexión";
  pill.classList.toggle("pill--on", activa);
}

/* ---------------- Arranque ---------------- */

function iniciar() {
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

  window.addEventListener("online", () => marcarConexion(true));
  window.addEventListener("offline", () => marcarConexion(false));

  const guardada = leerSesion();
  if (guardada) {
    memoria.conductor = guardada;
    cargarViajes();
  } else {
    pintar();
  }

  // Refresco silencioso mientras la pestaña está visible.
  setInterval(() => {
    if (memoria.conductor && document.visibilityState === "visible") cargarViajes();
  }, 30000);

  if ("serviceWorker" in navigator && location.hostname !== "127.0.0.1" && location.hostname !== "localhost") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

iniciar();
