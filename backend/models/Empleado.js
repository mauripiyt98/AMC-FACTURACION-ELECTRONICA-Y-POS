'use strict';

const { ConflictError } = require('../utils/errors');

class Empleado {
  static async findAll(client, empresaId, { search = '', limit = 50, offset = 0 } = {}) {
    const params = [empresaId];
    let where = 'WHERE empresa_id = $1 AND activo = TRUE';
    if (search.trim().length >= 2) {
      params.push(`%${search.trim()}%`);
      where += ` AND (nombre ILIKE $${params.length} OR documento ILIKE $${params.length})`;
    }
    params.push(limit, offset);
    const { rows } = await client.query(
      `SELECT id, nombre, documento, ciudad, fecha_inicio_contrato, tipo_contrato,
              salario, cargo, creado_en, actualizado_en
       FROM empleados ${where} ORDER BY nombre ASC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return rows;
  }

  static async create(client, empresaId, data) {
    try {
      const { rows } = await client.query(
        `INSERT INTO empleados (
          empresa_id, nombre, documento, email, telefono, ciudad, direccion, cuenta_bancaria,
          fecha_inicio_contrato, tipo_contrato, salario, numero_contrato, cargo, tipo_cotizante,
          fondo_salud, fondo_pension, caja_compensacion, arl, nivel_riesgo_arl
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
        RETURNING *`,
        [empresaId, data.nombre, data.documento, data.email, data.telefono, data.ciudad,
          data.direccion, data.cuenta_bancaria, data.fecha_inicio_contrato, data.tipo_contrato,
          data.salario, data.numero_contrato, data.cargo, data.tipo_cotizante, data.fondo_salud,
          data.fondo_pension, data.caja_compensacion, data.arl, data.nivel_riesgo_arl]
      );
      return rows[0];
    } catch (error) {
      if (error.code === '23505') throw new ConflictError('Ya existe un empleado con ese documento.');
      throw error;
    }
  }

  static async findById(client, empresaId, id) {
    const { rows } = await client.query(
      `SELECT id, nombre, documento, email, telefono, ciudad, direccion, cuenta_bancaria,
              fecha_inicio_contrato, tipo_contrato, salario, numero_contrato, cargo,
              tipo_cotizante, fondo_salud, fondo_pension, caja_compensacion, arl,
              nivel_riesgo_arl, creado_en, actualizado_en
       FROM empleados
       WHERE id = $1 AND empresa_id = $2 AND activo = TRUE`,
      [id, empresaId]
    );
    return rows[0] || null;
  }

  static async update(client, empresaId, id, data) {
    try {
      const { rows } = await client.query(
        `UPDATE empleados SET
          nombre = $3, documento = $4, email = $5, telefono = $6, ciudad = $7,
          direccion = $8, cuenta_bancaria = $9, fecha_inicio_contrato = $10,
          tipo_contrato = $11, salario = $12, numero_contrato = $13, cargo = $14,
          tipo_cotizante = $15, fondo_salud = $16, fondo_pension = $17,
          caja_compensacion = $18, arl = $19, nivel_riesgo_arl = $20,
          actualizado_en = NOW()
         WHERE id = $1 AND empresa_id = $2 AND activo = TRUE
         RETURNING *`,
        [id, empresaId, data.nombre, data.documento, data.email, data.telefono, data.ciudad,
          data.direccion, data.cuenta_bancaria, data.fecha_inicio_contrato, data.tipo_contrato,
          data.salario, data.numero_contrato, data.cargo, data.tipo_cotizante, data.fondo_salud,
          data.fondo_pension, data.caja_compensacion, data.arl, data.nivel_riesgo_arl]
      );
      return rows[0] || null;
    } catch (error) {
      if (error.code === '23505') throw new ConflictError('Ya existe un empleado con ese documento.');
      throw error;
    }
  }
}

module.exports = Empleado;
