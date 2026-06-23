'use strict';
require('dotenv').config();

const { Client } = require('pg');
const bcrypt = require('bcryptjs');

/**
 * Script de seed: crea la primera empresa y su usuario ADMIN.
 * También permite migrar datos existentes de localStorage
 * (pegar el JSON exportado del navegador como argumento).
 *
 * Uso:
 *   node scripts/seed.js
 *   node scripts/seed.js --import datos_exportados.json
 */
async function seed() {
  const client = new Client({
    host    : process.env.DB_HOST       || 'localhost',
    port    : Number(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME       || 'amc_facturacion',
    user    : process.env.DB_SUPERUSER  || 'postgres',
    password: process.env.DB_SUPERPASSWORD || '',
  });

  await client.connect();
  console.log('\n🌱 AMC — Script de Seed\n');

  try {
    await client.query('BEGIN');

    // ── Empresa de demostración ───────────────────────────────────────────────
    const { rows: existentes } = await client.query(
      `SELECT id FROM empresas WHERE nit = '1110591592'`
    );

    let empresaId;

    if (existentes.length) {
      empresaId = existentes[0].id;
      console.log(`  ℹ️  Empresa de demo ya existe (id: ${empresaId})`);
    } else {
      const { rows: [empresa] } = await client.query(
        `INSERT INTO empresas (
           razon_social, nit, digito_verificacion, regimen_fiscal, tipo_persona,
           direccion, ciudad, departamento, email,
           resolucion_numero, resolucion_prefijo, resolucion_desde, resolucion_hasta,
           plan
         ) VALUES (
           'ANDRES MAURICIO CAMPOS FIERRO', '1110591592', 3, 'SIMPLIFICADO', 'NATURAL',
           'Colombia', 'Bogotá', 'Cundinamarca', 'demo@amc.com',
           '18760000001', 'FE', 1, 1000,
           'BASICO'
         ) RETURNING id, razon_social`
      );
      empresaId = empresa.id;
      console.log(`  ✅ Empresa creada: "${empresa.razon_social}" (id: ${empresaId})`);
    }

    // ── Usuario ADMIN de la empresa ───────────────────────────────────────────
    const { rows: usuariosExistentes } = await client.query(
      `SELECT id FROM usuarios WHERE empresa_id = $1 AND codigo = '1110591592'`,
      [empresaId]
    );

    if (usuariosExistentes.length) {
      console.log(`  ℹ️  Usuario admin ya existe`);
    } else {
      const passwordHash = await bcrypt.hash('Desa*2026', 12);
      const { rows: [usuario] } = await client.query(
        `INSERT INTO usuarios (empresa_id, nombre, codigo, password_hash, rol, email)
         VALUES ($1, 'PRINCIPAL DESARROLLADOR', '1110591592', $2, 'ADMIN', 'dev@amc.com')
         RETURNING id, nombre, codigo`,
        [empresaId, passwordHash]
      );
      console.log(`  ✅ Usuario creado: "${usuario.nombre}" (código: ${usuario.codigo})`);
    }

    // ── Tercero de ejemplo ────────────────────────────────────────────────────
    const { rows: tercerosExistentes } = await client.query(
      `SELECT id FROM terceros WHERE empresa_id = $1 AND documento = '900123456'`,
      [empresaId]
    );

    if (!tercerosExistentes.length) {
      await client.query(
        `INSERT INTO terceros (empresa_id, nombre, documento, tipo_documento, email, ciudad)
         VALUES ($1, 'Cliente Demo S.A.S.', '900123456', 'NIT', 'cliente@demo.com', 'Bogotá')`,
        [empresaId]
      );
      console.log(`  ✅ Tercero de ejemplo creado`);
    }

    // ── Productos de ejemplo ──────────────────────────────────────────────────
    const { rows: productosExistentes } = await client.query(
      `SELECT id FROM productos WHERE empresa_id = $1`,
      [empresaId]
    );

    if (!productosExistentes.length) {
      const prods = [
        ['Servicio de Consultoría TI',   'SCON-001', 'SERVICIO', 19, 'UNIDAD'],
        ['Licencia de Software Anual',   'LIC-001',  'SERVICIO', 19, 'UNIDAD'],
        ['Computador Portátil',          'HW-001',   'PRODUCTO', 19, 'UNIDAD'],
        ['Gasolina Corriente',           'GAL-001',  'PRODUCTO',  5, 'GALON'],
      ];
      for (const [nombre, codigo, tipo, iva, unidad_medida] of prods) {
        await client.query(
          `INSERT INTO productos (empresa_id, nombre, codigo, tipo, iva, unidad_medida)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [empresaId, nombre, codigo, tipo, iva, unidad_medida]
        );
      }
      console.log(`  ✅ ${prods.length} productos de ejemplo creados`);
    }

    await client.query('COMMIT');

    console.log('\n──────────────────────────────────────────');
    console.log('  ✨ Seed completado exitosamente\n');
    console.log('  Credenciales de acceso:');
    console.log('    NIT      : 1110591592');
    console.log('    Código   : 1110591592');
    console.log('    Contraseña: Desa*2026');
    console.log('──────────────────────────────────────────\n');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n❌ Error en seed:', err.message);
    throw err;
  } finally {
    await client.end();
  }
}

seed().catch(() => process.exit(1));
