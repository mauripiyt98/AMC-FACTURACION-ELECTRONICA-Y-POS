/**
 * migrador.js - Script para enviar datos de localStorage al backend API (PostgreSQL)
 */
'use strict';

document.addEventListener("DOMContentLoaded", () => {
  const SESSION_KEY = 'amc_session_v2';
  const activeUserCode = sessionStorage.getItem("amc_active_user_code") || "1110591592";
  const isDev = activeUserCode === "1110591592";

  const TERCEROS_DB_KEY = isDev ? "amc_terceros_db_v1" : `amc_terceros_db_v1_${activeUserCode}`;
  const PRODUCTOS_DB_KEY = isDev ? "amc_productos_db_v1" : `amc_productos_db_v1_${activeUserCode}`;
  const FACTURAS_GENERADAS_DB_KEY = isDev ? "amc_facturas_generadas_db_v1" : `amc_facturas_generadas_db_v1_${activeUserCode}`;

  const API_BASE = 'http://localhost:3000/api';
  
  function getToken() {
    try {
      const s = JSON.parse(sessionStorage.getItem(SESSION_KEY) || '{}');
      return s.token || null;
    } catch { return null; }
  }

  const token = getToken();

  // Elementos DOM
  const elTerceros = document.getElementById('count-terceros');
  const elProductos = document.getElementById('count-productos');
  const elFacturas = document.getElementById('count-facturas');
  const btnIniciar = document.getElementById('btn-iniciar');
  const logsContainer = document.getElementById('logs');
  const successPanel = document.getElementById('success-panel');

  // Datos Locales
  let terceros = [];
  let productos = [];
  let facturas = [];

  function loadLocalData() {
    try {
      terceros = JSON.parse(localStorage.getItem(TERCEROS_DB_KEY) || '[]');
      if(!Array.isArray(terceros)) terceros = [];
    } catch(e) { terceros = []; }

    try {
      productos = JSON.parse(localStorage.getItem(PRODUCTOS_DB_KEY) || '[]');
      if(!Array.isArray(productos)) productos = [];
    } catch(e) { productos = []; }

    try {
      facturas = JSON.parse(localStorage.getItem(FACTURAS_GENERADAS_DB_KEY) || '[]');
      if(!Array.isArray(facturas)) facturas = [];
    } catch(e) { facturas = []; }

    elTerceros.textContent = terceros.length;
    elProductos.textContent = productos.length;
    elFacturas.textContent = facturas.length;

    if (terceros.length === 0 && productos.length === 0 && facturas.length === 0) {
      btnIniciar.disabled = true;
      btnIniciar.textContent = "No hay datos para migrar";
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

  async function apiPost(endpoint, payload) {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || `Error ${res.status}`);
    return data;
  }

  async function iniciarMigracion() {
    if (!token) {
      alert("No tienes una sesión activa en el servidor. Por favor, inicia sesión primero.");
      window.location.href = 'login.html';
      return;
    }

    btnIniciar.disabled = true;
    btnIniciar.textContent = "Migrando... Por favor espera";
    
    // Migrar Terceros
    log(`Iniciando migración de ${terceros.length} clientes...`, 'info');
    let okTerceros = 0;
    for (const t of terceros) {
      try {
        await apiPost('/terceros', {
          nombre: t.nombre,
          documento: t.documento,
          tipo_documento: 'NIT',
          email: t.email,
          telefono: t.telefono,
          direccion: t.direccion,
          ciudad: t.ciudad
        });
        okTerceros++;
      } catch (err) {
        log(`Error cliente ${t.documento}: ${err.message}`, 'error');
      }
    }
    if(terceros.length > 0) log(`Clientes migrados: ${okTerceros}/${terceros.length}`, 'success');

    // Migrar Productos
    log(`Iniciando migración de ${productos.length} productos...`, 'info');
    let okProductos = 0;
    for (const p of productos) {
      try {
        await apiPost('/productos', {
          nombre: p.nombre,
          codigo: p.codigo,
          tipo: p.tipo,
          iva: p.iva,
          unidad_medida: p.unidadMedida
        });
        okProductos++;
      } catch (err) {
        log(`Error producto ${p.codigo}: ${err.message}`, 'error');
      }
    }
    if(productos.length > 0) log(`Productos migrados: ${okProductos}/${productos.length}`, 'success');

    // Migrar Facturas
    log(`Iniciando migración de ${facturas.length} facturas...`, 'info');
    let okFacturas = 0;
    for (const f of facturas) {
      try {
        await apiPost('/facturas', {
          cliente: f.cliente,
          lineas: Array.isArray(f.lineas) ? f.lineas.map(l => ({
            codigo: l.codigo,
            nombre: l.producto,
            unidad_medida: l.unidad,
            cantidad: l.cantidad,
            valor_unitario: l.unitario,
            tarifa_iva: l.tarifaIva,
            tarifa_retencion: l.tarifaRetencion
          })) : [],
          medio_pago: f.medioPago,
          observaciones: f.observaciones || ''
        });
        okFacturas++;
      } catch (err) {
        log(`Error factura ${f.numeroFactura}: ${err.message}`, 'error');
      }
    }
    if(facturas.length > 0) log(`Facturas migradas: ${okFacturas}/${facturas.length}`, 'success');

    // Finalizar
    log("Migración finalizada con éxito.", 'success');
    btnIniciar.style.display = 'none';
    successPanel.classList.add('active');

    // Limpiar localStorage local para no volver a migrar
    localStorage.removeItem(TERCEROS_DB_KEY);
    localStorage.removeItem(PRODUCTOS_DB_KEY);
    localStorage.removeItem(FACTURAS_GENERADAS_DB_KEY);
  }

  btnIniciar.addEventListener('click', iniciarMigracion);

  loadLocalData();
});
