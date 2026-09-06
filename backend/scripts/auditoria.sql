-- ══════════════════════════════════════════════════════════════════
-- AUDITORÍA MULTI-TENANT — AMC Facturación Electrónica
-- ══════════════════════════════════════════════════════════════════

\echo ''
\echo '╔══════════════════════════════════════════════════════════════╗'
\echo '║         AMC FACTURACIÓN — AUDITORÍA MULTI-TENANT             ║'
\echo '╚══════════════════════════════════════════════════════════════╝'
\echo ''

-- 1. LISTADO DE EMPRESAS (TENANTS)
\echo '━━━ 1. EMPRESAS (TENANTS) REGISTRADAS ━━━━━━━━━━━━━━━━━━━━━━━━'
SELECT
  e.nit                                      AS "NIT",
  e.razon_social                             AS "Razón Social",
  e.plan                                     AS "Plan",
  e.activa                                   AS "Activa",
  e.ciudad                                   AS "Ciudad",
  e.email                                    AS "Email",
  to_char(e.creado_en, 'YYYY-MM-DD HH24:MI') AS "Creado",
  COUNT(DISTINCT u.id)::INT                  AS "Usuarios",
  COUNT(DISTINCT p.id)::INT                  AS "Productos",
  COUNT(DISTINCT t.id)::INT                  AS "Terceros",
  COUNT(DISTINCT f.id)::INT                  AS "Facturas"
FROM empresas e
LEFT JOIN usuarios       u ON u.empresa_id = e.id
LEFT JOIN productos      p ON p.empresa_id = e.id
LEFT JOIN terceros       t ON t.empresa_id = e.id
LEFT JOIN facturas       f ON f.empresa_id = e.id
GROUP BY e.id
ORDER BY e.creado_en;

-- 2. USUARIOS POR EMPRESA
\echo ''
\echo '━━━ 2. USUARIOS REGISTRADOS (CREDENCIALES DE ACCESO) ━━━━━━━━━'
SELECT
  e.nit                                       AS "NIT Empresa",
  e.razon_social                              AS "Empresa",
  u.nombre                                    AS "Nombre Usuario",
  u.codigo                                    AS "Código (Login)",
  u.rol                                       AS "Rol",
  u.activo                                    AS "Activo",
  to_char(u.ultimo_acceso, 'YYYY-MM-DD')      AS "Último Acceso",
  to_char(u.creado_en, 'YYYY-MM-DD')          AS "Creado"
FROM usuarios u
JOIN empresas e ON e.id = u.empresa_id
ORDER BY e.nit, u.rol DESC, u.nombre;

-- 3. DISTRIBUCIÓN DE DATOS POR TENANT
\echo ''
\echo '━━━ 3. DISTRIBUCIÓN DE DATOS — VERIFICAR AISLAMIENTO ━━━━━━━━━'
SELECT
  e.nit           AS "NIT",
  e.razon_social  AS "Empresa",
  'Productos'     AS "Tabla",
  COUNT(*)::INT   AS "Registros"
FROM productos p JOIN empresas e ON e.id = p.empresa_id
GROUP BY e.id
UNION ALL
SELECT
  e.nit, e.razon_social, 'Terceros', COUNT(*)::INT
FROM terceros t JOIN empresas e ON e.id = t.empresa_id
GROUP BY e.id
UNION ALL
SELECT
  e.nit, e.razon_social, 'Facturas', COUNT(*)::INT
FROM facturas f JOIN empresas e ON e.id = f.empresa_id
GROUP BY e.id
ORDER BY "NIT", "Tabla";

-- 4. VERIFICAR FUGAS DE DATOS (registros sin empresa_id)
\echo ''
\echo '━━━ 4. VERIFICACIÓN DE FUGAS — Sin empresa_id ━━━━━━━━━━━━━━━━'
SELECT 'productos'      AS tabla, COUNT(*) AS sin_tenant FROM productos      WHERE empresa_id IS NULL
UNION ALL
SELECT 'terceros',               COUNT(*)               FROM terceros       WHERE empresa_id IS NULL
UNION ALL
SELECT 'facturas',               COUNT(*)               FROM facturas       WHERE empresa_id IS NULL
UNION ALL
SELECT 'lineas_factura',         COUNT(*)               FROM lineas_factura WHERE empresa_id IS NULL
UNION ALL
SELECT 'usuarios',               COUNT(*)               FROM usuarios       WHERE empresa_id IS NULL;

-- 5. ESTADO RLS
\echo ''
\echo '━━━ 5. ROW LEVEL SECURITY (RLS) STATUS ━━━━━━━━━━━━━━━━━━━━━━━'
SELECT
  tablename               AS "Tabla",
  rowsecurity             AS "RLS Activo",
  forcerowsecurity        AS "RLS Forzado"
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('empresas','usuarios','terceros','productos','facturas','lineas_factura','sesiones_jwt')
ORDER BY tablename;

-- 6. POLÍTICAS RLS
\echo ''
\echo '━━━ 6. POLÍTICAS RLS CONFIGURADAS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
SELECT
  tablename   AS "Tabla",
  policyname  AS "Política",
  cmd         AS "Operación",
  roles       AS "Roles"
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename;

-- 7. MIGRACIONES EJECUTADAS
\echo ''
\echo '━━━ 7. HISTORIAL DE MIGRACIONES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
SELECT
  filename                                         AS "Migración",
  to_char(ejecutado_en, 'YYYY-MM-DD HH24:MI:SS')  AS "Ejecutada"
FROM migrations_log
ORDER BY id;

\echo ''
\echo '╔══════════════════════════════════════════════════════════════╗'
\echo '║               AUDITORÍA COMPLETADA ✓                         ║'
\echo '╚══════════════════════════════════════════════════════════════╝'
\echo ''
