-- ══════════════════════════════════════════════════════════════════════════════
-- MIGRACIÓN 008 — Resiliencia, auditoría y protección contra borrado masivo
-- Es aditiva: no borra ni transforma registros existentes.
-- ══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- Registro inmutable de operaciones sobre datos críticos. Las instantáneas JSONB
-- permiten reconstruir un registro o investigar un incidente sin sobrescribir
-- el historial del documento original.
CREATE TABLE IF NOT EXISTS auditoria_eventos (
    id              BIGSERIAL PRIMARY KEY,
    empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE RESTRICT,
    ocurrido_en     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actor_usuario_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
    actor_rol       TEXT,
    origen          TEXT NOT NULL DEFAULT 'api',
    tabla           TEXT NOT NULL,
    operacion       TEXT NOT NULL CHECK (operacion IN ('INSERT', 'UPDATE', 'DELETE')),
    registro_id     UUID,
    datos_anteriores JSONB,
    datos_nuevos    JSONB,
    transaccion_id  BIGINT NOT NULL DEFAULT txid_current()
);

CREATE INDEX IF NOT EXISTS idx_auditoria_empresa_fecha
    ON auditoria_eventos (empresa_id, ocurrido_en DESC);
CREATE INDEX IF NOT EXISTS idx_auditoria_registro
    ON auditoria_eventos (empresa_id, tabla, registro_id, ocurrido_en DESC);

ALTER TABLE auditoria_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE auditoria_eventos FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON auditoria_eventos;
CREATE POLICY tenant_isolation ON auditoria_eventos
    AS PERMISSIVE FOR SELECT TO amc_app
    USING (empresa_id = current_empresa_id());

DROP POLICY IF EXISTS auditoria_insert_context ON auditoria_eventos;
CREATE POLICY auditoria_insert_context ON auditoria_eventos
    AS PERMISSIVE FOR INSERT TO PUBLIC
    WITH CHECK (empresa_id = current_empresa_id());

-- La aplicación puede leer auditoría mediante una ruta controlada futura, pero
-- nunca insertarla, actualizarla o borrarla directamente.
REVOKE ALL ON auditoria_eventos FROM amc_app;
GRANT SELECT ON auditoria_eventos TO amc_app;
REVOKE ALL ON SEQUENCE auditoria_eventos_id_seq FROM amc_app;

CREATE OR REPLACE FUNCTION registrar_auditoria_evento()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_empresa_id UUID;
    v_registro_id UUID;
    v_anterior JSONB;
    v_nuevo JSONB;
    v_actor UUID;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_empresa_id := OLD.empresa_id;
        v_registro_id := OLD.id;
        v_anterior := to_jsonb(OLD);
        v_nuevo := NULL;
    ELSE
        v_empresa_id := NEW.empresa_id;
        v_registro_id := NEW.id;
        v_anterior := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END;
        v_nuevo := to_jsonb(NEW);
    END IF;

    v_actor := NULLIF(current_setting('app.user_id', TRUE), '')::UUID;
    INSERT INTO auditoria_eventos (
        empresa_id, actor_usuario_id, actor_rol, tabla, operacion,
        registro_id, datos_anteriores, datos_nuevos
    ) VALUES (
        v_empresa_id, v_actor, NULLIF(current_setting('app.user_role', TRUE), ''),
        TG_TABLE_NAME, TG_OP, v_registro_id, v_anterior, v_nuevo
    );
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

-- No se usa IF NOT EXISTS porque PostgreSQL no lo soporta en CREATE TRIGGER.
DROP TRIGGER IF EXISTS auditoria_terceros ON terceros;
CREATE TRIGGER auditoria_terceros AFTER INSERT OR UPDATE OR DELETE ON terceros
    FOR EACH ROW EXECUTE FUNCTION registrar_auditoria_evento();

DROP TRIGGER IF EXISTS auditoria_productos ON productos;
CREATE TRIGGER auditoria_productos AFTER INSERT OR UPDATE OR DELETE ON productos
    FOR EACH ROW EXECUTE FUNCTION registrar_auditoria_evento();

DROP TRIGGER IF EXISTS auditoria_facturas ON facturas;
CREATE TRIGGER auditoria_facturas AFTER INSERT OR UPDATE OR DELETE ON facturas
    FOR EACH ROW EXECUTE FUNCTION registrar_auditoria_evento();

DROP TRIGGER IF EXISTS auditoria_lineas_factura ON lineas_factura;
CREATE TRIGGER auditoria_lineas_factura AFTER INSERT OR UPDATE OR DELETE ON lineas_factura
    FOR EACH ROW EXECUTE FUNCTION registrar_auditoria_evento();

DROP TRIGGER IF EXISTS auditoria_cotizaciones ON cotizaciones;
CREATE TRIGGER auditoria_cotizaciones AFTER INSERT OR UPDATE OR DELETE ON cotizaciones
    FOR EACH ROW EXECUTE FUNCTION registrar_auditoria_evento();

DROP TRIGGER IF EXISTS auditoria_lineas_cotizacion ON lineas_cotizacion;
CREATE TRIGGER auditoria_lineas_cotizacion AFTER INSERT OR UPDATE OR DELETE ON lineas_cotizacion
    FOR EACH ROW EXECUTE FUNCTION registrar_auditoria_evento();

DROP TRIGGER IF EXISTS auditoria_nominas ON nominas_electronicas;
CREATE TRIGGER auditoria_nominas AFTER INSERT OR UPDATE OR DELETE ON nominas_electronicas
    FOR EACH ROW EXECUTE FUNCTION registrar_auditoria_evento();

DROP TRIGGER IF EXISTS auditoria_inventario_movimientos ON inventario_movimientos;
CREATE TRIGGER auditoria_inventario_movimientos AFTER INSERT OR UPDATE OR DELETE ON inventario_movimientos
    FOR EACH ROW EXECUTE FUNCTION registrar_auditoria_evento();

-- Impedir DML físico desde el rol de aplicación. Los endpoints vigentes de
-- terceros, productos y usuarios ya emplean desactivación lógica.
REVOKE DELETE ON terceros, productos, facturas, lineas_factura,
    cotizaciones, lineas_cotizacion, nominas_electronicas,
    inventario_movimientos FROM amc_app;
REVOKE UPDATE, DELETE ON inventario_movimientos FROM amc_app;

-- Integridad referencial para nuevas escrituras sin rechazar datos heredados.
-- VALIDATE se ejecutará después de revisar cualquier fila histórica huérfana.
ALTER TABLE lineas_factura
    ADD CONSTRAINT lineas_factura_cabecera_fk
    FOREIGN KEY (factura_id, empresa_id) REFERENCES facturas (id, empresa_id)
    NOT VALID;

ALTER TABLE lineas_cotizacion
    ADD CONSTRAINT lineas_cotizacion_cabecera_fk
    FOREIGN KEY (cotizacion_id, empresa_id) REFERENCES cotizaciones (id, empresa_id)
    NOT VALID;

ALTER TABLE lineas_factura
    ADD CONSTRAINT lineas_factura_numero_unico UNIQUE (empresa_id, factura_id, numero_linea);
ALTER TABLE lineas_cotizacion
    ADD CONSTRAINT lineas_cotizacion_numero_unico UNIQUE (empresa_id, cotizacion_id, numero_linea);

-- Vista de diagnóstico previa a validar las FK. No altera ni elimina información.
CREATE OR REPLACE VIEW diagnostico_lineas_huerfanas AS
SELECT 'lineas_factura'::text AS origen, lf.empresa_id, lf.factura_id AS cabecera_id, lf.id AS linea_id
FROM lineas_factura lf
LEFT JOIN facturas f ON f.id = lf.factura_id AND f.empresa_id = lf.empresa_id
WHERE f.id IS NULL
UNION ALL
SELECT 'lineas_cotizacion'::text AS origen, lc.empresa_id, lc.cotizacion_id AS cabecera_id, lc.id AS linea_id
FROM lineas_cotizacion lc
LEFT JOIN cotizaciones c ON c.id = lc.cotizacion_id AND c.empresa_id = lc.empresa_id
WHERE c.id IS NULL;

GRANT SELECT ON diagnostico_lineas_huerfanas TO amc_app;

INSERT INTO migrations_log (filename) VALUES ('008_resiliencia_y_auditoria.sql')
ON CONFLICT (filename) DO NOTHING;

COMMIT;
