'use strict';
require('dotenv').config();
const { Pool } = require('pg');

/**
 * Pool de conexiones PostgreSQL compartido para toda la aplicación.
 *
 * Escalabilidad:
 *  - DB_MAX_CONNECTIONS se puede subir conforme crezca el número de empresas.
 *  - Para 100k empresas → añadir PgBouncer en modo transaction pooling.
 *  - Para sharding horizontal → reemplazar este pool por un router de shards.
 */
const pool = new Pool({
  host    : process.env.DB_HOST     || 'localhost',
  port    : Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME     || 'amc_facturacion',
  user    : process.env.DB_USER     || 'amc_app',
  password: process.env.DB_PASSWORD || '',
  max     : Number(process.env.DB_MAX_CONNECTIONS)      || 20,
  idleTimeoutMillis   : Number(process.env.DB_IDLE_TIMEOUT_MS)       || 30000,
  connectionTimeoutMillis: Number(process.env.DB_CONNECTION_TIMEOUT_MS) || 2000,
  ssl     : process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// Evento de error en conexiones idle (evita crash del proceso)
pool.on('error', (err) => {
  console.error('[DB Pool] Error inesperado en cliente idle:', err.message);
});

/**
 * Ejecuta una query dentro de una transacción con contexto de tenant.
 *
 * Garantiza que `app.empresa_id` esté seteado en la sesión PostgreSQL
 * ANTES de ejecutar cualquier query, activando las políticas RLS.
 *
 * @param {string}   empresaId - UUID de la empresa (tenant)
 * @param {Function} fn        - async (client) => resultado
 */
async function withTenant(empresaId, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Inyectar empresa_id en la sesión PostgreSQL → activa RLS
    await client.query(`SET LOCAL app.empresa_id = '${empresaId}'`);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Ejecuta una query sin contexto de tenant (solo para operaciones de sistema:
 * login, crear empresa, migraciones).
 */
async function query(text, params) {
  return pool.query(text, params);
}

/**
 * Verifica que la conexión a la base de datos funcione.
 */
async function testConnection() {
  const { rows } = await pool.query('SELECT NOW() as now, current_database() as db');
  console.log(`[DB] Conectado a "${rows[0].db}" — ${rows[0].now}`);
  return true;
}

module.exports = { pool, withTenant, query, testConnection };
