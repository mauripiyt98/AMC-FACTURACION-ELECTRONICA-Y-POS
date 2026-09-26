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
  const TERCEROS_DB_KEY = `amc_terceros_db_v1_${activeUserCode}`;
  const FACTURAS_GENERADAS_DB_KEY = `amc_facturas_generadas_db_v1_${activeUserCode}`;
  const CLIENTE_SELECCIONADO_KEY = `amc_cliente_seleccionado_v1_${activeUserCode}`;

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

  // Extrae un tercero por documento desde los snapshots que conserva cada FE.
  function extraerTercerosDeFacturas() {
    let facturas;
    try {
      facturas = JSON.parse(localStorage.getItem(FACTURAS_GENERADAS_DB_KEY) || '[]');
    } catch { return []; }
    if (!Array.isArray(facturas)) return [];

    const limpiar = value => String(value == null ? '' : value).trim();
    const claveDocumento = documento => limpiar(documento).replace(/[.\s-]/g, '').toLowerCase();
    const grupos = new Map();

    facturas.forEach(factura => {
      const cliente = factura && factura.cliente ? factura.cliente : factura || {};
      const registro = {
        nombre: limpiar(cliente.nombre || cliente.cliente_nombre),
        documento: limpiar(cliente.documento || cliente.cliente_documento),
        email: limpiar(cliente.email || cliente.cliente_email),
        telefono: limpiar(cliente.telefono || cliente.cliente_telefono),
        direccion: limpiar(cliente.direccion || cliente.cliente_direccion),
        ciudad: limpiar(cliente.ciudad || cliente.cliente_ciudad),
        fecha: factura && (factura.generadoEn || factura.generado_en || factura.actualizado_en) || ''
      };
      if (!registro.nombre || !registro.documento) return;
      const clave = claveDocumento(registro.documento);
      if (!clave) return;
      const versiones = grupos.get(clave) || [];
      versiones.push(registro);
      grupos.set(clave, versiones);
    });

    return [...grupos.values()].map(versiones => {
      versiones.sort((a, b) => new Date(b.fecha || 0).getTime() - new Date(a.fecha || 0).getTime());
      const masReciente = versiones[0];
      const dato = campo => versiones.map(version => version[campo]).find(Boolean) || '';
      return {
        id: `TER-REC-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
        nombre: dato('nombre'),
        documento: masReciente.documento,
        email: dato('email'),
        telefono: dato('telefono'),
        direccion: dato('direccion'),
        ciudad: dato('ciudad')
      };
    }).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }

  // ── Carga de Datos ─────────────────────────────────────────────────────────
  async function cargarDB() {
    if (useApi) {
      try {
        const pageSize = 500;
        const terceros = [];
        let offset = 0;
        while (true) {
          const data = await apiFetch(`/terceros?limit=${pageSize}&offset=${offset}`);
          const pagina = Array.isArray(data.terceros) ? data.terceros : [];
          terceros.push(...pagina);
          if (!data.pagination?.hasMore || pagina.length === 0) break;
          offset += pagina.length;
        }
        // Normalizar estructura API -> Frontend
        state.list = terceros.map(t => ({
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
    // Fallback Local (Aislado por tenant)
    let raw = localStorage.getItem(TERCEROS_DB_KEY);

    // Migración y limpieza de clave global no aislada legado
    const legacyGlobal = localStorage.getItem('amc_terceros_db_v1');
    if (legacyGlobal) {
      if (!raw && activeUserCode === '1110591592') {
        localStorage.setItem(TERCEROS_DB_KEY, legacyGlobal);
        raw = legacyGlobal;
      }
      localStorage.removeItem('amc_terceros_db_v1');
    }

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
    // Esta pantalla también se usa para crear. Cargar siempre el catálogo antes
    // de guardar evita sobrescribir los clientes existentes con una lista vacía.
    await cargarDB();
    const id = new URLSearchParams(window.location.search).get("id");
    if (!id) return;
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
    // Defensa adicional ante una carga incompleta o una pestaña recién abierta.
    // Nunca se escribe localStorage usando un arreglo que no provenga de la BD.
    if (!useApi) await cargarDB();
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
        window.location.href = "../crear-factura.html";
      }

      return guardado;

    } catch (error) {
      mostrarMsg(`Error al guardar: ${error.message}`, "error");
      return null;
    }
  }

  async function crearTercerosDesdeFacturas() {
    limpiarMsg();
    const candidatos = extraerTercerosDeFacturas();
    if (!candidatos.length) {
      mostrarMsg('No se encontraron facturas con nombre y documento de cliente para recuperar.', 'error');
      return;
    }

    await cargarDB();
    const boton = $('btn-recuperar-facturas');
    const textoOriginal = boton ? boton.textContent : '';
    if (boton) boton.disabled = true;

    let creados = 0;
    let omitidos = 0;
    let errores = 0;
    let usarAlmacenamientoLocal = !useApi;

    for (let i = 0; i < candidatos.length; i++) {
      const tercero = candidatos[i];
      if (documentoDuplicado(tercero.documento)) {
        omitidos++;
        continue;
      }

      if (boton) boton.textContent = `Creando ${i + 1} de ${candidatos.length}...`;
      try {
        if (!usarAlmacenamientoLocal) {
          const response = await apiFetch('/terceros', {
            method: 'POST',
            body: JSON.stringify({ ...tercero, tipo_documento: 'NIT' })
          });
          state.list.push(response.tercero);
        } else {
          const guardado = {
            id: `local_${Date.now().toString(36)}_${i}`,
            ...tercero,
            creadoEn: new Date().toISOString()
          };
          state.list.push(guardado);
          // Persistir después de cada cliente para no perder el avance.
          localStorage.setItem(TERCEROS_DB_KEY, JSON.stringify(state.list));
        }
        creados++;
      } catch (error) {
        // Una sesión antigua puede conservar token aunque el servidor no esté
        // activo. En ese caso se continúa en el almacenamiento local.
        if (!usarAlmacenamientoLocal) {
          usarAlmacenamientoLocal = true;
          i--;
          continue;
        }
        console.error('No fue posible crear tercero:', tercero.documento, error);
        errores++;
      }
    }

    if (usarAlmacenamientoLocal) {
      localStorage.setItem(TERCEROS_DB_KEY, JSON.stringify(state.list));
    }
    if (boton) {
      boton.textContent = textoOriginal;
      boton.disabled = false;
    }
    const detalleErrores = errores ? ` No se pudieron crear ${errores}.` : '';
    mostrarMsg(`Proceso terminado: ${creados} terceros creados individualmente desde las facturas y ${omitidos} ya existentes omitidos.${detalleErrores}`, errores ? 'error' : 'success');
    await renderLista();
  }

  // ── Eventos Iniciales ──────────────────────────────────────────────────────
  const btnVolver = $("btn-volver");
  if (btnVolver) btnVolver.addEventListener("click", () => (window.location.href = "../crear-factura.html"));

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

  const btnRecuperarFacturas = $('btn-recuperar-facturas');
  if (btnRecuperarFacturas) {
    btnRecuperarFacturas.addEventListener('click', crearTercerosDesdeFacturas);
  }

  const buscar = $("buscar");
  if (buscar) buscar.addEventListener("input", renderLista);

  // Init
  cargarTerceroDesdeUrl().then(() => {
    actualizarModoFormulario();
    renderLista();
  });

});
