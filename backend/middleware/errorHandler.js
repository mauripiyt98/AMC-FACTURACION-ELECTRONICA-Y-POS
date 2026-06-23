'use strict';

const { AppError } = require('../utils/errors');

/**
 * Middleware global de manejo de errores.
 * Distingue errores operacionales (mostrables al cliente)
 * de errores de programación (se loguean, se devuelve mensaje genérico).
 */
function errorHandler(err, req, res, _next) { // eslint-disable-line no-unused-vars
  // Error de PostgreSQL por violación de UNIQUE constraint
  if (err.code === '23505') {
    return res.status(409).json({
      error: 'CONFLICT',
      message: 'Ya existe un registro con esos datos. Verifique campos únicos.',
      detail: process.env.NODE_ENV === 'development' ? err.detail : undefined,
    });
  }

  // Error de FK violation
  if (err.code === '23503') {
    return res.status(400).json({
      error: 'FOREIGN_KEY_VIOLATION',
      message: 'El registro referenciado no existe o no pertenece a su empresa.',
    });
  }

  // Errores operacionales (AppError y subclases)
  if (err.isOperational) {
    return res.status(err.statusCode).json({
      error  : err.code,
      message: err.message,
      ...(err.fields && { fields: err.fields }),
    });
  }

  // Error desconocido — no exponer detalles en producción
  console.error('[ErrorHandler] Error no operacional:', err);
  return res.status(500).json({
    error  : 'INTERNAL_ERROR',
    message: 'Error interno del servidor.',
    ...(process.env.NODE_ENV === 'development' && { detail: err.message, stack: err.stack }),
  });
}

/**
 * Middleware 404 — ruta no encontrada.
 */
function notFound(req, res, _next) {
  res.status(404).json({
    error  : 'NOT_FOUND',
    message: `Ruta no encontrada: ${req.method} ${req.originalUrl}`,
  });
}

module.exports = { errorHandler, notFound };
