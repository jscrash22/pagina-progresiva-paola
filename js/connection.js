import { db, STORES } from "./db.js";
import { bus } from "./utils.js";
import { local, LS_KEYS } from "./storage.js";

const connection = {
  online: navigator.onLine,
  sincronizando: false,
};

export function estadoConexion() {
  return connection.online;
}

export async function contarPendientes() {
  const [pedidos, mensajes] = await Promise.all([
    db.obtenerPorIndice(STORES.pedidos, "estado", "pendiente"),
    db.obtenerPorIndice(STORES.mensajes, "estado", "pendiente"),
  ]);
  return (pedidos?.length || 0) + (mensajes?.length || 0);
}

export function ultimaSincronizacion() {
  return local.get(LS_KEYS.ultimaSync, null);
}

export async function sincronizar({ silencioso = false } = {}) {
  if (!connection.online) {
    bus.emit("sync:bloqueado");
    return { ok: false, motivo: "sin-conexion" };
  }
  if (connection.sincronizando) return { ok: false, motivo: "en-proceso" };

  connection.sincronizando = true;
  bus.emit("sync:inicio");

  try {
    const [pedidos, mensajes] = await Promise.all([
      db.obtenerPorIndice(STORES.pedidos, "estado", "pendiente"),
      db.obtenerPorIndice(STORES.mensajes, "estado", "pendiente"),
    ]);

    const marca = new Date().toISOString();
    await Promise.all([
      ...pedidos.map((p) =>
        db.guardar(STORES.pedidos, { ...p, estado: "sincronizado", sincronizadoEn: marca })
      ),
      ...mensajes.map((m) =>
        db.guardar(STORES.mensajes, { ...m, estado: "sincronizado", sincronizadoEn: marca })
      ),
    ]);

    const total = pedidos.length + mensajes.length;
    local.set(LS_KEYS.ultimaSync, marca);

    connection.sincronizando = false;
    bus.emit("sync:fin", { total, marca, silencioso });
    return { ok: true, total };
  } catch (err) {
    connection.sincronizando = false;
    bus.emit("sync:error", err);
    return { ok: false, motivo: "error", error: err };
  }
}

function actualizar(online) {
  const cambio = connection.online !== online;
  connection.online = online;
  if (cambio) bus.emit("connection:change", { online });
}

export function iniciarConexion() {
  window.addEventListener("online", () => {
    actualizar(true);
    sincronizar();
  });
  window.addEventListener("offline", () => actualizar(false));

  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") actualizar(navigator.onLine);
  });

  actualizar(navigator.onLine);
}
