'use strict';

/**
 * Modelo Tercero — clientes/proveedores por empresa.
 * Todas las queries incluyen empresa_id explícitamente.
 */
class Tercero {
  /**
   * Listar terceros de una empresa con búsqueda opcional.
   *
   * @param {object} opts
   * @param {string}  opts.search   - Buscar en nombre o documento
   * @param {boolean} opts.soloActivos
   * @param {number}  opts.limit
   * @param {number}  opts.offset
   */
  static async findAll(client, empresaId, { search = '', soloActivos = true, limit = 50, offset = 0 } = {}) {
    const params = [empresaId];
    let where = 'WHERE t.empresa_id = $1';

    if (soloActivos) {
      where += ` AND t.activo = TRUE`;
    }

    if (search && search.trim().length >= 2) {
      params.push(`%${search.trim()}%`);
      where += ` AND (t.nombre ILIKE $${params.length} OR t.documento ILIKE $${params.length})`;
    }

    params.push(limit, offset);
    const { rows } = await client.query(
      `SELECT t.id, t.empresa_id, t.nombre, t.documento, t.tipo_documento,
              t.email, t.telefono, t.direccion, t.ciudad, t.departamento,
              t.activo, t.creado_en, t.actualizado_en
       FROM terceros t
       ${where}
       ORDER BY t.nombre ASC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return rows;
  }

  /**
   * Buscar tercero por ID, validando que pertenezca a la empresa.
   */
  static async findById(client, empresaId, id) {
    const { rows } = await client.query(
      `SELECT * FROM terceros
       WHERE id = $1 AND empresa_id = $2`,
      [id, empresaId]
    );
    return rows[0] || null;
  }

  /**
   * Buscar tercero por documento dentro de una empresa.
   */
  static async findByDocumento(client, empresaId, documento) {
    const { rows } = await client.query(
      `SELECT * FROM terceros
       WHERE empresa_id = $1 AND documento = $2 AND activo = TRUE`,
      [empresaId, documento]
    );
    return rows[0] || null;
  }

  /** Buscar por los dígitos del documento, tolerando puntos y guion de verificación. */
  static async findByDocumentoNormalizado(client, empresaId, documentoDigitos) {
    const digitos = String(documentoDigitos || '').replace(/\D/g, '');
    if (digitos.length < 5 || digitos.length > 20) return null;
    const { rows } = await client.query(
      `SELECT id, empresa_id, nombre, documento, tipo_documento,
              email, telefono, ciudad
       FROM terceros
       WHERE empresa_id = $1
         AND activo = TRUE
         AND regexp_replace(documento, '[^0-9]', '', 'g') = $2
       LIMIT 1`,
      [empresaId, digitos]
    );
    return rows[0] || null;
  }

  /**
   * Crear nuevo tercero.
   */
  static async create(client, empresaId, data) {
    const {
      nombre, documento, tipo_documento = 'CC',
      email, telefono, direccion, ciudad, departamento,
    } = data;

    const { rows } = await client.query(
      `INSERT INTO terceros
         (empresa_id, nombre, documento, tipo_documento, email, telefono, direccion, ciudad, departamento)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [empresaId, nombre, documento, tipo_documento, email, telefono, direccion, ciudad, departamento]
    );
    return rows[0];
  }

  /**
   * Crea o actualiza el tercero identificado por su documento.
   *
   * La factura conserva su propio snapshot, pero el tercero es el registro vivo
   * que se utilizará en las siguientes facturas. Los campos vacíos de una
   * factura nunca borran datos de contacto que ya estuvieran guardados.
   */
  static async upsertFromInvoice(client, empresaId, data) {
    const limpiar = (value) => {
      const texto = String(value == null ? '' : value).trim();
      return texto || null;
    };
    const nombre = limpiar(data.nombre);
    const documento = limpiar(data.documento);
    const tipoDocumento = limpiar(data.tipo_documento) || 'CC';

    const { rows } = await client.query(
      `INSERT INTO terceros
         (empresa_id, nombre, documento, tipo_documento, email, telefono, direccion, ciudad, departamento, activo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,TRUE)
       ON CONFLICT (empresa_id, documento) DO UPDATE SET
         nombre = EXCLUDED.nombre,
         tipo_documento = COALESCE(NULLIF(EXCLUDED.tipo_documento, ''), terceros.tipo_documento),
         email = COALESCE(NULLIF(EXCLUDED.email, ''), terceros.email),
         telefono = COALESCE(NULLIF(EXCLUDED.telefono, ''), terceros.telefono),
         direccion = COALESCE(NULLIF(EXCLUDED.direccion, ''), terceros.direccion),
         ciudad = COALESCE(NULLIF(EXCLUDED.ciudad, ''), terceros.ciudad),
         departamento = COALESCE(NULLIF(EXCLUDED.departamento, ''), terceros.departamento),
         activo = TRUE,
         actualizado_en = NOW()
       RETURNING *`,
      [
        empresaId, nombre, documento, tipoDocumento,
        limpiar(data.email), limpiar(data.telefono), limpiar(data.direccion),
        limpiar(data.ciudad), limpiar(data.departamento),
      ]
    );
    return rows[0];
  }

  /**
   * Actualizar tercero — valida empresa_id para evitar cross-tenant.
   */
  static async update(client, empresaId, id, data) {
    const fields = [];
    const values = [];
    let idx = 1;

    const allowed = ['nombre', 'documento', 'tipo_documento', 'email', 'telefono', 'direccion', 'ciudad', 'departamento', 'activo'];
    for (const key of allowed) {
      if (data[key] !== undefined) {
        fields.push(`${key} = $${idx++}`);
        values.push(data[key]);
      }
    }
    if (!fields.length) return this.findById(client, empresaId, id);

    values.push(id, empresaId);
    const { rows } = await client.query(
      `UPDATE terceros SET ${fields.join(', ')}
       WHERE id = $${idx} AND empresa_id = $${idx + 1}
       RETURNING *`,
      values
    );
    return rows[0] || null;
  }

  /**
   * Soft delete — marcar como inactivo.
   */
  static async deactivate(client, empresaId, id) {
    const { rows } = await client.query(
      `UPDATE terceros SET activo = FALSE
       WHERE id = $1 AND empresa_id = $2
       RETURNING id, nombre`,
      [id, empresaId]
    );
    return rows[0] || null;
  }

  /**
   * Contar terceros de una empresa.
   */
  static async count(client, empresaId) {
    const { rows } = await client.query(
      `SELECT COUNT(*) AS total FROM terceros WHERE empresa_id = $1 AND activo = TRUE`,
      [empresaId]
    );
    return Number(rows[0].total);
  }
}

module.exports = Tercero;
