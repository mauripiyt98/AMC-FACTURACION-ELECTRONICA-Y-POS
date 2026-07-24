'use strict';

document.addEventListener('DOMContentLoaded', () => {
  const API_BASE_URL = 'http://localhost:3000/api';
  const SESSION_KEY = 'amc_session_v2';
  const activeUserCode = sessionStorage.getItem('amc_active_user_code') || '1110591592';
  const isDev = activeUserCode === '1110591592';
  const DB_KEY = isDev ? 'amc_empleados_db_v1' : `amc_empleados_db_v1_${activeUserCode}`;
  const state = { empleados: [], searchTimer: null };
  const $ = (id) => document.getElementById(id);

  function getToken() {
    try {
      return JSON.parse(sessionStorage.getItem(SESSION_KEY) || '{}').token || null;
    } catch {
      return null;
    }
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

  function leerFormulario() {
    return {
      nombre: $('nombre').value.trim(),
      documento: $('documento').value.trim(),
      email: $('email').value.trim(),
      telefono: $('telefono').value.trim(),
      ciudad: $('ciudad').value.trim(),
      direccion: $('direccion').value.trim(),
      cuenta: $('cuenta').value.trim(),
      fechaInicioContrato: $('fecha-inicio').value,
      tipoContrato: $('tipo-contrato').value,
      salario: dinero($('salario').value),
      numeroContrato: $('numero-contrato').value.trim(),
      cargo: $('cargo').value.trim(),
      tipoCotizante: $('tipo-cotizante').value,
      fondoSalud: $('fondo-salud').value.trim(),
      fondoPension: $('fondo-pension').value.trim(),
      cajaCompensacion: $('caja-compensacion').value.trim(),
      arl: $('arl').value.trim(),
      nivelRiesgoArl: $('nivel-riesgo-arl').value.trim(),
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

  function formatearFecha(value) {
    if (!value) return 'Sin definir';
    const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
    return Number.isNaN(date.getTime()) ? 'Sin definir' : date.toLocaleDateString('es-CO');
  }

  function crearDato(label, value) {
    const row = document.createElement('div');
    const title = document.createElement('dt');
    const content = document.createElement('dd');
    title.textContent = label;
    content.textContent = value;
    row.append(title, content);
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
        crearDato('Cargo', empleado.cargo || 'Sin definir'),
        crearDato('Ciudad', empleado.ciudad || 'Sin definir'),
        crearDato('Contrato', etiquetaContrato(empleado.tipo_contrato || empleado.tipoContrato)),
        crearDato('Inicio', formatearFecha(empleado.fecha_inicio_contrato || empleado.fechaInicioContrato)),
        crearDato('Salario', `$ ${Number(empleado.salario || 0).toLocaleString('es-CO')}`),
      );
      card.append(name, employeeDocument, metadata);
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
      const jwt = getToken();
      if (!jwt) {
        state.empleados = filtrarLocal(search);
      } else {
        const params = new URLSearchParams({ limit: '100' });
        if (search.length >= 2) params.set('search', search);
        const response = await fetch(`${API_BASE_URL}/empleados?${params}`, {
          headers: { Authorization: `Bearer ${jwt}` },
        });
        const data = await response.json().catch(() => ({}));
        if (response.status === 401) {
          sessionStorage.removeItem(SESSION_KEY);
          sessionStorage.removeItem('amc_user_v2');
          window.location.replace('../login.html');
          return;
        }
        if (!response.ok) throw new Error(data.message || 'No fue posible consultar los empleados.');
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

  async function guardarEmpleado(event) {
    event.preventDefault();
    const empleado = leerFormulario();
    const error = validarEmpleado(empleado);
    if (error) {
      mostrarMensaje(error, 'error');
      return;
    }

    const button = event.submitter || document.querySelector('.primary');
    button.disabled = true;
    try {
      const jwt = getToken();
      if (jwt) {
        const response = await fetch(`${API_BASE_URL}/empleados`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
          body: JSON.stringify(empleado),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || 'No fue posible guardar el empleado.');
      } else {
        const empleados = cargarLocal();
        if (empleados.some((item) => item.documento.replace(/\D/g, '') === empleado.documento.replace(/\D/g, ''))) {
          throw new Error('Ya existe un empleado con ese documento.');
        }
        empleados.push({ id: `EMP-${Date.now().toString(36).toUpperCase()}`, ...empleado, creadoEn: new Date().toISOString() });
        localStorage.setItem(DB_KEY, JSON.stringify(empleados));
      }
      $('form-empleado').reset();
      mostrarMensaje('Empleado creado correctamente. Ya está disponible para la liquidación de nómina.', 'success');
      await cargarEmpleados();
    } catch (error) {
      mostrarMensaje(error.message || 'Error al guardar el empleado.', 'error');
    } finally {
      button.disabled = false;
    }
  }

  $('salario').addEventListener('input', (event) => formato(event.target));
  $('form-empleado').addEventListener('submit', guardarEmpleado);
  $('btn-limpiar').addEventListener('click', limpiarFormulario);
  $('btn-actualizar-empleados').addEventListener('click', cargarEmpleados);
  $('buscar-empleado').addEventListener('input', () => {
    clearTimeout(state.searchTimer);
    state.searchTimer = setTimeout(cargarEmpleados, 250);
  });

  cargarEmpleados();
});
