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

-- Insertar el nodo físico simulado - CAPA 1 (Contraseña hasheada con bcrypt)
-- Contraseña en texto plano: nodoChancay01
INSERT INTO test_user (username, password_hash) VALUES (
    'nodo_chancay_01', 
    '$2a$12$uoVewhlsaDW/p/ff3bq5f.lQ1dvk2eaU9x616cRjPxLBkuyr60.W.'
);
-- Permiso de ESCRITURA (rw = 2)
INSERT INTO test_acl (username, topic, rw) VALUES (
    'nodo_chancay_01', 
    'chancay/cuenca/tiempo_real/nodo_chancay_01', 
    2
);
-- Permiso de LECTURA (rw = 1)
INSERT INTO test_acl (username, topic, rw) VALUES (
    'nodo_chancay_01', 
    'chancay/actuadores/alerta/nodo_chancay_01', 
    1
);

-- Insertar credenciales para el script de Python - CAPA 2 (Simulador Histórico)
-- Contraseña en texto plano: simulador123
INSERT INTO test_user (username, password_hash) VALUES (
    'simulador_python', 
    '$2b$12$/OszdszYJR5HrQZs7TFMue2kjGvZHM2hPKzFrubPG2pZjGNgCNAq.' 
);
-- Permiso de SOLO ESCRITURA (rw = 2) en el tópico histórico
INSERT INTO test_acl (username, topic, rw) VALUES (
    'simulador_python', 
    'chancay/cuenca/historico', 
    2
);

-- Motor de IA / backend FastAPI - CAPA 3
-- Contraseña en texto plano: backendChancay2026
INSERT INTO test_user (username, password_hash) VALUES (
    'backend_central',
    '$2b$12$vZb6FfL25HjeDJMhW50H5uuM1URiUWxhPPoupYRXUaFN7kmcs6xXy'
);
INSERT INTO test_acl (username, topic, rw) VALUES ('backend_central', 'chancay/cuenca/#', 1);
INSERT INTO test_acl (username, topic, rw) VALUES ('backend_central', 'chancay/actuadores/alerta/#', 2);

-- Dashboard Node-RED - CAPA 4
-- Contraseña en texto plano: dashboardChancay2026
INSERT INTO test_user (username, password_hash) VALUES (
    'dashboard_nodered',
    '$2b$12$/G59eS7pMnKWu8nz/W1rQuy0sJSsyR.TZTbmUadR87opXres6UBQe'
);
INSERT INTO test_acl (username, topic, rw) VALUES ('dashboard_nodered', 'chancay/cuenca/#', 1);
INSERT INTO test_acl (username, topic, rw) VALUES ('dashboard_nodered', 'chancay/actuadores/alerta/#', 1);
-- [CAPA 4 - TELECONTROL] Permiso de ESCRITURA (rw = 2) para que el Panel de
-- Telecontrol de "Yaku Qhawaq" pueda publicar comandos MQTT inversos
-- (activar/desactivar Sirena o Compuerta) hacia los actuadores simulados.
INSERT INTO test_acl (username, topic, rw) VALUES ('dashboard_nodered', 'chancay/actuadores/comando/#', 2);

-- Tabla para almacenar el histórico de sensores (Conocimiento - K), usada por Capa 3
CREATE TABLE IF NOT EXISTS telemetria_cuenca (
    id SERIAL PRIMARY KEY,
    nodo_id VARCHAR(50) NOT NULL,
    timestamp_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    nivel_m REAL,
    temp_ambiente_c REAL,
    temp_agua_c REAL,
    tds_ppm REAL,
    ph REAL,
    turbidez_ntu REAL,
    es_anomalia BOOLEAN NOT NULL
);

-- Índice para acelerar los filtros por fecha/nodo del endpoint
-- GET /telemetria/historico (Capa 3), consultado por la Sección de
-- Estadísticas Históricas del Frontend "Yaku Qhawaq".
CREATE INDEX IF NOT EXISTS idx_telemetria_cuenca_ts ON telemetria_cuenca (timestamp_registro DESC);
CREATE INDEX IF NOT EXISTS idx_telemetria_cuenca_nodo ON telemetria_cuenca (nodo_id);

-- =================================================================
-- [CAPA 4 - TELECONTROL] Bitácora persistente de auditoría de
-- comandos inversos (Anulación Manual del operador).
--
-- Justificación de ingeniería: El backend Node-RED (Tab 04 -
-- Telecontrol) ya mantiene un historial en el Contexto Global
-- (`telecontrol_historial`, respaldado en disco vía `contextStorage`
-- en `settings.js`) para servir la Bitácora de Auditoría del
-- Frontend con baja latencia. Sin embargo, para garantizar
-- trazabilidad forense de largo plazo e independiente del ciclo de
-- vida del contenedor `app_nodered_chancay`, el microservicio
-- `motor_ia_chancay` (Capa 3) persiste de forma asíncrona y
-- redundante cada comando validado en esta tabla relacional
-- (ver `POST /telecontrol/historial` en app/main.py).
-- =================================================================
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

-- NOTA DE PERMISOS: El microservicio `motor_ia_chancay` (Capa 3) se
-- conecta a PostgreSQL con el rol `adminChancayHuaral` (superusuario
-- de la base `chancayhuaral_auth`, ver docker-compose.yml -> db_postgres),
-- por lo que hereda automáticamente privilegios CRUD completos sobre
-- `telecontrol_historial` y `telemetria_cuenca` sin necesidad de
-- GRANTs adicionales. Esta nota documenta explícitamente dicha
-- decisión de diseño para trazabilidad de auditoría de seguridad.
