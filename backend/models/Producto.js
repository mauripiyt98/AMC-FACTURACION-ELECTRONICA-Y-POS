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
              p.unidad_medida, p.precio_base, p.activo, p.creado_en, p.actualizado_en
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
      `SELECT * FROM productos
       WHERE id = $1 AND empresa_id = $2`,
      [id, empresaId]
    );
    return rows[0] || null;
  }

  /**
   * Buscar por código dentro de la empresa.
   */
  static async findByCodigo(client, empresaId, codigo) {
    const { rows } = await client.query(
      `SELECT * FROM productos
       WHERE empresa_id = $1 AND codigo = $2 AND activo = TRUE`,
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
    } = data;

    const { rows } = await client.query(
      `INSERT INTO productos
         (empresa_id, nombre, codigo, tipo, iva, unidad_medida, precio_base)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [empresaId, nombre, codigo, tipo, iva, unidad_medida, precio_base]
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

    const allowed = ['nombre', 'codigo', 'tipo', 'iva', 'unidad_medida', 'precio_base', 'activo'];
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
