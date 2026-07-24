-- Nóminas electrónicas: consecutivo independiente NE001 a NE1000 por empresa.
ALTER TABLE empresas
  ADD COLUMN IF NOT EXISTS nomina_consecutivo_actual INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS nominas_electronicas (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id          UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  consecutivo         INTEGER NOT NULL CHECK (consecutivo BETWEEN 1 AND 1000),
  numero_nomina       VARCHAR(10) NOT NULL,
  cude                VARCHAR(128) NOT NULL,
  empleado_nombre     VARCHAR(200) NOT NULL,
  empleado_documento  VARCHAR(40) NOT NULL,
  empleado_cargo      VARCHAR(150) NOT NULL,
  empleado_cuenta     VARCHAR(120) NOT NULL,
  salario             NUMERIC(15,2) NOT NULL CHECK (salario > 0),
  bonificaciones      NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (bonificaciones >= 0),
  auxilio_transporte  NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (auxilio_transporte >= 0),
  deduccion_salud     NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (deduccion_salud >= 0),
  deduccion_pension   NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (deduccion_pension >= 0),
  deduccion_fsp       NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (deduccion_fsp >= 0),
  neto_pagar          NUMERIC(15,2) NOT NULL,
  estado              VARCHAR(20) NOT NULL DEFAULT 'GENERADA' CHECK (estado IN ('GENERADA', 'ANULADA')),
  generado_en         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  creado_por          UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  CONSTRAINT nominas_empresa_consecutivo_unique UNIQUE (empresa_id, consecutivo),
  CONSTRAINT nominas_empresa_numero_unique UNIQUE (empresa_id, numero_nomina),
  CONSTRAINT nominas_cude_unique UNIQUE (cude)
);

ALTER TABLE nominas_electronicas ENABLE ROW LEVEL SECURITY;
ALTER TABLE nominas_electronicas FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON nominas_electronicas;
CREATE POLICY tenant_isolation ON nominas_electronicas
  AS PERMISSIVE FOR ALL TO amc_app
  USING (empresa_id = current_empresa_id())
  WITH CHECK (empresa_id = current_empresa_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON nominas_electronicas TO amc_app;
CREATE INDEX IF NOT EXISTS idx_nominas_empresa_fecha ON nominas_electronicas (empresa_id, generado_en DESC);
CREATE INDEX IF NOT EXISTS idx_nominas_empresa_documento ON nominas_electronicas (empresa_id, empleado_documento);

INSERT INTO migrations_log (filename) VALUES ('004_nominas_electronicas.sql')
ON CONFLICT (filename) DO NOTHING;
