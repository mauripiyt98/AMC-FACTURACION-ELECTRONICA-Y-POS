/**
 * perfil.js — Perfil de facturación del emisor
 *
 * Carga y guarda los datos de la empresa (perfil de facturación) usando
 * la API del backend cuando el usuario tiene sesión JWT activa.
 *
 * Retrocompatibilidad: si no hay JWT, usa localStorage como antes
 * para no perder datos existentes.
 */
'use strict';

document.addEventListener('DOMContentLoaded', async () => {

  // ── Claves de sesión ─────────────────────────────────────────────────────────
  const SESSION_KEY    = 'amc_session_v2';
  const USER_KEY       = 'amc_user_v2';
  const SESSION_LEGACY = 'amc_session_active';

  // ── Estado de sesión ─────────────────────────────────────────────────────────
  let activeUserCode = sessionStorage.getItem('amc_active_user_code');
  if (!activeUserCode && sessionStorage.getItem(SESSION_LEGACY) === 'true') {
    activeUserCode = '1110591592';
    sessionStorage.setItem('amc_active_user_code', activeUserCode);
  }

  function getToken() {
    try {
      const s = JSON.parse(sessionStorage.getItem(SESSION_KEY) || '{}');
      return s.token || null;
    } catch { return null; }
  }

  function getUser() {
    try {
      return JSON.parse(sessionStorage.getItem(USER_KEY) || 'null');
    } catch { return null; }
  }

  const token      = getToken();
  const activeUser = getUser();
  const useApi     = !!token; // Usar API si hay JWT disponible

  // Clave de localStorage (mantenida para retrocompatibilidad)
  const profileKey = `amc_perfil_emisor_v1_${activeUserCode}`;

  // ── API helper ───────────────────────────────────────────────────────────────
  const API_BASE = 'http://localhost:3000/api';

  async function apiFetch(endpoint, options = {}) {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });

    if (res.status === 401) {
      sessionStorage.clear();
      window.location.replace('../login.html');
      throw new Error('Sesión expirada');
    }

    const data = await res.json();
    if (!res.ok) throw new Error(data.message || `Error ${res.status}`);
    return data;
  }

  // ── Elementos DOM ─────────────────────────────────────────────────────────────
  const form           = document.getElementById('perfil-form');
  const tipoSelect     = document.getElementById('p-tipo');
  const nitInput       = document.getElementById('p-nit');
  const nombreInput    = document.getElementById('p-nombre');
  const direccionInput = document.getElementById('p-direccion');
  const ciudadInput    = document.getElementById('p-ciudad');
  const emailInput     = document.getElementById('p-email');

  const logoFileInput    = document.getElementById('p-logo-file');
  const btnUploadTrigger = document.getElementById('btn-upload-trigger');
  const btnRemoveLogo    = document.getElementById('btn-remove-logo');
  const logoPreview      = document.getElementById('logo-preview');
  const msgDiv           = document.getElementById('msg');

  let base64Logo = '';
  const DEFAULT_LOGO = '../assets/logo.png';

  // ── Cargar datos del perfil ───────────────────────────────────────────────────
  let currentProfile = null;

  if (useApi) {
    // Sistema nuevo: cargar desde el backend
    try {
      const data = await apiFetch('/empresas/me');
      const empresa = data.empresa;
      if (empresa) {
        // Intentar cargar logo desde localStorage (más eficiente que guardar base64 en DB)
        let savedLogo = '';
        try {
          const cached = localStorage.getItem(profileKey);
          if (cached) {
            const cachedData = JSON.parse(cached);
            savedLogo = cachedData.logo || '';
          }
        } catch { /* sin caché */ }

        currentProfile = {
          tipoPersona: empresa.tipo_persona || 'NATURAL',
          nit        : empresa.nit          || '',
          razonSocial: empresa.razon_social || '',
          direccion  : empresa.direccion    || '',
          ciudad     : empresa.ciudad       || '',
          email      : empresa.email        || '',
          logo       : savedLogo,
        };
      }
    } catch (err) {
      console.warn('Error cargando empresa desde API, intentando localStorage:', err.message);
    }
  }

  // Fallback a localStorage si no cargó desde API
  if (!currentProfile) {
    try {
      const raw = localStorage.getItem(profileKey);
      if (raw) currentProfile = JSON.parse(raw);
    } catch (err) {
      console.error('Error al cargar perfil desde localStorage:', err);
    }
  }

  // ── Pre-rellenar formulario ───────────────────────────────────────────────────
  if (currentProfile) {
    if (tipoSelect)     tipoSelect.value     = currentProfile.tipoPersona || 'NATURAL';
    if (nitInput)       nitInput.value       = currentProfile.nit         || '';
    if (nombreInput)    nombreInput.value    = currentProfile.razonSocial || '';
    if (direccionInput) direccionInput.value = currentProfile.direccion   || '';
    if (ciudadInput)    ciudadInput.value    = currentProfile.ciudad      || '';
    if (emailInput)     emailInput.value     = currentProfile.email       || '';

    if (currentProfile.logo) {
      base64Logo = currentProfile.logo;
      if (logoPreview) logoPreview.src = base64Logo;
      if (btnRemoveLogo) btnRemoveLogo.style.display = 'inline-block';
    } else {
      if (logoPreview) logoPreview.src = DEFAULT_LOGO;
      if (btnRemoveLogo) btnRemoveLogo.style.display = 'none';
    }
  } else {
    // Valores por defecto
    if (activeUser && activeUserCode === '1110591592') {
      if (tipoSelect)     tipoSelect.value     = 'NATURAL';
      if (nitInput)       nitInput.value       = '1.110.591.592-3';
      if (nombreInput)    nombreInput.value    = 'ANDRES MAURICIO CAMPOS FIERRO';
      if (direccionInput) direccionInput.value = 'Colombia';
      if (ciudadInput)    ciudadInput.value    = 'Bogotá';
      if (emailInput)     emailInput.value     = 'dev@amc.com';
    }
    if (logoPreview) logoPreview.src = DEFAULT_LOGO;
  }

  // ── Gestión del logo ──────────────────────────────────────────────────────────
  if (btnUploadTrigger) {
    btnUploadTrigger.addEventListener('click', () => {
      if (logoFileInput) logoFileInput.click();
    });
  }

  if (logoFileInput) {
    logoFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      if (!file.type.startsWith('image/')) {
        mostrarMensaje('Por favor, seleccione un archivo de imagen válido.', 'error');
        return;
      }

      if (file.size > 1.5 * 1024 * 1024) {
        mostrarMensaje('La imagen es demasiado grande. Seleccione una menor a 1.5 MB.', 'error');
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        base64Logo = event.target.result;
        if (logoPreview) logoPreview.src = base64Logo;
        if (btnRemoveLogo) btnRemoveLogo.style.display = 'inline-block';
        mostrarMensaje('Logo cargado correctamente. Recuerde guardar los cambios.', 'success');
      };
      reader.readAsDataURL(file);
    });
  }

  if (btnRemoveLogo) {
    btnRemoveLogo.addEventListener('click', () => {
      base64Logo = '';
      if (logoPreview) logoPreview.src = DEFAULT_LOGO;
      btnRemoveLogo.style.display = 'none';
      if (logoFileInput) logoFileInput.value = '';
      mostrarMensaje('Se ha quitado el logo personalizado. Recuerde guardar los cambios.', 'success');
    });
  }

  // ── Guardar formulario ────────────────────────────────────────────────────────
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const perfil = {
        tipoPersona: tipoSelect?.value   || '',
        nit        : nitInput?.value?.trim()       || '',
        razonSocial: nombreInput?.value?.trim()    || '',
        direccion  : direccionInput?.value?.trim() || '',
        ciudad     : ciudadInput?.value?.trim()    || '',
        email      : emailInput?.value?.trim()     || '',
        logo       : base64Logo || '',
      };

      if (useApi) {
        // Guardar en el backend (sin el logo base64, que va en localStorage)
        try {
          await apiFetch('/empresas/me', {
            method: 'PATCH',
            body  : JSON.stringify({
              tipo_persona: perfil.tipoPersona,
              razon_social: perfil.razonSocial,
              direccion   : perfil.direccion,
              ciudad      : perfil.ciudad,
              email       : perfil.email,
            }),
          });
          // Guardar logo y datos en localStorage como caché local
          try { localStorage.setItem(profileKey, JSON.stringify(perfil)); } catch { /* sin espacio */ }
          mostrarMensaje('¡Perfil de facturación guardado exitosamente!', 'success');
        } catch (err) {
          mostrarMensaje(`Error al guardar: ${err.message}`, 'error');
        }
      } else {
        // Fallback: solo localStorage (sesión legada)
        try {
          localStorage.setItem(profileKey, JSON.stringify(perfil));
          mostrarMensaje('¡Perfil de facturación guardado exitosamente!', 'success');
        } catch (err) {
          if (err.name === 'QuotaExceededError' || err.code === 22) {
            mostrarMensaje('No hay suficiente espacio para guardar esta imagen. Use un logo más ligero.', 'error');
          } else {
            mostrarMensaje('Error al guardar los datos.', 'error');
          }
        }
      }
    });
  }

  // ── Mostrar mensaje ───────────────────────────────────────────────────────────
  function mostrarMensaje(texto, tipo) {
    if (!msgDiv) return;
    msgDiv.innerHTML = '';
    const alertBox = document.createElement('div');
    alertBox.className = `alert alert-${tipo === 'error' ? 'error' : 'success'}`;
    alertBox.textContent = texto;
    msgDiv.appendChild(alertBox);
    msgDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

});
