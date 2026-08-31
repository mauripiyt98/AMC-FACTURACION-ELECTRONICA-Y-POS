'use strict';

const Cotizacion    = require('../models/Cotizacion');
const Factura       = require('../models/Factura');
const Empresa       = require('../models/Empresa');
const TerceroService = require('./TerceroService');
const { NotFoundError, TenantIsolationError, ValidationError, ConflictError } = require('../utils/errors');

/**
 * Servicio de Cotizaciones.
 * Maneja el flujo completo: consecutivo → crear cabecera + líneas.
 * También soporta conversión a factura electrónica.
 */
class CotizacionService {
  static async listar(client, empresaId, opts = {}) {
    return Cotizacion.findAll(client, empresaId, opts);
  }

  static async obtener(client, empresaId, id) {
    const cotizacion = await Cotizacion.findById(client, empresaId, id);
    if (!cotizacion) throw new NotFoundError('Cotización');
    if (cotizacion.empresa_id !== empresaId) throw new TenantIsolationError();
    return cotizacion;
  }

  /**
   * Crear una nueva cotización.
   */
  static async crear(client, empresaId, body, usuarioId) {
    const { cliente, lineas, observaciones } = body;

    if (!cliente?.nombre || !cliente?.documento) {
      throw new ValidationError('Nombre y documento del cliente son requeridos');
    }
    if (!Array.isArray(lineas) || lineas.length === 0) {
      throw new ValidationError('La cotización debe tener al menos una línea');
    }

    // 1. Reservar consecutivo de cotización
    const { consecutivo_cotizacion: consecutivo } = await Empresa.nextConsecutivoCotizacion(client, empresaId);

    // 2. Construir número de cotización
    const numero_cotizacion = `COTZ-${String(consecutivo).padStart(4, '0')}`;

    // 3. Calcular totales desde las líneas
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

    const total_cotizacion = Math.round((total_base + total_iva - total_retencion) * 100) / 100;

    // 4. Sincronizar el tercero
    const tercero = await TerceroService.sincronizarDesdeFactura(client, empresaId, cliente);

    // 5. Persistir cotización
    const cotizacionData = {
      consecutivo,
      numero_cotizacion,
      cliente_nombre   : cliente.nombre,
      cliente_documento: cliente.documento,
      cliente_email    : cliente.email    || null,
      cliente_telefono : cliente.telefono || null,
      cliente_direccion: cliente.direccion || null,
      cliente_ciudad   : cliente.ciudad   || null,
      tercero_id       : tercero.id,
      total_base     : Math.round(total_base * 100) / 100,
      total_iva      : Math.round(total_iva  * 100) / 100,
      total_retencion: Math.round(total_retencion * 100) / 100,
      total_cotizacion,
      observaciones,
    };

    return Cotizacion.create(client, empresaId, cotizacionData, lineasNormalizadas, usuarioId);
  }

  /**
   * Convertir cotización a factura electrónica.
   * Toma todos los datos de la cotización y crea una factura nueva,
   * respetando el consecutivo de FE.
   */
  static async convertirAFactura(client, empresaId, cotizacionId, usuarioId) {
    // 1. Obtener la cotización completa
    const cotizacion = await Cotizacion.findById(client, empresaId, cotizacionId);
    if (!cotizacion) throw new NotFoundError('Cotización');
    if (cotizacion.empresa_id !== empresaId) throw new TenantIsolationError();

    if (cotizacion.estado === 'FACTURADA') {
      throw new ConflictError('Esta cotización ya fue convertida a factura electrónica.');
    }
    if (cotizacion.estado === 'ANULADA') {
      throw new ConflictError('No se puede convertir una cotización anulada.');
    }

    // 2. Reservar consecutivo de factura
    const resolucion = await Empresa.nextConsecutivo(client, empresaId);
    const { consecutivo_actual: consecutivo, resolucion_prefijo, resolucion_numero } = resolucion;

    // 3. Construir número y CUFE demo
    const numero_factura = `${resolucion_prefijo}-${String(consecutivo).padStart(4, '0')}`;
    const cufe = generarCufeDemo(resolucion_prefijo, consecutivo, new Date());

    // 4. Crear la factura con los datos de la cotización
    const facturaData = {
      consecutivo,
      numero_factura,
      cufe,
      cliente_nombre   : cotizacion.cliente_nombre,
      cliente_documento: cotizacion.cliente_documento,
      cliente_email    : cotizacion.cliente_email,
      cliente_telefono : cotizacion.cliente_telefono,
      cliente_direccion: cotizacion.cliente_direccion,
      cliente_ciudad   : cotizacion.cliente_ciudad,
      tercero_id       : cotizacion.tercero_id,
      resolucion_numero,
      resolucion_prefijo,
      total_base       : cotizacion.total_base,
      total_iva        : cotizacion.total_iva,
      total_retencion  : cotizacion.total_retencion,
      total_factura    : cotizacion.total_cotizacion,
      medio_pago       : 'EFECTIVO',
      observaciones    : `Generada desde cotización ${cotizacion.numero_cotizacion}. ${cotizacion.observaciones || ''}`.trim(),
    };

    // Mapear líneas de cotización a líneas de factura
    const lineasFactura = (cotizacion.lineas || []).map(l => ({
      producto_id     : l.producto_id,
      codigo          : l.codigo,
      nombre          : l.nombre,
      unidad_medida   : l.unidad_medida,
      cantidad        : l.cantidad,
      valor_unitario  : l.valor_unitario,
      tarifa_iva      : l.tarifa_iva,
      tarifa_retencion: l.tarifa_retencion,
      base            : l.base,
      valor_iva       : l.valor_iva,
      valor_retencion : l.valor_retencion,
      total           : l.total,
    }));

    const factura = await Factura.create(client, empresaId, facturaData, lineasFactura, usuarioId);

    // 5. Marcar cotización como facturada
    await Cotizacion.updateEstado(client, empresaId, cotizacionId, 'FACTURADA');

    return { factura, cotizacion_estado: 'FACTURADA' };
  }

  static async cambiarEstado(client, empresaId, id, estado) {
    const estadosValidos = ['GUARDADA', 'FACTURADA', 'ANULADA'];
    if (!estadosValidos.includes(estado)) {
      throw new ValidationError(`Estado inválido. Permitidos: ${estadosValidos.join(', ')}`);
    }
    const result = await Cotizacion.updateEstado(client, empresaId, id, estado);
    if (!result) throw new NotFoundError('Cotización');
    return result;
  }

  static async estadisticas(client, empresaId) {
    return Cotizacion.stats(client, empresaId);
  }
}

/**
 * Genera un CUFE de demostración (no válido para DIAN real).
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

module.exports = CotizacionService;
