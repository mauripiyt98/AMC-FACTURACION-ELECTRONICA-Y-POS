const activeUserCode = sessionStorage.getItem("amc_active_user_code") || "1110591592";
const isDev = activeUserCode === "1110591592";

const PRODUCTOS_DB_KEY = isDev ? "amc_productos_db_v1" : `amc_productos_db_v1_${activeUserCode}`;
const PRODUCTO_SELECCIONADO_KEY = isDev ? "amc_producto_seleccionado_v1" : `amc_producto_seleccionado_v1_${activeUserCode}`;

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
  const raw = localStorage.getItem(PRODUCTOS_DB_KEY);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function guardarDB(arr) {
  localStorage.setItem(PRODUCTOS_DB_KEY, JSON.stringify(arr));
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
    nombre: $("p-nombre").value.trim(),
    codigo: $("p-codigo").value.trim(),
    tipo: $("p-tipo").value,
    iva: parseNumero($("p-iva").value),
    unidadMedida: $("p-unidad").value,
  };
}

function parseNumero(valor) {
  const n = parseFloat(valor);
  return Number.isFinite(n) ? n : 0;
}

function limpiarFormulario() {
  const valores = {
    "p-nombre": "",
    "p-codigo": "",
    "p-tipo": "PRODUCTO",
    "p-iva": "19",
    "p-unidad": "UNIDAD",
  };

  Object.entries(valores).forEach(([id, value]) => {
    const el = $(id);
    if (el) el.value = value;
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
    titulo.textContent = "Editar producto / servicio";
    if (pageTitle) pageTitle.textContent = "Editar producto o servicio";
    btnGuardar.textContent = "Actualizar item";
  } else {
    titulo.textContent = "Crear producto / servicio";
    if (pageTitle) pageTitle.textContent = "Crear producto o servicio";
    btnGuardar.textContent = "Guardar item";
  }
}

function cargarProductoEnFormulario(item) {
  if (!item) return;
  state.editandoId = item.id;
  $("p-nombre").value = item.nombre || "";
  $("p-codigo").value = item.codigo || "";
  $("p-tipo").value = item.tipo || "PRODUCTO";
  $("p-iva").value = String(item.iva !== undefined ? item.iva : "19");
  $("p-unidad").value = item.unidadMedida || "UNIDAD";
  actualizarModoFormulario();
}

function cargarProductoDesdeUrl() {
  const id = new URLSearchParams(window.location.search).get("id");
  if (!id) return;

  const item = cargarDB().find((x) => x.id === id);
  if (!item) {
    mostrarMsg("No se encontro el producto o servicio solicitado para editar.", "error");
    return;
  }
  cargarProductoEnFormulario(item);
}

function validarProducto(p) {
  if (!p.nombre || p.nombre.length < 3) return "Nombre o descripcion del item (minimo 3 caracteres).";
  if (!p.codigo || p.codigo.length < 1) return "Codigo de producto obligatorio.";
  return null;
}

function codigoDuplicado(codigo, excluirId) {
  const codNorm = normalizar(codigo);
  return cargarDB().some(
    (p) => normalizar(p.codigo) === codNorm && p.id !== excluirId
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
    items = items.filter((p) => {
      const n = normalizar(p.nombre);
      const c = normalizar(p.codigo);
      return n.includes(q) || c.includes(q);
    });
  }

  if (!items.length) {
    lista.innerHTML = `<div class="empty">Sin resultados. Prueba con el nombre o codigo.</div>`;
    return;
  }

  lista.innerHTML = items
    .map(
      (p) => {
        const badgeClass = p.tipo === "PRODUCTO" ? "badge-producto" : "badge-servicio";
        const tipoLabel = p.tipo === "PRODUCTO" ? "Producto" : "Servicio";
        return `
    <div class="item" data-id="${p.id}">
      <strong>${escapeHtml(p.nombre)}</strong>
      <span class="badge-tipo ${badgeClass}">${tipoLabel}</span>
      <div class="meta">
        <div><b>Codigo:</b> ${escapeHtml(p.codigo)}</div>
        <div><b>IVA:</b> ${escapeHtml(p.iva)}%</div>
        <div><b>U.M.:</b> ${escapeHtml(p.unidadMedida === "GALON" ? "Galon" : "Unidad")}</div>
      </div>
      <div class="actions">
        <button type="button" class="btn-usar" data-action="usar">Usar en factura</button>
        <button type="button" class="btn-edit" data-action="editar">Editar</button>
        <button type="button" class="btn-del" data-action="eliminar">Eliminar</button>
      </div>
    </div>`;
      }
    )
    .join("");

  lista.querySelectorAll("button[data-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const card = btn.closest(".item");
      const id = card?.dataset?.id;
      if (!id) return;
      const action = btn.dataset.action;
      const item = cargarDB().find((x) => x.id === id);
      if (!item && action !== "eliminar") return;

      if (action === "usar") {
        localStorage.setItem(PRODUCTO_SELECCIONADO_KEY, JSON.stringify(item));
        window.location.href = "../index.html";
      }

      if (action === "editar") {
        window.location.href = `crear-producto.html?id=${encodeURIComponent(id)}`;
      }

      if (action === "eliminar") {
        const ok = window.confirm("Desea eliminar este producto o servicio de la base de datos?");
        if (!ok) return;
        const next = cargarDB().filter((x) => x.id !== id);
        guardarDB(next);
        renderLista();
        mostrarMsg("Producto/servicio eliminado.", "success");
      }
    });
  });
}

function escapeHtml(text) {
  const d = document.createElement("div");
  d.textContent = String(text || "");
  return d.innerHTML;
}

function guardarProducto(opciones = {}) {
  limpiarMsg();

  const datos = leerFormulario();
  const err = validarProducto(datos);
  if (err) {
    mostrarMsg(err, "error");
    return null;
  }

  const db = cargarDB();
  let guardado = null;

  if (state.editandoId) {
    if (codigoDuplicado(datos.codigo, state.editandoId)) {
      mostrarMsg("Ya existe otro producto o servicio con ese codigo.", "error");
      return null;
    }

    const idx = db.findIndex((p) => p.id === state.editandoId);
    if (idx === -1) {
      mostrarMsg("No se encontro el item a editar.", "error");
      return null;
    }

    guardado = {
      ...db[idx],
      ...datos,
      actualizadoEn: new Date().toISOString(),
    };
    db[idx] = guardado;
    guardarDB(db);
    mostrarMsg("Item actualizado correctamente.");
  } else {
    if (codigoDuplicado(datos.codigo, null)) {
      mostrarMsg("Ya existe un producto o servicio con ese codigo.", "error");
      return null;
    }

    guardado = {
      id: uuidCorto(),
      ...datos,
      creadoEn: new Date().toISOString(),
    };
    db.push(guardado);
    guardarDB(db);
    limpiarFormulario();
    mostrarMsg("Item creado correctamente.");
  }

  if (opciones.usarEnFactura) {
    localStorage.setItem(PRODUCTO_SELECCIONADO_KEY, JSON.stringify(guardado));
    window.location.href = "../index.html?sec=crear-factura";
  }

  return guardado;
}

document.addEventListener("DOMContentLoaded", () => {
  const btnVolver = $("btn-volver");
  if (btnVolver) {
    btnVolver.addEventListener("click", () => {
      window.location.href = "../index.html?sec=crear-factura";
    });
  }

  const btnGuardar = $("btn-guardar");
  if (btnGuardar) {
    btnGuardar.addEventListener("click", () => guardarProducto());
  }

  const btnGuardarUsar = $("btn-guardar-usar");
  if (btnGuardarUsar) {
    btnGuardarUsar.addEventListener("click", () => guardarProducto({ usarEnFactura: true }));
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

  cargarProductoDesdeUrl();
  actualizarModoFormulario();
  renderLista();
});
