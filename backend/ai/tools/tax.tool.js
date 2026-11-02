'use strict';

const { normalizar } = require('../intentEngine');
const { UVT_HISTORY, SMLV_HISTORY, WITHHOLDING_CONCEPTS, findByYear, currentYear } = require('../taxCatalog');

function extractYear(text) {
  const match = String(text || '').match(/\b(20\d{2})\b/);
  return match ? Number(match[1]) : currentYear();
}

function extractAmount(text) {
  const normalized = normalizar(text).replace(/\./g, '').replace(/,/g, '.');
  const match = normalized.match(/\b(\d+(?:\.\d+)?)\s*(?:uvt|pesos?|cop)\b/);
  return match ? Number(match[1]) : null;
}

function money(value) { return `$${Math.round(Number(value || 0)).toLocaleString('es-CO')}`; }
function sourceText(source) { return `${source.entidad}: ${source.url}`; }
function table(columns, rows) { return { columnas: columns, filas: rows }; }

function uvtReply(text) {
  const normalized = normalizar(text);
  const year = extractYear(text);
  const uvt = findByYear(UVT_HISTORY, year);
  if (!uvt) return { intencion: 'CONSULTAR_UVT', dominio: 'tributario_colombia', tipo: 'not_found', titulo: 'UVT no verificada', mensaje: `No tengo una UVT verificada para ${year}. No voy a estimar ese valor.`, seguimiento: 'Consulta un año entre 2020 y 2026.', acciones: [], sugerencias: [] };
  const amount = extractAmount(text);
  const isPesoToUvt = /pesos?\s+(?:a|en)\s+uvt|cop\s+(?:a|en)\s+uvt|cuantas uvt/.test(normalized);
  const isUvtToPeso = /uvt\s+(?:a|en)\s+(?:pesos?|cop)|cuanto(?:s)?\s+(?:son|representan)/.test(normalized);
  if (amount !== null && isPesoToUvt) {
    const converted = amount / uvt.value;
    return { intencion: 'CONVERTIR_PESOS_A_UVT', dominio: 'tributario_colombia', tipo: 'tax_value', titulo: 'Conversión de pesos a UVT', mensaje: `${money(amount)} equivalen a ${converted.toLocaleString('es-CO', { maximumFractionDigits: 4 })} UVT para ${year}.`, seguimiento: 'La equivalencia es matemática; la aplicación tributaria concreta puede requerir reglas de aproximación.', acciones: [], sugerencias: [], tarjeta: { etiqueta: `UVT ${year}`, valor: money(uvt.value) }, tabla: table(['Año', 'UVT', 'Resolución', 'Fuente'], [[year, money(uvt.value), uvt.resolution, sourceText(uvt.source)]]) };
  }
  if (amount !== null && (isUvtToPeso || /\buvt\b/.test(normalized))) {
    const converted = amount * uvt.value;
    return { intencion: 'CONVERTIR_UVT_A_PESOS', dominio: 'tributario_colombia', tipo: 'tax_value', titulo: 'Conversión de UVT a pesos', mensaje: `${amount.toLocaleString('es-CO')} UVT equivalen a ${money(converted)} para ${year}.`, seguimiento: '¿Quieres consultar una base mínima de retención o convertir otro valor?', acciones: [], sugerencias: [], tarjeta: { etiqueta: `UVT ${year}`, valor: money(uvt.value) }, tabla: table(['Año', 'UVT', 'Operación', 'Fuente'], [[year, money(uvt.value), `${amount} × ${money(uvt.value)} = ${money(converted)}`, sourceText(uvt.source)]]) };
  }
  if (/histor|historial/.test(normalized)) {
    return { intencion: 'CONSULTAR_UVT_HISTORICO', dominio: 'tributario_colombia', tipo: 'tax_history', titulo: 'Historial de UVT verificado', mensaje: 'Estos valores corresponden a los años disponibles en el catálogo tributario verificado.', seguimiento: 'También puedo convertir una cantidad de UVT a pesos para un año específico.', acciones: [], sugerencias: [], tabla: table(['Año', 'UVT', 'Resolución'], UVT_HISTORY.map((row) => [row.year, money(row.value), row.resolution])) };
  }
  return { intencion: 'CONSULTAR_UVT', dominio: 'tributario_colombia', tipo: 'tax_value', titulo: `Valor oficial de la UVT — ${year}`, mensaje: `La UVT aplicable en ${year} es ${money(uvt.value)}.`, seguimiento: 'Puedes preguntar, por ejemplo: “¿Cuánto son 100 UVT en pesos?”.', acciones: [], sugerencias: [], tarjeta: { etiqueta: `UVT ${year}`, valor: money(uvt.value) }, tabla: table(['Año', 'Valor', 'Resolución', 'Publicación', 'Fuente'], [[year, money(uvt.value), uvt.resolution, uvt.publishedAt, sourceText(uvt.source)]]) };
}

function salaryReply(text) {
  const normalized = normalizar(text);
  const year = extractYear(text);
  const row = findByYear(SMLV_HISTORY, year);
  if (!row) return { intencion: 'CONSULTAR_SMLV', dominio: 'tributario_colombia', tipo: 'not_found', titulo: 'Valor no verificado', mensaje: `No tengo un salario mínimo o auxilio de transporte verificado para ${year}.`, seguimiento: 'Consulta un año entre 2020 y 2026.', acciones: [], sugerencias: [] };
  const isHistory = /histor|historial|compar/.test(normalized);
  if (isHistory) return { intencion: 'CONSULTAR_SMLV_HISTORICO', dominio: 'tributario_colombia', tipo: 'tax_history', titulo: 'Historial de salario mínimo', mensaje: 'Valores mensuales vigentes desde el 1 de enero de cada año.', seguimiento: '¿Quieres el detalle de un año o sumar el auxilio de transporte?', acciones: [], sugerencias: [], tabla: table(['Año', 'SMLMV', 'Incremento', 'Auxilio transporte'], SMLV_HISTORY.map((item) => [item.year, money(item.salary), `${item.increase}%`, money(item.transport)])) };
  const transportOnly = /auxilio|transporte|subsidio/.test(normalized) && !/mas|sum|total/.test(normalized);
  const withTransport = /mas|sum|total|recibe/.test(normalized) && /auxilio|transporte/.test(normalized);
  if (transportOnly) return { intencion: 'CONSULTAR_AUXILIO_TRANSPORTE', dominio: 'tributario_colombia', tipo: 'tax_value', titulo: `Auxilio de transporte — ${year}`, mensaje: `El auxilio de transporte mensual para ${year} es ${money(row.transport)}. Aplica a quienes cumplan los requisitos legales; no forma parte del salario básico.`, seguimiento: '¿Deseas conocer el salario mínimo más auxilio?', acciones: [], sugerencias: [], tarjeta: { etiqueta: `Auxilio ${year}`, valor: money(row.transport) }, tabla: table(['Año', 'Valor mensual', 'Norma', 'Fuente'], [[year, money(row.transport), row.transportDecree, sourceText(year === 2026 ? require('../taxCatalog').SOURCES.transport2026 : row.source)]]) };
  const total = row.salary + row.transport;
  return { intencion: withTransport ? 'CONSULTAR_SMLV_MAS_AUXILIO' : 'CONSULTAR_SMLV', dominio: 'tributario_colombia', tipo: 'tax_value', titulo: `Salario mínimo legal — ${year}`, mensaje: withTransport ? `El SMLMV (${money(row.salary)}) más el auxilio de transporte (${money(row.transport)}) suma ${money(total)} mensuales, si el trabajador tiene derecho al auxilio.` : `El SMLMV de ${year} es ${money(row.salary)} mensuales; el incremento frente al año anterior fue ${row.increase}%.`, seguimiento: '¿Quieres consultar el auxilio de transporte o el historial?', acciones: [], sugerencias: [], tarjeta: { etiqueta: `SMLMV ${year}`, valor: money(row.salary) }, tabla: table(['Año', 'SMLMV', 'Incremento', 'Decreto', 'Vigencia', 'Fuente'], [[year, money(row.salary), `${row.increase}%`, row.decree, row.effectiveFrom, sourceText(row.source)]]) };
}

function withholdingReply(text) {
  const normalized = normalizar(text);
  const year = extractYear(text);
  const concept = /honorario/.test(normalized) ? WITHHOLDING_CONCEPTS[2] : /servicio/.test(normalized) ? WITHHOLDING_CONCEPTS[1] : /compra/.test(normalized) ? WITHHOLDING_CONCEPTS[0] : null;
  if (!concept) return null;
  const uvt = findByYear(UVT_HISTORY, year);
  if (!uvt) return { intencion: 'RETENCION_FUENTE', dominio: 'tributario_colombia', tipo: 'not_found', titulo: 'Año sin UVT verificada', mensaje: `No puedo calcular la base mínima de retención para ${year} porque no hay UVT verificada.`, seguimiento: 'Indica un año entre 2020 y 2026.', acciones: [], sugerencias: [] };
  const base = concept.minimumUvt === null ? 'No hay base mínima general única' : money(concept.minimumUvt * uvt.value);
  return { intencion: concept.id, dominio: 'tributario_colombia', tipo: 'tax_withholding', titulo: `Retención en la fuente — ${concept.name}`, mensaje: `${concept.conditions} Antes de liquidar, confirma el tipo exacto de pago y la calidad tributaria del beneficiario.`, seguimiento: 'Indícame si el beneficiario es persona natural o jurídica, si es declarante y el valor del pago para orientarte sin asumir una tarifa.', acciones: [], sugerencias: [], tabla: table(['Concepto', 'Base mínima', 'Equivalencia', 'Tarifa orientativa', 'Referencia'], [[concept.name, base, concept.minimumUvt === null ? 'No aplica una única base' : `${concept.minimumUvt} UVT (${year})`, concept.rates, concept.normativeReference], ['Beneficiario', concept.beneficiary, '', '', sourceText(concept.source)]]) };
}

function handleTaxQuery(text) {
  const normalized = normalizar(text);
  const asksWithholding = /retencion|retefuente|honorario|base minima/.test(normalized);
  if (asksWithholding && /retencion|retefuente|honorario|servicio|compra/.test(normalized)) {
    return withholdingReply(text) || {
      intencion: 'RETENCION_FUENTE', dominio: 'tributario_colombia', tipo: 'clarification', titulo: 'Consulta de retención en la fuente',
      mensaje: 'Para orientarte con precisión necesito el concepto: compras, servicios u honorarios. Las bases y tarifas no son universales.',
      seguimiento: 'Indica también el año, el tipo de beneficiario y si es declarante de renta.', acciones: [], sugerencias: [],
    };
  }
  if (/uvt|unidad de valor tributario/.test(normalized)) return uvtReply(text);
  if (/salario minimo|smlmv|smlv|auxilio de transporte|subsidio de transporte/.test(normalized)) return salaryReply(text);
  return null;
}

module.exports = { handleTaxQuery, extractYear, extractAmount, money };
