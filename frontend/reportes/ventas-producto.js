'use strict';

document.addEventListener('DOMContentLoaded', () => {
  const SESSION_KEY = 'amc_session_v2';
  const activeUserCode = sessionStorage.getItem('amc_active_user_code') || '1110591592';
  const isDev = activeUserCode === '1110591592';
  const FACTURAS_DB_KEY = isDev ? 'amc_facturas_generadas_db_v1' : `amc_facturas_generadas_db_v1_${activeUserCode}`;
  const API_BASE = 'http://localhost:3000/api';
  const $ = (id) => document.getElementById(id);
  const state = {
    producto: null, consultaActual: 0, rows: [], filtrosAplicados: null,
    catalogo: [], empresa: { nombre: 'AMC Facturación Electrónica y POS', identificacion: 'No disponible' },
  };

  function getToken() { try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || '{}').token || null; } catch { return null; } }
  function escapeHtml(value) { const el = document.createElement('div'); el.textContent = String(value ?? ''); return el.innerHTML; }
  function normal(value) { return String(value || '').trim().toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
  function number(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
  function money(value) { return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(number(value)); }
  function quantity(value) { return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 4 }).format(number(value)); }
  function dateString(date) { return date.toISOString().slice(0, 10); }
  function notify(message, error = false) { $('report-message').innerHTML = message ? `<div class="notice${error ? ' error' : ''}">${escapeHtml(message)}</div>` : ''; }
  function archivoSeguro(value) { return String(value || 'reporte').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70) || 'reporte'; }

  async function apiFetch(endpoint) {
    const response = await fetch(`${API_BASE}${endpoint}`, { headers: { Authorization: `Bearer ${getToken()}` } });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'No fue posible consultar la información.');
    return data;
  }

  function setInitialDates() {
    const today = new Date();
    $('fecha-desde').value = dateString(new Date(today.getFullYear(), today.getMonth(), 1));
    $('fecha-hasta').value = dateString(today);
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

  function periodoActual() {
    const filtros = state.filtrosAplicados || {};
    return `${filtros.desde || $('fecha-desde').value || '—'} al ${filtros.hasta || $('fecha-hasta').value || '—'}`;
  }

  function totalesReporte(rows = state.rows) {
    return rows.reduce((sum, item) => ({
      cantidad_total: sum.cantidad_total + number(item.cantidad_total), valor_bruto: sum.valor_bruto + number(item.valor_bruto),
      iva: sum.iva + number(item.iva), retenciones: sum.retenciones + number(item.retenciones), total: sum.total + number(item.total),
    }), { cantidad_total: 0, valor_bruto: 0, iva: 0, retenciones: 0, total: 0 });
  }

  function actualizarCatalogo(rows) {
    state.catalogo = rows.map((row) => ({ id: row.producto_id, codigo: row.producto_codigo, nombre: row.producto_nombre, tipo: row.tipo })).filter((row) => row.id);
  }

  function render(rows) {
    state.rows = rows;
    actualizarCatalogo(rows);
    const totals = totalesReporte(rows);
    $('report-rows').innerHTML = rows.map((item) => `<tr><td>${escapeHtml(item.producto_codigo)}</td><td class="client-name">${escapeHtml(item.producto_nombre)}<small class="report-item-type">${escapeHtml(item.tipo || 'PRODUCTO / SERVICIO')}</small></td><td class="num">${quantity(item.cantidad_total)}</td><td class="num">${money(item.valor_bruto)}</td><td class="num">${money(item.iva)}</td><td class="num">${money(item.retenciones)}</td><td class="num"><strong>${money(item.total)}</strong></td></tr>`).join('');
    $('report-empty').hidden = rows.length > 0;
    $('report-total').innerHTML = rows.length ? `<tr><td colspan="2">Total general</td><td class="num">${quantity(totals.cantidad_total)}</td><td class="num">${money(totals.valor_bruto)}</td><td class="num">${money(totals.iva)}</td><td class="num">${money(totals.retenciones)}</td><td class="num">${money(totals.total)}</td></tr>` : '';
  }

  function firstNumber(...values) { const value = values.find((item) => item !== undefined && item !== null && item !== ''); return number(value); }

  function localReport() {
    let invoices = [];
    try { invoices = JSON.parse(localStorage.getItem(FACTURAS_DB_KEY) || '[]'); } catch { invoices = []; }
    const desde = new Date(`${$('fecha-desde').value}T00:00:00`);
    const hasta = new Date(`${$('fecha-hasta').value}T23:59:59.999`);
    const grouped = new Map();
    invoices.filter((invoice) => {
      const generated = new Date(invoice.generadoEn || invoice.creado_en);
      return invoice.estado !== 'ANULADA' && !Number.isNaN(generated.getTime()) && generated >= desde && generated <= hasta;
    }).forEach((invoice) => {
      (Array.isArray(invoice.lineas) ? invoice.lineas : []).forEach((line) => {
        const codigo = line.codigo || 'SIN-CÓDIGO';
        const nombre = line.nombre || line.producto || 'Producto sin nombre';
        const id = line.producto_id || `${codigo}:${nombre}`;
        if (state.producto && String(state.producto.id) !== String(id)) return;
        const cantidad = firstNumber(line.cantidad);
        const base = firstNumber(line.base, line.valor_base, cantidad * firstNumber(line.valor_unitario, line.unitario));
        const iva = firstNumber(line.valor_iva, line.valorIva, base * firstNumber(line.tarifa_iva, line.tarifaIva, line.iva) / 100);
        const retenciones = firstNumber(line.valor_retencion, line.valorRetencion, base * firstNumber(line.tarifa_retencion, line.tarifaRetencion, line.retencion) / 100);
        const total = firstNumber(line.total, base + iva - retenciones);
        const current = grouped.get(id) || { producto_id: id, producto_codigo: codigo, producto_nombre: nombre, tipo: line.tipo || 'PRODUCTO / SERVICIO', cantidad_total: 0, valor_bruto: 0, iva: 0, retenciones: 0, total: 0 };
        current.cantidad_total += cantidad; current.valor_bruto += base; current.iva += iva; current.retenciones += retenciones; current.total += total;
        grouped.set(id, current);
      });
    });
    return [...grouped.values()].sort((a, b) => b.total - a.total || a.producto_nombre.localeCompare(b.producto_nombre));
  }

  async function consultar() {
    const desde = $('fecha-desde').value; const hasta = $('fecha-hasta').value;
    if (!desde || !hasta) return notify('Selecciona la fecha inicial y final del período.', true);
    if (desde > hasta) return notify('La fecha inicial no puede ser mayor que la fecha final.', true);
    const requestId = ++state.consultaActual;
    notify('Consultando ventas por producto y/o servicio…');
    try {
      let rows;
      if (getToken()) {
        const query = new URLSearchParams({ desde, hasta });
        if (state.producto?.id && /^[0-9a-f-]{36}$/i.test(state.producto.id)) query.set('productoId', state.producto.id);
        rows = (await apiFetch(`/reportes/ventas-por-producto?${query}`)).ventas || [];
      } else rows = localReport();
      if (requestId !== state.consultaActual) return;
      render(rows);
      state.filtrosAplicados = { desde, hasta, producto: state.producto ? { ...state.producto } : null };
      notify(rows.length ? `${rows.length} producto(s) o servicio(s) con ventas en el período seleccionado.` : 'No se encontraron productos o servicios facturados para el período seleccionado.');
    } catch (error) {
      if (requestId !== state.consultaActual) return;
      render([]); notify(error.message, true);
    }
  }

  function renderProductOptions(items) {
    const menu = $('product-options');
    menu.innerHTML = items.map((item, index) => `<button type="button" class="client-option" data-index="${index}">${escapeHtml(item.nombre)}<small>${escapeHtml(item.codigo)} · ${escapeHtml(item.tipo || 'PRODUCTO / SERVICIO')}</small></button>`).join('');
    menu.hidden = !items.length;
    menu.querySelectorAll('[data-index]').forEach((button) => button.addEventListener('click', () => {
      state.producto = items[Number(button.dataset.index)];
      $('buscar-producto').value = state.producto.nombre;
      $('selected-product').textContent = `Producto o servicio seleccionado: ${state.producto.codigo} · ${state.producto.nombre}`;
      $('selected-product').hidden = false; menu.hidden = true;
    }));
  }

  function buscarProducto() {
    const query = $('buscar-producto').value.trim();
    state.producto = null; $('selected-product').hidden = true;
    if (query.length < 2) { $('product-options').hidden = true; return; }
    const needle = normal(query);
    renderProductOptions(state.catalogo.filter((item) => normal(item.nombre).includes(needle) || normal(item.codigo).includes(needle)).slice(0, 8));
  }

  function validarExportacion() {
    if (state.rows.length) return true;
    notify('No hay datos en la tabla para exportar. Consulta un período con ventas primero.', true);
    return false;
  }

  function construirDocumentoPdf() {
    const generated = new Intl.DateTimeFormat('es-CO', { dateStyle: 'long', timeStyle: 'short' }).format(new Date());
    const totals = totalesReporte(); const filtro = state.filtrosAplicados?.producto;
    const rows = state.rows.map((item) => `<tr><td>${escapeHtml(item.producto_codigo)}</td><td>${escapeHtml(item.producto_nombre)}</td><td class="num">${quantity(item.cantidad_total)}</td><td class="num">${money(item.valor_bruto)}</td><td class="num">${money(item.iva)}</td><td class="num">${money(item.retenciones)}</td><td class="num">${money(item.total)}</td></tr>`).join('');
    const stage = document.createElement('div'); stage.className = 'pdf-export-stage';
    const doc = document.createElement('article'); doc.className = 'pdf-export-document';
    doc.innerHTML = `<header class="pdf-export-header"><div class="pdf-export-brand"><span>AMC</span><div><p class="pdf-export-eyebrow">INFORME CONTABLE</p><h1>Reporte de ventas por producto y/o servicio</h1><p><strong>${escapeHtml(state.empresa.nombre)}</strong></p><p>NIT / identificación: ${escapeHtml(state.empresa.identificacion)}</p></div></div><div class="pdf-export-meta"><strong>Fecha y hora de emisión</strong><br>${escapeHtml(generated)}<br><br><strong>Estado</strong><br><span>Reporte consolidado</span></div></header><section class="pdf-export-summary"><div><span>Período consultado</span><strong>${escapeHtml(periodoActual())}</strong></div><div><span>Ítems vendidos</span><strong>${state.rows.length}</strong></div><div><span>Total facturado</span><strong>${money(totals.total)}</strong></div></section><div class="pdf-export-period"><strong>Alcance del reporte</strong><br>${filtro ? `Producto o servicio filtrado: ${escapeHtml(filtro.codigo)} · ${escapeHtml(filtro.nombre)}` : 'Consolidado de todos los productos y servicios incluidos en la consulta.'}</div><table><thead><tr><th>Código</th><th>Producto o servicio</th><th class="num">Cantidad</th><th class="num">Valor bruto</th><th class="num">IVA</th><th class="num">Retenciones</th><th class="num">Total</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td colspan="2">Total general</td><td class="num">${quantity(totals.cantidad_total)}</td><td class="num">${money(totals.valor_bruto)}</td><td class="num">${money(totals.iva)}</td><td class="num">${money(totals.retenciones)}</td><td class="num">${money(totals.total)}</td></tr></tfoot></table><footer class="pdf-export-footer"><span>AMC Facturación Electrónica y POS</span><span>Facturas anuladas excluidas · Documento generado automáticamente</span></footer>`;
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
        filename: `Reporte-ventas-productos-${archivoSeguro($('fecha-desde').value)}-${archivoSeguro($('fecha-hasta').value)}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
      };
      await html2pdf().set(opt).from(doc).save();
    } catch (error) { console.error('Error al exportar PDF:', error); notify('No fue posible generar el PDF. Inténtalo nuevamente.', true); }
    finally { doc.parentElement?.remove(); button.disabled = false; button.textContent = previous; }
  }

  function exportarExcel() {
    if (!validarExportacion()) return;
    if (typeof XLSX === 'undefined') return notify('No se pudo cargar el generador de Excel. Verifica tu conexión e inténtalo de nuevo.', true);
    const button = $('btn-exportar-excel'); const previous = button.textContent;
    button.disabled = true; button.textContent = 'Generando Excel…';
    try {
      const generated = new Intl.DateTimeFormat('es-CO', { dateStyle: 'long', timeStyle: 'short' }).format(new Date());
      const totals = totalesReporte(); const filtro = state.filtrosAplicados?.producto;
      const metadata = ['REPORTE DE VENTAS POR PRODUCTO Y/O SERVICIO', `Empresa: ${state.empresa.nombre}`, `Identificación: ${state.empresa.identificacion}`, `Fecha y hora del reporte: ${generated}`, `Período consultado: ${periodoActual()}`, ...(filtro ? [`Producto o servicio filtrado: ${filtro.codigo} · ${filtro.nombre}`] : [])];
      const headerRow = metadata.length + 3; const dataStartRow = headerRow + 1; const totalRow = dataStartRow + state.rows.length; const footerRow = totalRow + 3;
      const data = Array.from({ length: footerRow }, () => Array(8).fill(null));
      metadata.forEach((value, index) => { data[index + 1][1] = value; });
      data[headerRow - 1] = [null, 'Código', 'Producto o servicio', 'Cantidad vendida', 'Valor bruto', 'IVA', 'Retenciones', 'Total'];
      state.rows.forEach((item, index) => { data[dataStartRow - 1 + index] = [null, item.producto_codigo, item.producto_nombre, number(item.cantidad_total), number(item.valor_bruto), number(item.iva), number(item.retenciones), number(item.total)]; });
      data[totalRow - 1] = [null, 'TOTAL GENERAL', '', totals.cantidad_total, totals.valor_bruto, totals.iva, totals.retenciones, totals.total];
      data[footerRow - 1][4] = `Generado: ${new Intl.DateTimeFormat('es-CO', { dateStyle: 'short', timeStyle: 'short' }).format(new Date())}`;
      const workbook = XLSX.utils.book_new(); const worksheet = XLSX.utils.aoa_to_sheet(data);
      const cell = (row, col) => XLSX.utils.encode_cell({ r: row - 1, c: col - 1 });
      const styleRange = (fromRow, toRow, fromCol, toCol, style) => { for (let row = fromRow; row <= toRow; row++) for (let col = fromCol; col <= toCol; col++) { const ref = cell(row, col); if (!worksheet[ref]) worksheet[ref] = { t: 's', v: '' }; worksheet[ref].s = style; } };
      const border = { top: { style: 'thin', color: { rgb: '1F1F1F' } }, bottom: { style: 'thin', color: { rgb: '1F1F1F' } }, left: { style: 'thin', color: { rgb: '1F1F1F' } }, right: { style: 'thin', color: { rgb: '1F1F1F' } } };
      const title = { fill: { patternType: 'solid', fgColor: { rgb: 'C4D79B' } }, font: { name: 'Arial Rounded MT Bold', sz: 14, bold: true }, alignment: { horizontal: 'center', vertical: 'center' }, border };
      const meta = { fill: { patternType: 'solid', fgColor: { rgb: 'EAF1DD' } }, font: { name: 'Arial Rounded MT Bold', sz: 12, bold: true }, alignment: { horizontal: 'center', vertical: 'center' }, border };
      const heading = { fill: { patternType: 'solid', fgColor: { rgb: '77933C' } }, font: { name: 'Arial Rounded MT Bold', sz: 12, bold: true }, alignment: { horizontal: 'center', vertical: 'center' }, border };
      const textStyle = { font: { name: 'Arial Rounded MT Bold', sz: 11, bold: true }, alignment: { vertical: 'center' }, border };
      const amount = { ...textStyle, alignment: { horizontal: 'right', vertical: 'center' }, numFmt: '$#,##0.00' };
      const qty = { ...textStyle, alignment: { horizontal: 'right', vertical: 'center' }, numFmt: '#,##0.0000' };
      const total = { ...amount, fill: { patternType: 'solid', fgColor: { rgb: 'F2F2F2' } } };
      worksheet['!merges'] = [{ s: { r: 1, c: 1 }, e: { r: 1, c: 7 } }, ...metadata.slice(1).map((_, index) => ({ s: { r: index + 2, c: 1 }, e: { r: index + 2, c: 7 } }))];
      worksheet['!cols'] = [{ wch: 3 }, { wch: 18 }, { wch: 37 }, { wch: 17 }, { wch: 17 }, { wch: 15 }, { wch: 16 }, { wch: 17 }];
      worksheet['!rows'] = [{ hpt: 8 }, { hpt: 28 }, ...metadata.slice(1).map(() => ({ hpt: 23 })), { hpt: 8 }, { hpt: 25 }, ...state.rows.map(() => ({ hpt: 22 })), { hpt: 23 }, { hpt: 8 }, { hpt: 20 }];
      worksheet['!autofilter'] = { ref: `B${headerRow}:H${totalRow - 1}` }; worksheet['!freeze'] = { xSplit: 0, ySplit: headerRow, topLeftCell: `B${dataStartRow}`, activePane: 'bottomLeft', state: 'frozen' };
      worksheet['!margins'] = { left: .25, right: .25, top: .5, bottom: .5, header: .2, footer: .2 };
      styleRange(2, 2, 2, 8, title); styleRange(3, metadata.length + 1, 2, 8, meta); styleRange(headerRow, headerRow, 2, 8, heading);
      styleRange(dataStartRow, totalRow - 1, 2, 3, textStyle); styleRange(dataStartRow, totalRow - 1, 4, 4, qty); styleRange(dataStartRow, totalRow - 1, 5, 8, amount);
      styleRange(totalRow, totalRow, 2, 3, total); styleRange(totalRow, totalRow, 4, 4, { ...total, numFmt: '#,##0.0000' }); styleRange(totalRow, totalRow, 5, 8, total);
      workbook.Props = { Title: 'Reporte de ventas por producto y/o servicio', Subject: 'Reporte contable AMC', Author: 'AMC Facturación Electrónica y POS' };
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Ventas por producto');
      XLSX.writeFile(workbook, `Reporte-ventas-productos-${archivoSeguro($('fecha-desde').value)}-${archivoSeguro($('fecha-hasta').value)}.xlsx`, { cellStyles: true });
    } catch (error) { console.error('Error al exportar Excel:', error); notify('No fue posible generar el archivo Excel. Inténtalo nuevamente.', true); }
    finally { button.disabled = false; button.textContent = previous; }
  }

  $('buscar-producto').addEventListener('input', buscarProducto);
  $('btn-consultar').addEventListener('click', consultar);
  $('btn-limpiar').addEventListener('click', () => { setInitialDates(); $('buscar-producto').value = ''; state.producto = null; $('selected-product').hidden = true; $('product-options').hidden = true; consultar(); });
  $('btn-exportar-pdf').addEventListener('click', exportarPdf);
  $('btn-exportar-excel').addEventListener('click', exportarExcel);
  setInitialDates(); cargarEmpresa().finally(consultar);
});
