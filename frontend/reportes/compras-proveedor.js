'use strict';

document.addEventListener('DOMContentLoaded', () => {
  const activeUserCode = sessionStorage.getItem('amc_active_user_code') || '1110591592';
  const COMPRAS_KEY = `amc_facturas_compra_db_v1_${activeUserCode}`;
  const $ = id => document.getElementById(id);
  const state = { proveedor: null, rows: [], filtros: null, empresa: { nombre: 'AMC Facturación Electrónica y POS', identificacion: 'No disponible' } };
  const number = value => { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; };
  const money = value => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(number(value));
  const escapeHtml = value => { const element = document.createElement('div'); element.textContent = String(value ?? ''); return element.innerHTML; };
  const normal = value => String(value || '').trim().toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const safeName = value => String(value || 'reporte').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'reporte';
  const compras = () => { try { const items = JSON.parse(localStorage.getItem(COMPRAS_KEY) || '[]'); return Array.isArray(items) ? items : []; } catch { return []; } };

  function notify(message, error = false) { $('report-message').innerHTML = message ? `<div class="notice${error ? ' error' : ''}">${escapeHtml(message)}</div>` : ''; }
  function fechaIso(date) { return date.toISOString().slice(0, 10); }
  function setInitialDates() { const today = new Date(); $('fecha-desde').value = fechaIso(new Date(today.getFullYear(), today.getMonth(), 1)); $('fecha-hasta').value = fechaIso(today); }
  function periodo() { const filter = state.filtros || {}; return `${filter.desde || $('fecha-desde').value || '—'} al ${filter.hasta || $('fecha-hasta').value || '—'}`; }
  function perfilLocal() { try { const data = JSON.parse(localStorage.getItem(`amc_perfil_emisor_v1_${activeUserCode}`) || '{}'); return { nombre: data.razonSocial || data.nombre || state.empresa.nombre, identificacion: data.nit || state.empresa.identificacion }; } catch { return state.empresa; } }

  function totalRows(rows = state.rows) {
    return rows.reduce((sum, item) => ({ numero_compras: sum.numero_compras + number(item.numero_compras), valor_bruto: sum.valor_bruto + number(item.valor_bruto), descuentos: sum.descuentos + number(item.descuentos), subtotal: sum.subtotal + number(item.subtotal), iva: sum.iva + number(item.iva), retenciones: sum.retenciones + number(item.retenciones), total: sum.total + number(item.total) }), { numero_compras: 0, valor_bruto: 0, descuentos: 0, subtotal: 0, iva: 0, retenciones: 0, total: 0 });
  }

  function render(rows) {
    state.rows = rows;
    const totals = totalRows(rows);
    $('report-rows').innerHTML = rows.map(item => `<tr><td>${escapeHtml(item.proveedor_documento)}</td><td class="client-name">${escapeHtml(item.proveedor_nombre)}</td><td class="num">${item.numero_compras}</td><td class="num">${money(item.valor_bruto)}</td><td class="num">${money(item.descuentos)}</td><td class="num">${money(item.subtotal)}</td><td class="num">${money(item.iva)}</td><td class="num">${money(item.retenciones)}</td><td class="num"><strong>${money(item.total)}</strong></td></tr>`).join('');
    $('report-empty').hidden = rows.length > 0;
    $('report-total').innerHTML = rows.length ? `<tr><td colspan="2">Total general</td><td class="num">${totals.numero_compras}</td><td class="num">${money(totals.valor_bruto)}</td><td class="num">${money(totals.descuentos)}</td><td class="num">${money(totals.subtotal)}</td><td class="num">${money(totals.iva)}</td><td class="num">${money(totals.retenciones)}</td><td class="num">${money(totals.total)}</td></tr>` : '';
  }

  function reportLocal() {
    const desde = new Date(`${$('fecha-desde').value}T00:00:00`);
    const hasta = new Date(`${$('fecha-hasta').value}T23:59:59.999`);
    const selected = state.proveedor;
    const grouped = new Map();
    compras().filter(compra => {
      const date = new Date(`${compra.fecha || String(compra.generadoEn || '').slice(0, 10)}T12:00:00`);
      const tercero = compra.tercero || {};
      const matchesProvider = !selected || (selected.documento ? tercero.documento === selected.documento : tercero.nombre === selected.nombre);
      return compra.estado !== 'ANULADA' && !Number.isNaN(date.getTime()) && date >= desde && date <= hasta && matchesProvider;
    }).forEach(compra => {
      const tercero = compra.tercero || {};
      const key = tercero.documento || tercero.nombre || compra.id;
      const item = grouped.get(key) || { proveedor_documento: tercero.documento || '—', proveedor_nombre: tercero.nombre || 'Proveedor sin nombre', numero_compras: 0, valor_bruto: 0, descuentos: 0, subtotal: 0, iva: 0, retenciones: 0, total: 0 };
      const totals = compra.totales || {};
      const descuento = number(totals.descuento);
      const subtotal = number(totals.base);
      const iva = number(totals.iva);
      const retencion = number(totals.retencion);
      item.numero_compras += 1;
      item.valor_bruto += subtotal + descuento;
      item.descuentos += descuento;
      item.subtotal += subtotal;
      item.iva += iva;
      item.retenciones += retencion;
      item.total += number(totals.total || subtotal + iva + retencion);
      grouped.set(key, item);
    });
    return [...grouped.values()].sort((a, b) => b.total - a.total || a.proveedor_nombre.localeCompare(b.proveedor_nombre));
  }

  function consultar() {
    const desde = $('fecha-desde').value;
    const hasta = $('fecha-hasta').value;
    if (!desde || !hasta) return notify('Selecciona la fecha inicial y final del período.', true);
    if (desde > hasta) return notify('La fecha inicial no puede ser mayor que la fecha final.', true);
    const rows = reportLocal();
    state.filtros = { desde, hasta, proveedor: state.proveedor ? { ...state.proveedor } : null };
    render(rows);
    notify(rows.length ? `${rows.length} proveedor(es) con compras en el período seleccionado.` : 'No se encontraron compras para el período seleccionado.');
  }

  function proveedores(query) {
    const uniques = new Map();
    compras().forEach(compra => { const tercero = compra.tercero || {}; const key = tercero.documento || tercero.nombre; if (key) uniques.set(key, { nombre: tercero.nombre || 'Proveedor sin nombre', documento: tercero.documento || '' }); });
    return [...uniques.values()].filter(item => normal(item.nombre).includes(normal(query)) || normal(item.documento).includes(normal(query))).slice(0, 8);
  }

  function renderProviderOptions(items) {
    const menu = $('provider-options');
    menu.innerHTML = items.map((item, index) => `<button type="button" class="client-option" data-index="${index}">${escapeHtml(item.nombre)}<small>${escapeHtml(item.documento || 'Sin documento')}</small></button>`).join('');
    menu.hidden = !items.length;
    menu.querySelectorAll('[data-index]').forEach(button => button.addEventListener('click', () => {
      state.proveedor = items[Number(button.dataset.index)];
      $('buscar-proveedor').value = state.proveedor.nombre;
      $('selected-provider').textContent = `Proveedor seleccionado: ${state.proveedor.nombre} · ${state.proveedor.documento || 'Sin documento'}`;
      $('selected-provider').hidden = false;
      menu.hidden = true;
    }));
  }

  function buscarProveedor() {
    const query = $('buscar-proveedor').value.trim();
    state.proveedor = null;
    $('selected-provider').hidden = true;
    if (query.length < 3) { $('provider-options').hidden = true; return; }
    renderProviderOptions(proveedores(query));
  }

  function validarExportacion() { if (state.rows.length) return true; notify('No hay datos en la tabla para exportar. Consulta un período con compras primero.', true); return false; }
  function construirPdf() {
    const totals = totalRows();
    const selected = state.filtros?.proveedor;
    const generated = new Intl.DateTimeFormat('es-CO', { dateStyle: 'long', timeStyle: 'short' }).format(new Date());
    const rows = state.rows.map(item => `<tr><td>${escapeHtml(item.proveedor_documento)}</td><td>${escapeHtml(item.proveedor_nombre)}</td><td class="num">${item.numero_compras}</td><td class="num">${money(item.valor_bruto)}</td><td class="num">${money(item.descuentos)}</td><td class="num">${money(item.subtotal)}</td><td class="num">${money(item.iva)}</td><td class="num">${money(item.retenciones)}</td><td class="num">${money(item.total)}</td></tr>`).join('');
    const stage = document.createElement('div'); stage.className = 'pdf-export-stage';
    const doc = document.createElement('article'); doc.className = 'pdf-export-document';
    doc.innerHTML = `<header class="pdf-export-header"><div class="pdf-export-brand"><span>AMC</span><div><p class="pdf-export-eyebrow">INFORME CONTABLE</p><h1>Reporte de compras por proveedor</h1><p><strong>${escapeHtml(state.empresa.nombre)}</strong></p><p>NIT / identificación: ${escapeHtml(state.empresa.identificacion)}</p></div></div><div class="pdf-export-meta"><strong>Fecha y hora de emisión</strong><br>${escapeHtml(generated)}<br><br><strong>Estado</strong><br><span>Reporte consolidado</span></div></header><section class="pdf-export-summary"><div><span>Período consultado</span><strong>${escapeHtml(periodo())}</strong></div><div><span>Proveedores con compras</span><strong>${state.rows.length}</strong></div><div><span>Total compras</span><strong>${money(totals.total)}</strong></div></section><div class="pdf-export-period"><strong>Alcance del reporte</strong><br>${selected ? `Proveedor filtrado: ${escapeHtml(selected.nombre)} · ${escapeHtml(selected.documento)}` : 'Consolidado de todos los proveedores con compras en el período.'}</div><table><thead><tr><th>Identificación</th><th>Proveedor</th><th class="num">Compras</th><th class="num">Valor bruto</th><th class="num">Descuentos</th><th class="num">Subtotal</th><th class="num">IVA</th><th class="num">Retenciones</th><th class="num">Total</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td colspan="2">Total general</td><td class="num">${totals.numero_compras}</td><td class="num">${money(totals.valor_bruto)}</td><td class="num">${money(totals.descuentos)}</td><td class="num">${money(totals.subtotal)}</td><td class="num">${money(totals.iva)}</td><td class="num">${money(totals.retenciones)}</td><td class="num">${money(totals.total)}</td></tr></tfoot></table><footer class="pdf-export-footer"><span>AMC Facturación Electrónica y POS</span><span>Compras anuladas excluidas · Documento generado automáticamente</span></footer>`;
    stage.appendChild(doc); document.body.appendChild(stage); return doc;
  }

  async function exportarPdf() {
    if (!validarExportacion()) return;
    if (typeof html2pdf === 'undefined') return notify('No se pudo cargar el generador de PDF. Verifica tu conexión e inténtalo de nuevo.', true);
    const button = $('btn-exportar-pdf'); const previous = button.textContent; const doc = construirPdf(); button.disabled = true; button.textContent = 'Generando PDF…';
    try { await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); await html2pdf().set({ margin: [5, 5, 5, 5], filename: `Reporte-compras-proveedores-${safeName($('fecha-desde').value)}-${safeName($('fecha-hasta').value)}.pdf`, image: { type: 'jpeg', quality: .98 }, html2canvas: { scale: 2, useCORS: true, backgroundColor: '#fff' }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }, pagebreak: { mode: ['avoid-all', 'css', 'legacy'] } }).from(doc).save(); }
    catch (error) { console.error('Error al exportar PDF:', error); notify('No fue posible generar el PDF. Inténtalo nuevamente.', true); }
    finally { doc.parentElement?.remove(); button.disabled = false; button.textContent = previous; }
  }

  function exportarExcel() {
    if (!validarExportacion()) return;
    if (typeof XLSX === 'undefined') return notify('No se pudo cargar el generador de Excel. Verifica tu conexión e inténtalo de nuevo.', true);
    const button = $('btn-exportar-excel'); const previous = button.textContent; button.disabled = true; button.textContent = 'Generando Excel…';
    try {
      const totals = totalRows();
      const data = [['REPORTE DE COMPRAS POR PROVEEDOR'], [`Empresa: ${state.empresa.nombre}`], [`Identificación: ${state.empresa.identificacion}`], [`Período consultado: ${periodo()}`], [], ['Identificación', 'Proveedor', 'Compras', 'Valor bruto', 'Descuentos', 'Subtotal', 'IVA', 'Retenciones', 'Total'], ...state.rows.map(item => [item.proveedor_documento, item.proveedor_nombre, item.numero_compras, item.valor_bruto, item.descuentos, item.subtotal, item.iva, item.retenciones, item.total]), ['TOTAL GENERAL', '', totals.numero_compras, totals.valor_bruto, totals.descuentos, totals.subtotal, totals.iva, totals.retenciones, totals.total]];
      const workbook = XLSX.utils.book_new(); const sheet = XLSX.utils.aoa_to_sheet(data); const headerRow = 6; const totalRow = data.length;
      sheet['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 8 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: 8 } }, { s: { r: 2, c: 0 }, e: { r: 2, c: 8 } }, { s: { r: 3, c: 0 }, e: { r: 3, c: 8 } }];
      sheet['!cols'] = [{ wch: 18 }, { wch: 32 }, { wch: 11 }, { wch: 16 }, { wch: 15 }, { wch: 16 }, { wch: 15 }, { wch: 16 }, { wch: 16 }];
      const cells = XLSX.utils.decode_range(sheet['!ref']);
      for (let row = 0; row <= cells.e.r; row++) for (let col = 0; col <= cells.e.c; col++) { const cell = XLSX.utils.encode_cell({ r: row, c: col }); if (!sheet[cell]) sheet[cell] = { t: 's', v: '' }; sheet[cell].s = { font: { name: 'Arial', sz: 10 }, border: { top: { style: 'thin', color: { rgb: 'D5E4EB' } }, bottom: { style: 'thin', color: { rgb: 'D5E4EB' } }, left: { style: 'thin', color: { rgb: 'D5E4EB' } }, right: { style: 'thin', color: { rgb: 'D5E4EB' } } } }; }
      for (let col = 0; col < 9; col++) { sheet[XLSX.utils.encode_cell({ r: 0, c: col })].s = { fill: { patternType: 'solid', fgColor: { rgb: '001E82' } }, font: { name: 'Arial', sz: 14, bold: true, color: { rgb: 'FFFFFF' } }, alignment: { horizontal: 'center' } }; sheet[XLSX.utils.encode_cell({ r: headerRow - 1, c: col })].s = { fill: { patternType: 'solid', fgColor: { rgb: 'DCEFFA' } }, font: { name: 'Arial', bold: true, color: { rgb: '001E82' } }, alignment: { horizontal: 'center' } }; sheet[XLSX.utils.encode_cell({ r: totalRow - 1, c: col })].s = { fill: { patternType: 'solid', fgColor: { rgb: 'EAF9FE' } }, font: { name: 'Arial', bold: true, color: { rgb: '001E82' } } }; }
      for (let row = headerRow + 1; row <= totalRow; row++) for (let col = 3; col <= 8; col++) { const cell = sheet[XLSX.utils.encode_cell({ r: row - 1, c: col })]; if (cell) cell.z = '$#,##0'; }
      workbook.Props = { Title: 'Reporte de compras por proveedor', Author: 'AMC Facturación Electrónica y POS' };
      XLSX.utils.book_append_sheet(workbook, sheet, 'Compras por proveedor'); XLSX.writeFile(workbook, `Reporte-compras-proveedores-${safeName($('fecha-desde').value)}-${safeName($('fecha-hasta').value)}.xlsx`, { cellStyles: true });
    } catch (error) { console.error('Error al exportar Excel:', error); notify('No fue posible generar el archivo Excel. Inténtalo nuevamente.', true); }
    finally { button.disabled = false; button.textContent = previous; }
  }

  $('buscar-proveedor').addEventListener('input', buscarProveedor);
  $('btn-consultar').addEventListener('click', consultar);
  $('btn-limpiar').addEventListener('click', () => { setInitialDates(); $('buscar-proveedor').value = ''; state.proveedor = null; $('selected-provider').hidden = true; $('provider-options').hidden = true; consultar(); });
  $('btn-exportar-pdf').addEventListener('click', exportarPdf);
  $('btn-exportar-excel').addEventListener('click', exportarExcel);
  state.empresa = perfilLocal();
  setInitialDates(); consultar();
});
