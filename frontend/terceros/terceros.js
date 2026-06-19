const TERCEROS_DB_KEY = "amc_terceros_db_v1";
const CLIENTE_SELECCIONADO_KEY = "amc_cliente_seleccionado_v1";

const $ = (id) => document.getElementById(id);

const state = { editandoId: null };

function normalizar(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function mostrarMsg(html, tipo = "success") {
  const msg = $("msg");
  if (msg) msg.innerHTML = `<div class="alert alert-${tipo}">${html}</div>`;
}

function limpiarMsg() {
  const msg = $("msg");
  if (msg) msg.innerHTML = "";
}

function cargarDB() {
  const raw = localStorage.getItem(TERCEROS_DB_KEY);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function guardarDB(arr) {
  localStorage.setItem(TERCEROS_DB_KEY, JSON.stringify(arr));
}

function uuidCorto() {
  return (
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).slice(2, 8)
  ).toUpperCase();
}

function leerFormulario() {
  return {
    nombre: $("t-nombre").value.trim(),
    documento: $("t-doc").value.trim(),
    email: $("t-email").value.trim(),
    telefono: $("t-telefono").value.trim(),
    direccion: $("t-direccion").value.trim(),
  };
}

function limpiarFormulario() {
  ["t-nombre", "t-doc", "t-email", "t-telefono", "t-direccion"].forEach((id) => {
    const el = $(id);
    if (el) el.value = "";
  });
  if (!new URLSearchParams(window.location.search).get("id")) {
    state.editandoId = null;
  }
  actualizarModoFormulario();
}

function actualizarModoFormulario() {
  const titulo = $("form-titulo");
  const pageTitle = $("page-title");
  const btnGuardar = $("btn-guardar");

  if (!titulo || !btnGuardar) return;

  if (state.editandoId) {
    titulo.textContent = "Editar tercero (cliente)";
    if (pageTitle) pageTitle.textContent = "Editar tercero";
    btnGuardar.textContent = "Actualizar tercero";
  } else {
    titulo.textContent = "Crear tercero (cliente)";
    if (pageTitle) pageTitle.textContent = "Crear tercero";
    btnGuardar.textContent = "Guardar tercero";
  }
}

function cargarTerceroEnFormulario(tercero) {
  if (!tercero) return;
  state.editandoId = tercero.id;
  $("t-nombre").value = tercero.nombre || "";
  $("t-doc").value = tercero.documento || "";
  $("t-email").value = tercero.email || "";
  $("t-telefono").value = tercero.telefono || "";
  $("t-direccion").value = tercero.direccion || "";
  actualizarModoFormulario();
}

function cargarTerceroDesdeUrl() {
  const id = new URLSearchParams(window.location.search).get("id");
  if (!id) return;

  const tercero = cargarDB().find((x) => x.id === id);
  if (!tercero) {
    mostrarMsg("No se encontro el tercero solicitado para editar.", "error");
    return;
  }
  cargarTerceroEnFormulario(tercero);
}

function validarTercero(t) {
  if (!t.nombre || t.nombre.length < 3) return "Nombre completo (minimo 3 caracteres).";
  if (!t.documento || t.documento.length < 3) return "Numero de documento (minimo 3 caracteres).";
  if (t.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t.email)) return "Correo electronico no valido.";
  return null;
}

function documentoDuplicado(documento, excluirId) {
  const docNorm = normalizar(documento);
  return cargarDB().some(
    (t) => normalizar(t.documento) === docNorm && t.id !== excluirId
  );
}

function renderLista() {
  const lista = $("lista");
  const empty = $("empty");
  const buscar = $("buscar");
  if (!lista || !empty || !buscar) return;

  const q = normalizar(buscar.value);
  const db = cargarDB();

  if (!db.length) {
    lista.innerHTML = "";
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

  let items = db.slice().sort((a, b) => (a.nombre || "").localeCompare(b.nombre || ""));

  if (q.length >= 3) {
    items = items.filter((t) => {
      const n = normalizar(t.nombre);
      const d = normalizar(t.documento);
      return n.includes(q) || d.includes(q);
    });
  }

  if (!items.length) {
    lista.innerHTML = `<div class="empty">Sin resultados. Prueba con 3 letras del nombre o 3 numeros del documento.</div>`;
    return;
  }

  lista.innerHTML = items
    .map(
      (t) => `
    <div class="item" data-id="${t.id}">
      <strong>${escapeHtml(t.nombre)}</strong>
      <div class="meta">
        <div><b>Documento:</b> ${escapeHtml(t.documento)}</div>
        <div><b>Email:</b> ${t.email ? escapeHtml(t.email) : "-"}</div>
        <div><b>Telefono:</b> ${t.telefono ? escapeHtml(t.telefono) : "-"}</div>
        <div><b>Direccion:</b> ${t.direccion ? escapeHtml(t.direccion) : "-"}</div>
      </div>
      <div class="actions">
        <button type="button" class="btn-usar" data-action="usar">Usar en factura</button>
        <button type="button" class="btn-edit" data-action="editar">Editar</button>
        <button type="button" class="btn-del" data-action="eliminar">Eliminar</button>
      </div>
    </div>`
    )
    .join("");

  lista.querySelectorAll("button[data-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const card = btn.closest(".item");
      const id = card?.dataset?.id;
      if (!id) return;
      const action = btn.dataset.action;
      const tercero = cargarDB().find((x) => x.id === id);
      if (!tercero && action !== "eliminar") return;

      if (action === "usar") {
        localStorage.setItem(CLIENTE_SELECCIONADO_KEY, JSON.stringify(tercero));
        window.location.href = "../index.html";
      }

      if (action === "editar") {
        window.location.href = `crear-tercero.html?id=${encodeURIComponent(id)}`;
      }

      if (action === "eliminar") {
        const ok = window.confirm("Desea eliminar este tercero de la base de datos?");
        if (!ok) return;
        const next = cargarDB().filter((x) => x.id !== id);
        guardarDB(next);
        renderLista();
        mostrarMsg("Tercero eliminado.", "success");
      }
    });
  });
}

function escapeHtml(text) {
  const d = document.createElement("div");
  d.textContent = String(text || "");
  return d.innerHTML;
}

function guardarTercero(opciones = {}) {
  limpiarMsg();

  const datos = leerFormulario();
  const err = validarTercero(datos);
  if (err) {
    mostrarMsg(err, "error");
    return null;
  }

  const db = cargarDB();
  let guardado = null;

  if (state.editandoId) {
    if (documentoDuplicado(datos.documento, state.editandoId)) {
      mostrarMsg("Ya existe otro tercero con ese numero de documento.", "error");
      return null;
    }

    const idx = db.findIndex((t) => t.id === state.editandoId);
    if (idx === -1) {
      mostrarMsg("No se encontro el tercero a editar.", "error");
      return null;
    }

    guardado = {
      ...db[idx],
      ...datos,
      actualizadoEn: new Date().toISOString(),
    };
    db[idx] = guardado;
    guardarDB(db);
    mostrarMsg("Tercero actualizado correctamente.");
  } else {
    if (documentoDuplicado(datos.documento, null)) {
      mostrarMsg("Ya existe un tercero con ese numero de documento.", "error");
      return null;
    }

    guardado = {
      id: uuidCorto(),
      ...datos,
      creadoEn: new Date().toISOString(),
    };
    db.push(guardado);
    guardarDB(db);
    mostrarMsg("Tercero guardado en la base de datos.");
    limpiarFormulario();
  }

  if (opciones.usarEnFactura) {
    localStorage.setItem(CLIENTE_SELECCIONADO_KEY, JSON.stringify(guardado));
    window.location.href = "../index.html";
  }

  return guardado;
}

document.addEventListener("DOMContentLoaded", () => {
  const btnVolver = $("btn-volver");
  if (btnVolver) btnVolver.addEventListener("click", () => (window.location.href = "../index.html"));

  const btnGuardar = $("btn-guardar");
  if (btnGuardar) btnGuardar.addEventListener("click", () => guardarTercero());

  const btnGuardarUsar = $("btn-guardar-usar");
  if (btnGuardarUsar) {
    btnGuardarUsar.addEventListener("click", () => guardarTercero({ usarEnFactura: true }));
  }

  const btnLimpiar = $("btn-limpiar");
  if (btnLimpiar) {
    btnLimpiar.addEventListener("click", () => {
      limpiarFormulario();
      limpiarMsg();
    });
  }

  const buscar = $("buscar");
  if (buscar) buscar.addEventListener("input", renderLista);

  cargarTerceroDesdeUrl();
  actualizarModoFormulario();
  renderLista();
});
