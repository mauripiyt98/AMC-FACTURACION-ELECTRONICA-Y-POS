'use strict';

document.addEventListener('DOMContentLoaded', () => {
  const SESSION_KEY = 'amc_session_v2';
  const activeUserCode = sessionStorage.getItem('amc_active_user_code') || '1110591592';
  const PRODUCTOS_DB_KEY = `amc_productos_db_v1_${activeUserCode}`;
  const API_BASE = 'http://localhost:3000/api';
  const $ = (id) => document.getElementById(id);
  const state = { productos: [], rows: [], useApi: false, empresa: { nombre: 'AMC Facturación Electrónica y POS', identificacion: 'No disponible' } };

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

  function perfilLocal() {
    try {
      const perfil = JSON.parse(localStorage.getItem(`amc_perfil_emisor_v1_${activeUserCode}`) || '{}');
      return { nombre: perfil.razonSocial || perfil.nombre || state.empresa.nombre, identificacion: perfil.nit || state.empresa.identificacion };
    } catch { return state.empresa; }
  }

  async function cargarEmpresa() {
    state.empresa = perfilLocal();
    if (!token()) return;
    try {
      const data = await apiFetch('/empresas/me');
      if (data.empresa) state.empresa = { nombre: data.empresa.razon_social || state.empresa.nombre, identificacion: data.empresa.nit || state.empresa.identificacion };
    } catch (error) { console.warn('Inventarios: no fue posible cargar el encabezado de la empresa.', error); }
  }

  function productoNormalizado(item) {
    return { ...item, unidad: item.unidad_medida || item.unidadMedida, precio: item.precio_base ?? item.precioBase ?? 0, activo: item.activo !== false, stock: Number(item.stock_total ?? item.stockTotal ?? 0) || 0, stockMinimo: Number(item.stock_minimo ?? item.stockMinimo ?? 0) || 0 };
  }

  function productosFiltrados() {
    const q = normal($('buscar-producto').value);
    const tipoFiltro = $('filtro-tipo').value;
    const estadoFiltro = $('filtro-estado').value;
    const stockFiltro = $('filtro-stock').value;
    return state.productos.map(productoNormalizado).filter((item) => {
      const itemTipo = String(item.tipo || 'PRODUCTO').toUpperCase();
      const estado = item.activo ? 'ACTIVO' : 'INACTIVO';
      const stockOk = !stockFiltro || (stockFiltro === 'DISPONIBLE' && item.stock > 0) || (stockFiltro === 'AGOTADO' && item.stock <= 0) || (stockFiltro === 'BAJO' && item.stockMinimo > 0 && item.stock > 0 && item.stock <= item.stockMinimo);
      return (!q || normal(item.nombre).includes(q) || normal(item.codigo).includes(q)) && (!tipoFiltro || itemTipo === tipoFiltro) && (!estadoFiltro || estado === estadoFiltro) && stockOk;
    });
  }

  function render() {
    const items = productosFiltrados();
    state.rows = items;
    $('inventory-empty').hidden = items.length > 0;
    $('inventory-list').innerHTML = items.map((item) => {
      const status = item.activo ? 'active' : 'inactive';
      const label = item.activo ? 'Activo' : 'Inactivo';
      return `<tr><td>${tipo(item.tipo)}</td><td class="name">${escapeHtml(item.nombre)}</td><td>${escapeHtml(item.codigo)}</td><td>${escapeHtml(unidad(item.unidad))}</td><td class="num">${precio(item.precio)}</td><td><span class="status ${status}">${label}</span></td><td class="num">${item.stock}</td><td><div class="row-actions"><button class="state-btn ${item.activo ? '' : 'activate'}" data-toggle="${escapeHtml(item.id)}">${item.activo ? 'Inactivar' : 'Activar'}</button><button class="manage-btn" data-manage="${escapeHtml(item.id)}">Gestionar inventario</button></div></td></tr>`;
    }).join('');
  }

  function filtrosTexto() {
    const values = [];
    if ($('buscar-producto').value.trim()) values.push(`Producto o servicio: ${$('buscar-producto').value.trim()}`);
    if ($('filtro-tipo').value) values.push(`Tipo: ${$('filtro-tipo').selectedOptions[0].text}`);
    if ($('filtro-estado').value) values.push(`Estado: ${$('filtro-estado').selectedOptions[0].text}`);
    if ($('filtro-stock').value) values.push(`Existencias: ${$('filtro-stock').selectedOptions[0].text}`);
    return values.length ? values.join(' · ') : 'Todos los productos y servicios.';
  }

  function validarExportacion() {
    if (state.rows.length) return true;
    mostrar('No hay datos en la tabla para exportar. Consulta el inventario con resultados primero.', true);
    return false;
  }

  function archivoSeguro(value) { return String(value || 'inventario').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'inventario'; }
  function generarFecha() { return new Intl.DateTimeFormat('es-CO', { dateStyle: 'long', timeStyle: 'short' }).format(new Date()); }
  function totalStock() { return state.rows.reduce((sum, item) => sum + item.stock, 0); }

  function construirDocumentoPdf() {
    const rows = state.rows.map((item) => `<tr><td>${escapeHtml(tipo(item.tipo))}</td><td>${escapeHtml(item.nombre)}</td><td>${escapeHtml(item.codigo)}</td><td>${escapeHtml(unidad(item.unidad))}</td><td class="num">${precio(item.precio)}</td><td>${item.activo ? 'Activo' : 'Inactivo'}</td><td class="num">${item.stock.toLocaleString('es-CO')}</td></tr>`).join('');
    const stage = document.createElement('div'); stage.className = 'pdf-export-stage';
    const doc = document.createElement('article'); doc.className = 'pdf-export-document';
    doc.innerHTML = `<header class="pdf-export-header"><div class="pdf-export-brand"><span>AMC</span><div><p class="pdf-export-eyebrow">INFORME DE INVENTARIO</p><h1>Reporte de productos y servicios</h1><p><strong>${escapeHtml(state.empresa.nombre)}</strong></p><p>NIT / identificación: ${escapeHtml(state.empresa.identificacion)}</p></div></div><div class="pdf-export-meta"><strong>Fecha y hora de emisión</strong><br>${escapeHtml(generarFecha())}<br><br><strong>Estado</strong><br>Reporte consolidado</div></header><section class="pdf-export-summary"><div><span>Filtros aplicados</span><strong>${escapeHtml(filtrosTexto())}</strong></div><div><span>Ítems listados</span><strong>${state.rows.length}</strong></div><div><span>Stock total</span><strong>${totalStock().toLocaleString('es-CO')}</strong></div></section><div class="pdf-export-period"><strong>Alcance del reporte</strong><br>Listado actual de productos y servicios del inventario.</div><table><thead><tr><th>Tipo</th><th>Producto o servicio</th><th>Código</th><th>Unidad</th><th class="num">Precio unitario</th><th>Estado</th><th class="num">Stock total</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td colspan="6">Total general de existencias</td><td class="num">${totalStock().toLocaleString('es-CO')}</td></tr></tfoot></table><footer class="pdf-export-footer"><span>AMC Facturación Electrónica y POS</span><span>Documento generado automáticamente</span></footer>`;
    stage.appendChild(doc); document.body.appendChild(stage); return doc;
  }

  async function exportarPdf() {
    if (!validarExportacion()) return;
    if (typeof html2pdf === 'undefined') return mostrar('No se pudo cargar el generador de PDF. Verifica tu conexión e inténtalo de nuevo.', true);
    const button = $('btn-exportar-pdf'); const previous = button.textContent; const doc = construirDocumentoPdf(); button.disabled = true; button.textContent = 'Generando PDF…';
    try { await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))); await html2pdf().set({ margin: [5, 5, 5, 5], filename: `Reporte-inventario-${archivoSeguro(new Date().toISOString().slice(0, 10))}.pdf`, image: { type: 'jpeg', quality: .98 }, html2canvas: { scale: 2, backgroundColor: '#ffffff' }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' } }).from(doc).save(); }
    catch (error) { console.error('Error al exportar PDF:', error); mostrar('No fue posible generar el PDF. Inténtalo nuevamente.', true); }
    finally { doc.parentElement?.remove(); button.disabled = false; button.textContent = previous; }
  }

  function exportarExcel() {
    if (!validarExportacion()) return;
    if (typeof XLSX === 'undefined') return mostrar('No se pudo cargar el generador de Excel. Verifica tu conexión e inténtalo de nuevo.', true);
    const button = $('btn-exportar-excel'); const previous = button.textContent; button.disabled = true; button.textContent = 'Generando Excel…';
    try {
      const data = [['REPORTE DE INVENTARIO'], [`Empresa: ${state.empresa.nombre}`], [`Identificación: ${state.empresa.identificacion}`], [`Fecha y hora del reporte: ${generarFecha()}`], [`Filtros aplicados: ${filtrosTexto()}`], [], ['Tipo', 'Producto o servicio', 'Código', 'Unidad', 'Precio unitario', 'Estado', 'Stock total'], ...state.rows.map((item) => [tipo(item.tipo), item.nombre, item.codigo, unidad(item.unidad), item.precio, item.activo ? 'Activo' : 'Inactivo', item.stock]), ['TOTAL GENERAL DE EXISTENCIAS', '', '', '', '', '', totalStock()]];
      const worksheet = XLSX.utils.aoa_to_sheet(data); const headerRow = 7; const totalRow = data.length;
      worksheet['!merges'] = Array.from({ length: 5 }, (_, i) => ({ s: { r: i, c: 0 }, e: { r: i, c: 6 } }));
      worksheet['!cols'] = [{ wch: 16 }, { wch: 42 }, { wch: 16 }, { wch: 16 }, { wch: 18 }, { wch: 14 }, { wch: 14 }];
      worksheet['!autofilter'] = { ref: `A${headerRow}:G${totalRow - 1}` }; worksheet['!freeze'] = { xSplit: 0, ySplit: headerRow, topLeftCell: `A${headerRow + 1}`, activePane: 'bottomLeft', state: 'frozen' };
      const style = (row, fill, color = '000000') => { for (let col = 0; col < 7; col++) { const ref = XLSX.utils.encode_cell({ r: row - 1, c: col }); if (!worksheet[ref]) worksheet[ref] = { t: 's', v: '' }; worksheet[ref].s = { fill: { patternType: 'solid', fgColor: { rgb: fill } }, font: { bold: true, color: { rgb: color }, name: 'Arial' }, alignment: { horizontal: row === headerRow || row === 1 ? 'center' : 'left', vertical: 'center' }, border: { top: { style: 'thin', color: { rgb: '1F1F1F' } }, bottom: { style: 'thin', color: { rgb: '1F1F1F' } }, left: { style: 'thin', color: { rgb: '1F1F1F' } }, right: { style: 'thin', color: { rgb: '1F1F1F' } } } }; } };
      style(1, 'C4D79B'); for (let row = 2; row <= 5; row++) style(row, 'EAF1DD'); style(headerRow, '77933C', 'FFFFFF'); style(totalRow, 'DCEFEA');
      for (let row = headerRow + 1; row < totalRow; row++) { const price = XLSX.utils.encode_cell({ r: row - 1, c: 4 }); if (worksheet[price]) worksheet[price].z = '$#,##0'; }
      const workbook = XLSX.utils.book_new(); workbook.Props = { Title: 'Reporte de inventario', Author: 'AMC Facturación Electrónica y POS' }; XLSX.utils.book_append_sheet(workbook, worksheet, 'Inventario'); XLSX.writeFile(workbook, `Reporte-inventario-${archivoSeguro(new Date().toISOString().slice(0, 10))}.xlsx`, { cellStyles: true });
    } catch (error) { console.error('Error al exportar Excel:', error); mostrar('No fue posible generar el archivo Excel. Inténtalo nuevamente.', true); }
    finally { button.disabled = false; button.textContent = previous; }
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

  const GESTIONAR_PROD_KEY = `amc_producto_gestionar_v1_${activeUserCode}`;

  $('buscar-producto').addEventListener('input', render);
  ['filtro-tipo', 'filtro-estado', 'filtro-stock'].forEach((id) => $(id).addEventListener('change', render));
  $('btn-consultar').addEventListener('click', () => { render(); mostrar(state.rows.length ? `${state.rows.length} producto(s) o servicio(s) encontrados.` : 'No se encontraron productos o servicios con los filtros seleccionados.'); });
  $('btn-limpiar').addEventListener('click', () => { $('buscar-producto').value = ''; $('filtro-tipo').value = ''; $('filtro-estado').value = ''; $('filtro-stock').value = ''; render(); mostrar('Filtros limpiados.'); });
  $('btn-exportar-pdf').addEventListener('click', exportarPdf);
  $('btn-exportar-excel').addEventListener('click', exportarExcel);
  $('inventory-list').addEventListener('click', (event) => {
    const toggle = event.target.closest('[data-toggle]');
    if (toggle) return cambiarEstado(toggle.dataset.toggle);
    
    const manageBtn = event.target.closest('[data-manage]');
    if (manageBtn) {
      const prodId = manageBtn.dataset.manage;
      const item = state.productos.find((p) => String(p.id) === String(prodId));
      if (item) {
        sessionStorage.setItem(GESTIONAR_PROD_KEY, JSON.stringify(item));
      }
      window.location.href = `gestionar-inventario.html?id=${encodeURIComponent(prodId)}`;
    }
  });
  Promise.all([cargarProductos(), cargarEmpresa()]).then(render);
});
