'use strict';

/**
 * Modelo Cotizacion — cotizaciones por empresa.
 * La tabla está particionada por empresa_id (HASH, 16 particiones).
 * Todas las queries incluyen empresa_id explícitamente.
 */
class Cotizacion {
  /**
   * Listar cotizaciones de una empresa.
   */
  static async findAll(client, empresaId, {
    search = '', estado, limit = 50, offset = 0,
    desde, hasta,
  } = {}) {
    const params = [empresaId];
    let where = 'WHERE c.empresa_id = $1';

    if (estado) {
      params.push(estado);
      where += ` AND c.estado = $${params.length}`;
    }

    if (search && search.trim().length >= 2) {
      const s = `%${search.trim()}%`;
      params.push(s);
      where += ` AND (c.numero_cotizacion ILIKE $${params.length}
                   OR c.cliente_nombre ILIKE $${params.length}
                   OR c.cliente_documento ILIKE $${params.length})`;
    }

    if (desde) {
      params.push(desde);
      where += ` AND c.generado_en >= $${params.length}`;
    }

    if (hasta) {
      params.push(hasta);
      where += ` AND c.generado_en <= $${params.length}`;
    }

    params.push(limit, offset);
    const { rows } = await client.query(
      `SELECT c.id, c.empresa_id, c.consecutivo, c.numero_cotizacion,
              c.cliente_nombre, c.cliente_documento, c.cliente_email,
              c.cliente_telefono, c.cliente_direccion, c.cliente_ciudad,
              c.tercero_id,
              c.total_base, c.total_iva, c.total_retencion, c.total_cotizacion,
              c.observaciones, c.estado, c.generado_en, c.actualizado_en,
              u.nombre AS creado_por_nombre
       FROM cotizaciones c
       LEFT JOIN usuarios u ON u.id = c.creado_por
       ${where}
       ORDER BY c.generado_en DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return rows;
  }

  /**
   * Obtener cotización completa con sus líneas.
   */
  static async findById(client, empresaId, id) {
    const { rows: cotizacionRows } = await client.query(
      `SELECT c.*, u.nombre AS creado_por_nombre
       FROM cotizaciones c
       LEFT JOIN usuarios u ON u.id = c.creado_por
       WHERE c.id = $1 AND c.empresa_id = $2`,
      [id, empresaId]
    );
    if (!cotizacionRows[0]) return null;

    const { rows: lineasRows } = await client.query(
      `SELECT * FROM lineas_cotizacion
       WHERE cotizacion_id = $1 AND empresa_id = $2
       ORDER BY numero_linea ASC`,
      [id, empresaId]
    );

    return { ...cotizacionRows[0], lineas: lineasRows };
  }

  /**
   * Crear cotización completa (cabecera + líneas) en una sola transacción.
   */
  static async create(client, empresaId, data, lineas, usuarioId) {
    const {
      consecutivo, numero_cotizacion,
      cliente_nombre, cliente_documento, cliente_email, cliente_telefono,
      cliente_direccion, cliente_ciudad, tercero_id,
      total_base, total_iva, total_retencion, total_cotizacion,
      observaciones,
    } = data;

    const { rows: [cotizacion] } = await client.query(
      `INSERT INTO cotizaciones (
         empresa_id, consecutivo, numero_cotizacion,
         cliente_nombre, cliente_documento, cliente_email, cliente_telefono,
         cliente_direccion, cliente_ciudad, tercero_id,
         total_base, total_iva, total_retencion, total_cotizacion,
         observaciones, creado_por
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING *`,
      [
        empresaId, consecutivo, numero_cotizacion,
        cliente_nombre, cliente_documento, cliente_email, cliente_telefono,
        cliente_direccion, cliente_ciudad, tercero_id || null,
        total_base, total_iva, total_retencion, total_cotizacion,
        observaciones || null, usuarioId,
      ]
    );

    for (let i = 0; i < lineas.length; i++) {
      const l = lineas[i];
      await client.query(
        `INSERT INTO lineas_cotizacion (
           empresa_id, cotizacion_id, numero_linea, producto_id,
           codigo, nombre, unidad_medida, cantidad, valor_unitario,
           tarifa_iva, tarifa_retencion, base, valor_iva, valor_retencion, total
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [
          empresaId, cotizacion.id, i + 1, l.producto_id || null,
          l.codigo || null, l.nombre, l.unidad_medida || 'UNIDAD',
          l.cantidad, l.valor_unitario,
          l.tarifa_iva || 0, l.tarifa_retencion || 0,
          l.base, l.valor_iva || 0, l.valor_retencion || 0, l.total,
        ]
      );
    }

    return { ...cotizacion, lineas };
  }

  /**
   * Cambiar estado de una cotización.
   */
  static async updateEstado(client, empresaId, id, estado) {
    const { rows } = await client.query(
      `UPDATE cotizaciones SET estado = $1
       WHERE id = $2 AND empresa_id = $3
       RETURNING id, consecutivo, numero_cotizacion, estado`,
      [estado, id, empresaId]
    );
    return rows[0] || null;
  }

  /**
   * Estadísticas de cotizaciones de una empresa.
   */
  static async stats(client, empresaId) {
    const { rows } = await client.query(
      `SELECT
         COUNT(*)                                        AS total_cotizaciones,
         COALESCE(SUM(total_cotizacion), 0)             AS suma_total,
         COUNT(*) FILTER (WHERE estado = 'GUARDADA')    AS guardadas,
         COUNT(*) FILTER (WHERE estado = 'FACTURADA')   AS facturadas,
         COUNT(*) FILTER (WHERE estado = 'ANULADA')     AS anuladas,
         MAX(consecutivo)                               AS ultimo_consecutivo
       FROM cotizaciones
       WHERE empresa_id = $1`,
      [empresaId]
    );
    return rows[0];
  }
}

module.exports = Cotizacion;
