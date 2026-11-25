/**
 * All Cancún Conductores
 *
 * La app del conductor: recibe viajes de la central igual que Uber o DiDi
 * (oferta con cuenta regresiva, aceptar / rechazar), los lleva paso a paso
 * y al final ve cuánto ganó hoy y en el mes.
 *
 * Cuenta real con Google (Supabase Auth), perfil en public.perfiles y
 * permiso de conducir en public.permisos. RLS decide qué ve cada quien.
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

/* Segundos que el conductor tiene para responder una oferta. Igual que en
   las apps de la competencia: si no contesta, el viaje se va a otro. */
const SEGUNDOS_OFERTA = 25;

const ACTIVOS = ["asignado", "aceptado", "en_curso"];

const ETIQUETAS = {
  asignado: "Nuevo",
  aceptado: "Vas en camino",
  en_curso: "Con pasajero",
  completado: "Completado",
  cancelado: "Cancelado",
};

const memoria = {
  sesion: null,
  perfil: null,
  permiteConducir: false,
  viajes: [],
  pestaña: "viajes",
  cargando: false,
  error: "",
  ofertaCerrada: "", // id de la oferta que ya descartó
  hoja: "", // "" | "rechazar" | "finalizar"
  hojaId: "", // viaje que se está confirmando en la hoja
};

let avisoEntrada = "";
let temporizador = null;

/* ---------------- Formato ---------------- */

const centavosATexto = (centavos) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format((Number(centavos) || 0) / 100);

const kilometros = (km) => (km ? `${Number(km).toFixed(1)} km` : "");

const escapar = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);

const primerNombre = (p) =>
  (p?.nombre_completo || p?.apodo || "conductor").trim().split(" ")[0];

const inicial = (p) => (primerNombre(p).charAt(0) || "C").toUpperCase();

const hora = (iso) =>
  iso
    ? new Date(iso).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })
    : "";

const fechaCorta = (iso) =>
  iso
    ? new Date(iso).toLocaleDateString("es-MX", { day: "2-digit", month: "short" })
    : "";

const saludo = () => {
  const h = new Date().getHours();
  if (h < 12) return "Buenos días";
  if (h < 19) return "Buenas tardes";
  return "Buenas noches";
};

const segundosRestantes = (viaje) => {
  if (!viaje?.creado_en) return SEGUNDOS_OFERTA;
  const paso = (Date.now() - new Date(viaje.creado_en).getTime()) / 1000;
  return Math.max(0, Math.round(SEGUNDOS_OFERTA - paso));
};


/* ---------------- Iconos ---------------- */

const ICONO_GOOGLE = `
  <svg class="google__logo" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
  </svg>`;

const ICONO_AUTO = `
  <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor"
       stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M3 17h2l2-6h10l2 6h2" />
    <circle cx="7.5" cy="18.5" r="1.6" />
    <circle cx="16.5" cy="18.5" r="1.6" />
  </svg>`;

const ICONO_TELEFONO = `
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
       stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" />
  </svg>`;

const ICONO_NAV = `
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
       stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M3 11l18-8-8 18-2-8-8-2z" />
  </svg>`;

/* ---------------- Vistas de cuenta ---------------- */

function vistaEntrada(aviso = "") {
  return `
    <div class="acceso">
      <div class="acceso__marca">
        <img class="acceso__logo" src="icons/icon-192.png" alt="" width="88" height="88" />
        <h1 class="acceso__titulo">All Cancún</h1>
        <p class="acceso__lema">Conductores</p>
      </div>

      <p class="acceso__texto">
        Entra con tu cuenta de Google para recibir viajes de la central.
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


/* ---------------- Vista: Viajes (la pantalla principal) ---------------- */

function vistaViajes() {
  if (memoria.cargando && !memoria.viajes.length) {
    return `<h1>${saludo()}, ${escapar(primerNombre(memoria.perfil))}</h1><div class="cargando">Buscando viajes</div>`;
  }

  const activos = memoria.viajes.filter((v) => ACTIVOS.includes(v.estado));

  /* La oferta nueva manda: si hay un viaje recién asignado, ocupa la
     pantalla como en Uber/DiDi, con cuenta regresiva para contestar. */
  const oferta = activos.find(
    (v) => v.estado === "asignado" && v.id !== memoria.ofertaCerrada
  );
  const resto = activos.filter((v) => v.id !== oferta?.id);

  const historial = memoria.viajes
    .filter((v) => v.estado === "completado" || v.estado === "cancelado")
    .slice(0, 6);

  return `
    ${oferta ? tarjetaOferta(oferta) : tarjetaEspera()}
    ${resto.length ? `<h2>En curso</h2>${resto.map(tarjetaActiva).join("")}` : ""}
    ${historial.length ? `<h2>Últimos viajes</h2>${historial.map(filaHistorial).join("")}` : ""}
  `;
}

/* Estado de espera: el conductor está en línea, esperando que caiga un viaje.
   Es la pantalla que más va a ver, así que se siente viva, no vacía. */
function tarjetaEspera() {
  return `
    <div class="radar">
      <div class="radar__circulo" aria-hidden="true">
        <span class="radar__onda"></span>
        <span class="radar__onda"></span>
        <span class="radar__onda"></span>
        <span class="radar__nucleo">${ICONO_AUTO}</span>
      </div>
      <div class="radar__titulo">Buscando viajes</div>
      <p class="radar__texto">
        Estás en línea. La central te manda el viaje aquí mismo y te avisa
        en cuanto lo tengas.
      </p>
    </div>
  `;
}

/* Tarjeta de oferta: lo primero que ve cuando cae un viaje. */
function tarjetaOferta(v) {
  const seg = segundosRestantes(v);
  const distancia = kilometros(v.distancia_km);
  const cuando = v.programado_para ? `Programado ${hora(v.programado_para)}` : "Ahora";
  const pct = Math.max(4, Math.round((seg / SEGUNDOS_OFERTA) * 100));

  return `
    <article class="card oferta" data-oferta="${escapar(v.id)}">
      <div class="oferta__top">
        <div>
          <span class="oferta__etiqueta">Nuevo viaje</span>
          <div class="sutil" style="margin-top:4px">${escapar(cuando)}${distancia ? ` · ${distancia}` : ""}</div>
        </div>
        <div class="oferta__ganancia">
          <span class="oferta__cifra">${centavosATexto(v.precio_centavos)}</span>
          <span class="oferta__dist">${escapar(v.folio || "")}</span>
        </div>
      </div>

      <div class="temporizador">
        <span id="segundos">${seg}s</span>
        <div class="temporizador__barra">
          <div class="temporizador__relleno" id="relleno" style="width:${pct}%"></div>
        </div>
      </div>

      ${rutaHtml(v)}

      ${v.cliente_nombre ? `
        <div class="chofer">
          <span class="chofer__nombre">${escapar(v.cliente_nombre)}</span>
          ${v.cliente_telefono ? `<span class="chofer__nota">· ${escapar(v.cliente_telefono)}</span>` : ""}
        </div>` : ""}

      <div class="acciones acciones--rechazar">
        <button class="btn btn--ghost" type="button" data-accion="abrirRechazo" data-id="${escapar(v.id)}">Rechazar</button>
        <button class="btn" type="button" data-accion="aceptar" data-id="${escapar(v.id)}">Aceptar viaje</button>
      </div>
    </article>`;
}

/* Viaje ya aceptado: el conductor va en camino o ya lleva al pasajero. */
function tarjetaActiva(v) {
  const estado = String(v.estado || "");
  const esCurso = estado === "en_curso";
  const tel = soloDigitos(v.cliente_telefono);
  const destinoNav = esCurso ? v.destino : v.origen;

  return `
    <article class="card">
      <div class="oferta__top">
        <div>
          <span class="etiqueta etiqueta--${escapar(estado)}">${escapar(ETIQUETAS[estado] || estado)}</span>
          <div class="sutil" style="margin-top:6px">
            ${escapar(v.cliente_nombre || "Pasajero")}${v.folio ? ` · ${escapar(v.folio)}` : ""}
          </div>
        </div>
        <div class="oferta__ganancia">
          <span class="oferta__cifra">${centavosATexto(v.precio_centavos)}</span>
          ${v.distancia_km ? `<span class="oferta__dist">${kilometros(v.distancia_km)}</span>` : ""}
        </div>
      </div>

      ${rutaHtml(v)}

      <div class="contacto">
        <button class="btn btn--ghost btn--chico" type="button"
                data-accion="llamar" data-tel="${escapar(tel)}" ${tel ? "" : "disabled"}>
          ${ICONO_TELEFONO} Llamar
        </button>
        <button class="btn btn--ghost btn--chico" type="button"
                data-accion="navegar" data-destino="${escapar(destinoNav || "")}" ${destinoNav ? "" : "disabled"}>
          ${ICONO_NAV} Navegar
        </button>
      </div>

      <div class="acciones">
        <button class="btn btn--danger" type="button" data-accion="abrirCancelar" data-id="${escapar(v.id)}">
          Cancelar
        </button>
        ${esCurso
          ? `<button class="btn" type="button" data-accion="finalizar" data-id="${escapar(v.id)}">Terminar viaje</button>`
          : `<button class="btn btn--azul" type="button" data-accion="iniciar" data-id="${escapar(v.id)}">Llegué, ya subió</button>`}
      </div>
    </article>`;
}

/* Historial: una fila por viaje, sin ruido. */
function filaHistorial(v) {
  const estado = String(v.estado || "");
  const cuando = v.creado_en ? `${fechaCorta(v.creado_en)} · ${hora(v.creado_en)}` : "";
  return `
    <div class="card" style="padding:13px 15px">
      <div class="viaje">
        <span class="viaje__folio">${escapar(v.folio || "")}</span>
        <span class="viaje__precio">${centavosATexto(v.precio_centavos)}</span>
        <div class="viaje__ruta">
          <strong>${escapar(v.origen || "—")}</strong> → ${escapar(v.destino || "—")}
        </div>
        <div class="viaje__pie">
          <span>${escapar(cuando)}</span>
          <span class="etiqueta etiqueta--${escapar(estado)}">${escapar(ETIQUETAS[estado] || estado)}</span>
        </div>
      </div>
    </div>`;
}

/* Ruta con la marca azul (recoger) y la verde (llevar), unidas por una línea. */
function rutaHtml(v) {
  return `
    <div class="ruta">
      <div class="ruta__linea">
        <span class="ruta__marca ruta__marca--a" aria-hidden="true"></span>
        <div class="ruta__texto">
          <span class="ruta__etiqueta">Recoger</span>
          ${escapar(v.origen || "Sin origen")}
        </div>
      </div>
      <div class="ruta__linea">
        <span class="ruta__marca ruta__marca--b" aria-hidden="true"></span>
        <div class="ruta__texto">
          <span class="ruta__etiqueta">Llevar</span>      </div>
    </div>`;
}

/* ---------------- Vista: Ganancias ---------------- */

function vistaGanancias() {
  const hechos = memoria.viajes.filter((v) => v.estado === "completado");
  const ahora = new Date();

  const esHoy = (v) =>
    v.creado_en && new Date(v.creado_en).toDateString() === ahora.toDateString();
  const esMes = (v) => {
    if (!v.creado_en) return false;
    const f = new Date(v.creado_en);
    return f.getMonth() === ahora.getMonth() && f.getFullYear() === ahora.getFullYear();
  };

  const deHoy = hechos.filter(esHoy);
  const delMes = hechos.filter(esMes);

  const suma = (l) => l.reduce((t, v) => t + (Number(v.precio_centavos) || 0), 0);
  const km = (l) => l.reduce((t, v) => t + (Number(v.distancia_km) || 0), 0);

  const gHoy = suma(deHoy);
  const gMes = suma(delMes);

  /* Meta diaria de referencia: 800 pesos. La barra motiva a seguir. */
  const META = 80000;
  const avance = Math.min(100, Math.round((gHoy / META) * 100));

  const porDia = delMes.reduce((acc, v) => {
    const k = new Date(v.creado_en).toDateString();
    acc[k] = (acc[k] || 0) + (Number(v.precio_centavos) || 0);
    return acc;
  }, {});

  const dias = Object.entries(porDia)
    .sort((a, b) => new Date(b[0]) - new Date(a[0]))
    .slice(0, 7);

  return `
    <h1>Ganancias</h1>

    <div class="card">
      <div class="sutil">Hoy</div>
      <div class="oferta__cifra" style="font-size:34px;margin:2px 0 6px">${centavosATexto(gHoy)}</div>
      <div class="sutil">
        ${deHoy.length} ${deHoy.length === 1 ? "viaje" : "viajes"}${km(deHoy) ? ` · ${km(deHoy).toFixed(1)} km` : ""}
      </div>

      <div class="barra"><div class="barra__relleno" style="width:${avance}%"></div></div>
      <div class="sutil" style="margin-top:8px;font-size:12.5px">
        ${avance >= 100
          ? "Meta del día cumplida. ¡Sigue así!"
          : `Meta diaria ${centavosATexto(META)} · faltan ${centavosATexto(Math.max(0, META - gHoy))}`}
      </div>
    </div>

    <div class="stats">
      <div class="stat">
        <span class="stat__cifra">${centavosATexto(gMes)}</span>
        <span class="stat__titulo">Este mes</span>
      </div>
      <div class="stat">
        <span class="stat__cifra">${delMes.length}</span>
        <span class="stat__titulo">Viajes</span>
      </div>
      <div class="stat">
        <span class="stat__cifra">${centavosATexto(delMes.length ? Math.round(gMes / delMes.length) : 0)}</span>
        <span class="stat__titulo">Promedio</span>
      </div>
    </div>

    ${dias.length ? `
      <h2>Día por día</h2>
      <div class="card">
        ${dias.map(([k, total]) => `
          <div class="fila">
            <span>${new Date(k).toLocaleDateString("es-MX", { weekday: "short", day: "2-digit", month: "short" })}</span>
            <strong>${centavosATexto(total)}</strong>
          </div>`).join("")}
      </div>` : ""}

    <p class="sutil centro" style="margin-top:18px;font-size:12.5px">
      Solo cuentan los viajes marcados como terminados.
    </p>
  `;
}

/* ---------------- Vista: Cuenta ---------------- */

function vistaPerfil() {
  const p = memoria.perfil || {};
  const correo = memoria.sesion?.user?.email || "—";
  const completados = memoria.viajes.filter((v) => v.estado === "completado").length;

  return `
    <h1>Mi cuenta</h1>

    <div class="card" style="display:flex;align-items:center;gap:14px">
      <div class="btn-avatar" style="width:56px;height:56px;font-size:22px">${escapar(inicial(p))}</div>
      <div style="min-width:0">
        <div style="font-size:17px;font-weight:800;letter-spacing:-0.3px">
          ${escapar(p.nombre_completo || p.apodo || "Conductor")}
        </div>
        <div class="sutil" style="font-size:13px;overflow:hidden;text-overflow:ellipsis">${escapar(correo)}</div>
      </div>
    </div>

    <div class="card">
      <div class="fila">
        <span>Permiso de conducir</span>
        <strong style="color:var(--accent)">Activo</strong>
      </div>
      <div class="fila"><span>Viajes terminados</span><strong>${completados}</strong></div>
      ${p.telefono ? `<div class="fila"><span>Teléfono</span><strong>${escapar(p.telefono)}</strong></div>` : ""}
      <div class="fila"><span>Cuenta</span><strong>Google</strong></div>
    </div>

    <button class="btn btn--ghost" id="btn-cerrar" type="button">Cerrar sesión</button>

    <p class="sutil centro" style="margin-top:18px;font-size:12.5px">
      All Cancún Conductores · v2.0
    </p>
  `;
}

/* ---------------- Hoja de confirmación (bottom sheet) ---------------- */

function hojaHtml() {
  if (!memoria.hoja) return "";

  const viaje = memoria.viajes.find((v) => v.id === memoria.hojaId);
  if (!viaje) return "";

  const esRechazo = memoria.hoja === "rechazar";

  return `
    <div class="cortina" data-cerrar-hoja role="dialog" aria-modal="true">
      <div class="hoja" role="document">
        <div class="hoja__asa" aria-hidden="true"></div>
        <h2 class="hoja__titulo">${esRechazo ? "¿Rechazar este viaje?" : "¿Terminar el viaje?"}</h2>
        <p class="hoja__texto">
          ${esRechazo
            ? "El viaje regresa a la central y se le ofrece a otro conductor. Rechazar muchos seguidos puede afectar tu asignación."
            : "Confirma que ya dejaste al pasajero en su destino. El viaje se marcará como terminado y contará en tus ganancias."}
        </p>

        <div class="card" style="margin-bottom:16px">
          <div class="fila"><span>Folio</span><strong>${escapar(viaje.folio || "—")}</strong></div>
          <div class="fila"><span>Ganancia</span><strong>${centavosATexto(viaje.precio_centavos)}</strong></div>
          <div class="fila"><span>Ruta</span><strong>${escapar(viaje.origen || "—")} → ${escapar(viaje.destino || "—")}</strong></div>
        </div>

        <div class="acciones acciones--una" style="margin-top:0">
          <button class="btn ${esRechazo ? "btn--danger" : ""}" type="button"
                  data-accion="${esRechazo ? "rechazar" : "finalizar"}confirmado"
                  data-id="${escapar(viaje.id)}">
            ${esRechazo ? "Sí, rechazar" : "Sí, terminar"}
          </button>
          <button class="btn btn--ghost" type="button" data-cerrar-hoja>
            ${esRechazo ? "No, me lo quedo" : "Todavía no"}
          </button>
        </div>
      </div>
    </div>
  `;
}

/* ---------------- Pintado ---------------- */

function pintar() {
  const vista = $("#vista");
  const dock = $("#dock");
  const btnSalir = $("#btn-salir");
  const btnPerfil = $("#btn-perfil");
  const punto = $("#estado-punto");

  const dentro = Boolean(memoria.sesion) && memoria.permiteConducir;

  dock.hidden = !dentro;
  btnSalir.hidden = !dentro;
  btnPerfil.hidden = !dentro;

  punto?.classList.toggle("topbar__dot--on", Boolean(memoria.sesion));

  if (dentro) {
    const avatar = $("#avatar-inicial");
    if (avatar) avatar.textContent = inicial(memoria.perfil);
  }

  /* Contador de viajes activos en el dock, como en las apps de la calle. */
  const activos = memoria.viajes.filter((v) => ACTIVOS.includes(v.estado)).length;
  const badge = $("#dock-badge");
  if (badge) {
    badge.hidden = !activos;
    badge.textContent = String(activos);
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

  /* La hoja se dibuja fuera de #vista para que tape todo, dock incluido. */
  $("#hoja-dialogo")?.remove();
  if (memoria.hoja) {
    const contenedor = document.createElement("div");
    contenedor.id = "hoja-dialogo";
    contenedor.innerHTML = hojaHtml();
    document.body.appendChild(contenedor);
  }

  arrancarTemporizador();
}

/* La cuenta regresiva de la oferta corre cada segundo. Solo toca el número
   y la barra: no repinta la vista entera, que haría parpadear los botones. */
function arrancarTemporizador() {
  clearInterval(temporizador);
  const oferta = memoria.viajes.find(
    (v) => v.estado === "asignado" && v.id !== memoria.ofertaCerrada
  );
  if (!oferta) return;

  temporizador = setInterval(() => {
    const segundos = $("#segundos");
    const relleno = $("#relleno");
    if (!segundos || !relleno) {
      clearInterval(temporizador);
      return;
    }

    const seg = segundosRestantes(oferta);
    segundos.textContent = `${seg}s`;
    relleno.style.width = `${Math.max(2, Math.round((seg / SEGUNDOS_OFERTA) * 100))}%`;

    if (seg <= 0) {
      clearInterval(temporizador);
      memoria.ofertaCerrada = oferta.id;
      pintar();
    }
  }, 1000);
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
    memoria.perfil = null;
    memoria.permiteConducir = false;
    pintar();
    return;
  }

  memoria.sesion = sesion;

  try {
    memoria.perfil = await leerPerfil(sesion.user.id);
    memoria.permiteConducir = memoria.perfil
      ? await tienePermisoConducir(memoria.perfil.id)
      : false;
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
  memoria.hoja = "";
  memoria.ofertaCerrada = "";
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
  /* Cerrar la hoja: tocando el fondo o el botón de salir. */
  if (evento.target.closest("[data-cerrar-hoja]")) {
    if (evento.target.closest(".hoja") && !evento.target.closest("[data-cerrar-hoja].btn")) return;
    memoria.hoja = "";
    pintar();
    return;
  }

  const boton = evento.target.closest("[data-accion]");
  if (!boton) return;

  const { accion, id, tel, destino } = boton.dataset;

  if (accion === "llamar") {
    if (tel) location.href = `tel:${tel}`;
    return;
  }

  /* Navegar abre la app de mapas del teléfono con la dirección escrita. */
  if (accion === "navegar") {
    if (destino) {
      const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destino)}&travelmode=driving`;
      window.open(url, "_blank", "noopener");
    }
    return;
  }

  /* Rechazar y terminar piden confirmación: no se hace por accidente. */
  if (accion === "abrirRechazo" || accion === "abrirCancelar") {
    memoria.hoja = accion === "abrirRechazo" ? "rechazar" : "finalizar";
    memoria.hojaId = id;
    pintar();
    return;
  }

  const mapa = {
    "rechazarconfirmado": "cancelado",
    "finalizarconfirmado": "completado",
  };
  const nuevoEstado = mapa[accion] || SIGUIENTE[accion];
  if (!nuevoEstado || !id) return;

  const zona = boton.closest("[data-oferta]") || boton.closest(".acciones") || boton;
  zona.querySelectorAll("button").forEach((b) => (b.disabled = true));

  const original = boton.innerHTML;
  boton.textContent = "Guardando…";

  try {
    await actualizarEstado(id, memoria.perfil.id, nuevoEstado);

    memoria.hoja = "";
    memoria.ofertaCerrada = "";
    if (nuevoEstado === "completado" && navigator.vibrate) navigator.vibrate(60);
    if (nuevoEstado === "aceptado" && navigator.vibrate) navigator.vibrate(30);

    await cargarViajes();
  } catch (err) {
    boton.innerHTML = original;
    zona.querySelectorAll("button").forEach((b) => (b.disabled = false));
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
    memoria.hoja = "";
    pintar();
  });

  $("#vista")?.addEventListener("click", (e) => {
    if (e.target.closest("[data-accion]")) accionar(e);
  });

  /* La hoja vive fuera de #vista: escucha aparte, en el documento. */
  document.addEventListener("click", (e) => {
    if (e.target.closest("#hoja-dialogo")) accionar(e);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && memoria.hoja) {
      memoria.hoja = "";
      pintar();
    }
  });

  $("#btn-salir")?.addEventListener("click", () => {
    if (confirm("¿Cerrar sesión en este teléfono?")) cerrarSesion();
  });

  $("#btn-perfil")?.addEventListener("click", () => {
    memoria.pestaña = "perfil";
    pintar();
  });

  window.addEventListener("online", () => pintar());
  window.addEventListener("offline", () => pintar());

  /* Al volver a la app (desbloquear el teléfono) se refresca en silencio. */
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && memoria.permiteConducir) {
      cargarViajes().catch(() => {});
    }
  });

  try {
    await getSupabase();

    /* Al volver de Google la sesión ya viene puesta (PKCE). */
    alCambiarSesion(() => {
      if (memoria.sesion === null) arrancarSesion().catch(() => {});
    });

    await arrancarSesion();
  } catch (err) {
    avisoEntrada = mensajePorError(err, "No pudimos conectar con Supabase.");
    pintar();
  }

  /* Refresco silencioso: la central puede asignar un viaje en cualquier
     momento, así que se pregunta seguido mientras la pestaña está visible. */
  setInterval(() => {
    if (memoria.permiteConducir && document.visibilityState === "visible") {
      cargarViajes().catch(() => {});
    }
  }, 20000);

  if (
    "serviceWorker" in navigator &&
    location.hostname !== "127.0.0.1" &&
    location.hostname !== "localhost"
  ) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

iniciar();