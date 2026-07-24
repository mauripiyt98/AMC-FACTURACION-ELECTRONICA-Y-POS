'use strict';

window.addEventListener('load', () => {
  const activeUserCode = sessionStorage.getItem('amc_active_user_code') || '1110591592';
  const isDev = activeUserCode === '1110591592';
  const previewKey = isDev ? 'amc_nomina_preview_v1' : `amc_nomina_preview_v1_${activeUserCode}`;
  const $ = (id) => document.getElementById(id);
  let nomina;
  try { nomina = JSON.parse(sessionStorage.getItem(previewKey) || 'null'); } catch { nomina = null; }
  if (!nomina) { window.location.replace('nominas-generadas.html'); return; }

  function moneda(valor) { return `$ ${Math.round(Number(valor) || 0).toLocaleString('es-CO')}`; }
  function fecha(valor) { return new Date(valor).toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'long', timeStyle: 'medium' }); }
  function perfil() {
    try { return JSON.parse(localStorage.getItem(`amc_perfil_emisor_v1_${activeUserCode}`) || 'null'); } catch { return null; }
  }
  const empresa = perfil() || { razonSocial: isDev ? 'ANDRES MAURICIO CAMPOS FIERRO' : 'Mi Empresa', nit: isDev ? '1.110.591.592-3' : '—', ciudad: 'Colombia', direccion: '', email: '', telefono: '' };
  const empleado = nomina.empleado || {};
  $('numero-nomina').textContent = nomina.numeroNomina || `NE${String(nomina.consecutivo).padStart(3, '0')}`;
  $('fecha-generacion').textContent = fecha(nomina.generadoEn);
  $('empresa-nombre').textContent = empresa.razonSocial || 'Mi Empresa';
  $('empresa-nit').textContent = `NIT: ${empresa.nit || '—'}`;
  $('empresa-direccion').textContent = `Dirección: ${empresa.direccion || empresa.ciudad || '—'}`;
  $('empresa-contacto').textContent = [empresa.telefono, empresa.email].filter(Boolean).join(' · ') || 'Contacto: —';
  $('empleado-nombre').textContent = empleado.nombre || '—';
  $('empleado-documento').textContent = `Documento: ${empleado.documento || '—'}`;
  $('empleado-cargo').textContent = `Cargo: ${empleado.cargo || '—'}`;
  $('empleado-cuenta').textContent = `Cuenta bancaria: ${empleado.cuenta || '—'}`;
  $('devengados-body').innerHTML = `<tr class="seccion"><td colspan="2">Devengados</td></tr><tr><td>Salario base</td><td class="num">${moneda(nomina.salario)}</td></tr><tr><td>Auxilio de transporte</td><td class="num">${moneda(nomina.auxilio)}</td></tr><tr><td>Bonificaciones</td><td class="num">${moneda(nomina.bonificaciones)}</td></tr>`;
  $('deducciones-body').innerHTML = `<tr class="seccion"><td colspan="2">Deducciones</td></tr><tr><td>Salud (4%)</td><td class="num">${moneda(nomina.salud)}</td></tr><tr><td>Pensión (4%)</td><td class="num">${moneda(nomina.pension)}</td></tr><tr><td>Fondo de Solidaridad Pensional</td><td class="num">${moneda(nomina.fsp)}</td></tr>`;
  $('neto-pagar').textContent = moneda(nomina.neto);
  $('cude').textContent = nomina.cude || 'CUDE no disponible';
  const qrValue = `AMC|NOMINA|${nomina.numeroNomina}|${nomina.cude}|${nomina.neto}`;
  if (typeof QRCode !== 'undefined') QRCode.toCanvas($('qr-canvas'), qrValue, { width: 112, margin: 1 });
  $('btn-pdf').addEventListener('click', () => {
    if (typeof html2pdf === 'undefined') { window.print(); return; }
    const button = $('btn-pdf'); button.disabled = true; button.textContent = 'Generando PDF…';
    html2pdf().set({ margin: 7, filename: `Nomina-${nomina.numeroNomina}.pdf`, image: { type: 'jpeg', quality: .98 }, html2canvas: { scale: 2, useCORS: true }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' } }).from($('documento-nomina')).save().finally(() => { button.disabled = false; button.textContent = 'Descargar PDF'; });
  });
});
