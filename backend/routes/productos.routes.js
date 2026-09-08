'use strict';

const router          = require('express').Router();
const ProductoService = require('../services/ProductoService');
const { authMiddleware, requireRole }  = require('../middleware/auth');
const { tenantMiddleware } = require('../middleware/tenant');
const { validateBody, required, minLen, isIn } = require('../middleware/validate');

router.use(authMiddleware, tenantMiddleware);

/**
 * GET /api/productos
 * Query: ?search=&tipo=PRODUCTO|SERVICIO&limit=&offset=
 */
router.get('/', async (req, res, next) => {
  try {
    const { search = '', tipo, limit = 100, offset = 0, soloActivos = 'true' } = req.query;
    const productos = await ProductoService.listar(req.dbClient, req.empresaId, {
      search, tipo,
      limit  : Number(limit),
      offset : Number(offset),
      soloActivos: soloActivos !== 'false',
    });
    res.json({ success: true, productos });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/productos/:id
 */
router.get('/:id', async (req, res, next) => {
  try {
    const producto = await ProductoService.obtener(req.dbClient, req.empresaId, req.params.id);
    res.json({ success: true, producto });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/productos
 */
router.post('/',
  requireRole('ADMIN', 'SUPERADMIN'),
  validateBody({
    nombre: [required(), minLen(3, 'Nombre mínimo 3 caracteres')],
    codigo: [required(), minLen(1, 'Código obligatorio')],
    tipo  : [isIn(['PRODUCTO', 'SERVICIO'])],
  }),
  async (req, res, next) => {
    try {
      const producto = await ProductoService.crear(req.dbClient, req.empresaId, req.body);
      res.status(201).json({ success: true, producto });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PUT /api/productos/:id
 */
router.put('/:id',
  requireRole('ADMIN', 'SUPERADMIN'),
  validateBody({
    nombre: [required(), minLen(3)],
    codigo: [required()],
  }),
  async (req, res, next) => {
    try {
      const producto = await ProductoService.actualizar(
        req.dbClient, req.empresaId, req.params.id, req.body
      );
      res.json({ success: true, producto });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PATCH /api/productos/:id
 */
router.patch('/:id', requireRole('ADMIN', 'SUPERADMIN'), async (req, res, next) => {
  try {
    const producto = await ProductoService.actualizar(
      req.dbClient, req.empresaId, req.params.id, req.body
    );
    res.json({ success: true, producto });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/productos/:id/stock
 */
router.patch('/:id/stock', requireRole('ADMIN', 'SUPERADMIN'), async (req, res, next) => {
  try {
    const { nuevoStock, stockMinimo, tipoMovimiento, motivo, referencia } = req.body;
    if (nuevoStock === undefined || isNaN(Number(nuevoStock))) {
      return res.status(400).json({ success: false, message: 'nuevoStock debe ser un valor numérico válido' });
    }
    const producto = await ProductoService.ajustarStock(
      req.dbClient, req.empresaId, req.params.id,
      { nuevoStock: Number(nuevoStock), stockMinimo, tipoMovimiento, motivo, referencia },
      req.usuarioId
    );
    res.json({ success: true, producto });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/productos/:id/movimientos
 */
router.get('/:id/movimientos', async (req, res, next) => {
  try {
    const { limit = 50 } = req.query;
    const movimientos = await ProductoService.obtenerMovimientos(
      req.dbClient, req.empresaId, req.params.id, Number(limit)
    );
    res.json({ success: true, movimientos });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/productos/:id  (soft delete)
 */
router.delete('/:id', requireRole('ADMIN', 'SUPERADMIN'), async (req, res, next) => {
  try {
    await ProductoService.eliminar(req.dbClient, req.empresaId, req.params.id);
    res.json({ success: true, message: 'Producto eliminado correctamente' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
