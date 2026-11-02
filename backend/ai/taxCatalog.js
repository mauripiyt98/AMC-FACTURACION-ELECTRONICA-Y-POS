'use strict';

/**
 * Catálogo tributario público de Mauro IA.
 *
 * Es información global: no pertenece a un tenant ni contiene datos de los
 * clientes. Cada registro conserva fuente, vigencia y verificación para que
 * una actualización normativa sea un cambio auditable de este único archivo.
 * Valores verificados el 2 de noviembre de 2026 frente a fuentes oficiales.
 */

const SOURCES = Object.freeze({
  dian2024: { entidad: 'DIAN', url: 'https://www.dian.gov.co/Prensa/Paginas/NG-Comunicado-de-Prensa-090-2023.aspx' },
  dian2025: { entidad: 'DIAN', url: 'https://www.dian.gov.co/Prensa/Paginas/NG-Comunicado-de-Prensa-099-2024.aspx' },
  dian2026: { entidad: 'DIAN', url: 'https://www.dian.gov.co/Prensa/Paginas/NG-Comunicado-de-Prensa-128-2025.aspx' },
  salaryHistory: { entidad: 'Función Pública', url: 'https://www1.funcionpublica.gov.co/web/eva/decretos_salariales' },
  salary2025: { entidad: 'Función Pública', url: 'https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=257156' },
  salary2026: { entidad: 'Presidencia de la República', url: 'https://www.presidencia.gov.co/Documents/251230-Decreto-1469-MinTrabajo.pdf' },
  transport2026: { entidad: 'Presidencia de la República', url: 'https://www.presidencia.gov.co/Documents/251230-Decreto-1470-MinTrabajo.pdf' },
  withholding: { entidad: 'DIAN', url: 'https://www.dian.gov.co/Prensa/Paginas/NG-Comunicado-de-Prensa-070-2026.aspx' },
  decree1625: { entidad: 'DIAN — Normograma', url: 'https://normograma.dian.gov.co/dian/compilacion/docs/pdf/decreto_1625_2016.pdf' },
});

function sourceForUvt(year) {
  return year === 2024 ? SOURCES.dian2024 : year === 2025 ? SOURCES.dian2025 : year === 2026 ? SOURCES.dian2026 : { entidad: 'DIAN', url: 'https://www.dian.gov.co/' };
}

const UVT_HISTORY = Object.freeze([
  { year: 2020, value: 35607, resolution: 'Resolución DIAN 000084 de 2019', publishedAt: '2019-11-28' },
  { year: 2021, value: 36308, resolution: 'Resolución DIAN 000111 de 2020', publishedAt: '2020-12-11' },
  { year: 2022, value: 38004, resolution: 'Resolución DIAN 000140 de 2021', publishedAt: '2021-11-25' },
  { year: 2023, value: 42412, resolution: 'Resolución DIAN 001264 de 2022', publishedAt: '2022-11-18' },
  { year: 2024, value: 47065, resolution: 'Resolución DIAN 000187 de 2023', publishedAt: '2023-11-28' },
  { year: 2025, value: 49799, resolution: 'Resolución DIAN 000193 de 2024', publishedAt: '2024-12-04' },
  { year: 2026, value: 52374, resolution: 'Resolución DIAN 000238 de 2025', publishedAt: '2025-12-15' },
].map((row) => Object.freeze({ ...row, source: sourceForUvt(row.year), verified: true })));

const SMLV_HISTORY = Object.freeze([
  { year: 2020, salary: 877803, increase: 6, decree: 'Decreto 2360 de 2019', transport: 102854, transportDecree: 'Decreto 2361 de 2019' },
  { year: 2021, salary: 908526, increase: 3.5, decree: 'Decreto 1785 de 2020', transport: 106454, transportDecree: 'Decreto 1786 de 2020' },
  { year: 2022, salary: 1000000, increase: 10.07, decree: 'Decreto 1724 de 2021', transport: 117172, transportDecree: 'Decreto 1725 de 2021' },
  { year: 2023, salary: 1160000, increase: 16, decree: 'Decreto 2613 de 2022', transport: 140606, transportDecree: 'Decreto 2614 de 2022' },
  { year: 2024, salary: 1300000, increase: 12.07, decree: 'Decreto 2292 de 2023', transport: 162000, transportDecree: 'Decreto 2293 de 2023' },
  { year: 2025, salary: 1423500, increase: 9.54, decree: 'Decreto 1572 de 2024', transport: 200000, transportDecree: 'Decreto 1573 de 2024' },
  { year: 2026, salary: 1750905, increase: 23, decree: 'Decreto 1469 de 2025', transport: 249095, transportDecree: 'Decreto 1470 de 2025' },
].map((row) => Object.freeze({
  ...row,
  effectiveFrom: `${row.year}-01-01`, verified: true,
  source: row.year === 2026 ? SOURCES.salary2026 : row.year === 2025 ? SOURCES.salary2025 : SOURCES.salaryHistory,
})));

// Estas fichas no calculan una retención ni sustituyen la clasificación fiscal.
// En particular, la tarifa depende de la naturaleza del pago y del beneficiario.
const WITHHOLDING_CONCEPTS = Object.freeze([
  {
    id: 'RETENCION_COMPRAS', name: 'Compras generales de bienes', category: 'retencion_fuente',
    keywords: ['retencion compras', 'compras declarantes', 'compras no declarantes', 'base minima compras'],
    minimumUvt: 10, rates: '2,5% (declarante) / 3,5% (no declarante)', beneficiary: 'Debe confirmarse la calidad tributaria del beneficiario.',
    conditions: 'Aplica a compras generales sujetas a retención; pueden existir reglas especiales por tipo de bien, régimen o calidad del beneficiario.',
    normativeReference: 'Decreto 1625 de 2016, modificado en bases mínimas por Decreto 572 de 2025.', source: SOURCES.withholding,
  },
  {
    id: 'RETENCION_SERVICIOS', name: 'Servicios generales', category: 'retencion_fuente',
    keywords: ['retencion servicios', 'servicios generales', 'base minima servicios', 'retefuente servicios'],
    minimumUvt: 2, rates: '4% (declarante) / 6% (no declarante)', beneficiary: 'Debe confirmarse si el beneficiario es declarante de renta.',
    conditions: 'La cuantía individual inferior a 2 UVT no está sometida a retención; clasificaciones especiales pueden tener tratamiento distinto.',
    normativeReference: 'Artículo 1.2.4.4.1 del Decreto 1625 de 2016, sustituido por Decreto 572 de 2025.', source: SOURCES.withholding,
  },
  {
    id: 'RETENCION_HONORARIOS', name: 'Honorarios', category: 'retencion_fuente',
    keywords: ['retencion honorarios', 'honorarios persona natural', 'honorarios persona juridica', 'retefuente honorarios'],
    minimumUvt: null, rates: 'No existe una tarifa única: usualmente 10% u 11%, según condiciones legales.', beneficiary: 'Se requiere conocer si es persona natural o jurídica, y las condiciones de vinculación laboral/contractual aplicables.',
    conditions: 'No se debe liquidar con esta respuesta: confirme la naturaleza intelectual autónoma del pago y las condiciones específicas del beneficiario.',
    normativeReference: 'Artículo 392 del Estatuto Tributario y Decreto 1625 de 2016.', source: SOURCES.decree1625,
  },
]);

const COMMAND_CATALOG = Object.freeze([
  { id: 'CONSULTAR_UVT', name: 'Consultar UVT', category: 'INFORMACIÓN TRIBUTARIA Y VALORES OFICIALES DE COLOMBIA', keywords: ['uvt', 'valor uvt', 'unidad de valor tributario'], synonyms: ['cuanto vale la uvt', 'uvt 2026'], intent: 'consultar_uvt', required: ['year?'], authorization: 'AUTHENTICATED', action: null },
  { id: 'CONVERTIR_UVT_A_PESOS', name: 'Convertir UVT a COP', category: 'INFORMACIÓN TRIBUTARIA Y VALORES OFICIALES DE COLOMBIA', keywords: ['uvt en pesos', 'uvt a pesos'], synonyms: ['cuanto son uvt', 'convertir uvt'], intent: 'convertir_uvt_cop', required: ['amount', 'year?'], authorization: 'AUTHENTICATED', action: null },
  { id: 'CONVERTIR_PESOS_A_UVT', name: 'Convertir COP a UVT', category: 'INFORMACIÓN TRIBUTARIA Y VALORES OFICIALES DE COLOMBIA', keywords: ['pesos a uvt', 'cop a uvt'], synonyms: ['cuantas uvt son', 'convertir pesos'], intent: 'convertir_cop_uvt', required: ['amount', 'year?'], authorization: 'AUTHENTICATED', action: null },
  { id: 'CONSULTAR_SMLV', name: 'Consultar salario mínimo', category: 'INFORMACIÓN TRIBUTARIA Y VALORES OFICIALES DE COLOMBIA', keywords: ['salario minimo', 'smlv', 'smlmv'], synonyms: ['minimo legal', 'salario minimo legal vigente'], intent: 'consultar_smlv', required: ['year?'], authorization: 'AUTHENTICATED', action: null },
  { id: 'CONSULTAR_AUXILIO_TRANSPORTE', name: 'Consultar auxilio de transporte', category: 'INFORMACIÓN TRIBUTARIA Y VALORES OFICIALES DE COLOMBIA', keywords: ['auxilio transporte', 'subsidio transporte'], synonyms: ['transporte salario minimo'], intent: 'consultar_auxilio_transporte', required: ['year?'], authorization: 'AUTHENTICATED', action: null },
  ...WITHHOLDING_CONCEPTS.map((item) => ({ id: item.id, name: item.name, category: item.category, keywords: item.keywords, synonyms: [], intent: item.id.toLowerCase(), required: ['year?', 'beneficiary?'], authorization: 'AUTHENTICATED', action: null })),
].map((command) => Object.freeze({
  ...command,
  responseTemplate: 'Respuesta estructurada con valor, vigencia, fuente oficial y advertencias aplicables.',
  variables: command.required,
  optionalAction: command.action,
})));

function findByYear(rows, year) { return rows.find((row) => row.year === year) || null; }
function currentYear() { return 2026; }

module.exports = { SOURCES, UVT_HISTORY, SMLV_HISTORY, WITHHOLDING_CONCEPTS, COMMAND_CATALOG, findByYear, currentYear };
