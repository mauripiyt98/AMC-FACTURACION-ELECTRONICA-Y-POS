-- Memoria conversacional estructurada y aislada por empresa/usuario.
-- Solo almacena contexto permitido (intención pendiente, cliente y código); no guarda
-- la transcripción libre del chat ni secretos que el usuario pudiera pegar.
CREATE TABLE IF NOT EXISTS mauro_memorias (
    conversacion_id UUID NOT NULL,
    empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    usuario_id      UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    contexto        JSONB NOT NULL DEFAULT '{}'::JSONB
                    CHECK (jsonb_typeof(contexto) = 'object'),
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (conversacion_id, empresa_id, usuario_id)
);

CREATE INDEX IF NOT EXISTS idx_mauro_memorias_usuario_recientes
    ON mauro_memorias (empresa_id, usuario_id, actualizado_en DESC);

ALTER TABLE mauro_memorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE mauro_memorias FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_user_isolation ON mauro_memorias;
CREATE POLICY tenant_user_isolation ON mauro_memorias
    AS PERMISSIVE FOR ALL TO amc_app
    USING (
      empresa_id = current_empresa_id()
      AND usuario_id = NULLIF(current_setting('app.user_id', TRUE), '')::UUID
    )
    WITH CHECK (
      empresa_id = current_empresa_id()
      AND usuario_id = NULLIF(current_setting('app.user_id', TRUE), '')::UUID
    );

DROP TRIGGER IF EXISTS set_updated_at ON mauro_memorias;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON mauro_memorias
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON mauro_memorias TO amc_app;

INSERT INTO migrations_log (filename) VALUES ('010_mauro_memoria.sql') ON CONFLICT (filename) DO NOTHING;
