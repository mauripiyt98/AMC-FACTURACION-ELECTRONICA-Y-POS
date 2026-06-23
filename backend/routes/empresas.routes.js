'use strict';

const router         = require('express').Router();
const EmpresaService = require('../services/EmpresaService');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { tenantMiddleware } = require('../middleware/tenant');
const { validateBody, required, minLen, maxLen, isEmail, securePassword } = require('../middleware/validate');

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
