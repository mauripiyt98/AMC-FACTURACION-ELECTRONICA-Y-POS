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

// ── Estado del POS ───────────────────────────────────────────────────────────
const posState = {
  carrito: [],          // [{ producto, codigo, precio, cantidad, iva, retencion }]
  tercero: null,        // objeto tercero seleccionado
  medioPago: 'EFECTIVO',
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

function cargarTerceros() {
  if (useApi && apiData.loaded) return apiData.terceros;
  try {
    const raw = localStorage.getItem(TERCEROS_DB_KEY);
    const arr = JSON.parse(raw || '[]');
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

function cargarProductos() {
  if (useApi && apiData.loaded) return apiData.productos;
  try {
    const raw = localStorage.getItem(PRODUCTOS_DB_KEY);
    const arr = JSON.parse(raw || '[]');
    return Array.isArray(arr) ? arr : [];
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
      precio: Number(p.precio || p.valorUnitario || p.precio_venta || 0),
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
      precio: Number(prod.precio || prod.unitario || prod.precio_venta || 0),
      cantidad: 1,
      iva: Number(prod.iva || 0),
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
  cart.querySelectorAll('.pos-cart-item').forEach((el) => el.remove());

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
    div.className = 'pos-cart-item';
    div.innerHTML = `
      <div class="pos-cart-item-info">
        <div class="ci-name">${escapeHtml(item.nombre)}</div>
        <div class="ci-detail">${formatoMoneda(item.precio)} u. · IVA ${item.iva}%</div>
      </div>
      <div class="pos-cart-item-qty">
        <button class="btn-qty btn-qty-minus" data-i="${i}" type="button">−</button>
        <span class="ci-qty-val">${item.cantidad}</span>
        <button class="btn-qty btn-qty-plus" data-i="${i}" type="button">+</button>
      </div>
      <span class="ci-total">${formatoMoneda(total)}</span>
      <button class="btn-rm-item" data-i="${i}" type="button" title="Eliminar">✕</button>
    `;
    cart.appendChild(div);
  });

  // Eventos de cantidad y eliminar
  cart.querySelectorAll('.btn-qty-minus').forEach((btn) => {
    btn.addEventListener('click', () => cambiarCantidad(Number(btn.dataset.i), -1));
  });
  cart.querySelectorAll('.btn-qty-plus').forEach((btn) => {
    btn.addEventListener('click', () => cambiarCantidad(Number(btn.dataset.i), +1));
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
  if (q.length < 4) return [];
  return cargarTerceros()
    .filter((t) => {
      return normalizarTexto(t.nombre).includes(q) || normalizarTexto(t.documento).includes(q);
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

    if (input.value.trim().length < 4) {
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
    $('pos-tercero-input-wrap').style.display = 'none';
    dropdown.classList.remove('visible');
    dropdown.innerHTML = '';
    input.value = '';
  }

  input.addEventListener('input', render);
  input.addEventListener('focus', () => { if (input.value.trim().length >= 4) render(); });
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
        <span>Cód: ${escapeHtml(p.codigo || '—')} · ${Number(p.precio || p.precio_venta || 0) > 0 ? formatoMoneda(Number(p.precio || p.precio_venta || 0)) : 'Sin precio'} · IVA ${p.iva || 0}%</span>
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
          precio: Number(prod.precio || prod.precio_venta || 0),
          iva: Number(prod.iva || 0),
          retencion: Number(prod.retencion || 0),
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
        agregarAlCarrito({ nombre: prod.nombre, codigo: prod.codigo || '', precio: Number(prod.precio || prod.precio_venta || 0), iva: Number(prod.iva || 0), retencion: Number(prod.retencion || 0) });
        input.value = '';
        dropdown.classList.remove('visible');
      }
    } else if (e.key === 'Escape') { dropdown.classList.remove('visible'); }
  });
  input.addEventListener('blur', () => setTimeout(() => dropdown.classList.remove('visible'), 150));
}

// ── Generar y guardar venta POS ──────────────────────────────────────────────
const RESOLUCION_POS = { prefijo: 'POS', desde: 1, hasta: 9999 };

function obtenerSiguienteConsecutivoPOS() {
  const facturas = cargarFacturas();
  const posFacturas = facturas.filter((f) => f.tipo === 'POS');
  const usados = posFacturas.map((f) => Number(f.consecutivo)).filter((n) => n >= 1);
  const ultimo = usados.length ? Math.max(...usados) : 0;
  return ultimo + 1;
}

function procesarVenta() {
  if (!posState.carrito.length) return;
  if (!posState.tercero) {
    alert('Por favor seleccione un cliente (tercero) antes de pagar.');
    return;
  }

  const totales    = calcularTotalesCarrito();
  const consecutivo = obtenerSiguienteConsecutivoPOS();
  const numero     = `${RESOLUCION_POS.prefijo}-${String(consecutivo).padStart(4, '0')}`;
  const medioPago  = $('pos-medio-pago').value;
  const tercero    = posState.tercero;

  const venta = {
    id: 'POS-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase(),
    tipo: 'POS',
    consecutivo,
    numeroFactura: numero,
    cufe: '',
    generadoEn: new Date().toISOString(),
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
      unidad:   'UNIDAD',
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
      base: totales.base,
      iva: totales.iva,
      retencion: totales.retencion,
      total: totales.total,
    },
    medioPago,
    medioPagoLabel: { EFECTIVO: 'Efectivo', TRANSFERENCIA: 'Transferencia bancaria', TARJETA: 'Tarjeta débito / crédito' }[medioPago] || medioPago,
    observaciones: '',
  };

  const facturas = cargarFacturas();
  facturas.push(venta);
  guardarFacturas(facturas);

  // Mostrar modal de éxito
  $('pos-modal-msg').textContent =
    `Venta ${numero} · ${totales.articulos} artículo${totales.articulos !== 1 ? 's' : ''} · ${formatoMoneda(totales.total)} · Medio: ${venta.medioPagoLabel}`;
  $('pos-modal-exito').classList.add('active');
}

function nuevaVenta() {
  posState.carrito = [];
  posState.tercero = null;
  $('pos-modal-exito').classList.remove('active');
  $('pos-tercero-display').textContent = '— Seleccione cliente —';
  $('pos-tercero-input-wrap').style.display = 'none';
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
        apiFetch('/terceros'),
        apiFetch('/productos?limit=1000'),
      ]);
      apiData.terceros  = tRes.terceros  || [];
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

  // Botón "Cambiar" tercero
  $('btn-cambiar-tercero').addEventListener('click', () => {
    const wrap = $('pos-tercero-input-wrap');
    const visible = wrap.style.display !== 'none';
    wrap.style.display = visible ? 'none' : 'block';
    if (!visible) setTimeout(() => $('pos-tercero-input').focus(), 80);
  });

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
