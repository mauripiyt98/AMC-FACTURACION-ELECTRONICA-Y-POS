'use strict';

document.addEventListener('DOMContentLoaded', () => {
  const SESSION_KEY = 'amc_session_v2';
  const activeUserCode = sessionStorage.getItem('amc_active_user_code') || '1110591592';
  const isDev = activeUserCode === '1110591592';
  const TERCEROS_DB_KEY = isDev ? 'amc_terceros_db_v1' : `amc_terceros_db_v1_${activeUserCode}`;
  const FACTURAS_DB_KEY = isDev ? 'amc_facturas_generadas_db_v1' : `amc_facturas_generadas_db_v1_${activeUserCode}`;
  const API_BASE = 'http://localhost:3000/api';
  const $ = (id) => document.getElementById(id);
  const state = {
    tercero: null,
    useApi: false,
    consultaActual: 0,
    rows: [],
    filtrosAplicados: null,
    empresa: { nombre: 'AMC Facturación Electrónica y POS', identificacion: 'No disponible' },
  };

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
    state.rows = rows;
    const tbody = $('report-rows');
    const totals = rows.reduce((sum, item) => ({
      numero_facturas: sum.numero_facturas + number(item.numero_facturas), valor_bruto: sum.valor_bruto + number(item.valor_bruto), descuentos: sum.descuentos + number(item.descuentos), subtotal: sum.subtotal + number(item.subtotal), iva: sum.iva + number(item.iva), retenciones: sum.retenciones + number(item.retenciones), total: sum.total + number(item.total),
    }), { numero_facturas: 0, valor_bruto: 0, descuentos: 0, subtotal: 0, iva: 0, retenciones: 0, total: 0 });
    tbody.innerHTML = rows.map((item) => `<tr><td>${escapeHtml(item.cliente_documento)}</td><td class="client-name">${escapeHtml(item.cliente_nombre)}</td><td class="num">${number(item.numero_facturas)}</td><td class="num">${money(item.valor_bruto)}</td><td class="num">${money(item.descuentos)}</td><td class="num">${money(item.subtotal)}</td><td class="num">${money(item.iva)}</td><td class="num">${money(item.retenciones)}</td><td class="num"><strong>${money(item.total)}</strong></td></tr>`).join('');
    $('report-empty').hidden = rows.length > 0;
    $('report-total').innerHTML = rows.length ? `<tr><td colspan="2">Total general</td><td class="num">${totals.numero_facturas}</td><td class="num">${money(totals.valor_bruto)}</td><td class="num">${money(totals.descuentos)}</td><td class="num">${money(totals.subtotal)}</td><td class="num">${money(totals.iva)}</td><td class="num">${money(totals.retenciones)}</td><td class="num">${money(totals.total)}</td></tr>` : '';
  }

  function perfilLocal() {
    const key = `amc_perfil_emisor_v1_${activeUserCode}`;
    try {
      const perfil = JSON.parse(localStorage.getItem(key) || '{}');
      return { nombre: perfil.razonSocial || perfil.nombre || state.empresa.nombre, identificacion: perfil.nit || state.empresa.identificacion };
    } catch { return state.empresa; }
  }

  async function cargarEmpresa() {
    state.empresa = perfilLocal();
    if (!getToken()) return;
    try {
      const data = await apiFetch('/empresas/me');
      if (data.empresa) {
        state.empresa = {
          nombre: data.empresa.razon_social || state.empresa.nombre,
          identificacion: data.empresa.nit || state.empresa.identificacion,
        };
      }
    } catch (error) { console.warn('No fue posible cargar el encabezado de la empresa.', error); }
  }

  function periodoActual() {
    const filtros = state.filtrosAplicados || {};
    return `${filtros.desde || $('fecha-desde').value || '—'} al ${filtros.hasta || $('fecha-hasta').value || '—'}`;
  }

  function archivoSeguro(value) {
    return String(value || 'reporte').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70) || 'reporte';
  }

  function totalesReporte(rows = state.rows) {
    return rows.reduce((sum, item) => ({
      numero_facturas: sum.numero_facturas + number(item.numero_facturas), valor_bruto: sum.valor_bruto + number(item.valor_bruto), descuentos: sum.descuentos + number(item.descuentos), subtotal: sum.subtotal + number(item.subtotal), iva: sum.iva + number(item.iva), retenciones: sum.retenciones + number(item.retenciones), total: sum.total + number(item.total),
    }), { numero_facturas: 0, valor_bruto: 0, descuentos: 0, subtotal: 0, iva: 0, retenciones: 0, total: 0 });
  }

  function validarExportacion() {
    if (state.rows.length) return true;
    notify('No hay datos en la tabla para exportar. Consulta un período con ventas primero.', true);
    return false;
  }

  function construirDocumentoPdf() {
    const generado = new Intl.DateTimeFormat('es-CO', { dateStyle: 'long', timeStyle: 'short' }).format(new Date());
    const totals = totalesReporte();
    const filtroCliente = state.filtrosAplicados?.tercero;
    const rows = state.rows.map((item) => `<tr><td>${escapeHtml(item.cliente_documento)}</td><td>${escapeHtml(item.cliente_nombre)}</td><td class="num">${number(item.numero_facturas)}</td><td class="num">${money(item.valor_bruto)}</td><td class="num">${money(item.descuentos)}</td><td class="num">${money(item.subtotal)}</td><td class="num">${money(item.iva)}</td><td class="num">${money(item.retenciones)}</td><td class="num">${money(item.total)}</td></tr>`).join('');
    const doc = document.createElement('article');
    doc.className = 'pdf-export-document';
    doc.innerHTML = `<header class="pdf-export-header"><div class="pdf-export-brand"><span>AMC</span><div><p class="pdf-export-eyebrow">INFORME CONTABLE</p><h1>Reporte de ventas por cliente</h1><p><strong>${escapeHtml(state.empresa.nombre)}</strong></p><p>NIT / identificación: ${escapeHtml(state.empresa.identificacion)}</p></div></div><div class="pdf-export-meta"><strong>Fecha y hora de emisión</strong><br>${escapeHtml(generado)}<br><br><strong>Estado</strong><br><span>Reporte consolidado</span></div></header><section class="pdf-export-summary"><div><span>Período consultado</span><strong>${escapeHtml(periodoActual())}</strong></div><div><span>Clientes con ventas</span><strong>${state.rows.length}</strong></div><div><span>Total facturado</span><strong>${money(totals.total)}</strong></div></section><div class="pdf-export-period"><strong>Alcance del reporte</strong><br>${filtroCliente ? `Cliente filtrado: ${escapeHtml(filtroCliente.nombre)} · ${escapeHtml(filtroCliente.documento)}` : 'Consolidado de todos los clientes incluidos en la consulta.'}</div><table><thead><tr><th>Identificación</th><th>Cliente</th><th class="num">Facturas</th><th class="num">Valor bruto</th><th class="num">Descuentos</th><th class="num">Subtotal</th><th class="num">IVA</th><th class="num">Retenciones</th><th class="num">Total</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td colspan="2">Total general</td><td class="num">${totals.numero_facturas}</td><td class="num">${money(totals.valor_bruto)}</td><td class="num">${money(totals.descuentos)}</td><td class="num">${money(totals.subtotal)}</td><td class="num">${money(totals.iva)}</td><td class="num">${money(totals.retenciones)}</td><td class="num">${money(totals.total)}</td></tr></tfoot></table><footer class="pdf-export-footer"><span>AMC Facturación Electrónica y POS</span><span>Facturas anuladas excluidas · Documento generado automáticamente</span></footer>`;
    document.body.appendChild(doc);
    return doc;
  }

  async function exportarPdf() {
    if (!validarExportacion()) return;
    if (typeof html2pdf === 'undefined') return notify('No se pudo cargar el generador de PDF. Verifica tu conexión e inténtalo de nuevo.', true);
    const button = $('btn-exportar-pdf');
    const previous = button.textContent;
    const doc = construirDocumentoPdf();
    button.disabled = true; button.textContent = 'Generando PDF…';
    try {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      if (document.fonts?.ready) await document.fonts.ready;
      await html2pdf().set({ margin: [6, 6, 6, 6], filename: `Reporte-ventas-clientes-${archivoSeguro($('fecha-desde').value)}-${archivoSeguro($('fecha-hasta').value)}.pdf`, image: { type: 'jpeg', quality: .98 }, html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', scrollX: 0, scrollY: 0, windowWidth: doc.scrollWidth, windowHeight: doc.scrollHeight }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }, pagebreak: { mode: ['css', 'legacy'] } }).from(doc).save();
    } catch (error) {
      console.error('Error al exportar PDF:', error);
      notify('No fue posible generar el PDF. Inténtalo nuevamente.', true);
    } finally {
      doc.remove(); button.disabled = false; button.textContent = previous;
    }
  }

  function exportarExcel() {
    if (!validarExportacion()) return;
    if (typeof XLSX === 'undefined') return notify('No se pudo cargar el generador de Excel. Verifica tu conexión e inténtalo de nuevo.', true);
    const button = $('btn-exportar-excel');
    const previous = button.textContent;
    button.disabled = true; button.textContent = 'Generando Excel…';
    try {
      const generated = new Intl.DateTimeFormat('es-CO', { dateStyle: 'long', timeStyle: 'short' }).format(new Date());
      const totals = totalesReporte();
      const filtroCliente = state.filtrosAplicados?.tercero;
      const metadata = [
        'REPORTE DE VENTAS POR CLIENTE',
        `Empresa: ${state.empresa.nombre}`,
        `Identificación: ${state.empresa.identificacion}`,
        `Fecha y hora del reporte: ${generated}`,
        `Período consultado: ${periodoActual()}`,
        ...(filtroCliente ? [`Cliente filtrado: ${filtroCliente.nombre} · ${filtroCliente.documento}`] : []),
      ];
      const headerRow = metadata.length + 3;
      const dataStartRow = headerRow + 1;
      const totalRow = dataStartRow + state.rows.length;
      const footerRow = totalRow + 3;
      const data = Array.from({ length: footerRow }, () => Array(10).fill(null));
      metadata.forEach((value, index) => { data[index + 1][1] = value; });
      data[headerRow - 1] = [null, 'Identificación', 'Cliente', 'Facturas', 'Valor bruto', 'Descuentos', 'Subtotal', 'IVA', 'Retenciones', 'Total'];
      state.rows.forEach((item, index) => {
        data[dataStartRow - 1 + index] = [null, item.cliente_documento, item.cliente_nombre, number(item.numero_facturas), number(item.valor_bruto), number(item.descuentos), number(item.subtotal), number(item.iva), number(item.retenciones), number(item.total)];
      });
      data[totalRow - 1] = [null, 'TOTAL GENERAL', '', totals.numero_facturas, totals.valor_bruto, totals.descuentos, totals.subtotal, totals.iva, totals.retenciones, totals.total];
      data[footerRow - 1][5] = `Generado: ${new Intl.DateTimeFormat('es-CO', { dateStyle: 'short', timeStyle: 'short' }).format(new Date())}`;
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.aoa_to_sheet(data);
      const range = (row, col) => XLSX.utils.encode_cell({ r: row - 1, c: col - 1 });
      const setStyle = (fromRow, toRow, fromCol, toCol, style) => {
        for (let row = fromRow; row <= toRow; row++) for (let col = fromCol; col <= toCol; col++) {
          const ref = range(row, col);
          if (!worksheet[ref]) worksheet[ref] = { t: 's', v: '' };
          worksheet[ref].s = style;
        }
      };
      const greenLight = 'EAF1DD';
      const greenTitle = 'C4D79B';
      const greenHeader = '77933C';
      const border = { top: { style: 'thin', color: { rgb: '1F1F1F' } }, bottom: { style: 'thin', color: { rgb: '1F1F1F' } }, left: { style: 'thin', color: { rgb: '1F1F1F' } }, right: { style: 'thin', color: { rgb: '1F1F1F' } } };
      const titleStyle = { fill: { patternType: 'solid', fgColor: { rgb: greenTitle } }, font: { name: 'Arial Rounded MT Bold', sz: 14, bold: true, color: { rgb: '000000' } }, alignment: { horizontal: 'center', vertical: 'center' }, border };
      const metaStyle = { fill: { patternType: 'solid', fgColor: { rgb: greenLight } }, font: { name: 'Arial Rounded MT Bold', sz: 12, bold: true, color: { rgb: '000000' } }, alignment: { horizontal: 'center', vertical: 'center' }, border };
      const tableHeaderStyle = { fill: { patternType: 'solid', fgColor: { rgb: greenHeader } }, font: { name: 'Arial Rounded MT Bold', sz: 12, bold: true, color: { rgb: '000000' } }, alignment: { horizontal: 'center', vertical: 'center' }, border };
      const dataStyle = { font: { name: 'Arial Rounded MT Bold', sz: 11, bold: true, color: { rgb: '000000' } }, alignment: { vertical: 'center' }, border };
      const numberStyle = { ...dataStyle, alignment: { horizontal: 'right', vertical: 'center' }, numFmt: '$#,##0.00' };
      const totalStyle = { ...numberStyle, fill: { patternType: 'solid', fgColor: { rgb: 'F2F2F2' } }, font: { name: 'Arial Rounded MT Bold', sz: 11, bold: true, color: { rgb: '000000' } } };
      worksheet['!merges'] = [
        { s: { r: 1, c: 1 }, e: { r: 1, c: 9 } },
        ...metadata.slice(1).map((_, index) => ({ s: { r: index + 2, c: 1 }, e: { r: index + 2, c: 9 } })),
      ];
      worksheet['!cols'] = [{ wch: 3 }, { wch: 18 }, { wch: 32 }, { wch: 11 }, { wch: 16 }, { wch: 15 }, { wch: 16 }, { wch: 15 }, { wch: 16 }, { wch: 16 }];
      worksheet['!rows'] = [{ hpt: 8 }, { hpt: 28 }, ...metadata.slice(1).map(() => ({ hpt: 23 })), { hpt: 8 }, { hpt: 25 }, ...state.rows.map(() => ({ hpt: 22 })), { hpt: 23 }, { hpt: 8 }, { hpt: 20 }];
      worksheet['!autofilter'] = { ref: `B${headerRow}:J${totalRow - 1}` };
      worksheet['!freeze'] = { xSplit: 0, ySplit: headerRow, topLeftCell: `B${dataStartRow}`, activePane: 'bottomLeft', state: 'frozen' };
      worksheet['!margins'] = { left: .25, right: .25, top: .5, bottom: .5, header: .2, footer: .2 };
      setStyle(2, 2, 2, 10, titleStyle);
      setStyle(3, metadata.length + 1, 2, 10, metaStyle);
      setStyle(headerRow, headerRow, 2, 10, tableHeaderStyle);
      setStyle(dataStartRow, totalRow - 1, 2, 4, dataStyle);
      setStyle(dataStartRow, totalRow - 1, 5, 10, numberStyle);
      setStyle(totalRow, totalRow, 2, 3, totalStyle);
      setStyle(totalRow, totalRow, 4, 10, totalStyle);
      for (let row = dataStartRow; row <= totalRow; row++) for (let col = 5; col <= 10; col++) worksheet[range(row, col)].z = '$#,##0.00';
      workbook.Props = { Title: 'Reporte de ventas por cliente', Subject: 'Reporte contable AMC', Author: 'AMC Facturación Electrónica y POS' };
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Ventas por cliente');
      XLSX.writeFile(workbook, `Reporte-ventas-clientes-${archivoSeguro($('fecha-desde').value)}-${archivoSeguro($('fecha-hasta').value)}.xlsx`, { cellStyles: true });
    } catch (error) {
      console.error('Error al exportar Excel:', error);
      notify('No fue posible generar el archivo Excel. Inténtalo nuevamente.', true);
    } finally {
      button.disabled = false; button.textContent = previous;
    }
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
      state.filtrosAplicados = { desde, hasta, tercero: state.tercero ? { ...state.tercero } : null };
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
  $('btn-exportar-pdf').addEventListener('click', exportarPdf);
  $('btn-exportar-excel').addEventListener('click', exportarExcel);
  setInitialDates();
  cargarEmpresa().finally(consultar);
});
