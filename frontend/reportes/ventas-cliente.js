'use strict';

document.addEventListener('DOMContentLoaded', () => {
  const SESSION_KEY = 'amc_session_v2';
  const activeUserCode = sessionStorage.getItem('amc_active_user_code') || '1110591592';
  const isDev = activeUserCode === '1110591592';
  const TERCEROS_DB_KEY = isDev ? 'amc_terceros_db_v1' : `amc_terceros_db_v1_${activeUserCode}`;
  const FACTURAS_DB_KEY = isDev ? 'amc_facturas_generadas_db_v1' : `amc_facturas_generadas_db_v1_${activeUserCode}`;
  const API_BASE = 'http://localhost:3000/api';
  const $ = (id) => document.getElementById(id);
  const state = { tercero: null, useApi: false, consultaActual: 0 };

  function getToken() { try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || '{}').token || null; } catch { return null; } }
  function escapeHtml(value) { const el = document.createElement('div'); el.textContent = String(value ?? ''); return el.innerHTML; }
  function normal(value) { return String(value || '').trim().toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
  function number(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
  function money(value) { return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(number(value)); }
  function dateString(date) { return date.toISOString().slice(0, 10); }
  function notify(message, error = false) { $('report-message').innerHTML = message ? `<div class="notice${error ? ' error' : ''}">${escapeHtml(message)}</div>` : ''; }

  async function apiFetch(endpoint) {
    const response = await fetch(`${API_BASE}${endpoint}`, { headers: { Authorization: `Bearer ${getToken()}` } });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'No fue posible consultar la información.');
    return data;
  }

  function setInitialDates() {
    const today = new Date();
    const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    $('fecha-desde').value = dateString(firstOfMonth);
    $('fecha-hasta').value = dateString(today);
  }

  function render(rows) {
    const tbody = $('report-rows');
    const totals = rows.reduce((sum, item) => ({
      numero_facturas: sum.numero_facturas + number(item.numero_facturas), valor_bruto: sum.valor_bruto + number(item.valor_bruto), descuentos: sum.descuentos + number(item.descuentos), subtotal: sum.subtotal + number(item.subtotal), iva: sum.iva + number(item.iva), retenciones: sum.retenciones + number(item.retenciones), total: sum.total + number(item.total),
    }), { numero_facturas: 0, valor_bruto: 0, descuentos: 0, subtotal: 0, iva: 0, retenciones: 0, total: 0 });
    tbody.innerHTML = rows.map((item) => `<tr><td>${escapeHtml(item.cliente_documento)}</td><td class="client-name">${escapeHtml(item.cliente_nombre)}</td><td class="num">${number(item.numero_facturas)}</td><td class="num">${money(item.valor_bruto)}</td><td class="num">${money(item.descuentos)}</td><td class="num">${money(item.subtotal)}</td><td class="num">${money(item.iva)}</td><td class="num">${money(item.retenciones)}</td><td class="num"><strong>${money(item.total)}</strong></td></tr>`).join('');
    $('report-empty').hidden = rows.length > 0;
    $('report-total').innerHTML = rows.length ? `<tr><td colspan="2">Total general</td><td class="num">${totals.numero_facturas}</td><td class="num">${money(totals.valor_bruto)}</td><td class="num">${money(totals.descuentos)}</td><td class="num">${money(totals.subtotal)}</td><td class="num">${money(totals.iva)}</td><td class="num">${money(totals.retenciones)}</td><td class="num">${money(totals.total)}</td></tr>` : '';
  }

  function localReport() {
    let invoices = [];
    try { invoices = JSON.parse(localStorage.getItem(FACTURAS_DB_KEY) || '[]'); } catch { invoices = []; }
    const desde = new Date(`${$('fecha-desde').value}T00:00:00`);
    const hasta = new Date(`${$('fecha-hasta').value}T23:59:59.999`);
    const selectedDocument = state.tercero?.documento;
    const grouped = new Map();
    invoices.filter((invoice) => {
      const generated = new Date(invoice.generadoEn);
      const document = invoice.cliente?.documento || invoice.tercero?.documento;
      return !Number.isNaN(generated.getTime()) && generated >= desde && generated <= hasta && (!selectedDocument || document === selectedDocument);
    }).forEach((invoice) => {
      const cliente = invoice.cliente || invoice.tercero || {};
      const key = cliente.documento || cliente.nombre || invoice.id;
      const current = grouped.get(key) || { cliente_documento: cliente.documento || '—', cliente_nombre: cliente.nombre || 'Cliente sin nombre', numero_facturas: 0, valor_bruto: 0, descuentos: 0, subtotal: 0, iva: 0, retenciones: 0, total: 0 };
      const totals = invoice.totales || {};
      const base = number(totals.base);
      const iva = number(totals.iva);
      const retenciones = number(totals.retencion);
      current.numero_facturas += 1; current.valor_bruto += base; current.subtotal += base; current.iva += iva; current.retenciones += retenciones; current.total += number(totals.total || (base + iva - retenciones));
      grouped.set(key, current);
    });
    return [...grouped.values()].sort((a, b) => b.total - a.total || a.cliente_nombre.localeCompare(b.cliente_nombre));
  }

  async function consultar() {
    const desde = $('fecha-desde').value;
    const hasta = $('fecha-hasta').value;
    if (!desde || !hasta) return notify('Selecciona la fecha inicial y final del período.', true);
    if (desde > hasta) return notify('La fecha inicial no puede ser mayor que la fecha final.', true);
    const requestId = ++state.consultaActual;
    notify('Consultando ventas por cliente…');
    try {
      state.useApi = !!getToken();
      let rows;
      if (state.useApi) {
        const query = new URLSearchParams({ desde, hasta });
        if (state.tercero?.id) query.set('terceroId', state.tercero.id);
        const result = await apiFetch(`/reportes/ventas-por-cliente?${query}`);
        rows = result.ventas || [];
      } else {
        rows = localReport();
      }
      if (requestId !== state.consultaActual) return;
      render(rows);
      notify(rows.length ? `${rows.length} cliente(s) con ventas en el período seleccionado.` : 'No se encontraron ventas para el período seleccionado.');
    } catch (error) {
      if (requestId !== state.consultaActual) return;
      render([]);
      notify(error.message, true);
    }
  }

  function leerTercerosLocales(query) {
    try {
      const terceros = JSON.parse(localStorage.getItem(TERCEROS_DB_KEY) || '[]');
      return (Array.isArray(terceros) ? terceros : []).filter((item) => normal(item.nombre).includes(normal(query)) || normal(item.documento).includes(normal(query))).slice(0, 8);
    } catch { return []; }
  }

  function renderClientOptions(items) {
    const menu = $('client-options');
    menu.innerHTML = items.map((item, index) => `<button type="button" class="client-option" data-index="${index}">${escapeHtml(item.nombre)}<small>${escapeHtml(item.documento)}</small></button>`).join('');
    menu.hidden = !items.length;
    menu.querySelectorAll('[data-index]').forEach((button) => button.addEventListener('click', () => {
      state.tercero = items[Number(button.dataset.index)];
      $('buscar-cliente').value = state.tercero.nombre;
      $('selected-client').textContent = `Cliente seleccionado: ${state.tercero.nombre} · ${state.tercero.documento}`;
      $('selected-client').hidden = false;
      menu.hidden = true;
    }));
  }

  async function buscarCliente() {
    const query = $('buscar-cliente').value.trim();
    state.tercero = null;
    $('selected-client').hidden = true;
    if (query.length < 3) { $('client-options').hidden = true; return; }
    try {
      const items = getToken() ? (await apiFetch(`/terceros?search=${encodeURIComponent(query)}&limit=8`)).terceros || [] : leerTercerosLocales(query);
      renderClientOptions(items);
    } catch (error) { $('client-options').hidden = true; notify(error.message, true); }
  }

  $('buscar-cliente').addEventListener('input', buscarCliente);
  $('btn-consultar').addEventListener('click', consultar);
  $('btn-limpiar').addEventListener('click', () => { setInitialDates(); $('buscar-cliente').value = ''; state.tercero = null; $('selected-client').hidden = true; $('client-options').hidden = true; consultar(); });
  setInitialDates();
  consultar();
});
