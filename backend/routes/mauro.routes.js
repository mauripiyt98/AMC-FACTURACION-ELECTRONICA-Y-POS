'use strict';

const router = require('express').Router();
const MauroAgent = require('../ai/MauroAgent');
const { authMiddleware } = require('../middleware/auth');
const { tenantMiddleware } = require('../middleware/tenant');
const { ValidationError } = require('../utils/errors');

router.use(authMiddleware, tenantMiddleware);

/**
 * Punto de entrada controlado para Mauro IA.
 * Las herramientas permitidas se deciden en MauroAgent; el mensaje nunca se
 * convierte en una consulta SQL libre.
 */
router.post('/consultar', async (req, res, next) => {
  try {
    const mensaje = String(req.body?.mensaje || '').trim();
    if (!mensaje || mensaje.length > 500) {
      throw new ValidationError('La consulta debe contener entre 1 y 500 caracteres.');
    }

    const respuesta = await MauroAgent.consultar({
      mensaje,
      client: req.dbClient,
      empresaId: req.empresaId,
    });
    res.json({ success: true, respuesta });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
