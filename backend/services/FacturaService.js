'use strict';

const Factura  = require('../models/Factura');
const Empresa  = require('../models/Empresa');
const { NotFoundError, TenantIsolationError, ValidationError } = require('../utils/errors');

/**
 * Servicio de Facturas Electrónicas.
 * Maneja el flujo completo: consecutivo → CUFE demo → crear cabecera + líneas.
 */
class FacturaService {
  static async listar(client, empresaId, opts = {}) {
    return Factura.findAll(client, empresaId, opts);
  }

  static async obtener(client, empresaId, id) {
    const factura = await Factura.findById(client, empresaId, id);
    if (!factura) throw new NotFoundError('Factura');
    if (factura.empresa_id !== empresaId) throw new TenantIsolationError();
    return factura;
  }

  /**
   * Crear una nueva factura electrónica.
   *
   * Proceso:
   *  1. Obtener y reservar siguiente consecutivo (UPDATE atómico en empresas)
   *  2. Construir número de factura y CUFE demo
   *  3. Calcular totales y validar líneas
   *  4. Persistir cabecera + líneas
   *
   * @param {object} client    - Conexión DB con contexto RLS activo
   * @param {string} empresaId - UUID de la empresa
   * @param {object} body      - Datos del formulario de factura
   * @param {string} usuarioId - UUID del usuario que genera la factura
   */
  static async crear(client, empresaId, body, usuarioId) {
    const { cliente, lineas, medio_pago = 'EFECTIVO', observaciones } = body;

    // Validaciones básicas
    if (!cliente?.nombre || !cliente?.documento) {
      throw new ValidationError('Nombre y documento del cliente son requeridos');
    }
    if (!Array.isArray(lineas) || lineas.length === 0) {
      throw new ValidationError('La factura debe tener al menos una línea');
    }

    // 1. Reservar consecutivo (atómico: UPDATE en empresas)
    const resolucion = await Empresa.nextConsecutivo(client, empresaId);
    const { consecutivo_actual: consecutivo, resolucion_prefijo, resolucion_numero } = resolucion;

    // 2. Construir número de factura
    const numero_factura = `${resolucion_prefijo}-${String(consecutivo).padStart(4, '0')}`;

    // 3. CUFE demo (en producción se genera con el algoritmo oficial DIAN)
    const cufe = generarCufeDemo(resolucion_prefijo, consecutivo, new Date());

    // 4. Calcular totales desde las líneas (no confiar en totales del cliente)
    let total_base = 0, total_iva = 0, total_retencion = 0;
    const lineasNormalizadas = lineas.map((l, i) => {
      const cantidad       = Number(l.cantidad) || 0;
      const valor_unitario = Number(l.valor_unitario || l.unitario) || 0;
      const tarifa_iva     = Number(l.tarifa_iva || l.iva) || 0;
      const tarifa_reten   = Number(l.tarifa_retencion || l.retencion) || 0;

      if (cantidad <= 0 || valor_unitario <= 0) {
        throw new ValidationError(`Línea ${i + 1}: cantidad y valor unitario deben ser mayores a cero`);
      }

      const base          = Math.round(cantidad * valor_unitario * 100) / 100;
      const valor_iva     = Math.round(base * (tarifa_iva / 100) * 100) / 100;
      const valor_factura = base + valor_iva;
      const valor_reten   = Math.round(base * (tarifa_reten / 100) * 100) / 100;
      const total         = Math.round((valor_factura - valor_reten) * 100) / 100;

      total_base      += base;
      total_iva       += valor_iva;
      total_retencion += valor_reten;

      return {
        producto_id     : l.producto_id || null,
        codigo          : l.codigo || '',
        nombre          : l.producto || l.nombre || '',
        unidad_medida   : l.unidad_medida || l.unidad || 'UNIDAD',
        cantidad,
        valor_unitario,
        tarifa_iva,
        tarifa_retencion: tarifa_reten,
        base,
        valor_iva,
        valor_retencion : valor_reten,
        total,
      };
    });

    const total_factura = Math.round((total_base + total_iva - total_retencion) * 100) / 100;

    // 5. Persistir
    const facturaData = {
      consecutivo,
      numero_factura,
      cufe,
      cliente_nombre   : cliente.nombre,
      cliente_documento: cliente.documento,
      cliente_email    : cliente.email    || null,
      cliente_telefono : cliente.telefono || null,
      cliente_direccion: cliente.direccion || null,
      cliente_ciudad   : cliente.ciudad   || null,
      tercero_id       : cliente.tercero_id || null,
      resolucion_numero,
      resolucion_prefijo,
      total_base     : Math.round(total_base * 100) / 100,
      total_iva      : Math.round(total_iva  * 100) / 100,
      total_retencion: Math.round(total_retencion * 100) / 100,
      total_factura,
      medio_pago,
      observaciones,
    };

    return Factura.create(client, empresaId, facturaData, lineasNormalizadas, usuarioId);
  }

  static async cambiarEstado(client, empresaId, id, estado) {
    const estadosValidos = ['GUARDADA', 'ENVIADA', 'ACEPTADA', 'RECHAZADA', 'ANULADA'];
    if (!estadosValidos.includes(estado)) {
      throw new ValidationError(`Estado inválido. Permitidos: ${estadosValidos.join(', ')}`);
    }
    const result = await Factura.updateEstado(client, empresaId, id, estado);
    if (!result) throw new NotFoundError('Factura');
    return result;
  }

  static async estadisticas(client, empresaId) {
    return Factura.stats(client, empresaId);
  }
}

/**
 * Genera un CUFE de demostración (no válido para DIAN real).
 * En producción, implementar el algoritmo oficial:
 * https://www.dian.gov.co/impuestos/factura-electronica
 */
function generarCufeDemo(prefijo, consecutivo, fecha) {
  const base = [
    prefijo,
    String(consecutivo).padStart(4, '0'),
    fecha.getTime(),
    Math.random().toString(36).slice(2, 10),
  ].join('-');

  let hex = '';
  for (let i = 0; i < Math.min(base.length, 48); i++) {
    hex += base.charCodeAt(i).toString(16).toUpperCase().padStart(2, '0');
  }
  return (hex + '0'.repeat(96)).slice(0, 96);
}

module.exports = FacturaService;
