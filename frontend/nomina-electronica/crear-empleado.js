'use strict';

document.addEventListener('DOMContentLoaded', () => {
  const SESSION_KEY = 'amc_session_v2';
  const activeUserCode = sessionStorage.getItem('amc_active_user_code') || '1110591592';
  const isDev = activeUserCode === '1110591592';
  const DB_KEY = isDev ? 'amc_empleados_db_v1' : `amc_empleados_db_v1_${activeUserCode}`;
  const $ = (id) => document.getElementById(id);
  function token() { try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || '{}').token || null; } catch { return null; } }
  function dinero(valor) { return Number(String(valor || '').replace(/[^\d]/g, '')) || 0; }
  function formato(input) { const n = dinero(input.value); input.value = n ? n.toLocaleString('es-CO') : ''; }
  function mensaje(texto, tipo) { $('mensaje').innerHTML = `<div class="alert alert-${tipo}">${texto}</div>`; }
  function leer() { return { nombre:$('nombre').value.trim(), documento:$('documento').value.trim(), email:$('email').value.trim(), telefono:$('telefono').value.trim(), ciudad:$('ciudad').value.trim(), direccion:$('direccion').value.trim(), cuenta:$('cuenta').value.trim(), fechaInicioContrato:$('fecha-inicio').value, tipoContrato:$('tipo-contrato').value, salario:dinero($('salario').value), numeroContrato:$('numero-contrato').value.trim(), cargo:$('cargo').value.trim(), tipoCotizante:$('tipo-cotizante').value, fondoSalud:$('fondo-salud').value.trim(), fondoPension:$('fondo-pension').value.trim(), cajaCompensacion:$('caja-compensacion').value.trim(), arl:$('arl').value.trim(), nivelRiesgoArl:$('nivel-riesgo-arl').value.trim() }; }
  function validar(e) { for (const [campo, valor] of Object.entries(e)) if (!valor) return campo === 'salario' ? 'El valor de salario es obligatorio.' : 'Todos los campos del empleado son obligatorios.'; if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.email)) return 'Ingrese un correo electrónico válido.'; if (e.nombre.length < 4 || e.documento.length < 4) return 'Nombre y documento deben tener al menos 4 caracteres.'; return null; }
  function cargarLocal() { try { const data = JSON.parse(localStorage.getItem(DB_KEY) || '[]'); return Array.isArray(data) ? data : []; } catch { return []; } }
  function limpiar() { $('form-empleado').reset(); $('mensaje').innerHTML = ''; }
  async function guardar(event) { event.preventDefault(); const empleado = leer(); const error = validar(empleado); if (error) { mensaje(error, 'error'); return; } const btn = event.submitter || document.querySelector('.primary'); btn.disabled = true; try { const jwt = token(); if (jwt) { const res = await fetch('http://localhost:3000/api/empleados', { method:'POST', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${jwt}` }, body:JSON.stringify(empleado) }); const data = await res.json().catch(() => ({})); if (!res.ok) throw new Error(data.message || 'No fue posible guardar el empleado.'); } else { const empleados = cargarLocal(); if (empleados.some((x) => x.documento.replace(/\D/g, '') === empleado.documento.replace(/\D/g, ''))) throw new Error('Ya existe un empleado con ese documento.'); empleados.push({ id:`EMP-${Date.now().toString(36).toUpperCase()}`, ...empleado, creadoEn:new Date().toISOString() }); localStorage.setItem(DB_KEY, JSON.stringify(empleados)); } mensaje('Empleado creado correctamente. Ya está disponible para la liquidación de nómina.', 'success'); limpiar(); } catch (error) { mensaje(error.message || 'Error al guardar el empleado.', 'error'); } finally { btn.disabled = false; } }
  $('salario').addEventListener('input', (event) => formato(event.target));
  $('form-empleado').addEventListener('submit', guardar); $('btn-limpiar').addEventListener('click', limpiar);
});
