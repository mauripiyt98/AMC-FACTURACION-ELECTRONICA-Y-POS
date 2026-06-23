'use strict';

/**
 * Modelo Usuario — operaciones sobre la tabla usuarios.
 *
 * Todas las queries incluyen empresa_id explícitamente (triple seguridad:
 * middleware → RLS → query explícita).
 */
class Usuario {
  /**
   * Buscar usuario por empresa_id + codigo (para login).
   * Esta query se ejecuta SIN contexto RLS (antes de autenticar).
   */
  static async findByEmpresaAndCodigo(client, empresaId, codigo) {
    const { rows } = await client.query(
      `SELECT id, empresa_id, nombre, codigo, email, password_hash, rol, activo, ultimo_acceso
       FROM usuarios
       WHERE empresa_id = $1 AND codigo = $2`,
      [empresaId, codigo]
    );
    return rows[0] || null;
  }

  /**
   * Buscar usuario por ID dentro de una empresa.
   */
  static async findById(client, empresaId, id) {
    const { rows } = await client.query(
      `SELECT id, empresa_id, nombre, codigo, email, rol, activo, ultimo_acceso,
              creado_en, actualizado_en
       FROM usuarios
       WHERE id = $1 AND empresa_id = $2`,
      [id, empresaId]
    );
    return rows[0] || null;
  }

  /**
   * Listar todos los usuarios de una empresa.
   */
  static async findAll(client, empresaId, { soloActivos = false } = {}) {
    let sql = `
      SELECT id, empresa_id, nombre, codigo, email, rol, activo, ultimo_acceso,
             creado_en, actualizado_en
      FROM usuarios
      WHERE empresa_id = $1`;
    if (soloActivos) sql += ` AND activo = TRUE`;
    sql += ` ORDER BY nombre ASC`;
    const { rows } = await client.query(sql, [empresaId]);
    return rows;
  }

  /**
   * Crear nuevo usuario en una empresa.
   */
  static async create(client, empresaId, data) {
    const { nombre, codigo, email, password_hash, rol = 'OPERADOR' } = data;
    const { rows } = await client.query(
      `INSERT INTO usuarios (empresa_id, nombre, codigo, email, password_hash, rol)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, empresa_id, nombre, codigo, email, rol, activo, creado_en`,
      [empresaId, nombre, codigo, email, password_hash, rol]
    );
    return rows[0];
  }

  /**
   * Actualizar datos de un usuario (dentro de la misma empresa).
   */
  static async update(client, empresaId, id, data) {
    const fields = [];
    const values = [];
    let idx = 1;

    const allowed = ['nombre', 'email', 'rol', 'activo', 'password_hash'];
    for (const key of allowed) {
      if (data[key] !== undefined) {
        fields.push(`${key} = $${idx++}`);
        values.push(data[key]);
      }
    }
    if (!fields.length) return this.findById(client, empresaId, id);

    values.push(id, empresaId);
    const { rows } = await client.query(
      `UPDATE usuarios SET ${fields.join(', ')}
       WHERE id = $${idx} AND empresa_id = $${idx + 1}
       RETURNING id, empresa_id, nombre, codigo, email, rol, activo, actualizado_en`,
      values
    );
    return rows[0] || null;
  }

  /**
   * Actualizar timestamp de último acceso.
   */
  static async updateLastAccess(client, id) {
    await client.query(
      `UPDATE usuarios SET ultimo_acceso = NOW() WHERE id = $1`,
      [id]
    );
  }

  /**
   * Eliminar (desactivar) un usuario — soft delete.
   */
  static async deactivate(client, empresaId, id) {
    const { rows } = await client.query(
      `UPDATE usuarios SET activo = FALSE
       WHERE id = $1 AND empresa_id = $2
       RETURNING id`,
      [id, empresaId]
    );
    return rows[0] || null;
  }
}

module.exports = Usuario;
