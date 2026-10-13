import { db, STORES } from "./db.js";

const META_CATALOGO = "catalogo:info";
const RUTA_JSON = "data/productos.json";

const estado = {
  tienda: { nombre: "Papelería Paola", moneda: "USD", eslogan: "" },
  categorias: [],
  productos: [],
  origen: "sin-datos",
};

async function desdeJSON() {
  const respuesta = await fetch(RUTA_JSON, { cache: "no-store" });
  if (!respuesta.ok) throw new Error(`No se pudo leer el catálogo (HTTP ${respuesta.status})`);
  return respuesta.json();
}

async function persistir(catalogo) {
  if (Array.isArray(catalogo.productos)) {
    await db.guardarLote(STORES.productos, catalogo.productos);
  }
  await db.setMeta(META_CATALOGO, {
    tienda: catalogo.tienda || estado.tienda,
    categorias: catalogo.categorias || [],
    actualizado: catalogo.tienda?.actualizado || new Date().toISOString(),
  });
}

async function desdeCache() {
  const productos = await db.obtenerTodos(STORES.productos);
  const meta = await db.getMeta(META_CATALOGO, {});
  return {
    tienda: meta.tienda || estado.tienda,
    categorias: meta.categorias || [],
    productos: productos || [],
  };
}

export async function cargarCatalogo({ forzarRed = false } = {}) {
  let catalogo;

  try {
    catalogo = await desdeJSON();
    estado.origen = "red";
    await persistir(catalogo);
  } catch (err) {
    if (forzarRed) throw err;
    console.warn("Catálogo desde cache local:", err.message);
    catalogo = await desdeCache();
    estado.origen = "cache";
  }

  estado.tienda = catalogo.tienda || estado.tienda;
  estado.categorias = catalogo.categorias || [];
  estado.productos = catalogo.productos || [];
  return { ...estado };
}

export const catalogo = {
  get estado() {
    return estado;
  },
  producto: (id) => estado.productos.find((p) => p.id === id),
  categoria: (id) => estado.categorias.find((c) => c.id === id),
};
