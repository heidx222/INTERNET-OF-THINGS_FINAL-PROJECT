# ================================================================================================
# PROYECTO: Sistema IoT Autónomo - Cuenca Chancay-Huaral
# ARCHIVO: generar_dataset_sintetico_PRO.py (Capa 2 - Analítica)
# ENFOQUE: Gemelo Digital de Datos - Eliminación de Redundancia y Desacoples - Alineado a Pydantic
# ================================================================================================

import pandas as pd
import numpy as np
from datetime import datetime, timedelta

# 1. Configuración de tiempo (30 días, muestreo cada 1 minuto)
num_dias = 30
total_registros = num_dias * 24 * 60

fecha_inicio = datetime(2026, 6, 1, 0, 0)
fechas = [fecha_inicio + timedelta(minutes=i) for i in range(total_registros)]

# 2. Generación de datos FÍSICOS NORMALES (Alineados con el hardware)
np.random.seed(42) 

# Conductividad eléctrica (tds_ppm)
tds_ppm = np.random.normal(loc=360.0, scale=15.0, size=total_registros)

# pH del agua
ph = np.random.normal(loc=7.39, scale=0.2, size=total_registros)

# Turbidez en NTU (Se dispara cuando hay huaycos)
turbidez_ntu = np.random.normal(loc=15.0, scale=5.0, size=total_registros)

# Nivel de agua en METROS (Distancia normal desde el puente al río: 1.20 metros)
nivel_m = np.random.normal(loc=1.20, scale=0.03, size=total_registros)

# Ciclos Térmicos Senoidales (Día/Noche)
horas_simuladas = np.array([f.hour + f.minute/60.0 for f in fechas])
temp_ambiente_c = 21.0 + 5.0 * np.sin((horas_simuladas - 8) * np.pi / 12) + np.random.normal(0, 0.4, total_registros)
temp_agua_c = 16.5 + 1.5 * np.sin((horas_simuladas - 10) * np.pi / 12) + np.random.normal(0, 0.2, total_registros)


# 3. INYECCIÓN DE ANOMALÍAS CRÍTICAS DE CAMPO
# Anomalía 1: Vertimiento químico (Día 3, de 10:00 a 13:00)
tds_ppm[3480:3660] += 450.0  # Sube a > 800 uS/cm

# Anomalía 2: Escorrentía / Huayco (Día 5, de 15:00 a 19:00)
# El nivel del río sube, por lo que la distancia ultrasónica SE REDUCE bruscamente en 0.90m
nivel_m[6660:6900] += 0.90 
# Si hay un huayco, la turbidez se dispara brutalmente a > 500 NTU
turbidez_ntu[6660:6900] += 600.0

# 4. GEMELO LÓGICO: Determinación determinística de alertas (Cero Redundancia)
# Replicamos de forma exacta los umbrales e histéresis de verificarAlertas() del ESP32
# Supongamos los umbrales de tu firmware (Ajustar si tus constantes son diferentes):
TDS_UMBRAL_ALTO = 700.0
NIVEL_UMBRAL_ALTO = 0.40  # Recuerda que en ultrasonido, menor distancia al sensor significa que el río subió.
# Para la simulación simplificada usaremos condiciones lógicas directas sobre los vectores:

alerta = []
tipo_emergencia = []

for i in range(total_registros):
    # Condición de Inundación (Prioridad 2):
    # Lógica ultrasónica corregida: Peligro cuando la distancia es MENOR al umbral
    if nivel_m[i] < NIVEL_UMBRAL_ALTO_METROS:
        alerta.append("true")
        tipo_emergencia.append(2)
    # Condición de Contaminación (Prioridad 1): TDS alto
    elif tds_ppm[i] > TDS_UMBRAL_ALTO:
        alerta.append("true")
        tipo_emergencia.append(1)
    # Estado Óptimo (Prioridad 0)
    else:
        alerta.append("false")
        tipo_emergencia.append(0)


# 5. CONSTRUCCIÓN DEL DATAFRAME (Espejo exacto del JSON del ESP32)
df = pd.DataFrame({
    'node_id': "nodo_chancay_01",
    'timestamp_ms': np.arange(total_registros) * 60000, 
    'tds_ppm': np.round(tds_ppm, 1),
    'ph': np.round(ph, 2),              
    'turbidez_ntu': np.round(turbidez_ntu, 1),  
    'temp_agua_c': np.round(temp_agua_c, 1),
    'temp_ambiente_c': np.round(temp_ambiente_c, 1),
    'nivel_m': np.round(nivel_m, 2),
    'alerta': alerta,
    'estado_mapek': tipo_emergencia
})

# Exportación limpia
csv_filename = "dataset_sintetico_chancay.csv"
df.to_csv(csv_filename, index=False, encoding='utf-8')

print(f"[ÉXITO] Gemelo digital de datos generado.")
print(f"[FORMATO] Columnas actuales: {list(df.columns)}")
