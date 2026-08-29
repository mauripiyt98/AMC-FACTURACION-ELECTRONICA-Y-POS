'use strict';

/**
 * Modelo Factura — facturas electrónicas por empresa.
 * La tabla está particionada por empresa_id (HASH, 16 particiones).
 * Todas las queries incluyen empresa_id explícitamente.
 */
class Factura {
  /**
   * Listar facturas de una empresa.
   */
  static async findAll(client, empresaId, {
    search = '', estado, limit = 50, offset = 0,
    desde, hasta,
  } = {}) {
    const params = [empresaId];
    let where = 'WHERE f.empresa_id = $1';

    if (estado) {
      params.push(estado);
      where += ` AND f.estado = $${params.length}`;
    }

    if (search && search.trim().length >= 2) {
      const s = `%${search.trim()}%`;
      params.push(s);
      where += ` AND (f.numero_factura ILIKE $${params.length}
                   OR f.cliente_nombre ILIKE $${params.length}
                   OR f.cliente_documento ILIKE $${params.length})`;
    }

    if (desde) {
      params.push(desde);
      where += ` AND f.generado_en >= $${params.length}`;
    }

    if (hasta) {
      params.push(hasta);
      where += ` AND f.generado_en <= $${params.length}`;
    }

    params.push(limit, offset);
    const { rows } = await client.query(
      `SELECT f.id, f.empresa_id, f.consecutivo, f.numero_factura, f.cufe,
              f.cliente_nombre, f.cliente_documento, f.cliente_email,
              f.total_base, f.total_iva, f.total_retencion, f.total_factura,
              f.medio_pago, f.estado, f.generado_en, f.actualizado_en,
              u.nombre AS creado_por_nombre
       FROM facturas f
       LEFT JOIN usuarios u ON u.id = f.creado_por
       ${where}
       ORDER BY f.generado_en DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return rows;
  }

  /**
   * Obtener factura completa con sus líneas.
   */
  static async findById(client, empresaId, id) {
    const { rows: facturaRows } = await client.query(
      `SELECT f.*, u.nombre AS creado_por_nombre
       FROM facturas f
       LEFT JOIN usuarios u ON u.id = f.creado_por
       WHERE f.id = $1 AND f.empresa_id = $2`,
      [id, empresaId]
    );
    if (!facturaRows[0]) return null;

    const { rows: lineasRows } = await client.query(
      `SELECT * FROM lineas_factura
       WHERE factura_id = $1 AND empresa_id = $2
       ORDER BY numero_linea ASC`,
      [id, empresaId]
    );

    return { ...facturaRows[0], lineas: lineasRows };
  }

  /**
   * Crear factura completa (cabecera + líneas) en una sola transacción.
   * El consecutivo ya fue obtenido del modelo Empresa.nextConsecutivo().
   */
  static async create(client, empresaId, data, lineas, usuarioId) {
    const {
      consecutivo, numero_factura, cufe,
      cliente_nombre, cliente_documento, cliente_email, cliente_telefono,
      cliente_direccion, cliente_ciudad, tercero_id,
      resolucion_numero, resolucion_prefijo,
      total_base, total_iva, total_retencion, total_factura,
      medio_pago, observaciones,
    } = data;

    // Insertar cabecera
    const { rows: [factura] } = await client.query(
      `INSERT INTO facturas (
         empresa_id, consecutivo, numero_factura, cufe,
         cliente_nombre, cliente_documento, cliente_email, cliente_telefono,
         cliente_direccion, cliente_ciudad, tercero_id,
         resolucion_numero, resolucion_prefijo,
         total_base, total_iva, total_retencion, total_factura,
         medio_pago, observaciones, creado_por
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
       RETURNING *`,
      [
        empresaId, consecutivo, numero_factura, cufe,
        cliente_nombre, cliente_documento, cliente_email, cliente_telefono,
        cliente_direccion, cliente_ciudad, tercero_id || null,
        resolucion_numero, resolucion_prefijo,
        total_base, total_iva, total_retencion, total_factura,
        medio_pago, observaciones || null, usuarioId,
      ]
    );

    // Insertar líneas
    for (let i = 0; i < lineas.length; i++) {
      const l = lineas[i];
      await client.query(
        `INSERT INTO lineas_factura (
           empresa_id, factura_id, numero_linea, producto_id,
           codigo, nombre, unidad_medida, cantidad, valor_unitario,
           tarifa_iva, tarifa_retencion, base, valor_iva, valor_retencion, total
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [
          empresaId, factura.id, i + 1, l.producto_id || null,
          l.codigo || null, l.nombre, l.unidad_medida || 'UNIDAD',
          l.cantidad, l.valor_unitario,
          l.tarifa_iva || 0, l.tarifa_retencion || 0,
          l.base, l.valor_iva || 0, l.valor_retencion || 0, l.total,
        ]
      );
    }

    return { ...factura, lineas };
  }

  /**
   * Cambiar estado de una factura (GUARDADA → ENVIADA → ACEPTADA | RECHAZADA | ANULADA).
   */
  static async updateEstado(client, empresaId, id, estado) {
    const { rows } = await client.query(
      `UPDATE facturas SET estado = $1
       WHERE id = $2 AND empresa_id = $3
       RETURNING id, consecutivo, numero_factura, estado`,
      [estado, id, empresaId]
    );
    return rows[0] || null;
  }

  /**
   * Estadísticas de facturación de una empresa.
   */
  static async stats(client, empresaId) {
    const { rows } = await client.query(
      `SELECT
         COUNT(*)                                        AS total_facturas,
         COALESCE(SUM(total_factura), 0)                AS suma_total,
         COALESCE(SUM(total_iva), 0)                    AS suma_iva,
         COUNT(*) FILTER (WHERE estado = 'ENVIADA')     AS enviadas,
         COUNT(*) FILTER (WHERE estado = 'ACEPTADA')    AS aceptadas,
         COUNT(*) FILTER (WHERE estado = 'ANULADA')     AS anuladas,
         MAX(consecutivo)                               AS ultimo_consecutivo
       FROM facturas
       WHERE empresa_id = $1`,
      [empresaId]
    );
    return rows[0];
  }

  /**
   * Acumula las ventas por cliente dentro de un rango de fechas.
   * Los descuentos aún no se persisten en el modelo de factura, por lo que
   * se exponen como cero hasta que se habilite ese concepto en facturación.
   */
  static async ventasPorCliente(client, empresaId, { desde, hasta, terceroId } = {}) {
    const params = [empresaId];
    let where = 'WHERE f.empresa_id = $1 AND f.estado != \'ANULADA\'';

    if (desde) {
      params.push(desde);
      where += ` AND f.generado_en >= $${params.length}::date`;
    }
    if (hasta) {
      params.push(hasta);
      // Incluir todo el día final, sin depender de la hora de generación.
      where += ` AND f.generado_en < ($${params.length}::date + INTERVAL '1 day')`;
    }
    if (terceroId) {
      params.push(terceroId);
      where += ` AND f.tercero_id = $${params.length}`;
    }

    const { rows } = await client.query(
      `SELECT
         COALESCE(f.tercero_id::text, f.cliente_documento) AS cliente_id,
         f.cliente_documento,
         MAX(f.cliente_nombre) AS cliente_nombre,
         COUNT(*)::int AS numero_facturas,
         COALESCE(SUM(f.total_base), 0) AS valor_bruto,
         0::numeric AS descuentos,
         COALESCE(SUM(f.total_base), 0) AS subtotal,
         COALESCE(SUM(f.total_iva), 0) AS iva,
         COALESCE(SUM(f.total_retencion), 0) AS retenciones,
         COALESCE(SUM(f.total_factura), 0) AS total
       FROM facturas f
       ${where}
       GROUP BY COALESCE(f.tercero_id::text, f.cliente_documento), f.cliente_documento
       ORDER BY total DESC, cliente_nombre ASC`,
      params
    );
    return rows;
  }

  /** Acumula líneas facturadas por producto o servicio dentro de un período. */
  static async ventasPorProducto(client, empresaId, { desde, hasta, productoId } = {}) {
    const params = [empresaId];
    let where = "WHERE f.empresa_id = $1 AND lf.empresa_id = $1 AND f.estado != 'ANULADA'";

    if (desde) {
      params.push(desde);
      where += ` AND f.generado_en >= $${params.length}::date`;
    }
    if (hasta) {
      params.push(hasta);
      where += ` AND f.generado_en < ($${params.length}::date + INTERVAL '1 day')`;
    }
    if (productoId) {
      params.push(productoId);
      where += ` AND lf.producto_id = $${params.length}`;
    }

    const { rows } = await client.query(
      `SELECT
         COALESCE(lf.producto_id::text, CONCAT(COALESCE(lf.codigo, ''), ':', lf.nombre)) AS producto_id,
         COALESCE(lf.codigo, 'SIN-CÓDIGO') AS producto_codigo,
         MAX(lf.nombre) AS producto_nombre,
         COALESCE(MAX(p.tipo), 'PRODUCTO / SERVICIO') AS tipo,
         COALESCE(SUM(lf.cantidad), 0) AS cantidad_total,
         COALESCE(SUM(lf.base), 0) AS valor_bruto,
         COALESCE(SUM(lf.valor_iva), 0) AS iva,
         COALESCE(SUM(lf.valor_retencion), 0) AS retenciones,
         COALESCE(SUM(lf.total), 0) AS total
       FROM facturas f
       INNER JOIN lineas_factura lf ON lf.factura_id = f.id AND lf.empresa_id = f.empresa_id
       LEFT JOIN productos p ON p.id = lf.producto_id AND p.empresa_id = lf.empresa_id
       ${where}
       GROUP BY COALESCE(lf.producto_id::text, CONCAT(COALESCE(lf.codigo, ''), ':', lf.nombre)), COALESCE(lf.codigo, 'SIN-CÓDIGO')
       ORDER BY total DESC, producto_nombre ASC`,
      params
    );
    return rows;
  }
}

module.exports = Factura;
