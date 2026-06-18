# entrenar_ia.py
import pandas as pd
from sklearn.ensemble import IsolationForest
import joblib

# 1. Cargar el dataset sintético (Línea base con anomalías inyectadas)
df = pd.read_csv("../Capa_2_Red/dataset_sintetico_chancay.csv")

# Seleccionamos solo las variables numéricas de tus 5 sensores
caracteristicas = ['Conductividad_uS_cm', 'pH', 'Temp_Agua_C', 'Temp_Ambiente_C', 'Nivel_Agua_m']
X = df[caracteristicas]

# 2. Configurar Isolation Forest
# contamination=0.05 significa que esperamos aprox un 5% de anomalías en el histórico
modelo = IsolationForest(contamination=0.05, random_state=42)

# 3. Entrenar el modelo (Aprende el comportamiento normal del Río Chancay)
modelo.fit(X)

# 4. Guardar el cerebro de IA serializado
joblib.dump(modelo, "modelo_isolation_forest.pkl")
print("¡Modelo IA 'modelo_isolation_forest.pkl' entrenado y exportado exitosamente!")