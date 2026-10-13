import { $, $$, bus, debounce, formatMoney, formatDate, escapeHtml } from "./utils.js";
import { session, SS_KEYS, iniciarSesion, prefers } from "./storage.js";
import { cargarCatalogo, catalogo } from "./data.js";
import {
  iniciarConexion,
  estadoConexion,
  contarPendientes,
  sincronizar,
  ultimaSincronizacion,
} from "./connection.js";
import { carrito, favoritos } from "./cart.js";
import { guardarPedido, guardarMensaje, listarPedidos, listarMensajes } from "./orders.js";
import { activarBorrador, validarFormulario, limpiarErroresAlEscribir } from "./forms.js";

const ui = {
  vista: session.get(SS_KEYS.vistaActiva, "catalogo"),
  categoria: session.get(SS_KEYS.categoria, "todas"),
  busqueda: session.get(SS_KEYS.busqueda, ""),
  orden: prefers.get().orden || "relevancia",
  soloFavoritos: false,
};

let promptInstalacion = null;
let borradorCheckout = null;
let borradorContacto = null;

/* ------------------------- Utilidades de UI ------------------------- */
function toast(mensaje, tipo = "info", duracion = 4000) {
  const contenedor = $("#toasts");
  const el = document.createElement("div");
  el.className = `toast ${tipo}`;
  el.textContent = mensaje;
  contenedor.appendChild(el);
  setTimeout(() => {
    el.style.transition = "opacity .25s ease, transform .25s ease";
    el.style.opacity = "0";
    el.style.transform = "translateX(30px)";
    setTimeout(() => el.remove(), 250);
  }, duracion);
}

function cambiarVista(vista) {
  ui.vista = vista;
  session.set(SS_KEYS.vistaActiva, vista);
  $$(".view").forEach((v) => v.classList.toggle("is-active", v.id === `view-${vista}`));
  $$(".nav-item").forEach((b) => b.classList.toggle("is-active", b.dataset.view === vista));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function actualizarBadge() {
  const badge = $("#cartBadge");
  const total = carrito.contar();
  badge.textContent = total;
  badge.hidden = total === 0;
}

/* ------------------------- Catálogo ------------------------- */
function renderCategorias() {
  const contenedor = $("#categorias");
  const activas = ui.categoria;
  const botones = [
    `<button class="chip ${activas === "todas" ? "is-active" : ""}" data-cat="todas">✨ Todas</button>`,
    ...catalogo.estado.categorias.map(
      (c) =>
        `<button class="chip ${activas === c.id ? "is-active" : ""}" data-cat="${c.id}">${c.icono} ${escapeHtml(
          c.nombre
        )}</button>`
    ),
  ];
  contenedor.innerHTML = botones.join("");
}

function productosFiltrados() {
  const termino = ui.busqueda.trim().toLowerCase();
  let lista = catalogo.estado.productos.slice();

  if (ui.categoria !== "todas") lista = lista.filter((p) => p.categoria === ui.categoria);

  if (termino) {
    lista = lista.filter(
      (p) =>
        p.nombre.toLowerCase().includes(termino) ||
        p.descripcion.toLowerCase().includes(termino)
    );
  }

  if (ui.soloFavoritos) {
    const favs = favoritos.obtener();
    lista = lista.filter((p) => favs.includes(p.id));
  }

  switch (ui.orden) {
    case "precio-asc":
      lista.sort((a, b) => a.precio - b.precio);
      break;
    case "precio-desc":
      lista.sort((a, b) => b.precio - a.precio);
      break;
    case "rating":
      lista.sort((a, b) => b.rating - a.rating);
      break;
  }
  return lista;
}

function tarjetaProducto(p) {
  const esFav = favoritos.esFavorito(p.id);
  const stockBajo = p.stock <= 15;
  const categoria = catalogo.categoria(p.categoria);
  return `
    <article class="product-card" data-id="${p.id}">
      <button class="fav-btn ${esFav ? "is-fav" : ""}" data-action="fav" aria-label="Marcar favorito">${esFav ? "★" : "☆"}</button>
      <div class="product-thumb" aria-hidden="true">${p.emoji}</div>
      <span class="product-cat">${categoria ? escapeHtml(categoria.nombre) : p.categoria}</span>
      <h3 class="product-name">${escapeHtml(p.nombre)}</h3>
      <p class="product-desc">${escapeHtml(p.descripcion)}</p>
      <div class="product-meta">
        <span class="product-price">${formatMoney(p.precio)}</span>
        <span class="product-rating">★ ${p.rating.toFixed(1)}</span>
      </div>
      <span class="stock-tag ${stockBajo ? "low" : ""}">${stockBajo ? "¡Últimas " + p.stock + " unidades!" : p.stock + " en stock"}</span>
      <div class="product-actions">
        <button class="btn btn-primary" data-action="add">Agregar</button>
      </div>
    </article>`;
}

function renderCatalogo() {
  const grid = $("#productGrid");
  const lista = productosFiltrados();

  if (!catalogo.estado.productos.length) {
    grid.innerHTML = `
      <div class="empty">
        <span class="big">📡</span>
        No hay productos disponibles sin conexión todavía.
        <br />Conéctate una vez para guardar el catálogo localmente.
        <div style="margin-top:1rem"><button class="btn btn-primary" id="reintentarCatalogo">Reintentar</button></div>
      </div>`;
    return;
  }

  if (!lista.length) {
    grid.innerHTML = `<div class="empty"><span class="big">🔍</span>No se encontraron productos con ese filtro.</div>`;
    return;
  }

  grid.innerHTML = lista.map(tarjetaProducto).join("");
  const origen = catalogo.estado.origen === "red" ? "actualizado" : "desde cache local";
  $("#catalogoResumen").textContent = `${lista.length} productos · ${origen}`;
}

/* ------------------------- Carrito ------------------------- */
function renderCarrito() {
  const contenedor = $("#cartItems");
  const { lineas, articulos, subtotal, iva, total } = carrito.totales();

  $("#sumItems").textContent = articulos;
  $("#sumSubtotal").textContent = formatMoney(subtotal);
  $("#sumIva").textContent = formatMoney(iva);
  $("#sumTotal").textContent = formatMoney(total);
  $("#carritoResumen").textContent =
    articulos > 0 ? `${articulos} artículo(s) en tu carrito.` : "Tu carrito está vacío.";

  if (!lineas.length) {
    contenedor.innerHTML = `<div class="empty"><span class="big">🛒</span>Agrega productos para comenzar tu pedido.</div>`;
    return;
  }

  contenedor.innerHTML = lineas
    .map(
      (l) => `
    <div class="cart-item" data-id="${l.producto.id}">
      <div class="cart-item-emoji">${l.producto.emoji}</div>
      <div class="cart-item-info">
        <h3>${escapeHtml(l.producto.nombre)}</h3>
        <span class="muted">${formatMoney(l.producto.precio)} c/u</span>
      </div>
      <div class="qty">
        <button data-action="menos" aria-label="Quitar uno">−</button>
        <span>${l.cantidad}</span>
        <button data-action="mas" aria-label="Agregar uno">+</button>
      </div>
      <div class="cart-item-price">${formatMoney(l.subtotal)}</div>
    </div>`
    )
    .join("");
}

/* ------------------------- Pedidos y mensajes ------------------------- */
function tagEstado(estado) {
  const texto = estado === "sincronizado" ? "Sincronizado" : "Pendiente de envío";
  return `<span class="tag ${estado}">${texto}</span>`;
}

async function renderPedidos() {
  const contenedor = $("#pedidosList");
  const pedidos = await listarPedidos();

  if (!pedidos.length) {
    contenedor.innerHTML = `<div class="empty"><span class="big">📦</span>Todavía no has realizado pedidos.</div>`;
    return;
  }

  contenedor.innerHTML = pedidos
    .map(
      (p) => `
    <article class="order-card">
      <div class="order-head">
        <div>
          <div class="order-id">${escapeHtml(p.codigo)}</div>
          <div class="muted">${formatDate(p.creado)} · ${escapeHtml(p.cliente?.nombre || "Cliente")}</div>
        </div>
        <div style="text-align:right">
          ${tagEstado(p.estado)}
          <div class="order-total">${formatMoney(p.total)}</div>
        </div>
      </div>
      <div class="order-items">
        ${p.lineas.map((l) => `${l.emoji} ${escapeHtml(l.nombre)} ×${l.cantidad}`).join(" · ")}
      </div>
    </article>`
    )
    .join("");
}

async function renderMensajes() {
  const contenedor = $("#mensajesList");
  const mensajes = await listarMensajes();

  if (!mensajes.length) {
    contenedor.innerHTML = "";
    return;
  }

  contenedor.innerHTML =
    `<h2 style="margin-bottom:.25rem">Mensajes enviados</h2>` +
    mensajes
      .map(
        (m) => `
    <article class="order-card">
      <div class="order-head">
        <div>
          <div class="order-id">${escapeHtml(m.asunto)}</div>
          <div class="muted">${formatDate(m.creado)} · ${escapeHtml(m.nombre)}</div>
        </div>
        <span class="tag ${m.estado === "sincronizado" ? "sincronizado" : "pendiente"}">
          ${m.estado === "sincronizado" ? "Sincronizado" : "En cola"}
        </span>
      </div>
      <div class="order-items">${escapeHtml(m.mensaje)}</div>
    </article>`
      )
      .join("");
}

/* ------------------------- Conexión ------------------------- */
async function actualizarIndicadoresConexion() {
  const online = estadoConexion();
  const pill = $("#statusPill");
  const banner = $("#connectionBanner");
  const texto = $("#statusText");
  const bannerTexto = $("#connectionBannerText");
  const pendientes = await contarPendientes();

  pill.classList.toggle("is-offline", !online);
  texto.textContent = online ? "En línea" : "Sin conexión";

  if (online) {
    banner.classList.add("is-online");
    banner.hidden = true;
  } else {
    banner.hidden = false;
    banner.classList.remove("is-online");
    bannerTexto.textContent = `⚠️ Sin conexión. Puedes seguir comprando: todo se guarda en tu dispositivo${
      pendientes ? ` (${pendientes} pendiente(s))` : ""
    }.`;
  }

  const ultima = ultimaSincronizacion();
  $("#pedidosResumen").textContent = ultima
    ? `Última sincronización: ${formatDate(ultima)}.${pendientes ? ` ${pendientes} pendiente(s).` : ""}`
    : `Aquí verás tus pedidos guardados localmente.${pendientes ? ` ${pendientes} pendiente(s).` : ""}`;
}

/* ------------------------- Formularios ------------------------- */
async function manejarCheckout(evento) {
  evento.preventDefault();
  const form = evento.currentTarget;

  if (!carrito.contar()) {
    toast("Tu carrito está vacío. Agrega productos primero.", "warning");
    return;
  }
  if (!validarFormulario(form)) {
    toast("Revisa los datos de entrega.", "error");
    return;
  }

  const cliente = {};
  new FormData(form).forEach((valor, name) => (cliente[name] = valor));
  const totales = carrito.totales();

  const pedido = await guardarPedido({
    cliente,
    lineas: totales.lineas,
    totales,
  });

  carrito.vaciar();
  form.reset();
  await borradorCheckout.limpiar();

  if (estadoConexion()) {
    toast(`Pedido ${pedido.codigo} confirmado.`, "success");
    await sincronizar({ silencioso: true });
  } else {
    toast(`Pedido ${pedido.codigo} guardado sin conexión. Se enviará al reconectar.`, "warning");
  }

  await renderPedidos();
  await actualizarIndicadoresConexion();
  cambiarVista("pedidos");
}

async function manejarContacto(evento) {
  evento.preventDefault();
  const form = evento.currentTarget;

  if (!validarFormulario(form)) {
    toast("Revisa el formulario de contacto.", "error");
    return;
  }

  const datos = {};
  new FormData(form).forEach((valor, name) => (datos[name] = valor));

  await guardarMensaje(datos);
  form.reset();
  await borradorContacto.limpiar();

  if (estadoConexion()) {
    toast("Mensaje enviado correctamente.", "success");
    await sincronizar({ silencioso: true });
  } else {
    toast("Mensaje guardado sin conexión. Se enviará al reconectar.", "warning");
  }

  await renderMensajes();
  await actualizarIndicadoresConexion();
}

/* ------------------------- Service Worker / PWA ------------------------- */
async function registrarServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  try {
    const registro = await navigator.serviceWorker.register("service-worker.js");
    registro.addEventListener("updatefound", () => {
      const nuevo = registro.installing;
      if (!nuevo) return;
      nuevo.addEventListener("statechange", () => {
        if (nuevo.state === "installed" && navigator.serviceWorker.controller) {
          toast("Nueva versión disponible. Recarga para actualizar.", "info", 6000);
        }
      });
    });
  } catch (err) {
    console.warn("Service Worker no registrado:", err);
  }
}

function configurarInstalacion() {
  const boton = $("#installBtn");
  const yaInstalada = window.matchMedia("(display-mode: standalone)").matches;

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    promptInstalacion = e;
    if (!yaInstalada) boton.hidden = false;
  });

  boton.addEventListener("click", async () => {
    if (!promptInstalacion) return;
    promptInstalacion.prompt();
    await promptInstalacion.userChoice;
    promptInstalacion = null;
    boton.hidden = true;
  });

  window.addEventListener("appinstalled", () => {
    boton.hidden = true;
    toast("¡App instalada! Ya puedes usarla sin conexión.", "success");
  });
}

/* ------------------------- Eventos ------------------------- */
function conectarEventos() {
  $$(".nav-item").forEach((boton) =>
    boton.addEventListener("click", () => cambiarVista(boton.dataset.view))
  );
  $("#cartButton").addEventListener("click", () => cambiarVista("carrito"));

  $("#buscador").addEventListener(
    "input",
    debounce((e) => {
      ui.busqueda = e.target.value;
      session.set(SS_KEYS.busqueda, ui.busqueda);
      renderCatalogo();
    }, 250)
  );

  $("#categorias").addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    ui.categoria = chip.dataset.cat;
    session.set(SS_KEYS.categoria, ui.categoria);
    renderCategorias();
    renderCatalogo();
  });

  $("#ordenar").addEventListener("change", (e) => {
    ui.orden = e.target.value;
    prefers.set({ orden: ui.orden });
    renderCatalogo();
  });

  $("#soloFavoritos").addEventListener("change", (e) => {
    ui.soloFavoritos = e.target.checked;
    renderCatalogo();
  });

  $("#productGrid").addEventListener("click", (e) => {
    if (e.target.id === "reintentarCatalogo") {
      recargarCatalogo();
      return;
    }
    const accion = e.target.closest("[data-action]");
    if (!accion) return;
    const id = accion.closest(".product-card").dataset.id;

    if (accion.dataset.action === "add") {
      carrito.agregar(id, 1);
      toast("Producto agregado al carrito.", "success", 2000);
    } else if (accion.dataset.action === "fav") {
      favoritos.alternar(id);
      accion.classList.toggle("is-fav");
      accion.textContent = favoritos.esFavorito(id) ? "★" : "☆";
      if (ui.soloFavoritos) renderCatalogo();
    }
  });

  $("#cartItems").addEventListener("click", (e) => {
    const accion = e.target.closest("[data-action]");
    if (!accion) return;
    const id = accion.closest(".cart-item").dataset.id;
    if (accion.dataset.action === "mas") carrito.cambiarCantidad(id, 1);
    if (accion.dataset.action === "menos") carrito.cambiarCantidad(id, -1);
  });

  $("#vaciarCarrito").addEventListener("click", () => {
    if (!carrito.contar()) return;
    if (confirm("¿Vaciar todo el carrito?")) carrito.vaciar();
  });

  $("#sincronizarBtn").addEventListener("click", async () => {
    if (!estadoConexion()) {
      toast("No hay conexión para sincronizar.", "warning");
      return;
    }
    await sincronizar();
  });

  $("#checkoutForm").addEventListener("submit", manejarCheckout);
  $("#contactoForm").addEventListener("submit", manejarContacto);
  $("#contactoLimpiar").addEventListener("click", async () => {
    await borradorContacto.limpiar();
    toast("Formulario limpiado.", "info", 2000);
  });

  bus.on("cart:change", () => {
    actualizarBadge();
    if (ui.vista === "carrito") renderCarrito();
  });

  bus.on("connection:change", ({ online }) => {
    actualizarIndicadoresConexion();
    if (online) {
      toast("Conexión restablecida.", "success", 2500);
      if (!catalogo.estado.productos.length) recargarCatalogo();
    } else {
      toast("Te has quedado sin conexión. Modo offline activado.", "warning");
    }
  });

  bus.on("sync:fin", async ({ total, silencioso }) => {
    if (!silencioso && total) toast(`Sincronización completa (${total}).`, "success");
    await renderPedidos();
    await renderMensajes();
    await actualizarIndicadoresConexion();
  });
}

async function recargarCatalogo() {
  const previa = ui.categoria;
  try {
    await cargarCatalogo({ forzarRed: true });
    if (!catalogo.categoria(previa)) ui.categoria = "todas";
    renderCategorias();
    renderCatalogo();
    toast("Catálogo actualizado.", "success", 2500);
  } catch {
    toast("No se pudo actualizar el catálogo.", "error");
  }
}

/* ------------------------- Arranque ------------------------- */
async function init() {
  iniciarSesion();

  $("#buscador").value = ui.busqueda;
  $("#ordenar").value = ui.orden;

  iniciarConexion();
  conectarEventos();
  configurarInstalacion();
  registrarServiceWorker();

  try {
    await cargarCatalogo();
  } catch (err) {
    toast("No se pudo cargar el catálogo.", "error");
  }

  renderCategorias();
  renderCatalogo();
  renderCarrito();
  actualizarBadge();
  await renderPedidos();
  await renderMensajes();
  await actualizarIndicadoresConexion();

  borradorCheckout = activarBorrador($("#checkoutForm"), {
    clave: "checkout",
    aviso: $("#checkoutDraftInfo"),
  });
  await borradorCheckout.restaurar();

  borradorContacto = activarBorrador($("#contactoForm"), {
    clave: "contacto",
    aviso: $("#contactoDraftInfo"),
  });
  await borradorContacto.restaurar();

  limpiarErroresAlEscribir($("#checkoutForm"));
  limpiarErroresAlEscribir($("#contactoForm"));

  cambiarVista(ui.vista);

  if (estadoConexion()) {
    setTimeout(() => sincronizar({ silencioso: true }), 1500);
  }
}

document.addEventListener("DOMContentLoaded", init);
