'use strict';

document.addEventListener('DOMContentLoaded', () => {
  if (sessionStorage.getItem('amc_nominas_access_v1') !== 'true') {
    window.location.replace('nomina-electronica.html');
    return;
  }
  const SESSION_KEY = 'amc_session_v2';
  const activeUserCode = sessionStorage.getItem('amc_active_user_code') || '1110591592';
  const isDev = activeUserCode === '1110591592';
  const DB_KEY = isDev ? 'amc_nominas_generadas_db_v1' : `amc_nominas_generadas_db_v1_${activeUserCode}`;
  const PREVIEW_KEY = isDev ? 'amc_nomina_preview_v1' : `amc_nomina_preview_v1_${activeUserCode}`;
  const $ = (id) => document.getElementById(id);

  function token() { try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || '{}').token || null; } catch { return null; } }
  function normalizar(texto) { return String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
  function escapar(texto) { const div = document.createElement('div'); div.textContent = String(texto || ''); return div.innerHTML; }
  function moneda(valor) { return `$ ${Math.round(Number(valor) || 0).toLocaleString('es-CO')}`; }
  function fecha(valor) { return new Date(valor).toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'medium', timeStyle: 'short' }); }
  function siguiente(nominas) {
    const usados = nominas.map((n) => Number(n.consecutivo)).filter((n) => Number.isInteger(n) && n >= 1);
    const numero = (usados.length ? Math.max(...usados) : 0) + 1;
    return numero <= 1000 ? `NE${String(numero).padStart(3, '0')}` : 'Rango agotado';
  }
  function local() { try { const data = JSON.parse(localStorage.getItem(DB_KEY) || '[]'); return Array.isArray(data) ? data : []; } catch { return []; } }
  async function cargar() {
    const jwt = token();
    if (jwt) {
      const res = await fetch('http://localhost:3000/api/nominas?limit=1000', { headers: { Authorization: `Bearer ${jwt}` } });
      if (res.ok) {
        const data = await res.json();
        return (data.nominas || []).map((n) => ({
          id: n.id, consecutivo: Number(n.consecutivo), numeroNomina: n.numero_nomina, cude: n.cude,
          empleado: { nombre: n.empleado_nombre, documento: n.empleado_documento, cargo: n.empleado_cargo, cuenta: n.empleado_cuenta },
          salario: n.salario, bonificaciones: n.bonificaciones, auxilio: n.auxilio_transporte,
          salud: n.deduccion_salud, pension: n.deduccion_pension, fsp: n.deduccion_fsp, neto: n.neto_pagar,
          generadoEn: n.generado_en, estado: n.estado,
        }));
      }
    }
    return local();
  }
  function coincide(nomina, query) {
    const e = nomina.empleado || {};
    return normalizar([nomina.numeroNomina, nomina.consecutivo, nomina.generadoEn, e.nombre, e.documento, e.cargo].join(' ')).includes(query);
  }
  async function render() {
    const nominas = (await cargar()).sort((a, b) => new Date(b.generadoEn) - new Date(a.generadoEn));
    const filtradas = nominas.filter((n) => coincide(n, normalizar($('buscar').value)));
    $('stat-generadas').textContent = String(nominas.length);
    $('stat-siguiente').textContent = siguiente(nominas);
    $('empty').hidden = nominas.length !== 0;
    const body = $('nominas-body');
    if (!nominas.length) { body.innerHTML = ''; return; }
    if (!filtradas.length) { body.innerHTML = '<tr><td colspan="8" class="empty">No hay nóminas que coincidan con la búsqueda.</td></tr>'; return; }
    body.innerHTML = filtradas.map((n) => {
      const e = n.empleado || {};
      return `<tr><td><strong>${escapar(n.numeroNomina || `NE${String(n.consecutivo).padStart(3, '0')}`)}</strong><br><span class="badge">Cons. ${escapar(n.consecutivo)}</span></td><td>${escapar(fecha(n.generadoEn))}</td><td>${escapar(e.nombre || '-')}</td><td>${escapar(e.documento || '-')}</td><td>${escapar(e.cargo || '-')}</td><td class="num">${escapar(moneda(n.neto))}</td><td><span class="badge">${escapar(n.estado || 'GENERADA')}</span></td><td><button class="btn-ver" type="button" data-id="${escapar(n.id)}">Ver documento</button></td></tr>`;
    }).join('');
    body.querySelectorAll('[data-id]').forEach((button) => button.addEventListener('click', () => {
      const nomina = nominas.find((n) => String(n.id) === button.dataset.id);
      if (!nomina) return;
      sessionStorage.setItem(PREVIEW_KEY, JSON.stringify(nomina));
      window.location.href = `nomina-documento.html?id=${encodeURIComponent(nomina.id)}`;
    }));
  }
  $('buscar').addEventListener('input', render);
  render().catch(() => { $('empty').hidden = false; $('empty').textContent = 'No fue posible cargar las nóminas generadas.'; });
});
