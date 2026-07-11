/**
 * login.js — Sistema de autenticación universal multi-navegador
 *
 * Llama al backend REST (POST /api/auth/login) en lugar de comparar
 * credenciales en localStorage. El resultado es un JWT guardado en
 * sessionStorage, que funciona igual en cualquier navegador web.
 *
 * Flujo:
 *  1. El usuario ingresa NIT, código y contraseña
 *  2. Se envía POST a /api/auth/login
 *  3. El backend valida contra PostgreSQL y devuelve un JWT
 *  4. El JWT se guarda en sessionStorage (amc_session_v2)
 *  5. Se sincroniza la sesión legada para retrocompatibilidad
 *  6. Se redirige a index.html
 */

'use strict';

// ── Configuración ─────────────────────────────────────────────────────────────
const API_BASE_URL   = 'http://localhost:3000/api';
const SESSION_KEY    = 'amc_session_v2';
const USER_KEY       = 'amc_user_v2';
// Clave legada (mantiene compatibilidad con app.js, perfil.js, etc.)
const SESSION_LEGACY = 'amc_session_active';

document.addEventListener('DOMContentLoaded', () => {
  const loginForm    = document.getElementById('login-form');
  const nitInput     = document.getElementById('nit');
  const usuarioInput = document.getElementById('usuario');
  const claveInput   = document.getElementById('clave');
  const errorMsg     = document.getElementById('error-msg');
  const btnIngresar  = document.getElementById('btn-ingresar');

  // ── Autocompletar NIT del último login exitoso ─────────────────────────────
  const lastNit = localStorage.getItem('amc_last_nit');
  if (lastNit && nitInput) {
    nitInput.value = lastNit;
    // Si ya hay NIT guardado, posicionar cursor en el campo usuario
    if (usuarioInput) usuarioInput.focus();
  }

  // ── Mostrar/ocultar contraseña ─────────────────────────────────────────────
  const toggleClave = document.getElementById('toggle-clave');
  if (toggleClave && claveInput) {
    toggleClave.addEventListener('click', () => {
      const esPassword = claveInput.type === 'password';
      claveInput.type = esPassword ? 'text' : 'password';
      toggleClave.textContent = esPassword ? '🙈' : '👁️';
    });
  }

  // ── Submit del formulario ──────────────────────────────────────────────────
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    await intentarLogin();
  });

  async function intentarLogin() {
    const nit      = (nitInput?.value || '').trim();
    const codigo   = (usuarioInput?.value || '').trim();
    const password = claveInput?.value || '';

    // Validación básica en el cliente
    if (!nit) {
      mostrarError('El NIT de la empresa es requerido.');
      nitInput?.focus();
      return;
    }
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

    // Estado de carga
    setLoading(true);
    ocultarError();

    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ nit, codigo, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        // Error del servidor (credenciales incorrectas, cuenta desactivada, etc.)
        throw new Error(data.message || 'Credenciales incorrectas.');
      }

      // ── Login exitoso ────────────────────────────────────────────────────────
      guardarSesion(data);

      // Redirigir al inicio
      window.location.replace('index.html');

    } catch (err) {
      if (err.name === 'TypeError' || err.message.includes('fetch')) {
        // Error de red: el backend no está disponible
        mostrarError(
          '⚠️ No se pudo conectar con el servidor. ' +
          'Verifique que el backend esté corriendo en http://localhost:3000'
        );
      } else {
        mostrarError(err.message || 'Código de usuario o contraseña incorrectos.');
      }
      claveInput.value = '';
      claveInput?.focus();
    } finally {
      setLoading(false);
    }
  }

  // ── Guardar sesión en sessionStorage ────────────────────────────────────────
  function guardarSesion(data) {
    // Sistema nuevo: JWT para api-client.js
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({
      token    : data.token,
      expira_en: data.expira_en,
    }));
    sessionStorage.setItem(USER_KEY, JSON.stringify(data.usuario));

    // Sistema legado: retrocompatibilidad con app.js, perfil.js, usuario.js
    sessionStorage.setItem(SESSION_LEGACY, 'true');
    sessionStorage.setItem('amc_active_user_code', data.usuario.codigo || '');
    sessionStorage.setItem('amc_active_user_name', data.usuario.nombre || '');

    // Recordar NIT para el próximo login en este navegador
    if (data.usuario && data.usuario.empresa_id) {
      // El NIT viene en el campo razon_social o debemos obtenerlo del form
      localStorage.setItem('amc_last_nit', nitInput?.value?.trim() || '');
    } else {
      localStorage.setItem('amc_last_nit', nitInput?.value?.trim() || '');
    }
  }

  // ── Helpers de UI ────────────────────────────────────────────────────────────
  function mostrarError(texto) {
    if (!errorMsg) return;
    errorMsg.textContent = texto;
    errorMsg.style.display = 'block';
    errorMsg.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
    if (loading) {
      btnIngresar.style.opacity = '0.75';
      btnIngresar.style.cursor  = 'not-allowed';
    } else {
      btnIngresar.style.opacity = '1';
      btnIngresar.style.cursor  = 'pointer';
    }
  }
});
