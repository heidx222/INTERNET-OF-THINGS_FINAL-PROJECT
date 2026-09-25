-- =================================================================
-- PROYECTO: Sistema IoT Autónomo - Cuenca Chancay-Huaral (Yaku Qhawaq)
-- ARCHIVO:  init.sql  (Capa 2 - Red / Base de autenticación MQTT)
-- ENFOQUE:  Metodología STRIDE + Mosquitto Go Auth (PostgreSQL)
-- -----------------------------------------------------------------
-- Este script inicializa la base de datos que consume el plugin
-- Mosquitto Go Auth (tablas `test_user` y `test_acl`) y define el
-- esquema relacional de telemetría y auditoría usado por la Capa 3.
--
-- Los hashes Bcrypt corresponden a las credenciales de desarrollo
-- (ver .env.example). En producción DEBEN rotarse.
-- =================================================================

-- -----------------------------------------------------------------
-- 1. TABLAS DE IDENTIDAD Y CONTROL DE ACCESO (Mosquitto Go Auth)
-- -----------------------------------------------------------------
CREATE TABLE test_user (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(200) NOT NULL
);

CREATE TABLE test_acl (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) NOT NULL,
    topic VARCHAR(200) NOT NULL,
    rw INT NOT NULL -- 1: Read, 2: Write, 3: Read/Write
);

-- -----------------------------------------------------------------
-- 2. USUARIOS Y ACL (mismo contrato que la Capa 1 / Capa 3 / Capa 4)
-- -----------------------------------------------------------------

-- [CAPA 1] Nodo físico ESP32 (contraseña en claro: nodoChancay01)
INSERT INTO test_user (username, password_hash) VALUES (
    'nodo_chancay_01',
    '$2b$12$Y7fP05RGu0CNKWUyIp4wX.NxUwbLVNNLXXLM8XvQLYA.64ylLIJWm'
);
-- ESCRITURA de telemetría (rw = 2)
INSERT INTO test_acl (username, topic, rw) VALUES (
    'nodo_chancay_01', 'chancay/cuenca/tiempo_real/nodo_chancay_01', 2
);
-- LECTURA de comandos de alerta (rw = 1)
INSERT INTO test_acl (username, topic, rw) VALUES (
    'nodo_chancay_01', 'chancay/actuadores/alerta/nodo_chancay_01', 1
);

-- [CAPA 2] Simulador histórico Python (contraseña en claro: simulador123)
INSERT INTO test_user (username, password_hash) VALUES (
    'simulador_python',
    '$2b$12$yE2Mo9nJ0oNwBe8VrgpOHelCnJKRIHwPt4lzAsblj.Sy5vLsJdGA.'
);
-- SOLO ESCRITURA (rw = 2) al tópico histórico de la cuenca
INSERT INTO test_acl (username, topic, rw) VALUES (
    'simulador_python', 'chancay/cuenca/historico', 2
);

-- [CAPA 3] Motor de IA / backend FastAPI (contraseña en claro: backendChancay2026)
INSERT INTO test_user (username, password_hash) VALUES (
    'backend_central',
    '$2b$12$IyYoVRblGxMzQ0YneDEQzOH4T1VJMZucgQx/T.9zG75CmhvjjFkXm'
);
INSERT INTO test_acl (username, topic, rw) VALUES ('backend_central', 'chancay/cuenca/#', 1);
INSERT INTO test_acl (username, topic, rw) VALUES ('backend_central', 'chancay/actuadores/alerta/#', 2);
INSERT INTO test_acl (username, topic, rw) VALUES ('backend_central', 'chancay/actuadores/comando/#', 2);

-- [CAPA 4] Dashboard React/operador (contraseña en claro: dashboardChancay2026)
INSERT INTO test_user (username, password_hash) VALUES (
    'dashboard_nodered',
    '$2b$12$6e2eHNnYnb7H6PuIJ/B47epkd/TnHhVj/4CuY8za/se87sfZkEZgi'
);
INSERT INTO test_acl (username, topic, rw) VALUES ('dashboard_nodered', 'chancay/cuenca/#', 1);
INSERT INTO test_acl (username, topic, rw) VALUES ('dashboard_nodered', 'chancay/actuadores/alerta/#', 1);
-- Escritura de comandos inversos del Panel de Telecontrol (Capa 4 -> Capa 1)
INSERT INTO test_acl (username, topic, rw) VALUES ('dashboard_nodered', 'chancay/actuadores/comando/#', 2);

-- -----------------------------------------------------------------
-- 3. MODELO DE DATOS DE LA CUENCA (consumido por la Capa 3)
-- -----------------------------------------------------------------

-- Conocimiento (K) del lazo MAPE-K: histórico de telemetría.
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

-- Bitácora de auditoría de telecontrol (Anulación Manual del operador).
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

-- -----------------------------------------------------------------
-- NOTA DE PERMISOS: el microservicio `motor_ia_chancay` (Capa 3) se
-- conecta a PostgreSQL con el rol `adminChancayHuaral` (superusuario),
-- por lo que hereda privilegios CRUD completos sobre las tablas.
-- -----------------------------------------------------------------
