/** Formato moneda COP */
export function formatoMoneda(valor) {
  const n = Number(valor) || 0;
  return (
    "$ " +
    Math.round(n).toLocaleString("es-CO", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })
  );
}

export function parseNumero(valor) {
  const n = parseFloat(String(valor).replace(/[^\d.,-]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export function generarNumeroFactura() {
  const d = new Date();
  const y = d.getFullYear();
  const seq = String(Math.floor(Math.random() * 90000) + 10000);
  return `FE-${y}-${seq}`;
}

export function generarCufeDemo() {
  const chars = "0123456789ABCDEF";
  let s = "";
  for (let i = 0; i < 96; i++) {
    s += chars[Math.floor(Math.random() * chars.length)];
    if ((i + 1) % 8 === 0 && i < 95) s += "-";
  }
  return s;
}

export function fechaHoraColombia(date = new Date()) {
  return date.toLocaleString("es-CO", {
    timeZone: "America/Bogota",
    dateStyle: "long",
    timeStyle: "medium",
  });
}
