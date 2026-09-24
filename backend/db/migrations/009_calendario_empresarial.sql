-- Calendario empresarial multi-tenant: eventos, vencimientos y recordatorios.
CREATE TABLE IF NOT EXISTS calendario_eventos (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    titulo          VARCHAR(160) NOT NULL,
    descripcion     TEXT,
    fecha_inicio    DATE NOT NULL,
    hora_inicio     TIME,
    fecha_fin       DATE,
    hora_fin        TIME,
    todo_el_dia     BOOLEAN NOT NULL DEFAULT TRUE,
    categoria       VARCHAR(30) NOT NULL DEFAULT 'GENERAL'
                    CHECK (categoria IN ('IMPUESTO', 'NOMINA', 'COBRO', 'REUNION', 'TAREA', 'GENERAL')),
    color           VARCHAR(7) NOT NULL DEFAULT '#0b46eb'
                    CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
    estado          VARCHAR(15) NOT NULL DEFAULT 'PENDIENTE'
                    CHECK (estado IN ('PENDIENTE', 'COMPLETADO', 'CANCELADO')),
    recordatorio_dias SMALLINT CHECK (recordatorio_dias IS NULL OR recordatorio_dias BETWEEN 0 AND 365),
    creado_por      UUID REFERENCES usuarios(id) ON DELETE SET NULL,
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (fecha_fin IS NULL OR fecha_fin >= fecha_inicio)
);

CREATE INDEX IF NOT EXISTS idx_calendario_eventos_empresa_fecha
    ON calendario_eventos (empresa_id, fecha_inicio, estado);

ALTER TABLE calendario_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendario_eventos FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON calendario_eventos;
CREATE POLICY tenant_isolation ON calendario_eventos
    AS PERMISSIVE FOR ALL TO amc_app
    USING (empresa_id = current_empresa_id())
    WITH CHECK (empresa_id = current_empresa_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON calendario_eventos TO amc_app;

INSERT INTO migrations_log (filename) VALUES ('009_calendario_empresarial.sql') ON CONFLICT (filename) DO NOTHING;
