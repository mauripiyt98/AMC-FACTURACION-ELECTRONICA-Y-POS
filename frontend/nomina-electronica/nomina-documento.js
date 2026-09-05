'use strict';

window.addEventListener('load', () => {
  const activeUserCode = sessionStorage.getItem('amc_active_user_code') || '1110591592';
  const isDev = activeUserCode === '1110591592';
  const previewKey = isDev ? 'amc_nomina_preview_v1' : `amc_nomina_preview_v1_${activeUserCode}`;
  const dbKey = isDev ? 'amc_nominas_generadas_db_v1' : `amc_nominas_generadas_db_v1_${activeUserCode}`;
  const $ = (id) => document.getElementById(id);

  let nomina = null;
  try {
    nomina = JSON.parse(sessionStorage.getItem(previewKey) || 'null');
  } catch {
    nomina = null;
  }

  // Fallback: Si no está en previewKey, buscar por parámetro id en localStorage
  if (!nomina) {
    const params = new URLSearchParams(window.location.search);
    const idParam = params.get('id');
    if (idParam) {
      try {
        const db = JSON.parse(localStorage.getItem(dbKey) || '[]');
        nomina = db.find((n) => String(n.id) === String(idParam)) || null;
      } catch {
        nomina = null;
      }
    }
  }

  if (!nomina) {
    window.location.replace('nominas-generadas.html');
    return;
  }

  function moneda(valor) {
    return `$ ${Math.round(Number(valor) || 0).toLocaleString('es-CO')}`;
  }

  function fecha(valor) {
    return new Date(valor || Date.now()).toLocaleString('es-CO', {
      timeZone: 'America/Bogota',
      dateStyle: 'long',
      timeStyle: 'medium',
    });
  }

  function perfil() {
    try {
      return JSON.parse(localStorage.getItem(`amc_perfil_emisor_v1_${activeUserCode}`) || 'null');
    } catch {
      return null;
    }
  }

  const emisorGuardado = perfil();
  const empresa = emisorGuardado || {
    razonSocial: isDev ? 'ANDRES MAURICIO CAMPOS FIERRO' : 'Mi Empresa',
    nit: isDev ? '1.110.591.592-3' : '—',
    ciudad: 'Colombia',
    direccion: '',
    email: isDev ? 'dev@amc.com' : '',
    telefono: '',
    logo: ''
  };

  // Logo emisor
  const logoEl = $('logo-emisor');
  if (logoEl) {
    const logoSrc = empresa.logo || (isDev ? '../../assets/logo.png' : '');
    if (logoSrc) {
      logoEl.src = logoSrc;
      logoEl.style.display = 'block';
    } else {
      logoEl.style.display = 'none';
    }
  }

  const empleado = nomina.empleado || {};
  const numNominaTexto = nomina.numeroNomina || `NE${String(nomina.consecutivo || 1).padStart(3, '0')}`;

  $('numero-nomina').textContent = numNominaTexto;
  $('fecha-generacion').textContent = fecha(nomina.generadoEn);
  $('empresa-nombre').textContent = empresa.razonSocial || 'Mi Empresa';
  $('empresa-nit').textContent = `NIT: ${empresa.nit || '—'}`;
  $('empresa-direccion').textContent = `Dirección: ${empresa.direccion || empresa.ciudad || 'Colombia'}`;
  $('empresa-contacto').textContent = [empresa.telefono, empresa.email].filter(Boolean).join(' · ') || 'Contacto: —';

  $('empleado-nombre').textContent = empleado.nombre || '—';
  $('empleado-documento').textContent = `Documento: ${empleado.documento || '—'}`;
  $('empleado-cargo').textContent = `Cargo: ${empleado.cargo || '—'}`;
  $('empleado-cuenta').textContent = `Cuenta bancaria: ${empleado.cuenta || '—'}`;

  // Período de nómina
  const periodo = nomina.periodo || {};
  const periodoTexto = (periodo.mesLabel && periodo.anio)
    ? `${periodo.mesLabel} ${periodo.anio}`
    : (periodo.mes && periodo.anio ? `${periodo.mes} ${periodo.anio}` : '—');

  const periodoEl = $('periodo-nomina');
  if (periodoEl) periodoEl.textContent = periodoTexto;
  const periodoDoc = $('empleado-periodo-doc');
  if (periodoDoc) periodoDoc.textContent = `Período de nómina: ${periodoTexto}`;

  // Desglose de liquidación
  $('devengados-body').innerHTML = `
    <tr class="seccion"><td colspan="2">Devengados</td></tr>
    <tr><td>Salario base</td><td class="num">${moneda(nomina.salario)}</td></tr>
    <tr><td>Auxilio de transporte</td><td class="num">${moneda(nomina.auxilio)}</td></tr>
    <tr><td>Bonificaciones</td><td class="num">${moneda(nomina.bonificaciones)}</td></tr>
  `;

  $('deducciones-body').innerHTML = `
    <tr class="seccion"><td colspan="2">Deducciones</td></tr>
    <tr><td>Salud (4%)</td><td class="num">${moneda(nomina.salud)}</td></tr>
    <tr><td>Pensión (4%)</td><td class="num">${moneda(nomina.pension)}</td></tr>
    <tr><td>Fondo de Solidaridad Pensional</td><td class="num">${moneda(nomina.fsp)}</td></tr>
  `;

  $('neto-pagar').textContent = moneda(nomina.neto);
  $('cude').textContent = nomina.cude || 'CUDE no disponible';

  // Código QR
  const qrCanvas = $('qr-canvas-nomina');
  const qrImg = $('qr-imagen-nomina');
  const qrData = `NumDoc:${numNominaTexto}\nCUDE:${nomina.cude || ''}\nFecGen:${nomina.generadoEn || ''}\nValTot:${nomina.neto || 0}\nNitEmisor:${empresa.nit || ''}\nDocEmp:${empleado.documento || ''}`;

  if (qrCanvas && typeof QRCode !== 'undefined' && QRCode.toCanvas) {
    QRCode.toCanvas(qrCanvas, qrData, { width: 112, margin: 1 }, (err) => {
      if (err) {
        console.warn('Error al generar QR en canvas:', err);
        if (qrCanvas) qrCanvas.style.display = 'none';
        if (qrImg) qrImg.style.display = 'block';
      } else {
        if (qrCanvas) qrCanvas.style.display = 'block';
        if (qrImg) qrImg.style.display = 'none';
      }
    });
  } else {
    if (qrCanvas) qrCanvas.style.display = 'none';
    if (qrImg) qrImg.style.display = 'block';
  }

  // ── Descarga de PDF ────────────────────────────────────────────────────────
  function descargarPdf() {
    const elemento = document.getElementById('documento-nomina');
    if (!elemento) {
      console.error('No se encontró el documento de nómina para exportar.');
      return;
    }

    const btnPdf = $('btn-pdf');
    const prevText = btnPdf ? btnPdf.textContent : 'Descargar PDF';
    if (btnPdf) {
      btnPdf.disabled = true;
      btnPdf.textContent = 'Generando PDF…';
    }

    const numero = ($('numero-nomina')?.textContent || numNominaTexto).replace(/^#/, '').replace(/\s/g, '-');
    const docEmpleado = (empleado.documento || '').replace(/[^\dA-Za-z-]/g, '').slice(0, 20);
    const nomEmpleado = (empleado.nombre || '').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 25);
    const filename = `Nomina-${numero}${docEmpleado ? '-' + docEmpleado : (nomEmpleado ? '-' + nomEmpleado : '')}.pdf`;

    if (typeof html2pdf === 'undefined') {
      if (btnPdf) {
        btnPdf.disabled = false;
        btnPdf.textContent = prevText;
      }
      window.print();
      return;
    }

    const opt = {
      margin: [8, 8, 8, 8],
      filename: filename,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, allowTaint: true, logging: false },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(elemento).save()
      .then(() => {
        if (btnPdf) {
          btnPdf.disabled = false;
          btnPdf.textContent = prevText;
        }
      })
      .catch((err) => {
        console.error('Error al generar PDF con html2pdf:', err);
        if (btnPdf) {
          btnPdf.disabled = false;
          btnPdf.textContent = prevText;
        }
        window.print();
      });
  }

  $('btn-pdf').addEventListener('click', descargarPdf);
});

