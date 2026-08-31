'use strict';

const { NotFoundError, ConflictError, TenantIsolationError } = require('../utils/errors');

/**
 * Modelo Empresa — operaciones de base de datos para la tabla empresas.
 *
 * Las empresas son el "tenant root". No requieren filtro RLS porque
 * las operaciones de empresa se hacen con el superuser o con validación
 * explícita de empresa_id en la capa de servicio.
 */
class Empresa {
  /**
   * Obtener una empresa por ID.
   * Se usa la pool sin contexto RLS (las empresas no tienen RLS entre sí).
   */
  static async findById(client, id) {
    const { rows } = await client.query(
      `SELECT id, razon_social, nit, digito_verificacion, regimen_fiscal,
              tipo_persona, direccion, ciudad, departamento, telefono, email,
              logo_url, resolucion_numero, resolucion_prefijo,
              resolucion_desde, resolucion_hasta, resolucion_vigencia,
              consecutivo_actual, activa, plan, creado_en, actualizado_en
       FROM empresas
       WHERE id = $1`,
      [id]
    );
    return rows[0] || null;
  }

  /**
   * Obtener empresa por NIT.
   */
  static async findByNit(client, nit) {
    const { rows } = await client.query(
      `SELECT id, razon_social, nit, activa, plan
       FROM empresas WHERE nit = $1`,
      [nit]
    );
    return rows[0] || null;
  }

  /**
   * Crear nueva empresa (tenant).
   */
  static async create(client, data) {
    const {
      razon_social, nit, digito_verificacion, regimen_fiscal = 'SIMPLIFICADO',
      tipo_persona = 'NATURAL', direccion, ciudad, departamento,
      telefono, email, logo_url,
      resolucion_numero, resolucion_prefijo = 'FE',
      resolucion_desde = 1, resolucion_hasta = 1000, resolucion_vigencia,
      plan = 'BASICO',
    } = data;

    const { rows } = await client.query(
      `INSERT INTO empresas (
         razon_social, nit, digito_verificacion, regimen_fiscal,
         tipo_persona, direccion, ciudad, departamento, telefono, email, logo_url,
         resolucion_numero, resolucion_prefijo, resolucion_desde, resolucion_hasta,
         resolucion_vigencia, plan
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING *`,
      [
        razon_social, nit, digito_verificacion, regimen_fiscal,
        tipo_persona, direccion, ciudad, departamento, telefono, email, logo_url,
        resolucion_numero, resolucion_prefijo, resolucion_desde, resolucion_hasta,
        resolucion_vigencia, plan,
      ]
    );
    return rows[0];
  }

  /**
   * Actualizar datos de una empresa.
   * Se valida que el ID coincida (el servicio verifica empresa_id del JWT).
   */
  static async update(client, id, data) {
    const fields = [];
    const values = [];
    let idx = 1;

    const allowed = [
      'razon_social', 'regimen_fiscal', 'tipo_persona', 'direccion', 'ciudad',
      'departamento', 'telefono', 'email', 'logo_url', 'resolucion_numero',
      'resolucion_prefijo', 'resolucion_desde', 'resolucion_hasta',
      'resolucion_vigencia', 'plan',
    ];

    for (const key of allowed) {
      if (data[key] !== undefined) {
        fields.push(`${key} = $${idx++}`);
        values.push(data[key]);
      }
    }

    if (!fields.length) return this.findById(client, id);

    values.push(id);
    const { rows } = await client.query(
      `UPDATE empresas SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    return rows[0] || null;
  }

  /**
   * Obtener y bloquear el siguiente consecutivo de factura (SELECT FOR UPDATE).
   * Garantiza que no haya duplicados en entornos de alta concurrencia.
   */
  static async nextConsecutivo(client, empresaId) {
    const { rows } = await client.query(
      `UPDATE empresas
       SET consecutivo_actual = consecutivo_actual + 1
       WHERE id = $1
       RETURNING consecutivo_actual, resolucion_prefijo,
                 resolucion_desde, resolucion_hasta, resolucion_numero`,
      [empresaId]
    );
    if (!rows[0]) throw new NotFoundError('Empresa');

    const { consecutivo_actual, resolucion_hasta } = rows[0];
    if (consecutivo_actual > resolucion_hasta) {
      throw new ConflictError(
        `El rango de resolución DIAN (${rows[0].resolucion_desde}–${resolucion_hasta}) ha sido agotado. Configure una nueva resolución.`
      );
    }
    return rows[0];
  }

  /**
   * Obtener y bloquear el siguiente consecutivo de cotización (SELECT FOR UPDATE).
   * Rango fijo: COTZ-0001 a COTZ-1000.
   */
  static async nextConsecutivoCotizacion(client, empresaId) {
    const { rows } = await client.query(
      `UPDATE empresas
       SET consecutivo_cotizacion = consecutivo_cotizacion + 1
       WHERE id = $1
       RETURNING consecutivo_cotizacion`,
      [empresaId]
    );
    if (!rows[0]) throw new NotFoundError('Empresa');

    const { consecutivo_cotizacion } = rows[0];
    if (consecutivo_cotizacion > 1000) {
      throw new ConflictError(
        'El rango de cotizaciones (COTZ-0001 a COTZ-1000) ha sido agotado.'
      );
    }
    return { consecutivo_cotizacion };
  }
}

module.exports = Empresa;
