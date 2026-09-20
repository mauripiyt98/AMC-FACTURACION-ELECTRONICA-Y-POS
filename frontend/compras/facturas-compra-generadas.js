'use strict';

document.addEventListener('DOMContentLoaded', () => {
  const activeUserCode = sessionStorage.getItem('amc_active_user_code') || '1110591592';
  const KEY = `amc_facturas_compra_db_v1_${activeUserCode}`;
  const DOCUMENT_KEY = 'amc_factura_compra_documento_actual_v1';
  const $ = id => document.getElementById(id);
  const money = value => '$ ' + Math.round(Number(value) || 0).toLocaleString('es-CO');
  const escapeHtml = value => { const el = document.createElement('div'); el.textContent = String(value ?? ''); return el.innerHTML; };
  const compras = () => { try { const items = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(items) ? items : []; } catch { return []; } };

  function abrirDocumento(compra, descargarPdf = false) {
    sessionStorage.setItem(DOCUMENT_KEY, JSON.stringify(compra));
    const destino = `factura-compra-documento.html${descargarPdf ? '?descargarPdf=1' : ''}`;
    if (descargarPdf) window.open(destino, '_blank');
    else window.location.href = destino;
  }

  function render() {
    const all = compras().sort((a, b) => new Date(b.generadoEn) - new Date(a.generadoEn));
    const q = $('buscar').value.trim().toLowerCase();
    const filtered = all.filter(compra => `${compra.numeroCompra} ${compra.numeroProveedor} ${compra.tercero?.nombre} ${compra.tercero?.documento}`.toLowerCase().includes(q));
    const total = all.reduce((sum, compra) => sum + (compra.totales?.total || 0), 0);
    const inventario = all.reduce((sum, compra) => sum + (compra.lineas || []).filter(linea => linea.destino === 'INVENTARIO').reduce((lineTotal, linea) => lineTotal + (linea.total || 0), 0), 0);
    $('stat-total').textContent = all.length;
    $('stat-inventario').textContent = money(inventario);
    $('stat-gastos').textContent = money(total - inventario);
    $('stat-total-pagar').textContent = money(total);
    $('compras-body').innerHTML = filtered.map(compra => `<tr>
      <td><strong>${escapeHtml(compra.numeroCompra)}</strong></td>
      <td>${escapeHtml(compra.numeroProveedor)}</td>
      <td>${escapeHtml(compra.fecha)}</td>
      <td>${escapeHtml(compra.tercero?.nombre || '—')}<br><small>${escapeHtml(compra.tercero?.email || '')}</small></td>
      <td>${escapeHtml(compra.tercero?.documento || '—')}</td>
      <td>${(compra.lineas || []).length}</td>
      <td class="num">${money(compra.totales?.total)}</td>
      <td>${escapeHtml(compra.estado || 'REGISTRADA')}</td>
      <td><div class="purchase-actions"><button type="button" class="btn-view" data-view-id="${escapeHtml(compra.id)}">Ver</button><button type="button" class="btn-download" data-pdf-id="${escapeHtml(compra.id)}">Descargar PDF</button></div></td>
    </tr>`).join('');
    $('empty').textContent = all.length ? (filtered.length ? '' : 'No hay compras que coincidan con la búsqueda.') : 'Aún no hay facturas de compra registradas.';
    $('compras-body').querySelectorAll('[data-view-id]').forEach(button => button.addEventListener('click', () => {
      const compra = all.find(item => String(item.id) === String(button.dataset.viewId));
      if (compra) abrirDocumento(compra);
    }));
    $('compras-body').querySelectorAll('[data-pdf-id]').forEach(button => button.addEventListener('click', () => {
      const compra = all.find(item => String(item.id) === String(button.dataset.pdfId));
      if (compra) abrirDocumento(compra, true);
    }));
  }

  $('buscar').addEventListener('input', render);
  render();
});
