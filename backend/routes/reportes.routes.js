'use strict';

const router = require('express').Router();
const FacturaService = require('../services/FacturaService');
const { authMiddleware } = require('../middleware/auth');
const { tenantMiddleware } = require('../middleware/tenant');
const { ValidationError } = require('../utils/errors');

router.use(authMiddleware, tenantMiddleware);

/**
 * GET /api/reportes/ventas-por-cliente?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&terceroId=UUID
 * Devuelve los acumulados de facturación por cliente para la empresa del JWT.
 */
router.get('/ventas-por-cliente', async (req, res, next) => {
  try {
    const { desde, hasta, terceroId } = req.query;
    const esFecha = (valor) => !valor || /^\d{4}-\d{2}-\d{2}$/.test(valor);
    if (!esFecha(desde) || !esFecha(hasta)) {
      throw new ValidationError('Las fechas deben tener el formato AAAA-MM-DD');
    }
    if (desde && hasta && desde > hasta) {
      throw new ValidationError('La fecha inicial no puede ser mayor que la fecha final');
    }
    if (terceroId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(terceroId)) {
      throw new ValidationError('El cliente seleccionado no es válido');
    }
    const ventas = await FacturaService.ventasPorCliente(req.dbClient, req.empresaId, {
      desde, hasta, terceroId,
    });
    res.json({ success: true, ventas });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/reportes/ventas-por-producto?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&productoId=UUID
 * Devuelve las líneas de facturación acumuladas por producto o servicio.
 */
router.get('/ventas-por-producto', async (req, res, next) => {
  try {
    const { desde, hasta, productoId } = req.query;
    const esFecha = (valor) => !valor || /^\d{4}-\d{2}-\d{2}$/.test(valor);
    if (!esFecha(desde) || !esFecha(hasta)) {
      throw new ValidationError('Las fechas deben tener el formato AAAA-MM-DD');
    }
    if (desde && hasta && desde > hasta) {
      throw new ValidationError('La fecha inicial no puede ser mayor que la fecha final');
    }
    if (productoId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(productoId)) {
      throw new ValidationError('El producto o servicio seleccionado no es válido');
    }
    const ventas = await FacturaService.ventasPorProducto(req.dbClient, req.empresaId, {
      desde, hasta, productoId,
    });
    res.json({ success: true, ventas });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
