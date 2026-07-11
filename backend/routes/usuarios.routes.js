'use strict';

const router           = require('express').Router();
const Usuario          = require('../models/Usuario');
const { hashPassword } = require('../utils/crypto');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { tenantMiddleware } = require('../middleware/tenant');
const {
  validateBody, required, minLen, maxLen, isEmail, securePassword,
} = require('../middleware/validate');
const {
  ValidationError, ConflictError, NotFoundError,
} = require('../utils/errors');

// Todas las rutas requieren autenticación + contexto de empresa
router.use(authMiddleware, tenantMiddleware);

// ── GET /api/usuarios  — Listar usuarios de la empresa ────────────────────────
router.get('/', requireRole('ADMIN', 'SUPERADMIN'), async (req, res, next) => {
  try {
    const soloActivos = req.query.activos === 'true';
    const usuarios = await Usuario.findAll(req.dbClient, req.empresaId, { soloActivos });
    res.json({ success: true, usuarios });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/usuarios/:id  — Obtener usuario por ID ──────────────────────────
router.get('/:id', requireRole('ADMIN', 'SUPERADMIN'), async (req, res, next) => {
  try {
    const usuario = await Usuario.findById(req.dbClient, req.empresaId, req.params.id);
    if (!usuario) throw new NotFoundError('Usuario');
    res.json({ success: true, usuario });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/usuarios  — Crear usuario independiente (solo ADMIN) ────────────
router.post('/',
  requireRole('ADMIN', 'SUPERADMIN'),
  validateBody({
    nombre  : [required('Nombre requerido'), minLen(2, 'Nombre muy corto')],
    codigo  : [required('Código requerido'), minLen(4, 'Código mínimo 4 dígitos')],
    password: [required('Contraseña requerida'), securePassword()],
  }),
  async (req, res, next) => {
    try {
      const { nombre, codigo, email = '', password, rol = 'OPERADOR' } = req.body;

      // Validar que el código sea numérico
      if (!/^\d+$/.test(codigo)) {
        throw new ValidationError('El código de usuario debe contener solo números');
      }
      if (codigo.length < 4 || codigo.length > 15) {
        throw new ValidationError('El código debe tener entre 4 y 15 dígitos');
      }

      // Verificar duplicado dentro de la empresa
      const { rows } = await req.dbClient.query(
        `SELECT id FROM usuarios WHERE empresa_id = $1 AND codigo = $2`,
        [req.empresaId, codigo]
      );
      if (rows.length) {
        throw new ConflictError(`Ya existe un usuario con el código ${codigo} en esta empresa`);
      }

      const password_hash = await hashPassword(password);
      const usuario = await Usuario.create(req.dbClient, req.empresaId, {
        nombre, codigo, email, password_hash, rol,
      });

      res.status(201).json({ success: true, usuario });
    } catch (err) {
      next(err);
    }
  }
);

// ── PATCH /api/usuarios/:id  — Actualizar datos/contraseña de un usuario ──────
router.patch('/:id',
  requireRole('ADMIN', 'SUPERADMIN'),
  async (req, res, next) => {
    try {
      const { nombre, email, rol, activo, password } = req.body;
      const updates = {};

      if (nombre  !== undefined) updates.nombre = nombre;
      if (email   !== undefined) updates.email  = email;
      if (rol     !== undefined) updates.rol    = rol;
      if (activo  !== undefined) updates.activo = activo;

      // Si viene nueva contraseña, generar nuevo hash
      if (password !== undefined && password.length > 0) {
        if (password.length < 5) {
          throw new ValidationError('La contraseña debe tener mínimo 5 caracteres');
        }
        updates.password_hash = await hashPassword(password);
      }

      const usuario = await Usuario.update(req.dbClient, req.empresaId, req.params.id, updates);
      if (!usuario) throw new NotFoundError('Usuario');
      res.json({ success: true, usuario });
    } catch (err) {
      next(err);
    }
  }
);

// ── DELETE /api/usuarios/:id  — Desactivar usuario (soft delete) ──────────────
router.delete('/:id', requireRole('ADMIN', 'SUPERADMIN'), async (req, res, next) => {
  try {
    // Evitar que el admin se elimine a sí mismo
    if (req.params.id === String(req.user.id)) {
      throw new ValidationError('No puedes desactivar tu propio usuario');
    }
    const usuario = await Usuario.deactivate(req.dbClient, req.empresaId, req.params.id);
    if (!usuario) throw new NotFoundError('Usuario');
    res.json({ success: true, message: 'Usuario desactivado correctamente' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
