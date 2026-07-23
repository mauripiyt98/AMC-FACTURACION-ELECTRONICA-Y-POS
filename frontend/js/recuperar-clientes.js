'use strict';

/* Recupera la libreta local de clientes a partir de los snapshots en facturas. */
document.addEventListener('DOMContentLoaded', () => {
  const activeUserCode = sessionStorage.getItem('amc_active_user_code') || '1110591592';
  const isDev = activeUserCode === '1110591592';
  const facturasKey = isDev ? 'amc_facturas_generadas_db_v1' : `amc_facturas_generadas_db_v1_${activeUserCode}`;
  const tercerosKey = isDev ? 'amc_terceros_db_v1' : `amc_terceros_db_v1_${activeUserCode}`;
  const $ = id => document.getElementById(id);

  function readArray(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(value) ? value : [];
    } catch { return []; }
  }

  function clean(value) { return String(value == null ? '' : value).trim(); }
  function keyFor(documento) { return clean(documento).replace(/[.\s-]/g, '').toLowerCase(); }
  function clientFrom(invoice) {
    const client = invoice && invoice.cliente ? invoice.cliente : invoice || {};
    return {
      nombre: clean(client.nombre || client.cliente_nombre),
      documento: clean(client.documento || client.cliente_documento),
      email: clean(client.email || client.cliente_email),
      telefono: clean(client.telefono || client.cliente_telefono),
      direccion: clean(client.direccion || client.cliente_direccion),
      ciudad: clean(client.ciudad || client.cliente_ciudad),
      generadoEn: invoice && (invoice.generadoEn || invoice.generado_en || invoice.actualizado_en) || ''
    };
  }

  function newestFirst(a, b) {
    return new Date(b.generadoEn || 0).getTime() - new Date(a.generadoEn || 0).getTime();
  }

  function recoverableClients(invoices) {
    const grouped = new Map();
    invoices.map(clientFrom).forEach(client => {
      if (!client.nombre || !client.documento) return;
      const key = keyFor(client.documento);
      if (!key) return;
      const list = grouped.get(key) || [];
      list.push(client);
      grouped.set(key, list);
    });
    return [...grouped.values()].map(list => {
      list.sort(newestFirst);
      const newest = list[0];
      // Los campos vacíos se llenan buscando la versión más reciente que sí los tenga.
      const pick = field => list.map(x => x[field]).find(Boolean) || '';
      return {
        id: `TER-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
        nombre: pick('nombre'), documento: newest.documento,
        email: pick('email'), telefono: pick('telefono'),
        direccion: pick('direccion'), ciudad: pick('ciudad')
      };
    }).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }

  const invoices = readArray(facturasKey);
  const candidates = recoverableClients(invoices);
  const incomplete = invoices.length - invoices.filter(f => {
    const c = clientFrom(f); return c.nombre && c.documento;
  }).length;
  $('facturas').textContent = invoices.length;
  $('clientes').textContent = candidates.length;
  $('incompletas').textContent = incomplete;
  $('restaurar').disabled = candidates.length === 0;

  $('restaurar').addEventListener('click', () => {
    if (!candidates.length) return;
    const current = readArray(tercerosKey);
    const backupKey = `${tercerosKey}_respaldo_${new Date().toISOString().replace(/[:.]/g, '-')}`;
    try {
      localStorage.setItem(backupKey, JSON.stringify(current));
      localStorage.setItem(tercerosKey, JSON.stringify(candidates));
      $('resultado').className = 'ok';
      $('resultado').textContent = `Se restauraron ${candidates.length} clientes únicos. Se creó una copia de seguridad de los ${current.length} registros anteriores.`;
      $('restaurar').disabled = true;
    } catch (error) {
      $('resultado').className = 'error';
      $('resultado').textContent = `No fue posible guardar la recuperación: ${error.message || 'error de almacenamiento'}.`;
    }
  });
});
