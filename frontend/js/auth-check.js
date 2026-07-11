/**
 * auth-check.js — Guarda de autenticación (se ejecuta antes de cualquier página)
 *
 * Verifica que el usuario tenga una sesión JWT válida antes de mostrar
 * cualquier página protegida. Es compatible con ambos sistemas:
 *  - Sesión nueva: token JWT en sessionStorage (clave amc_session_v2)
 *  - Sesión legada: flag amc_session_active (retrocompatibilidad temporal)
 *
 * Si no hay sesión válida → redirige al login.
 * Si ya está autenticado y está en login → redirige al inicio.
 */
(function () {
  'use strict';

  // ── Claves de almacenamiento ────────────────────────────────────────────────
  const SESSION_KEY_JWT    = 'amc_session_v2';    // Sistema nuevo (backend JWT)
  const USER_KEY_JWT       = 'amc_user_v2';       // Datos de usuario (sistema nuevo)
  const SESSION_KEY_LEGACY = 'amc_session_active'; // Sistema anterior (localStorage)

  // ── Función: verificar si el token JWT es válido y no expirado ───────────────
  function isJwtSessionValid() {
    try {
      const sessionRaw = sessionStorage.getItem(SESSION_KEY_JWT);
      if (!sessionRaw) return false;
      const session = JSON.parse(sessionRaw);
      if (!session || !session.token) return false;

      // Decodificar payload del JWT (sin verificar firma — solo para revisar exp)
      const parts = session.token.split('.');
      if (parts.length !== 3) return false;
      const payload = JSON.parse(atob(parts[1]));

      // Verificar que no haya expirado (con 30 segundos de margen)
      const ahora = Math.floor(Date.now() / 1000);
      return payload.exp && payload.exp > (ahora + 30);
    } catch {
      return false;
    }
  }

  // ── Función: verificar sesión legada (localStorage-based) ───────────────────
  function isLegacySessionActive() {
    return sessionStorage.getItem(SESSION_KEY_LEGACY) === 'true';
  }

  // ── Función: obtener datos del usuario activo ────────────────────────────────
  function syncActiveUser() {
    try {
      const userRaw = sessionStorage.getItem(USER_KEY_JWT);
      if (userRaw) {
        const user = JSON.parse(userRaw);
        if (user) {
          // Sincronizar claves legadas para que app.js y otros sigan funcionando
          if (!sessionStorage.getItem('amc_active_user_code')) {
            sessionStorage.setItem('amc_active_user_code', user.codigo || '');
          }
          if (!sessionStorage.getItem('amc_active_user_name')) {
            sessionStorage.setItem('amc_active_user_name', user.nombre || '');
          }
          // Guardar NIT de la empresa para autocompletar login
          if (user.nit) {
            localStorage.setItem('amc_last_nit', user.nit);
          }
        }
      }
    } catch { /* silencioso */ }
  }

  // ── Determinar estado de autenticación ──────────────────────────────────────
  const jwtOk    = isJwtSessionValid();
  const legacyOk = isLegacySessionActive();
  const isLoggedIn = jwtOk || legacyOk;

  if (jwtOk) {
    syncActiveUser();
  }

  // ── Lógica de redirección ────────────────────────────────────────────────────
  const path = window.location.pathname;
  const isLoginPage = path.endsWith('login.html') || path.endsWith('/login');

  if (!isLoggedIn && !isLoginPage) {
    // No autenticado → redirigir a login según profundidad del directorio
    const isSubdir =
      path.includes('/productos/') ||
      path.includes('/terceros/')  ||
      path.includes('/facturas-generadas/') ||
      path.includes('/usuario/');

    window.location.replace(isSubdir ? '../login.html' : 'login.html');
  } else if (isLoggedIn && isLoginPage) {
    // Ya autenticado → no mostrar login, ir al inicio
    window.location.replace('index.html');
  }
})();
