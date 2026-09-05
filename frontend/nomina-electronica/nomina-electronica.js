'use strict';

const NOMINA_2026 = Object.freeze({
  smmlv: 1750905,
  auxilioTransporte: 249095,
  topeAuxilio: 3501810,
});

const RESOLUCION_NOMINA_DEMO = Object.freeze({ prefijo: 'NE', desde: 1, hasta: 1000 });
const SESSION_KEY = 'amc_session_v2';
const activeUserCode = sessionStorage.getItem('amc_active_user_code') || '1110591592';
const isDev = activeUserCode === '1110591592';
const NOMINAS_DB_KEY = isDev ? 'amc_nominas_generadas_db_v1' : `amc_nominas_generadas_db_v1_${activeUserCode}`;
const PREVIEW_KEY = isDev ? 'amc_nomina_preview_v1' : `amc_nomina_preview_v1_${activeUserCode}`;
const EMPLEADOS_DB_KEY = isDev ? 'amc_empleados_db_v1' : `amc_empleados_db_v1_${activeUserCode}`;
const API_BASE = 'http://localhost:3000/api';
const $ = (id) => document.getElementById(id);
let searchTimer = null;
let searchSequence = 0;

function limpiarNumero(valor) {
  return parseFloat(String(valor || '').replace(/[^\d]/g, '')) || 0;
}

function formato(valor) {
  return `$ ${Math.round(Number(valor) || 0).toLocaleString('es-CO')}`;
}

function formatearInput(input) {
  const valor = limpiarNumero(input.value);
  input.value = valor ? Math.round(valor).toLocaleString('es-CO') : '';
}

function porcentajeFsp(base) {
  const smmlvCalculado = base / NOMINA_2026.smmlv;
  if (smmlvCalculado >= 4 && smmlvCalculado < 16) return 0.01;
  if (smmlvCalculado >= 16 && smmlvCalculado < 17) return 0.012;
  if (smmlvCalculado >= 17 && smmlvCalculado < 18) return 0.014;
  if (smmlvCalculado >= 18 && smmlvCalculado < 19) return 0.016;
  if (smmlvCalculado >= 19 && smmlvCalculado < 20) return 0.018;
  if (smmlvCalculado >= 20) return 0.02;
  return 0;
}

function mostrarMensaje(texto, tipo) {
  $('mensaje').innerHTML = `<div class="alert alert-${tipo}">${texto}</div>`;
}

function obtenerCalculos() {
  const salario = limpiarNumero($('salario').value);
  const bonificaciones = limpiarNumero($('bonificaciones').value);
  const baseTotal = salario + bonificaciones;
  const auxilio = baseTotal <= NOMINA_2026.topeAuxilio ? NOMINA_2026.auxilioTransporte : 0;
  const salud = Math.round(baseTotal * 0.04);
  const pension = Math.round(baseTotal * 0.04);
  const fsp = Math.round(baseTotal * porcentajeFsp(baseTotal));
  const neto = Math.round(salario + auxilio + bonificaciones - salud - pension - fsp);
  return { salario, bonificaciones, auxilio, salud, pension, fsp, neto };
}

function pintarCalculos(calculos) {
  $('auxilio').value = formato(calculos.auxilio);
  $('salud').value = formato(calculos.salud);
  $('pension').value = formato(calculos.pension);
  $('fsp').value = formato(calculos.fsp);
  $('neto').textContent = formato(calculos.neto);
}

function actualizarCalculosEnTiempoReal(input) {
  formatearInput(input);
  pintarCalculos(obtenerCalculos());
}

function cargarNominas() {
  try {
    const nominas = JSON.parse(localStorage.getItem(NOMINAS_DB_KEY) || '[]');
    return Array.isArray(nominas) ? nominas : [];
  } catch { return []; }
}

function siguienteConsecutivo(nominas) {
  const usados = nominas.map((n) => Number(n.consecutivo)).filter((n) => Number.isInteger(n) && n >= 1);
  const siguiente = (usados.length ? Math.max(...usados) : 0) + 1;
  return siguiente <= RESOLUCION_NOMINA_DEMO.hasta ? siguiente : null;
}

function numeroNomina(consecutivo) {
  return `${RESOLUCION_NOMINA_DEMO.prefijo}${String(consecutivo).padStart(3, '0')}`;
}

function generarCudeDemo(consecutivo, neto) {
  const base = `${numeroNomina(consecutivo)}-${Date.now()}-${neto}-${Math.random()}`;
  let hex = '';
  for (let i = 0; i < base.length; i++) hex += base.charCodeAt(i).toString(16).toUpperCase().padStart(2, '0');
  return (hex + '0'.repeat(96)).slice(0, 96);
}

function getToken() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || '{}').token || null; } catch { return null; }
}

function normalizar(texto) {
  return String(texto || '').trim().toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function cargarEmpleadosLocales() {
  try {
    const empleados = JSON.parse(localStorage.getItem(EMPLEADOS_DB_KEY) || '[]');
    return Array.isArray(empleados) ? empleados : [];
  } catch {
    return [];
  }
}

function ocultarSugerencias() {
  ['sugerencias-nombre', 'sugerencias-doc'].forEach((id) => {
    const container = $(id);
    container.replaceChildren();
    container.classList.remove('visible');
  });
}

async function buscarEmpleadosEnApi(texto) {
  const token = getToken();
  const response = await fetch(`${API_BASE}/empleados?${new URLSearchParams({ search: texto, limit: '10' })}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem('amc_user_v2');
    window.location.replace('../login.html');
    return [];
  }
  if (!response.ok) throw new Error(data.message || 'No fue posible buscar empleados.');
  return Array.isArray(data.empleados) ? data.empleados : [];
}

async function obtenerEmpleadoCompleto(empleado) {
  if (!getToken()) return empleado;
  const response = await fetch(`${API_BASE}/empleados/${encodeURIComponent(empleado.id)}`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem('amc_user_v2');
    window.location.replace('../login.html');
    throw new Error('Sesión expirada');
  }
  if (!response.ok) throw new Error(data.message || 'No fue posible cargar la información del empleado.');
  return data.empleado;
}

function seleccionarEmpleado(empleado) {
  $('nombre').value = empleado.nombre || '';
  $('doc').value = empleado.documento || '';
  $('cargo').value = empleado.cargo || '';
  $('cuenta').value = empleado.cuenta_bancaria || empleado.cuenta || '';
  $('salario').value = Number(empleado.salario || 0).toLocaleString('es-CO');
  pintarCalculos(obtenerCalculos());
  ocultarSugerencias();
}

function mostrarSugerencias(empleados, destino) {
  ['sugerencias-nombre', 'sugerencias-doc'].filter((id) => id !== destino).forEach((id) => {
    $(id).replaceChildren();
    $(id).classList.remove('visible');
  });
  const container = $(destino);
  container.replaceChildren();
  if (!empleados.length) {
    const empty = document.createElement('p');
    empty.className = 'employee-suggestion-empty';
    empty.textContent = 'No se encontraron empleados.';
    container.append(empty);
    container.classList.add('visible');
    return;
  }

  empleados.forEach((empleado) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'employee-suggestion';
    const name = document.createElement('strong');
    const metadata = document.createElement('span');
    name.textContent = empleado.nombre || 'Empleado sin nombre';
    metadata.textContent = `${empleado.documento || 'Sin documento'} · ${empleado.cargo || 'Sin cargo'}`;
    button.append(name, metadata);
    button.addEventListener('click', async () => {
      try {
        button.disabled = true;
        seleccionarEmpleado(await obtenerEmpleadoCompleto(empleado));
      } catch (error) {
        mostrarMensaje(error.message || 'No fue posible cargar el empleado.', 'error');
        button.disabled = false;
      }
    });
    container.append(button);
  });
  container.classList.add('visible');
}

async function buscarYMostrarEmpleados(texto, destino) {
  const query = String(texto || '').trim();
  const currentSearch = ++searchSequence;
  if (query.length < 2) {
    ocultarSugerencias();
    return;
  }
  try {
    let empleados;
    if (getToken()) {
      empleados = await buscarEmpleadosEnApi(query);
    } else {
      const queryNormalizado = normalizar(query);
      empleados = cargarEmpleadosLocales().filter((empleado) => (
        normalizar(empleado.nombre).includes(queryNormalizado) || normalizar(empleado.documento).includes(queryNormalizado)
      )).slice(0, 10);
    }
    if (currentSearch !== searchSequence) return;
    mostrarSugerencias(empleados, destino);
  } catch (error) {
    if (currentSearch !== searchSequence) return;
    ocultarSugerencias();
    mostrarMensaje(error.message || 'No fue posible buscar empleados.', 'error');
  }
}

function programarBusqueda(event) {
  const destino = event.target.id === 'nombre' ? 'sugerencias-nombre' : 'sugerencias-doc';
  const texto = event.target.value;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => buscarYMostrarEmpleados(texto, destino), 250);
}

async function guardarEnApi(empleado, calculos) {
  const token = getToken();
  if (!token) return null;
  const response = await fetch(`${API_BASE}/nominas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ empleado, ...calculos }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'No fue posible guardar la nómina en la base de datos.');
  return data.nomina;
}

function obtenerPeriodoNomina() {
  return {
    mes: $('mes-periodo').value || '',
    mesLabel: $('mes-label').textContent.trim() === 'Seleccionar mes' ? '' : $('mes-label').textContent.trim(),
    anio: $('anio-periodo').value.trim() || '',
  };
}

function obtenerEmpleadoFormulario() {
  return {
    nombre: $('nombre').value.trim(),
    documento: $('doc').value.trim(),
    cargo: $('cargo').value.trim(),
    cuenta: $('cuenta').value.trim(),
  };
}

function validarDatosNomina(empleado, calculos, periodo) {
  if (!empleado.nombre || !empleado.documento || !empleado.cargo || !empleado.cuenta) {
    return 'Complete los datos del empleado para generar la nómina.';
  }
  if (calculos.salario <= 0) return 'Debe ingresar un salario base válido.';
  if (!periodo.mes) return 'Seleccione el mes del período de nómina.';
  if (!periodo.anio || Number(periodo.anio) < 2020) return 'Ingrese un año válido para el período de nómina.';
  return null;
}

function cerrarConfirmacionNomina() {
  $('modal-confirmar-nomina').hidden = true;
}

function solicitarConfirmacionNomina() {
  const empleado = obtenerEmpleadoFormulario();
  const calculos = obtenerCalculos();
  const periodo = obtenerPeriodoNomina();
  const error = validarDatosNomina(empleado, calculos, periodo);
  if (error) {
    mostrarMensaje(error, 'error');
    return;
  }

  pintarCalculos(calculos);
  const resumen = $('resumen-confirmacion-nomina');
  resumen.replaceChildren();
  const nombre = document.createElement('strong');
  const periodo_span = document.createElement('span');
  const valores = document.createElement('span');
  const total = document.createElement('span');
  nombre.textContent = empleado.nombre;
  periodo_span.textContent = `Período: ${periodo.mesLabel} ${periodo.anio}`;
  valores.textContent = `Documento: ${empleado.documento} · Salario: ${formato(calculos.salario)} · Bonificaciones: ${formato(calculos.bonificaciones)}`;
  total.textContent = `Neto a pagar: ${formato(calculos.neto)}`;
  resumen.append(nombre, periodo_span, valores, total);
  $('modal-confirmar-nomina').hidden = false;
  $('btn-confirmar-generar').focus();
}

async function liquidarNomina() {
  const empleado = obtenerEmpleadoFormulario();
  const calculos = obtenerCalculos();
  const periodo = obtenerPeriodoNomina();
  const error = validarDatosNomina(empleado, calculos, periodo);
  if (error) return mostrarMensaje(error, 'error');
  pintarCalculos(calculos);

  const btn = document.querySelector('.btn-generar');
  const textoOriginal = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Generando nómina…';

  try {
    let nomina;
    if (getToken()) {
      nomina = await guardarEnApi(empleado, calculos);
      nomina = {
        id: nomina.id,
        consecutivo: Number(nomina.consecutivo),
        numeroNomina: nomina.numero_nomina,
        cude: nomina.cude,
        empleado,
        periodo,
        ...calculos,
        generadoEn: nomina.generado_en,
        estado: nomina.estado || 'GENERADA',
      };
    } else {
      const nominas = cargarNominas();
      const consecutivo = siguienteConsecutivo(nominas);
      if (!consecutivo) throw new Error('El rango de nómina electrónica NE001 a NE1000 ya fue consumido.');
      nomina = {
        id: `NE-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
        consecutivo,
        numeroNomina: numeroNomina(consecutivo),
        cude: generarCudeDemo(consecutivo, calculos.neto),
        empleado,
        periodo,
        ...calculos,
        generadoEn: new Date().toISOString(),
        estado: 'GENERADA',
      };
      nominas.push(nomina);
      localStorage.setItem(NOMINAS_DB_KEY, JSON.stringify(nominas));
    }
    sessionStorage.setItem(PREVIEW_KEY, JSON.stringify(nomina));
    window.location.href = `nomina-documento.html?id=${encodeURIComponent(nomina.id)}`;
  } catch (error) {
    mostrarMensaje(error.message || 'Ocurrió un error al generar la nómina.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = textoOriginal;
  }
}

function limpiar() {
  $('form-nomina').reset();
  ['auxilio', 'salud', 'pension', 'fsp'].forEach((id) => { $(id).value = '$ 0'; });
  $('neto').textContent = '$ 0';
  $('mensaje').innerHTML = '';
  // Limpiar selector de mes
  $('mes-periodo').value = '';
  $('mes-label').textContent = 'Seleccionar mes';
  $('mes-dropdown').querySelectorAll('li').forEach((li) => li.removeAttribute('aria-selected'));
  $('btn-mes-periodo').setAttribute('aria-expanded', 'false');
  $('mes-dropdown').hidden = true;
}

function initMesDropdown() {
  const btn = $('btn-mes-periodo');
  const dropdown = $('mes-dropdown');
  const hiddenInput = $('mes-periodo');
  const mesLabel = $('mes-label');

  function toggleDropdown(open) {
    dropdown.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    if (open) {
      const selected = dropdown.querySelector('[aria-selected="true"]') || dropdown.querySelector('li');
      selected && selected.focus();
    }
  }

  function selectMonth(li) {
    dropdown.querySelectorAll('li').forEach((item) => item.removeAttribute('aria-selected'));
    li.setAttribute('aria-selected', 'true');
    hiddenInput.value = li.dataset.value;
    mesLabel.textContent = li.textContent.trim();
    toggleDropdown(false);
    btn.focus();
  }

  btn.addEventListener('click', () => toggleDropdown(dropdown.hidden));

  dropdown.querySelectorAll('li').forEach((li) => {
    li.addEventListener('click', () => selectMonth(li));
    li.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectMonth(li); }
      if (e.key === 'ArrowDown') { e.preventDefault(); const next = li.nextElementSibling; if (next) next.focus(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); const prev = li.previousElementSibling; if (prev) prev.focus(); }
      if (e.key === 'Escape') toggleDropdown(false);
    });
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.nomina-mes-wrap')) toggleDropdown(false);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initMesDropdown();
  ['salario', 'bonificaciones'].forEach((id) => $(id).addEventListener('input', (event) => actualizarCalculosEnTiempoReal(event.target)));
  $('nombre').addEventListener('input', programarBusqueda);
  $('doc').addEventListener('input', programarBusqueda);
  document.addEventListener('click', (event) => {
    if (!event.target.closest('.autocomplete-wrap')) ocultarSugerencias();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') ocultarSugerencias();
  });
  $('form-nomina').addEventListener('submit', (event) => { event.preventDefault(); solicitarConfirmacionNomina(); });
  $('btn-limpiar').addEventListener('click', limpiar);
  $('btn-nominas-generadas').addEventListener('click', () => sessionStorage.setItem('amc_nominas_access_v1', 'true'));
  $('btn-confirmar-generar').addEventListener('click', () => {
    cerrarConfirmacionNomina();
    liquidarNomina();
  });
  $('btn-cancelar-generar').addEventListener('click', cerrarConfirmacionNomina);
  $('modal-confirmar-nomina').addEventListener('click', (event) => {
    if (event.target === $('modal-confirmar-nomina')) cerrarConfirmacionNomina();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !$('modal-confirmar-nomina').hidden) cerrarConfirmacionNomina();
  });
});
