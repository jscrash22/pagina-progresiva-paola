const PREFIX = "papeleria.";

export const LS_KEYS = {
  carrito: `${PREFIX}carrito`,
  favoritos: `${PREFIX}favoritos`,
  ultimaSync: `${PREFIX}ultimaSync`,
  preferencias: `${PREFIX}preferencias`,
};

export const SS_KEYS = {
  vistaActiva: `${PREFIX}vistaActiva`,
  categoria: `${PREFIX}categoria`,
  busqueda: `${PREFIX}busqueda`,
  sesionId: `${PREFIX}sesionId`,
};

function read(store, key, fallback = null) {
  try {
    const raw = store.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function write(store, key, value) {
  try {
    store.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    console.warn("No se pudo guardar en almacenamiento", err);
    return false;
  }
}

export const local = {
  get: (key, fallback) => read(window.localStorage, key, fallback),
  set: (key, value) => write(window.localStorage, key, value),
  remove: (key) => window.localStorage.removeItem(key),
};

export const session = {
  get: (key, fallback) => read(window.sessionStorage, key, fallback),
  set: (key, value) => write(window.sessionStorage, key, value),
  remove: (key) => window.sessionStorage.removeItem(key),
};

export function iniciarSesion() {
  let id = session.get(SS_KEYS.sesionId);
  if (!id) {
    id = `ses-${Date.now().toString(36)}`;
    session.set(SS_KEYS.sesionId, id);
  }
  return id;
}

export const prefers = {
  get: () => local.get(LS_KEYS.preferencias, {}),
  set: (patch) => {
    const next = { ...local.get(LS_KEYS.preferencias, {}), ...patch };
    local.set(LS_KEYS.preferencias, next);
    return next;
  },
};
