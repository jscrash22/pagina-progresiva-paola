const DB_NAME = "papeleria-paola";
const DB_VERSION = 1;

export const STORES = {
  productos: "productos",
  pedidos: "pedidos",
  mensajes: "mensajes",
  borradores: "borradores",
  meta: "meta",
};

let dbPromise = null;

export function abrirDB() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains(STORES.productos)) {
        db.createObjectStore(STORES.productos, { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains(STORES.pedidos)) {
        const pedidos = db.createObjectStore(STORES.pedidos, { keyPath: "id", autoIncrement: true });
        pedidos.createIndex("estado", "estado", { unique: false });
        pedidos.createIndex("creado", "creado", { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.mensajes)) {
        const mensajes = db.createObjectStore(STORES.mensajes, { keyPath: "id", autoIncrement: true });
        mensajes.createIndex("estado", "estado", { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.borradores)) {
        db.createObjectStore(STORES.borradores, { keyPath: "clave" });
      }

      if (!db.objectStoreNames.contains(STORES.meta)) {
        db.createObjectStore(STORES.meta, { keyPath: "clave" });
      }
    };

    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };

    request.onerror = () => reject(request.error);
    request.onblocked = () => console.warn("IndexedDB bloqueada: cierra otras pestañas de la app.");
  });

  return dbPromise;
}

async function ejecutar(store, modo, accion) {
  const dbConn = await abrirDB();
  return new Promise((resolve, reject) => {
    const tx = dbConn.transaction(store, modo);
    const os = tx.objectStore(store);
    let request;
    try {
      request = accion(os);
    } catch (err) {
      reject(err);
      return;
    }
    tx.oncomplete = () => {
      if (request && typeof request === "object" && "result" in request) {
        resolve(request.result);
      } else {
        resolve(request);
      }
    };
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const db = {
  guardar: (store, valor) => ejecutar(store, "readwrite", (os) => os.put(valor)),
  agregar: (store, valor) => ejecutar(store, "readwrite", (os) => os.add(valor)),
  obtener: (store, key) => ejecutar(store, "readonly", (os) => os.get(key)),
  obtenerTodos: (store) => ejecutar(store, "readonly", (os) => os.getAll()),
  eliminar: (store, key) => ejecutar(store, "readwrite", (os) => os.delete(key)),
  limpiar: (store) => ejecutar(store, "readwrite", (os) => os.clear()),
  contar: (store) => ejecutar(store, "readonly", (os) => os.count()),
  obtenerPorIndice: (store, indexName, value) =>
    ejecutar(store, "readonly", (os) => os.index(indexName).getAll(value)),

  async guardarLote(store, valores) {
    const dbConn = await abrirDB();
    return new Promise((resolve, reject) => {
      const tx = dbConn.transaction(store, "readwrite");
      const os = tx.objectStore(store);
      valores.forEach((v) => os.put(v));
      tx.oncomplete = () => resolve(valores.length);
      tx.onerror = () => reject(tx.error);
    });
  },

  async setMeta(clave, valor) {
    return db.guardar(STORES.meta, { clave, valor });
  },

  async getMeta(clave, fallback = null) {
    const registro = await db.obtener(STORES.meta, clave);
    return registro ? registro.valor : fallback;
  },
};
