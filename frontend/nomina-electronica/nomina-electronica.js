'use strict';

// Reglas trasladadas del proyecto AMC Nómina Electrónica compartido.
const NOMINA_2026 = Object.freeze({
  smmlv: 1750905,
  auxilioTransporte: 249095,
  topeAuxilio: 3501810,
});

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
  const mensaje = $('mensaje');
  mensaje.innerHTML = `<div class="alert alert-${tipo}">${texto}</div>`;
}

function calcular() {
  const salario = limpiarNumero($('salario').value);
  const bonificaciones = limpiarNumero($('bonificaciones').value);

  if (salario <= 0) {
    mostrarMensaje('Debe ingresar un salario base válido.', 'error');
    return;
  }

  // Fórmula conservada del desarrollo de nómina original.
  const baseTotal = salario + bonificaciones;
  const auxilio = baseTotal <= NOMINA_2026.topeAuxilio ? NOMINA_2026.auxilioTransporte : 0;
  const salud = Math.round(baseTotal * 0.04);
  const pension = Math.round(baseTotal * 0.04);
  const fsp = Math.round(baseTotal * porcentajeFsp(baseTotal));
  const neto = Math.round(salario + auxilio + bonificaciones - salud - pension - fsp);

  $('auxilio').value = formato(auxilio);
  $('salud').value = formato(salud);
  $('pension').value = formato(pension);
  $('fsp').value = formato(fsp);
  $('neto').textContent = formato(neto);
  mostrarMensaje('Cálculo realizado correctamente.', 'success');
}

function limpiar() {
  $('form-nomina').reset();
  ['auxilio', 'salud', 'pension', 'fsp'].forEach((id) => { $(id).value = '$ 0'; });
  $('neto').textContent = '$ 0';
  $('mensaje').innerHTML = '';
}

document.addEventListener('DOMContentLoaded', () => {
  ['salario', 'bonificaciones'].forEach((id) => {
    $(id).addEventListener('input', (event) => formatearInput(event.target));
  });
  $('form-nomina').addEventListener('submit', (event) => {
    event.preventDefault();
    calcular();
  });
  $('btn-limpiar').addEventListener('click', limpiar);
});
