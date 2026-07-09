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

-- Insertar el nodo físico simulado (Contraseña hasheada con bcrypt)
-- Contraseña en texto plano: nodoChancay01
INSERT INTO test_user (username, password_hash) VALUES (
    'nodo_chancay_01', 
    '$2a$12$uoVewhlsaDW/p/ff3bq5f.lQ1dvk2eaU9x616cRjPxLBkuyr60.W.'
);
-- Permiso de SOLO ESCRITURA (rw = 2)
INSERT INTO test_acl (username, topic, rw) VALUES (
    'nodo_chancay_01', 
    'chancay/cuenca/tiempo_real/nodo_chancay_01', 
    2
);

-- Insertar credenciales para el script de Python (Simulador Histórico)
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
