/**
 * usuario.js — Gestión de usuarios y perfil de credenciales
 *
 * MIGRACIÓN MULTI-NAVEGADOR:
 * - Ya no usa localStorage para guardar/leer credenciales de usuarios.
 * - Todos los datos de usuarios se gestionan vía API REST del backend.
 * - El NIT/empresa_id se obtiene del JWT almacenado en sessionStorage.
 * - Retrocompatibilidad: Si no hay JWT, intenta leer sesión legada.
 */
'use strict';

document.addEventListener('DOMContentLoaded', async () => {

  // ── Claves de sesión ─────────────────────────────────────────────────────────
  const SESSION_KEY    = 'amc_session_v2';
  const USER_KEY       = 'amc_user_v2';
  const SESSION_LEGACY = 'amc_session_active';

  // ── API helpers ──────────────────────────────────────────────────────────────
  const API_BASE = 'http://localhost:3000/api';

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

  async function apiFetch(endpoint, options = {}) {
    const token = getToken();
    const res = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });

    // Sesión expirada
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

  // ── Estado de sesión ─────────────────────────────────────────────────────────
  const activeUser = getUser();
  let activeUserCode = sessionStorage.getItem('amc_active_user_code');
  if (!activeUserCode && sessionStorage.getItem(SESSION_LEGACY) === 'true') {
    activeUserCode = '1110591592';
    sessionStorage.setItem('amc_active_user_code', activeUserCode);
  }

  // Determinar si es administrador (para mostrar panel de usuarios)
  const isAdmin = activeUser
    ? ['ADMIN', 'SUPERADMIN'].includes(activeUser.rol)
    : activeUserCode === '1110591592'; // Legado: el código '1110591592' era el admin

  // ── Elementos DOM ─────────────────────────────────────────────────────────────
  const form          = document.getElementById('usuario-form');
  const nombreInput   = document.getElementById('u-nombre');
  const codigoInput   = document.getElementById('u-codigo');
  const emailInput    = document.getElementById('u-email');
  const claveInput    = document.getElementById('u-clave');
  const msgDiv        = document.getElementById('msg');
  const btnLogout     = document.getElementById('btn-cerrar-sesion-perfil');

  // Módulo de usuarios independientes (solo ADMIN)
  const cardIndependientes = document.getElementById('card-usuarios-independientes');
  const formCrearInd  = document.getElementById('crear-usuario-form');
  const newCodigoInput = document.getElementById('new-u-codigo');
  const newEmailInput  = document.getElementById('new-u-email');
  const newClaveInput  = document.getElementById('new-u-clave');
  const tbodyIndependientes = document.getElementById('lista-usuarios-independientes');

  // ── Cerrar sesión ─────────────────────────────────────────────────────────────
  if (btnLogout) {
    btnLogout.addEventListener('click', async () => {
      try {
        // Intentar revocar el token en el servidor
        const token = getToken();
        if (token) {
          await fetch(`${API_BASE}/auth/logout`, {
            method : 'POST',
            headers: { Authorization: `Bearer ${token}` },
          }).catch(() => {}); // No bloquear si falla
        }
      } finally {
        sessionStorage.clear();
        window.location.replace('../login.html');
      }
    });
  }

  // ── Cargar datos del perfil del usuario activo ────────────────────────────────
  if (activeUser) {
    // Sistema nuevo: usar datos del JWT
    if (document.getElementById('page-title')) {
      document.getElementById('page-title').textContent =
        isAdmin ? 'Perfil del Administrador' : 'Mi Perfil';
    }
    if (nombreInput) nombreInput.value = activeUser.nombre || '';
    if (codigoInput) {
      codigoInput.value = activeUser.codigo || '';
      codigoInput.setAttribute('readonly', 'true');
    }
    if (emailInput)  emailInput.value  = activeUser.email  || '';
    if (claveInput)  claveInput.value  = ''; // Nunca mostrar contraseña
    if (claveInput)  claveInput.placeholder = 'Nueva contraseña (dejar vacío para no cambiar)';
  } else {
    // Fallback legado
    if (document.getElementById('page-title')) {
      document.getElementById('page-title').textContent =
        isAdmin ? 'Perfil del Desarrollador' : 'Mi Perfil';
    }
    if (codigoInput) codigoInput.value = activeUserCode || '';
  }

  // ── Mostrar/ocultar panel de admin ────────────────────────────────────────────
  if (cardIndependientes) {
    cardIndependientes.style.display = isAdmin ? 'block' : 'none';
  }

  // Cargar lista de usuarios si es admin
  let usuariosList = [];
  if (isAdmin) {
    await cargarUsuarios();
  }

  // ── Cargar lista de usuarios del backend ─────────────────────────────────────
  async function cargarUsuarios() {
    try {
      const data = await apiFetch('/usuarios');
      usuariosList = (data.usuarios || []).filter(u => u.codigo !== (activeUser?.codigo || activeUserCode));
      renderUsuarios();
    } catch (err) {
      console.error('Error al cargar usuarios:', err);
      if (tbodyIndependientes) {
        tbodyIndependientes.innerHTML = `
          <tr><td colspan="3" style="text-align:center;padding:15px;color:#d94d6a;">
            Error al cargar usuarios. Verifique la conexión con el servidor.
          </td></tr>`;
      }
    }
  }

  // ── Renderizar tabla de usuarios ─────────────────────────────────────────────
  function renderUsuarios() {
    if (!tbodyIndependientes) return;
    tbodyIndependientes.innerHTML = '';

    const operadores = usuariosList.filter(u => u.codigo !== (activeUser?.codigo || activeUserCode));

    if (operadores.length === 0) {
      tbodyIndependientes.innerHTML = `
        <tr>
          <td colspan="3" style="text-align:center; padding:15px; color:#527083;">
            No hay usuarios operadores registrados.
          </td>
        </tr>`;
      return;
    }

    operadores.forEach((user) => {
      const tr = document.createElement('tr');
      tr.style.borderBottom = '1px solid #cde7f0';

      // Estado visual
      const estadoBadge = user.activo
        ? '<span style="color:#22b573;font-weight:700;">●</span> Activo'
        : '<span style="color:#d94d6a;font-weight:700;">●</span> Inactivo';

      tr.innerHTML = `
        <td style="padding:10px; font-weight:700; color:#001e82;">${user.codigo}</td>
        <td style="padding:10px; color:#35586a;">${user.email || user.nombre || '—'}</td>
        <td style="padding:10px; text-align:center;">${estadoBadge}</td>
      `;

      // Botón eliminar/desactivar
      const tdAccion = document.createElement('td');
      tdAccion.style.padding = '8px 10px';
      tdAccion.style.textAlign = 'center';

      const btnEliminar = document.createElement('button');
      btnEliminar.textContent = user.activo ? 'Desactivar' : 'Reactivar';
      btnEliminar.style.cssText = `
        background: ${user.activo ? '#d94d6a' : '#22b573'};
        color: #fff; border: none; padding: 6px 12px;
        border-radius: 4px; font-weight: bold; cursor: pointer;
        font-size: 0.78rem;
      `;

      btnEliminar.addEventListener('click', async () => {
        const accion = user.activo ? 'desactivar' : 'reactivar';
        if (!confirm(`¿Está seguro de ${accion} al usuario ${user.codigo}?`)) return;
        try {
          if (user.activo) {
            await apiFetch(`/usuarios/${user.id}`, { method: 'DELETE' });
          } else {
            await apiFetch(`/usuarios/${user.id}`, {
              method: 'PATCH',
              body: JSON.stringify({ activo: true }),
            });
          }
          mostrarMensaje(`Usuario ${user.codigo} ${user.activo ? 'desactivado' : 'reactivado'} correctamente.`, 'success');
          await cargarUsuarios();
        } catch (err) {
          mostrarMensaje(`Error: ${err.message}`, 'error');
        }
      });

      tdAccion.appendChild(btnEliminar);
      tr.appendChild(tdAccion);
      tbodyIndependientes.appendChild(tr);
    });
  }

  // ── Validar campos de usuario ─────────────────────────────────────────────────
  function validarCodigo(codigo) {
    if (!/^\d+$/.test(codigo)) {
      mostrarMensaje('El código de usuario debe contener únicamente números.', 'error');
      return false;
    }
    if (codigo.length < 4 || codigo.length > 15) {
      mostrarMensaje('El código debe tener entre 4 y 15 dígitos.', 'error');
      return false;
    }
    return true;
  }

  function validarContrasena(clave) {
    if (clave.length < 5) {
      mostrarMensaje('La contraseña debe tener mínimo 5 caracteres.', 'error');
      return false;
    }
    if (!/\d/.test(clave)) {
      mostrarMensaje('La contraseña debe incluir al menos un número.', 'error');
      return false;
    }
    if (!/[-*+?!@#$%^&()_={}[\]:;"'<>,.?/~`|\\]/.test(clave)) {
      mostrarMensaje('La contraseña debe incluir al menos un carácter especial (ej: *, +, @, #).', 'error');
      return false;
    }
    return true;
  }

  // ── Guardar cambios del perfil propio ─────────────────────────────────────────
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const claveVal = claveInput?.value?.trim() || '';
      const emailVal = emailInput?.value?.trim() || '';

      // Si viene contraseña, validarla
      if (claveVal && !validarContrasena(claveVal)) return;

      const updates = {};
      if (emailVal) updates.email = emailVal;
      if (claveVal) updates.password = claveVal;

      if (!Object.keys(updates).length) {
        mostrarMensaje('No hay cambios para guardar.', 'error');
        return;
      }

      try {
        if (activeUser && activeUser.id) {
          await apiFetch(`/usuarios/${activeUser.id}`, {
            method: 'PATCH',
            body: JSON.stringify(updates),
          });
          // Actualizar el usuario en sessionStorage si cambió el email
          if (updates.email) {
            const updatedUser = { ...activeUser, email: updates.email };
            sessionStorage.setItem(USER_KEY, JSON.stringify(updatedUser));
          }
          mostrarMensaje('¡Credenciales actualizadas exitosamente!', 'success');
          if (claveInput) claveInput.value = '';
        } else {
          mostrarMensaje('No se puede actualizar: sesión no identificada. Por favor, vuelva a iniciar sesión.', 'error');
        }
      } catch (err) {
        mostrarMensaje(`Error al guardar: ${err.message}`, 'error');
      }
    });
  }

  // ── Crear usuario independiente (solo ADMIN) ──────────────────────────────────
  if (isAdmin && formCrearInd) {
    formCrearInd.addEventListener('submit', async (e) => {
      e.preventDefault();

      const newCodigo = newCodigoInput?.value?.trim() || '';
      const newEmail  = newEmailInput?.value?.trim()  || '';
      const newClave  = newClaveInput?.value          || '';

      if (!validarCodigo(newCodigo)) return;
      if (!validarContrasena(newClave)) return;

      // Validar email si se proporcionó
      if (newEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
        mostrarMensaje('Por favor, ingrese un correo electrónico válido.', 'error');
        return;
      }

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

        mostrarMensaje('¡Usuario creado exitosamente! Ya puede iniciar sesión desde cualquier navegador.', 'success');
        formCrearInd.reset();
        await cargarUsuarios();
      } catch (err) {
        if (err.status === 409) {
          mostrarMensaje(`Ya existe un usuario con el código ${newCodigo}.`, 'error');
        } else {
          mostrarMensaje(`Error al crear usuario: ${err.message}`, 'error');
        }
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
