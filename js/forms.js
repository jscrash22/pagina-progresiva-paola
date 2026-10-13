import { db, STORES } from "./db.js";
import { debounce } from "./utils.js";

const PREFIX_RESPALDO = "papeleria.borrador.";

export async function guardarBorrador(clave, datos) {
  await db.guardar(STORES.borradores, {
    clave,
    datos,
    actualizado: new Date().toISOString(),
  });
}

export async function obtenerBorrador(clave) {
  return db.obtener(STORES.borradores, clave);
}

export async function borrarBorrador(clave) {
  await db.eliminar(STORES.borradores, clave);
  window.localStorage.removeItem(`${PREFIX_RESPALDO}${clave}`);
}

const respaldoSincrono = {
  guardar(clave, datos) {
    try {
      window.localStorage.setItem(`${PREFIX_RESPALDO}${clave}`, JSON.stringify(datos));
    } catch { /* almacenamiento lleno */ }
  },
  leer(clave) {
    try {
      const raw = window.localStorage.getItem(`${PREFIX_RESPALDO}${clave}`);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },
};

export function activarBorrador(form, { clave, aviso } = {}) {
  const serializar = () => {
    const datos = {};
    new FormData(form).forEach((valor, name) => {
      datos[name] = valor;
    });
    return datos;
  };

  const significativo = (datos) =>
    Object.values(datos).some((v) => String(v).trim() !== "");

  const persistirAhora = async () => {
    const datos = serializar();
    if (significativo(datos)) {
      respaldoSincrono.guardar(clave, datos);
      await guardarBorrador(clave, datos);
      if (aviso) aviso.hidden = false;
    } else {
      await borrarBorrador(clave);
      if (aviso) aviso.hidden = true;
    }
  };

  const persistirDiferido = debounce(persistirAhora, 300);

  form.addEventListener("input", persistirDiferido);
  form.addEventListener("change", persistirDiferido);

  window.addEventListener("pagehide", () => {
    const datos = serializar();
    if (significativo(datos)) respaldoSincrono.guardar(clave, datos);
  });

  return {
    serializar,
    persistirAhora,
    async restaurar() {
      let registro = await obtenerBorrador(clave);
      const datos = registro?.datos || respaldoSincrono.leer(clave);
      if (!datos) return false;

      Object.entries(datos).forEach(([name, valor]) => {
        const campo = form.elements.namedItem(name);
        if (campo) campo.value = valor;
      });

      if (!registro) await guardarBorrador(clave, datos);
      if (aviso) aviso.hidden = false;
      return true;
    },
    async limpiar() {
      await borrarBorrador(clave);
      if (aviso) aviso.hidden = true;
    },
  };
}

const MENSAJES_VALIDACION = {
  valueMissing: "Este campo es obligatorio.",
  typeMismatch: "El formato no es válido.",
  tooShort: (campo) => `Mínimo ${campo.minLength} caracteres.`,
  patternMismatch: "El formato no coincide con lo esperado.",
};

function mostrarError(campo, texto) {
  const contenedor = campo.closest(".field") || campo.parentElement;
  campo.classList.add("is-invalid");
  let error = contenedor?.querySelector(".field-error");
  if (!error && contenedor) {
    error = document.createElement("span");
    error.className = "field-error";
    contenedor.appendChild(error);
  }
  if (error) error.textContent = texto;
}

function limpiarError(campo) {
  const contenedor = campo.closest(".field") || campo.parentElement;
  campo.classList.remove("is-invalid");
  contenedor?.querySelector(".field-error")?.remove();
}

export function validarFormulario(form) {
  let valido = true;
  let primerInvalido = null;

  Array.from(form.elements).forEach((campo) => {
    if (!campo.name || ["submit", "reset", "button"].includes(campo.type)) return;
    limpiarError(campo);

    if (!campo.checkValidity()) {
      let texto = "Revisa este campo.";
      for (const [flag, msg] of Object.entries(MENSAJES_VALIDACION)) {
        if (campo.validity[flag]) {
          texto = typeof msg === "function" ? msg(campo) : msg;
          break;
        }
      }
      mostrarError(campo, texto);
      valido = false;
      primerInvalido = primerInvalido || campo;
    }
  });

  if (primerInvalido) primerInvalido.focus();
  return valido;
}

export function limpiarErroresAlEscribir(form) {
  form.addEventListener("input", (e) => {
    if (e.target.matches("input, textarea, select")) limpiarError(e.target);
  });
}
