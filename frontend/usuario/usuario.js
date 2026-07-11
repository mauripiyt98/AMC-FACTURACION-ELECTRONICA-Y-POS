/**
 * usuario.js — Gestión de usuarios y perfil de credenciales
 *
 * Sistema HÍBRIDO:
 *  - Si hay sesión JWT activa (backend disponible): usa API REST
 *  - Si hay sesión local (sin backend): usa localStorage como antes
 *
 * Compatible con cualquier navegador. Los datos existentes no se pierden.
 */
'use strict';

document.addEventListener('DOMContentLoaded', async () => {

  // ── Claves de sesión ─────────────────────────────────────────────────────────
  const SESSION_KEY    = 'amc_session_v2';
  const USER_KEY       = 'amc_user_v2';
  const SESSION_LEGACY = 'amc_session_active';
  const DEV_USER_KEY   = 'amc_developer_user';
  const IND_USERS_KEY  = 'amc_independent_users';

  // Credenciales por defecto (hardcodeadas — fallback)
  const DEFAULT_CREDENTIALS = {
    nombre: 'PRINCIPAL DESARROLLADOR',
    codigo: '1110591592',
    clave : 'Desa*2026',
    email : 'dev@amc.com',
  };

  // ── Determinar tipo de sesión ─────────────────────────────────────────────────
  function getToken() {
    try {
      const s = JSON.parse(sessionStorage.getItem(SESSION_KEY) || '{}');
      return s.token || null;
    } catch { return null; }
  }

  function getJwtUser() {
    try {
      return JSON.parse(sessionStorage.getItem(USER_KEY) || 'null');
    } catch { return null; }
  }

  const token      = getToken();
  const jwtUser    = getJwtUser();
  const useApi     = !!token; // true = sesión con JWT (backend activo)

  // Código de usuario activo
  let activeUserCode = sessionStorage.getItem('amc_active_user_code');
  if (!activeUserCode && sessionStorage.getItem(SESSION_LEGACY) === 'true') {
    activeUserCode = '1110591592';
    sessionStorage.setItem('amc_active_user_code', activeUserCode);
  }

  const isDev = useApi
    ? ['ADMIN', 'SUPERADMIN'].includes(jwtUser?.rol)
    : (activeUserCode === '1110591592');

  const API_BASE = 'http://localhost:3000/api';

  // ── API helper ───────────────────────────────────────────────────────────────
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
    if (!res.ok) {
      const err = new Error(data.message || `Error ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  // ── Elementos DOM ─────────────────────────────────────────────────────────────
  const form          = document.getElementById('usuario-form');
  const nombreInput   = document.getElementById('u-nombre');
  const codigoInput   = document.getElementById('u-codigo');
  const emailInput    = document.getElementById('u-email');
  const claveInput    = document.getElementById('u-clave');
  const msgDiv        = document.getElementById('msg');
  const btnLogout     = document.getElementById('btn-cerrar-sesion-perfil');

  const cardIndependientes  = document.getElementById('card-usuarios-independientes');
  const formCrearInd        = document.getElementById('crear-usuario-form');
  const newCodigoInput      = document.getElementById('new-u-codigo');
  const newEmailInput       = document.getElementById('new-u-email');
  const newClaveInput       = document.getElementById('new-u-clave');
  const tbodyIndependientes = document.getElementById('lista-usuarios-independientes');

  // ── Lista de usuarios independientes (para modo local) ───────────────────────
  let independentUsersList = [];
  try {
    const raw = localStorage.getItem(IND_USERS_KEY);
    if (raw) independentUsersList = JSON.parse(raw);
  } catch { /* vacío */ }

  // ── Cargar datos actuales del desarrollador/admin ────────────────────────────
  let currentDeveloper = DEFAULT_CREDENTIALS;
  try {
    const stored = localStorage.getItem(DEV_USER_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed && parsed.codigo) currentDeveloper = parsed;
    }
  } catch { /* usar defaults */ }

  // Inicializar localStorage con defaults si estaba vacío (important para Chrome/otros navegadores)
  if (!localStorage.getItem(DEV_USER_KEY)) {
    localStorage.setItem(DEV_USER_KEY, JSON.stringify(DEFAULT_CREDENTIALS));
  }

  // ── Cerrar sesión ─────────────────────────────────────────────────────────────
  if (btnLogout) {
    btnLogout.addEventListener('click', async () => {
      try {
        if (token) {
          await fetch(`${API_BASE}/auth/logout`, {
            method : 'POST',
            headers: { Authorization: `Bearer ${token}` },
          }).catch(() => {});
        }
      } finally {
        sessionStorage.clear();
        window.location.replace('../login.html');
      }
    });
  }

  // ── Configurar UI según tipo de usuario ──────────────────────────────────────
  const pageTitle = document.getElementById('page-title');
  const formCardTitle = document.getElementById('form-card-title');

  if (isDev) {
    if (pageTitle) pageTitle.textContent = 'Perfil del Desarrollador';

    // Cargar datos en formulario
    if (nombreInput) nombreInput.value = currentDeveloper.nombre || DEFAULT_CREDENTIALS.nombre;
    if (codigoInput) codigoInput.value = currentDeveloper.codigo || DEFAULT_CREDENTIALS.codigo;
    if (emailInput)  emailInput.value  = currentDeveloper.email  || DEFAULT_CREDENTIALS.email;
    if (claveInput)  {
      claveInput.value       = '';
      claveInput.placeholder = 'Nueva contraseña (dejar vacío para no cambiar)';
    }

    // Mostrar panel de administración de usuarios
    if (cardIndependientes) cardIndependientes.style.display = 'block';

    // Cargar lista de usuarios
    if (useApi) {
      await cargarUsuariosBackend();
    } else {
      renderUsuariosLocales();
    }

  } else {
    // Usuario independiente
    if (pageTitle) pageTitle.textContent = 'Mi Perfil';
    if (formCardTitle) formCardTitle.textContent = 'Configuración de Credenciales';

    const topbarHint = document.querySelector('.topbar .hint');
    if (topbarHint) topbarHint.textContent = 'Administra tus credenciales personales.';

    if (nombreInput) { nombreInput.value = 'USUARIO INDEPENDIENTE'; nombreInput.setAttribute('readonly', 'true'); }
    if (codigoInput) { codigoInput.value = activeUserCode; codigoInput.setAttribute('readonly', 'true'); }

    // Buscar datos del usuario independiente actual
    const currentIndUser = independentUsersList.find(u => u.codigo === activeUserCode);
    if (emailInput) emailInput.value = currentIndUser?.email || '';
    if (claveInput) {
      claveInput.value       = '';
      claveInput.placeholder = 'Nueva contraseña';
    }

    // Ocultar panel de administración
    if (cardIndependientes) cardIndependientes.style.display = 'none';
  }

  // ── Cargar usuarios desde backend ─────────────────────────────────────────────
  async function cargarUsuariosBackend() {
    try {
      const data = await apiFetch('/usuarios');
      const usuarios = (data.usuarios || []).filter(u => u.codigo !== (jwtUser?.codigo || activeUserCode));
      renderUsuariosBackend(usuarios);
    } catch (err) {
      console.error('Error cargando usuarios del backend:', err);
      // Fallback a lista local si falla
      renderUsuariosLocales();
    }
  }

  // ── Renderizar tabla (usuarios del backend) ───────────────────────────────────
  function renderUsuariosBackend(usuarios) {
    if (!tbodyIndependientes) return;
    tbodyIndependientes.innerHTML = '';

    if (!usuarios.length) {
      tbodyIndependientes.innerHTML = `
        <tr><td colspan="4" style="text-align:center;padding:15px;color:#527083;">
          No hay usuarios registrados.
        </td></tr>`;
      return;
    }

    usuarios.forEach(user => {
      const tr = document.createElement('tr');
      tr.style.borderBottom = '1px solid #cde7f0';

      tr.innerHTML = `
        <td style="padding:10px; font-weight:700; color:#001e82;">${user.codigo}</td>
        <td style="padding:10px; color:#35586a;">${user.email || user.nombre || '—'}</td>
        <td style="padding:10px;">${user.activo
          ? '<span style="color:#22b573;font-weight:700;">● Activo</span>'
          : '<span style="color:#d94d6a;font-weight:700;">● Inactivo</span>'
        }</td>
      `;

      const tdAccion = document.createElement('td');
      tdAccion.style.padding = '8px 10px';
      tdAccion.style.textAlign = 'center';

      const btn = document.createElement('button');
      btn.textContent = user.activo ? 'Desactivar' : 'Reactivar';
      btn.style.cssText = `background:${user.activo ? '#d94d6a' : '#22b573'};
        color:#fff;border:none;padding:6px 12px;border-radius:4px;
        font-weight:bold;cursor:pointer;font-size:0.78rem;`;

      btn.addEventListener('click', async () => {
        if (!confirm(`¿${user.activo ? 'Desactivar' : 'Reactivar'} al usuario ${user.codigo}?`)) return;
        try {
          if (user.activo) {
            await apiFetch(`/usuarios/${user.id}`, { method: 'DELETE' });
          } else {
            await apiFetch(`/usuarios/${user.id}`, { method: 'PATCH', body: JSON.stringify({ activo: true }) });
          }
          mostrarMensaje(`Usuario ${user.codigo} ${user.activo ? 'desactivado' : 'reactivado'}.`, 'success');
          await cargarUsuariosBackend();
        } catch (err) {
          mostrarMensaje(`Error: ${err.message}`, 'error');
        }
      });

      tdAccion.appendChild(btn);
      tr.appendChild(tdAccion);
      tbodyIndependientes.appendChild(tr);
    });
  }

  // ── Renderizar tabla (usuarios localStorage) ──────────────────────────────────
  function renderUsuariosLocales() {
    if (!tbodyIndependientes) return;
    tbodyIndependientes.innerHTML = '';

    if (!independentUsersList.length) {
      tbodyIndependientes.innerHTML = `
        <tr><td colspan="3" style="text-align:center;padding:15px;color:#527083;">
          No hay usuarios independientes registrados.
        </td></tr>`;
      return;
    }

    independentUsersList.forEach(user => {
      const tr = document.createElement('tr');
      tr.style.borderBottom = '1px solid #cde7f0';

      const tdAccion = document.createElement('td');
      tdAccion.style.padding = '8px 10px';
      tdAccion.style.textAlign = 'center';

      const btn = document.createElement('button');
      btn.textContent = 'Eliminar';
      btn.style.cssText = `background:#d94d6a;color:#fff;border:none;padding:6px 12px;
        border-radius:4px;font-weight:bold;cursor:pointer;font-size:0.78rem;`;

      btn.addEventListener('click', () => {
        if (!confirm(`¿Eliminar al usuario ${user.codigo}?`)) return;
        independentUsersList = independentUsersList.filter(u => u.codigo !== user.codigo);
        localStorage.setItem(IND_USERS_KEY, JSON.stringify(independentUsersList));
        mostrarMensaje('Usuario eliminado correctamente.', 'success');
        renderUsuariosLocales();
      });

      tdAccion.appendChild(btn);
      tr.innerHTML = `
        <td style="padding:10px; font-weight:700; color:#001e82;">${user.codigo}</td>
        <td style="padding:10px; color:#35586a;">${user.email || '—'}</td>
      `;
      tr.appendChild(tdAccion);
      tbodyIndependientes.appendChild(tr);
    });
  }

  // ── Validaciones ──────────────────────────────────────────────────────────────
  function validarCodigo(codigo) {
    if (!/^\d+$/.test(codigo)) {
      mostrarMensaje('El código de usuario debe contener únicamente números.', 'error'); return false;
    }
    if (codigo.length < 4 || codigo.length > 15) {
      mostrarMensaje('El código debe tener entre 4 y 15 dígitos.', 'error'); return false;
    }
    return true;
  }

  function validarContrasena(clave) {
    if (clave.length < 5) {
      mostrarMensaje('La contraseña debe tener mínimo 5 caracteres.', 'error'); return false;
    }
    if (!/\d/.test(clave)) {
      mostrarMensaje('La contraseña debe incluir al menos un número.', 'error'); return false;
    }
    if (!/[-*+?!@#$%^&()_={}[\]:;"'<>,.?/~`|\\]/.test(clave)) {
      mostrarMensaje('La contraseña debe incluir al menos un carácter especial (ej: *, +, @, #).', 'error'); return false;
    }
    return true;
  }

  // ── Guardar cambios del perfil propio ─────────────────────────────────────────
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const claveVal = claveInput?.value?.trim() || '';
      const emailVal = emailInput?.value?.trim() || '';

      if (isDev) {
        // Siempre guardar con la clave actual si no se escribe nueva
        const codigoVal = codigoInput?.value?.trim() || currentDeveloper.codigo;
        const claveActual = claveVal || currentDeveloper.clave;

        if (claveVal && !validarContrasena(claveVal)) return;

        if (useApi && jwtUser?.id) {
          // Actualizar via API
          const updates = {};
          if (emailVal) updates.email = emailVal;
          if (claveVal) updates.password = claveVal;

          if (!Object.keys(updates).length) {
            mostrarMensaje('No hay cambios para guardar.', 'error'); return;
          }
          try {
            await apiFetch(`/usuarios/${jwtUser.id}`, { method: 'PATCH', body: JSON.stringify(updates) });
            mostrarMensaje('¡Credenciales actualizadas exitosamente!', 'success');
            if (claveInput) claveInput.value = '';
          } catch (err) {
            mostrarMensaje(`Error al guardar: ${err.message}`, 'error');
          }
        } else {
          // Guardar en localStorage (modo local)
          const updatedDev = {
            nombre: currentDeveloper.nombre || DEFAULT_CREDENTIALS.nombre,
            codigo: codigoVal,
            clave : claveActual,
            email : emailVal || currentDeveloper.email,
          };
          localStorage.setItem(DEV_USER_KEY, JSON.stringify(updatedDev));
          sessionStorage.setItem('amc_active_user_code', codigoVal);
          mostrarMensaje('¡Credenciales actualizadas exitosamente!', 'success');
          if (claveInput) claveInput.value = '';
        }

      } else {
        // Usuario independiente: solo puede cambiar contraseña y email
        if (claveVal && !validarContrasena(claveVal)) return;

        if (useApi && jwtUser?.id) {
          const updates = {};
          if (emailVal) updates.email = emailVal;
          if (claveVal) updates.password = claveVal;
          if (!Object.keys(updates).length) {
            mostrarMensaje('No hay cambios para guardar.', 'error'); return;
          }
          try {
            await apiFetch(`/usuarios/${jwtUser.id}`, { method: 'PATCH', body: JSON.stringify(updates) });
            mostrarMensaje('¡Credenciales actualizadas exitosamente!', 'success');
            if (claveInput) claveInput.value = '';
          } catch (err) {
            mostrarMensaje(`Error al guardar: ${err.message}`, 'error');
          }
        } else {
          // Actualizar en localStorage
          const idx = independentUsersList.findIndex(u => u.codigo === activeUserCode);
          if (idx !== -1) {
            if (claveVal) independentUsersList[idx].clave = claveVal;
            if (emailVal) independentUsersList[idx].email = emailVal;
          } else {
            independentUsersList.push({ codigo: activeUserCode, clave: claveVal, email: emailVal });
          }
          localStorage.setItem(IND_USERS_KEY, JSON.stringify(independentUsersList));
          mostrarMensaje('¡Tus credenciales han sido actualizadas!', 'success');
          if (claveInput) claveInput.value = '';
        }
      }
    });
  }

  // ── Crear usuario independiente ───────────────────────────────────────────────
  if (isDev && formCrearInd) {
    formCrearInd.addEventListener('submit', async (e) => {
      e.preventDefault();

      const newCodigo = newCodigoInput?.value?.trim() || '';
      const newEmail  = newEmailInput?.value?.trim()  || '';
      const newClave  = newClaveInput?.value          || '';

      if (!validarCodigo(newCodigo)) return;
      if (!validarContrasena(newClave)) return;

      if (newEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
        mostrarMensaje('Por favor, ingrese un correo electrónico válido.', 'error'); return;
      }

      if (newCodigo === (currentDeveloper.codigo || DEFAULT_CREDENTIALS.codigo)) {
        mostrarMensaje('El código corresponde al usuario principal.', 'error'); return;
      }

      if (useApi) {
        // Crear via backend
        try {
          await apiFetch('/usuarios', {
            method: 'POST',
            body: JSON.stringify({
              nombre  : `Usuario ${newCodigo}`,
              codigo  : newCodigo,
              email   : newEmail,
              password: newClave,
              rol     : 'OPERADOR',
            }),
          });
          mostrarMensaje('¡Usuario creado exitosamente! Puede iniciar sesión desde cualquier navegador.', 'success');
          formCrearInd.reset();
          await cargarUsuariosBackend();
        } catch (err) {
          if (err.status === 409) {
            mostrarMensaje(`Ya existe un usuario con el código ${newCodigo}.`, 'error');
          } else {
            mostrarMensaje(`Error: ${err.message}`, 'error');
          }
        }

      } else {
        // Crear en localStorage (modo local)
        const existe = independentUsersList.some(u => u.codigo === newCodigo);
        if (existe) {
          mostrarMensaje('Ya existe un usuario con este código.', 'error'); return;
        }

        independentUsersList.push({ codigo: newCodigo, email: newEmail, clave: newClave });
        localStorage.setItem(IND_USERS_KEY, JSON.stringify(independentUsersList));
        mostrarMensaje('¡Usuario creado! (Nota: solo funciona en este navegador, se recomienda activar el backend para acceso universal)', 'success');
        formCrearInd.reset();
        renderUsuariosLocales();
      }
    });
  }

  // ── Mostrar mensaje de feedback ──────────────────────────────────────────────
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
