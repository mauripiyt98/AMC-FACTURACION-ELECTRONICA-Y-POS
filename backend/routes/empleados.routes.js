'use strict';

const router = require('express').Router();
const EmpleadoService = require('../services/EmpleadoService');
const { authMiddleware } = require('../middleware/auth');
const { tenantMiddleware } = require('../middleware/tenant');

router.use(authMiddleware, tenantMiddleware);

router.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 500);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const empleados = await EmpleadoService.listar(req.dbClient, req.empresaId, { search: req.query.search || '', limit, offset });
    res.json({ success: true, empleados, pagination: { limit, offset, hasMore: empleados.length === limit } });
  } catch (error) { next(error); }
});

router.post('/', async (req, res, next) => {
  try {
    const empleado = await EmpleadoService.crear(req.dbClient, req.empresaId, req.body);
    res.status(201).json({ success: true, empleado });
  } catch (error) { next(error); }
});

module.exports = router;
