/**
 * cotizacion.js — Lógica de creación de cotizaciones
 *
 * Mantiene la arquitectura idéntica al formulario de facturas:
 * - Soporte dual: API REST (/api/cotizaciones) y localStorage (modo offline).
 * - Autocompletado de terceros y productos en tiempo real.
 * - Consecutivo propio: COTZ-0001 a COTZ-1000.
 */
'use strict';

const SESSION_KEY = 'amc_session_v2';
function getToken() {
  try {
    const s = JSON.parse(sessionStorage.getItem(SESSION_KEY) || '{}');
    return s.token || null;
  } catch { return null; }
}

const token = getToken();
const useApi = !!token;
const API_BASE = 'http://localhost:3000/api';
const apiData = { terceros: [], productos: [], loaded: false };

async function apiFetch(endpoint, options = {}) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (res.status === 401) {
    sessionStorage.clear();
    window.location.replace('../login.html');
    throw new Error('Sesión expirada');
  }
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || `Error ${res.status}`);
  return data;
}

async function cargarTodosLosTercerosApi() {
  const pageSize = 500;
  const terceros = [];
  let offset = 0;

  while (true) {
    const data = await apiFetch(`/terceros?limit=${pageSize}&offset=${offset}`);
    const pagina = Array.isArray(data.terceros) ? data.terceros : [];
    terceros.push(...pagina);
    if (!data.pagination?.hasMore || pagina.length === 0) break;
    offset += pagina.length;
  }

  return terceros;
}

const TERCEROS_DB_KEY = `amc_terceros_db_v1_${activeUserCode}`;
const PRODUCTOS_DB_KEY = `amc_productos_db_v1_${activeUserCode}`;
const COTIZACIONES_DB_KEY = `amc_cotizaciones_generadas_db_v1_${activeUserCode}`;

const RANGO_COTIZACION = {
  prefijo: "COTZ",
  desde: 1,
  hasta: 1000
};

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

function normalizarTexto(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

// ── Estado ──────────────────────────────────────────────────────────────────
const state = { lineas: [], clienteTercero: null };
const $ = (id) => document.getElementById(id);

function mostrarMensaje(html, tipo = "success") {
  const c = $("mensaje-cotizacion");
  if (c) c.innerHTML = `<div class="alert alert-${tipo}">${html}</div>`;
}
function limpiarMensaje() {
  const c = $("mensaje-cotizacion");
  if (c) c.innerHTML = "";
}

// ── Terceros ────────────────────────────────────────────────────────────────
function cargarTercerosDB() {
  if (useApi && apiData.loaded) return apiData.terceros;
  const raw = localStorage.getItem(TERCEROS_DB_KEY);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function sincronizarTerceroLocal(cliente) {
  const documento = normalizarTexto(cliente?.documento);
  if (!documento) return null;

  const terceros = cargarTercerosDB();
  const indice = terceros.findIndex((t) => normalizarTexto(t.documento) === documento);
  const fecha = new Date().toISOString();
  const camposConValor = Object.fromEntries(
    Object.entries(cliente).filter(([, v]) => String(v == null ? '' : v).trim() !== '')
  );
  let tercero;

  if (indice >= 0) {
    tercero = { ...terceros[indice], ...camposConValor, actualizadoEn: fecha };
    terceros[indice] = tercero;
  } else {
    const id = window.crypto?.randomUUID?.() || `local_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    tercero = { id, ...camposConValor, creadoEn: fecha, actualizadoEn: fecha };
    terceros.push(tercero);
  }

  localStorage.setItem(TERCEROS_DB_KEY, JSON.stringify(terceros));
  return tercero;
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
      dropdown.innerHTML = '<div class="ac-empty">Sin contactos en la base.</div>';
      dropdown.classList.add("visible");
      return;
    }

    dropdown.innerHTML = resultados
      .map(
        (t, i) => `
      <div class="ac-item" data-index="${i}" role="option">
        <strong>${escapeHtml(t.nombre)}</strong>
        <span>Doc: ${escapeHtml(t.documento)}${t.email ? " · " + escapeHtml(t.email) : ""}${t.telefono ? " · Tel: " + escapeHtml(t.telefono) : ""}</span>
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

// ── Productos ───────────────────────────────────────────────────────────────
function cargarProductosDB() {
  if (useApi && apiData.loaded) return apiData.productos.filter((p) => p.activo !== false);
  const raw = localStorage.getItem(PRODUCTOS_DB_KEY);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((p) => p.activo !== false) : [];
  } catch {
    return [];
  }
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
      dropdown.innerHTML = '<div class="ac-empty">Sin productos encontrados.</div>';
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
      dropdown.innerHTML = '<div class="ac-empty">No se encontró ningún producto con ese código.</div>';
      dropdown.classList.add("visible");
      return;
    }

    dropdown.innerHTML = resultados
      .map(
        (p, i) => `
      <div class="ac-item" data-index="${i}" role="option">
        <strong>${escapeHtml(p.codigo)} — ${escapeHtml(p.nombre)}</strong>
        <span>Tipo: ${escapeHtml(p.tipo)} · IVA: ${escapeHtml(p.iva)}% · U.M.: ${escapeHtml(p.unidadMedida)}</span>
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
    mostrarMensaje("✅ Producto/servicio cargado por código.");
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

// ── Cotizaciones DB Local ───────────────────────────────────────────────────
function cargarCotizacionesGeneradasDB() {
  const raw = localStorage.getItem(COTIZACIONES_DB_KEY);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function guardarCotizacionesGeneradasDB(arr) {
  localStorage.setItem(COTIZACIONES_DB_KEY, JSON.stringify(arr));
}

function obtenerSiguienteConsecutivoCotizacion() {
  const cotizaciones = cargarCotizacionesGeneradasDB();
  const usados = cotizaciones
    .map((c) => Number(c.consecutivo))
    .filter((n) => Number.isInteger(n) && n >= RANGO_COTIZACION.desde);
  const ultimo = usados.length ? Math.max(...usados) : RANGO_COTIZACION.desde - 1;
  const siguiente = ultimo + 1;

  if (siguiente > RANGO_COTIZACION.hasta) {
    return null;
  }

  return siguiente;
}

function construirNumeroCotizacion(consecutivo) {
  return RANGO_COTIZACION.prefijo + "-" + String(consecutivo).padStart(4, "0");
}

// ── Cálculo de Líneas ───────────────────────────────────────────────────────
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

  const base            = cantidad * unitario;
  const valorIva        = base * (tarifaIva / 100);
  const valorTotalItem  = base + valorIva;
  const valorRetencion  = base * (tarifaRetencion / 100);
  const total           = valorTotalItem - valorRetencion;

  return { producto, codigo, unidad, cantidad, unitario, base, tarifaIva, valorIva, valorTotalItem, tarifaRetencion, valorRetencion, total };
}

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

  const base            = cantidad * unitario;
  const valorIva        = base * (tarifaIva / 100);
  const valorTotalItem  = base + valorIva;
  const valorRetencion  = base * (tarifaRetencion / 100);
  const total           = valorTotalItem - valorRetencion;

  $("base").value          = formatoMoneda(base);
  $("valoriva").value      = formatoMoneda(valorIva);
  $("valorretencion").value = formatoMoneda(valorRetencion);
  $("total").value         = formatoMoneda(total);
}

function renderTablaLineas() {
  const tbody = $("tabla-lineas-body");
  if (!state.lineas.length) {
    tbody.innerHTML = '<tr><td colspan="13" class="lineas-empty" style="text-align:center;padding:16px;color:#638092;">Agregue productos o servicios con «Agregar prod/serv»</td></tr>';
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
      <td><button type="button" class="btn-remove" data-index="${i}" style="background:#fff0f4;color:#d94d6a;border:none;padding:4px 8px;border-radius:6px;cursor:pointer;">✕</button></td>
    </tr>`).join("");

  tbody.querySelectorAll(".btn-remove").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.lineas.splice(Number(btn.dataset.index), 1);
      renderTablaLineas();
      actualizarResumen();
    });
  });
}

function totalesGlobales() {
  const t = state.lineas.reduce((acc, l) => {
    acc.base      += l.base;
    acc.iva       += l.valorIva;
    acc.retencion += l.valorRetencion;
    const ki = String(l.tarifaIva);
    acc.ivaPorTarifa[ki] = (acc.ivaPorTarifa[ki] || 0) + l.valorIva;
    if (l.valorRetencion > 0) {
      const kr = String(l.tarifaRetencion);
      acc.retencionPorTarifa[kr] = (acc.retencionPorTarifa[kr] || 0) + l.valorRetencion;
    }
    return acc;
  }, { base: 0, iva: 0, retencion: 0, ivaPorTarifa: {}, retencionPorTarifa: {} });

  t.total = t.base + t.iva - t.retencion;
  return t;
}

function actualizarResumen() {
  const t = totalesGlobales();
  $("resumen-base").textContent      = formatoMoneda(t.base);
  $("resumen-iva").textContent       = formatoMoneda(t.iva);
  $("resumen-retencion").textContent = formatoMoneda(t.retencion);
  $("resumen-total").textContent     = formatoMoneda(t.total);
}

function agregarLinea() {
  limpiarMensaje();
  const linea = leerLineaActual();
  if (!linea) return;

  $("base").value          = formatoMoneda(linea.base);
  $("valoriva").value      = formatoMoneda(linea.valorIva);
  $("valorretencion").value = formatoMoneda(linea.valorRetencion);
  $("total").value         = formatoMoneda(linea.total);

  state.lineas.push(linea);
  renderTablaLineas();
  actualizarResumen();

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
  }, 500);

  mostrarMensaje("✅ Línea agregada a la cotización.");
}

function limpiar() {
  state.lineas = [];
  state.clienteTercero = null;
  ["producto", "codigo", "cantidad", "unitario", "cliente-nombre", "cliente-documento",
   "cliente-telefono", "cliente-direccion", "cliente-ciudad", "cliente-email"].forEach(id => { const el = $(id); if (el) el.value = ""; });
  if ($("unidad")) $("unidad").value = "UNIDAD";
  if ($("observaciones")) $("observaciones").value = "";
  ["base", "valoriva", "valorretencion", "total"].forEach(id => { const el = $(id); if (el) el.value = ""; });
  $("iva").value       = "19";
  $("retencion").value = "0";
  renderTablaLineas();
  actualizarResumen();
  limpiarMensaje();
}

async function generarCotizacion() {
  limpiarMensaje();

  if (!state.lineas.length) {
    mostrarMensaje("Agregue al menos una línea a la cotización antes de generar.", "error");
    return;
  }

  const nombre    = $("cliente-nombre").value.trim();
  const documento = $("cliente-documento").value.trim();
  if (!nombre || !documento) {
    mostrarMensaje("Complete al menos el nombre y documento/NIT del cliente.", "error");
    return;
  }

  const btn = $("btn-generar");
  const oldText = btn.textContent;
  btn.textContent = "Generando cotización...";
  btn.disabled = true;

  try {
    let cotizacionId;
    let numeroCotizacion;

    if (useApi) {
      const reqBody = {
        cliente: {
          nombre,
          documento,
          direccion: $("cliente-direccion").value.trim(),
          ciudad:    $("cliente-ciudad") ? $("cliente-ciudad").value.trim() : "",
          telefono:  $("cliente-telefono").value.trim(),
          email:     $("cliente-email").value.trim(),
        },
        lineas: state.lineas.map(l => ({
          producto_id: l.producto_id || null,
          codigo: l.codigo,
          nombre: l.producto,
          unidad_medida: l.unidad,
          cantidad: l.cantidad,
          valor_unitario: l.unitario,
          tarifa_iva: l.tarifaIva,
          tarifa_retencion: l.tarifaRetencion
        })),
        observaciones: $("observaciones") ? $("observaciones").value.trim() : ""
      };

      const res = await apiFetch('/cotizaciones', {
        method: 'POST',
        body: JSON.stringify(reqBody)
      });

      const c = res.cotizacion;
      cotizacionId = c.id;
      numeroCotizacion = c.numero_cotizacion;

      const terceroSincronizado = { id: c.tercero_id, ...reqBody.cliente };
      const indice = apiData.terceros.findIndex((t) => String(t.id) === String(c.tercero_id));
      if (indice >= 0) apiData.terceros[indice] = { ...apiData.terceros[indice], ...terceroSincronizado };
      else apiData.terceros.push(terceroSincronizado);
    } else {
      // Modo Local
      const cliente = {
        nombre, documento,
        direccion: $("cliente-direccion").value.trim(),
        ciudad:    $("cliente-ciudad") ? $("cliente-ciudad").value.trim() : "",
        telefono:  $("cliente-telefono").value.trim(),
        email:     $("cliente-email").value.trim(),
      };

      const terceroRef = sincronizarTerceroLocal(cliente);
      const totales = totalesGlobales();
      const consecutivo = obtenerSiguienteConsecutivoCotizacion();

      if (!consecutivo) {
        throw new Error("El rango de cotizaciones 1 a 1000 ya fue consumido.");
      }

      numeroCotizacion = construirNumeroCotizacion(consecutivo);
      cotizacionId = "COTZ-" + Date.now().toString(36).toUpperCase() + "-" + Math.random().toString(36).slice(2, 6).toUpperCase();

      const payload = {
        id: cotizacionId,
        consecutivo,
        numeroCotizacion,
        cliente,
        tercero: terceroRef,
        lineas: state.lineas,
        totales,
        observaciones: $("observaciones") ? $("observaciones").value.trim() : "",
        estado: 'GUARDADA',
        generadoEn: new Date().toISOString(),
      };

      const cotizaciones = cargarCotizacionesGeneradasDB();
      cotizaciones.push(payload);
      guardarCotizacionesGeneradasDB(cotizaciones);
    }

    // Redirigir al listado de cotizaciones generadas
    window.location.href = "cotizaciones-generadas.html?creada=" + encodeURIComponent(numeroCotizacion);

  } catch (err) {
    mostrarMensaje(err.message || "Ocurrió un error al generar la cotización", "error");
  } finally {
    btn.textContent = oldText;
    btn.disabled = false;
  }
}

// ── Init ────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async function () {
  if (useApi) {
    try {
      const [tRes, pRes] = await Promise.all([
        cargarTodosLosTercerosApi(),
        apiFetch('/productos?limit=1000')
      ]);
      apiData.terceros = tRes || [];
      apiData.productos = pRes.productos || [];
      apiData.loaded = true;
    } catch(e) { console.warn("API load error", e); }
  }

  renderTablaLineas();
  actualizarResumen();

  initBusquedaCliente("cliente-nombre", "ac-nombre");
  initBusquedaCliente("cliente-documento", "ac-documento");
  initBusquedaProducto("producto", "ac-producto");
  initBusquedaCodigo("codigo", "ac-codigo");

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".ac-field")) cerrarTodosAutocomplete();
  });

  $("btn-agregar").addEventListener("click", agregarLinea);
  $("btn-limpiar").addEventListener("click", limpiar);
  $("btn-generar").addEventListener("click", generarCotizacion);

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
  if (selectIva) selectIva.addEventListener("change", calcularYPrevisualizarLinea);

  const selectRete = $("retencion");
  if (selectRete) selectRete.addEventListener("change", calcularYPrevisualizarLinea);
});
