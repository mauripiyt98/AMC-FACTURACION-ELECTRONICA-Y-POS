/**
 * productos.js — Gestión de Productos / Servicios
 *
 * MIGRACIÓN A BASE DE DATOS:
 * - Si hay sesión JWT activa (backend disponible): usa API REST (/api/productos)
 * - Si no hay backend: usa localStorage (fallback modo offline)
 */
'use strict';

document.addEventListener("DOMContentLoaded", () => {

  // ── Sesión y Configuración ──────────────────────────────────────────────────
  const SESSION_KEY = 'amc_session_v2';
  const activeUserCode = sessionStorage.getItem("amc_active_user_code") || "1110591592";

  const PRODUCTOS_DB_KEY = `amc_productos_db_v1_${activeUserCode}`;
  const PRODUCTO_SELECCIONADO_KEY = `amc_producto_seleccionado_v1_${activeUserCode}`;

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

  function parseNumero(valor) {
    const n = parseFloat(valor);
    return Number.isFinite(n) ? n : 0;
  }

  // ── Carga de Datos ─────────────────────────────────────────────────────────
  async function cargarDB() {
    if (useApi) {
      try {
        const data = await apiFetch('/productos');
        // Normalizar estructura API -> Frontend
        state.list = (data.productos || []).map(p => ({
          id: p.id,
          nombre: p.nombre,
          codigo: p.codigo,
          tipo: p.tipo,
          iva: p.iva,
          unidadMedida: p.unidad_medida,
          precioBase: p.precio_base || 0,
          stockTotal: p.stock_total || 0,
          stockMinimo: p.stock_minimo || 0,
          activo: p.activo !== false
        }));
        return state.list;
      } catch (err) {
        console.warn("Error cargando productos del API, usando caché local", err);
      }
    }
    // Fallback Local (Aislado por tenant)
    let raw = localStorage.getItem(PRODUCTOS_DB_KEY);
    
    // Migración y limpieza de clave global no aislada legado
    const legacyGlobal = localStorage.getItem('amc_productos_db_v1');
    if (legacyGlobal) {
      if (!raw && activeUserCode === '1110591592') {
        localStorage.setItem(PRODUCTOS_DB_KEY, legacyGlobal);
        raw = legacyGlobal;
      }
      localStorage.removeItem('amc_productos_db_v1');
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
      nombre: $("p-nombre").value.trim(),
      codigo: $("p-codigo").value.trim(),
      tipo: $("p-tipo").value,
      iva: parseNumero($("p-iva").value),
      unidadMedida: $("p-unidad").value,
      precioBase: parseNumero($("p-precio").value),
      stockTotal: parseNumero($("p-stock-total").value),
      stockMinimo: parseNumero($("p-stock-minimo").value),
    };
  }

  function limpiarFormulario() {
    const valores = {
      "p-nombre": "",
      "p-codigo": "",
      "p-tipo": "PRODUCTO",
      "p-iva": "19",
      "p-unidad": "UNIDAD",
      "p-precio": "0",
      "p-stock-total": "0",
      "p-stock-minimo": "0",
    };

    Object.entries(valores).forEach(([id, value]) => {
      const el = $(id);
      if (el) el.value = value;
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
      titulo.textContent = "Editar producto / servicio";
      if (pageTitle) pageTitle.textContent = "Editar producto o servicio";
      btnGuardar.textContent = "Actualizar item";
    } else {
      titulo.textContent = "Crear producto / servicio";
      if (pageTitle) pageTitle.textContent = "Crear producto o servicio";
      btnGuardar.textContent = "Guardar item";
    }
  }

  function cargarProductoEnFormulario(item) {
    if (!item) return;
    state.editandoId = item.id;
    $("p-nombre").value = item.nombre || "";
    $("p-codigo").value = item.codigo || "";
    $("p-tipo").value = item.tipo || "PRODUCTO";
    $("p-iva").value = String(item.iva !== undefined ? item.iva : "19");
    $("p-unidad").value = item.unidadMedida || item.unidad_medida || "UNIDAD";
    $("p-precio").value = item.precioBase ?? item.precio_base ?? 0;
    $("p-stock-total").value = item.stockTotal ?? item.stock_total ?? 0;
    $("p-stock-minimo").value = item.stockMinimo ?? item.stock_minimo ?? 0;
    actualizarModoFormulario();
  }

  async function cargarProductoDesdeUrl() {
    const id = new URLSearchParams(window.location.search).get("id");
    if (!id) return;

    // state.list ya fue poblado por cargarDB() en el init — no releer
    if (!state.list.length) await cargarDB();

    const item = state.list.find((x) => String(x.id) === String(id));
    if (!item) {
      mostrarMsg("No se encontró el producto o servicio solicitado para editar.", "error");
      return;
    }
    cargarProductoEnFormulario(item);
  }

  // ── Validaciones ───────────────────────────────────────────────────────────
  function validarProducto(p) {
    if (!p.nombre || p.nombre.length < 3) return "Nombre o descripción del item (mínimo 3 caracteres).";
    if (!p.codigo || p.codigo.length < 1) return "Código de producto obligatorio.";
    return null;
  }

  function codigoDuplicado(codigo, excluirId) {
    const codNorm = normalizar(codigo);
    return state.list.some(p => normalizar(p.codigo) === codNorm && String(p.id) !== String(excluirId));
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
      items = items.filter((p) => {
        const n = normalizar(p.nombre);
        const c = normalizar(p.codigo);
        return n.includes(q) || c.includes(q);
      });
    }

    if (!items.length) {
      lista.innerHTML = `<div class="empty">Sin resultados. Prueba con el nombre o código.</div>`;
      return;
    }

    lista.innerHTML = items.map((p) => {
      const badgeClass = p.tipo === "PRODUCTO" ? "badge-producto" : "badge-servicio";
      const tipoLabel = p.tipo === "PRODUCTO" ? "Producto" : "Servicio";
      if (lista.tagName === 'TBODY') return `<tr data-id="${p.id}"><td><span class="badge-tipo ${badgeClass}">${tipoLabel}</span></td><td><strong>${escapeHtml(p.nombre)}</strong></td><td>${escapeHtml(p.codigo)}</td><td>${escapeHtml(p.unidadMedida || p.unidad_medida || 'UNIDAD')}</td><td class="num">${new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(Number(p.precioBase ?? p.precio_base) || 0)}</td><td class="num">${Number(p.stockTotal ?? p.stock_total ?? 0).toLocaleString('es-CO')}</td><td>${p.activo !== false ? 'Activo' : 'Inactivo'}</td><td><div class="actions"><button type="button" class="btn-usar" data-action="usar">Usar</button><button type="button" class="btn-edit" data-action="editar">Editar</button><button type="button" class="btn-del" data-action="eliminar">Eliminar</button></div></td></tr>`;
      return `
        <div class="item" data-id="${p.id}">
          <strong>${escapeHtml(p.nombre)}</strong>
          <span class="badge-tipo ${badgeClass}">${tipoLabel}</span>
          <div class="meta">
            <div><b>Código:</b> ${escapeHtml(p.codigo)}</div>
            <div><b>IVA:</b> ${escapeHtml(p.iva)}%</div>
            <div><b>U.M.:</b> ${escapeHtml(p.unidadMedida === "GALON" ? "Galón" : "Unidad")}</div>
          </div>
          <div class="actions">
            <button type="button" class="btn-usar" data-action="usar">Usar en factura</button>
            <button type="button" class="btn-edit" data-action="editar">Editar</button>
            <button type="button" class="btn-del" data-action="eliminar">Eliminar</button>
          </div>
        </div>`;
    }).join("");

    lista.querySelectorAll("button[data-action]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        // Funciona tanto para div.item (cards) como para <tr> en tabla
        const card = btn.closest("[data-id]");
        const id = card?.dataset?.id;
        if (!id) return;
        const action = btn.dataset.action;
        const item = state.list.find((x) => String(x.id) === String(id));
        if (!item && action !== "eliminar") return;

        if (action === "usar") {
          localStorage.setItem(PRODUCTO_SELECCIONADO_KEY, JSON.stringify(item));
          window.location.href = "../index.html";
        }

        if (action === "editar") {
          window.location.href = `productos.html?id=${encodeURIComponent(id)}`;
        }

        if (action === "eliminar") {
          const ok = window.confirm("¿Desea eliminar este producto o servicio de la base de datos?");
          if (!ok) return;
          try {
            if (useApi) {
              await apiFetch(`/productos/${id}`, { method: 'DELETE' });
            } else {
              const next = state.list.filter(x => String(x.id) !== String(id));
              // Guardar lista actualizada SIN el item eliminado
              localStorage.setItem(PRODUCTOS_DB_KEY, JSON.stringify(next));
              state.list = next;
            }
            if (useApi) {
              state.list = state.list.filter(x => String(x.id) !== String(id));
            }
            mostrarMsg("Producto/servicio eliminado.", "success");
            await renderLista();
          } catch (err) {
            mostrarMsg(`Error al eliminar: ${err.message}`, "error");
          }
        }
      });
    });
  }

  // ── Guardar ────────────────────────────────────────────────────────────────
  async function guardarProducto(opciones = {}) {
    limpiarMsg();

    const datos = leerFormulario();
    const err = validarProducto(datos);
    if (err) { mostrarMsg(err, "error"); return null; }

    if (codigoDuplicado(datos.codigo, state.editandoId)) {
      mostrarMsg("Ya existe otro producto o servicio con ese código.", "error"); return null;
    }

    let guardado = null;
    const isUpdate = !!state.editandoId;

    try {
      if (useApi) {
        // Mapeo Frontend -> API
        const payload = {
          nombre: datos.nombre,
          codigo: datos.codigo,
          tipo: datos.tipo,
          iva: datos.iva,
          unidad_medida: datos.unidadMedida,
          precio_base: datos.precioBase,
          stock_total: datos.stockTotal,
          stock_minimo: datos.stockMinimo,
        };

        let response;
        if (isUpdate) {
          response = await apiFetch(`/productos/${state.editandoId}`, {
            method: 'PATCH',
            body: JSON.stringify(payload)
          });
        } else {
          response = await apiFetch('/productos', {
            method: 'POST',
            body: JSON.stringify(payload)
          });
        }
        guardado = response.producto;
        mostrarMsg(isUpdate ? "Item actualizado exitosamente en BD." : "Item creado exitosamente en BD.");
      } else {
        // ── FALLBACK LOCAL ────────────────────────────────────────────────────
        // SIEMPRE leer la lista actual del localStorage antes de modificar.
        // Esto evita que state.list vacío (al entrar directo al formulario
        // de creación sin pasar por la lista) sobreescriba datos existentes.
        let listaActual = [];
        try {
          const rawActual = localStorage.getItem(PRODUCTOS_DB_KEY);
          listaActual = rawActual ? (JSON.parse(rawActual) || []) : [];
          if (!Array.isArray(listaActual)) listaActual = [];
        } catch { listaActual = []; }

        if (isUpdate) {
          // Editar: reemplazar el item con el mismo id en la lista real
          const idx = listaActual.findIndex((p) => String(p.id) === String(state.editandoId));
          if (idx !== -1) {
            guardado = { ...listaActual[idx], ...datos, actualizadoEn: new Date().toISOString() };
            listaActual[idx] = guardado;
          } else {
            // Si por alguna razón no se encuentra en localStorage, usar state.list
            const idxState = state.list.findIndex((p) => String(p.id) === String(state.editandoId));
            if (idxState !== -1) {
              guardado = { ...state.list[idxState], ...datos, actualizadoEn: new Date().toISOString() };
              listaActual.push(guardado);
            }
          }
        } else {
          // Crear: agregar el nuevo item a la lista real existente
          guardado = { id: 'local_' + Date.now().toString(), ...datos, activo: true, creadoEn: new Date().toISOString() };
          listaActual.push(guardado);
        }

        // Persistir lista completa (existentes + nuevo/editado)
        state.list = listaActual;
        localStorage.setItem(PRODUCTOS_DB_KEY, JSON.stringify(state.list));
        mostrarMsg(isUpdate ? "Item actualizado y guardado en catálogo." : "Item creado y guardado en catálogo.");
      }

      if (!isUpdate) limpiarFormulario();
      await cargarDB();

      if (opciones.usarEnFactura && guardado) {
        // Para compatibilidad local, mapear snake_case a camelCase si viene del backend
        const itemSeleccionado = {
           id: guardado.id,
           nombre: guardado.nombre,
           codigo: guardado.codigo,
           tipo: guardado.tipo,
           iva: guardado.iva,
           unidadMedida: guardado.unidad_medida || guardado.unidadMedida
        };
        localStorage.setItem(PRODUCTO_SELECCIONADO_KEY, JSON.stringify(itemSeleccionado));
        window.location.href = "../index.html?sec=crear-factura";
      }

      if (!opciones.usarEnFactura) window.location.href = `lista-productos.html?guardado=${encodeURIComponent(guardado.id)}`;

      return guardado;

    } catch (error) {
      mostrarMsg(`Error al guardar: ${error.message}`, "error");
      return null;
    }
  }

  // ── Eventos Iniciales ──────────────────────────────────────────────────────
  const btnVolver = $("btn-volver");
  if (btnVolver) {
    btnVolver.addEventListener("click", () => {
      window.location.href = "../index.html?sec=crear-factura";
    });
  }

  const btnGuardar = $("btn-guardar");
  if (btnGuardar) {
    btnGuardar.addEventListener("click", () => guardarProducto());
  }

  const btnGuardarUsar = $("btn-guardar-usar");
  if (btnGuardarUsar) {
    btnGuardarUsar.addEventListener("click", () => guardarProducto({ usarEnFactura: true }));
  }

  const btnLimpiar = $("btn-limpiar");
  if (btnLimpiar) {
    btnLimpiar.addEventListener("click", () => {
      limpiarFormulario();
      limpiarMsg();
    });
  }

  const buscar = $("buscar");
  if (buscar) buscar.addEventListener("input", renderLista);

  // ── Inicialización ─────────────────────────────────────────────────────────
  // Siempre cargar la lista del tenant al iniciar (necesario para:
  //  - validar códigos duplicados al crear
  //  - mostrar la lista correctamente
  //  - evitar que state.list vacío sobreescriba datos al guardar)
  cargarDB().then(() => {
    return cargarProductoDesdeUrl();
  }).then(() => {
    actualizarModoFormulario();
    renderLista();
  });

});
