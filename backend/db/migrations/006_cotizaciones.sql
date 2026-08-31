-- ══════════════════════════════════════════════════════════════════════════════
-- MIGRACIÓN 006 — Cotizaciones
-- ══════════════════════════════════════════════════════════════════════════════

-- 1. Añadir consecutivo de cotizaciones a empresas
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS consecutivo_cotizacion INTEGER NOT NULL DEFAULT 0;

-- 2. Crear tabla cotizaciones particionada
CREATE TABLE IF NOT EXISTS cotizaciones (
    id                  UUID          NOT NULL DEFAULT gen_random_uuid(),
    empresa_id          UUID          NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    consecutivo         INTEGER       NOT NULL,
    numero_cotizacion   VARCHAR(30)   NOT NULL,
    
    -- Snapshot del cliente
    cliente_nombre      VARCHAR(200)  NOT NULL,
    cliente_documento   VARCHAR(30)   NOT NULL,
    cliente_email       VARCHAR(150),
    cliente_telefono    VARCHAR(30),
    cliente_direccion   VARCHAR(300),
    cliente_ciudad      VARCHAR(100),
    tercero_id          UUID          REFERENCES terceros(id) ON DELETE SET NULL,
    
    -- Totales calculados
    total_base          NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_iva           NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_retencion     NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_cotizacion    NUMERIC(15,2) NOT NULL DEFAULT 0,
    
    -- Metadatos
    observaciones       TEXT,
    estado              VARCHAR(20)   NOT NULL DEFAULT 'GUARDADA',
    -- GUARDADA | FACTURADA | ANULADA
    creado_por          UUID          REFERENCES usuarios(id) ON DELETE SET NULL,
    generado_en         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    actualizado_en      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    
    PRIMARY KEY (id, empresa_id),
    CONSTRAINT cotizaciones_empresa_consecutivo_unique UNIQUE (empresa_id, consecutivo)
) PARTITION BY HASH (empresa_id);

CREATE TABLE IF NOT EXISTS cotizaciones_p0  PARTITION OF cotizaciones FOR VALUES WITH (MODULUS 16, REMAINDER 0);
CREATE TABLE IF NOT EXISTS cotizaciones_p1  PARTITION OF cotizaciones FOR VALUES WITH (MODULUS 16, REMAINDER 1);
CREATE TABLE IF NOT EXISTS cotizaciones_p2  PARTITION OF cotizaciones FOR VALUES WITH (MODULUS 16, REMAINDER 2);
CREATE TABLE IF NOT EXISTS cotizaciones_p3  PARTITION OF cotizaciones FOR VALUES WITH (MODULUS 16, REMAINDER 3);
CREATE TABLE IF NOT EXISTS cotizaciones_p4  PARTITION OF cotizaciones FOR VALUES WITH (MODULUS 16, REMAINDER 4);
CREATE TABLE IF NOT EXISTS cotizaciones_p5  PARTITION OF cotizaciones FOR VALUES WITH (MODULUS 16, REMAINDER 5);
CREATE TABLE IF NOT EXISTS cotizaciones_p6  PARTITION OF cotizaciones FOR VALUES WITH (MODULUS 16, REMAINDER 6);
CREATE TABLE IF NOT EXISTS cotizaciones_p7  PARTITION OF cotizaciones FOR VALUES WITH (MODULUS 16, REMAINDER 7);
CREATE TABLE IF NOT EXISTS cotizaciones_p8  PARTITION OF cotizaciones FOR VALUES WITH (MODULUS 16, REMAINDER 8);
CREATE TABLE IF NOT EXISTS cotizaciones_p9  PARTITION OF cotizaciones FOR VALUES WITH (MODULUS 16, REMAINDER 9);
CREATE TABLE IF NOT EXISTS cotizaciones_p10 PARTITION OF cotizaciones FOR VALUES WITH (MODULUS 16, REMAINDER 10);
CREATE TABLE IF NOT EXISTS cotizaciones_p11 PARTITION OF cotizaciones FOR VALUES WITH (MODULUS 16, REMAINDER 11);
CREATE TABLE IF NOT EXISTS cotizaciones_p12 PARTITION OF cotizaciones FOR VALUES WITH (MODULUS 16, REMAINDER 12);
CREATE TABLE IF NOT EXISTS cotizaciones_p13 PARTITION OF cotizaciones FOR VALUES WITH (MODULUS 16, REMAINDER 13);
CREATE TABLE IF NOT EXISTS cotizaciones_p14 PARTITION OF cotizaciones FOR VALUES WITH (MODULUS 16, REMAINDER 14);
CREATE TABLE IF NOT EXISTS cotizaciones_p15 PARTITION OF cotizaciones FOR VALUES WITH (MODULUS 16, REMAINDER 15);

-- 3. Crear tabla lineas_cotizacion
CREATE TABLE IF NOT EXISTS lineas_cotizacion (
    id               UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id       UUID           NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    cotizacion_id    UUID           NOT NULL,
    numero_linea     SMALLINT       NOT NULL,
    producto_id      UUID           REFERENCES productos(id) ON DELETE SET NULL,
    
    codigo           VARCHAR(50),
    nombre           VARCHAR(200)   NOT NULL,
    unidad_medida    VARCHAR(30),
    cantidad         NUMERIC(12,4)  NOT NULL,
    valor_unitario   NUMERIC(15,2)  NOT NULL,
    tarifa_iva       NUMERIC(5,2)   NOT NULL DEFAULT 0,
    tarifa_retencion NUMERIC(5,2)   NOT NULL DEFAULT 0,
    base             NUMERIC(15,2)  NOT NULL,
    valor_iva        NUMERIC(15,2)  NOT NULL DEFAULT 0,
    valor_retencion  NUMERIC(15,2)  NOT NULL DEFAULT 0,
    total            NUMERIC(15,2)  NOT NULL
);

-- 4. RLS y permisos
ALTER TABLE cotizaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE cotizaciones FORCE ROW LEVEL SECURITY;

ALTER TABLE lineas_cotizacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE lineas_cotizacion FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON cotizaciones;
CREATE POLICY tenant_isolation ON cotizaciones
    AS PERMISSIVE FOR ALL TO amc_app
    USING (empresa_id = current_empresa_id())
    WITH CHECK (empresa_id = current_empresa_id());

DROP POLICY IF EXISTS tenant_isolation ON lineas_cotizacion;
CREATE POLICY tenant_isolation ON lineas_cotizacion
    AS PERMISSIVE FOR ALL TO amc_app
    USING (empresa_id = current_empresa_id())
    WITH CHECK (empresa_id = current_empresa_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON cotizaciones, lineas_cotizacion TO amc_app;

-- 5. Trigger
CREATE TRIGGER set_updated_at BEFORE UPDATE ON cotizaciones
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Registro
INSERT INTO migrations_log (filename) VALUES ('006_cotizaciones.sql') ON CONFLICT (filename) DO NOTHING;
