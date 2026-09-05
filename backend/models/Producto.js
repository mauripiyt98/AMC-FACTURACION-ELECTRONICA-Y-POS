'use strict';

/**
 * Modelo Producto — catálogo de productos/servicios por empresa.
 * Todas las queries incluyen empresa_id explícitamente.
 */
class Producto {
  /**
   * Listar productos de una empresa con búsqueda opcional.
   */
  static async findAll(client, empresaId, { search = '', tipo, soloActivos = true, limit = 100, offset = 0 } = {}) {
    const params = [empresaId];
    let where = 'WHERE p.empresa_id = $1';

    if (soloActivos) where += ` AND p.activo = TRUE`;

    if (tipo) {
      params.push(tipo);
      where += ` AND p.tipo = $${params.length}`;
    }

    if (search && search.trim().length >= 2) {
      params.push(`%${search.trim()}%`);
      where += ` AND (p.nombre ILIKE $${params.length} OR p.codigo ILIKE $${params.length})`;
    }

    params.push(limit, offset);
    const { rows } = await client.query(
      `SELECT p.id, p.empresa_id, p.nombre, p.codigo, p.tipo, p.iva,
              p.unidad_medida, p.precio_base, p.stock_total, p.stock_minimo,
              p.activo, p.creado_en, p.actualizado_en
       FROM productos p
       ${where}
       ORDER BY p.nombre ASC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return rows;
  }

  /**
   * Buscar producto por ID, validando empresa_id.
   */
  static async findById(client, empresaId, id) {
    const { rows } = await client.query(
      `SELECT p.id, p.empresa_id, p.nombre, p.codigo, p.tipo, p.iva,
              p.unidad_medida, p.precio_base, p.stock_total, p.stock_minimo,
              p.activo, p.creado_en, p.actualizado_en
       FROM productos p
       WHERE p.id = $1 AND p.empresa_id = $2`,
      [id, empresaId]
    );
    return rows[0] || null;
  }

  /**
   * Buscar por código dentro de la empresa.
   */
  static async findByCodigo(client, empresaId, codigo) {
    const { rows } = await client.query(
      `SELECT p.id, p.empresa_id, p.nombre, p.codigo, p.tipo, p.iva,
              p.unidad_medida, p.precio_base, p.stock_total, p.stock_minimo,
              p.activo, p.creado_en, p.actualizado_en
       FROM productos p
       WHERE p.empresa_id = $1 AND p.codigo = $2 AND p.activo = TRUE`,
      [empresaId, codigo]
    );
    return rows[0] || null;
  }

  /**
   * Crear nuevo producto.
   */
  static async create(client, empresaId, data) {
    const {
      nombre, codigo, tipo = 'PRODUCTO',
      iva = 19, unidad_medida = 'UNIDAD', precio_base,
      stock_total = 0, stock_minimo = 0,
    } = data;

    const { rows } = await client.query(
      `INSERT INTO productos
         (empresa_id, nombre, codigo, tipo, iva, unidad_medida, precio_base, stock_total, stock_minimo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [empresaId, nombre, codigo, tipo, iva, unidad_medida, precio_base, stock_total, stock_minimo]
    );
    return rows[0];
  }

  /**
   * Actualizar producto — valida empresa_id.
   */
  static async update(client, empresaId, id, data) {
    const fields = [];
    const values = [];
    let idx = 1;

    const allowed = ['nombre', 'codigo', 'tipo', 'iva', 'unidad_medida', 'precio_base', 'stock_total', 'stock_minimo', 'activo'];
    for (const key of allowed) {
      if (data[key] !== undefined) {
        fields.push(`${key} = $${idx++}`);
        values.push(data[key]);
      }
    }
    if (!fields.length) return this.findById(client, empresaId, id);

    values.push(id, empresaId);
    const { rows } = await client.query(
      `UPDATE productos SET ${fields.join(', ')}
       WHERE id = $${idx} AND empresa_id = $${idx + 1}
       RETURNING *`,
      values
    );
    return rows[0] || null;
  }

  /**
   * Ajustar stock manualmente con registro de kardex.
   */
  static async ajustarStock(client, empresaId, id, { nuevoStock, stockMinimo, tipoMovimiento = 'AJUSTE_MANUAL', motivo = 'Ajuste manual', referencia = '', usuarioId = null }) {
    const prod = await this.findById(client, empresaId, id);
    if (!prod) return null;

    const stockAnterior = Number(prod.stock_total || 0);
    const stockFinal = Number(nuevoStock);
    const diferencia = stockFinal - stockAnterior;

    const updateFields = ['stock_total = $1'];
    const updateValues = [stockFinal];
    let idx = 2;

    if (stockMinimo !== undefined) {
      updateFields.push(`stock_minimo = $${idx++}`);
      updateValues.push(Number(stockMinimo));
    }

    updateValues.push(id, empresaId);
    const { rows } = await client.query(
      `UPDATE productos SET ${updateFields.join(', ')}
       WHERE id = $${idx} AND empresa_id = $${idx + 1}
       RETURNING *`,
      updateValues
    );

    // Registrar en kardex
    await client.query(
      `INSERT INTO inventario_movimientos
         (empresa_id, producto_id, tipo_movimiento, cantidad, stock_anterior, stock_nuevo, referencia, motivo, creado_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [empresaId, id, tipoMovimiento, diferencia, stockAnterior, stockFinal, referencia, motivo, usuarioId]
    );

    return rows[0];
  }

  /**
   * Descontar stock por venta de factura / POS.
   */
  static async descontarStockPorVenta(client, empresaId, lineas, referencia = '', usuarioId = null) {
    const resultados = [];
    for (const linea of lineas) {
      const cantidad = Number(linea.cantidad || 0);
      if (cantidad <= 0) continue;

      let prod = null;
      if (linea.producto_id) {
        prod = await this.findById(client, empresaId, linea.producto_id);
      } else if (linea.codigo) {
        prod = await this.findByCodigo(client, empresaId, linea.codigo);
      }

      if (prod) {
        const stockAnterior = Number(prod.stock_total || 0);
        const stockNuevo = stockAnterior - cantidad;

        await client.query(
          `UPDATE productos SET stock_total = $1
           WHERE id = $2 AND empresa_id = $3`,
          [stockNuevo, prod.id, empresaId]
        );

        await client.query(
          `INSERT INTO inventario_movimientos
             (empresa_id, producto_id, tipo_movimiento, cantidad, stock_anterior, stock_nuevo, referencia, motivo, creado_por)
           VALUES ($1, $2, 'SALIDA_VENTA', $3, $4, $5, $6, $7, $8)`,
          [empresaId, prod.id, -cantidad, stockAnterior, stockNuevo, referencia, `Venta generada ${referencia}`, usuarioId]
        );

        resultados.push({ id: prod.id, nombre: prod.nombre, stockAnterior, stockNuevo });
      }
    }
    return resultados;
  }

  /**
   * Obtener historial de movimientos de inventario de un producto.
   */
  static async obtenerMovimientos(client, empresaId, productoId, limit = 50) {
    const { rows } = await client.query(
      `SELECT m.id, m.empresa_id, m.producto_id, m.tipo_movimiento,
              m.cantidad, m.stock_anterior, m.stock_nuevo, m.referencia,
              m.motivo, m.creado_por, m.creado_en, u.nombre AS usuario_nombre
       FROM inventario_movimientos m
       LEFT JOIN usuarios u ON u.id = m.creado_por
       WHERE m.empresa_id = $1 AND m.producto_id = $2
       ORDER BY m.creado_en DESC
       LIMIT $3`,
      [empresaId, productoId, limit]
    );
    return rows;
  }

  /**
   * Soft delete.
   */
  static async deactivate(client, empresaId, id) {
    const { rows } = await client.query(
      `UPDATE productos SET activo = FALSE
       WHERE id = $1 AND empresa_id = $2
       RETURNING id, nombre`,
      [id, empresaId]
    );
    return rows[0] || null;
  }

  /**
   * Contar productos de una empresa.
   */
  static async count(client, empresaId) {
    const { rows } = await client.query(
      `SELECT COUNT(*) AS total FROM productos WHERE empresa_id = $1 AND activo = TRUE`,
      [empresaId]
    );
    return Number(rows[0].total);
  }
}

module.exports = Producto;
