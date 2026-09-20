'use strict';

document.addEventListener('DOMContentLoaded', () => {
  const DOCUMENT_KEY = 'amc_factura_compra_documento_actual_v1';
  const $ = id => document.getElementById(id);
  const money = value => '$ ' + Math.round(Number(value) || 0).toLocaleString('es-CO');
  const escapeHtml = value => { const el = document.createElement('div'); el.textContent = String(value ?? ''); return el.innerHTML; };
  const safeFileName = value => String(value || 'factura-compra').replace(/[^a-zA-Z0-9_-]/g, '_');
  const formatDate = value => { if (!value) return '—'; const date = new Date(`${value}T12:00:00`); return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('es-CO'); };
  const formatDateTime = value => { if (!value) return '—'; const date = new Date(value); return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }); };
  let compra;

  try { compra = JSON.parse(sessionStorage.getItem(DOCUMENT_KEY) || 'null'); } catch { compra = null; }
  if (!compra) { window.location.replace('facturas-compra-generadas.html'); return; }

  function render() {
    const tercero = compra.tercero || {};
    const totals = compra.totales || {};
    $('doc-numero').textContent = compra.numeroCompra || 'Factura de compra';
    $('doc-fecha').textContent = `Fecha: ${formatDate(compra.fecha)}`;
    $('doc-tercero-nombre').textContent = tercero.nombre || '—';
    $('doc-tercero-documento').textContent = tercero.documento || '—';
    $('doc-tercero-email').textContent = tercero.email || '—';
    $('doc-numero-proveedor').textContent = compra.numeroProveedor || '—';
    $('doc-estado').textContent = compra.estado || 'REGISTRADA';
    $('doc-generada').textContent = formatDateTime(compra.generadoEn);
    $('doc-observaciones').textContent = compra.observaciones || 'Sin observaciones.';
    $('doc-lineas').innerHTML = (compra.lineas || []).map((linea, index) => `<tr><td>${index + 1}</td><td>${escapeHtml(linea.destino || '—')}</td><td>${escapeHtml(linea.productoCodigo || '—')}</td><td>${escapeHtml(linea.productoNombre || linea.detalle || '—')}</td><td class="num">${Number(linea.cantidad || 0).toLocaleString('es-CO')}</td><td class="num">${money(linea.unitario)}</td><td class="num">${Number(linea.descuento || 0)}%</td><td class="num">${Number(linea.iva || 0)}%</td><td class="num">${Number(linea.retencion || 0)}%</td><td class="num">${money(linea.total)}</td></tr>`).join('') || '<tr><td colspan="10" class="document-empty">No hay líneas registradas.</td></tr>';
    $('doc-subtotal').textContent = money(totals.base);
    $('doc-descuento').textContent = money(totals.descuento);
    $('doc-iva').textContent = money(totals.iva);
    $('doc-retencion').textContent = money(totals.retencion);
    $('doc-total').textContent = money(totals.total);
  }

  async function descargarPdf() {
    const button = $('btn-descargar-pdf');
    const previous = button.textContent;
    if (typeof html2pdf === 'undefined') { window.print(); return; }
    button.disabled = true;
    button.textContent = 'Generando PDF…';
    try {
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      await html2pdf().set({ margin: [7, 7, 7, 7], filename: `${safeFileName(compra.numeroCompra)}-Factura-de-compra.pdf`, image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2, backgroundColor: '#ffffff' }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }, pagebreak: { mode: ['css', 'legacy'] } }).from($('factura-compra-documento')).save();
    } catch (error) {
      console.error('No fue posible generar el PDF de la factura de compra.', error);
      window.alert('No fue posible generar el PDF. Inténtalo nuevamente.');
    } finally {
      button.disabled = false;
      button.textContent = previous;
    }
  }

  render();
  $('btn-descargar-pdf').addEventListener('click', descargarPdf);
  if (new URLSearchParams(window.location.search).get('descargarPdf') === '1') window.setTimeout(descargarPdf, 350);
});
