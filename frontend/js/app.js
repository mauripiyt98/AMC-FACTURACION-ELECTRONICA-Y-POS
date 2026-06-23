// ── Configuración y Contexto ────────────────────────────────────────────────
const activeUserCode = sessionStorage.getItem("amc_active_user_code") || "1110591592";
const isDev = activeUserCode === "1110591592";

const STORAGE_KEY = isDev ? "amc_factura_preview_v1" : `amc_factura_preview_v1_${activeUserCode}`;

const MEDIOS_PAGO = [
  { value: "EFECTIVO",       label: "Efectivo" },
  { value: "TRANSFERENCIA",  label: "Transferencia bancaria" },
  { value: "TARJETA",        label: "Tarjeta débito / crédito" },
];

// ── Utilidades ──────────────────────────────────────────────────────────────
function formatoMoneda(valor) {
  const n = Number(valor) || 0;
  return "$ " + Math.round(n).toLocaleString("es-CO", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function parseNumero(valor) {
  let s = String(valor || "").trim();
  s = s.replace(/[^\d.,-]/g, "");
  
  const dots = (s.match(/\./g) || []).length;
  const commas = (s.match(/,/g) || []).length;
  
  if (dots > 0 && commas === 0) {
    const isDecimal = dots === 1 && /^\d+\.\d{1,2}$/.test(s);
    if (!isDecimal) {
      s = s.replace(/\./g, "");
    }
  } else if (dots > 0 && commas > 0) {
    if (s.indexOf(".") < s.indexOf(",")) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (commas > 0) {
    s = s.replace(",", ".");
  }
  
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function escapeHtml(text) {
  const d = document.createElement("div");
  d.textContent = text;
  return d.innerHTML;
}

function formatIntegerWithDots(value) {
  const clean = String(value).replace(/\D/g, "");
  if (!clean) return "";
  return clean.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function formatInputWithDots(input) {
  const selectionStart = input.selectionStart;
  const valueBefore = input.value;
  const digitsBefore = valueBefore.substring(0, selectionStart).replace(/\D/g, "").length;

  const formatted = formatIntegerWithDots(valueBefore);
  input.value = formatted;

  let newSelectionStart = 0;
  let digitsCounter = 0;
  for (let i = 0; i < formatted.length; i++) {
    if (formatted[i] !== ".") {
      digitsCounter++;
    }
    if (digitsCounter === digitsBefore) {
      newSelectionStart = i + 1;
      break;
    }
  }
  input.setSelectionRange(newSelectionStart, newSelectionStart);
}

// ── Estado ──────────────────────────────────────────────────────────────────
const state = { lineas: [], clienteTercero: null };

// ── Helpers DOM ─────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

// ── Terceros (base de datos local) ──────────────────────────────────────────
const TERCEROS_DB_KEY = isDev ? "amc_terceros_db_v1" : `amc_terceros_db_v1_${activeUserCode}`;
const CLIENTE_SELECCIONADO_KEY = isDev ? "amc_cliente_seleccionado_v1" : `amc_cliente_seleccionado_v1_${activeUserCode}`;
const PRODUCTOS_DB_KEY = isDev ? "amc_productos_db_v1" : `amc_productos_db_v1_${activeUserCode}`;
const PRODUCTO_SELECCIONADO_KEY = isDev ? "amc_producto_seleccionado_v1" : `amc_producto_seleccionado_v1_${activeUserCode}`;
const FACTURAS_GENERADAS_DB_KEY = isDev ? "amc_facturas_generadas_db_v1" : `amc_facturas_generadas_db_v1_${activeUserCode}`;
const RESOLUCION_FACTURACION_DEMO = {
  prefijo: "FE",
  desde: 1,
  hasta: 1000,
  numeroResolucion: "18760000001",
  vigencia: "Demo academico",
};

function normalizarTexto(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function cargarTercerosDB() {
  const raw = localStorage.getItem(TERCEROS_DB_KEY);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function buscarTerceros(query) {
  const q = normalizarTexto(query);
  if (q.length < 3) return [];

  return cargarTercerosDB()
    .filter((t) => {
      const nombre = normalizarTexto(t.nombre);
      const doc = normalizarTexto(t.documento);
      return nombre.includes(q) || doc.includes(q);
    })
    .sort((a, b) => (a.nombre || "").localeCompare(b.nombre || ""))
    .slice(0, 8);
}

function aplicarTerceroAlFormulario(tercero) {
  if (!tercero) return;
  state.clienteTercero = tercero;
  $("cliente-nombre").value = tercero.nombre || "";
  $("cliente-documento").value = tercero.documento || "";
  $("cliente-email").value = tercero.email || "";
  if ($("cliente-telefono")) $("cliente-telefono").value = tercero.telefono || "";
  if ($("cliente-direccion")) $("cliente-direccion").value = tercero.direccion || "";
  if ($("cliente-ciudad")) $("cliente-ciudad").value = tercero.ciudad || "";
}

function cerrarTodosAutocomplete() {
  document.querySelectorAll(".ac-dropdown").forEach((el) => {
    el.classList.remove("visible");
    el.innerHTML = "";
  });
}

function initBusquedaCliente(inputId, dropdownId) {
  const input = $(inputId);
  const dropdown = $(dropdownId);
  if (!input || !dropdown) return;

  let activeIndex = -1;

  function renderSugerencias() {
    const resultados = buscarTerceros(input.value);
    activeIndex = -1;

    if (input.value.trim().length < 3) {
      dropdown.classList.remove("visible");
      dropdown.innerHTML = "";
      return;
    }

    if (!resultados.length) {
      dropdown.innerHTML = '<div class="ac-empty">Sin contactos. Cree uno en «Crear cliente».</div>';
      dropdown.classList.add("visible");
      return;
    }

    dropdown.innerHTML = resultados
      .map(
        (t, i) => `
      <div class="ac-item" data-index="${i}" role="option">
        <strong>${escapeHtml(t.nombre)}</strong>
        <span>Doc: ${escapeHtml(t.documento)}${t.email ? " · " + escapeHtml(t.email) : ""}${t.telefono ? " · Tel: " + escapeHtml(t.telefono) : ""}${t.direccion ? " · " + escapeHtml(t.direccion) : ""}${t.ciudad ? " · " + escapeHtml(t.ciudad) : ""}</span>
      </div>`
      )
      .join("");

    dropdown.classList.add("visible");

    dropdown.querySelectorAll(".ac-item").forEach((item) => {
      item.addEventListener("mousedown", (e) => {
        e.preventDefault();
        const idx = Number(item.dataset.index);
        seleccionar(resultados[idx]);
      });
    });
  }

  function seleccionar(tercero) {
    if (!tercero) return;
    aplicarTerceroAlFormulario(tercero);
    cerrarTodosAutocomplete();
    mostrarMensaje("✅ Cliente cargado desde la base de terceros.");
  }

  function marcarActivo() {
    dropdown.querySelectorAll(".ac-item").forEach((el, i) => {
      el.classList.toggle("active", i === activeIndex);
    });
  }

  input.addEventListener("input", () => {
    cerrarTodosAutocomplete();
    renderSugerencias();
  });

  input.addEventListener("focus", () => {
    if (input.value.trim().length >= 3) renderSugerencias();
  });

  input.addEventListener("keydown", (e) => {
    const items = dropdown.querySelectorAll(".ac-item");
    if (!items.length || !dropdown.classList.contains("visible")) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      activeIndex = Math.min(activeIndex + 1, items.length - 1);
      marcarActivo();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
      marcarActivo();
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      const resultados = buscarTerceros(input.value);
      seleccionar(resultados[activeIndex]);
    } else if (e.key === "Escape") {
      cerrarTodosAutocomplete();
    }
  });

  input.addEventListener("blur", () => {
    setTimeout(cerrarTodosAutocomplete, 150);
  });
}

function cargarClienteSeleccionado() {
  const raw = localStorage.getItem(CLIENTE_SELECCIONADO_KEY);
  if (!raw) return;
  let c = null;
  try {
    c = JSON.parse(raw);
  } catch {
    c = null;
  }
  if (!c) return;

  aplicarTerceroAlFormulario(c);
  localStorage.removeItem(CLIENTE_SELECCIONADO_KEY);
}

function cargarProductosDB() {
  const raw = localStorage.getItem(PRODUCTOS_DB_KEY);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function cargarFacturasGeneradasDB() {
  const raw = localStorage.getItem(FACTURAS_GENERADAS_DB_KEY);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function guardarFacturasGeneradasDB(arr) {
  localStorage.setItem(FACTURAS_GENERADAS_DB_KEY, JSON.stringify(arr));
}

function obtenerSiguienteConsecutivo() {
  const facturas = cargarFacturasGeneradasDB();
  const usados = facturas
    .map((f) => Number(f.consecutivo))
    .filter((n) => Number.isInteger(n) && n >= RESOLUCION_FACTURACION_DEMO.desde);
  const ultimo = usados.length ? Math.max(...usados) : RESOLUCION_FACTURACION_DEMO.desde - 1;
  const siguiente = ultimo + 1;

  if (siguiente > RESOLUCION_FACTURACION_DEMO.hasta) {
    return null;
  }

  return siguiente;
}

function construirNumeroFactura(consecutivo) {
  return RESOLUCION_FACTURACION_DEMO.prefijo + "-" + String(consecutivo).padStart(4, "0");
}

function generarCufeDemoFactura(consecutivo, total) {
  const base = [
    RESOLUCION_FACTURACION_DEMO.prefijo,
    String(consecutivo).padStart(4, "0"),
    Date.now(),
    Math.round(total || 0),
  ].join("-");
  let hex = "";
  for (let i = 0; i < base.length; i++) {
    hex += base.charCodeAt(i).toString(16).toUpperCase().padStart(2, "0");
  }
  return (hex + "0".repeat(96)).slice(0, 96);
}

function buscarProductos(query) {
  const q = normalizarTexto(query);
  if (q.length < 3) return [];

  return cargarProductosDB()
    .filter((p) => {
      const nombre = normalizarTexto(p.nombre);
      const codigo = normalizarTexto(p.codigo);
      return nombre.includes(q) || codigo.includes(q);
    })
    .sort((a, b) => (a.nombre || "").localeCompare(b.nombre || ""))
    .slice(0, 8);
}

function aplicarProductoAlFormulario(producto) {
  if (!producto) return;
  $("producto").value = producto.nombre || "";
  if ($("codigo")) $("codigo").value = producto.codigo || "";
  if ($("unidad")) $("unidad").value = producto.unidadMedida || "UNIDAD";
  if ($("iva")) $("iva").value = String(producto.iva || "19");
  calcularYPrevisualizarLinea();
}

function initBusquedaProducto(inputId, dropdownId) {
  const input = $(inputId);
  const dropdown = $(dropdownId);
  if (!input || !dropdown) return;

  let activeIndex = -1;

  function renderSugerencias() {
    const resultados = buscarProductos(input.value);
    activeIndex = -1;

    if (input.value.trim().length < 3) {
      dropdown.classList.remove("visible");
      dropdown.innerHTML = "";
      return;
    }

    if (!resultados.length) {
      dropdown.innerHTML = '<div class="ac-empty">Sin productos. Cree uno en «Crear productos/servicios».</div>';
      dropdown.classList.add("visible");
      return;
    }

    dropdown.innerHTML = resultados
      .map(
        (p, i) => `
      <div class="ac-item" data-index="${i}" role="option">
        <strong>${escapeHtml(p.nombre)}</strong>
        <span>Cod: ${escapeHtml(p.codigo)} · Tipo: ${escapeHtml(p.tipo)} · IVA: ${escapeHtml(p.iva)}% · U.M.: ${escapeHtml(p.unidadMedida)}</span>
      </div>`
      )
      .join("");

    dropdown.classList.add("visible");

    dropdown.querySelectorAll(".ac-item").forEach((item) => {
      item.addEventListener("mousedown", (e) => {
        e.preventDefault();
        const idx = Number(item.dataset.index);
        seleccionar(resultados[idx]);
      });
    });
  }

  function seleccionar(producto) {
    if (!producto) return;
    aplicarProductoAlFormulario(producto);
    cerrarTodosAutocomplete();
    mostrarMensaje("✅ Producto/servicio cargado.");
  }

  function marcarActivo() {
    dropdown.querySelectorAll(".ac-item").forEach((el, i) => {
      el.classList.toggle("active", i === activeIndex);
    });
  }

  input.addEventListener("input", () => {
    cerrarTodosAutocomplete();
    renderSugerencias();
  });

  input.addEventListener("focus", () => {
    if (input.value.trim().length >= 3) renderSugerencias();
  });

  input.addEventListener("keydown", (e) => {
    const items = dropdown.querySelectorAll(".ac-item");
    if (!items.length || !dropdown.classList.contains("visible")) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      activeIndex = Math.min(activeIndex + 1, items.length - 1);
      marcarActivo();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
      marcarActivo();
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      const resultados = buscarProductos(input.value);
      seleccionar(resultados[activeIndex]);
    } else if (e.key === "Escape") {
      cerrarTodosAutocomplete();
    }
  });

  input.addEventListener("blur", () => {
    setTimeout(cerrarTodosAutocomplete, 150);
  });
}

function cargarProductoSeleccionado() {
  const raw = localStorage.getItem(PRODUCTO_SELECCIONADO_KEY);
  if (!raw) return;
  let p = null;
  try {
    p = JSON.parse(raw);
  } catch {
    p = null;
  }
  if (!p) return;

  aplicarProductoAlFormulario(p);
  localStorage.removeItem(PRODUCTO_SELECCIONADO_KEY);
}

function buscarProductosPorCodigo(query) {
  const q = normalizarTexto(query);
  if (q.length < 1) return [];

  return cargarProductosDB()
    .filter((p) => {
      const codigo = normalizarTexto(p.codigo);
      return codigo.includes(q);
    })
    .sort((a, b) => (a.codigo || "").localeCompare(b.codigo || ""))
    .slice(0, 8);
}

function initBusquedaCodigo(inputId, dropdownId) {
  const input = $(inputId);
  const dropdown = $(dropdownId);
  if (!input || !dropdown) return;

  let activeIndex = -1;

  function renderSugerencias() {
    const resultados = buscarProductosPorCodigo(input.value);
    activeIndex = -1;

    if (input.value.trim().length < 1) {
      dropdown.classList.remove("visible");
      dropdown.innerHTML = "";
      return;
    }

    if (!resultados.length) {
      dropdown.innerHTML = '<div class="ac-empty">No se encontr\u00f3 ning\u00fan producto con ese c\u00f3digo.</div>';
      dropdown.classList.add("visible");
      return;
    }

    dropdown.innerHTML = resultados
      .map(
        (p, i) => `
      <div class="ac-item" data-index="${i}" role="option">
        <strong>${escapeHtml(p.codigo)} \u2014 ${escapeHtml(p.nombre)}</strong>
        <span>Tipo: ${escapeHtml(p.tipo)} \u00b7 IVA: ${escapeHtml(p.iva)}% \u00b7 U.M.: ${escapeHtml(p.unidadMedida)}</span>
      </div>`
      )
      .join("");

    dropdown.classList.add("visible");

    dropdown.querySelectorAll(".ac-item").forEach((item) => {
      item.addEventListener("mousedown", (e) => {
        e.preventDefault();
        const idx = Number(item.dataset.index);
        seleccionar(resultados[idx]);
      });
    });
  }

  function seleccionar(producto) {
    if (!producto) return;
    aplicarProductoAlFormulario(producto);
    cerrarTodosAutocomplete();
    mostrarMensaje("\u2705 Producto/servicio cargado por c\u00f3digo.");
  }

  function marcarActivo() {
    dropdown.querySelectorAll(".ac-item").forEach((el, i) => {
      el.classList.toggle("active", i === activeIndex);
    });
  }

  input.addEventListener("input", () => {
    cerrarTodosAutocomplete();
    renderSugerencias();
  });

  input.addEventListener("focus", () => {
    if (input.value.trim().length >= 1) renderSugerencias();
  });

  input.addEventListener("keydown", (e) => {
    const items = dropdown.querySelectorAll(".ac-item");
    if (!items.length || !dropdown.classList.contains("visible")) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      activeIndex = Math.min(activeIndex + 1, items.length - 1);
      marcarActivo();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
      marcarActivo();
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      const resultados = buscarProductosPorCodigo(input.value);
      seleccionar(resultados[activeIndex]);
    } else if (e.key === "Escape") {
      cerrarTodosAutocomplete();
    }
  });

  input.addEventListener("blur", () => {
    setTimeout(cerrarTodosAutocomplete, 150);
  });
}

function mostrarMensaje(html, tipo = "success") {
  $("mensaje").innerHTML = `<div class="alert alert-${tipo}">${html}</div>`;
}
function limpiarMensaje() { $("mensaje").innerHTML = ""; }

// ── Cálculo de una línea ────────────────────────────────────────────────────
function leerLineaActual() {
  const producto        = $("producto").value.trim();
  const cantidad        = parseNumero($("cantidad").value);
  const unitario        = parseNumero($("unitario").value);
  const tarifaIva       = parseNumero($("iva").value);
  const tarifaRetencion = parseNumero($("retencion").value);
  const codigo          = $("codigo") ? $("codigo").value.trim() : "";
  const unidad          = $("unidad") ? $("unidad").value : "UNIDAD";

  if (!producto) {
    mostrarMensaje("Ingrese el nombre del producto o servicio.", "error");
    return null;
  }
  if (cantidad <= 0 || unitario <= 0) {
    mostrarMensaje("Cantidad y valor unitario deben ser mayores a cero.", "error");
    return null;
  }

  const base            = cantidad * unitario;          // cant × v.unit
  const valorIva        = base * (tarifaIva / 100);     // IVA sobre base
  const valorFactura    = base + valorIva;              // base + IVA
  const valorRetencion  = base * (tarifaRetencion / 100); // rete. sobre base
  const total           = valorFactura - valorRetencion; // neto a pagar

  return { producto, codigo, unidad, cantidad, unitario, base, tarifaIva, valorIva, valorFactura, tarifaRetencion, valorRetencion, total };
}

// ── Previsualización en tiempo real ─────────────────────────────────────────
function calcularYPrevisualizarLinea() {
  const cantidad        = parseNumero($("cantidad").value);
  const unitario        = parseNumero($("unitario").value);
  const tarifaIva       = parseNumero($("iva").value);
  const tarifaRetencion = parseNumero($("retencion").value);

  if (cantidad <= 0 || unitario <= 0) {
    $("base").value          = "";
    $("valoriva").value      = "";
    $("valorretencion").value = "";
    $("total").value         = "";
    return;
  }

  const base            = cantidad * unitario;          // cant × v.unit
  const valorIva        = base * (tarifaIva / 100);     // IVA sobre base
  const valorFactura    = base + valorIva;              // base + IVA
  const valorRetencion  = base * (tarifaRetencion / 100); // rete. sobre base
  const total           = valorFactura - valorRetencion; // neto a pagar

  $("base").value          = formatoMoneda(base);
  $("valoriva").value      = formatoMoneda(valorIva);
  $("valorretencion").value = formatoMoneda(valorRetencion);
  $("total").value         = formatoMoneda(total);
}

// ── Render tabla de líneas ──────────────────────────────────────────────────
function renderTablaLineas() {
  const tbody = $("tabla-lineas-body");
  if (!state.lineas.length) {
    tbody.innerHTML = '<tr><td colspan="13" class="lineas-empty">Agregue productos o servicios con «Agregar línea»</td></tr>';
    return;
  }
  tbody.innerHTML = state.lineas.map((l, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${escapeHtml(l.codigo || "—")}</td>
      <td>${escapeHtml(l.producto)}</td>
      <td>${escapeHtml(l.unidad || "UNIDAD")}</td>
      <td class="num">${l.cantidad}</td>
      <td class="num">${formatoMoneda(l.unitario)}</td>
      <td class="num">${formatoMoneda(l.base)}</td>
      <td class="num">${l.tarifaIva}%</td>
      <td class="num">${formatoMoneda(l.valorIva)}</td>
      <td class="num">${l.tarifaRetencion > 0 ? l.tarifaRetencion + "%" : "—"}</td>
      <td class="num">${l.valorRetencion > 0 ? formatoMoneda(l.valorRetencion) : "—"}</td>
      <td class="num">${formatoMoneda(l.total)}</td>
      <td><button type="button" class="btn-remove" data-index="${i}">✕</button></td>
    </tr>`).join("");

  tbody.querySelectorAll(".btn-remove").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.lineas.splice(Number(btn.dataset.index), 1);
      renderTablaLineas();
      actualizarResumen();
    });
  });
}

// ── Totales globales ────────────────────────────────────────────────────────
function totalesGlobales() {
  const t = state.lineas.reduce((acc, l) => {
    acc.base         += l.base;
    acc.iva          += l.valorIva;
    acc.valorFactura += l.valorFactura;
    acc.retencion    += l.valorRetencion;
    const ki = String(l.tarifaIva);
    acc.ivaPorTarifa[ki] = (acc.ivaPorTarifa[ki] || 0) + l.valorIva;
    if (l.valorRetencion > 0) {
      const kr = String(l.tarifaRetencion);
      acc.retencionPorTarifa[kr] = (acc.retencionPorTarifa[kr] || 0) + l.valorRetencion;
    }
    return acc;
  }, { base: 0, iva: 0, valorFactura: 0, retencion: 0, ivaPorTarifa: {}, retencionPorTarifa: {} });

  t.total = t.valorFactura - t.retencion;
  return t;
}

function actualizarResumen() {
  const t = totalesGlobales();
  $("resumen-base").textContent      = formatoMoneda(t.base);
  $("resumen-iva").textContent       = formatoMoneda(t.iva);
  $("resumen-retencion").textContent = formatoMoneda(t.retencion);
  $("resumen-total").textContent     = formatoMoneda(t.total);
}

// ── Agregar línea ───────────────────────────────────────────────────────────
function agregarLinea() {
  limpiarMensaje();
  const linea = leerLineaActual();
  if (!linea) return;

  // Mostrar los valores calculados en los campos readonly
  $("base").value          = formatoMoneda(linea.base);
  $("valoriva").value      = formatoMoneda(linea.valorIva);
  $("valorretencion").value = formatoMoneda(linea.valorRetencion);
  $("total").value         = formatoMoneda(linea.total);

  state.lineas.push(linea);
  renderTablaLineas();
  actualizarResumen();

  // Limpiar campos de entrada para la siguiente línea
  setTimeout(() => {
    $("producto").value     = "";
    if ($("codigo")) $("codigo").value = "";
    if ($("unidad")) $("unidad").value = "UNIDAD";
    $("cantidad").value     = "";
    $("unitario").value     = "";
    $("base").value         = "";
    $("iva").value          = "19";
    $("valoriva").value     = "";
    $("retencion").value    = "0";
    $("valorretencion").value = "";
    $("total").value        = "";
  }, 600);

  mostrarMensaje("✅ Línea agregada a la factura.");
}

// ── Limpiar todo ────────────────────────────────────────────────────────────
function limpiar() {
  state.lineas = [];
  state.clienteTercero = null;
  ["producto", "codigo", "cantidad", "unitario", "cliente-nombre", "cliente-documento",
   "cliente-telefono", "cliente-direccion", "cliente-ciudad", "cliente-email"].forEach(id => { const el = $(id); if (el) el.value = ""; });
  if ($("unidad")) $("unidad").value = "UNIDAD";
  if ($("observaciones")) $("observaciones").value = "";
  ["base", "valoriva", "valorretencion", "total"].forEach(id => { $(id).value = ""; });
  $("iva").value        = "19";
  $("retencion").value  = "0";
  $("medio-pago").value = "EFECTIVO";
  renderTablaLineas();
  actualizarResumen();
  limpiarMensaje();
}

// ── Generar factura → prefactura ────────────────────────────────────────────
function generarFactura() {
  limpiarMensaje();

  if (!state.lineas.length) {
    mostrarMensaje("Agregue al menos una línea a la factura antes de generar.", "error");
    return;
  }

  const nombre    = $("cliente-nombre").value.trim();
  const documento = $("cliente-documento").value.trim();
  if (!nombre || !documento) {
    mostrarMensaje("Complete al menos el nombre y documento/NIT del cliente.", "error");
    return;
  }

  const cliente = {
    nombre,
    documento,
    direccion: $("cliente-direccion").value.trim(),
    ciudad:    $("cliente-ciudad") ? $("cliente-ciudad").value.trim() : "",
    telefono:  $("cliente-telefono").value.trim(),
    email:     $("cliente-email").value.trim(),
  };

  let terceroRef = state.clienteTercero;
  if (!terceroRef) {
    const docNorm = normalizarTexto(documento);
    terceroRef = cargarTercerosDB().find((t) => normalizarTexto(t.documento) === docNorm) || null;
  }

  const totales = totalesGlobales();
  const medioPagoVal = $("medio-pago").value;
  const consecutivo = obtenerSiguienteConsecutivo();

  if (!consecutivo) {
    mostrarMensaje("El rango demo de facturacion 1 a 1000 ya fue consumido. Configure una nueva resolucion/rango.", "error");
    return;
  }

  const numeroFactura = construirNumeroFactura(consecutivo);
  const cufeDemo = generarCufeDemoFactura(consecutivo, totales.total);

  const payload = {
    id: "FAC-" + Date.now().toString(36).toUpperCase() + "-" + Math.random().toString(36).slice(2, 8).toUpperCase(),
    consecutivo,
    numeroFactura,
    cufe: cufeDemo,
    resolucion: RESOLUCION_FACTURACION_DEMO,
    cliente,
    tercero: terceroRef,
    lineas: state.lineas,
    totales,
    medioPago: medioPagoVal,
    medioPagoLabel: (MEDIOS_PAGO.find(m => m.value === medioPagoVal) || {}).label || medioPagoVal,
    observaciones: $("observaciones") ? $("observaciones").value.trim() : "",
    generadoEn: new Date().toISOString(),
  };

  const facturas = cargarFacturasGeneradasDB();
  facturas.push(payload);
  guardarFacturasGeneradasDB(facturas);

  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  window.location.href = "prefactura.html";
}

// ── Init ────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", function () {
  renderTablaLineas();
  actualizarResumen();

  // Trae cliente seleccionado desde terceros (si existe)
  cargarClienteSeleccionado();
  // Trae producto seleccionado (si existe)
  cargarProductoSeleccionado();

  // Búsqueda en vivo contra base de terceros
  initBusquedaCliente("cliente-nombre", "ac-nombre");
  initBusquedaCliente("cliente-documento", "ac-documento");
  // Búsqueda en vivo de productos (por nombre)
  initBusquedaProducto("producto", "ac-producto");
  // Búsqueda en vivo de productos (por código)
  initBusquedaCodigo("codigo", "ac-codigo");

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".ac-field")) cerrarTodosAutocomplete();
  });

  // Botón para ir al módulo de terceros
  const btnCrear = $("btn-crear-clientes");
  if (btnCrear) {
    btnCrear.addEventListener("click", () => {
      window.location.href = "terceros/terceros.html";
    });
  }

  // Botón para ir al módulo de productos
  const btnCrearProd = $("btn-crear-productos");
  if (btnCrearProd) {
    btnCrearProd.addEventListener("click", () => {
      window.location.href = "productos/productos.html";
    });
  }

  $("btn-agregar").addEventListener("click", agregarLinea);
  $("btn-limpiar").addEventListener("click", limpiar);
  $("btn-generar").addEventListener("click", generarFactura);

  const inputUnitario = $("unitario");
  if (inputUnitario) {
    inputUnitario.addEventListener("input", (e) => {
      formatInputWithDots(e.target);
      calcularYPrevisualizarLinea();
    });
  }

  const inputCantidad = $("cantidad");
  if (inputCantidad) {
    inputCantidad.addEventListener("input", calcularYPrevisualizarLinea);
  }

  const selectIva = $("iva");
  if (selectIva) {
    selectIva.addEventListener("change", calcularYPrevisualizarLinea);
  }

  const selectRetencion = $("retencion");
  if (selectRetencion) {
    selectRetencion.addEventListener("change", calcularYPrevisualizarLinea);
  }

  // Botón para cerrar sesión
  const btnCerrarSesion = $("btn-cerrar-sesion");
  if (btnCerrarSesion) {
    btnCerrarSesion.addEventListener("click", (e) => {
      e.preventDefault();
      sessionStorage.removeItem("amc_session_active");
      window.location.replace("login.html");
    });
  }

  // ── Navegación entre Secciones ─────────────────────────────────────────────
  inicializarMensajeBienvenida();

  // Enlaces y botones de navegación
  const lnkCrearFactura = $("lnk-crear-factura");
  if (lnkCrearFactura) {
    lnkCrearFactura.addEventListener("click", (e) => {
      e.preventDefault();
      mostrarSeccion("crear-factura");
    });
  }

  const btnWelcomeCrearFactura = $("btn-welcome-crear-factura");
  if (btnWelcomeCrearFactura) {
    btnWelcomeCrearFactura.addEventListener("click", () => {
      mostrarSeccion("crear-factura");
    });
  }

  const lnkInicio = $("lnk-inicio");
  if (lnkInicio) {
    lnkInicio.addEventListener("click", (e) => {
      e.preventDefault();
      mostrarSeccion("inicio");
    });
  }

  const btnFacturaIrInicio = $("btn-factura-ir-inicio");
  if (btnFacturaIrInicio) {
    btnFacturaIrInicio.addEventListener("click", () => {
      mostrarSeccion("inicio");
    });
  }

  // Tarjeta Facturación POS (En Desarrollo)
  const btnWelcomePos = $("btn-welcome-pos");
  if (btnWelcomePos) {
    btnWelcomePos.addEventListener("click", () => {
      abrirModal(
        "Módulo POS en Desarrollo",
        "El módulo de Facturación POS se encuentra actualmente en desarrollo. Próximamente incluirá la emisión de tirilla POS electrónica con integración directa a la DIAN."
      );
    });
  }

  // Tarjeta Reportes Ventas/Productos
  const btnWelcomeReportes = $("btn-welcome-reportes");
  if (btnWelcomeReportes) {
    btnWelcomeReportes.addEventListener("click", () => {
      window.location.href = "facturas-generadas/facturas-generadas.html";
    });
  }

  // Controles del Modal de Desarrollo
  const btnModalCerrar = $("btn-modal-cerrar");
  if (btnModalCerrar) {
    btnModalCerrar.addEventListener("click", cerrarModal);
  }

  const modalOverlay = $("amc-modal-desarrollo");
  if (modalOverlay) {
    modalOverlay.addEventListener("click", (e) => {
      if (e.target === modalOverlay) cerrarModal();
    });
  }

  // Ruteo Automático al Iniciar
  const urlParams = new URLSearchParams(window.location.search);
  const secParam = urlParams.get("sec");
  const tieneClienteSeleccionado = localStorage.getItem(CLIENTE_SELECCIONADO_KEY) !== null;
  const tieneProductoSeleccionado = localStorage.getItem(PRODUCTO_SELECCIONADO_KEY) !== null;

  if (secParam === "crear-factura" || tieneClienteSeleccionado || tieneProductoSeleccionado) {
    mostrarSeccion("crear-factura");
  } else {
    mostrarSeccion("inicio");
  }

  // Ocultar la sección de creación de usuario en la barra lateral para clientes
  const lnkCrearUsuario = document.getElementById("lnk-crear-usuario");
  if (lnkCrearUsuario) {
    lnkCrearUsuario.style.display = isDev ? "block" : "none";
  }
});

// ── Funciones de Control de UI ────────────────────────────────────────────────
function mostrarSeccion(seccionId) {
  const panelBienvenida = document.getElementById("panel-bienvenida");
  const panelCrearFactura = document.getElementById("panel-crear-factura");
  const lnkCrearFactura = document.getElementById("lnk-crear-factura");

  if (!panelBienvenida || !panelCrearFactura) return;

  // Limpiar clases active del menú
  document.querySelectorAll(".sidebar-menu a").forEach(el => el.classList.remove("active"));

  if (seccionId === "crear-factura") {
    panelBienvenida.style.display = "none";
    panelCrearFactura.style.display = "block";
    if (lnkCrearFactura) lnkCrearFactura.classList.add("active");
  } else {
    panelBienvenida.style.display = "flex";
    panelCrearFactura.style.display = "none";
  }
}

function inicializarMensajeBienvenida() {
  const welcomeTitle = document.getElementById("welcome-user-title");
  if (!welcomeTitle) return;

  let userName = sessionStorage.getItem("amc_active_user_name") || "Principal Desarrollador";
  if (!isDev) {
    userName = `Usuario ${activeUserCode}`;
  } else {
    try {
      const rawUser = localStorage.getItem("amc_developer_user");
      if (rawUser) {
        const user = JSON.parse(rawUser);
        if (user && user.nombre) {
          userName = user.nombre;
        }
      }
    } catch (err) {
      console.error("Error al cargar nombre del usuario:", err);
    }
  }
  welcomeTitle.textContent = `¡Te damos la bienvenida, ${userName}!`;
}

function abrirModal(titulo, mensaje) {
  const overlay = document.getElementById("amc-modal-desarrollo");
  const modalTitulo = document.getElementById("modal-titulo");
  const modalMensaje = document.getElementById("modal-mensaje");

  if (overlay && modalTitulo && modalMensaje) {
    modalTitulo.textContent = titulo;
    modalMensaje.textContent = mensaje;
    overlay.classList.add("active");
  }
}

function cerrarModal() {
  const overlay = document.getElementById("amc-modal-desarrollo");
  if (overlay) {
    overlay.classList.remove("active");
  }
}
