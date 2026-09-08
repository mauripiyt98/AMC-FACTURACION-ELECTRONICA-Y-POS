'use strict';

const router         = require('express').Router();
const TerceroService = require('../services/TerceroService');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { tenantMiddleware } = require('../middleware/tenant');
const { validateBody, required, minLen, isEmail } = require('../middleware/validate');

// Aplicar auth + tenant a todas las rutas de este router
router.use(authMiddleware, tenantMiddleware);

/**
 * GET /api/terceros
 * Query: ?search=&limit=&offset=&soloActivos=
 */
router.get('/', async (req, res, next) => {
  try {
    const { search = '', limit = 50, offset = 0, soloActivos = 'true' } = req.query;
    // La lista es paginada para que el catálogo pueda crecer sin omitir ni
    // cargar de golpe todos los clientes. El frontend recorre las páginas.
    const pageSize = Math.min(Math.max(Number(limit) || 50, 1), 500);
    const pageOffset = Math.max(Number(offset) || 0, 0);
    const terceros = await TerceroService.listar(req.dbClient, req.empresaId, {
      search,
      limit  : pageSize,
      offset : pageOffset,
      soloActivos: soloActivos !== 'false',
    });
    res.json({
      success: true,
      terceros,
      pagination: { limit: pageSize, offset: pageOffset, hasMore: terceros.length === pageSize },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/terceros/:id
 */
router.get('/:id', async (req, res, next) => {
  try {
    const tercero = await TerceroService.obtener(req.dbClient, req.empresaId, req.params.id);
    res.json({ success: true, tercero });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/terceros
 */
router.post('/',
  requireRole('ADMIN', 'SUPERADMIN'),
  validateBody({
    nombre   : [required(), minLen(3, 'Nombre mínimo 3 caracteres')],
    documento: [required(), minLen(3, 'Documento mínimo 3 caracteres')],
    email    : [isEmail()],
  }),
  async (req, res, next) => {
    try {
      const tercero = await TerceroService.crear(req.dbClient, req.empresaId, req.body);
      res.status(201).json({ success: true, tercero });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PUT /api/terceros/:id
 */
router.put('/:id',
  requireRole('ADMIN', 'SUPERADMIN'),
  validateBody({
    nombre   : [required(), minLen(3)],
    documento: [required(), minLen(3)],
    email    : [isEmail()],
  }),
  async (req, res, next) => {
    try {
      const tercero = await TerceroService.actualizar(
        req.dbClient, req.empresaId, req.params.id, req.body
      );
      res.json({ success: true, tercero });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PATCH /api/terceros/:id
 */
router.patch('/:id', requireRole('ADMIN', 'SUPERADMIN'), async (req, res, next) => {
  try {
    const tercero = await TerceroService.actualizar(
      req.dbClient, req.empresaId, req.params.id, req.body
    );
    res.json({ success: true, tercero });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/terceros/:id  (soft delete)
 */
router.delete('/:id', requireRole('ADMIN', 'SUPERADMIN'), async (req, res, next) => {
  try {
    await TerceroService.eliminar(req.dbClient, req.empresaId, req.params.id);
    res.json({ success: true, message: 'Tercero eliminado correctamente' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
