'use strict';

document.addEventListener('DOMContentLoaded', () => {
  const API_BASE_URL = 'http://localhost:3000/api';
  const SESSION_KEY = 'amc_session_v2';
  const activeUserCode = sessionStorage.getItem('amc_active_user_code') || '1110591592';
  const isDev = activeUserCode === '1110591592';
  const DB_KEY = isDev ? 'amc_empleados_db_v1' : `amc_empleados_db_v1_${activeUserCode}`;
  const state = { empleados: [], searchTimer: null, empleadoEditandoId: null };
  const $ = (id) => document.getElementById(id);

  function getToken() {
    try {
      return JSON.parse(sessionStorage.getItem(SESSION_KEY) || '{}').token || null;
    } catch {
      return null;
    }
  }

  async function apiFetch(endpoint, options = {}) {
    const token = getToken();
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      sessionStorage.removeItem(SESSION_KEY);
      sessionStorage.removeItem('amc_user_v2');
      window.location.replace('../login.html');
      throw new Error('Sesión expirada');
    }
    if (!response.ok) throw new Error(data.message || `Error ${response.status}`);
    return data;
  }

  function dinero(valor) {
    return Number(String(valor || '').replace(/[^\d]/g, '')) || 0;
  }

  function formato(input) {
    const valor = dinero(input.value);
    input.value = valor ? valor.toLocaleString('es-CO') : '';
  }

  function mostrarMensaje(texto, tipo) {
    const message = $('mensaje');
    message.replaceChildren();
    const alert = document.createElement('div');
    alert.className = `alert alert-${tipo}`;
    alert.textContent = texto;
    message.append(alert);
  }

  function limpiarMensaje() {
    $('mensaje').replaceChildren();
  }

  function leerFormulario(prefix = '') {
    const field = (id) => $(`${prefix}${id}`);
    return {
      nombre: field('nombre').value.trim(),
      documento: field('documento').value.trim(),
      email: field('email').value.trim(),
      telefono: field('telefono').value.trim(),
      ciudad: field('ciudad').value.trim(),
      direccion: field('direccion').value.trim(),
      cuenta: field('cuenta').value.trim(),
      fechaInicioContrato: field('fecha-inicio').value,
      tipoContrato: field('tipo-contrato').value,
      salario: dinero(field('salario').value),
      numeroContrato: field('numero-contrato').value.trim(),
      cargo: field('cargo').value.trim(),
      tipoCotizante: field('tipo-cotizante').value,
      fondoSalud: field('fondo-salud').value.trim(),
      fondoPension: field('fondo-pension').value.trim(),
      cajaCompensacion: field('caja-compensacion').value.trim(),
      arl: field('arl').value.trim(),
      nivelRiesgoArl: field('nivel-riesgo-arl').value.trim(),
    };
  }

  function validarEmpleado(empleado) {
    for (const [campo, valor] of Object.entries(empleado)) {
      if (!valor) return campo === 'salario' ? 'El valor de salario es obligatorio.' : 'Todos los campos del empleado son obligatorios.';
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(empleado.email)) return 'Ingrese un correo electrónico válido.';
    if (empleado.nombre.length < 4 || empleado.documento.length < 4) return 'Nombre y documento deben tener al menos 4 caracteres.';
    return null;
  }

  function cargarLocal() {
    try {
      const data = JSON.parse(localStorage.getItem(DB_KEY) || '[]');
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  function guardarLocal(empleados) {
    localStorage.setItem(DB_KEY, JSON.stringify(empleados));
  }

  function limpiarFormulario() {
    $('form-empleado').reset();
    limpiarMensaje();
  }

  function normalizar(texto) {
    return String(texto || '').trim().toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function ocultarDocumento(documento) {
    const value = String(documento || '').trim();
    if (value.length <= 4) return '••••';
    return `${'•'.repeat(Math.max(4, value.length - 4))}${value.slice(-4)}`;
  }

  function etiquetaContrato(value) {
    return value === 'INDEFINIDO' ? 'Indefinido' : value === 'FIJO' ? 'Fijo' : 'Sin definir';
  }

  function etiquetaCotizante(value) {
    return value === 'INDEPENDIENTE' ? 'Independiente' : value === 'DEPENDIENTE' ? 'Dependiente' : 'Sin definir';
  }

  function formatearFecha(value) {
    if (!value) return 'Sin definir';
    const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
    return Number.isNaN(date.getTime()) ? 'Sin definir' : date.toLocaleDateString('es-CO');
  }

  function valor(empleado, backendKey, localKey = backendKey) {
    return empleado[backendKey] ?? empleado[localKey] ?? '';
  }

  function crearDato(label, content) {
    const row = document.createElement('div');
    const title = document.createElement('dt');
    const value = document.createElement('dd');
    title.textContent = label;
    value.textContent = content || 'Sin definir';
    row.append(title, value);
    return row;
  }

  function renderEmpleados() {
    const list = $('lista-empleados');
    const empty = $('empleados-vacio');
    const summary = $('empleados-resumen');
    list.replaceChildren();

    if (!state.empleados.length) {
      empty.hidden = false;
      summary.textContent = '';
      return;
    }

    empty.hidden = true;
    summary.textContent = `${state.empleados.length} empleado${state.empleados.length === 1 ? '' : 's'} encontrado${state.empleados.length === 1 ? '' : 's'}.`;
    const fragment = document.createDocumentFragment();
    state.empleados.forEach((empleado) => {
      const card = document.createElement('article');
      card.className = 'employee-item';

      const name = document.createElement('h3');
      name.textContent = empleado.nombre || 'Empleado sin nombre';
      const employeeDocument = document.createElement('p');
      employeeDocument.className = 'employee-document';
      employeeDocument.textContent = `Documento: ${ocultarDocumento(empleado.documento)}`;
      const metadata = document.createElement('dl');
      metadata.className = 'employee-meta';
      metadata.append(
        crearDato('Cargo', empleado.cargo),
        crearDato('Ciudad', empleado.ciudad),
        crearDato('Contrato', etiquetaContrato(valor(empleado, 'tipo_contrato', 'tipoContrato'))),
        crearDato('Inicio', formatearFecha(valor(empleado, 'fecha_inicio_contrato', 'fechaInicioContrato'))),
        crearDato('Salario', `$ ${Number(empleado.salario || 0).toLocaleString('es-CO')}`),
      );
      const actions = document.createElement('div');
      actions.className = 'employee-card-actions';
      const viewButton = document.createElement('button');
      viewButton.type = 'button';
      viewButton.textContent = '👁 Ver';
      viewButton.setAttribute('aria-label', `Ver información completa de ${empleado.nombre}`);
      viewButton.addEventListener('click', () => abrirDetalle(empleado.id));
      const editButton = document.createElement('button');
      editButton.type = 'button';
      editButton.className = 'edit-employee';
      editButton.textContent = 'Editar';
      editButton.setAttribute('aria-label', `Editar a ${empleado.nombre}`);
      editButton.addEventListener('click', () => abrirEdicion(empleado.id));
      actions.append(viewButton, editButton);
      card.append(name, employeeDocument, metadata, actions);
      fragment.append(card);
    });
    list.append(fragment);
  }

  function filtrarLocal(search) {
    const needle = normalizar(search);
    return cargarLocal().filter((empleado) => !needle || normalizar(empleado.nombre).includes(needle) || normalizar(empleado.documento).includes(needle));
  }

  async function cargarEmpleados() {
    const search = $('buscar-empleado').value.trim();
    const button = $('btn-actualizar-empleados');
    button.disabled = true;
    button.textContent = 'Actualizando…';
    $('empleados-resumen').textContent = 'Cargando empleados…';
    try {
      if (!getToken()) {
        state.empleados = filtrarLocal(search);
      } else {
        const params = new URLSearchParams({ limit: '100' });
        if (search.length >= 2) params.set('search', search);
        const data = await apiFetch(`/empleados?${params}`);
        state.empleados = Array.isArray(data.empleados) ? data.empleados : [];
      }
      renderEmpleados();
    } catch (error) {
      state.empleados = [];
      renderEmpleados();
      mostrarMensaje(error.message || 'No fue posible consultar los empleados.', 'error');
    } finally {
      button.disabled = false;
      button.textContent = 'Actualizar listado';
    }
  }

  async function obtenerEmpleado(id) {
    if (getToken()) {
      const data = await apiFetch(`/empleados/${encodeURIComponent(id)}`);
      return data.empleado;
    }
    const empleado = cargarLocal().find((item) => item.id === id);
    if (!empleado) throw new Error('Empleado no encontrado. Actualice el listado e inténtelo de nuevo.');
    return empleado;
  }

  function abrirModal(id) {
    $(id).hidden = false;
  }

  function cerrarModal(id) {
    $(id).hidden = true;
    if (id === 'modal-editar-empleado') state.empleadoEditandoId = null;
  }

  function crearSeccionDetalle(title, fields) {
    const section = document.createElement('section');
    section.className = 'detail-section';
    const heading = document.createElement('h3');
    heading.textContent = title;
    const grid = document.createElement('dl');
    grid.className = 'detail-grid';
    fields.forEach(([label, content]) => grid.append(crearDato(label, content)));
    section.append(heading, grid);
    return section;
  }

  function mostrarDetalle(empleado) {
    const content = $('detalle-empleado-contenido');
    content.replaceChildren(
      crearSeccionDetalle('Datos personales y contacto', [
        ['Nombre completo', empleado.nombre], ['Documento', empleado.documento], ['Correo electrónico', empleado.email],
        ['Teléfono', empleado.telefono], ['Ciudad', empleado.ciudad], ['Dirección', empleado.direccion], ['Cuenta bancaria', valor(empleado, 'cuenta_bancaria', 'cuenta')],
      ]),
      crearSeccionDetalle('Contrato y cargo', [
        ['Inicio de contrato', formatearFecha(valor(empleado, 'fecha_inicio_contrato', 'fechaInicioContrato'))],
        ['Tipo de contrato', etiquetaContrato(valor(empleado, 'tipo_contrato', 'tipoContrato'))],
        ['Salario', `$ ${Number(empleado.salario || 0).toLocaleString('es-CO')}`], ['Número de contrato', valor(empleado, 'numero_contrato', 'numeroContrato')],
        ['Cargo', empleado.cargo], ['Tipo de cotizante', etiquetaCotizante(valor(empleado, 'tipo_cotizante', 'tipoCotizante'))],
      ]),
      crearSeccionDetalle('Seguridad social', [
        ['Fondo de salud', valor(empleado, 'fondo_salud', 'fondoSalud')], ['Fondo de pensión', valor(empleado, 'fondo_pension', 'fondoPension')],
        ['Caja de compensación', valor(empleado, 'caja_compensacion', 'cajaCompensacion')], ['ARL', empleado.arl],
        ['Nivel de riesgo ARL', valor(empleado, 'nivel_riesgo_arl', 'nivelRiesgoArl')],
      ])
    );
  }

  async function abrirDetalle(id) {
    const content = $('detalle-empleado-contenido');
    content.textContent = 'Cargando información del empleado…';
    abrirModal('modal-detalle-empleado');
    try {
      mostrarDetalle(await obtenerEmpleado(id));
    } catch (error) {
      content.textContent = error.message || 'No fue posible consultar el empleado.';
    }
  }

  function cargarFormularioEdicion(empleado) {
    const fill = (id, value) => { $(`edit-${id}`).value = value ?? ''; };
    fill('nombre', empleado.nombre); fill('documento', empleado.documento); fill('email', empleado.email); fill('telefono', empleado.telefono);
    fill('ciudad', empleado.ciudad); fill('direccion', empleado.direccion); fill('cuenta', valor(empleado, 'cuenta_bancaria', 'cuenta'));
    fill('fecha-inicio', String(valor(empleado, 'fecha_inicio_contrato', 'fechaInicioContrato')).slice(0, 10));
    fill('tipo-contrato', valor(empleado, 'tipo_contrato', 'tipoContrato'));
    fill('salario', Number(empleado.salario || 0).toLocaleString('es-CO'));
    fill('numero-contrato', valor(empleado, 'numero_contrato', 'numeroContrato')); fill('cargo', empleado.cargo);
    fill('tipo-cotizante', valor(empleado, 'tipo_cotizante', 'tipoCotizante'));
    fill('fondo-salud', valor(empleado, 'fondo_salud', 'fondoSalud')); fill('fondo-pension', valor(empleado, 'fondo_pension', 'fondoPension'));
    fill('caja-compensacion', valor(empleado, 'caja_compensacion', 'cajaCompensacion')); fill('arl', empleado.arl);
    fill('nivel-riesgo-arl', valor(empleado, 'nivel_riesgo_arl', 'nivelRiesgoArl'));
  }

  async function abrirEdicion(id) {
    try {
      const empleado = await obtenerEmpleado(id);
      state.empleadoEditandoId = id;
      cargarFormularioEdicion(empleado);
      abrirModal('modal-editar-empleado');
      $('edit-nombre').focus();
    } catch (error) {
      mostrarMensaje(error.message || 'No fue posible consultar el empleado.', 'error');
    }
  }

  async function guardarEmpleado(event) {
    event.preventDefault();
    const empleado = leerFormulario();
    const error = validarEmpleado(empleado);
    if (error) return mostrarMensaje(error, 'error');
    const button = event.submitter || document.querySelector('.primary');
    button.disabled = true;
    try {
      if (getToken()) {
        await apiFetch('/empleados', { method: 'POST', body: JSON.stringify(empleado) });
      } else {
        const empleados = cargarLocal();
        if (empleados.some((item) => item.documento.replace(/\D/g, '') === empleado.documento.replace(/\D/g, ''))) throw new Error('Ya existe un empleado con ese documento.');
        empleados.push({ id: `EMP-${Date.now().toString(36).toUpperCase()}`, ...empleado, creadoEn: new Date().toISOString() });
        guardarLocal(empleados);
      }
      $('form-empleado').reset();
      mostrarMensaje('Empleado creado correctamente. Ya está disponible para la liquidación de nómina.', 'success');
      await cargarEmpleados();
    } catch (saveError) {
      mostrarMensaje(saveError.message || 'Error al guardar el empleado.', 'error');
    } finally {
      button.disabled = false;
    }
  }

  async function guardarEdicion(event) {
    event.preventDefault();
    if (!state.empleadoEditandoId) return;
    const empleado = leerFormulario('edit-');
    const error = validarEmpleado(empleado);
    if (error) return mostrarMensaje(error, 'error');
    const button = event.submitter;
    button.disabled = true;
    try {
      if (getToken()) {
        await apiFetch(`/empleados/${encodeURIComponent(state.empleadoEditandoId)}`, { method: 'PUT', body: JSON.stringify(empleado) });
      } else {
        const empleados = cargarLocal();
        const index = empleados.findIndex((item) => item.id === state.empleadoEditandoId);
        if (index === -1) throw new Error('Empleado no encontrado.');
        if (empleados.some((item, itemIndex) => itemIndex !== index && item.documento.replace(/\D/g, '') === empleado.documento.replace(/\D/g, ''))) throw new Error('Ya existe un empleado con ese documento.');
        empleados[index] = { ...empleados[index], ...empleado, actualizadoEn: new Date().toISOString() };
        guardarLocal(empleados);
      }
      cerrarModal('modal-editar-empleado');
      mostrarMensaje('Datos del empleado actualizados correctamente.', 'success');
      await cargarEmpleados();
    } catch (saveError) {
      mostrarMensaje(saveError.message || 'No fue posible actualizar el empleado.', 'error');
    } finally {
      button.disabled = false;
    }
  }

  $('salario').addEventListener('input', (event) => formato(event.target));
  $('edit-salario').addEventListener('input', (event) => formato(event.target));
  $('form-empleado').addEventListener('submit', guardarEmpleado);
  $('form-editar-empleado').addEventListener('submit', guardarEdicion);
  $('btn-limpiar').addEventListener('click', limpiarFormulario);
  $('btn-actualizar-empleados').addEventListener('click', cargarEmpleados);
  $('buscar-empleado').addEventListener('input', () => {
    clearTimeout(state.searchTimer);
    state.searchTimer = setTimeout(cargarEmpleados, 250);
  });
  document.querySelectorAll('[data-close-modal]').forEach((button) => button.addEventListener('click', () => cerrarModal(button.dataset.closeModal)));
  document.querySelectorAll('.employee-modal').forEach((modal) => modal.addEventListener('click', (event) => {
    if (event.target === modal) cerrarModal(modal.id);
  }));
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    document.querySelectorAll('.employee-modal:not([hidden])').forEach((modal) => cerrarModal(modal.id));
  });

  cargarEmpleados();
});
