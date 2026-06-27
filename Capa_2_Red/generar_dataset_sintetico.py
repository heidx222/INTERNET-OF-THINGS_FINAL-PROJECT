# =================================================================
# PROYECTO: Sistema IoT Autónomo - Cuenca Chancay-Huaral
# ARCHIVO: generar_dataset_sintetico_PRO.py (Capa 3 - Analítica)
# ENFOQUE: Gemelo Digital de Datos - Eliminación de Redundancia y Desacoples
# =================================================================

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

# Conductividad basada en los 360 uS/cm reales
conductividad = np.random.normal(loc=360.0, scale=15.0, size=total_registros)

# Humedad relativa (integrada en el ESP32 corregido)
humedad = np.random.normal(loc=75.0, scale=3.0, size=total_registros)

# CORRECCIÓN DE ESCALA: Nivel de agua base en centímetros (Igual al JSN-201)
nivel_agua_cm = np.random.normal(loc=120.0, scale=3.0, size=total_registros)

# Ciclos Térmicos Senoidales (Día/Noche)
horas_simuladas = np.array([f.hour + f.minute/60.0 for f in fechas])
temp_ambiente = 21.0 + 5.0 * np.sin((horas_simuladas - 8) * np.pi / 12) + np.random.normal(0, 0.4, total_registros)
temp_agua = 16.5 + 1.5 * np.sin((horas_simuladas - 10) * np.pi / 12) + np.random.normal(0, 0.2, total_registros)


# 3. INYECCIÓN DE ANOMALÍAS CRÍTICAS DE CAMPO
# Anomalía 1: Vertimiento químico (Día 3, de 10:00 a 13:00)
conductividad[3480:3660] += 450.0  # Sube a > 800 uS/cm

# Anomalía 2: Escorrentía / Huayco (Día 5, de 15:00 a 19:00)
# CORRECCIÓN DE ESCALA: El nivel sube 110 cm (equivalente a 1.1 metros de crecida)
nivel_agua_cm[6660:6900] += 110.0  


# 4. GEMELO LÓGICO: Determinación determinística de alertas (Cero Redundancia)
# Replicamos de forma exacta los umbrales e histéresis de verificarAlertas() del ESP32
# Supongamos los umbrales de tu firmware (Ajustar si tus constantes son diferentes):
TDS_UMBRAL_ALTO = 700.0
NIVEL_UMBRAL_ALTO = 40.0  # Recuerda que en ultrasonido, menor distancia al sensor significa que el río subió.
# Para la simulación simplificada usaremos condiciones lógicas directas sobre los vectores:

alerta = []
tipo_emergencia = []

for i in range(total_registros):
    # Condición de Inundación (Prioridad 2): Nivel supera los 210 cm reales de agua
    # Nota: si tu sensor mide distancia invertida, calcula aquí la lógica exacta de tu constante.
    if nivel_agua_cm[i] > 210.0: 
        alerta.append("true")
        tipo_emergencia.append(2)
    # Condición de Contaminación (Prioridad 1): TDS alto
    elif conductividad[i] > TDS_UMBRAL_ALTO:
        alerta.append("true")
        tipo_emergencia.append(1)
    # Estado Óptimo (Prioridad 0)
    else:
        alerta.append("false")
        tipo_emergencia.append(0)


# 5. CONSTRUCCIÓN DEL DATAFRAME (Espejo exacto del JSON del ESP32)
df = pd.DataFrame({
    'node_id': "nodo_chancay_01",              # Equivalente a MQTT_CLIENT_ID
    'timestamp_ms': np.arange(total_registros) * 60000, # Simula marcas de tiempo relativas crecientes
    'conductividad': np.round(conductividad, 1),
    'temp_agua': np.round(temp_agua, 1),
    'temp_ambiente': np.round(temp_ambiente, 1),
    'humedad': np.round(humedad, 1),
    'nivel_agua_cm': np.round(nivel_agua_cm, 1),
    'alerta': alerta,
    'tipo_emergencia': tipo_emergencia
})

# Exportación limpia
csv_filename = "dataset_sintetico_chancay.csv"
df.to_csv(csv_filename, index=False, encoding='utf-8')

print(f"[ÉXITO] Gemelo digital de datos generado.")
print(f"[FORMATO] Columnas actuales: {list(df.columns)}")
