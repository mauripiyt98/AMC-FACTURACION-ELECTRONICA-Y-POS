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
}

module.exports = Empleado;
