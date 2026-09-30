'use strict';

const router         = require('express').Router();
const multer         = require('multer');
const EmpresaService = require('../services/EmpresaService');
const LogoService    = require('../services/LogoService');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { tenantMiddleware } = require('../middleware/tenant');
const { validateBody, required, minLen, maxLen, isEmail, securePassword } = require('../middleware/validate');

const uploadLogo = multer({
  storage: multer.memoryStorage(),
  limits: { files: 1, fileSize: 1.5 * 1024 * 1024 },
  fileFilter(_req, file, callback) {
    // La verificación decisiva se hace con sharp sobre el contenido; este filtro
    // solo rechaza de inmediato clientes que declaren un tipo no permitido.
    if (!['image/png', 'image/jpeg', 'image/gif'].includes(file.mimetype)) {
      return callback(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'logo'));
    }
    callback(null, true);
  },
});

function uploadError(err, _req, _res, next) {
  if (err instanceof multer.MulterError) {
    const isTooLarge = err.code === 'LIMIT_FILE_SIZE';
    err.isOperational = true;
    err.statusCode = 400;
    err.code = 'INVALID_LOGO';
    err.message = isTooLarge
      ? 'El logo no puede superar 1.5 MB'
      : 'Adjunte un único logo PNG, JPG o GIF';
  }
  next(err);
}

// ── GET /api/empresas/me  — Datos de la empresa del usuario autenticado ──────
router.get('/me',
  authMiddleware,
  tenantMiddleware,
  async (req, res, next) => {
    try {
      const empresa = await EmpresaService.getMiEmpresa(req.dbClient, req.empresaId);
      res.json({ success: true, empresa });
    } catch (err) {
      next(err);
    }
  }
);

// ── PATCH /api/empresas/me  — Actualizar datos de la empresa ─────────────────
router.patch('/me',
  authMiddleware,
  tenantMiddleware,
  requireRole('ADMIN', 'SUPERADMIN'),
  async (req, res, next) => {
    try {
      const empresa = await EmpresaService.actualizar(
        req.dbClient, req.empresaId, req.user.rol, req.body
      );
      res.json({ success: true, empresa });
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /api/empresas/me/logo — Subir/reemplazar logo persistente ──────────
router.post('/me/logo',
  authMiddleware,
  tenantMiddleware,
  requireRole('ADMIN', 'SUPERADMIN'),
  uploadLogo.single('logo'),
  uploadError,
  async (req, res, next) => {
    try {
      if (!req.file || !req.file.buffer) {
        throw { isOperational: true, statusCode: 400, code: 'INVALID_LOGO', message: 'Debe adjuntar un logo en el campo "logo"' };
      }
      const logoUrl = await LogoService.guardar(req.empresaId, req.file.buffer);
      const empresa = await EmpresaService.actualizar(req.dbClient, req.empresaId, req.user.rol, { logo_url: logoUrl });
      res.status(201).json({ success: true, logo_url: empresa.logo_url, empresa });
    } catch (err) {
      next(err);
    }
  }
);

// ── DELETE /api/empresas/me/logo — Retirar logo persistente ─────────────────
router.delete('/me/logo',
  authMiddleware,
  tenantMiddleware,
  requireRole('ADMIN', 'SUPERADMIN'),
  async (req, res, next) => {
    try {
      const empresa = await EmpresaService.actualizar(req.dbClient, req.empresaId, req.user.rol, { logo_url: null });
      await LogoService.eliminar(req.empresaId);
      res.json({ success: true, empresa });
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /api/empresas  — Crear nuevo tenant (solo SUPERADMIN) ───────────────
router.post('/',
  authMiddleware,
  requireRole('SUPERADMIN'),
  validateBody({
    razon_social   : [required(), minLen(3)],
    nit            : [required(), minLen(5)],
    admin_nombre   : [required(), minLen(3)],
    admin_codigo   : [required(), minLen(4)],
    admin_password : [required(), securePassword()],
  }),
  async (req, res, next) => {
    try {
      const result = await EmpresaService.crear(req.body);
      res.status(201).json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /api/empresas  — Listar todos los tenants (solo SUPERADMIN) ──────────
router.get('/',
  authMiddleware,
  requireRole('SUPERADMIN'),
  async (req, res, next) => {
    try {
      const { page = 1, limit = 50, search = '' } = req.query;
      const empresas = await EmpresaService.listar({ page: Number(page), limit: Number(limit), search });
      res.json({ success: true, empresas });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
