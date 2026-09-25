import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.metrics import precision_score, recall_score, f1_score
import joblib
import os
import sys

# 1. Configuración de rutas relativas dinámicas
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# Sube 2 niveles: campo -> Capa_3 -> Raíz, luego baja a Capa_2
DATASET_PATH = os.path.join(BASE_DIR, "../../Capa_2_Red/campo/dataset_sintetico_chancay.csv")

MODEL_DIR = os.path.join(BASE_DIR, "app/models")
MODEL_PATH = os.path.join(MODEL_DIR, "isolation_forest.pkl")

# Orden EXACTO de las 6 características. Debe coincidir con
# app/services/mapek_engine.py -> FEATURES. No reordenar sin actualizar ambos.
COLUMNAS_SENSORES = [
    "nivel_m",
    "temp_ambiente_c",
    "temp_agua_c",
    "tds_ppm",
    "ph",
    "turbidez_ntu",
]

# Fracción esperada de anomalías. Calibrada por barrido sobre el Gemelo Digital
# (ver README de Capa 3): 0.01 maximiza el F1 sin inundar de falsos positivos.
# Ajustable por variable de entorno IF_CONTAMINATION.
CONTAMINATION = float(os.getenv("IF_CONTAMINATION", "0.01"))


def entrenar_modelo():
    print(f"[1] Buscando Gemelo Digital en:\n    {DATASET_PATH}")
    try:
        df = pd.read_csv(DATASET_PATH)
        print("[1] ¡Dataset cargado correctamente!")
    except FileNotFoundError:
        print("\n[ERROR] No se encontró el dataset en la ruta especificada.")
        print("Asegúrate de haber generado el archivo en la Capa 2 antes de ejecutar esto:")
        print("  cd Capa_2_Red/campo && python generar_dataset_sintetico_PRO.py")
        sys.exit(1)

    X = df[COLUMNAS_SENSORES]

    print(f"[2] Entrenando Isolation Forest con {len(X)} registros y {X.shape[1]} variables...")
    print(f"    contamination = {CONTAMINATION}")
    modelo_if = IsolationForest(
        n_estimators=200,
        contamination=CONTAMINATION,
        random_state=42,
        n_jobs=-1,
    )
    modelo_if.fit(X)

    # 3. Reporte de calidad si el dataset trae etiquetas deterministas
    if "alerta" in df.columns:
        pred = modelo_if.predict(X) == -1
        real = df["alerta"].astype(bool).values
        precision = precision_score(real, pred, zero_division=0)
        recall = recall_score(real, pred, zero_division=0)
        f1 = f1_score(real, pred, zero_division=0)
        print("[3] Reporte de calidad (Isolation Forest vs. reglas determinísticas):")
        print(f"    Anomalías detectadas : {int(pred.sum())} ({100 * pred.mean():.2f}%)")
        print(f"    Anomalías reales     : {int(real.sum())} ({100 * real.mean():.2f}%)")
        print(f"    Precisión            : {precision:.3f}")
        print(f"    Recall               : {recall:.3f}")
        print(f"    F1-score             : {f1:.3f}")

    # 4. Guardar el modelo entrenado
    os.makedirs(MODEL_DIR, exist_ok=True)
    joblib.dump(modelo_if, MODEL_PATH)
    print(f"[4] ¡Éxito! Modelo exportado correctamente en:\n    {MODEL_PATH}")


if __name__ == "__main__":
    entrenar_modelo()
