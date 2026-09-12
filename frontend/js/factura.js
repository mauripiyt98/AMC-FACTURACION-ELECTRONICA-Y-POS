const activeUserCode = sessionStorage.getItem("amc_active_user_code") || "1110591592";
const isDev = activeUserCode === "1110591592";
const STORAGE_KEY = `amc_factura_preview_v1_${activeUserCode}`;

// Cargar perfil del emisor desde localStorage (guardado en «Mi Perfil»)
let emisorData = null;
try {
  const profileKey = `amc_perfil_emisor_v1_${activeUserCode}`;
  const rawProfile = localStorage.getItem(profileKey);
  if (rawProfile) {
    emisorData = JSON.parse(rawProfile);
  }
} catch (e) {
  console.error("Error al cargar perfil de emisor:", e);
}

// Fallback con datos del desarrollador únicamente para el usuario dev
const EMISOR = emisorData || {
  tipoPersona: "NATURAL",
  razonSocial: isDev ? "ANDRES MAURICIO CAMPOS FIERRO" : "Mi Empresa",
  nit: isDev ? "1.110.591.592-3" : "—",
  direccion: isDev ? "Colombia" : "",
  ciudad: isDev ? "Bogotá" : "",
  email: isDev ? "dev@amc.com" : "",
  logo: "",   // sin logo por defecto para usuarios nuevos; lo establece el perfil
};

// ── Utilidades ──────────────────────────────────────────────────────────────
function formatoMoneda(valor) {
  const n = Number(valor) || 0;
  return "$ " + Math.round(n).toLocaleString("es-CO", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function generarNumeroFactura() {
  const d = new Date();
  return "FE-" + d.getFullYear() + "-" + (Math.floor(Math.random() * 90000) + 10000);
}

function generarCufeDemo() {
  const chars = "0123456789ABCDEF";
  let s = "";
  for (let i = 0; i < 96; i++) {
    s += chars[Math.floor(Math.random() * chars.length)];
    if ((i + 1) % 8 === 0 && i < 95) s += "-";
  }
  return s;
}

function fechaHoraColombia(date) {
  return (date || new Date()).toLocaleString("es-CO", {
    timeZone: "America/Bogota",
    dateStyle: "long",
    timeStyle: "medium",
  });
}

function escapeHtml(text) {
  const d = document.createElement("div");
  d.textContent = text;
  return d.innerHTML;
}

const $ = (id) => document.getElementById(id);

// ── Render líneas en la prefactura ──────────────────────────────────────────
function renderLineas(lineas) {
  const tbody = $("lineas-detalle");
  tbody.innerHTML = lineas.map((l, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${escapeHtml(l.codigo || "—")}</td>
      <td>${escapeHtml(l.producto)}</td>
      <td>${escapeHtml(l.unidad || "UNIDAD")}</td>
      <td class="num">${l.cantidad}</td>
      <td class="num">${formatoMoneda(l.unitario)}</td>
      <td class="num">${formatoMoneda(l.base)}</td>
      <td class="num">${l.tarifaIva}%</td>
      <td class="num">${formatoMoneda(l.valorIva)}</td>
      <td class="num">${l.tarifaRetencion > 0 ? l.tarifaRetencion + "%" : "—"}</td>
      <td class="num">${l.valorRetencion > 0 ? formatoMoneda(l.valorRetencion) : "—"}</td>
      <td class="num">${formatoMoneda(l.total)}</td>
    </tr>`).join("");
}

function renderDesgloseIva(ivaPorTarifa) {
  const tbody = $("desglose-iva-body");
  const entries = Object.entries(ivaPorTarifa || {}).sort((a, b) => Number(b[0]) - Number(a[0]));
  if (!entries.length) {
    tbody.innerHTML = '<tr><td colspan="2">Sin IVA</td></tr>';
    return;
  }
  tbody.innerHTML = entries.map(([tarifa, valor]) => `
    <tr>
      <td>IVA ${tarifa}%</td>
      <td class="num">${formatoMoneda(valor)}</td>
    </tr>`).join("");
}

function renderDesgloseRetencion(retencionPorTarifa) {
  const tbody = $("desglose-retencion-body");
  if (!tbody) return;
  const entries = Object.entries(retencionPorTarifa || {}).sort((a, b) => Number(b[0]) - Number(a[0]));
  if (!entries.length) {
    tbody.innerHTML = '<tr><td colspan="2">Sin retención</td></tr>';
    return;
  }
  tbody.innerHTML = entries.map(([tarifa, valor]) => `
    <tr>
      <td>Retefuente ${tarifa}%</td>
      <td class="num">${formatoMoneda(valor)}</td>
    </tr>`).join("");
}

function renderCliente(c, tercero) {
  const datos = {
    nombre: c.nombre || tercero?.nombre || "—",
    documento: c.documento || tercero?.documento || "—",
    direccion: c.direccion || tercero?.direccion || "—",
    ciudad: c.ciudad || tercero?.ciudad || "—",
    telefono: c.telefono || tercero?.telefono || "—",
    email: c.email || tercero?.email || "—",
  };

  $("cliente-nombre").innerHTML = "<strong>" + escapeHtml(datos.nombre) + "</strong>";
  $("cliente-doc").innerHTML = "<span class=\"lbl\">Documento / NIT:</span> " + escapeHtml(datos.documento);
  $("cliente-dir").innerHTML = "<span class=\"lbl\">Dirección:</span> " + escapeHtml(datos.direccion);
  if ($("cliente-ciudad")) {
    $("cliente-ciudad").innerHTML = "<span class=\"lbl\">Ciudad:</span> " + escapeHtml(datos.ciudad);
  }
  $("cliente-tel").innerHTML = "<span class=\"lbl\">Teléfono:</span> " + escapeHtml(datos.telefono);
  $("cliente-email").innerHTML = "<span class=\"lbl\">Email:</span> " + escapeHtml(datos.email);
}



function descargarPdf() {
  // En POS la factura estándar permanece oculta y su número no se actualiza.
  // Identificar el tipo por la vista activa evita intentar convertir ese nodo
  // oculto, que producía un PDF en blanco.
  const isPos = document.body.classList.contains('print-pos');
  const elemento = document.getElementById(isPos ? "tirilla-documento" : "factura-documento");
  const numero = (isPos ? $("tirilla-numero") : $("factura-numero"))
    .textContent.replace(/^#/, "").replace(/\s/g, "-");
  const docCliente = ($("cliente-doc").textContent || "").replace(/[^\dA-Za-z-]/g, "").slice(0, 20);

  if (!elemento) {
    console.error("No se encontró el documento que se debe exportar a PDF.");
    return;
  }

  if (typeof html2pdf === "undefined") {
    console.error("No se pudo cargar el generador de PDF.");
    alert("No se pudo cargar el generador de PDF. Verifica tu conexión e inténtalo nuevamente.");
    return;
  }

  const opt = isPos ? {
    margin: [4, 4, 4, 4],
    filename: "Ticket-" + numero + ".pdf",
    image: { type: "jpeg", quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: { unit: "mm", format: [80, 297], orientation: "portrait" }, // Formato tirilla 80 mm de ancho
  } : {
    margin: [8, 8, 8, 8],
    filename: "Factura-" + numero + (docCliente ? "-" + docCliente : "") + ".pdf",
    image: { type: "jpeg", quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
  };

  const btnPdf = $("btn-pdf");
  btnPdf.disabled = true;
  btnPdf.textContent = "Generando PDF…";

  // Al abrir la aplicación directamente con file://, algunos navegadores no
  // permiten que html2canvas lea imágenes locales o externas (logo y QR). Se
  // excluyen solo de la copia temporal de exportación para evitar que el lienzo
  // quede bloqueado y la descarga falle; la factura mostrada no se modifica.
  opt.html2canvas.onclone = (documentoClonado) => {
    const copiaFactura = documentoClonado.getElementById(elemento.id);
    if (!copiaFactura) return;
    copiaFactura.querySelectorAll("img").forEach((imagen) => imagen.remove());
  };

  html2pdf().set(opt).from(elemento).save()
    .then(() => {
      btnPdf.disabled = false;
      btnPdf.textContent = "Descargar PDF";
    })
    .catch((error) => {
      console.error("No fue posible generar el PDF.", error);
      btnPdf.disabled = false;
      btnPdf.textContent = "Descargar PDF";
      alert("No fue posible generar el PDF. Inténtalo nuevamente.");
    });
}

// ── Init ────────────────────────────────────────────────────────────────────
window.addEventListener("load", function () {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) {
    document.querySelector(".preview-page").innerHTML = `
      <div style="text-align:center;padding:48px;">
        <p>No hay datos de factura. Regrese y genere una desde el formulario.</p>
        <a href="index.html" style="display:inline-block;margin-top:16px;padding:10px 20px;background:#0aa6d6;color:#f8fcff;border-radius:6px;text-decoration:none;">← Volver al formulario</a>
      </div>`;
    return;
  }

  let data;
  try { data = JSON.parse(raw); } catch { data = null; }
  if (!data) { window.location.href = "index.html"; return; }

  const numero   = data.numeroFactura || generarNumeroFactura();
  const cufe     = data.cufe || generarCufeDemo();
  const fechaGen = fechaHoraColombia(new Date(data.generadoEn));
  const isPos    = numero.startsWith('POS');

  if (isPos) {
    document.body.classList.add('print-pos');
    if ($("factura-documento")) $("factura-documento").style.display = "none";
    if ($("tirilla-documento")) $("tirilla-documento").style.display = "block";

    if ($("tirilla-numero")) $("tirilla-numero").textContent = "#" + numero;

    if ($("t-emisor-nombre")) $("t-emisor-nombre").textContent = EMISOR.razonSocial;
    if ($("t-emisor-nit"))    $("t-emisor-nit").textContent    = "NIT: " + EMISOR.nit;
    if ($("t-emisor-dir"))    $("t-emisor-dir").textContent    = "Dir: " + (EMISOR.direccion || "—");
    if ($("t-emisor-tel"))    $("t-emisor-tel").textContent    = "Tel: " + (EMISOR.telefono || "—");
    if ($("t-emisor-fecha-emision")) $("t-emisor-fecha-emision").textContent = "Fecha de emisión: " + fechaGen;
    if ($("t-emisor-fecha-validacion")) $("t-emisor-fecha-validacion").textContent = "Fecha de validación: " + fechaGen;

    const lineasCont = $("tirilla-lineas");
    if (lineasCont) {
      lineasCont.innerHTML = (data.lineas || []).map(l => `
        <div class="t-item-row">
          <div class="t-item-name">${l.cantidad} - ${escapeHtml(l.producto)}</div>
          <div class="t-item-details">
            <span>Impuestos: IVA</span>
          </div>
          <div class="t-item-details">
            <span>Precio unit.</span>
            <span>${formatoMoneda(l.unitario || l.precio || 0)}</span>
          </div>
          <div class="t-item-details">
            <span><strong>${l.cantidad} ${escapeHtml(l.unidad || 'Unidad')}</strong></span>
            <span><strong>${formatoMoneda(l.total)}</strong></span>
          </div>
        </div>
      `).join("");
    }

    if ($("t-subtotal"))   $("t-subtotal").textContent = formatoMoneda(data.totales.base);
    if ($("t-iva"))        $("t-iva").textContent      = formatoMoneda(data.totales.iva);
    if ($("t-retencion"))  $("t-retencion").textContent = formatoMoneda(data.totales.retencion || 0);

    const articulosCount = (data.lineas || []).reduce((acc, l) => acc + Number(l.cantidad || 0), 0);
    if ($("t-articulos-count")) $("t-articulos-count").textContent = `Total ${articulosCount} Unidad${articulosCount !== 1 ? 'es' : ''}`;
    if ($("t-total-pagar")) $("t-total-pagar").textContent = formatoMoneda(data.totales.total);

    const desgloseDiv = $("tirilla-desglose-impuestos");
    if (desgloseDiv) {
      const entries = Object.entries(data.totales.ivaPorTarifa || {}).sort((a, b) => Number(b[0]) - Number(a[0]));
      if (entries.length > 0) {
        desgloseDiv.innerHTML = entries.map(([tarifa, valor]) => {
          const baseTarifa = (data.lineas || [])
            .filter(l => Number(l.tarifaIva) === Number(tarifa))
            .reduce((acc, l) => acc + (l.base || (l.unitario * l.cantidad) || 0), 0);
          return `
            <div style="font-weight: bold; margin-top: 4px;">IVA ${Number(tarifa).toFixed(2)}%</div>
            <div class="t-row" style="padding-left: 10px;">
              <span>Base:</span>
              <span>${formatoMoneda(baseTarifa)}</span>
            </div>
            <div class="t-row" style="padding-left: 10px;">
              <span>Valor:</span>
              <span>${formatoMoneda(valor)}</span>
            </div>
          `;
        }).join("");
      } else {
        desgloseDiv.innerHTML = `
          <div style="font-weight: bold;">IVA ${Number(data.lineas?.[0]?.tarifaIva || 19).toFixed(2)}%</div>
          <div class="t-row" style="padding-left: 10px;">
            <span>Base:</span>
            <span>${formatoMoneda(data.totales.base)}</span>
          </div>
          <div class="t-row" style="padding-left: 10px;">
            <span>Valor:</span>
            <span>${formatoMoneda(data.totales.iva)}</span>
          </div>
        `;
      }
    }

    if ($("t-medio-pago-label")) $("t-medio-pago-label").textContent = data.medioPagoLabel || data.medioPago || "Efectivo";
    if ($("t-medio-pago-valor")) $("t-medio-pago-valor").textContent = formatoMoneda(data.totales.total);

    const qrCanvas = $("tirilla-qr-canvas");
    if (qrCanvas && typeof QRCode !== "undefined") {
      QRCode.toCanvas(qrCanvas, `https://amc.com/factura/${data.id}`, { width: 120, margin: 1 }, (err) => {
        if (err) console.error(err);
      });
    }

    if ($("t-cufe-texto")) $("t-cufe-texto").textContent = cufe;

    const c = data.cliente || {};
    const nombreCli = c.nombre || data.tercero?.nombre || "Consumidor Final";
    const docCli = c.documento || data.tercero?.documento || "222222222";
    if ($("t-cliente-nombre")) $("t-cliente-nombre").textContent = nombreCli;
    if ($("t-cliente-doc"))    $("t-cliente-doc").textContent    = docCli;

    // Resolución POS dinámica
    const resLegal = $("t-resolucion-legal");
    if (resLegal) {
      const res = data.resolucion || {};
      const numRes     = res.numero     || '18764111157293';
      const prefRes    = res.prefijo    || 'POS';
      const desdeRes   = res.desde     || 1;
      const hastaRes   = res.hasta     || 1000;
      const vigDesde   = res.vigenciaDesde || '12 de junio de 2026';
      const vigHasta   = res.vigenciaHasta || '12 de junio de 2028';
      resLegal.textContent =
        `${numRes} del ${vigDesde}, v\u00e1lida desde ${vigDesde} hasta ${vigHasta}. Prefijo ${prefRes}, numeraci\u00f3n desde ${desdeRes} hasta ${hastaRes}`;
    }

    const linkBack = document.querySelector(".toolbar-back");
    if (linkBack) {
      linkBack.href = "pos/pos.html";
      linkBack.textContent = "← Volver al POS";
    }
  } else {
    document.body.classList.remove('print-pos');
    if ($("factura-documento")) $("factura-documento").style.display = "block";
    if ($("tirilla-documento")) $("tirilla-documento").style.display = "none";

    $("emisor-nombre").textContent  = EMISOR.razonSocial;
    $("emisor-nit").textContent     = "NIT: " + EMISOR.nit;
    
    const regimenTexto = EMISOR.regimen || 
      `${EMISOR.tipoPersona === "JURIDICA" ? "Persona Jurídica" : "Persona Natural"} — ${EMISOR.ciudad || "Colombia"}`;
    $("emisor-regimen").textContent = regimenTexto;
    const logoSrc = EMISOR.logo || (isDev ? "../assets/logo.png" : "");
    const logoEl = $("logo-emisor");
    if (logoSrc) {
      logoEl.src = logoSrc;
      logoEl.style.display = "";
    } else {
      logoEl.style.display = "none";
    }

    if ($("info-emisor-nombre")) $("info-emisor-nombre").textContent = EMISOR.razonSocial;
    if ($("info-emisor-nit"))    $("info-emisor-nit").textContent    = "NIT " + EMISOR.nit;

    if ($("info-emisor-detalles")) {
      const detallesTexto = EMISOR.regimen ||
        `${EMISOR.tipoPersona === "JURIDICA" ? "Persona jurídica" : "Persona natural"} — ${EMISOR.ciudad || "Colombia"}`;
      $("info-emisor-detalles").textContent = detallesTexto;
    }

    const emisorEmail = EMISOR.email || data.emisor?.email || "";
    if ($("info-emisor-email")) {
      if (emisorEmail) {
        $("info-emisor-email").innerHTML =
          `<span class="lbl">Email:</span> <a href="mailto:${escapeHtml(emisorEmail)}" style="color:inherit;text-decoration:none;">${escapeHtml(emisorEmail)}</a>`;
        $("info-emisor-email").style.display = "";
      } else {
        $("info-emisor-email").style.display = "none";
      }
    }

    const emisorDireccion = EMISOR.direccion || data.emisor?.direccion || "";
    if ($("info-emisor-direccion")) {
      if (emisorDireccion) {
        $("info-emisor-direccion").innerHTML =
          `<span class="lbl">Dirección:</span> ${escapeHtml(emisorDireccion)}`;
        $("info-emisor-direccion").style.display = "";
      } else {
        $("info-emisor-direccion").style.display = "none";
      }
    }

    $("factura-numero").textContent = numero;
    $("factura-fecha").textContent  = fechaGen;
    $("cufe-texto").textContent     = "CUFE (demostración): " + cufe;

    const c = data.cliente || {};
    renderCliente(c, data.tercero);

    renderLineas(data.lineas);
    renderDesgloseIva(data.totales.ivaPorTarifa);
    renderDesgloseRetencion(data.totales.retencionPorTarifa);

    $("subtotal").textContent         = formatoMoneda(data.totales.base);
    $("total-iva").textContent        = formatoMoneda(data.totales.iva);
    $("total-retencion").textContent  = formatoMoneda(data.totales.retencion || 0);
    $("total-pagar").textContent      = formatoMoneda(data.totales.total);
    $("medio-pago-texto").textContent = data.medioPagoLabel || data.medioPago;

    const obsContenedor = $("observaciones-contenedor");
    const obsTexto = $("observaciones-texto");
    if (obsContenedor && obsTexto) {
      if (data.observaciones && data.observaciones.trim() !== "") {
        obsTexto.textContent = data.observaciones;
        obsContenedor.style.display = "block";
      } else {
        obsContenedor.style.display = "none";
      }
    }
  }

  $("btn-pdf").addEventListener("click", descargarPdf);
});
