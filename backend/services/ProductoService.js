'use strict';

const Producto = require('../models/Producto');
const { NotFoundError, TenantIsolationError } = require('../utils/errors');

/**
 * Servicio CRUD de Productos/Servicios.
 * Todas las operaciones están ligadas al empresa_id del JWT.
 */
class ProductoService {
  static async listar(client, empresaId, opts = {}) {
    return Producto.findAll(client, empresaId, opts);
  }

  static async obtener(client, empresaId, id) {
    const producto = await Producto.findById(client, empresaId, id);
    if (!producto) throw new NotFoundError('Producto');
    if (producto.empresa_id !== empresaId) throw new TenantIsolationError();
    return producto;
  }

  static async crear(client, empresaId, data) {
    return Producto.create(client, empresaId, data);
  }

  static async actualizar(client, empresaId, id, data) {
    const existing = await Producto.findById(client, empresaId, id);
    if (!existing) throw new NotFoundError('Producto');
    if (existing.empresa_id !== empresaId) throw new TenantIsolationError();

    const updated = await Producto.update(client, empresaId, id, data);
    if (!updated) throw new NotFoundError('Producto');
    return updated;
  }

  static async ajustarStock(client, empresaId, id, data, usuarioId) {
    const existing = await Producto.findById(client, empresaId, id);
    if (!existing) throw new NotFoundError('Producto');
    if (existing.empresa_id !== empresaId) throw new TenantIsolationError();

    const updated = await Producto.ajustarStock(client, empresaId, id, {
      ...data,
      usuarioId
    });
    if (!updated) throw new NotFoundError('Producto');
    return updated;
  }

  static async obtenerMovimientos(client, empresaId, id, limit = 50) {
    const existing = await Producto.findById(client, empresaId, id);
    if (!existing) throw new NotFoundError('Producto');
    if (existing.empresa_id !== empresaId) throw new TenantIsolationError();

    return Producto.obtenerMovimientos(client, empresaId, id, limit);
  }

  static async eliminar(client, empresaId, id) {
    const existing = await Producto.findById(client, empresaId, id);
    if (!existing) throw new NotFoundError('Producto');
    if (existing.empresa_id !== empresaId) throw new TenantIsolationError();

    const result = await Producto.deactivate(client, empresaId, id);
    if (!result) throw new NotFoundError('Producto');
    return result;
  }
}

module.exports = ProductoService;
