'use strict';

const { ConflictError, NotFoundError } = require('../utils/errors');

class NominaElectronica {
  static async nextConsecutivo(client, empresaId) {
    const { rows } = await client.query(
      `UPDATE empresas SET nomina_consecutivo_actual = nomina_consecutivo_actual + 1
       WHERE id = $1
       RETURNING nomina_consecutivo_actual`,
      [empresaId]
    );
    if (!rows[0]) throw new NotFoundError('Empresa');
    if (rows[0].nomina_consecutivo_actual > 1000) {
      throw new ConflictError('El rango de nómina electrónica NE001 a NE1000 ya fue consumido.');
    }
    return rows[0].nomina_consecutivo_actual;
  }

  static async create(client, empresaId, data, usuarioId) {
    const { rows } = await client.query(
      `INSERT INTO nominas_electronicas (
        empresa_id, consecutivo, numero_nomina, cude,
        empleado_nombre, empleado_documento, empleado_cargo, empleado_cuenta,
        salario, bonificaciones, auxilio_transporte, deduccion_salud,
        deduccion_pension, deduccion_fsp, neto_pagar, creado_por
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
      RETURNING *`,
      [
        empresaId, data.consecutivo, data.numero_nomina, data.cude,
        data.empleado_nombre, data.empleado_documento, data.empleado_cargo, data.empleado_cuenta,
        data.salario, data.bonificaciones, data.auxilio_transporte, data.deduccion_salud,
        data.deduccion_pension, data.deduccion_fsp, data.neto_pagar, usuarioId,
      ]
    );
    return rows[0];
  }

  static async findAll(client, empresaId, { limit = 100, offset = 0 } = {}) {
    const { rows } = await client.query(
      `SELECT id, consecutivo, numero_nomina, cude, empleado_nombre, empleado_documento,
              empleado_cargo, empleado_cuenta, salario, bonificaciones, auxilio_transporte,
              deduccion_salud, deduccion_pension, deduccion_fsp, neto_pagar, estado, generado_en
       FROM nominas_electronicas
       WHERE empresa_id = $1
       ORDER BY generado_en DESC
       LIMIT $2 OFFSET $3`,
      [empresaId, limit, offset]
    );
    return rows;
  }
}

module.exports = NominaElectronica;
