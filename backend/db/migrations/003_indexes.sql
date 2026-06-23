-- ══════════════════════════════════════════════════════════════════════════════
-- MIGRACIÓN 003 — Índices de rendimiento para arquitectura multi-tenant
-- Empresa_id SIEMPRE es la primera columna en índices compuestos.
-- Esto garantiza que PostgreSQL pueda usar partition pruning y
-- eliminar particiones irrelevantes en las consultas de facturas.
-- ══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- USUARIOS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_usuarios_empresa
    ON usuarios (empresa_id);

-- Login: buscar por empresa + código
CREATE INDEX IF NOT EXISTS idx_usuarios_empresa_codigo
    ON usuarios (empresa_id, codigo)
    WHERE activo = TRUE;

-- Buscar por email (recuperación de cuenta)
CREATE INDEX IF NOT EXISTS idx_usuarios_email
    ON usuarios (email)
    WHERE email IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- TERCEROS (CLIENTES)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_terceros_empresa
    ON terceros (empresa_id)
    WHERE activo = TRUE;

-- Búsqueda por documento (autocompletado en factura)
CREATE INDEX IF NOT EXISTS idx_terceros_empresa_documento
    ON terceros (empresa_id, documento)
    WHERE activo = TRUE;

-- Búsqueda full-text por nombre (trigram)
CREATE INDEX IF NOT EXISTS idx_terceros_nombre_trgm
    ON terceros USING GIN (nombre gin_trgm_ops);

-- ─────────────────────────────────────────────────────────────────────────────
-- PRODUCTOS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_productos_empresa
    ON productos (empresa_id)
    WHERE activo = TRUE;

-- Búsqueda por código (autocompletado en factura)
CREATE INDEX IF NOT EXISTS idx_productos_empresa_codigo
    ON productos (empresa_id, codigo)
    WHERE activo = TRUE;

-- Búsqueda full-text por nombre (trigram)
CREATE INDEX IF NOT EXISTS idx_productos_nombre_trgm
    ON productos USING GIN (nombre gin_trgm_ops);

-- ─────────────────────────────────────────────────────────────────────────────
-- FACTURAS (tabla particionada — índices locales por partición)
-- PostgreSQL crea automáticamente un índice en cada partición.
-- ─────────────────────────────────────────────────────────────────────────────

-- Listar facturas de una empresa ordenadas por más reciente
CREATE INDEX IF NOT EXISTS idx_facturas_empresa_fecha
    ON facturas (empresa_id, generado_en DESC);

-- Búsqueda por cliente
CREATE INDEX IF NOT EXISTS idx_facturas_empresa_cliente_doc
    ON facturas (empresa_id, cliente_documento);

-- Búsqueda por número de factura
CREATE INDEX IF NOT EXISTS idx_facturas_empresa_numero
    ON facturas (empresa_id, numero_factura);

-- Reporte: facturas por estado
CREATE INDEX IF NOT EXISTS idx_facturas_empresa_estado
    ON facturas (empresa_id, estado)
    WHERE estado != 'ANULADA';

-- CUFE (consulta DIAN)
CREATE INDEX IF NOT EXISTS idx_facturas_cufe
    ON facturas (cufe)
    WHERE cufe IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- LÍNEAS DE FACTURA
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_lineas_empresa_factura
    ON lineas_factura (empresa_id, factura_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- SESIONES JWT
-- ─────────────────────────────────────────────────────────────────────────────
-- Validación de token: buscar por JTI
CREATE INDEX IF NOT EXISTS idx_sesiones_jti
    ON sesiones_jwt (jti)
    WHERE revocado = FALSE;

-- Limpieza de tokens expirados (job nocturno)
CREATE INDEX IF NOT EXISTS idx_sesiones_expira
    ON sesiones_jwt (expira_en)
    WHERE revocado = FALSE;

-- Revocar todos los tokens de un usuario
CREATE INDEX IF NOT EXISTS idx_sesiones_usuario
    ON sesiones_jwt (usuario_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- ESTADÍSTICAS: Ayudar al planificador de queries con datos actualizados
-- ─────────────────────────────────────────────────────────────────────────────
-- Ejecutar después de cargar datos masivos o en producción periódicamente
-- ANALYZE empresas;
-- ANALYZE usuarios;
-- ANALYZE terceros;
-- ANALYZE productos;
-- ANALYZE facturas;
-- ANALYZE lineas_factura;

-- Marcar esta migración como ejecutada
INSERT INTO migrations_log (filename) VALUES ('003_indexes.sql')
ON CONFLICT (filename) DO NOTHING;
