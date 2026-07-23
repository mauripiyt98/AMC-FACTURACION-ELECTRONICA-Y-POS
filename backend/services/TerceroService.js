'use strict';

const Tercero = require('../models/Tercero');
const { NotFoundError, TenantIsolationError } = require('../utils/errors');

/**
 * Servicio CRUD de Terceros (Clientes/Proveedores).
 * Todas las operaciones están ligadas al empresa_id del JWT.
 */
class TerceroService {
  static async listar(client, empresaId, opts = {}) {
    return Tercero.findAll(client, empresaId, opts);
  }

  static async obtener(client, empresaId, id) {
    const tercero = await Tercero.findById(client, empresaId, id);
    if (!tercero) throw new NotFoundError('Tercero');
    // Doble verificación de aislamiento (extra de seguridad)
    if (tercero.empresa_id !== empresaId) throw new TenantIsolationError();
    return tercero;
  }

  static async crear(client, empresaId, data) {
    return Tercero.create(client, empresaId, data);
  }

  static async sincronizarDesdeFactura(client, empresaId, data) {
    return Tercero.upsertFromInvoice(client, empresaId, data);
  }

  static async actualizar(client, empresaId, id, data) {
    // Verificar existencia primero
    const existing = await Tercero.findById(client, empresaId, id);
    if (!existing) throw new NotFoundError('Tercero');
    if (existing.empresa_id !== empresaId) throw new TenantIsolationError();

    const updated = await Tercero.update(client, empresaId, id, data);
    if (!updated) throw new NotFoundError('Tercero');
    return updated;
  }

  static async eliminar(client, empresaId, id) {
    const existing = await Tercero.findById(client, empresaId, id);
    if (!existing) throw new NotFoundError('Tercero');
    if (existing.empresa_id !== empresaId) throw new TenantIsolationError();

    const result = await Tercero.deactivate(client, empresaId, id);
    if (!result) throw new NotFoundError('Tercero');
    return result;
  }
}

module.exports = TerceroService;
