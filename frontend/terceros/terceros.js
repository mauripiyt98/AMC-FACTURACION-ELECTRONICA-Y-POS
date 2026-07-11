/**
 * terceros.js — Gestión de Clientes (Terceros)
 *
 * MIGRACIÓN A BASE DE DATOS:
 * - Si hay sesión JWT activa (backend disponible): usa API REST (/api/terceros)
 * - Si no hay backend: usa localStorage (fallback modo offline)
 */
'use strict';

document.addEventListener("DOMContentLoaded", () => {

  // ── Sesión y Configuración ──────────────────────────────────────────────────
  const SESSION_KEY = 'amc_session_v2';
  const activeUserCode = sessionStorage.getItem("amc_active_user_code") || "1110591592";
  const isDev = activeUserCode === "1110591592";

  const TERCEROS_DB_KEY = isDev ? "amc_terceros_db_v1" : `amc_terceros_db_v1_${activeUserCode}`;
  const CLIENTE_SELECCIONADO_KEY = isDev ? "amc_cliente_seleccionado_v1" : `amc_cliente_seleccionado_v1_${activeUserCode}`;

  function getToken() {
    try {
      const s = JSON.parse(sessionStorage.getItem(SESSION_KEY) || '{}');
      return s.token || null;
    } catch { return null; }
  }

  const token = getToken();
  const useApi = !!token;
  const API_BASE = 'http://localhost:3000/api';

  const $ = (id) => document.getElementById(id);
  const state = { editandoId: null, list: [] };

  // ── API Helper ──────────────────────────────────────────────────────────────
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

  // ── Funciones Base ─────────────────────────────────────────────────────────
  function normalizar(s) {
    return String(s || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  function mostrarMsg(html, tipo = "success") {
    const msg = $("msg");
    if (msg) {
      msg.innerHTML = `<div class="alert alert-${tipo}">${html}</div>`;
      msg.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  function limpiarMsg() {
    const msg = $("msg");
    if (msg) msg.innerHTML = "";
  }

  function escapeHtml(text) {
    const d = document.createElement("div");
    d.textContent = String(text || "");
    return d.innerHTML;
  }

  // ── Carga de Datos ─────────────────────────────────────────────────────────
  async function cargarDB() {
    if (useApi) {
      try {
        const data = await apiFetch('/terceros');
        // Normalizar estructura API -> Frontend
        state.list = (data.terceros || []).map(t => ({
          id: t.id,
          nombre: t.nombre,
          documento: t.documento,
          email: t.email || '',
          telefono: t.telefono || '',
          direccion: t.direccion || '',
          ciudad: t.ciudad || ''
        }));
        return state.list;
      } catch (err) {
        console.warn("Error cargando terceros del API, usando caché local", err);
      }
    }
    // Fallback Local
    const raw = localStorage.getItem(TERCEROS_DB_KEY);
    if (!raw) { state.list = []; return []; }
    try {
      const arr = JSON.parse(raw);
      state.list = Array.isArray(arr) ? arr : [];
      return state.list;
    } catch {
      state.list = [];
      return [];
    }
  }

  // ── DOM y Formularios ──────────────────────────────────────────────────────
  function leerFormulario() {
    return {
      nombre: $("t-nombre").value.trim(),
      documento: $("t-doc").value.trim(),
      email: $("t-email").value.trim(),
      telefono: $("t-telefono").value.trim(),
      direccion: $("t-direccion").value.trim(),
      ciudad: $("t-ciudad").value.trim(),
    };
  }

  function limpiarFormulario() {
    ["t-nombre", "t-doc", "t-email", "t-telefono", "t-direccion", "t-ciudad"].forEach((id) => {
      const el = $(id);
      if (el) el.value = "";
    });
    if (!new URLSearchParams(window.location.search).get("id")) {
      state.editandoId = null;
    }
    actualizarModoFormulario();
  }

  function actualizarModoFormulario() {
    const titulo = $("form-titulo");
    const pageTitle = $("page-title");
    const btnGuardar = $("btn-guardar");
    if (!titulo || !btnGuardar) return;
    if (state.editandoId) {
      titulo.textContent = "Editar tercero (cliente)";
      if (pageTitle) pageTitle.textContent = "Editar tercero";
      btnGuardar.textContent = "Actualizar tercero";
    } else {
      titulo.textContent = "Crear tercero (cliente)";
      if (pageTitle) pageTitle.textContent = "Crear tercero";
      btnGuardar.textContent = "Guardar tercero";
    }
  }

  function cargarTerceroEnFormulario(tercero) {
    if (!tercero) return;
    state.editandoId = tercero.id;
    $("t-nombre").value = tercero.nombre || "";
    $("t-doc").value = tercero.documento || "";
    $("t-email").value = tercero.email || "";
    $("t-telefono").value = tercero.telefono || "";
    $("t-direccion").value = tercero.direccion || "";
    $("t-ciudad").value = tercero.ciudad || "";
    actualizarModoFormulario();
  }

  async function cargarTerceroDesdeUrl() {
    const id = new URLSearchParams(window.location.search).get("id");
    if (!id) return;
    await cargarDB();
    const tercero = state.list.find((x) => String(x.id) === String(id));
    if (!tercero) {
      mostrarMsg("No se encontró el tercero solicitado para editar.", "error");
      return;
    }
    cargarTerceroEnFormulario(tercero);
  }

  // ── Validaciones ───────────────────────────────────────────────────────────
  function validarTercero(t) {
    if (!t.nombre || t.nombre.length < 3) return "Nombre completo (mínimo 3 caracteres).";
    if (!t.documento || t.documento.length < 3) return "Número de documento (mínimo 3 caracteres).";
    if (t.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t.email)) return "Correo electrónico no válido.";
    return null;
  }

  function documentoDuplicado(documento, excluirId) {
    const docNorm = normalizar(documento);
    return state.list.some(t => normalizar(t.documento) === docNorm && String(t.id) !== String(excluirId));
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  async function renderLista() {
    const lista = $("lista");
    const empty = $("empty");
    const buscar = $("buscar");
    if (!lista || !empty || !buscar) return;

    if (!state.list.length) await cargarDB();

    const q = normalizar(buscar.value);
    if (!state.list.length) {
      lista.innerHTML = "";
      empty.style.display = "block";
      return;
    }
    empty.style.display = "none";

    let items = state.list.slice().sort((a, b) => (a.nombre || "").localeCompare(b.nombre || ""));
    if (q.length >= 3) {
      items = items.filter((t) => {
        const n = normalizar(t.nombre);
        const d = normalizar(t.documento);
        return n.includes(q) || d.includes(q);
      });
    }

    if (!items.length) {
      lista.innerHTML = `<div class="empty">Sin resultados. Prueba con 3 letras del nombre o 3 números del documento.</div>`;
      return;
    }

    lista.innerHTML = items.map((t) => `
      <div class="item" data-id="${t.id}">
        <strong>${escapeHtml(t.nombre)}</strong>
        <div class="meta">
          <div><b>Documento:</b> ${escapeHtml(t.documento)}</div>
          <div><b>Email:</b> ${t.email ? escapeHtml(t.email) : "-"}</div>
          <div><b>Teléfono:</b> ${t.telefono ? escapeHtml(t.telefono) : "-"}</div>
          <div><b>Dirección:</b> ${t.direccion ? escapeHtml(t.direccion) : "-"}</div>
          <div><b>Ciudad:</b> ${t.ciudad ? escapeHtml(t.ciudad) : "-"}</div>
        </div>
        <div class="actions">
          <button type="button" class="btn-usar" data-action="usar">Usar en factura</button>
          <button type="button" class="btn-edit" data-action="editar">Editar</button>
          <button type="button" class="btn-del" data-action="eliminar">Eliminar</button>
        </div>
      </div>`).join("");

    lista.querySelectorAll("button[data-action]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const card = btn.closest(".item");
        const id = card?.dataset?.id;
        if (!id) return;
        const action = btn.dataset.action;
        const tercero = state.list.find((x) => String(x.id) === String(id));
        if (!tercero && action !== "eliminar") return;

        if (action === "usar") {
          localStorage.setItem(CLIENTE_SELECCIONADO_KEY, JSON.stringify(tercero));
          window.location.href = "../index.html";
        }

        if (action === "editar") {
          window.location.href = `crear-tercero.html?id=${encodeURIComponent(id)}`;
        }

        if (action === "eliminar") {
          const ok = window.confirm("¿Desea eliminar este tercero de la base de datos?");
          if (!ok) return;
          try {
            if (useApi) {
              await apiFetch(`/terceros/${id}`, { method: 'DELETE' });
            } else {
              const next = state.list.filter(x => String(x.id) !== String(id));
              localStorage.setItem(TERCEROS_DB_KEY, JSON.stringify(next));
            }
            mostrarMsg("Tercero eliminado.", "success");
            await renderLista();
          } catch (err) {
            mostrarMsg(`Error al eliminar: ${err.message}`, "error");
          }
        }
      });
    });
  }

  // ── Guardar ────────────────────────────────────────────────────────────────
  async function guardarTercero(opciones = {}) {
    limpiarMsg();
    const datos = leerFormulario();
    const err = validarTercero(datos);
    if (err) { mostrarMsg(err, "error"); return null; }
    if (documentoDuplicado(datos.documento, state.editandoId)) {
      mostrarMsg("Ya existe un tercero con ese número de documento.", "error"); return null;
    }

    let guardado = null;
    const isUpdate = !!state.editandoId;

    try {
      if (useApi) {
        // Mapeo Frontend -> API
        const payload = {
          nombre: datos.nombre,
          documento: datos.documento,
          tipo_documento: 'NIT', // Default simplificado
          email: datos.email,
          telefono: datos.telefono,
          direccion: datos.direccion,
          ciudad: datos.ciudad
        };

        let response;
        if (isUpdate) {
          response = await apiFetch(`/terceros/${state.editandoId}`, {
            method: 'PATCH',
            body: JSON.stringify(payload)
          });
        } else {
          response = await apiFetch('/terceros', {
            method: 'POST',
            body: JSON.stringify(payload)
          });
        }
        guardado = response.tercero;
        mostrarMsg(isUpdate ? "Tercero actualizado exitosamente en BD." : "Tercero creado exitosamente en BD.");
      } else {
        // Fallback Local
        if (isUpdate) {
          const idx = state.list.findIndex((t) => String(t.id) === String(state.editandoId));
          if (idx !== -1) {
            guardado = { ...state.list[idx], ...datos, actualizadoEn: new Date().toISOString() };
            state.list[idx] = guardado;
          }
        } else {
          guardado = { id: 'local_' + Date.now().toString(), ...datos, creadoEn: new Date().toISOString() };
          state.list.push(guardado);
        }
        localStorage.setItem(TERCEROS_DB_KEY, JSON.stringify(state.list));
        mostrarMsg(isUpdate ? "Tercero actualizado localmente." : "Tercero guardado localmente.");
      }

      if (!isUpdate) limpiarFormulario();
      await cargarDB();

      if (opciones.usarEnFactura && guardado) {
        localStorage.setItem(CLIENTE_SELECCIONADO_KEY, JSON.stringify(guardado));
        window.location.href = "../index.html?sec=crear-factura";
      }

      return guardado;

    } catch (error) {
      mostrarMsg(`Error al guardar: ${error.message}`, "error");
      return null;
    }
  }

  // ── Eventos Iniciales ──────────────────────────────────────────────────────
  const btnVolver = $("btn-volver");
  if (btnVolver) btnVolver.addEventListener("click", () => (window.location.href = "../index.html?sec=crear-factura"));

  const btnGuardar = $("btn-guardar");
  if (btnGuardar) btnGuardar.addEventListener("click", () => guardarTercero());

  const btnGuardarUsar = $("btn-guardar-usar");
  if (btnGuardarUsar) {
    btnGuardarUsar.addEventListener("click", () => guardarTercero({ usarEnFactura: true }));
  }

  const btnLimpiar = $("btn-limpiar");
  if (btnLimpiar) {
    btnLimpiar.addEventListener("click", () => { limpiarFormulario(); limpiarMsg(); });
  }

  const buscar = $("buscar");
  if (buscar) buscar.addEventListener("input", renderLista);

  // Init
  cargarTerceroDesdeUrl().then(() => {
    actualizarModoFormulario();
    renderLista();
  });

});
