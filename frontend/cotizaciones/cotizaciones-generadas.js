/**
 * cotizaciones-generadas.js — Listado y gestión de cotizaciones
 *
 * Funcionalidades:
 * - Listar cotizaciones desde API o LocalStorage
 * - Descargar PDF directo al ordenador (sin CUFE ni QR)
 * - Convertir a Factura Electrónica con modal de reconfirmación y generación automática
 */
'use strict';

document.addEventListener("DOMContentLoaded", () => {
  const SESSION_KEY = 'amc_session_v2';
  const COTIZACIONES_DB_KEY = `amc_cotizaciones_generadas_db_v1_${activeUserCode}`;
  const FACTURAS_DB_KEY = `amc_facturas_generadas_db_v1_${activeUserCode}`;
  const PROFILE_KEY = `amc_perfil_emisor_v1_${activeUserCode}`;

  const RANGO_COTIZACION = {
    prefijo: "COTZ",
    desde: 1,
    hasta: 1000
  };

  const RESOLUCION_FACTURACION_DEMO = {
    prefijo: "FE",
    desde: 1,
    hasta: 1000,
    numeroResolucion: "18760000001",
  };

  const $ = (id) => document.getElementById(id);

  function getToken() {
    try {
      const s = JSON.parse(sessionStorage.getItem(SESSION_KEY) || '{}');
      return s.token || null;
    } catch { return null; }
  }

  const token = getToken();
  const useApi = !!token;
  const API_BASE = 'http://localhost:3000/api';

  let cotizacionesGlobal = [];
  let cotizacionAConvertir = null;

  // Cargar perfil emisor
  let emisorData = null;
  try {
    const rawP = localStorage.getItem(PROFILE_KEY);
    if (rawP) emisorData = JSON.parse(rawP);
  } catch (e) {}

  const EMISOR = emisorData || {
    razonSocial: isDev ? "ANDRES MAURICIO CAMPOS FIERRO" : "Mi Empresa",
    nit: isDev ? "1.110.591.592-3" : "—",
    direccion: isDev ? "Colombia" : "",
    ciudad: isDev ? "Bogotá" : "",
    email: isDev ? "dev@amc.com" : "",
  };

  async function apiFetch(endpoint, options = {}) {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
    if (res.status === 401) {
      sessionStorage.clear();
      window.location.replace('../login.html');
      throw new Error('Sesión expirada');
    }
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || `Error ${res.status}`);
    return data;
  }

  function formatoMoneda(valor) {
    const n = Number(valor) || 0;
    return "$ " + Math.round(n).toLocaleString("es-CO", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  function normalizar(s) {
    return String(s || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  function escapeHtml(text) {
    const d = document.createElement("div");
    d.textContent = String(text || "");
    return d.innerHTML;
  }

  function fechaHoraColombia(value) {
    const date = value ? new Date(value) : new Date();
    return date.toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "medium", timeStyle: "short" });
  }

  function construirNumeroCotizacion(consecutivo) {
    return RANGO_COTIZACION.prefijo + "-" + String(consecutivo).padStart(4, "0");
  }

  function construirNumeroFactura(consecutivo) {
    return RESOLUCION_FACTURACION_DEMO.prefijo + "-" + String(consecutivo).padStart(4, "0");
  }

  function mostrarAlerta(msg, tipo = "success") {
    const el = $("alerta-global");
    if (el) {
      el.innerHTML = `<div class="alert alert-${tipo}" style="padding:12px 16px;border-radius:8px;margin-bottom:14px;background:${tipo === 'success' ? '#e8faff;color:#0032c8;border:1px solid #a9e9f7;' : '#fff0f4;color:#d94d6a;border:1px solid #f8b8c6;'}">${msg}</div>`;
      setTimeout(() => { el.innerHTML = ""; }, 5000);
    }
  }

  // Comprobar si viene de crear una cotización
  const params = new URLSearchParams(window.location.search);
  if (params.get("creada")) {
    mostrarAlerta(`✅ Cotización <strong>${escapeHtml(params.get("creada"))}</strong> generada con éxito.`);
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  // ── Carga de Cotizaciones ──────────────────────────────────────────────────
  async function cargarCotizaciones() {
    if (useApi) {
      try {
        const data = await apiFetch('/cotizaciones?limit=500');
        return (data.cotizaciones || []).map(c => ({
          id: c.id,
          consecutivo: c.consecutivo,
          numeroCotizacion: c.numero_cotizacion,
          generadoEn: c.generado_en || c.creado_en,
          cliente: {
            nombre: c.cliente_nombre,
            documento: c.cliente_documento,
            email: c.cliente_email,
            telefono: c.cliente_telefono,
            direccion: c.cliente_direccion,
            ciudad: c.cliente_ciudad,
          },
          totales: {
            base: Number(c.total_base) || 0,
            iva: Number(c.total_iva) || 0,
            retencion: Number(c.total_retencion) || 0,
            total: Number(c.total_cotizacion) || 0,
          },
          observaciones: c.observaciones,
          lineas: c.lineas || [],
          estado: c.estado || 'GUARDADA'
        }));
      } catch (err) {
        console.warn("Error cargando cotizaciones del API, usando local", err);
      }
    }

    const raw = localStorage.getItem(COTIZACIONES_DB_KEY);
    if (!raw) return [];
    try {
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  async function cargarEstadisticas(cotizaciones) {
    if (useApi) {
      try {
        const data = await apiFetch('/cotizaciones/stats');
        const stats = data.stats || {};
        $("stat-generadas").textContent = String(stats.total_cotizaciones || 0);
        $("stat-convertidas").textContent = String(stats.facturadas || 0);
        const sig = stats.ultimo_consecutivo ? stats.ultimo_consecutivo + 1 : 1;
        $("stat-siguiente").textContent = sig <= 1000 ? construirNumeroCotizacion(sig) : "Rango agotado";
        return;
      } catch (e) {}
    }

    const total = cotizaciones.length;
    const facturadas = cotizaciones.filter(c => c.estado === 'FACTURADA').length;
    const usados = cotizaciones.map(c => Number(c.consecutivo)).filter(n => Number.isInteger(n) && n >= 1);
    const ultimo = usados.length ? Math.max(...usados) : 0;
    const siguiente = ultimo + 1;

    $("stat-generadas").textContent = String(total);
    $("stat-convertidas").textContent = String(facturadas);
    $("stat-siguiente").textContent = siguiente <= 1000 ? construirNumeroCotizacion(siguiente) : "Rango agotado";
  }

  function coincideBusqueda(cotz, q) {
    if (!q) return true;
    const cliente = cotz.cliente || {};
    const texto = [
      cotz.numeroCotizacion,
      cotz.consecutivo,
      cotz.generadoEn,
      cliente.nombre,
      cliente.documento,
      cliente.email,
    ].join(" ");
    return normalizar(texto).includes(q);
  }

  // ── Render Tabla ───────────────────────────────────────────────────────────
  async function renderCotizaciones() {
    const rawList = await cargarCotizaciones();
    cotizacionesGlobal = rawList.slice().sort((a, b) => {
      const da = a.generadoEn ? new Date(a.generadoEn).getTime() : 0;
      const db = b.generadoEn ? new Date(b.generadoEn).getTime() : 0;
      return db - da;
    });

    const q = normalizar($("buscar").value);
    const filtradas = cotizacionesGlobal.filter(c => coincideBusqueda(c, q));

    const body = $("cotizaciones-body");
    const empty = $("empty");

    await cargarEstadisticas(cotizacionesGlobal);

    if (!cotizacionesGlobal.length) {
      body.innerHTML = "";
      empty.style.display = "block";
      return;
    }

    empty.style.display = "none";

    if (!filtradas.length) {
      body.innerHTML = '<tr><td colspan="8" class="empty">No hay cotizaciones que coincidan con la búsqueda.</td></tr>';
      return;
    }

    body.innerHTML = filtradas.map((cotz) => {
      const cliente = cotz.cliente || {};
      const numero = cotz.numeroCotizacion || construirNumeroCotizacion(cotz.consecutivo || 0);
      const total = cotz.totales?.total || 0;
      const lineasCount = Array.isArray(cotz.lineas) ? cotz.lineas.length : 0;
      const estado = cotz.estado || 'GUARDADA';

      let estadoBadge = `<span class="badge-guardada">GUARDADA</span>`;
      if (estado === 'FACTURADA') {
        estadoBadge = `<span class="badge-facturada">FACTURADA</span>`;
      } else if (estado === 'ANULADA') {
        estadoBadge = `<span class="badge" style="background:#fee2e2;color:#b91c1c;">ANULADA</span>`;
      }

      const botonConvertir = estado === 'FACTURADA'
        ? `<button type="button" class="btn-convertir" disabled title="Esta cotización ya fue convertida a Factura Electrónica">✓ Facturada</button>`
        : `<button type="button" class="btn-convertir" data-action="convertir" data-id="${escapeHtml(cotz.id)}">⚡ Convertir a factura electrónica</button>`;

      return `
        <tr>
          <td>
            <strong>${escapeHtml(numero)}</strong><br>
            <span class="badge-cotz">Cons. ${escapeHtml(String(cotz.consecutivo || ''))}</span>
          </td>
          <td>${escapeHtml(fechaHoraColombia(cotz.generadoEn))}</td>
          <td>${escapeHtml(cliente.nombre || "-")}</td>
          <td>${escapeHtml(cliente.documento || "-")}</td>
          <td>${lineasCount} ítem(s)</td>
          <td class="num">${formatoMoneda(total)}</td>
          <td>${estadoBadge}</td>
          <td>
            <div class="acciones-col">
              <button type="button" class="btn-pdf" data-action="pdf" data-id="${escapeHtml(cotz.id)}">📥 Descargar PDF</button>
              ${botonConvertir}
            </div>
          </td>
        </tr>`;
    }).join("");

    // Asignar listeners
    body.querySelectorAll("button[data-action='pdf']").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id;
        const cotz = cotizacionesGlobal.find(c => String(c.id) === String(id));
        if (cotz) descargarPdfCotizacion(cotz, btn);
      });
    });

    body.querySelectorAll("button[data-action='convertir']").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id;
        const cotz = cotizacionesGlobal.find(c => String(c.id) === String(id));
        if (cotz) abrirModalConvertir(cotz);
      });
    });
  }

  // ── Generación de PDF Cotización ───────────────────────────────────────────
  async function descargarPdfCotizacion(cotz, boton) {
    const previousText = boton.textContent;
    boton.disabled = true;
    boton.textContent = "Generando PDF...";

    try {
      // Si usamos API y no tenemos líneas detalladas completas, obtener detalle
      let detalleCotz = cotz;
      if (useApi && (!cotz.lineas || !cotz.lineas.length || !cotz.lineas[0].valor_unitario)) {
        try {
          const res = await apiFetch(`/cotizaciones/${cotz.id}`);
          if (res.cotizacion) {
            detalleCotz = {
              ...cotz,
              ...res.cotizacion,
              lineas: res.cotizacion.lineas || []
            };
          }
        } catch (e) {}
      }

      // Población del template
      $("pdf-emisor-nombre").textContent = EMISOR.razonSocial;
      $("pdf-emisor-nit").textContent = "NIT: " + EMISOR.nit;
      $("pdf-emisor-dir").textContent = EMISOR.direccion || EMISOR.ciudad || "Colombia";
      $("pdf-emisor-email").textContent = EMISOR.email || "";

      $("pdf-numero").textContent = detalleCotz.numeroCotizacion || construirNumeroCotizacion(detalleCotz.consecutivo);
      $("pdf-fecha").textContent = "Fecha: " + fechaHoraColombia(detalleCotz.generadoEn);

      const cli = detalleCotz.cliente || {};
      $("pdf-cli-nombre").textContent = cli.nombre || "Cliente";
      $("pdf-cli-doc").textContent = cli.documento || "---";
      $("pdf-cli-dir").textContent = cli.direccion || "---";
      $("pdf-cli-ciudad").textContent = cli.ciudad || "---";
      $("pdf-cli-tel").textContent = cli.telefono || "---";
      $("pdf-cli-email").textContent = cli.email || "---";

      if (detalleCotz.observaciones && detalleCotz.observaciones.trim()) {
        $("pdf-obs").textContent = detalleCotz.observaciones;
        $("pdf-obs-container").style.display = "block";
      } else {
        $("pdf-obs-container").style.display = "none";
      }

      const lineas = detalleCotz.lineas || [];
      const tbody = $("pdf-lineas-body");
      if (lineas.length > 0) {
        tbody.innerHTML = lineas.map((l, i) => {
          const cant = Number(l.cantidad) || 0;
          const vUnit = Number(l.valor_unitario || l.unitario) || 0;
          const iva = Number(l.tarifa_iva || l.tarifaIva) || 0;
          const tot = Number(l.total) || (cant * vUnit * (1 + iva / 100));
          return `
            <tr>
              <td>${i + 1}</td>
              <td>${escapeHtml(l.codigo || "—")}</td>
              <td><strong>${escapeHtml(l.nombre || l.producto || "")}</strong></td>
              <td>${escapeHtml(l.unidad_medida || l.unidad || "UNIDAD")}</td>
              <td style="text-align:right;">${cant}</td>
              <td style="text-align:right;">${formatoMoneda(vUnit)}</td>
              <td style="text-align:right;">${iva}%</td>
              <td style="text-align:right;"><strong>${formatoMoneda(tot)}</strong></td>
            </tr>`;
        }).join("");
      } else {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:10px;">Propuesta comercial detallada</td></tr>`;
      }

      const tot = detalleCotz.totales || {};
      $("pdf-subtotal").textContent = formatoMoneda(tot.base || 0);
      $("pdf-iva").textContent = formatoMoneda(tot.iva || 0);
      if (tot.retencion && tot.retencion > 0) {
        $("pdf-retencion").textContent = formatoMoneda(tot.retencion);
        $("pdf-row-rete").style.display = "flex";
      } else {
        $("pdf-row-rete").style.display = "none";
      }
      $("pdf-total").textContent = formatoMoneda(tot.total || 0);

      const elemento = $("pdf-cotizacion-document");
      const filename = `Cotizacion-${detalleCotz.numeroCotizacion || 'COTZ'}-${(cli.nombre || 'cliente').replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;

      if (typeof html2pdf === "undefined") {
        window.print();
        return;
      }

      const opt = {
        margin: [8, 8, 8, 8],
        filename: filename,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" }
      };

      await html2pdf().set(opt).from(elemento).save();
      mostrarAlerta(`✅ PDF de <strong>${escapeHtml(detalleCotz.numeroCotizacion)}</strong> descargado correctamente.`);

    } catch (err) {
      console.error("Error al exportar PDF:", err);
      mostrarAlerta("No fue posible generar el PDF. Inténtalo de nuevo.", "error");
    } finally {
      boton.disabled = false;
      boton.textContent = previousText;
    }
  }

  // ── Modal y Conversión a Factura Electrónica ────────────────────────────────
  function abrirModalConvertir(cotz) {
    cotizacionAConvertir = cotz;
    $("modal-cotz-num").textContent = cotz.numeroCotizacion || construirNumeroCotizacion(cotz.consecutivo);
    $("modal-confirmar").classList.add("active");
  }

  function cerrarModal() {
    cotizacionAConvertir = null;
    $("modal-confirmar").classList.remove("active");
  }

  $("btn-modal-cancelar").addEventListener("click", cerrarModal);

  $("btn-modal-confirmar").addEventListener("click", async () => {
    if (!cotizacionAConvertir) return;
    const cotz = cotizacionAConvertir;
    const btn = $("btn-modal-confirmar");
    const prevText = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Convirtiendo...";

    try {
      if (useApi) {
        // Modo API
        const res = await apiFetch(`/cotizaciones/${cotz.id}/convertir`, {
          method: 'POST'
        });
        cerrarModal();
        // Redirigir directamente al módulo de facturas generadas
        window.location.href = `../facturas-generadas/facturas-generadas.html?convertida=${encodeURIComponent(res.factura?.numero_factura || 'FE')}`;
        return;
      }

      // Modo Local (Fallback)
      const rawFacturas = localStorage.getItem(FACTURAS_DB_KEY);
      let facturas = [];
      try { facturas = JSON.parse(rawFacturas) || []; } catch (e) { facturas = []; }

      const feFacturas = facturas.filter(f => (f.tipo || 'FE') === 'FE');
      const usados = feFacturas.map(f => Number(f.consecutivo)).filter(n => Number.isInteger(n) && n >= 1);
      const ultimo = usados.length ? Math.max(...usados) : 0;
      const consecutivoFactura = ultimo + 1;

      if (consecutivoFactura > RESOLUCION_FACTURACION_DEMO.hasta) {
        throw new Error("El rango de Facturación Electrónica está agotado.");
      }

      const numeroFactura = construirNumeroFactura(consecutivoFactura);
      
      // Generar CUFE demo
      const baseCufe = ['FE', String(consecutivoFactura).padStart(4, '0'), Date.now(), Math.round(cotz.totales?.total || 0)].join('-');
      let cufeDemo = '';
      for (let i = 0; i < baseCufe.length; i++) cufeDemo += baseCufe.charCodeAt(i).toString(16).toUpperCase().padStart(2, '0');
      cufeDemo = (cufeDemo + '0'.repeat(96)).slice(0, 96);

      const nuevaFactura = {
        id: "FAC-" + Date.now().toString(36).toUpperCase() + "-" + Math.random().toString(36).slice(2, 8).toUpperCase(),
        tipo: 'FE',
        consecutivo: consecutivoFactura,
        numeroFactura: numeroFactura,
        cufe: cufeDemo,
        resolucion: RESOLUCION_FACTURACION_DEMO,
        cliente: cotz.cliente,
        tercero: cotz.tercero,
        lineas: cotz.lineas,
        totales: cotz.totales,
        medioPago: "EFECTIVO",
        medioPagoLabel: "Efectivo",
        observaciones: `Generada automáticamente desde cotización ${cotz.numeroCotizacion}. ${cotz.observaciones || ''}`.trim(),
        estado: 'GUARDADA',
        generadoEn: new Date().toISOString()
      };

      facturas.push(nuevaFactura);
      localStorage.setItem(FACTURAS_DB_KEY, JSON.stringify(facturas));

      // Actualizar estado de la cotización a FACTURADA
      const rawCotz = localStorage.getItem(COTIZACIONES_DB_KEY);
      let cotizaciones = [];
      try { cotizaciones = JSON.parse(rawCotz) || []; } catch (e) { cotizaciones = []; }
      
      const idx = cotizaciones.findIndex(c => String(c.id) === String(cotz.id));
      if (idx >= 0) {
        cotizaciones[idx].estado = 'FACTURADA';
        localStorage.setItem(COTIZACIONES_DB_KEY, JSON.stringify(cotizaciones));
      }

      cerrarModal();
      window.location.href = `../facturas-generadas/facturas-generadas.html?convertida=${encodeURIComponent(numeroFactura)}`;

    } catch (err) {
      alert("Error al convertir cotización: " + err.message);
      btn.disabled = false;
      btn.textContent = prevText;
    }
  });

  $("buscar").addEventListener("input", renderCotizaciones);
  renderCotizaciones();
});
