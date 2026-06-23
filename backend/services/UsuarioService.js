'use strict';

const jwt   = require('jsonwebtoken');
const { query } = require('../db/pool');
const Usuario   = require('../models/Usuario');
const Empresa   = require('../models/Empresa');
const { comparePassword, generateJti } = require('../utils/crypto');
const { UnauthorizedError, NotFoundError, ValidationError } = require('../utils/errors');

const JWT_SECRET  = process.env.JWT_SECRET || 'CAMBIAR_EN_PRODUCCION';
const JWT_EXPIRES = process.env.JWT_EXPIRES_IN || '8h';

/**
 * Servicio de Autenticación.
 * No usa tenantMiddleware porque opera antes de que exista sesión.
 */
class UsuarioService {
  /**
   * Login: valida credenciales y emite un JWT con empresa_id embebido.
   *
   * @param {string} nit       - NIT de la empresa del usuario
   * @param {string} codigo    - Código del usuario dentro de la empresa
   * @param {string} password  - Contraseña en texto plano
   * @param {object} meta      - { ip, userAgent } para auditoría
   */
  static async login(nit, codigo, password, meta = {}) {
    // 1. Buscar empresa por NIT
    const { rows: empresaRows } = await query(
      `SELECT id, razon_social, activa FROM empresas WHERE nit = $1`,
      [nit]
    );
    const empresa = empresaRows[0];
    if (!empresa) throw new UnauthorizedError('NIT, código o contraseña incorrectos');
    if (!empresa.activa) throw new UnauthorizedError('La empresa está desactivada. Contacte al administrador.');

    // 2. Buscar usuario en esa empresa
    const { rows: usuarioRows } = await query(
      `SELECT id, empresa_id, nombre, codigo, password_hash, rol, activo
       FROM usuarios WHERE empresa_id = $1 AND codigo = $2`,
      [empresa.id, codigo]
    );
    const usuario = usuarioRows[0];
    if (!usuario) throw new UnauthorizedError('NIT, código o contraseña incorrectos');
    if (!usuario.activo) throw new UnauthorizedError('Usuario desactivado. Contacte al administrador.');

    // 3. Verificar contraseña
    const ok = await comparePassword(password, usuario.password_hash);
    if (!ok) throw new UnauthorizedError('NIT, código o contraseña incorrectos');

    // 4. Generar JWT con empresa_id y jti para revocación
    const jti    = generateJti();
    const expMs  = 8 * 60 * 60 * 1000;  // 8 horas en ms
    const expDate = new Date(Date.now() + expMs);

    const token = jwt.sign(
      {
        sub       : usuario.id,
        empresa_id: usuario.empresa_id,
        rol       : usuario.rol,
        nombre    : usuario.nombre,
        jti,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );

    // 5. Registrar sesión en DB para permitir revocación
    await query(
      `INSERT INTO sesiones_jwt (usuario_id, empresa_id, jti, expira_en, ip_origen, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [usuario.id, empresa.id, jti, expDate, meta.ip, meta.userAgent]
    );

    // 6. Actualizar último acceso
    await query(
      `UPDATE usuarios SET ultimo_acceso = NOW() WHERE id = $1`,
      [usuario.id]
    );

    return {
      token,
      expira_en: expDate.toISOString(),
      usuario: {
        id        : usuario.id,
        nombre    : usuario.nombre,
        codigo    : usuario.codigo,
        rol       : usuario.rol,
        empresa_id: empresa.id,
        razon_social: empresa.razon_social,
      },
    };
  }

  /**
   * Logout: revocar el token del usuario actual.
   */
  static async logout(jti) {
    await query(
      `UPDATE sesiones_jwt SET revocado = TRUE WHERE jti = $1`,
      [jti]
    );
  }

  /**
   * Verificar si un token específico está activo.
   */
  static async verifyToken(jti) {
    const { rows } = await query(
      `SELECT id FROM sesiones_jwt
       WHERE jti = $1 AND revocado = FALSE AND expira_en > NOW()`,
      [jti]
    );
    return rows.length > 0;
  }
}

module.exports = UsuarioService;
