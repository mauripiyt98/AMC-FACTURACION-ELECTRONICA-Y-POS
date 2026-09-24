/**
 * ── api-client.js — Cliente HTTP centralizado para el frontend AMC
 *
 * Proporciona una capa única de comunicación con el backend.
 * Características:
 *  - Adjunta automáticamente el JWT en cada petición
 *  - Maneja errores 401 (sesión expirada → redirect a login)
 *  - Normaliza las respuestas de error
 *  - Expone métodos tipados para cada recurso
 */

import { API_BASE_URL, SESSION_KEY, USER_KEY } from './config.js';

// ── Helpers de sesión ─────────────────────────────────────────────────────────
export function getToken() {
  try {
    const session = JSON.parse(sessionStorage.getItem(SESSION_KEY) || '{}');
    return session.token || null;
  } catch {
    return null;
  }
}

export function getUser() {
  try {
    return JSON.parse(sessionStorage.getItem(USER_KEY) || 'null');
  } catch {
    return null;
  }
}

export function saveSession(data) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ token: data.token, expira_en: data.expira_en }));
  sessionStorage.setItem(USER_KEY, JSON.stringify(data.usuario));
}

export function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(USER_KEY);
}

export function isAuthenticated() {
  const token = getToken();
  if (!token) return false;
  // Verificar expiración local (sin llamar al servidor)
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

// ── Función base de fetch ─────────────────────────────────────────────────────
async function apiFetch(endpoint, options = {}) {
  const token = getToken();
  const url   = `${API_BASE_URL}${endpoint}`;

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  // Sesión expirada → limpiar y redirigir al login
  if (response.status === 401) {
    clearSession();
    const loginPath = window.location.pathname.includes('/productos/') ||
                      window.location.pathname.includes('/terceros/')  ||
                      window.location.pathname.includes('/facturas-generadas/') ||
                      window.location.pathname.includes('/calendario/') ||
                      window.location.pathname.includes('/usuario/')
      ? '../login.html'
      : 'login.html';
    window.location.replace(loginPath);
    throw new Error('Sesión expirada');
  }

  const data = await response.json();

  if (!response.ok) {
    const err = new Error(data.message || `Error ${response.status}`);
    err.status = response.status;
    err.code   = data.error;
    err.fields = data.fields;
    throw err;
  }

  return data;
}

// ── API Methods ───────────────────────────────────────────────────────────────

/** Autenticación */
export const auth = {
  login  : (nit, codigo, password) =>
    apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ nit, codigo, password }) }),
  logout : () =>
    apiFetch('/auth/logout', { method: 'POST' }),
  me     : () =>
    apiFetch('/auth/me'),
};

/** Empresa (tenant actual) */
export const empresa = {
  getMia     : ()     => apiFetch('/empresas/me'),
  actualizar : (data) => apiFetch('/empresas/me', { method: 'PATCH', body: JSON.stringify(data) }),
};

/** Terceros (clientes/proveedores) */
export const terceros = {
  listar  : (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/terceros?${qs}`);
  },
  obtener : (id)    => apiFetch(`/terceros/${id}`),
  crear   : (data)  => apiFetch('/terceros', { method: 'POST', body: JSON.stringify(data) }),
  actualizar : (id, data) =>
    apiFetch(`/terceros/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  eliminar : (id)   => apiFetch(`/terceros/${id}`, { method: 'DELETE' }),
};

/** Productos */
export const productos = {
  listar  : (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/productos?${qs}`);
  },
  obtener : (id)    => apiFetch(`/productos/${id}`),
  crear   : (data)  => apiFetch('/productos', { method: 'POST', body: JSON.stringify(data) }),
  actualizar : (id, data) =>
    apiFetch(`/productos/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  patch   : (id, data) =>
    apiFetch(`/productos/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  eliminar : (id)   => apiFetch(`/productos/${id}`, { method: 'DELETE' }),
};

/** Facturas */
export const facturas = {
  listar  : (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/facturas?${qs}`);
  },
  obtener  : (id)     => apiFetch(`/facturas/${id}`),
  stats    : ()       => apiFetch('/facturas/stats'),
  crear    : (data)   => apiFetch('/facturas', { method: 'POST', body: JSON.stringify(data) }),
  cambiarEstado : (id, estado) =>
    apiFetch(`/facturas/${id}/estado`, { method: 'PATCH', body: JSON.stringify({ estado }) }),
};

/** Cotizaciones */
export const cotizaciones = {
  listar  : (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/cotizaciones?${qs}`);
  },
  obtener       : (id)         => apiFetch(`/cotizaciones/${id}`),
  stats         : ()           => apiFetch('/cotizaciones/stats'),
  crear         : (data)       => apiFetch('/cotizaciones', { method: 'POST', body: JSON.stringify(data) }),
  convertir     : (id)         => apiFetch(`/cotizaciones/${id}/convertir`, { method: 'POST' }),
  cambiarEstado : (id, estado) =>
    apiFetch(`/cotizaciones/${id}/estado`, { method: 'PATCH', body: JSON.stringify({ estado }) }),
};

/** Calendario empresarial */
export const calendario = {
  listar: (params) => apiFetch(`/calendario?${new URLSearchParams(params).toString()}`),
  proximos: (limit = 3) => apiFetch(`/calendario/proximos?limit=${limit}`),
  crear: (data) => apiFetch('/calendario', { method: 'POST', body: JSON.stringify(data) }),
  actualizar: (id, data) => apiFetch(`/calendario/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  eliminar: (id) => apiFetch(`/calendario/${id}`, { method: 'DELETE' }),
};
