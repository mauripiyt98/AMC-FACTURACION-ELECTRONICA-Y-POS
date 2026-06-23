// ── Configuración ──────────────────────────────────────────────────────────
const activeUserCode = sessionStorage.getItem("amc_active_user_code") || "1110591592";
const isDev = activeUserCode === "1110591592";

// La clave DEBE coincidir exactamente con la que usa app.js al guardar el payload
const STORAGE_KEY = isDev
  ? "amc_factura_preview_v1"
  : `amc_factura_preview_v1_${activeUserCode}`;

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
  const elemento = document.getElementById("factura-documento");
  const numero = $("factura-numero").textContent.replace(/\s/g, "-");
  const docCliente = ($("cliente-doc").textContent || "").replace(/[^\dA-Za-z-]/g, "").slice(0, 20);

  if (typeof html2pdf === "undefined") {
    window.print();
    return;
  }

  const opt = {
    margin: [8, 8, 8, 8],
    filename: "Factura-" + numero + (docCliente ? "-" + docCliente : "") + ".pdf",
    image: { type: "jpeg", quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
  };

  $("btn-pdf").disabled = true;
  $("btn-pdf").textContent = "Generando PDF…";

  html2pdf().set(opt).from(elemento).save()
    .then(() => {
      $("btn-pdf").disabled = false;
      $("btn-pdf").textContent = "Descargar PDF";
    })
    .catch(() => {
      $("btn-pdf").disabled = false;
      $("btn-pdf").textContent = "Descargar PDF";
      window.print();
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

  $("emisor-nombre").textContent  = EMISOR.razonSocial;
  $("emisor-nit").textContent     = "NIT: " + EMISOR.nit;
  
  const regimenTexto = EMISOR.regimen || 
    `${EMISOR.tipoPersona === "JURIDICA" ? "Persona Jurídica" : "Persona Natural"} — ${EMISOR.ciudad || "Colombia"}`;
  $("emisor-regimen").textContent = regimenTexto;
  // Establecer logo: usa el guardado en el perfil (base64) o el asset del dev,
  // o bien oculta el elemento si el usuario nuevo no ha configurado logo aún.
  const logoSrc = EMISOR.logo || (isDev ? "../assets/logo.png" : "");
  const logoEl = $("logo-emisor");
  if (logoSrc) {
    logoEl.src = logoSrc;
    logoEl.style.display = "";
  } else {
    logoEl.style.display = "none";
  }

  // Rellenar bloque de datos de emisor inferior (sección info-grid)
  if ($("info-emisor-nombre")) $("info-emisor-nombre").textContent = EMISOR.razonSocial;
  if ($("info-emisor-nit"))    $("info-emisor-nit").textContent    = "NIT " + EMISOR.nit;

  if ($("info-emisor-detalles")) {
    const detallesTexto = EMISOR.regimen ||
      `${EMISOR.tipoPersona === "JURIDICA" ? "Persona jurídica" : "Persona natural"} — ${EMISOR.ciudad || "Colombia"}`;
    $("info-emisor-detalles").textContent = detallesTexto;
  }

  // Email del emisor — fuente 1: perfil de Mi Perfil (EMISOR object)
  //                   fuente 2: payload guardado en el data del sessionStorage
  //                   fuente 3: fallback vacío si no hay dato
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

  // Dirección del emisor
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

  // Cargar observaciones si existen
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



  $("btn-pdf").addEventListener("click", descargarPdf);
});
