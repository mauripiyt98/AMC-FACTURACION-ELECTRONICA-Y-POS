'use strict';

const Empresa = require('../models/Empresa');
const Usuario = require('../models/Usuario');
const { hashPassword } = require('../utils/crypto');
const { NotFoundError, ConflictError, ForbiddenError } = require('../utils/errors');
const { query } = require('../db/pool');

/**
 * Servicio de Empresas — CRUD de tenants.
 * Solo SUPERADMIN puede crear empresas.
 * ADMIN puede actualizar su propia empresa.
 */
class EmpresaService {
  /**
   * Obtener datos de la empresa del usuario autenticado.
   */
  static async getMiEmpresa(client, empresaId) {
    const empresa = await Empresa.findById(client, empresaId);
    if (!empresa) throw new NotFoundError('Empresa');
    return empresa;
  }

  /**
   * Crear nueva empresa junto con su primer usuario ADMIN.
   * Se usa una transacción explícita (sin RLS).
   */
  static async crear(data) {
    const {
      // Datos empresa
      razon_social, nit, digito_verificacion, regimen_fiscal,
      tipo_persona, direccion, ciudad, departamento, telefono, email,
      resolucion_numero, resolucion_prefijo, resolucion_desde,
      resolucion_hasta, resolucion_vigencia, plan,
      // Datos del primer usuario ADMIN
      admin_nombre, admin_codigo, admin_password, admin_email,
    } = data;

    // Verificar que el NIT no exista
    const existing = await query(`SELECT id FROM empresas WHERE nit = $1`, [nit]);
    if (existing.rows.length) {
      throw new ConflictError(`Ya existe una empresa con el NIT ${nit}`);
    }

    // Transacción para crear empresa + usuario admin atomicamente
    const { pool: pgPool } = require('../db/pool');
    const client = await pgPool.connect();
    try {
      await client.query('BEGIN');

      const empresa = await Empresa.create(client, {
        razon_social, nit, digito_verificacion, regimen_fiscal,
        tipo_persona, direccion, ciudad, departamento, telefono, email,
        resolucion_numero, resolucion_prefijo,
        resolucion_desde: resolucion_desde || 1,
        resolucion_hasta: resolucion_hasta || 1000,
        resolucion_vigencia, plan,
      });

      // Crear usuario administrador inicial
      const password_hash = await hashPassword(admin_password);
      const adminUser = await Usuario.create(client, empresa.id, {
        nombre: admin_nombre,
        codigo: admin_codigo,
        email : admin_email,
        password_hash,
        rol   : 'ADMIN',
      });

      await client.query('COMMIT');
      return { empresa, admin: { id: adminUser.id, nombre: adminUser.nombre, codigo: adminUser.codigo } };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Actualizar datos de la empresa (solo ADMIN de esa empresa).
   */
  static async actualizar(client, empresaId, usuarioRol, data) {
    if (!['ADMIN', 'SUPERADMIN'].includes(usuarioRol)) {
      throw new ForbiddenError('Solo administradores pueden modificar los datos de la empresa');
    }
    const empresa = await Empresa.update(client, empresaId, data);
    if (!empresa) throw new NotFoundError('Empresa');
    return empresa;
  }

  /**
   * Listar todas las empresas (solo SUPERADMIN).
   */
  static async listar({ page = 1, limit = 50, search = '' } = {}) {
    const offset = (page - 1) * limit;
    const params = [];
    let where = 'WHERE 1=1';

    if (search) {
      params.push(`%${search}%`);
      where += ` AND (razon_social ILIKE $${params.length} OR nit ILIKE $${params.length})`;
    }

    params.push(limit, offset);
    const { rows } = await query(
      `SELECT id, razon_social, nit, plan, activa, creado_en
       FROM empresas ${where}
       ORDER BY razon_social ASC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return rows;
  }
}

module.exports = EmpresaService;
