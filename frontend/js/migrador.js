/**
 * migrador.js - Migración segura del catálogo local a PostgreSQL.
 * Conserva precio, estado y existencias; nunca elimina el respaldo local.
 */
'use strict';

document.addEventListener("DOMContentLoaded", () => {
  const SESSION_KEY = 'amc_session_v2';
  const activeUserCode = sessionStorage.getItem("amc_active_user_code") || "1110591592";
  const isDev = activeUserCode === "1110591592";

  const PRODUCTOS_DB_KEY = isDev ? "amc_productos_db_v1" : `amc_productos_db_v1_${activeUserCode}`;

  const API_BASE = 'http://localhost:3000/api';
  
  function getToken() {
    try {
      const s = JSON.parse(sessionStorage.getItem(SESSION_KEY) || '{}');
      return s.token || null;
    } catch { return null; }
  }

  const token = getToken();
  const normalizar = (value) => String(value || '').trim().toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const numero = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  // Elementos DOM
  const elProductos = document.getElementById('count-productos');
  const btnIniciar = document.getElementById('btn-iniciar');
  const logsContainer = document.getElementById('logs');
  const successPanel = document.getElementById('success-panel');

  // Datos Locales
  let productos = [];

  function loadLocalData() {
    try {
      productos = JSON.parse(localStorage.getItem(PRODUCTOS_DB_KEY) || '[]');
      if(!Array.isArray(productos)) productos = [];
    } catch(e) { productos = []; }
    elProductos.textContent = productos.length;

    if (productos.length === 0) {
      btnIniciar.disabled = true;
      btnIniciar.textContent = "No hay productos o servicios para migrar";
    }
  }

  function log(msg, type = '') {
    logsContainer.classList.add('active');
    const d = document.createElement('div');
    d.className = `log-line ${type ? 'log-'+type : ''}`;
    d.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    logsContainer.appendChild(d);
    logsContainer.scrollTop = logsContainer.scrollHeight;
  }

  async function apiFetch(endpoint, options = {}) {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...(options.headers || {})
      },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || `Error ${res.status}`);
    return data;
  }

  function productoSql(local) {
    return {
      nombre: String(local.nombre || '').trim(),
      codigo: String(local.codigo || '').trim(),
      tipo: String(local.tipo || 'PRODUCTO').toUpperCase() === 'SERVICIO' ? 'SERVICIO' : 'PRODUCTO',
      iva: numero(local.iva, 19),
      unidad_medida: local.unidad_medida || local.unidadMedida || local.unidad || 'UNIDAD',
      precio_base: numero(local.precio_base ?? local.precioBase ?? local.precio, 0),
      stock_total: numero(local.stock_total ?? local.stockTotal ?? local.stock, 0),
      stock_minimo: numero(local.stock_minimo ?? local.stockMinimo, 0),
      activo: local.activo !== false,
    };
  }

  async function iniciarMigracion() {
    if (!token) {
      alert("No tienes una sesión activa en el servidor. Por favor, inicia sesión primero.");
      window.location.href = 'login.html';
      return;
    }

    btnIniciar.disabled = true;
    btnIniciar.textContent = "Migrando... Por favor espera";
    
    log(`Leyendo ${productos.length} producto(s) y servicio(s) locales...`, 'info');
    let existentes;
    try {
      existentes = (await apiFetch('/productos?limit=1000&soloActivos=false')).productos || [];
    } catch (err) {
      log(`No fue posible conectarse a SQL: ${err.message}`, 'error');
      btnIniciar.disabled = false;
      btnIniciar.textContent = 'Reintentar migración a SQL';
      return;
    }
    const porCodigo = new Map(existentes.map((p) => [normalizar(p.codigo), p]));
    let creados = 0;
    let actualizados = 0;
    let fallidos = 0;
    for (const p of productos) {
      const item = productoSql(p);
      if (!item.nombre || !item.codigo) {
        fallidos++;
        log(`Omitido: registro local sin nombre o código.`, 'error');
        continue;
      }
      try {
        const remoto = porCodigo.get(normalizar(item.codigo));
        if (remoto) {
          await apiFetch(`/productos/${encodeURIComponent(remoto.id)}`, { method: 'PATCH', body: JSON.stringify(item) });
          actualizados++;
          log(`Actualizado: ${item.codigo} · ${item.nombre}`, 'success');
        } else {
          const response = await apiFetch('/productos', { method: 'POST', body: JSON.stringify(item) });
          porCodigo.set(normalizar(item.codigo), response.producto);
          creados++;
          log(`Creado: ${item.codigo} · ${item.nombre}`, 'success');
        }
      } catch (err) {
        fallidos++;
        log(`Error en ${item.codigo}: ${err.message}`, 'error');
      }
    }
    if (fallidos) {
      log(`Migración incompleta: ${creados} creados, ${actualizados} actualizados y ${fallidos} con error. El respaldo local sigue intacto.`, 'warn');
      btnIniciar.disabled = false;
      btnIniciar.textContent = 'Reintentar registros con error';
      return;
    }
    log(`Migración finalizada: ${creados} creados y ${actualizados} actualizados en SQL. El respaldo local se conservó.`, 'success');
    btnIniciar.style.display = 'none';
    successPanel.classList.add('active');
  }

  btnIniciar.addEventListener('click', iniciarMigracion);

  loadLocalData();
});
