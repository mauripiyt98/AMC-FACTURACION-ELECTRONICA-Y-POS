/**
 * auth-check.js — Guarda de autenticación (se ejecuta antes de cualquier página)
 *
 * Sistema HÍBRIDO: acepta tanto sesiones JWT (backend) como sesiones locales.
 *
 * Sesión JWT   → token en sessionStorage bajo 'amc_session_v2'
 * Sesión local → flag 'amc_session_active' = "true" en sessionStorage
 *
 * Si no hay sesión válida → redirige al login.
 * Si ya está autenticado y está en login → redirige al inicio.
 *
 * IMPORTANTE: No usa localStorage para verificar autenticación.
 *             La autenticación vive en sessionStorage (por pestaña/ventana).
 */
(function () {
  'use strict';

  var SESSION_KEY_JWT    = 'amc_session_v2';
  var USER_KEY_JWT       = 'amc_user_v2';
  var SESSION_KEY_LEGACY = 'amc_session_active';

  // ── Verificar si hay JWT válido y no expirado ─────────────────────────────
  function isJwtValid() {
    try {
      var raw = sessionStorage.getItem(SESSION_KEY_JWT);
      if (!raw) return false;
      var session = JSON.parse(raw);
      if (!session || !session.token) return false;

      var parts = session.token.split('.');
      if (parts.length !== 3) return false;

      var payload = JSON.parse(atob(parts[1]));
      var ahora   = Math.floor(Date.now() / 1000);
      // Válido si no ha expirado (con 30s de margen)
      return !!(payload.exp && payload.exp > (ahora + 30));
    } catch (e) {
      return false;
    }
  }

  // ── Verificar si hay sesión local activa ──────────────────────────────────
  function isLocalSessionActive() {
    return sessionStorage.getItem(SESSION_KEY_LEGACY) === 'true';
  }

  // ── Sincronizar datos de usuario desde JWT ────────────────────────────────
  function syncUserFromJwt() {
    try {
      var raw = sessionStorage.getItem(USER_KEY_JWT);
      if (!raw) return;
      var user = JSON.parse(raw);
      if (!user) return;
      if (!sessionStorage.getItem('amc_active_user_code') && user.codigo) {
        sessionStorage.setItem('amc_active_user_code', user.codigo);
      }
      if (!sessionStorage.getItem('amc_active_user_name') && user.nombre) {
        sessionStorage.setItem('amc_active_user_name', user.nombre);
      }
    } catch (e) { /* silencioso */ }
  }

  // ── Inicializar usuario principal en localStorage si no existe ────────────
  // Esto garantiza que cualquier navegador tenga las credenciales por defecto
  // disponibles para el modo local (sin backend).
  function initDefaultCredentials() {
    try {
      if (!localStorage.getItem('amc_developer_user')) {
        localStorage.setItem('amc_developer_user', JSON.stringify({
          nombre: 'PRINCIPAL DESARROLLADOR',
          codigo: '1110591592',
          clave : 'Desa*2026',
          email : 'dev@amc.com',
        }));
      }
    } catch (e) { /* localStorage no disponible */ }
  }

  // ── Determinar estado de sesión ───────────────────────────────────────────
  var jwtOk    = isJwtValid();
  var localOk  = isLocalSessionActive();
  var isLoggedIn = jwtOk || localOk;

  // Sincronizar datos desde JWT si existe
  if (jwtOk) {
    syncUserFromJwt();
  }

  // Retrocompatibilidad: si hay sesión activa sin código, usar el por defecto
  if (localOk && !sessionStorage.getItem('amc_active_user_code')) {
    sessionStorage.setItem('amc_active_user_code', '1110591592');
    sessionStorage.setItem('amc_active_user_name', 'PRINCIPAL DESARROLLADOR');
  }

  // Siempre inicializar credenciales por defecto en localStorage
  initDefaultCredentials();

  // ── Lógica de redirección ─────────────────────────────────────────────────
  var path       = window.location.pathname;
  var isLoginPage = path.endsWith('login.html') || path.endsWith('/login');

  if (!isLoggedIn && !isLoginPage) {
    var isSubdir =
      path.indexOf('/productos/')         !== -1 ||
      path.indexOf('/terceros/')          !== -1 ||
      path.indexOf('/facturas-generadas/') !== -1 ||
      path.indexOf('/usuario/')           !== -1;

    window.location.replace(isSubdir ? '../login.html' : 'login.html');

  } else if (isLoggedIn && isLoginPage) {
    // Ya autenticado → no mostrar login
    window.location.replace('index.html');
  }

})();
