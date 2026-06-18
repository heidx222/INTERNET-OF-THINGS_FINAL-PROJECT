import pandas as pd
import numpy as np
from datetime import datetime, timedelta

# 1. Configuración de tiempo (1 semana, muestreo cada 1 minuto)
num_dias = 7
total_registros = num_dias * 24 * 60

fecha_inicio = datetime(2026, 6, 1, 0, 0)
fechas = [fecha_inicio + timedelta(minutes=i) for i in range(total_registros)]

# 2. Generación de datos NORMALES usando tus datos reales de la Muestra N°4
np.random.seed(42) # Replicabilidad

# CE basada en tus 360 uS/cm reales con pequeña variación natural
conductividad = np.random.normal(loc=360.0, scale=15.0, size=total_registros)

# pH basado en tu 7.39 real
ph = np.random.normal(loc=7.39, scale=0.1, size=total_registros)

# Nivel de agua base normal (1.20 metros)
nivel_agua = np.random.normal(loc=1.20, scale=0.03, size=total_registros)

# Temperaturas con ciclos Día/Noche (Ondas senoidales)
# Creamos un arreglo de tiempo que simule el transcurso de las 24 horas del día
horas_simuladas = np.array([f.hour + f.minute/60.0 for f in fechas])

# Temperatura ambiente: Media 21°C, oscila +/- 5°C (alcanza el pico a las 14:00 horas)
temp_ambiente = 21.0 + 5.0 * np.sin((horas_simuladas - 8) * np.pi / 12) + np.random.normal(0, 0.4, total_registros)

# Temperatura del agua: Sigue a la ambiente pero más fría y estable (Media 16.5°C, oscila +/- 1.5°C)
temp_agua = 16.5 + 1.5 * np.sin((horas_simuladas - 10) * np.pi / 12) + np.random.normal(0, 0.2, total_registros)


# 3. INYECCIÓN DE ANOMALÍAS CRÍTICAS (Para activar tu ciclo MAPE-K)
# Anomalía 1: Vertimiento industrial/agrícola (Día 3, de 10:00 a 13:00) -> CE se dispara y pH cae
# Registro aproximado: Día 3 empieza en 2880. De las 10:00 (3480) a las 13:00 (3660)
conductividad[3480:3660] += 450.0  # Sube a más de 800 uS/cm (Alerta Salinidad Alta)
ph[3480:3660] -= 1.8               # Cae a ~5.6 (Agua Ácida / Contaminada)

# Anomalía 2: Evento de escorrentía/Huayco/Incremento de caudal (Día 5, de 15:00 a 19:00)
# Registro aproximado: Día 5 de 15:00 (6660) a 19:00 (6900)
nivel_agua[6660:6900] += 1.1       # El nivel sube repentinamente a > 2.3 metros (Alerta de desborde)


# 4. Construcción del DataFrame y exportación a CSV
df = pd.DataFrame({
    'Fecha_Hora': fechas,
    'Conductividad_uS_cm': np.round(conductividad, 1),
    'pH': np.round(ph, 2),
    'Temp_Agua_C': np.round(temp_agua, 1),
    'Temp_Ambiente_C': np.round(temp_ambiente, 1),
    'Nivel_Agua_m': np.round(nivel_agua, 2)
})

df.to_csv('dataset_sintetico_chancay.csv', index=False)
print("¡Dataset sintético estructurado y guardado como 'dataset_sintetico_chancay.csv'!")