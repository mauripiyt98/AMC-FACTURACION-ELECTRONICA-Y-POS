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
const API_BASE = 'http://localhost:3000/api';
const $ = (id) => document.getElementById(id);

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

async function liquidarNomina() {
  const empleado = {
    nombre: $('nombre').value.trim(),
    documento: $('doc').value.trim(),
    cargo: $('cargo').value.trim(),
    cuenta: $('cuenta').value.trim(),
  };
  const calculos = obtenerCalculos();

  if (!empleado.nombre || !empleado.documento || !empleado.cargo || !empleado.cuenta) {
    mostrarMensaje('Complete los datos del empleado para generar la nómina.', 'error');
    return;
  }
  if (calculos.salario <= 0) {
    mostrarMensaje('Debe ingresar un salario base válido.', 'error');
    return;
  }
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
        ...calculos,
        generadoEn: new Date().toISOString(),
        estado: 'GENERADA',
      };
      nominas.push(nomina);
      localStorage.setItem(NOMINAS_DB_KEY, JSON.stringify(nominas));
    }
    sessionStorage.setItem(PREVIEW_KEY, JSON.stringify(nomina));
    window.location.href = 'nomina-documento.html';
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
}

document.addEventListener('DOMContentLoaded', () => {
  ['salario', 'bonificaciones'].forEach((id) => $(id).addEventListener('input', (event) => formatearInput(event.target)));
  $('form-nomina').addEventListener('submit', (event) => { event.preventDefault(); liquidarNomina(); });
  $('btn-limpiar').addEventListener('click', limpiar);
  $('btn-nominas-generadas').addEventListener('click', () => sessionStorage.setItem('amc_nominas_access_v1', 'true'));
});
