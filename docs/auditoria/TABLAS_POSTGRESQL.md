# Inventario PostgreSQL

**Fuente:** migraciones en `backend/db/migrations/001–009.sql` y `backend/db/migrate.js`.  
**Corte:** 25 de septiembre de 2026. Es el esquema declarado por archivos; no se consultó el catálogo de una instancia real.

## Entidades lógicas

| Tabla | Migración | Tenant/RLS | Propósito y claves visibles |
| --- | --- | --- | --- |
| `empresas` | 001 | Tabla de tenants; sin política RLS en migración 002 | Empresa/NIT, estado/plan y contadores de consecutivos. Los servicios deben restringir por ID. |
| `usuarios` | 001, políticas en 002 | `empresa_id`; RLS forzado | Usuarios por empresa; único `(empresa_id, codigo)`. |
| `terceros` | 001, políticas en 002 | `empresa_id`; RLS forzado | Clientes/proveedores; único `(empresa_id, documento)`. |
| `productos` | 001 y columnas en 007, políticas en 002 | `empresa_id`; RLS forzado | Productos/servicios, precios e inventario actual. Único `(empresa_id, codigo)`. |
| `facturas` | 001, políticas/índices en 002–003 | `empresa_id`; RLS forzado | Cabecera; particionada HASH por empresa en 16 particiones; PK `(id, empresa_id)`, consecutivo único por empresa. |
| `lineas_factura` | 001, políticas en 002 | `empresa_id`; RLS forzado | Detalle de factura; 008 agrega FK compuesta con cabecera y unicidad del número de línea por documento/empresa. |
| `sesiones_jwt` | 001, políticas en 002 | `empresa_id`; RLS forzado | Sesiones revocables por `jti`, usuario y expiración. |
| `migrations_log` | 001 y `db/migrate.js` | Tabla técnica global | Registro de archivos aplicados. El runner también la crea con `IF NOT EXISTS`. |
| `nominas_electronicas` | 004 | `empresa_id`; RLS forzado | Nómina con importes, estado, consecutivo y CUDE; consecutivos únicos por empresa. |
| `empleados` | 005 | `empresa_id`; RLS forzado | Perfil laboral y datos contractuales/bancarios; único `(empresa_id, documento)`. |
| `cotizaciones` | 006 | `empresa_id`; RLS forzado | Cabecera y snapshot del cliente/totales; particionada HASH en 16 particiones; consecutivo único por empresa. |
| `lineas_cotizacion` | 006 | `empresa_id`; RLS forzado | Detalle; 008 agrega FK compuesta a cabecera y unicidad por línea/documento. |
| `inventario_movimientos` | 007 | `empresa_id`; RLS forzado | Kardex con stock anterior/nuevo, tipo y referencia. |
| `auditoria_eventos` | 008 | `empresa_id`; RLS forzado | Snapshots JSONB anterior/nuevo, actor, tabla, operación y transacción. |
| `calendario_eventos` | 009 | `empresa_id`; RLS forzado | Eventos por fecha, hora, categoría, color, estado y recordatorio. |

Hay 15 entidades lógicas explícitas. Además, los archivos declaran `facturas_p0`–`facturas_p15` y `cotizaciones_p0`–`cotizaciones_p15`: 32 particiones hijas (47 tablas físicas declaradas contando entidades y particiones, sin contar objetos del sistema PostgreSQL).

## Aislamiento multiempresa

Las migraciones aplican `ENABLE ROW LEVEL SECURITY` y `FORCE ROW LEVEL SECURITY` a 13 tablas operativas con empresa/contexto: usuarios, terceros, productos, facturas, líneas de factura, sesiones JWT, nóminas, empleados, cotizaciones, líneas de cotización, movimientos de inventario, auditoría y eventos del calendario. Sus políticas comparan `empresa_id` con `current_empresa_id()`; los modelos también suelen incluir el tenant en consultas.

`empresas` y `migrations_log` son globales/sistema y no están en esa lista de RLS. El acceso a `empresas` depende de servicios y controles de rol. La falta de RLS sobre la tabla de empresas no prueba por sí sola exposición, pero los endpoints superadministrativos deben probarse explícitamente.

## Índices, integridad y auditoría

- La migración 003 añade índices por tenant para usuarios, terceros, productos, facturas y líneas; algunos índices trigram dependen de la extensión correspondiente.
- Las migraciones 004, 005, 007 y 009 incluyen índices del tenant y fechas/documentos.
- Facturas y cotizaciones particionan por hash de `empresa_id`, 16 particiones cada una.
- La migración 008 agrega referencias compuestas de líneas a cabeceras con estado `NOT VALID`, vistas/diagnóstico de huérfanos y triggers de auditoría para ocho tablas operativas.
- El runner ejecuta archivos por orden lexicográfico y registra sus nombres en `migrations_log`.

## Verificaciones pendientes en la instancia

Comparar estas declaraciones con `pg_catalog`: migraciones efectivamente aplicadas, políticas y roles activos, permisos, extensiones, constraints `NOT VALID`, índices válidos/no válidos, tamaños, conteos, duplicados y plan de consultas. No se ejecutó SQL en la base.
