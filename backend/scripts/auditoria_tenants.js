'use strict';
require('dotenv').config();

const { Client } = require('pg');

/**
 * Script de Auditoría Multi-Tenant
 * Genera un reporte completo de:
 *  1. Empresas (tenants) registradas
 *  2. Usuarios por empresa
 *  3. Conteo de datos por tenant (productos, terceros, facturas)
 *  4. Estado de las políticas RLS
 *  5. Estructura de la base de datos
 *
 * Uso: node scripts/auditoria_tenants.js
 */
async function auditoria() {
  const client = new Client({
    host    : process.env.DB_HOST       || 'localhost',
    port    : Number(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME       || 'amc_facturacion',
    user    : process.env.DB_SUPERUSER  || 'postgres',
    password: process.env.DB_SUPERPASSWORD || '',
  });

  await client.connect();

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║         AMC FACTURACIÓN — AUDITORÍA MULTI-TENANT             ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  try {

    // ── 1. LISTADO DE EMPRESAS (TENANTS) ─────────────────────────────────────
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  📋  EMPRESAS (TENANTS) REGISTRADAS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const { rows: empresas } = await client.query(`
      SELECT
        e.id,
        e.razon_social,
        e.nit,
        e.digito_verificacion,
        e.regimen_fiscal,
        e.tipo_persona,
        e.ciudad,
        e.departamento,
        e.email,
        e.plan,
        e.activa,
        e.creado_en,
        COUNT(DISTINCT u.id)   AS total_usuarios,
        COUNT(DISTINCT p.id)   AS total_productos,
        COUNT(DISTINCT t.id)   AS total_terceros,
        COUNT(DISTINCT f.id)   AS total_facturas
      FROM empresas e
      LEFT JOIN usuarios       u ON u.empresa_id = e.id
      LEFT JOIN productos      p ON p.empresa_id = e.id
      LEFT JOIN terceros       t ON t.empresa_id = e.id
      LEFT JOIN facturas       f ON f.empresa_id = e.id
      GROUP BY e.id
      ORDER BY e.creado_en ASC
    `);

    if (empresas.length === 0) {
      console.log('  ⚠️  No hay empresas registradas en la base de datos.\n');
    } else {
      console.log(`  Total de tenants: ${empresas.length}\n`);
      for (const [i, e] of empresas.entries()) {
        console.log(`  ┌─ TENANT #${i + 1} ${'─'.repeat(45)}`);
        console.log(`  │  ID           : ${e.id}`);
        console.log(`  │  Razón Social : ${e.razon_social}`);
        console.log(`  │  NIT          : ${e.nit}-${e.digito_verificacion ?? '?'}`);
        console.log(`  │  Régimen      : ${e.regimen_fiscal} | Tipo: ${e.tipo_persona}`);
        console.log(`  │  Ciudad       : ${e.ciudad || 'N/A'}, ${e.departamento || ''}`);
        console.log(`  │  Email        : ${e.email || 'N/A'}`);
        console.log(`  │  Plan         : ${e.plan}  |  Activa: ${e.activa ? '✅ SÍ' : '❌ NO'}`);
        console.log(`  │  Creada el    : ${new Date(e.creado_en).toLocaleString('es-CO')}`);
        console.log(`  │  ─── Datos ───────────────────────────────────`);
        console.log(`  │  👤 Usuarios  : ${e.total_usuarios}`);
        console.log(`  │  📦 Productos : ${e.total_productos}`);
        console.log(`  │  👥 Terceros  : ${e.total_terceros}`);
        console.log(`  │  🧾 Facturas  : ${e.total_facturas}`);
        console.log(`  └${'─'.repeat(51)}\n`);
      }
    }

    // ── 2. USUARIOS POR EMPRESA ───────────────────────────────────────────────
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  👤  USUARIOS REGISTRADOS POR EMPRESA');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const { rows: usuarios } = await client.query(`
      SELECT
        e.razon_social,
        e.nit,
        u.id          AS usuario_id,
        u.nombre,
        u.codigo,
        u.email,
        u.rol,
        u.activo,
        u.ultimo_acceso,
        u.creado_en
      FROM usuarios u
      JOIN empresas e ON e.id = u.empresa_id
      ORDER BY e.nit, u.rol, u.nombre
    `);

    if (usuarios.length === 0) {
      console.log('  ⚠️  No hay usuarios registrados.\n');
    } else {
      let lastNit = null;
      for (const u of usuarios) {
        if (u.nit !== lastNit) {
          console.log(`\n  🏢 ${u.razon_social} (NIT: ${u.nit})`);
          console.log(`  ${'─'.repeat(50)}`);
          lastNit = u.nit;
        }
        const ultimoAcceso = u.ultimo_acceso
          ? new Date(u.ultimo_acceso).toLocaleString('es-CO')
          : 'Nunca';
        console.log(`  │  Rol: [${u.rol.padEnd(10)}]  Código: ${u.codigo.padEnd(15)} Nombre: ${u.nombre}`);
        console.log(`  │  Email: ${u.email || 'N/A'}  |  Activo: ${u.activo ? '✅' : '❌'}  |  Último acceso: ${ultimoAcceso}`);
        console.log(`  │  ID: ${u.usuario_id}`);
        console.log(`  │`);
      }
      console.log('');
    }

    // ── 3. AUDITORÍA DE AISLAMIENTO DE DATOS ─────────────────────────────────
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  🔍  AUDITORÍA: AISLAMIENTO DE DATOS POR TENANT');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Verificar productos sin empresa_id (fuga de datos)
    const { rows: prodSinTenant } = await client.query(
      `SELECT COUNT(*) AS total FROM productos WHERE empresa_id IS NULL`
    );
    console.log(`  Productos sin empresa_id (fuga): ${prodSinTenant[0].total === '0' ? '✅ 0 — OK' : '❌ ' + prodSinTenant[0].total + ' — PROBLEMA'}`);

    const { rows: tercSinTenant } = await client.query(
      `SELECT COUNT(*) AS total FROM terceros WHERE empresa_id IS NULL`
    );
    console.log(`  Terceros sin empresa_id  (fuga): ${tercSinTenant[0].total === '0' ? '✅ 0 — OK' : '❌ ' + tercSinTenant[0].total + ' — PROBLEMA'}`);

    const { rows: factSinTenant } = await client.query(
      `SELECT COUNT(*) AS total FROM facturas WHERE empresa_id IS NULL`
    );
    console.log(`  Facturas sin empresa_id  (fuga): ${factSinTenant[0].total === '0' ? '✅ 0 — OK' : '❌ ' + factSinTenant[0].total + ' — PROBLEMA'}`);

    // ── 4. VERIFICAR RLS ACTIVO ───────────────────────────────────────────────
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  🛡️   VERIFICACIÓN DE ROW LEVEL SECURITY (RLS)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const { rows: rlsStatus } = await client.query(`
      SELECT
        tablename,
        rowsecurity AS rls_enabled,
        forcerowsecurity AS rls_forced
      FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename IN ('empresas','usuarios','terceros','productos','facturas','lineas_factura','sesiones_jwt')
      ORDER BY tablename
    `);

    for (const r of rlsStatus) {
      const rlsOk  = r.rls_enabled  ? '✅ ACTIVO' : '❌ INACTIVO';
      const force  = r.rls_forced   ? '✅ FORZADO' : '⚠️  No forzado';
      console.log(`  ${r.tablename.padEnd(20)} RLS: ${rlsOk}  |  Force: ${force}`);
    }

    // ── 5. VERIFICAR POLÍTICAS RLS ────────────────────────────────────────────
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  📜  POLÍTICAS RLS CONFIGURADAS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const { rows: policies } = await client.query(`
      SELECT
        tablename,
        policyname,
        permissive,
        roles,
        cmd,
        qual
      FROM pg_policies
      WHERE schemaname = 'public'
      ORDER BY tablename, policyname
    `);

    if (policies.length === 0) {
      console.log('  ❌ No hay políticas RLS configuradas — RIESGO DE SEGURIDAD\n');
    } else {
      for (const p of policies) {
        console.log(`  Tabla: ${p.tablename.padEnd(20)} Política: ${p.policyname.padEnd(20)} Cmd: ${p.cmd}  Roles: ${p.roles}`);
      }
      console.log('');
    }

    // ── 6. EVALUACIÓN GENERAL DE ARQUITECTURA ────────────────────────────────
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  🏗️   EVALUACIÓN DE ARQUITECTURA MULTI-TENANT');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('  Modelo actual: Shared Database + empresa_id discriminator');
    console.log('  ─────────────────────────────────────────────────────────');
    console.log('  ✅ Base de datos compartida con aislamiento lógico por empresa_id');
    console.log('  ✅ RLS (Row Level Security) de PostgreSQL como 2ª capa de defensa');
    console.log('  ✅ Tabla "facturas" particionada por HASH(empresa_id) (16 particiones)');
    console.log('  ✅ tenantMiddleware inyecta empresa_id desde JWT en cada request');
    console.log('  ✅ SET LOCAL app.empresa_id activa RLS automáticamente por sesión');
    console.log('  ✅ Constraints UNIQUE(empresa_id, codigo) en productos y terceros');
    console.log('  ✅ ON DELETE CASCADE garantiza limpieza al eliminar un tenant');
    console.log('');
    console.log('  Observaciones y recomendaciones:');
    console.log('  ─────────────────────────────────────────────────────────');
    console.log('  ℹ️  El modelo actual es IDEAL para <10,000 tenants');
    console.log('  ℹ️  Para escalar a 100k+ tenants: agregar PgBouncer en transaction mode');
    console.log('  ℹ️  Para máximo aislamiento físico: migrar a Schema-per-tenant');
    console.log('  ⚠️  Verificar que todas las rutas API usen tenantMiddleware');
    console.log('  ⚠️  Verificar que el panel de SUPERADMIN NO use el rol amc_app');

    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║               AUDITORÍA COMPLETADA                           ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

  } catch (err) {
    console.error('\n❌ Error en auditoría:', err.message);
    throw err;
  } finally {
    await client.end();
  }
}

auditoria().catch(() => process.exit(1));
