# =================================================================
# PROYECTO: Sistema IoT Autónomo - Cuenca Chancay-Huaral (Yaku Qhawaq)
# ARCHIVO:  app/db_schema.py  (Capa 3 - Autoprovisión de esquema)
# -----------------------------------------------------------------
# En un despliegue gestionado (Railway, Render, Fly.io…) el contenedor
# de PostgreSQL arranca SIN las tablas de la aplicación: el script
# `init.sql` de la Capa 2 sólo se ejecuta la PRIMERA vez que se crea el
# volumen. Por eso el microservicio aplica este esquema idempotente al
# arrancar, garantizando que `telemetria_cuenca` y `telecontrol_historial`
# existan siempre antes de procesar telemetría.
#
# Es seguro ejecutarlo en cada arranque: todo usa IF NOT EXISTS.
# =================================================================

SCHEMA_SQL = """
-- Identidad para Mosquitto Go Auth (idempotente; sólo crea si no existe)
CREATE TABLE IF NOT EXISTS test_user (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(200) NOT NULL
);

CREATE TABLE IF NOT EXISTS test_acl (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) NOT NULL,
    topic VARCHAR(200) NOT NULL,
    rw INT NOT NULL
);

-- Conocimiento (K) del lazo MAPE-K: histórico de telemetría
CREATE TABLE IF NOT EXISTS telemetria_cuenca (
    id SERIAL PRIMARY KEY,
    node_id VARCHAR(50) NOT NULL,
    origen VARCHAR(30) DEFAULT 'realtime',
    timestamp_ms BIGINT,
    nivel_m DOUBLE PRECISION,
    temp_ambiente_c DOUBLE PRECISION,
    temp_agua_c DOUBLE PRECISION,
    tds_ppm DOUBLE PRECISION,
    ph DOUBLE PRECISION,
    turbidez_ntu DOUBLE PRECISION,
    alerta BOOLEAN DEFAULT FALSE,
    estado_mapek INTEGER DEFAULT 0,
    es_anomalia BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_telemetria_cuenca_created ON telemetria_cuenca (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_telemetria_cuenca_node ON telemetria_cuenca (node_id);

-- Bitácora de auditoría del Panel de Telecontrol (Capa 4 -> Capa 1)
CREATE TABLE IF NOT EXISTS telecontrol_historial (
    id SERIAL PRIMARY KEY,
    comando_id VARCHAR(50) NOT NULL UNIQUE,
    nodo_id VARCHAR(50) NOT NULL,
    actuador VARCHAR(20) NOT NULL CHECK (actuador IN ('sirena', 'compuerta')),
    accion VARCHAR(20) NOT NULL CHECK (accion IN ('activar', 'desactivar')),
    operador VARCHAR(100) NOT NULL DEFAULT 'operador_no_identificado',
    origen VARCHAR(100) NOT NULL DEFAULT 'panel_telecontrol_manual',
    ts_comando BIGINT NOT NULL,
    timestamp_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_telecontrol_historial_ts ON telecontrol_historial (timestamp_registro DESC);
CREATE INDEX IF NOT EXISTS idx_telecontrol_historial_nodo ON telecontrol_historial (nodo_id);
"""


async def ensure_schema(pool) -> None:
    """Aplica el esquema idempotente de la cuenca sobre el pool dado."""
    async with pool.acquire() as connection:
        await connection.execute(SCHEMA_SQL)
    print("[DB] Esquema de la cuenca verificado/creado correctamente.")
