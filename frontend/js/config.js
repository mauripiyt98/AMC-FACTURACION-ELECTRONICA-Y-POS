/**
 * ── config.js — Configuración central del frontend AMC
 *
 * MIGRACIÓN MULTI-TENANT:
 * El frontend ya no usa localStorage como base de datos.
 * Todas las operaciones se realizan contra la API REST del backend.
 */

// URL base de la API — cambiar en producción
export const API_BASE_URL = 'http://localhost:3000/api';

// Claves para sessionStorage (solo sesión, no datos de negocio)
export const SESSION_KEY   = 'amc_session_v2';
export const USER_KEY      = 'amc_user_v2';

// Medios de pago (catálogo estático — no cambia entre tenants)
export const MEDIOS_PAGO = [
  { value: 'EFECTIVO',      label: 'Efectivo' },
  { value: 'TRANSFERENCIA', label: 'Transferencia bancaria' },
  { value: 'TARJETA',       label: 'Tarjeta débito / crédito' },
];

// Tipos de documento para terceros
export const TIPOS_DOCUMENTO = [
  { value: 'CC',  label: 'Cédula de ciudadanía' },
  { value: 'NIT', label: 'NIT' },
  { value: 'CE',  label: 'Cédula de extranjería' },
  { value: 'PAS', label: 'Pasaporte' },
  { value: 'TI',  label: 'Tarjeta de identidad' },
];

// Clave para pasar cliente/producto seleccionado entre páginas
// (Se mantiene en sessionStorage solo durante la navegación)
export const CLIENTE_SELECCIONADO_KEY  = 'amc_cliente_sel_v2';
export const PRODUCTO_SELECCIONADO_KEY = 'amc_producto_sel_v2';
export const FACTURA_PREVIEW_KEY       = 'amc_factura_preview_v2';
