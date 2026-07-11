/**
 * login.js — Autenticación universal AMC (compatible con cualquier navegador)
 *
 * Sistema HÍBRIDO de autenticación en dos capas:
 *
 *  CAPA 1 — Backend JWT (si el servidor está corriendo):
 *    • Hace POST /api/auth/login con { nit, codigo, password }
 *    • El NIT se obtiene del campo usuario (son iguales para el usuario principal)
 *      o del localStorage si fue guardado antes.
 *    • Si tiene éxito, guarda el JWT en sessionStorage.
 *
 *  CAPA 2 — Local (siempre disponible, funciona sin backend):
 *    • Si el backend no está disponible, valida contra credenciales locales.
 *    • Las credenciales por defecto están HARDCODEADAS en el código → funcionan
 *      en CUALQUIER navegador sin importar el localStorage.
 *    • Las credenciales personalizadas (si el usuario las cambió) se leen
 *      de localStorage de ese navegador.
 *
 * Resultado: El usuario PRINCIPAL siempre puede iniciar sesión desde
 * CUALQUIER navegador con sus credenciales (las por defecto o las guardadas
 * en ese navegador). Los usuarios independientes también funcionan.
 */

'use strict';

// ── Constantes de sesión ──────────────────────────────────────────────────────
const SESSION_KEY    = 'amc_session_v2';    // JWT (sistema nuevo)
const USER_KEY       = 'amc_user_v2';       // Datos usuario (sistema nuevo)
const SESSION_LEGACY = 'amc_session_active'; // Flag sesión (retrocompatibilidad)
const DEV_USER_KEY   = 'amc_developer_user'; // Usuario principal en localStorage
const IND_USERS_KEY  = 'amc_independent_users'; // Usuarios independientes

// ── Credenciales por defecto (hardcodeadas — funcionan en cualquier navegador) ─
const DEFAULT_CREDENTIALS = {
  codigo: '1110591592',
  clave : 'Desa*2026',
  nombre: 'PRINCIPAL DESARROLLADOR',
  email : 'dev@amc.com',
};

// ── URL del backend (intento opcional) ────────────────────────────────────────
const API_BASE_URL = 'http://localhost:3000/api';

// ─────────────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  const loginForm    = document.getElementById('login-form');
  const usuarioInput = document.getElementById('usuario');
  const claveInput   = document.getElementById('clave');
  const errorMsg     = document.getElementById('error-msg');
  const btnIngresar  = document.getElementById('btn-ingresar');
  const toggleClave  = document.getElementById('toggle-clave');

  // ── Toggle mostrar/ocultar contraseña ────────────────────────────────────────
  if (toggleClave && claveInput) {
    toggleClave.addEventListener('click', () => {
      const esPassword = claveInput.type === 'password';
      claveInput.type = esPassword ? 'text' : 'password';
      toggleClave.textContent = esPassword ? '🙈' : '👁️';
    });
  }

  // ── Submit del formulario ────────────────────────────────────────────────────
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    await intentarLogin();
  });

  // ── Lógica principal de login ────────────────────────────────────────────────
  async function intentarLogin() {
    const codigo   = (usuarioInput?.value || '').trim();
    const password = claveInput?.value || '';

    if (!codigo) {
      mostrarError('El código de usuario es requerido.');
      usuarioInput?.focus();
      return;
    }
    if (!password) {
      mostrarError('La contraseña es requerida.');
      claveInput?.focus();
      return;
    }

    ocultarError();
    setLoading(true);

    try {
      // ── CAPA 1: Intentar autenticación con el backend ──────────────────────
      const backendOk = await intentarBackend(codigo, password);
      if (backendOk) return; // Redirigido desde dentro

      // ── CAPA 2: Autenticación local (funciona siempre) ────────────────────
      const localOk = validarLocal(codigo, password);
      if (localOk) {
        establecerSesionLocal(localOk);
        window.location.replace('index.html');
        return;
      }

      // Ninguna capa autenticó correctamente
      mostrarError('Código de usuario o contraseña incorrectos.');
      claveInput.value = '';
      claveInput?.focus();

    } finally {
      setLoading(false);
    }
  }

  // ── CAPA 1: Autenticación via backend JWT ─────────────────────────────────
  async function intentarBackend(codigo, password) {
    try {
      // Para el usuario principal, el NIT y el código son el mismo valor.
      // Para usuarios independientes, usamos el NIT guardado en localStorage.
      const nit = localStorage.getItem('amc_last_nit') || codigo;

      const controller = new AbortController();
      // Timeout de 3 segundos: si el backend no responde, caemos al local
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ nit, codigo, password }),
        signal : controller.signal,
      });
      clearTimeout(timeoutId);

      const data = await response.json();

      if (response.ok && data.success) {
        // JWT recibido — guardar sesión completa
        sessionStorage.setItem(SESSION_KEY, JSON.stringify({
          token    : data.token,
          expira_en: data.expira_en,
        }));
        sessionStorage.setItem(USER_KEY, JSON.stringify(data.usuario));

        // Retrocompatibilidad para app.js, perfil.js, usuario.js (claves legadas)
        sessionStorage.setItem(SESSION_LEGACY, 'true');
        sessionStorage.setItem('amc_active_user_code', data.usuario.codigo || codigo);
        sessionStorage.setItem('amc_active_user_name', data.usuario.nombre || '');

        // Recordar el NIT para la próxima vez
        localStorage.setItem('amc_last_nit', nit);

        window.location.replace('index.html');
        return true; // Éxito
      }

      // El backend respondió pero con error de credenciales — NO caer al local
      // (evitar que alguien con contraseña incorrecta pruebe con el local)
      if (response.status === 401) {
        mostrarError('Código de usuario o contraseña incorrectos.');
        claveInput.value = '';
        claveInput?.focus();
        setLoading(false);
        // Retornar null para indicar que el backend respondió (no caer al local)
        return null;
      }

      return false; // Otro error del servidor → caer al local

    } catch (err) {
      // Error de red (backend no disponible, timeout, sin internet)
      // → Silenciosamente caemos a la autenticación local
      if (err.name !== 'AbortError') {
        console.info('Backend no disponible, usando autenticación local.');
      }
      return false;
    }
  }

  // ── CAPA 2: Validación local (localStorage + credenciales por defecto) ─────
  function validarLocal(codigo, password) {
    // 1. Siempre permitir el acceso con las credenciales por defecto (Master)
    // Esto garantiza que se pueda entrar desde CUALQUIER navegador, incluso si
    // el localStorage está vacío, corrupto o tiene una contraseña antigua.
    if (codigo === DEFAULT_CREDENTIALS.codigo && password === DEFAULT_CREDENTIALS.clave) {
      return {
        codigo: DEFAULT_CREDENTIALS.codigo,
        nombre: DEFAULT_CREDENTIALS.nombre,
        email : DEFAULT_CREDENTIALS.email,
        rol   : 'ADMIN',
        tipo  : 'principal',
      };
    }

    // 2. Verificar credenciales del usuario principal en localStorage
    // (Por si el usuario cambió su contraseña en este navegador específico)
    try {
      const stored = localStorage.getItem(DEV_USER_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && parsed.codigo === codigo && parsed.clave === password) {
          return {
            codigo: parsed.codigo,
            nombre: parsed.nombre || DEFAULT_CREDENTIALS.nombre,
            email : parsed.email  || DEFAULT_CREDENTIALS.email,
            rol   : 'ADMIN',
            tipo  : 'principal',
          };
        }
      }
    } catch { /* ignorar errores de parseo o permisos de localStorage */ }

    // 3. Verificar contra usuarios independientes
    try {
      const indRaw = localStorage.getItem(IND_USERS_KEY);
      if (indRaw) {
        const indUsers = JSON.parse(indRaw);
        if (Array.isArray(indUsers)) {
          const match = indUsers.find(u => u.codigo === codigo && u.clave === password);
          if (match) {
            return {
              codigo: match.codigo,
              nombre: `Usuario ${match.codigo}`,
              email : match.email || '',
              rol   : 'OPERADOR',
              tipo  : 'independiente',
            };
          }
        }
      }
    } catch { /* ignorar */ }

    return null; // Sin coincidencia
  }

  // ── Establecer sesión local (sin JWT) ────────────────────────────────────────
  function establecerSesionLocal(userData) {
    // Solo setear la sesión legada (app.js, perfil.js, etc. ya la conocen)
    sessionStorage.setItem(SESSION_LEGACY, 'true');
    sessionStorage.setItem('amc_active_user_code', userData.codigo || '');
    sessionStorage.setItem('amc_active_user_name', userData.nombre || '');

    // Asegurarse de que las credenciales por defecto estén en localStorage
    // para el navegador actual (si no estaban antes)
    try {
      if (!localStorage.getItem(DEV_USER_KEY)) {
        localStorage.setItem(DEV_USER_KEY, JSON.stringify(DEFAULT_CREDENTIALS));
      }
    } catch { /* sin espacio */ }
  }

  // ── Helpers de UI ─────────────────────────────────────────────────────────────
  function mostrarError(texto) {
    if (!errorMsg) return;
    errorMsg.textContent = texto;
    errorMsg.style.display = 'block';
  }

  function ocultarError() {
    if (!errorMsg) return;
    errorMsg.style.display = 'none';
    errorMsg.textContent = '';
  }

  function setLoading(loading) {
    if (!btnIngresar) return;
    btnIngresar.disabled = loading;
    btnIngresar.textContent = loading ? 'Verificando...' : 'Ingresar';
    btnIngresar.style.opacity = loading ? '0.75' : '1';
    btnIngresar.style.cursor  = loading ? 'not-allowed' : 'pointer';
  }
});
