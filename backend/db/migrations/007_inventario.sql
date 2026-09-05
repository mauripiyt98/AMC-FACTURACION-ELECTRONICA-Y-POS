-- ══════════════════════════════════════════════════════════════════════════════
-- MIGRACIÓN 007 — Control de Inventarios y Movimientos (Kardex)
-- ══════════════════════════════════════════════════════════════════════════════

-- 1. Añadir columnas de stock a la tabla productos si no existen
ALTER TABLE productos ADD COLUMN IF NOT EXISTS stock_total NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS stock_minimo NUMERIC(12,2) NOT NULL DEFAULT 0;

-- 2. Crear tabla inventario_movimientos para trazabilidad contable
CREATE TABLE IF NOT EXISTS inventario_movimientos (
    id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id          UUID          NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    producto_id         UUID          NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
    tipo_movimiento     VARCHAR(30)   NOT NULL,
    -- ENTRADA | SALIDA_VENTA | AJUSTE_MANUAL | INVENTARIO_INICIAL | DEVOLUCION
    cantidad            NUMERIC(12,2) NOT NULL,
    stock_anterior      NUMERIC(12,2) NOT NULL,
    stock_nuevo         NUMERIC(12,2) NOT NULL,
    referencia          VARCHAR(100), -- ej. Factura FE-0001, POS-001, Ajuste manual
    motivo              TEXT,
    creado_por          UUID          REFERENCES usuarios(id) ON DELETE SET NULL,
    creado_en           TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- 3. Índices para consultas eficientes y seguras
CREATE INDEX IF NOT EXISTS idx_inventario_mov_empresa_prod
    ON inventario_movimientos (empresa_id, producto_id, creado_en DESC);

-- 4. RLS y aislamiento Multi-Tenant
ALTER TABLE inventario_movimientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventario_movimientos FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON inventario_movimientos;
CREATE POLICY tenant_isolation ON inventario_movimientos
    AS PERMISSIVE FOR ALL TO amc_app
    USING (empresa_id = current_empresa_id())
    WITH CHECK (empresa_id = current_empresa_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON inventario_movimientos TO amc_app;

-- 5. Registrar migración
INSERT INTO migrations_log (filename) VALUES ('007_inventario.sql') ON CONFLICT (filename) DO NOTHING;
