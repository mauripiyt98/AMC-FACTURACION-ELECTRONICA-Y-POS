'use strict';

document.addEventListener('DOMContentLoaded', () => {
  const SESSION_KEY = 'amc_session_v2';
  const activeUserCode = sessionStorage.getItem('amc_active_user_code') || '1110591592';
  const isDev = activeUserCode === '1110591592';
  const PRODUCTOS_DB_KEY = isDev ? 'amc_productos_db_v1' : `amc_productos_db_v1_${activeUserCode}`;
  const API_BASE = 'http://localhost:3000/api';
  const $ = (id) => document.getElementById(id);
  const state = { productos: [], useApi: false };

  function token() { try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || '{}').token || null; } catch { return null; } }
  function escapeHtml(value) { const el = document.createElement('div'); el.textContent = String(value ?? ''); return el.innerHTML; }
  function normal(value) { return String(value || '').toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
  function precio(value) { return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(Number(value) || 0); }
  function unidad(value) { return String(value || 'UNIDAD').replace(/_/g, ' ').toLocaleLowerCase('es'); }
  function tipo(value) { return String(value || 'PRODUCTO').toUpperCase() === 'SERVICIO' ? 'Servicio' : 'Producto'; }
  function mostrar(texto, error = false) { $('inventory-message').innerHTML = `<div class="notice${error ? ' error' : ''}">${escapeHtml(texto)}</div>`; }

  async function apiFetch(endpoint, options = {}) {
    const res = await fetch(`${API_BASE}${endpoint}`, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}`, ...(options.headers || {}) } });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'No fue posible actualizar el producto.');
    return data;
  }

  async function cargarProductos() {
    state.useApi = !!token();
    if (state.useApi) {
      try {
        const data = await apiFetch('/productos?limit=1000&soloActivos=false');
        state.productos = data.productos || [];
        return;
      } catch (error) { console.warn('Inventarios: usando almacenamiento local.', error); state.useApi = false; }
    }
    try { const items = JSON.parse(localStorage.getItem(PRODUCTOS_DB_KEY) || '[]'); state.productos = Array.isArray(items) ? items : []; } catch { state.productos = []; }
  }

  function productoNormalizado(item) {
    return { ...item, unidad: item.unidad_medida || item.unidadMedida, precio: item.precio_base ?? item.precioBase ?? 0, activo: item.activo !== false, stock: Number(item.stock_total ?? item.stockTotal ?? 0) || 0 };
  }

  function render() {
    const q = normal($('buscar-producto').value);
    const items = state.productos.map(productoNormalizado).filter((item) => !q || normal(item.nombre).includes(q) || normal(item.codigo).includes(q));
    $('inventory-empty').hidden = items.length > 0;
    $('inventory-list').innerHTML = items.map((item) => {
      const status = item.activo ? 'active' : 'inactive';
      const label = item.activo ? 'Activo' : 'Inactivo';
      return `<tr><td>${tipo(item.tipo)}</td><td class="name">${escapeHtml(item.nombre)}</td><td>${escapeHtml(item.codigo)}</td><td>${escapeHtml(unidad(item.unidad))}</td><td class="num">${precio(item.precio)}</td><td><span class="status ${status}">${label}</span></td><td class="num">${item.stock}</td><td><div class="row-actions"><button class="state-btn ${item.activo ? '' : 'activate'}" data-toggle="${escapeHtml(item.id)}">${item.activo ? 'Inactivar' : 'Activar'}</button><button class="manage-btn" data-manage="${escapeHtml(item.id)}">Gestionar inventario</button></div></td></tr>`;
    }).join('');
  }

  async function cambiarEstado(id) {
    const item = state.productos.find((p) => String(p.id) === String(id));
    if (!item) return;
    const nuevoEstado = !(item.activo !== false);
    try {
      if (state.useApi) await apiFetch(`/productos/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ activo: nuevoEstado }) });
      item.activo = nuevoEstado;
      if (!state.useApi) localStorage.setItem(PRODUCTOS_DB_KEY, JSON.stringify(state.productos));
      mostrar(`${item.nombre} está ${nuevoEstado ? 'activo y disponible para facturar' : 'inactivo y no estará disponible para facturar'}.`);
      render();
    } catch (error) { mostrar(error.message, true); }
  }

  $('buscar-producto').addEventListener('input', render);
  document.querySelectorAll('[data-development]').forEach((button) => button.addEventListener('click', () => mostrar(`${button.dataset.development}: funcionalidad en desarrollo.`)));
  $('inventory-list').addEventListener('click', (event) => {
    const toggle = event.target.closest('[data-toggle]');
    if (toggle) return cambiarEstado(toggle.dataset.toggle);
    if (event.target.closest('[data-manage]')) mostrar('Gestionar inventario de producto: funcionalidad en desarrollo.');
  });
  cargarProductos().then(render);
});
