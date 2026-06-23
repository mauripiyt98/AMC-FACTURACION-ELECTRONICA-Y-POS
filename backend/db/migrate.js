'use strict';
require('dotenv').config();

const fs   = require('fs');
const path = require('path');
const { Client } = require('pg');

/**
 * Runner de migraciones SQL.
 * Ejecuta los archivos .sql en orden numérico si no han sido aplicados antes.
 * Utiliza la tabla migrations_log como registro.
 */
async function runMigrations() {
  const superClient = new Client({
    host    : process.env.DB_HOST       || 'localhost',
    port    : Number(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME       || 'amc_facturacion',
    user    : process.env.DB_SUPERUSER  || 'postgres',
    password: process.env.DB_SUPERPASSWORD || '',
    ssl     : process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });

  await superClient.connect();
  console.log('\n📦 AMC — Runner de Migraciones SQL');
  console.log(`   Base de datos: ${process.env.DB_NAME || 'amc_facturacion'}\n`);

  try {
    // Asegurar que existe la tabla de control de migraciones
    await superClient.query(`
      CREATE TABLE IF NOT EXISTS migrations_log (
        id           SERIAL       PRIMARY KEY,
        filename     VARCHAR(100) NOT NULL UNIQUE,
        ejecutado_en TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);

    // Obtener migraciones ya ejecutadas
    const { rows: applied } = await superClient.query('SELECT filename FROM migrations_log');
    const appliedSet = new Set(applied.map(r => r.filename));

    // Leer archivos .sql del directorio migrations, ordenados alfabéticamente
    const migrationsDir = path.join(__dirname, 'migrations');
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    let ejecutadas = 0;
    let omitidas   = 0;

    for (const filename of files) {
      if (appliedSet.has(filename)) {
        console.log(`  ✅ [omitida]  ${filename}`);
        omitidas++;
        continue;
      }

      const filePath = path.join(migrationsDir, filename);
      const sql      = fs.readFileSync(filePath, 'utf8');

      console.log(`  ⏳ [aplicando] ${filename} ...`);
      await superClient.query(sql);

      // La migración SQL ya incluye el INSERT en migrations_log,
      // pero lo hacemos aquí también como garantía
      await superClient.query(
        'INSERT INTO migrations_log (filename) VALUES ($1) ON CONFLICT (filename) DO NOTHING',
        [filename]
      );

      console.log(`  ✅ [ok]        ${filename}`);
      ejecutadas++;
    }

    console.log(`\n  Resumen: ${ejecutadas} aplicada(s), ${omitidas} omitida(s)\n`);

    if (ejecutadas === 0) {
      console.log('  La base de datos ya está actualizada. ✨\n');
    }
  } finally {
    await superClient.end();
  }
}

runMigrations().catch((err) => {
  console.error('\n❌ Error en migraciones:', err.message);
  process.exit(1);
});
