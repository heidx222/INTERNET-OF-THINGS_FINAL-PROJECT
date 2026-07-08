-- Tabla para almacenar el histórico de sensores (Conocimiento - K)
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