// ── POS — AMC Facturación Electrónica y POS ─────────────────────────────────
// Comparte las mismas claves de localStorage que app.js

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

const activeUserCode = sessionStorage.getItem('amc_active_user_code') || '1110591592';
const isDev = activeUserCode === '1110591592';

// ── Keys de localStorage (mismas que app.js) ────────────────────────────────
const TERCEROS_DB_KEY       = isDev ? 'amc_terceros_db_v1'        : `amc_terceros_db_v1_${activeUserCode}`;
const PRODUCTOS_DB_KEY      = isDev ? 'amc_productos_db_v1'       : `amc_productos_db_v1_${activeUserCode}`;
const FACTURAS_DB_KEY       = isDev ? 'amc_facturas_generadas_db_v1' : `amc_facturas_generadas_db_v1_${activeUserCode}`;
const PREVIEW_KEY           = isDev ? 'amc_factura_preview_v1'    : `amc_factura_preview_v1_${activeUserCode}`;

// ── Resolución POS ───────────────────────────────────────────────────────────
const RESOLUCION_POS = {
  prefijo: 'POS',
  desde: 1,
  hasta: 1000,
  numeroResolucion: '18764111157293',
  vigenciaDesde: '12 de junio de 2026',
  vigenciaHasta: '12 de junio de 2028',
};

// ── Estado del POS ───────────────────────────────────────────────────────────
const posState = {
  carrito: [],          // [{ producto, codigo, precio, cantidad, iva, retencion }]
  tercero: null,        // objeto tercero seleccionado
  medioPago: 'EFECTIVO',
  ventaActual: null,    // última venta procesada (para ver tirilla)
};

// ── Helpers ──────────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

function formatoMoneda(valor) {
  const n = Number(valor) || 0;
  return '$ ' + Math.round(n).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function normalizarTexto(s) {
  return String(s || '').trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Quita puntos, guiones y espacios — útil para comparar NITs/cédulas formateados */
function limpiarDocumento(s) {
  return String(s || '').replace(/[.\-\s]/g, '');
}

function escapeHtml(text) {
  const d = document.createElement('div');
  d.textContent = text;
  return d.innerHTML;
}

// ── Cargar datos desde localStorage / API ───────────────────────────────────
const apiData = { terceros: [], productos: [], loaded: false };

async function apiFetch(endpoint) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
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

function cargarTerceros() {
  if (useApi && apiData.loaded) return apiData.terceros;
  try {
    const raw = localStorage.getItem(TERCEROS_DB_KEY);
    const arr = JSON.parse(raw || '[]');
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

function descontarInventarioPos(carrito, numeroPos) {
  if (!Array.isArray(carrito) || !carrito.length) return;
  const MOVIMIENTOS_DB_KEY = isDev ? 'amc_inventario_movimientos_v1' : `amc_inventario_movimientos_v1_${activeUserCode}`;

  let productos = [];
  try {
    productos = JSON.parse(localStorage.getItem(PRODUCTOS_DB_KEY) || '[]');
  } catch {
    productos = [];
  }
  if (!productos.length) return;

  let movimientos = [];
  try {
    movimientos = JSON.parse(localStorage.getItem(MOVIMIENTOS_DB_KEY) || '[]');
  } catch {
    movimientos = [];
  }

  carrito.forEach((item) => {
    const cant = Number(item.cantidad || 0);
    if (cant <= 0) return;

    const idx = productos.findIndex((p) =>
      (item.id && String(p.id) === String(item.id)) ||
      (item.codigo && normalizarTexto(p.codigo) === normalizarTexto(item.codigo)) ||
      (normalizarTexto(p.nombre) === normalizarTexto(item.nombre || item.producto))
    );

    if (idx >= 0) {
      const p = productos[idx];
      const stockAnt = Number(p.stock_total ?? p.stockTotal ?? 0);
      const stockNue = stockAnt - cant;

      p.stock_total = stockNue;
      p.stockTotal = stockNue;

      movimientos.push({
        id: 'MOV-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase(),
        producto_id: p.id,
        tipo_movimiento: 'SALIDA_VENTA',
        cantidad: -cant,
        stock_anterior: stockAnt,
        stock_nuevo: stockNue,
        referencia: `POS ${numeroPos}`,
        motivo: `Venta POS ${numeroPos}`,
        creado_en: new Date().toISOString(),
      });
    }
  });

  localStorage.setItem(PRODUCTOS_DB_KEY, JSON.stringify(productos));
  localStorage.setItem(MOVIMIENTOS_DB_KEY, JSON.stringify(movimientos));
}

function cargarProductos() {
  if (useApi && apiData.loaded) return apiData.productos.filter((p) => p.activo !== false);
  try {
    const raw = localStorage.getItem(PRODUCTOS_DB_KEY);
    const arr = JSON.parse(raw || '[]');
    return Array.isArray(arr) ? arr.filter((p) => p.activo !== false) : [];
  } catch { return []; }
}

function cargarFacturas() {
  try {
    const raw = localStorage.getItem(FACTURAS_DB_KEY);
    const arr = JSON.parse(raw || '[]');
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

function guardarFacturas(arr) {
  localStorage.setItem(FACTURAS_DB_KEY, JSON.stringify(arr));
}

// ── Productos más vendidos ───────────────────────────────────────────────────
/**
 * Cuenta la frecuencia de venta de cada producto en las facturas generadas.
 * Ordena de mayor a menor ventas. Si hay empate, el más reciente va primero.
 * Retorna máx. 20 items.
 */
function obtenerProductosMasVendidos() {
  const facturas = cargarFacturas();
  const productos = cargarProductos();

  // Mapa: codigo → { count, lastDate, producto }
  const mapaVentas = {};

  facturas.forEach((f) => {
    const lineas = f.lineas || [];
    lineas.forEach((l) => {
      const key = normalizarTexto(l.codigo || l.producto || '');
      if (!key) return;
      if (!mapaVentas[key]) {
        mapaVentas[key] = { count: 0, lastDate: f.generadoEn || '', producto: null };
      }
      mapaVentas[key].count += Number(l.cantidad) || 1;
      if (f.generadoEn > mapaVentas[key].lastDate) {
        mapaVentas[key].lastDate = f.generadoEn;
      }
    });
  });

  // Cruzar con la base de productos para obtener precio actual
  const resultado = [];
  productos.forEach((p) => {
    const key = normalizarTexto(p.codigo || p.nombre || '');
    const stats = mapaVentas[key];
    resultado.push({
      nombre: p.nombre,
      codigo: p.codigo || '',
      precio: Number(p.precio || p.precio_base || p.precioBase || p.valorUnitario || p.precio_venta || 0),
      iva: Number(p.iva || 19),
      retencion: Number(p.retencion || 0),
      count: stats ? stats.count : 0,
      lastDate: stats ? stats.lastDate : '',
      _prod: p,
    });
  });

  // Ordenar: primero los más vendidos, luego por fecha de última venta (más reciente primero)
  resultado.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return b.lastDate.localeCompare(a.lastDate);
  });

  return resultado.slice(0, 20);
}

// ── Render del grid de productos ─────────────────────────────────────────────
function renderProductosGrid() {
  const grid = $('pos-products-grid');
  const items = obtenerProductosMasVendidos();

  if (!items.length) {
    grid.innerHTML = `
      <div class="pos-products-empty" style="grid-column:1/-1;">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
        </svg>
        <span>Cree productos/servicios primero<br>para verlos aquí.</span>
      </div>`;
    return;
  }

  grid.innerHTML = items.map((item, i) => `
    <div class="pos-product-card" data-index="${i}" role="button" tabindex="0" title="${escapeHtml(item.nombre)}">
      <div class="prod-name">${escapeHtml(item.nombre)}</div>
      <div class="prod-price">${item.precio > 0 ? formatoMoneda(item.precio) : '—'}</div>
    </div>
  `).join('');

  grid.querySelectorAll('.pos-product-card').forEach((card, i) => {
    const handler = () => agregarAlCarrito(items[i]);
    card.addEventListener('click', handler);
    card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') handler(); });
  });

  // Guardar items referenciados para el click
  grid._items = items;
}

// ── Carrito ──────────────────────────────────────────────────────────────────
function agregarAlCarrito(prod) {
  if (!prod) return;

  // Si ya existe en el carrito, incrementar cantidad
  const existente = posState.carrito.find(
    (item) => normalizarTexto(item.codigo || item.nombre) === normalizarTexto(prod.codigo || prod.nombre)
  );
  if (existente) {
    existente.cantidad++;
  } else {
    posState.carrito.push({
      nombre: prod.nombre || prod.producto || '',
      codigo: prod.codigo || '',
      precio: Number(prod.precio || prod.precio_base || prod.precioBase || prod.valorUnitario || prod.precio_venta || 0),
      cantidad: 1,
      iva: Number(prod.iva !== undefined ? prod.iva : 19),
      retencion: Number(prod.retencion || 0),
    });
  }

  renderCarrito();
  actualizarTotales();
}

function cambiarCantidad(index, delta) {
  const item = posState.carrito[index];
  if (!item) return;
  item.cantidad = Math.max(1, item.cantidad + delta);
  renderCarrito();
  actualizarTotales();
}

function eliminarDeCarrito(index) {
  posState.carrito.splice(index, 1);
  renderCarrito();
  actualizarTotales();
}

function renderCarrito() {
  const cart = $('pos-cart');
  const empty = $('pos-cart-empty');

  // Limpiar ítems previos (conservar empty)
  cart.querySelectorAll('.pos-cart-item-v2').forEach((el) => el.remove());

  if (!posState.carrito.length) {
    if (empty) empty.style.display = 'flex';
    return;
  }
  if (empty) empty.style.display = 'none';

  posState.carrito.forEach((item, i) => {
    const base   = item.precio * item.cantidad;
    const iva    = base * (item.iva / 100);
    const rete   = base * (item.retencion / 100);
    const total  = base + iva - rete;

    const div = document.createElement('div');
    div.className = 'pos-cart-item-v2';
    div.innerHTML = `
      <div class="ci-header">
        <div class="ci-title" title="${escapeHtml(item.nombre)}">${escapeHtml(item.nombre)}</div>
        <button class="btn-rm-item" data-i="${i}" type="button" title="Eliminar">✕</button>
      </div>
      <div class="ci-grid">
        <div class="ci-col">
          <label>Cant.</label>
          <div class="ci-qty-row">
            <button class="btn-qty btn-qty-minus" data-i="${i}" type="button">−</button>
            <input type="number" class="ci-qty-input" data-i="${i}" value="${item.cantidad}" min="1">
            <button class="btn-qty btn-qty-plus" data-i="${i}" type="button">+</button>
          </div>
        </div>
        <div class="ci-col">
          <label>Val. Unit. ($)</label>
          <input type="number" class="ci-price-input" data-i="${i}" value="${item.precio}" min="0" step="any">
        </div>
        <div class="ci-col">
          <label>IVA (%)</label>
          <select class="ci-iva-select" data-i="${i}">
            <option value="0" ${Number(item.iva) === 0 ? 'selected' : ''}>0%</option>
            <option value="5" ${Number(item.iva) === 5 ? 'selected' : ''}>5%</option>
            <option value="19" ${Number(item.iva) === 19 ? 'selected' : ''}>19%</option>
          </select>
        </div>
        <div class="ci-col">
          <label>Rete (%)</label>
          <select class="ci-rete-select" data-i="${i}">
            <option value="0" ${Number(item.retencion) === 0 ? 'selected' : ''}>0%</option>
            <option value="2.5" ${Number(item.retencion) === 2.5 ? 'selected' : ''}>2.5%</option>
            <option value="4" ${Number(item.retencion) === 4 ? 'selected' : ''}>4%</option>
            <option value="6" ${Number(item.retencion) === 6 ? 'selected' : ''}>6%</option>
            <option value="11" ${Number(item.retencion) === 11 ? 'selected' : ''}>11%</option>
          </select>
        </div>
      </div>
      <div class="ci-footer">
        <span>Sub: ${formatoMoneda(base)} | IVA: ${formatoMoneda(iva)} | Rete: ${formatoMoneda(rete)}</span>
        <span class="ci-total-label">Total: ${formatoMoneda(total)}</span>
      </div>
    `;
    cart.appendChild(div);
  });

  // Eventos de inputs y botones
  cart.querySelectorAll('.btn-qty-minus').forEach((btn) => {
    btn.addEventListener('click', () => cambiarCantidad(Number(btn.dataset.i), -1));
  });
  cart.querySelectorAll('.btn-qty-plus').forEach((btn) => {
    btn.addEventListener('click', () => cambiarCantidad(Number(btn.dataset.i), +1));
  });
  cart.querySelectorAll('.ci-qty-input').forEach((input) => {
    input.addEventListener('change', (e) => {
      const idx = Number(input.dataset.i);
      const val = Math.max(1, parseInt(e.target.value) || 1);
      posState.carrito[idx].cantidad = val;
      renderCarrito();
      actualizarTotales();
    });
  });
  cart.querySelectorAll('.ci-price-input').forEach((input) => {
    input.addEventListener('change', (e) => {
      const idx = Number(input.dataset.i);
      const val = Math.max(0, parseFloat(e.target.value) || 0);
      posState.carrito[idx].precio = val;
      renderCarrito();
      actualizarTotales();
    });
  });
  cart.querySelectorAll('.ci-iva-select').forEach((sel) => {
    sel.addEventListener('change', (e) => {
      const idx = Number(sel.dataset.i);
      posState.carrito[idx].iva = Number(e.target.value) || 0;
      renderCarrito();
      actualizarTotales();
    });
  });
  cart.querySelectorAll('.ci-rete-select').forEach((sel) => {
    sel.addEventListener('change', (e) => {
      const idx = Number(sel.dataset.i);
      posState.carrito[idx].retencion = Number(e.target.value) || 0;
      renderCarrito();
      actualizarTotales();
    });
  });
  cart.querySelectorAll('.btn-rm-item').forEach((btn) => {
    btn.addEventListener('click', () => eliminarDeCarrito(Number(btn.dataset.i)));
  });
}

// ── Totales ──────────────────────────────────────────────────────────────────
function calcularTotalesCarrito() {
  return posState.carrito.reduce((acc, item) => {
    const base  = item.precio * item.cantidad;
    const iva   = base * (item.iva / 100);
    const rete  = base * (item.retencion / 100);
    acc.base      += base;
    acc.iva       += iva;
    acc.retencion += rete;
    acc.total     += base + iva - rete;
    acc.articulos += item.cantidad;
    return acc;
  }, { base: 0, iva: 0, retencion: 0, total: 0, articulos: 0 });
}

function actualizarTotales() {
  const t = calcularTotalesCarrito();
  $('pos-subtotal').textContent    = formatoMoneda(t.base);
  $('pos-iva').textContent         = formatoMoneda(t.iva);
  $('pos-retenciones').textContent = formatoMoneda(t.retencion);
  $('pos-total').textContent       = formatoMoneda(t.total);

  const btnPagar = $('btn-pagar');
  $('pagar-label').textContent = `Pagar ${t.articulos} Artículo${t.articulos !== 1 ? 's' : ''}`;
  $('pagar-total').textContent = formatoMoneda(t.total);
  btnPagar.disabled = t.articulos === 0;
}

// ── Autocomplete Tercero ─────────────────────────────────────────────────────
function buscarTerceros(query) {
  const q = normalizarTexto(query);
  // Versión limpia (sin puntos/guiones) para comparar contra documentos formateados
  const qDoc = limpiarDocumento(normalizarTexto(query));
  if (q.length < 3) return [];
  return cargarTerceros()
    .filter((t) => {
      const docLimpio = limpiarDocumento(normalizarTexto(t.documento || ''));
      return normalizarTexto(t.nombre).includes(q)
        || docLimpio.includes(qDoc)
        || normalizarTexto(t.documento || '').includes(q);
    })
    .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''))
    .slice(0, 8);
}

function initTerceroAutocomplete() {
  const input    = $('pos-tercero-input');
  const dropdown = $('pos-tercero-dropdown');
  if (!input || !dropdown) return;

  let activeIndex = -1;

  function render() {
    const resultados = buscarTerceros(input.value);
    activeIndex = -1;

    if (input.value.trim().length < 3) {
      dropdown.classList.remove('visible');
      dropdown.innerHTML = '';
      return;
    }

    if (!resultados.length) {
      dropdown.innerHTML = '<div class="pos-ac-empty">Sin coincidencias. Cree el tercero en el módulo de clientes.</div>';
      dropdown.classList.add('visible');
      return;
    }

    dropdown.innerHTML = resultados.map((t, i) => `
      <div class="pos-ac-item" data-index="${i}" role="option">
        <strong>${escapeHtml(t.nombre)}</strong>
        <span>Doc: ${escapeHtml(t.documento)}${t.email ? ' · ' + escapeHtml(t.email) : ''}</span>
      </div>
    `).join('');
    dropdown.classList.add('visible');

    dropdown.querySelectorAll('.pos-ac-item').forEach((item) => {
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        seleccionarTercero(resultados[Number(item.dataset.index)]);
      });
    });
  }

  function marcarActivo() {
    dropdown.querySelectorAll('.pos-ac-item').forEach((el, i) => {
      el.classList.toggle('active', i === activeIndex);
    });
  }

  function seleccionarTercero(tercero) {
    posState.tercero = tercero;
    $('pos-tercero-display').textContent = `${tercero.nombre} — ${tercero.documento}`;
    dropdown.classList.remove('visible');
    dropdown.innerHTML = '';
    input.value = '';
  }

  input.addEventListener('input', render);
  input.addEventListener('focus', () => { if (input.value.trim().length >= 3) render(); });
  input.addEventListener('keydown', (e) => {
    const items = dropdown.querySelectorAll('.pos-ac-item');
    if (!items.length || !dropdown.classList.contains('visible')) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); activeIndex = Math.min(activeIndex + 1, items.length - 1); marcarActivo(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); activeIndex = Math.max(activeIndex - 1, 0); marcarActivo(); }
    else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      seleccionarTercero(buscarTerceros(input.value)[activeIndex]);
    } else if (e.key === 'Escape') { dropdown.classList.remove('visible'); }
  });
  input.addEventListener('blur', () => setTimeout(() => dropdown.classList.remove('visible'), 150));
}

// ── Autocomplete búsqueda de productos ───────────────────────────────────────
function buscarProductosPOS(query) {
  const q = normalizarTexto(query);
  if (q.length < 1) return [];
  return cargarProductos()
    .filter((p) => normalizarTexto(p.nombre).includes(q) || normalizarTexto(p.codigo).includes(q))
    .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''))
    .slice(0, 10);
}

function initBusquedaProductosPOS() {
  const input    = $('pos-search-input');
  const dropdown = $('pos-search-dropdown');
  if (!input || !dropdown) return;

  let activeIndex = -1;

  function render() {
    const resultados = buscarProductosPOS(input.value);
    activeIndex = -1;

    if (!input.value.trim().length) {
      dropdown.classList.remove('visible');
      dropdown.innerHTML = '';
      return;
    }

    if (!resultados.length) {
      dropdown.innerHTML = '<div class="pos-ac-empty">No se encontraron productos con esa búsqueda.</div>';
      dropdown.classList.add('visible');
      return;
    }

    dropdown.innerHTML = resultados.map((p, i) => `
      <div class="pos-ac-item" data-index="${i}" role="option">
        <strong>${escapeHtml(p.nombre)}</strong>
        <span>Cód: ${escapeHtml(p.codigo || '—')} · ${Number(p.precio || p.precio_base || p.precioBase || p.precio_venta || 0) > 0 ? formatoMoneda(Number(p.precio || p.precio_base || p.precioBase || p.precio_venta || 0)) : 'Sin precio'} · IVA ${p.iva || 0}%</span>
      </div>
    `).join('');
    dropdown.classList.add('visible');

    dropdown.querySelectorAll('.pos-ac-item').forEach((item) => {
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const prod = resultados[Number(item.dataset.index)];
        agregarAlCarrito({
          nombre: prod.nombre,
          codigo: prod.codigo || '',
          precio: Number(prod.precio || prod.precio_base || prod.precioBase || prod.valorUnitario || prod.precio_venta || 0),
          iva: Number(prod.iva !== undefined ? prod.iva : 19),
          retencion: Number(prod.retencion !== undefined ? prod.retencion : 0),
        });
        input.value = '';
        dropdown.classList.remove('visible');
        dropdown.innerHTML = '';
      });
    });
  }

  function marcarActivo() {
    dropdown.querySelectorAll('.pos-ac-item').forEach((el, i) => {
      el.classList.toggle('active', i === activeIndex);
    });
  }

  input.addEventListener('input', render);
  input.addEventListener('focus', () => { if (input.value.trim().length >= 1) render(); });
  input.addEventListener('keydown', (e) => {
    const items = dropdown.querySelectorAll('.pos-ac-item');
    if (!items.length || !dropdown.classList.contains('visible')) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); activeIndex = Math.min(activeIndex + 1, items.length - 1); marcarActivo(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); activeIndex = Math.max(activeIndex - 1, 0); marcarActivo(); }
    else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      const prod = buscarProductosPOS(input.value)[activeIndex];
      if (prod) {
        agregarAlCarrito({
          nombre: prod.nombre,
          codigo: prod.codigo || '',
          precio: Number(prod.precio || prod.precio_base || prod.precioBase || prod.valorUnitario || prod.precio_venta || 0),
          iva: Number(prod.iva !== undefined ? prod.iva : 19),
          retencion: Number(prod.retencion !== undefined ? prod.retencion : 0)
        });
        input.value = '';
        dropdown.classList.remove('visible');
      }
    } else if (e.key === 'Escape') { dropdown.classList.remove('visible'); }
  });
  input.addEventListener('blur', () => setTimeout(() => dropdown.classList.remove('visible'), 150));
}

// ── Generar y guardar venta POS ──────────────────────────────────────────────
function obtenerSiguienteConsecutivoPOS() {
  const facturas = cargarFacturas();
  // Solo cuenta facturas POS para su propio consecutivo
  const posFacturas = facturas.filter((f) => f.tipo === 'POS');
  const usados = posFacturas
    .map((f) => Number(f.consecutivo))
    .filter((n) => Number.isInteger(n) && n >= RESOLUCION_POS.desde);
  const ultimo = usados.length ? Math.max(...usados) : RESOLUCION_POS.desde - 1;
  const siguiente = ultimo + 1;
  if (siguiente > RESOLUCION_POS.hasta) {
    alert('El rango de la resolución POS está agotado (POS-001 a POS-1000). Contacte al administrador.');
    return null;
  }
  return siguiente;
}

function procesarVenta() {
  if (!posState.carrito.length) return;
  if (!posState.tercero) {
    alert('Por favor seleccione un cliente (tercero) antes de pagar.');
    return;
  }

  const consecutivo = obtenerSiguienteConsecutivoPOS();
  if (!consecutivo) return; // rango agotado

  const totales   = calcularTotalesCarrito();
  const numero    = `${RESOLUCION_POS.prefijo}-${String(consecutivo).padStart(3, '0')}`;
  const medioPago = $('pos-medio-pago').value;
  const tercero   = posState.tercero;

  // Calcular IVA por tarifa para el desglose en tirilla
  const ivaPorTarifa = {};
  posState.carrito.forEach((item) => {
    const tarifa = String(item.iva);
    const valorIva = item.precio * item.cantidad * (item.iva / 100);
    ivaPorTarifa[tarifa] = (ivaPorTarifa[tarifa] || 0) + valorIva;
  });

  const venta = {
    id: 'POS-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase(),
    tipo: 'POS',
    consecutivo,
    numeroFactura: numero,
    cufe: generarCufePos(),
    generadoEn: new Date().toISOString(),
    resolucion: {
      numero: RESOLUCION_POS.numeroResolucion,
      prefijo: RESOLUCION_POS.prefijo,
      desde: RESOLUCION_POS.desde,
      hasta: RESOLUCION_POS.hasta,
      vigenciaDesde: RESOLUCION_POS.vigenciaDesde,
      vigenciaHasta: RESOLUCION_POS.vigenciaHasta,
    },
    cliente: {
      nombre: tercero.nombre,
      documento: tercero.documento,
      email: tercero.email || '',
      telefono: tercero.telefono || '',
      direccion: tercero.direccion || '',
      ciudad: tercero.ciudad || '',
    },
    lineas: posState.carrito.map((item) => ({
      producto: item.nombre,
      codigo:   item.codigo,
      unidad:   'Unidad',
      cantidad: item.cantidad,
      unitario: item.precio,
      base:     item.precio * item.cantidad,
      tarifaIva: item.iva,
      valorIva:  item.precio * item.cantidad * (item.iva / 100),
      tarifaRetencion: item.retencion,
      valorRetencion:  item.precio * item.cantidad * (item.retencion / 100),
      total:    item.precio * item.cantidad * (1 + item.iva / 100) - item.precio * item.cantidad * (item.retencion / 100),
    })),
    totales: {
      base:         totales.base,
      iva:          totales.iva,
      retencion:    totales.retencion,
      total:        totales.total,
      ivaPorTarifa, // necesario para el desglose en la tirilla
    },
    medioPago,
    medioPagoLabel: { EFECTIVO: 'Efectivo', TRANSFERENCIA: 'Transferencia bancaria', TARJETA: 'Tarjeta débito / crédito' }[medioPago] || medioPago,
    observaciones: '',
  };

  // Guardar en base de facturas (misma BD que FE, con tipo POS)
  const facturas = cargarFacturas();
  facturas.push(venta);
  guardarFacturas(facturas);

  // Descontar existencias contables de los productos vendidos
  descontarInventarioPos(posState.carrito, numero);

  // Guardar en sessionStorage para poder abrir la tirilla
  posState.ventaActual = venta;
  sessionStorage.setItem(PREVIEW_KEY, JSON.stringify(venta));

  // Mostrar modal de éxito
  $('pos-modal-numero').textContent = numero;
  $('pos-modal-msg').textContent =
    `${totales.articulos} artículo${totales.articulos !== 1 ? 's' : ''} · ${formatoMoneda(totales.total)} · ${venta.medioPagoLabel}`;
  $('pos-modal-exito').classList.add('active');
}

/** Genera un CUFE demo para factura POS */
function generarCufePos() {
  const chars = '0123456789abcdef';
  let s = '';
  for (let i = 0; i < 96; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function nuevaVenta() {
  posState.carrito = [];
  posState.tercero = null;
  posState.ventaActual = null;
  $('pos-modal-exito').classList.remove('active');
  $('pos-tercero-display').textContent = '— Seleccione cliente —';
  $('pos-medio-pago').value = 'EFECTIVO';
  renderCarrito();
  actualizarTotales();
  renderProductosGrid(); // Actualizar grid con nueva info de ventas
}

// ── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {

  // Cargar datos vía API si hay token
  if (useApi) {
    try {
      const [tRes, pRes] = await Promise.all([
        cargarTodosLosTercerosApi(),
        apiFetch('/productos?limit=1000'),
      ]);
      apiData.terceros  = tRes || [];
      apiData.productos = pRes.productos || [];
      apiData.loaded = true;
    } catch (e) { console.warn('API load error:', e); }
  }

  // Render inicial
  renderProductosGrid();
  renderCarrito();
  actualizarTotales();

  // Iniciar autocompletes
  initTerceroAutocomplete();
  initBusquedaProductosPOS();



  // Cerrar dropdowns al hacer click fuera
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#pos-tercero-section')) {
      $('pos-tercero-dropdown').classList.remove('visible');
    }
    if (!e.target.closest('.pos-search-row')) {
      $('pos-search-dropdown').classList.remove('visible');
    }
  });

  // Botón pagar
  $('btn-pagar').addEventListener('click', procesarVenta);

  // Modal nueva venta
  $('btn-modal-nueva-venta').addEventListener('click', nuevaVenta);

  // Modal ver factura (tirilla)
  $('btn-modal-ver-factura').addEventListener('click', () => {
    if (posState.ventaActual) {
      sessionStorage.setItem(PREVIEW_KEY, JSON.stringify(posState.ventaActual));
    }
    window.location.href = '../prefactura.html';
  });

  // Botón cerrar caja → volver al inicio
  $('btn-cerrar-caja').addEventListener('click', () => {
    if (posState.carrito.length > 0) {
      if (!confirm('¿Seguro que deseas cerrar la caja? Se perderán los artículos en el carrito actual.')) return;
    }
    window.location.href = '../index.html';
  });



  // Botón añadir manual (+) - sólo abre focus en búsqueda
  $('btn-search-add').addEventListener('click', () => {
    $('pos-search-input').focus();
  });

  // Medio de pago
  $('pos-medio-pago').addEventListener('change', (e) => {
    posState.medioPago = e.target.value;
  });
});
