-- Perfiles de empleados independientes de terceros/clientes.
CREATE TABLE IF NOT EXISTS empleados (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id               UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nombre                   VARCHAR(200) NOT NULL,
  documento                VARCHAR(40) NOT NULL,
  email                    VARCHAR(150) NOT NULL,
  telefono                 VARCHAR(30) NOT NULL,
  ciudad                   VARCHAR(100) NOT NULL,
  direccion                VARCHAR(300) NOT NULL,
  cuenta_bancaria          VARCHAR(120) NOT NULL,
  fecha_inicio_contrato    DATE NOT NULL,
  tipo_contrato            VARCHAR(15) NOT NULL CHECK (tipo_contrato IN ('FIJO', 'INDEFINIDO')),
  salario                  NUMERIC(15,2) NOT NULL CHECK (salario > 0),
  numero_contrato          VARCHAR(80) NOT NULL,
  cargo                    VARCHAR(150) NOT NULL,
  tipo_cotizante           VARCHAR(20) NOT NULL CHECK (tipo_cotizante IN ('DEPENDIENTE', 'INDEPENDIENTE')),
  fondo_salud              VARCHAR(150) NOT NULL,
  fondo_pension            VARCHAR(150) NOT NULL,
  caja_compensacion        VARCHAR(150) NOT NULL,
  arl                      VARCHAR(150) NOT NULL,
  nivel_riesgo_arl         VARCHAR(80) NOT NULL,
  activo                   BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT empleados_empresa_documento_unique UNIQUE (empresa_id, documento)
);

ALTER TABLE empleados ENABLE ROW LEVEL SECURITY;
ALTER TABLE empleados FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON empleados;
CREATE POLICY tenant_isolation ON empleados
  AS PERMISSIVE FOR ALL TO amc_app
  USING (empresa_id = current_empresa_id())
  WITH CHECK (empresa_id = current_empresa_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON empleados TO amc_app;
CREATE INDEX IF NOT EXISTS idx_empleados_empresa_nombre ON empleados (empresa_id, nombre) WHERE activo = TRUE;
CREATE INDEX IF NOT EXISTS idx_empleados_empresa_documento ON empleados (empresa_id, documento) WHERE activo = TRUE;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON empleados FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

INSERT INTO migrations_log (filename) VALUES ('005_empleados.sql')
ON CONFLICT (filename) DO NOTHING;
