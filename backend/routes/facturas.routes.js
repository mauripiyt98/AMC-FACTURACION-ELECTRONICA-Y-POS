'use strict';

const router         = require('express').Router();
const FacturaService = require('../services/FacturaService');
const { authMiddleware }  = require('../middleware/auth');
const { tenantMiddleware } = require('../middleware/tenant');

router.use(authMiddleware, tenantMiddleware);

/**
 * GET /api/facturas
 * Query: ?search=&estado=&limit=&offset=&desde=&hasta=
 */
router.get('/', async (req, res, next) => {
  try {
    const { search = '', estado, limit = 50, offset = 0, desde, hasta } = req.query;
    const facturas = await FacturaService.listar(req.dbClient, req.empresaId, {
      search, estado,
      limit : Number(limit),
      offset: Number(offset),
      desde, hasta,
    });
    res.json({ success: true, facturas });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/facturas/stats
 * Estadísticas de facturación de la empresa.
 */
router.get('/stats', async (req, res, next) => {
  try {
    const stats = await FacturaService.estadisticas(req.dbClient, req.empresaId);
    res.json({ success: true, stats });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/facturas/:id
 * Retorna factura completa con sus líneas.
 */
router.get('/:id', async (req, res, next) => {
  try {
    const factura = await FacturaService.obtener(req.dbClient, req.empresaId, req.params.id);
    res.json({ success: true, factura });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/facturas
 * Crea una nueva factura electrónica.
 * Body: { cliente: {...}, lineas: [...], medio_pago, observaciones }
 */
router.post('/', async (req, res, next) => {
  try {
    const factura = await FacturaService.crear(
      req.dbClient,
      req.empresaId,
      req.body,
      req.user.id
    );
    res.status(201).json({ success: true, factura });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/facturas/:id/estado
 * Cambiar estado de una factura.
 * Body: { estado: 'ENVIADA' | 'ACEPTADA' | 'RECHAZADA' | 'ANULADA' }
 */
router.patch('/:id/estado', async (req, res, next) => {
  try {
    const { estado } = req.body;
    const factura = await FacturaService.cambiarEstado(
      req.dbClient, req.empresaId, req.params.id, estado
    );
    res.json({ success: true, factura });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
