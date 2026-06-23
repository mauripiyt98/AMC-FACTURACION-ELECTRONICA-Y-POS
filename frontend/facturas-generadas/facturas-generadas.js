const activeUserCode = sessionStorage.getItem("amc_active_user_code") || "1110591592";
const isDev = activeUserCode === "1110591592";

const STORAGE_KEY = isDev ? "amc_factura_preview_v1" : `amc_factura_preview_v1_${activeUserCode}`;
const FACTURAS_GENERADAS_DB_KEY = isDev ? "amc_facturas_generadas_db_v1" : `amc_facturas_generadas_db_v1_${activeUserCode}`;

const RESOLUCION_FACTURACION_DEMO = {
  prefijo: "FE",
  desde: 1,
  hasta: 1000,
  numeroResolucion: "18760000001",
  vigencia: "Demo academico",
};

const $ = (id) => document.getElementById(id);

function cargarFacturas() {
  const raw = localStorage.getItem(FACTURAS_GENERADAS_DB_KEY);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function normalizar(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function escapeHtml(text) {
  const d = document.createElement("div");
  d.textContent = String(text || "");
  return d.innerHTML;
}

function formatoMoneda(valor) {
  const n = Number(valor) || 0;
  return "$ " + Math.round(n).toLocaleString("es-CO", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function fechaHoraColombia(value) {
  const date = value ? new Date(value) : new Date();
  return date.toLocaleString("es-CO", {
    timeZone: "America/Bogota",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function construirNumeroFactura(consecutivo) {
  return RESOLUCION_FACTURACION_DEMO.prefijo + "-" + String(consecutivo).padStart(4, "0");
}

function obtenerSiguienteConsecutivo(facturas) {
  const usados = facturas
    .map((f) => Number(f.consecutivo))
    .filter((n) => Number.isInteger(n) && n >= RESOLUCION_FACTURACION_DEMO.desde);
  const ultimo = usados.length ? Math.max(...usados) : RESOLUCION_FACTURACION_DEMO.desde - 1;
  const siguiente = ultimo + 1;
  return siguiente <= RESOLUCION_FACTURACION_DEMO.hasta ? siguiente : null;
}

function actualizarResumen(facturas) {
  $("stat-resolucion").textContent = RESOLUCION_FACTURACION_DEMO.numeroResolucion;
  $("stat-rango").textContent = RESOLUCION_FACTURACION_DEMO.desde + " - " + RESOLUCION_FACTURACION_DEMO.hasta;
  $("stat-generadas").textContent = String(facturas.length);

  const siguiente = obtenerSiguienteConsecutivo(facturas);
  $("stat-siguiente").textContent = siguiente ? construirNumeroFactura(siguiente) : "Rango agotado";
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

function renderFacturas() {
  const facturas = cargarFacturas().slice().sort((a, b) => Number(b.consecutivo || 0) - Number(a.consecutivo || 0));
  const q = normalizar($("buscar").value);
  const filtradas = facturas.filter((f) => coincideBusqueda(f, q));
  const body = $("facturas-body");
  const empty = $("empty");

  actualizarResumen(facturas);

  if (!facturas.length) {
    body.innerHTML = "";
    empty.style.display = "block";
    return;
  }

  empty.style.display = "none";

  if (!filtradas.length) {
    body.innerHTML = '<tr><td colspan="8" class="empty">No hay facturas que coincidan con la busqueda.</td></tr>';
    return;
  }

  body.innerHTML = filtradas.map((factura) => {
    const cliente = factura.cliente || {};
    const numero = factura.numeroFactura || construirNumeroFactura(factura.consecutivo || 0);
    const total = factura.totales?.total || 0;
    const lineas = Array.isArray(factura.lineas) ? factura.lineas.length : 0;

    return `
      <tr>
        <td><strong>${escapeHtml(numero)}</strong><br><span class="badge">Cons. ${escapeHtml(factura.consecutivo)}</span></td>
        <td>${escapeHtml(fechaHoraColombia(factura.generadoEn))}</td>
        <td>${escapeHtml(cliente.nombre || "-")}</td>
        <td>${escapeHtml(cliente.documento || "-")}</td>
        <td>${lineas}</td>
        <td class="num">${formatoMoneda(total)}</td>
        <td>Guardada</td>
        <td><button type="button" class="btn-sec" data-id="${escapeHtml(factura.id)}">Ver factura</button></td>
      </tr>`;
  }).join("");

  body.querySelectorAll("button[data-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const factura = facturas.find((f) => f.id === btn.dataset.id);
      if (!factura) return;
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(factura));
      window.location.href = "../prefactura.html";
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  $("buscar").addEventListener("input", renderFacturas);
  renderFacturas();
});
