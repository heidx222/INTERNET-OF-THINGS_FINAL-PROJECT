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
