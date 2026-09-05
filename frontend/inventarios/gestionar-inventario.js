'use strict';

document.addEventListener('DOMContentLoaded', () => {
  const SESSION_KEY = 'amc_session_v2';
  const activeUserCode = sessionStorage.getItem('amc_active_user_code') || '1110591592';
  const isDev = activeUserCode === '1110591592';
  const PRODUCTOS_DB_KEY = isDev ? 'amc_productos_db_v1' : `amc_productos_db_v1_${activeUserCode}`;
  const MOVIMIENTOS_DB_KEY = isDev ? 'amc_inventario_movimientos_v1' : `amc_inventario_movimientos_v1_${activeUserCode}`;
  const GESTIONAR_PROD_KEY = isDev ? 'amc_producto_gestionar_v1' : `amc_producto_gestionar_v1_${activeUserCode}`;
  const API_BASE = 'http://localhost:3000/api';
  const $ = (id) => document.getElementById(id);

  let state = {
    producto: null,
    movimientos: [],
    useApi: false,
  };

  function getToken() {
    try {
      return JSON.parse(sessionStorage.getItem(SESSION_KEY) || '{}').token || null;
    } catch {
      return null;
    }
  }

  function escapeHtml(value) {
    const el = document.createElement('div');
    el.textContent = String(value ?? '');
    return el.innerHTML;
  }

  function formatoMoneda(valor) {
    return '$ ' + Math.round(Number(valor) || 0).toLocaleString('es-CO');
  }

  function fechaHoraColombia(valor) {
    return new Date(valor || Date.now()).toLocaleString('es-CO', {
      timeZone: 'America/Bogota',
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  }

  function mostrarAlerta(texto, esError = false) {
    const container = $('alerta-mensaje');
    container.innerHTML = `<div class="notice${esError ? ' error' : ''}">${escapeHtml(texto)}</div>`;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => {
      if (container.querySelector('.notice') && !esError) {
        container.innerHTML = '';
      }
    }, 6000);
  }

  async function apiFetch(endpoint, options = {}) {
    const token = getToken();
    const res = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Error en la petición al servidor.');
    return data;
  }

  // ── Carga del producto ──────────────────────────────────────────────────────
  async function cargarProducto() {
    const params = new URLSearchParams(window.location.search);
    const idParam = params.get('id');

    state.useApi = !!getToken();

    if (state.useApi && idParam) {
      try {
        const data = await apiFetch(`/productos/${encodeURIComponent(idParam)}`);
        if (data.producto) {
          state.producto = {
            ...data.producto,
            stock_total: Number(data.producto.stock_total || 0),
            stock_minimo: Number(data.producto.stock_minimo || 0),
            precio_base: Number(data.producto.precio_base || 0),
          };
          return;
        }
      } catch (err) {
        console.warn('Error cargando producto del API, usando local:', err);
      }
    }

    // Fallback LocalStorage
    let list = [];
    try {
      list = JSON.parse(localStorage.getItem(PRODUCTOS_DB_KEY) || '[]');
    } catch {
      list = [];
    }

    if (idParam) {
      state.producto = list.find((p) => String(p.id) === String(idParam)) || null;
    }

    if (!state.producto) {
      try {
        state.producto = JSON.parse(sessionStorage.getItem(GESTIONAR_PROD_KEY) || 'null');
      } catch {
        state.producto = null;
      }
    }

    if (state.producto) {
      state.producto = {
        ...state.producto,
        stock_total: Number(state.producto.stock_total ?? state.producto.stockTotal ?? 0),
        stock_minimo: Number(state.producto.stock_minimo ?? state.producto.stockMinimo ?? 0),
        precio_base: Number(state.producto.precio_base ?? state.producto.precioBase ?? state.producto.precio ?? 0),
      };
    }
  }

  // ── Carga de movimientos (Kardex) ──────────────────────────────────────────
  async function cargarMovimientos() {
    if (!state.producto) return;

    if (state.useApi) {
      try {
        const data = await apiFetch(`/productos/${encodeURIComponent(state.producto.id)}/movimientos?limit=100`);
        state.movimientos = data.movimientos || [];
        return;
      } catch (err) {
        console.warn('Error cargando movimientos del API:', err);
      }
    }

    // Fallback Local
    try {
      const allMovs = JSON.parse(localStorage.getItem(MOVIMIENTOS_DB_KEY) || '[]');
      state.movimientos = allMovs
        .filter((m) => String(m.producto_id) === String(state.producto.id))
        .sort((a, b) => new Date(b.creado_en) - new Date(a.creado_en));
    } catch {
      state.movimientos = [];
    }
  }

  // ── Renderizado de la vista ────────────────────────────────────────────────
  function render() {
    if (!state.producto) {
      $('prod-nombre').textContent = 'Producto no encontrado';
      mostrarAlerta('No se encontró el producto especificado. Regrese a la lista de inventarios.', true);
      return;
    }

    const p = state.producto;
    const esServicio = String(p.tipo || 'PRODUCTO').toUpperCase() === 'SERVICIO';

    $('prod-nombre').textContent = p.nombre || 'Sin nombre';
    $('prod-tipo-badge').textContent = esServicio ? 'Servicio' : 'Producto';
    $('prod-tipo-badge').style.background = esServicio ? '#fef3c7' : '#eaf4ff';
    $('prod-tipo-badge').style.color = esServicio ? '#b45309' : '#0032c8';

    const estadoBadge = $('prod-estado-badge');
    const activo = p.activo !== false;
    estadoBadge.textContent = activo ? 'Activo' : 'Inactivo';
    estadoBadge.className = `badge-status ${activo ? 'active' : 'inactive'}`;

    $('prod-codigo').textContent = p.codigo || '—';
    $('prod-unidad').textContent = (p.unidad_medida || p.unidad || 'UNIDAD').toUpperCase();
    $('prod-precio').textContent = formatoMoneda(p.precio_base || 0);
    $('prod-iva').textContent = `${Number(p.iva ?? 19)}%`;

    // Existencias actuales
    const stockActual = Number(p.stock_total || 0);
    const stockMinimo = Number(p.stock_minimo || 0);

    $('stock-actual-num').textContent = stockActual.toLocaleString('es-CO');
    $('stock-unidad-tag').textContent = (p.unidad_medida || p.unidad || 'unidades').toLowerCase();

    const levelBadge = $('stock-level-badge');
    if (stockActual <= 0) {
      levelBadge.textContent = 'Sin existencias';
      levelBadge.className = 'stock-level-badge level-empty';
    } else if (stockMinimo > 0 && stockActual <= stockMinimo) {
      levelBadge.textContent = `Stock bajo (Mínimo: ${stockMinimo})`;
      levelBadge.className = 'stock-level-badge level-low';
    } else {
      levelBadge.textContent = 'Existencias normales';
      levelBadge.className = 'stock-level-badge level-ok';
    }

    $('stock-minimo-input').value = stockMinimo > 0 ? stockMinimo : '';

    actualizarPreviewStock();
    renderKardex();
  }

  function actualizarPreviewStock() {
    if (!state.producto) return;
    const stockActual = Number(state.producto.stock_total || 0);
    const tipoOp = $('tipo-operacion').value;
    const valInput = parseFloat($('cantidad-input').value) || 0;

    let stockCalculado = stockActual;
    const label = $('cantidad-label');

    if (tipoOp === 'AJUSTE_DIRECTO') {
      label.textContent = 'Nuevo valor de stock total';
      stockCalculado = valInput;
    } else if (tipoOp === 'ENTRADA') {
      label.textContent = 'Cantidad de unidades a ingresar (+)';
      stockCalculado = stockActual + valInput;
    } else if (tipoOp === 'SALIDA_MANUAL') {
      label.textContent = 'Cantidad de unidades a retirar (-)';
      stockCalculado = Math.max(0, stockActual - valInput);
    }

    $('preview-stock-nuevo').textContent = `${stockCalculado.toLocaleString('es-CO')} (${tipoOp === 'AJUSTE_DIRECTO' ? 'Fijado' : (stockCalculado >= stockActual ? '+' + (stockCalculado - stockActual) : '-' + (stockActual - stockCalculado))})`;
  }

  function renderKardex() {
    const listEl = $('kardex-list');
    const emptyEl = $('kardex-empty');

    if (!state.movimientos || state.movimientos.length === 0) {
      listEl.innerHTML = '';
      emptyEl.hidden = false;
      return;
    }

    emptyEl.hidden = true;
    listEl.innerHTML = state.movimientos.map((m) => {
      const tipo = m.tipo_movimiento || 'AJUSTE_MANUAL';
      let badgeClass = 'ajuste';
      let tipoLabel = 'Ajuste manual';

      if (tipo === 'ENTRADA') {
        badgeClass = 'entrada';
        tipoLabel = 'Entrada / Compra';
      } else if (tipo === 'SALIDA_VENTA') {
        badgeClass = 'salida';
        tipoLabel = 'Salida (Venta)';
      } else if (tipo === 'SALIDA_MANUAL') {
        badgeClass = 'salida';
        tipoLabel = 'Salida / Merma';
      } else if (tipo === 'INVENTARIO_INICIAL') {
        badgeClass = 'entrada';
        tipoLabel = 'Inventario inicial';
      }

      const cant = Number(m.cantidad || 0);
      const cantTexto = cant > 0 ? `+${cant}` : String(cant);
      const cantColor = cant > 0 ? '#167a3a' : (cant < 0 ? '#b91c1c' : '#527083');

      return `
        <tr>
          <td>${escapeHtml(fechaHoraColombia(m.creado_en))}</td>
          <td><span class="badge-mov ${badgeClass}">${escapeHtml(tipoLabel)}</span></td>
          <td class="num" style="color:${cantColor};font-weight:700;">${escapeHtml(cantTexto)}</td>
          <td class="num">${Number(m.stock_anterior || 0).toLocaleString('es-CO')}</td>
          <td class="num"><strong>${Number(m.stock_nuevo || 0).toLocaleString('es-CO')}</strong></td>
          <td>${escapeHtml(m.referencia || '—')}</td>
          <td>
            ${escapeHtml(m.motivo || '—')}
            ${m.usuario_nombre ? `<br><small style="color:#638092;">Por: ${escapeHtml(m.usuario_nombre)}</small>` : ''}
          </td>
        </tr>
      `;
    }).join('');
  }

  // ── Guardar ajuste de inventario ───────────────────────────────────────────
  async function guardarAjuste(e) {
    e.preventDefault();
    if (!state.producto) return;

    const btn = $('btn-guardar-stock');
    const prevText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Guardando cambios…';

    try {
      const stockActual = Number(state.producto.stock_total || 0);
      const tipoOp = $('tipo-operacion').value;
      const valInput = parseFloat($('cantidad-input').value);
      const stockMinimoInput = parseFloat($('stock-minimo-input').value) || 0;
      const motivo = $('motivo-input').value.trim() || 'Ajuste manual de existencias';

      if (isNaN(valInput) || valInput < 0) {
        throw new Error('Ingrese un valor numérico válido mayor o igual a 0.');
      }

      let nuevoStock = stockActual;
      if (tipoOp === 'AJUSTE_DIRECTO') {
        nuevoStock = valInput;
      } else if (tipoOp === 'ENTRADA') {
        nuevoStock = stockActual + valInput;
      } else if (tipoOp === 'SALIDA_MANUAL') {
        nuevoStock = Math.max(0, stockActual - valInput);
      }

      const diferencia = nuevoStock - stockActual;

      if (state.useApi) {
        // Enviar al backend
        const res = await apiFetch(`/productos/${encodeURIComponent(state.producto.id)}/stock`, {
          method: 'PATCH',
          body: JSON.stringify({
            nuevoStock,
            stockMinimo: stockMinimoInput,
            tipoMovimiento: tipoOp,
            motivo,
            referencia: 'Ajuste manual desde módulo de inventario',
          }),
        });

        if (res.producto) {
          state.producto.stock_total = Number(res.producto.stock_total || nuevoStock);
          state.producto.stock_minimo = Number(res.producto.stock_minimo || stockMinimoInput);
        }
      } else {
        // Guardar en LocalStorage
        let list = [];
        try {
          list = JSON.parse(localStorage.getItem(PRODUCTOS_DB_KEY) || '[]');
        } catch {
          list = [];
        }

        const idx = list.findIndex((p) => String(p.id) === String(state.producto.id));
        if (idx >= 0) {
          list[idx].stock_total = nuevoStock;
          list[idx].stockTotal = nuevoStock;
          list[idx].stock_minimo = stockMinimoInput;
          list[idx].stockMinimo = stockMinimoInput;
          localStorage.setItem(PRODUCTOS_DB_KEY, JSON.stringify(list));
        }

        state.producto.stock_total = nuevoStock;
        state.producto.stock_minimo = stockMinimoInput;

        // Registrar movimiento en LocalStorage
        let allMovs = [];
        try {
          allMovs = JSON.parse(localStorage.getItem(MOVIMIENTOS_DB_KEY) || '[]');
        } catch {
          allMovs = [];
        }

        const nuevoMov = {
          id: 'MOV-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase(),
          producto_id: state.producto.id,
          tipo_movimiento: tipoOp,
          cantidad: diferencia,
          stock_anterior: stockActual,
          stock_nuevo: nuevoStock,
          referencia: 'Ajuste manual',
          motivo,
          creado_en: new Date().toISOString(),
        };

        allMovs.push(nuevoMov);
        localStorage.setItem(MOVIMIENTOS_DB_KEY, JSON.stringify(allMovs));
      }

      mostrarAlerta(`✅ Inventario actualizado con éxito. Nuevo stock total: ${nuevoStock.toLocaleString('es-CO')}`);
      $('cantidad-input').value = '';
      $('motivo-input').value = '';

      await cargarMovimientos();
      render();
    } catch (err) {
      mostrarAlerta(err.message || 'No fue posible guardar el ajuste de inventario.', true);
    } finally {
      btn.disabled = false;
      btn.textContent = prevText;
    }
  }

  // ── Listeners ──────────────────────────────────────────────────────────────
  $('tipo-operacion').addEventListener('change', actualizarPreviewStock);
  $('cantidad-input').addEventListener('input', actualizarPreviewStock);
  $('form-ajuste-stock').addEventListener('submit', guardarAjuste);

  // Inicializar
  cargarProducto()
    .then(() => cargarMovimientos())
    .then(render)
    .catch((err) => {
      console.error('Error al inicializar gestión de inventario:', err);
      mostrarAlerta('Ocurrió un error al cargar la información del inventario.', true);
    });
});
