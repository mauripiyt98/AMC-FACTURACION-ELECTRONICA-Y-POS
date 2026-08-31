'use strict';

const router              = require('express').Router();
const CotizacionService   = require('../services/CotizacionService');
const { authMiddleware }  = require('../middleware/auth');
const { tenantMiddleware } = require('../middleware/tenant');

router.use(authMiddleware, tenantMiddleware);

/**
 * GET /api/cotizaciones
 * Query: ?search=&estado=&limit=&offset=&desde=&hasta=
 */
router.get('/', async (req, res, next) => {
  try {
    const { search = '', estado, limit = 50, offset = 0, desde, hasta } = req.query;
    const cotizaciones = await CotizacionService.listar(req.dbClient, req.empresaId, {
      search, estado,
      limit : Number(limit),
      offset: Number(offset),
      desde, hasta,
    });
    res.json({ success: true, cotizaciones });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/cotizaciones/stats
 * Estadísticas de cotizaciones de la empresa.
 */
router.get('/stats', async (req, res, next) => {
  try {
    const stats = await CotizacionService.estadisticas(req.dbClient, req.empresaId);
    res.json({ success: true, stats });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/cotizaciones/:id
 * Retorna cotización completa con sus líneas.
 */
router.get('/:id', async (req, res, next) => {
  try {
    const cotizacion = await CotizacionService.obtener(req.dbClient, req.empresaId, req.params.id);
    res.json({ success: true, cotizacion });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/cotizaciones
 * Crea una nueva cotización.
 * Body: { cliente: {...}, lineas: [...], observaciones }
 */
router.post('/', async (req, res, next) => {
  try {
    const cotizacion = await CotizacionService.crear(
      req.dbClient,
      req.empresaId,
      req.body,
      req.user.id
    );
    res.status(201).json({ success: true, cotizacion });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/cotizaciones/:id/convertir
 * Convierte la cotización a factura electrónica.
 */
router.post('/:id/convertir', async (req, res, next) => {
  try {
    const result = await CotizacionService.convertirAFactura(
      req.dbClient,
      req.empresaId,
      req.params.id,
      req.user.id
    );
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/cotizaciones/:id/estado
 * Cambiar estado de una cotización.
 * Body: { estado: 'GUARDADA' | 'FACTURADA' | 'ANULADA' }
 */
router.patch('/:id/estado', async (req, res, next) => {
  try {
    const { estado } = req.body;
    const cotizacion = await CotizacionService.cambiarEstado(
      req.dbClient, req.empresaId, req.params.id, estado
    );
    res.json({ success: true, cotizacion });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
