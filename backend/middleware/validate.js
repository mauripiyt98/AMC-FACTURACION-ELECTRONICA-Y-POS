'use strict';

const { ValidationError } = require('../utils/errors');

/**
 * Factorías de validación reutilizables para los controladores.
 * Cada función retorna un middleware de Express que valida req.body
 * y lanza ValidationError si falla.
 */

function validateBody(rules) {
  return (req, _res, next) => {
    const errors = {};
    for (const [field, checks] of Object.entries(rules)) {
      const value = req.body[field];
      for (const check of checks) {
        const error = check(value, req.body);
        if (error) {
          errors[field] = error;
          break;
        }
      }
    }
    if (Object.keys(errors).length) {
      return next(new ValidationError('Datos de entrada inválidos', errors));
    }
    next();
  };
}

// ── Funciones de validación individuales ─────────────────────────────────────
const required  = (msg = 'Campo requerido') => (v) => !v && v !== 0 ? msg : null;
const minLen    = (n, msg) => (v) => String(v || '').trim().length < n ? (msg || `Mínimo ${n} caracteres`) : null;
const maxLen    = (n, msg) => (v) => String(v || '').trim().length > n ? (msg || `Máximo ${n} caracteres`) : null;
const isEmail   = (msg = 'Email inválido') => (v) => v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? msg : null;
const isNumeric = (msg = 'Debe ser numérico') => (v) => v !== undefined && isNaN(Number(v)) ? msg : null;
const isUUID    = (msg = 'UUID inválido') => (v) => {
  if (!v) return null; // opcional
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v) ? null : msg;
};
const isIn      = (values, msg) => (v) => v && !values.includes(v) ? (msg || `Valor inválido. Permitidos: ${values.join(', ')}`) : null;

// Validar contraseña segura
const securePassword = () => (v) => {
  if (!v) return 'Contraseña requerida';
  if (v.length < 5) return 'La contraseña debe tener mínimo 5 caracteres';
  if (!/\d/.test(v)) return 'La contraseña debe incluir al menos un número';
  if (!/[-*+?!@#$%^&()_={}[\]:;'"<>,.?/~`|\\]/.test(v))
    return 'La contraseña debe incluir al menos un carácter especial (ej: *, +, @, #)';
  return null;
};

module.exports = {
  validateBody,
  required,
  minLen,
  maxLen,
  isEmail,
  isNumeric,
  isUUID,
  isIn,
  securePassword,
};
