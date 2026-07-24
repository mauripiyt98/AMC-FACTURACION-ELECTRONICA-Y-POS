'use strict';

const router = require('express').Router();
const NominaElectronicaService = require('../services/NominaElectronicaService');
const { authMiddleware } = require('../middleware/auth');
const { tenantMiddleware } = require('../middleware/tenant');

router.use(authMiddleware, tenantMiddleware);

router.get('/', async (req, res, next) => {
  try {
    const nominas = await NominaElectronicaService.listar(req.dbClient, req.empresaId, {
      limit: Math.min(Math.max(Number(req.query.limit) || 100, 1), 1000),
      offset: Math.max(Number(req.query.offset) || 0, 0),
    });
    res.json({ success: true, nominas });
  } catch (error) { next(error); }
});

router.post('/', async (req, res, next) => {
  try {
    const nomina = await NominaElectronicaService.crear(req.dbClient, req.empresaId, req.body, req.user.id);
    res.status(201).json({ success: true, nomina });
  } catch (error) { next(error); }
});

module.exports = router;
