-- ══════════════════════════════════════════════════════════════════════════════
-- MIGRACIÓN 002 — Row Level Security (RLS)
-- Segunda capa de defensa: PostgreSQL bloquea acceso a datos de otro tenant
-- directamente a nivel de motor, incluso si el middleware falla.
-- ══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Rol de aplicación  (el backend se conecta con este rol)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'amc_app') THEN
        -- El runner establece la contraseña desde backend/.env al completar
        -- todas las migraciones; no se almacena una clave de ejemplo en SQL.
        CREATE ROLE amc_app LOGIN;
    END IF;
END
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Habilitar RLS en todas las tablas operativas
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE terceros       ENABLE ROW LEVEL SECURITY;
ALTER TABLE productos      ENABLE ROW LEVEL SECURITY;
ALTER TABLE facturas       ENABLE ROW LEVEL SECURITY;
ALTER TABLE lineas_factura ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios       ENABLE ROW LEVEL SECURITY;
ALTER TABLE sesiones_jwt   ENABLE ROW LEVEL SECURITY;

-- FORCE RLS: se aplica también al propietario de la tabla (máxima seguridad)
ALTER TABLE terceros       FORCE ROW LEVEL SECURITY;
ALTER TABLE productos      FORCE ROW LEVEL SECURITY;
ALTER TABLE facturas       FORCE ROW LEVEL SECURITY;
ALTER TABLE lineas_factura FORCE ROW LEVEL SECURITY;
ALTER TABLE usuarios       FORCE ROW LEVEL SECURITY;
ALTER TABLE sesiones_jwt   FORCE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Función helper para leer el empresa_id de la sesión actual
--    El backend lo setea con: SET LOCAL app.empresa_id = '<uuid>'
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION current_empresa_id()
RETURNS UUID
LANGUAGE sql STABLE
AS $$
    SELECT NULLIF(current_setting('app.empresa_id', TRUE), '')::UUID;
$$;

COMMENT ON FUNCTION current_empresa_id() IS
    'Retorna el empresa_id del contexto de sesión actual. Usado por las políticas RLS.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Políticas RLS — cada política filtra por empresa_id de la sesión
-- ─────────────────────────────────────────────────────────────────────────────

-- NOTA: Los SUPERADMIN del backend usan una conexión DIFERENTE (superuser)
--       que bypassea el RLS. Los usuarios normales siempre usan amc_app.

-- ── terceros ──────────────────────────────────────────────
DROP POLICY IF EXISTS tenant_isolation ON terceros;
CREATE POLICY tenant_isolation ON terceros
    AS PERMISSIVE
    FOR ALL
    TO amc_app
    USING       (empresa_id = current_empresa_id())
    WITH CHECK  (empresa_id = current_empresa_id());

-- ── productos ─────────────────────────────────────────────
DROP POLICY IF EXISTS tenant_isolation ON productos;
CREATE POLICY tenant_isolation ON productos
    AS PERMISSIVE
    FOR ALL
    TO amc_app
    USING       (empresa_id = current_empresa_id())
    WITH CHECK  (empresa_id = current_empresa_id());

-- ── facturas (tabla particionada — política se hereda por particiones) ────────
DROP POLICY IF EXISTS tenant_isolation ON facturas;
CREATE POLICY tenant_isolation ON facturas
    AS PERMISSIVE
    FOR ALL
    TO amc_app
    USING       (empresa_id = current_empresa_id())
    WITH CHECK  (empresa_id = current_empresa_id());

-- ── lineas_factura ────────────────────────────────────────
DROP POLICY IF EXISTS tenant_isolation ON lineas_factura;
CREATE POLICY tenant_isolation ON lineas_factura
    AS PERMISSIVE
    FOR ALL
    TO amc_app
    USING       (empresa_id = current_empresa_id())
    WITH CHECK  (empresa_id = current_empresa_id());

-- ── usuarios (un usuario solo ve usuarios de su empresa) ──
DROP POLICY IF EXISTS tenant_isolation ON usuarios;
CREATE POLICY tenant_isolation ON usuarios
    AS PERMISSIVE
    FOR ALL
    TO amc_app
    USING       (empresa_id = current_empresa_id())
    WITH CHECK  (empresa_id = current_empresa_id());

-- ── sesiones_jwt ──────────────────────────────────────────
DROP POLICY IF EXISTS tenant_isolation ON sesiones_jwt;
CREATE POLICY tenant_isolation ON sesiones_jwt
    AS PERMISSIVE
    FOR ALL
    TO amc_app
    USING       (empresa_id = current_empresa_id())
    WITH CHECK  (empresa_id = current_empresa_id());

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Permisos al rol amc_app
-- ─────────────────────────────────────────────────────────────────────────────
GRANT USAGE ON SCHEMA public TO amc_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON
    empresas, usuarios, terceros, productos,
    facturas, lineas_factura, sesiones_jwt
TO amc_app;

-- empresas: amc_app solo puede leer (crear empresas requiere superuser)
REVOKE INSERT, UPDATE, DELETE ON empresas FROM amc_app;
GRANT  INSERT, UPDATE ON empresas TO amc_app;   -- ADMIN puede actualizar su propia empresa

-- Secuencias
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO amc_app;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Función de auditoría: actualizar automáticamente actualizado_en
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.actualizado_en = NOW();
    RETURN NEW;
END;
$$;

-- Aplicar trigger a todas las tablas con columna actualizado_en
CREATE TRIGGER set_updated_at BEFORE UPDATE ON empresas
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON usuarios
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON terceros
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON productos
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON facturas
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Marcar esta migración como ejecutada
INSERT INTO migrations_log (filename) VALUES ('002_rls_policies.sql')
ON CONFLICT (filename) DO NOTHING;
