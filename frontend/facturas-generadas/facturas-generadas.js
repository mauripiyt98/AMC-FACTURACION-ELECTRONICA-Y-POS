/**
 * facturas-generadas.js — Listado de facturas emitidas
 *
 * MIGRACIÓN A BASE DE DATOS:
 * - Si hay sesión JWT activa: usa API REST (/api/facturas y /api/facturas/stats)
 * - Si no hay backend: usa localStorage (fallback modo offline)
 */
'use strict';

document.addEventListener("DOMContentLoaded", () => {

  // ── Sesión y Configuración ──────────────────────────────────────────────────
  const activeUserCode = sessionStorage.getItem("amc_active_user_code") || "1110591592";
  const SESSION_KEY = 'amc_session_v2';
  const STORAGE_KEY = `amc_factura_preview_v1_${activeUserCode}`;
  const FACTURAS_GENERADAS_DB_KEY = `amc_facturas_generadas_db_v1_${activeUserCode}`;

  const RESOLUCION_FACTURACION_DEMO = {
    prefijo: "FE",
    desde: 1,
    hasta: 1000,
    numeroResolucion: "18760000001",
    vigencia: "Demo académico",
  };

  const RESOLUCION_POS_DEMO = {
    prefijo: "POS",
    desde: 1,
    hasta: 1000,
    numeroResolucion: "18764111157293",
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

  // ── API Helper ──────────────────────────────────────────────────────────────
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

  // ── Funciones Base ─────────────────────────────────────────────────────────
  function normalizar(s) {
    return String(s || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  function escapeHtml(text) {
    const d = document.createElement("div");
    d.textContent = String(text || "");
    return d.innerHTML;
  }

  function formatoMoneda(valor) {
    const n = Number(valor) || 0;
    return "$ " + Math.round(n).toLocaleString("es-CO", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  function fechaHoraColombia(value) {
    const date = value ? new Date(value) : new Date();
    return date.toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "medium", timeStyle: "short" });
  }

  function construirNumeroFactura(consecutivo) {
    return RESOLUCION_FACTURACION_DEMO.prefijo + "-" + String(consecutivo).padStart(4, "0");
  }

  function construirNumeroPos(consecutivo) {
    return RESOLUCION_POS_DEMO.prefijo + "-" + String(consecutivo).padStart(3, "0");
  }

  function nombreArchivoSeguro(value) {
    return String(value || "factura").replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "") || "factura";
  }

  function normalizarFacturaApi(factura) {
    return {
      ...factura,
      tipo: factura.tipo || "FE",
      numeroFactura: factura.numeroFactura || factura.numero_factura,
      generadoEn: factura.generadoEn || factura.generado_en,
      cliente: factura.cliente || {
        nombre: factura.cliente_nombre,
        documento: factura.cliente_documento,
        email: factura.cliente_email,
      },
      emisor: factura.emisor || {},
      medioPago: factura.medioPago || factura.medio_pago,
      medioPagoLabel: factura.medioPagoLabel || factura.medio_pago,
      totales: factura.totales || {
        base: factura.total_base,
        iva: factura.total_iva,
        retencion: factura.total_retencion,
        total: factura.total_factura,
      },
      lineas: Array.isArray(factura.lineas) ? factura.lineas.map((linea) => ({
        ...linea,
        producto: linea.producto || linea.nombre,
        unitario: linea.unitario || linea.valor_unitario,
      })) : [],
    };
  }

  function detalleFacturaParaPdf(factura) {
    if (!useApi) return Promise.resolve(factura);
    return apiFetch(`/facturas/${encodeURIComponent(factura.id)}`).then((data) => normalizarFacturaApi(data.factura || factura));
  }

  function crearDocumentoPdf(factura) {
    const cliente = factura.cliente || {};
    const tipo = factura.tipo || "FE";
    const numero = factura.numeroFactura || (tipo === "POS"
      ? construirNumeroPos(factura.consecutivo || 0)
      : construirNumeroFactura(factura.consecutivo || 0));
    const totales = factura.totales || {};
    const lineas = Array.isArray(factura.lineas) ? factura.lineas : [];
    let perfil = {};
    try { perfil = JSON.parse(localStorage.getItem(`amc_perfil_emisor_v1_${activeUserCode}`) || "{}"); } catch { /* perfil no disponible */ }
    const emisor = { ...perfil, ...(factura.emisor || {}) };
    const rows = lineas.length ? lineas.map((linea, index) => `
      <tr><td>${index + 1}</td><td>${escapeHtml(linea.codigo || "—")}</td><td>${escapeHtml(linea.producto || linea.descripcion || "—")}</td><td>${escapeHtml(linea.unidad || linea.unidad_medida || "UNIDAD")}</td><td class="num">${escapeHtml(String(linea.cantidad || 0))}</td><td class="num">${formatoMoneda(linea.unitario || linea.precio || 0)}</td><td class="num">${formatoMoneda(linea.base || 0)}</td><td class="num">${escapeHtml(String(linea.tarifaIva || linea.tarifa_iva || 0))}%</td><td class="num">${formatoMoneda(linea.valorIva || linea.valor_iva || 0)}</td><td class="num">${formatoMoneda(linea.total || 0)}</td></tr>`).join("")
      : '<tr><td colspan="10">El detalle de líneas no está disponible para esta factura.</td></tr>';
    const stage = document.createElement("div");
    stage.className = "factura-pdf-stage pdf-export-stage";
    stage.innerHTML = `<article class="factura-doc">
      <div class="factura-banner">Representación gráfica — Factura electrónica de venta · Demostración académica DIAN Colombia</div>
      <div class="doc-inner"><header class="factura-header"><div class="emisor" style="margin-left:0"><span class="dian-badge">Documento de demostración</span><h2>${escapeHtml(emisor.razonSocial || "AMC Facturación Electrónica y POS")}</h2><p>NIT: ${escapeHtml(emisor.nit || activeUserCode)}</p><p>${escapeHtml(emisor.regimen || `${emisor.tipoPersona === "JURIDICA" ? "Persona Jurídica" : "Persona Natural"} — ${emisor.ciudad || "Colombia"}`)}</p><p>Resolución DIAN demo N° 18760000001 — Vigencia académica</p></div><div class="factura-meta"><p><strong>FACTURA ELECTRÓNICA DE VENTA</strong></p><p class="numero">${escapeHtml(numero)}</p><p>${escapeHtml(fechaHoraColombia(factura.generadoEn))}</p><p class="cufe">Estado: ${escapeHtml(factura.estado || "EMITIDA")}</p></div></header>
      <div class="factura-grid-2"><div class="info-block"><h4>Datos del emisor</h4><p><strong>${escapeHtml(emisor.razonSocial || "AMC Facturación Electrónica y POS")}</strong></p><p>NIT ${escapeHtml(emisor.nit || activeUserCode)}</p><p>${escapeHtml(emisor.direccion || emisor.ciudad || "Colombia")}</p><p>${escapeHtml(emisor.email || "")}</p></div><div class="info-block cliente-block"><h4>Datos del adquirente (cliente)</h4><p><strong>${escapeHtml(cliente.nombre || "—")}</strong></p><p><span class="lbl">Documento / NIT:</span> ${escapeHtml(cliente.documento || "—")}</p><p><span class="lbl">Email:</span> ${escapeHtml(cliente.email || "—")}</p><p><span class="lbl">Medio de pago:</span> ${escapeHtml(factura.medioPagoLabel || factura.medioPago || "—")}</p></div></div>
      <table class="factura-table"><thead><tr><th>#</th><th>Código</th><th>Descripción</th><th>U.M.</th><th>Cant.</th><th>V. unitario</th><th>Base</th><th>IVA %</th><th>Valor IVA</th><th>Total neto</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="totales-section"><div></div><div></div><div class="totales-box"><div class="row"><span>Subtotal (base gravable)</span><span>${formatoMoneda(totales.base || 0)}</span></div><div class="row"><span>Total impuestos (IVA)</span><span>${formatoMoneda(totales.iva || 0)}</span></div><div class="row" style="color:#d94d6a"><span>Total retención en la fuente (–)</span><span>${formatoMoneda(totales.retencion || 0)}</span></div><div class="row total-final"><span>TOTAL A PAGAR</span><span>${formatoMoneda(totales.total || 0)}</span></div></div></div>
      <footer class="legal-footer">Documento generado con AMC Facturación Electrónica y POS — Proyecto académico.</footer></div>
    </article>`;
    document.body.appendChild(stage);
    return { stage, documento: stage.firstElementChild, numero, cliente };
  }

  async function descargarPdfFactura(factura, boton) {
    if (typeof html2pdf === "undefined") {
      alert("No se pudo cargar el generador de PDF. Verifica tu conexión e inténtalo nuevamente.");
      return;
    }
    const textoOriginal = boton.textContent;
    boton.disabled = true;
    boton.textContent = "Generando PDF…";
    let stage;
    try {
      const detalle = await detalleFacturaParaPdf(factura);
      const documento = crearDocumentoPdf(detalle);
      stage = documento.stage;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      if (document.fonts?.ready) await document.fonts.ready;
      await html2pdf().set({ margin: [5, 5, 5, 5], filename: `Factura-${nombreArchivoSeguro(documento.numero)}-${nombreArchivoSeguro(documento.cliente.nombre)}.pdf`, image: { type: "jpeg", quality: 0.98 }, html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff", logging: false }, jsPDF: { unit: "mm", format: "a4", orientation: "portrait" }, pagebreak: { mode: ["avoid-all", "css", "legacy"] } }).from(documento.documento).save();
    } catch (error) {
      console.error("No fue posible generar el PDF.", error);
      alert("No fue posible generar el PDF. Inténtalo nuevamente.");
    } finally {
      if (stage) stage.remove();
      boton.disabled = false;
      boton.textContent = textoOriginal;
    }
  }

  function obtenerSiguienteConsecutivo(facturas) {
    const usados = facturas
      .map((f) => Number(f.consecutivo))
      .filter((n) => Number.isInteger(n) && n >= RESOLUCION_FACTURACION_DEMO.desde);
    const ultimo = usados.length ? Math.max(...usados) : RESOLUCION_FACTURACION_DEMO.desde - 1;
    const siguiente = ultimo + 1;
    return siguiente <= RESOLUCION_FACTURACION_DEMO.hasta ? siguiente : null;
  }

  // ── Carga de Datos ───────────────────────────────────────────────────
  async function cargarFacturas() {
    if (useApi) {
      try {
        const data = await apiFetch('/facturas?limit=500');
        // Mapear al formato esperado por el frontend
        return (data.facturas || []).map(f => ({
          id: f.id,
          tipo: f.tipo || 'FE',
          consecutivo: f.numero_factura ? parseInt(f.numero_factura.split('-')[1] || 0) : f.consecutivo,
          numeroFactura: f.numero_factura,
          generadoEn: f.creado_en,
          cliente: {
            nombre: f.cliente_nombre,
            documento: f.cliente_documento,
            email: f.cliente_email
          },
          totales: { total: f.total },
          lineas: Array.from({ length: f.total_lineas || 0 }),
          estado: f.estado
        }));
      } catch (err) {
        console.warn("Error cargando facturas del API, usando caché local", err);
      }
    }
    // Fallback Local
    const raw = localStorage.getItem(FACTURAS_GENERADAS_DB_KEY);
    if (!raw) return [];
    try {
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  async function cargarEstadisticas(facturasLocales) {
    if (useApi) {
      try {
        const data = await apiFetch('/facturas/stats');
        const stats = data.stats || {};
        $("stat-resolucion").textContent = stats.resolucion || RESOLUCION_FACTURACION_DEMO.numeroResolucion;
        $("stat-rango").textContent = `${stats.resolucion_desde || RESOLUCION_FACTURACION_DEMO.desde} - ${stats.resolucion_hasta || RESOLUCION_FACTURACION_DEMO.hasta}`;
        $("stat-generadas").textContent = String(stats.total_facturas || 0);
        $("stat-siguiente").textContent = stats.consecutivo_siguiente ? construirNumeroFactura(stats.consecutivo_siguiente) : "Rango agotado";
        return;
      } catch (err) {
        console.warn("Error cargando estadísticas del API", err);
      }
    }
    // Fallback Local — separar FE y POS
    const feFacturas  = facturasLocales.filter(f => (f.tipo || 'FE') === 'FE');
    const posFacturas = facturasLocales.filter(f => f.tipo === 'POS');

    $("stat-resolucion").textContent = RESOLUCION_FACTURACION_DEMO.numeroResolucion;
    $("stat-rango").textContent = RESOLUCION_FACTURACION_DEMO.desde + " - " + RESOLUCION_FACTURACION_DEMO.hasta;
    $("stat-generadas").textContent = String(feFacturas.length);

    const siguienteFE = obtenerSiguienteConsecutivo(feFacturas);
    $("stat-siguiente").textContent = siguienteFE ? construirNumeroFactura(siguienteFE) : "Rango agotado";

    // Stats POS
    if ($("stat-pos-generadas")) $("stat-pos-generadas").textContent = String(posFacturas.length);
    if ($("stat-pos-siguiente")) {
      const usadosPOS = posFacturas.map(f => Number(f.consecutivo)).filter(n => Number.isInteger(n) && n >= 1);
      const ultimoPOS = usadosPOS.length ? Math.max(...usadosPOS) : 0;
      const siguientePOS = ultimoPOS + 1;
      $("stat-pos-siguiente").textContent = siguientePOS <= RESOLUCION_POS_DEMO.hasta
        ? construirNumeroPos(siguientePOS)
        : "Rango agotado";
    }
  }

  function coincideBusqueda(factura, q) {
    if (!q) return true;
    const cliente = factura.cliente || {};
    const texto = [
      factura.numeroFactura,
      factura.consecutivo,
      factura.generadoEn,
      cliente.nombre,
      cliente.documento,
      cliente.email,
      factura.medioPagoLabel,
    ].join(" ");
    return normalizar(texto).includes(q);
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  async function renderFacturas() {
    const dbFacturas = await cargarFacturas();
    // Ordenar por fecha de generación (más reciente primero)
    const facturas = dbFacturas.slice().sort((a, b) => {
      const da = a.generadoEn ? new Date(a.generadoEn).getTime() : 0;
      const db2 = b.generadoEn ? new Date(b.generadoEn).getTime() : 0;
      return db2 - da;
    });

    const q = normalizar($("buscar").value);
    const filtradas = facturas.filter((f) => coincideBusqueda(f, q));

    const body = $("facturas-body");
    const empty = $("empty");

    await cargarEstadisticas(facturas);

    if (!facturas.length) {
      body.innerHTML = "";
      empty.style.display = "block";
      return;
    }

    empty.style.display = "none";

    if (!filtradas.length) {
      body.innerHTML = '<tr><td colspan="8" class="empty">No hay facturas que coincidan con la búsqueda.</td></tr>';
      return;
    }

    body.innerHTML = filtradas.map((factura) => {
      const cliente = factura.cliente || {};
      const tipo    = factura.tipo || 'FE';
      const numero  = factura.numeroFactura ||
        (tipo === 'POS' ? construirNumeroPos(factura.consecutivo || 0) : construirNumeroFactura(factura.consecutivo || 0));
      const total   = factura.totales?.total || 0;
      const lineas  = Array.isArray(factura.lineas) ? factura.lineas.length : 0;
      const estado  = factura.estado || 'EMITIDA';
      const tipoBadge = tipo === 'POS'
        ? '<span class="badge-pos">POS</span>'
        : '<span class="badge-fe">FE</span>';

      return `
        <tr>
          <td><strong>${escapeHtml(numero)}</strong><br><span class="badge">Cons. ${escapeHtml(String(factura.consecutivo || ''))}</span></td>
          <td>${tipoBadge}</td>
          <td>${escapeHtml(fechaHoraColombia(factura.generadoEn))}</td>
          <td>${escapeHtml(cliente.nombre || "-")}</td>
          <td>${escapeHtml(cliente.documento || "-")}</td>
          <td>${lineas}</td>
          <td class="num">${formatoMoneda(total)}</td>
          <td>${estado}</td>
          <td><div class="table-actions"><button type="button" class="btn-sec" data-id="${escapeHtml(factura.id)}">Ver factura</button><button type="button" class="btn-sec" data-pdf-id="${escapeHtml(factura.id)}">Descargar PDF</button></div></td>
        </tr>`;
    }).join("");

    body.querySelectorAll("button[data-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const factura = facturas.find((f) => String(f.id) === String(btn.dataset.id));
        if (!factura) return;
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(factura));
        // Si usamos API, deberíamos pasar el ID por URL en vez de sessionStorage a futuro
        window.location.href = "../prefactura.html" + (useApi ? `?id=${factura.id}` : '');
      });
    });

    body.querySelectorAll("button[data-pdf-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const factura = facturas.find((f) => String(f.id) === String(btn.dataset.pdfId));
        if (factura) descargarPdfFactura(factura, btn);
      });
    });
  }

  // ── Eventos Iniciales ──────────────────────────────────────────────────────
  $("buscar").addEventListener("input", renderFacturas);
  renderFacturas();

});
