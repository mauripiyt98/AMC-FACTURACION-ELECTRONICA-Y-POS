'use strict';

const router = require('express').Router();
const MauroAgent = require('../ai/MauroAgent');
const { authMiddleware } = require('../middleware/auth');
const { tenantMiddleware } = require('../middleware/tenant');
const { ValidationError } = require('../utils/errors');
const { randomUUID } = require('crypto');

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

    const conversationId = String(req.body?.conversationId || randomUUID()).trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(conversationId)) {
      throw new ValidationError('El identificador de conversación no es válido.');
    }

    const resultado = await MauroAgent.consultar({
      mensaje,
      client: req.dbClient,
      empresaId: req.empresaId,
      usuarioId: req.user.id,
      role: req.user.rol,
      conversationId,
    });
    res.json({ success: true, conversationId: resultado.conversationId, respuesta: resultado.respuesta });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
