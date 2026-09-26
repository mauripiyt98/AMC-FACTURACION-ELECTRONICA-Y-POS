'use strict';

const FALLBACK_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const FALLBACK_MAX_ENTRIES = 2000;
const fallback = new Map();

function keyOf(empresaId, usuarioId, conversationId) {
  return `${empresaId}:${usuarioId}:${conversationId}`;
}

function cleanContext(value = {}) {
  const context = {};
  if (typeof value.lastIntent === 'string' && /^[a-z0-9_]{1,64}$/.test(value.lastIntent)) context.lastIntent = value.lastIntent;
  if (value.pendingSlot === 'cliente_factura') context.pendingSlot = value.pendingSlot;
  if (typeof value.clientName === 'string' && value.clientName.trim()) context.clientName = value.clientName.trim().slice(0, 100);
  if (typeof value.productCode === 'string' && value.productCode.trim()) context.productCode = value.productCode.trim().slice(0, 64);
  if (Number.isInteger(value.turnCount) && value.turnCount >= 0) context.turnCount = Math.min(value.turnCount, 1000000);
  return context;
}

async function guardedQuery(client, savepoint, sql, params) {
  await client.query(`SAVEPOINT ${savepoint}`);
  try {
    const result = await client.query(sql, params);
    await client.query(`RELEASE SAVEPOINT ${savepoint}`);
    return result;
  } catch (error) {
    await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`).catch(() => {});
    await client.query(`RELEASE SAVEPOINT ${savepoint}`).catch(() => {});
    throw error;
  }
}

function fallbackLoad(key) {
  const item = fallback.get(key);
  if (!item || item.expiresAt <= Date.now()) {
    fallback.delete(key);
    return {};
  }
  return cleanContext(item.context);
}

function fallbackSave(key, context) {
  if (fallback.size >= FALLBACK_MAX_ENTRIES && !fallback.has(key)) {
    const oldestKey = fallback.keys().next().value;
    if (oldestKey) fallback.delete(oldestKey);
  }
  fallback.set(key, { context: cleanContext(context), expiresAt: Date.now() + FALLBACK_TTL_MS });
}

/**
 * Recupera únicamente el contexto estructurado de esta conversación,
 * dentro del ámbito explícito de empresa y usuario.
 */
async function load(client, empresaId, usuarioId, conversationId) {
  const key = keyOf(empresaId, usuarioId, conversationId);
  try {
    await guardedQuery(
      client,
      'mauro_memory_purge',
      `DELETE FROM mauro_memorias
       WHERE empresa_id = $1 AND usuario_id = $2
         AND actualizado_en <= NOW() - INTERVAL '30 days'`,
      [empresaId, usuarioId]
    );
    const { rows } = await guardedQuery(
      client,
      'mauro_memory_read',
      `SELECT contexto FROM mauro_memorias
       WHERE empresa_id = $1 AND usuario_id = $2 AND conversacion_id = $3
         AND actualizado_en > NOW() - INTERVAL '30 days'`,
      [empresaId, usuarioId, conversationId]
    );
    return cleanContext(rows[0]?.contexto || {});
  } catch (error) {
    // Permite que la conversación siga disponible si el despliegue aún no aplicó
    // la migración. SAVEPOINT evita dejar abortada la transacción tenant actual.
    if (error.code !== '42P01') throw error;
    return fallbackLoad(key);
  }
}

async function save(client, empresaId, usuarioId, conversationId, value) {
  const key = keyOf(empresaId, usuarioId, conversationId);
  const context = cleanContext(value);
  try {
    await guardedQuery(
      client,
      'mauro_memory_write',
      `INSERT INTO mauro_memorias (conversacion_id, empresa_id, usuario_id, contexto)
       VALUES ($1, $2, $3, $4::JSONB)
       ON CONFLICT (conversacion_id, empresa_id, usuario_id)
       DO UPDATE SET contexto = EXCLUDED.contexto, actualizado_en = NOW()`,
      [conversationId, empresaId, usuarioId, JSON.stringify(context)]
    );
  } catch (error) {
    if (error.code !== '42P01') throw error;
    fallbackSave(key, context);
  }
  return context;
}

module.exports = { cleanContext, load, save };
