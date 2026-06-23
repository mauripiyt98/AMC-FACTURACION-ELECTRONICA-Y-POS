-- ══════════════════════════════════════════════════════════════════════════════
-- MIGRACIÓN 001 — Esquema base multi-tenant
-- AMC Facturación Electrónica DIAN
-- Target  : PostgreSQL 15+
-- Autor   : AMC Multi-Tenant Migration
-- Versión : 1.0.0
-- ══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Extensiones requeridas
-- ─────────────────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pg_trgm";    -- Búsqueda trigram full-text

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. TABLA: empresas  (el "tenant root" — cada fila es un tenant)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS empresas (
    id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    razon_social        VARCHAR(200) NOT NULL,
    nit                 VARCHAR(20)  NOT NULL,
    digito_verificacion SMALLINT,
    regimen_fiscal      VARCHAR(80)  NOT NULL DEFAULT 'SIMPLIFICADO',
    tipo_persona        VARCHAR(20)  NOT NULL DEFAULT 'NATURAL',    -- NATURAL | JURIDICA
    direccion           VARCHAR(300),
    ciudad              VARCHAR(100),
    departamento        VARCHAR(100),
    telefono            VARCHAR(30),
    email               VARCHAR(150),
    logo_url            TEXT,
    -- Resolución DIAN para facturación electrónica
    resolucion_numero   VARCHAR(30),
    resolucion_prefijo  VARCHAR(10)   NOT NULL DEFAULT 'FE',
    resolucion_desde    INTEGER       NOT NULL DEFAULT 1,
    resolucion_hasta    INTEGER       NOT NULL DEFAULT 1000,
    resolucion_vigencia DATE,
    consecutivo_actual  INTEGER       NOT NULL DEFAULT 0,           -- último consecutivo usado
    -- Control del tenant
    activa              BOOLEAN       NOT NULL DEFAULT TRUE,
    plan                VARCHAR(30)   NOT NULL DEFAULT 'BASICO',    -- BASICO | PRO | ENTERPRISE
    creado_en           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    actualizado_en      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    -- NIT único globalmente
    CONSTRAINT empresas_nit_unique UNIQUE (nit)
);

COMMENT ON TABLE  empresas IS 'Tenant root: cada empresa es un tenant independiente';
COMMENT ON COLUMN empresas.consecutivo_actual IS 'Último número de factura emitido. Actualizar con SELECT ... FOR UPDATE para evitar duplicados';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. TABLA: usuarios  (vinculados 1:N a empresas — un usuario pertenece a 1 empresa)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS usuarios (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id      UUID         NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    nombre          VARCHAR(150) NOT NULL,
    codigo          VARCHAR(20)  NOT NULL,          -- Código/cédula de acceso
    email           VARCHAR(150),
    password_hash   VARCHAR(200) NOT NULL,
    rol             VARCHAR(30)  NOT NULL DEFAULT 'OPERADOR',
    --   SUPERADMIN : acceso a panel de administración de tenants
    --   ADMIN      : gestiona su empresa y usuarios
    --   OPERADOR   : solo puede facturar, ver terceros y productos propios
    activo          BOOLEAN      NOT NULL DEFAULT TRUE,
    ultimo_acceso   TIMESTAMPTZ,
    creado_en       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    actualizado_en  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    -- El mismo código puede existir en empresas distintas, pero no dentro de la misma
    CONSTRAINT usuarios_empresa_codigo_unique UNIQUE (empresa_id, codigo)
);

COMMENT ON TABLE  usuarios IS 'Usuarios del sistema, siempre vinculados a una empresa (tenant)';
COMMENT ON COLUMN usuarios.rol IS 'SUPERADMIN | ADMIN | OPERADOR';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. TABLA: terceros  (clientes / proveedores por empresa)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS terceros (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id      UUID         NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    nombre          VARCHAR(200) NOT NULL,
    documento       VARCHAR(30)  NOT NULL,
    tipo_documento  VARCHAR(10)  NOT NULL DEFAULT 'CC',  -- CC | NIT | CE | PAS | TI
    email           VARCHAR(150),
    telefono        VARCHAR(30),
    direccion       VARCHAR(300),
    ciudad          VARCHAR(100),
    departamento    VARCHAR(100),
    activo          BOOLEAN      NOT NULL DEFAULT TRUE,
    creado_en       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    actualizado_en  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    -- Documento único por empresa (un mismo NIT puede existir en distintas empresas)
    CONSTRAINT terceros_empresa_documento_unique UNIQUE (empresa_id, documento)
);

COMMENT ON TABLE terceros IS 'Clientes y proveedores de cada empresa (tenant-scoped)';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. TABLA: productos  (catálogo de productos/servicios por empresa)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS productos (
    id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id      UUID          NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    nombre          VARCHAR(200)  NOT NULL,
    codigo          VARCHAR(50)   NOT NULL,
    tipo            VARCHAR(20)   NOT NULL DEFAULT 'PRODUCTO',   -- PRODUCTO | SERVICIO
    iva             NUMERIC(5,2)  NOT NULL DEFAULT 19.00,
    unidad_medida   VARCHAR(30)   NOT NULL DEFAULT 'UNIDAD',     -- UNIDAD | GALON | KG | etc.
    precio_base     NUMERIC(15,2),                               -- Precio sugerido (opcional)
    activo          BOOLEAN       NOT NULL DEFAULT TRUE,
    creado_en       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    actualizado_en  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    -- Código único por empresa
    CONSTRAINT productos_empresa_codigo_unique UNIQUE (empresa_id, codigo)
);

COMMENT ON TABLE productos IS 'Catálogo de productos y servicios de cada empresa (tenant-scoped)';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. TABLA: facturas  — PARTICIONADA por empresa_id (HASH, 16 particiones)
--    Permite escalar de 1.000 a 100.000 empresas sin degradación
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS facturas (
    id                  UUID          NOT NULL DEFAULT gen_random_uuid(),
    empresa_id          UUID          NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    consecutivo         INTEGER       NOT NULL,
    numero_factura      VARCHAR(30)   NOT NULL,
    cufe                VARCHAR(200),
    -- Snapshot del cliente en el momento de facturar (datos fijos aunque cambie el tercero)
    cliente_nombre      VARCHAR(200)  NOT NULL,
    cliente_documento   VARCHAR(30)   NOT NULL,
    cliente_email       VARCHAR(150),
    cliente_telefono    VARCHAR(30),
    cliente_direccion   VARCHAR(300),
    cliente_ciudad      VARCHAR(100),
    tercero_id          UUID          REFERENCES terceros(id) ON DELETE SET NULL,
    -- Snapshot de la resolución DIAN al momento de facturar
    resolucion_numero   VARCHAR(30),
    resolucion_prefijo  VARCHAR(10),
    -- Totales calculados
    total_base          NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_iva           NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_retencion     NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_factura       NUMERIC(15,2) NOT NULL DEFAULT 0,
    -- Metadatos
    medio_pago          VARCHAR(30)   NOT NULL DEFAULT 'EFECTIVO',
    observaciones       TEXT,
    estado              VARCHAR(20)   NOT NULL DEFAULT 'GUARDADA',
    --   GUARDADA | ENVIADA | ACEPTADA | RECHAZADA | ANULADA
    creado_por          UUID          REFERENCES usuarios(id) ON DELETE SET NULL,
    generado_en         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    actualizado_en      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    -- La PK debe incluir la clave de partición (empresa_id) para el particionamiento HASH
    PRIMARY KEY (id, empresa_id),
    -- Consecutivo único por empresa
    CONSTRAINT facturas_empresa_consecutivo_unique UNIQUE (empresa_id, consecutivo)
) PARTITION BY HASH (empresa_id);

COMMENT ON TABLE  facturas IS 'Facturas electrónicas particionadas por empresa_id (16 particiones HASH)';
COMMENT ON COLUMN facturas.estado IS 'GUARDADA | ENVIADA | ACEPTADA | RECHAZADA | ANULADA';

-- 16 particiones HASH — distribución uniforme para 100k+ empresas
-- Cada partición vive en el mismo tablespace. Para mayor escala, mover
-- particiones individuales a tablespaces en distintos discos/volúmenes.
CREATE TABLE IF NOT EXISTS facturas_p0  PARTITION OF facturas FOR VALUES WITH (MODULUS 16, REMAINDER 0);
CREATE TABLE IF NOT EXISTS facturas_p1  PARTITION OF facturas FOR VALUES WITH (MODULUS 16, REMAINDER 1);
CREATE TABLE IF NOT EXISTS facturas_p2  PARTITION OF facturas FOR VALUES WITH (MODULUS 16, REMAINDER 2);
CREATE TABLE IF NOT EXISTS facturas_p3  PARTITION OF facturas FOR VALUES WITH (MODULUS 16, REMAINDER 3);
CREATE TABLE IF NOT EXISTS facturas_p4  PARTITION OF facturas FOR VALUES WITH (MODULUS 16, REMAINDER 4);
CREATE TABLE IF NOT EXISTS facturas_p5  PARTITION OF facturas FOR VALUES WITH (MODULUS 16, REMAINDER 5);
CREATE TABLE IF NOT EXISTS facturas_p6  PARTITION OF facturas FOR VALUES WITH (MODULUS 16, REMAINDER 6);
CREATE TABLE IF NOT EXISTS facturas_p7  PARTITION OF facturas FOR VALUES WITH (MODULUS 16, REMAINDER 7);
CREATE TABLE IF NOT EXISTS facturas_p8  PARTITION OF facturas FOR VALUES WITH (MODULUS 16, REMAINDER 8);
CREATE TABLE IF NOT EXISTS facturas_p9  PARTITION OF facturas FOR VALUES WITH (MODULUS 16, REMAINDER 9);
CREATE TABLE IF NOT EXISTS facturas_p10 PARTITION OF facturas FOR VALUES WITH (MODULUS 16, REMAINDER 10);
CREATE TABLE IF NOT EXISTS facturas_p11 PARTITION OF facturas FOR VALUES WITH (MODULUS 16, REMAINDER 11);
CREATE TABLE IF NOT EXISTS facturas_p12 PARTITION OF facturas FOR VALUES WITH (MODULUS 16, REMAINDER 12);
CREATE TABLE IF NOT EXISTS facturas_p13 PARTITION OF facturas FOR VALUES WITH (MODULUS 16, REMAINDER 13);
CREATE TABLE IF NOT EXISTS facturas_p14 PARTITION OF facturas FOR VALUES WITH (MODULUS 16, REMAINDER 14);
CREATE TABLE IF NOT EXISTS facturas_p15 PARTITION OF facturas FOR VALUES WITH (MODULUS 16, REMAINDER 15);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. TABLA: lineas_factura  (detalle de cada factura)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lineas_factura (
    id               UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id       UUID           NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    factura_id       UUID           NOT NULL,   -- Sin FK directa (tabla particionada)
    numero_linea     SMALLINT       NOT NULL,
    producto_id      UUID           REFERENCES productos(id) ON DELETE SET NULL,
    -- Snapshot del producto al momento de facturar
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

COMMENT ON TABLE  lineas_factura IS 'Líneas de detalle de cada factura (tenant-scoped)';
COMMENT ON COLUMN lineas_factura.factura_id IS 'Referencia a facturas.id — sin FK directa por particionamiento';

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. TABLA: sesiones_jwt  (para revocación de tokens y auditoría)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sesiones_jwt (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id  UUID         NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    empresa_id  UUID         NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    jti         VARCHAR(100) NOT NULL,        -- JWT ID único (uuid dentro del token)
    expira_en   TIMESTAMPTZ  NOT NULL,
    revocado    BOOLEAN      NOT NULL DEFAULT FALSE,
    ip_origen   INET,
    user_agent  TEXT,
    creado_en   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT sesiones_jwt_jti_unique UNIQUE (jti)
);

COMMENT ON TABLE sesiones_jwt IS 'Registro de tokens JWT emitidos para revocación y auditoría';

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. TABLA: migrations_log  (control de migraciones ejecutadas)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS migrations_log (
    id           SERIAL       PRIMARY KEY,
    filename     VARCHAR(100) NOT NULL UNIQUE,
    ejecutado_en TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE migrations_log IS 'Registro de migraciones SQL ejecutadas';

-- Marcar esta migración como ejecutada
INSERT INTO migrations_log (filename) VALUES ('001_schema_base.sql')
ON CONFLICT (filename) DO NOTHING;
