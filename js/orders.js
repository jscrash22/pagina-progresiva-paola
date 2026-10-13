import { db, STORES } from "./db.js";
import { estadoConexion } from "./connection.js";
import { uid } from "./utils.js";

export async function guardarPedido({ cliente, lineas, totales }) {
  const online = estadoConexion();
  const registro = {
    codigo: `PED-${uid()}`.toUpperCase(),
    cliente,
    lineas: lineas.map((l) => ({
      id: l.producto.id,
      nombre: l.producto.nombre,
      emoji: l.producto.emoji,
      precio: l.producto.precio,
      cantidad: l.cantidad,
      subtotal: l.subtotal,
    })),
    articulos: totales.articulos,
    subtotal: totales.subtotal,
    iva: totales.iva,
    total: totales.total,
    estado: online ? "pendiente" : "pendiente",
    creado: new Date().toISOString(),
    sincronizadoEn: null,
    origen: online ? "en-linea" : "sin-conexion",
  };
  const id = await db.agregar(STORES.pedidos, registro);
  return { ...registro, id };
}

export async function guardarMensaje(datos) {
  const online = estadoConexion();
  const registro = {
    ...datos,
    estado: "pendiente",
    creado: new Date().toISOString(),
    sincronizadoEn: null,
    origen: online ? "en-linea" : "sin-conexion",
  };
  const id = await db.agregar(STORES.mensajes, registro);
  return { ...registro, id };
}

export async function listarPedidos() {
  const pedidos = await db.obtenerTodos(STORES.pedidos);
  return pedidos.sort((a, b) => new Date(b.creado) - new Date(a.creado));
}

export async function listarMensajes() {
  const mensajes = await db.obtenerTodos(STORES.mensajes);
  return mensajes.sort((a, b) => new Date(b.creado) - new Date(a.creado));
}
