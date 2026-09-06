'use strict';

document.addEventListener('DOMContentLoaded', () => {
  const SESSION_KEY = 'amc_session_v2';
  const activeUserCode = sessionStorage.getItem('amc_active_user_code') || '1110591592';
  const FACTURAS_DB_KEY = `amc_facturas_generadas_db_v1_${activeUserCode}`;
  const API_BASE = 'http://localhost:3000/api';
  const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const $ = (id) => document.getElementById(id);
  const state = { rows: [], empresa: { nombre: 'AMC Facturación Electrónica y POS', identificacion: 'No disponible' }, anioConsultado: null };

  function getToken() { try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || '{}').token || null; } catch { return null; } }
  function number(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
  function money(value) { return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(number(value)); }
  function moneyPlain(value) { return new Intl.NumberFormat('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(number(value)); }
  function notify(message, error = false) { $('report-message').innerHTML = message ? `<div class="notice${error ? ' error' : ''}">${message}</div>` : ''; }

  async function apiFetch(endpoint) {
    const response = await fetch(`${API_BASE}${endpoint}`, { headers: { Authorization: `Bearer ${getToken()}` } });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'No fue posible consultar la información.');
    return data;
  }

  function perfilLocal() {
    try {
      const perfil = JSON.parse(localStorage.getItem(`amc_perfil_emisor_v1_${activeUserCode}`) || '{}');
      return { nombre: perfil.razonSocial || perfil.nombre || state.empresa.nombre, identificacion: perfil.nit || state.empresa.identificacion };
    } catch { return state.empresa; }
  }

  async function cargarEmpresa() {
    state.empresa = perfilLocal();
    if (!getToken()) return;
    try {
      const data = await apiFetch('/empresas/me');
      if (data.empresa) state.empresa = { nombre: data.empresa.razon_social || state.empresa.nombre, identificacion: data.empresa.nit || state.empresa.identificacion };
    } catch (error) { console.warn('No fue posible cargar el encabezado de la empresa.', error); }
  }

  function normalizarMeses(rows = []) {
    const byMonth = new Map(rows.map((row) => [number(row.mes), number(row.total)]));
    return MONTHS.map((mes, index) => ({ mes, numero_mes: index + 1, total: byMonth.get(index + 1) || 0 }));
  }

  function localReport(anio) {
    let invoices = [];
    try { invoices = JSON.parse(localStorage.getItem(FACTURAS_DB_KEY) || '[]'); } catch { invoices = []; }
    const totals = Array(12).fill(0);
    invoices.forEach((invoice) => {
      const date = new Date(invoice.generadoEn || invoice.creado_en);
      if (invoice.estado === 'ANULADA' || Number.isNaN(date.getTime()) || date.getFullYear() !== anio) return;
      totals[date.getMonth()] += number(invoice.totales?.base ?? invoice.total_base);
    });
    return totals.map((total, index) => ({ mes: index + 1, total }));
  }

  function chartMetrics(rows = state.rows) {
    const step = 5000000;
    const maximum = Math.max(step, Math.ceil(Math.max(...rows.map((row) => row.total), 0) / step) * step);
    return { maximum, ticks: Array.from({ length: maximum / step + 1 }, (_, index) => maximum - index * step) };
  }

  function chartMarkup(rows = state.rows, className = '') {
    const { maximum, ticks } = chartMetrics(rows);
    return `<div class="sales-bar-chart ${className}"><div class="sales-y-axis">${ticks.map((tick) => `<span>${tick ? `${moneyPlain(tick / 1000000)} M` : '0'}</span>`).join('')}</div><div class="sales-plot"><div class="sales-grid">${ticks.map((tick) => `<i style="bottom:${(tick / maximum) * 100}%"></i>`).join('')}</div><div class="sales-bars">${rows.map((row) => `<div class="sales-bar-slot" style="--bar-height:${(row.total / maximum) * 100}%"><span class="sales-bar-value">${row.total ? money(row.total) : ''}</span><div class="sales-bar"></div><span class="sales-bar-month">${row.mes}</span></div>`).join('')}</div></div></div>`;
  }

  function renderChart() {
    const chart = $('sales-chart');
    chart.innerHTML = chartMarkup();
    requestAnimationFrame(() => chart.querySelector('.sales-bar-chart')?.classList.add('is-loaded'));
  }

  function render(rows) {
    state.rows = normalizarMeses(rows);
    const total = state.rows.reduce((sum, row) => sum + row.total, 0);
    $('month-detail').innerHTML = state.rows.map((row) => `<tr><td>${row.mes}</td><td class="num">${money(row.total)}</td></tr>`).join('');
    $('month-total').innerHTML = `<tr><td>Total anual</td><td class="num">${money(total)}</td></tr>`;
    renderChart();
  }

  async function consultar() {
    const anio = Number($('anio').value);
    if (!Number.isInteger(anio) || anio < 2000 || anio > 9999) return notify('Selecciona un año válido para el reporte.', true);
    notify('Consultando comparativo mensual…');
    try {
      const rows = getToken() ? (await apiFetch(`/reportes/ventas-comparativas?anio=${anio}`)).ventas || [] : localReport(anio);
      state.anioConsultado = anio;
      render(rows);
      notify(`Comparativo de ventas para ${anio} generado correctamente.`);
    } catch (error) { notify(error.message, true); }
  }

  function validarExportacion() {
    if (state.anioConsultado) return true;
    notify('Consulta primero el año que deseas exportar.', true);
    return false;
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }

  function construirDocumentoPdf() {
    const generated = new Intl.DateTimeFormat('es-CO', { dateStyle: 'long', timeStyle: 'short' }).format(new Date());
    const annualTotal = state.rows.reduce((sum, row) => sum + row.total, 0);
    const stage = document.createElement('div'); stage.className = 'pdf-export-stage';
    const doc = document.createElement('article'); doc.className = 'pdf-export-document comparative-pdf';
    doc.innerHTML = `<header class="pdf-export-header"><div class="pdf-export-brand"><span>AMC</span><div><p class="pdf-export-eyebrow">INFORME CONTABLE</p><h1>Comparativo de ventas por períodos</h1><p><strong>${escapeHtml(state.empresa.nombre)}</strong></p><p>NIT / identificación: ${escapeHtml(state.empresa.identificacion)}</p></div></div><div class="pdf-export-meta"><strong>Fecha y hora de emisión</strong><br>${escapeHtml(generated)}<br><br><strong>Año analizado</strong><br><span>${escapeHtml(String(state.anioConsultado))}</span></div></header><section class="pdf-export-summary"><div><span>Período consultado</span><strong>Enero a diciembre de ${escapeHtml(String(state.anioConsultado))}</strong></div><div><span>Ventas anuales</span><strong>${money(annualTotal)}</strong></div><div><span>Base del cálculo</span><strong>Antes de impuestos</strong></div></section><section class="comparative-pdf-content"><div><h2>Ventas por mes (COP)</h2>${chartMarkup(state.rows, 'sales-bar-chart-pdf')}</div><div><h2>Ventas por mes (detalle)</h2><table><thead><tr><th>Mes</th><th class="num">Ventas (COP)</th></tr></thead><tbody>${state.rows.map((row) => `<tr><td>${escapeHtml(row.mes)}</td><td class="num">${money(row.total)}</td></tr>`).join('')}</tbody><tfoot><tr><td>Total anual</td><td class="num">${money(annualTotal)}</td></tr></tfoot></table></div></section><footer class="pdf-export-footer"><span>AMC Facturación Electrónica y POS</span><span>Valores antes de impuestos · Facturas anuladas excluidas</span></footer>`;
    stage.appendChild(doc); document.body.appendChild(stage); return doc;
  }

  async function exportarPdf() {
    if (!validarExportacion()) return;
    if (typeof html2pdf === 'undefined') return notify('No se pudo cargar el generador de PDF. Verifica tu conexión e inténtalo de nuevo.', true);
    const button = $('btn-exportar-pdf'); const previous = button.textContent; const doc = construirDocumentoPdf();
    button.disabled = true; button.textContent = 'Generando PDF…';
    try {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      if (document.fonts?.ready) await document.fonts.ready;
      const opt = {
        margin: [5, 5, 5, 5],
        filename: `Reporte-comparativo-ventas-${state.anioConsultado}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
      };
      await html2pdf().set(opt).from(doc).save();
    } catch (error) { console.error('Error al exportar PDF:', error); notify('No fue posible generar el PDF. Inténtalo nuevamente.', true); }
    finally { doc.parentElement?.remove(); button.disabled = false; button.textContent = previous; }
  }

  $('btn-consultar').addEventListener('click', consultar);
  $('btn-limpiar').addEventListener('click', () => { $('anio').value = new Date().getFullYear(); state.anioConsultado = null; render([]); notify(''); });
  $('btn-exportar-pdf').addEventListener('click', exportarPdf);
  $('anio').value = new Date().getFullYear();
  cargarEmpresa().finally(consultar);
});
