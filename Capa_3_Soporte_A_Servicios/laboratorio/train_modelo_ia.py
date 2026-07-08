import pandas as pd
from sklearn.ensemble import IsolationForest
import joblib
import os

# 1. Configuración de rutas relativas dinámicas
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# Sube 2 niveles: laboratorio -> Capa_3 -> Raíz, luego baja a Capa_2
DATASET_PATH = os.path.join(BASE_DIR, "../../Capa_2_Red/laboratorio/dataset_sintetico_chancay.csv")

MODEL_DIR = os.path.join(BASE_DIR, "app/models")
MODEL_PATH = os.path.join(MODEL_DIR, "isolation_forest.pkl")

def entrenar_modelo():
    print(f"[1] Buscando Gemelo Digital en:\n    {DATASET_PATH}")
    try:
        df = pd.read_csv(DATASET_PATH)
        print("[1] ¡Dataset cargado correctamente!")
    except FileNotFoundError:
        print(f"\n[ERROR] No se encontró el dataset en la ruta especificada.")
        print("Asegúrate de haber generado el archivo en la Capa 2 antes de ejecutar esto.")
        return

    # 2. Selección de las 6 características (Sensores)
    columnas_sensores = [
        "nivel_m", 
        "temp_ambiente_c", 
        "temp_agua_c", 
        "tds_ppm", 
        "ph", 
        "turbidez_ntu"
    ]
    
    X = df[columnas_sensores]
    
    print(f"[2] Entrenando Isolation Forest con {len(X)} registros y 6 variables...")
    # contamination = 0.05 asume que el 5% de los datos históricos son anomalías
    modelo_if = IsolationForest(n_estimators=100, contamination=0.05, random_state=42)
    modelo_if.fit(X)

    # 3. Guardar el modelo entrenado
    os.makedirs(MODEL_DIR, exist_ok=True)
    joblib.dump(modelo_if, MODEL_PATH)
    
    print(f"[3] ¡Éxito! Modelo exportado correctamente en:\n    {MODEL_PATH}")

if __name__ == "__main__":
    entrenar_modelo()