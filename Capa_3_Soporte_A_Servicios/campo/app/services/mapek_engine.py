# =================================================================
# PROYECTO: Sistema IoT Autónomo - Cuenca Chancay-Huaral (Yaku Qhawaq)
# ARCHIVO:  app/services/mapek_engine.py  (Capa 3 - Motor IA + MAPE-K)
# -----------------------------------------------------------------
# Implementa el bucle de computación autónoma MAPE-K:
#   MONITOR   -> main.mqtt_listener()
#   ANALYZE   -> MapekEngine.analyze()          (Isolation Forest)
#   PLAN      -> MapekEngine.evaluate_mapek_state()
#   EXECUTE   -> main.procesar_lectura()
#   KNOWLEDGE -> main.guardar_en_bd()
# =================================================================

import os
from typing import Tuple

import joblib
import pandas as pd

from app.schemas import SensorData

MODEL_PATH = os.path.join(os.path.dirname(__file__), "..", "models", "isolation_forest.pkl")

# Orden EXACTO de características usado en el entrenamiento
# (ver train_modelo_ia.py -> columnas_sensores). No reordenar.
FEATURES = [
    "nivel_m",
    "temp_ambiente_c",
    "temp_agua_c",
    "tds_ppm",
    "ph",
    "turbidez_ntu",
]

# Umbrales operacionales (alineados con Capa 1 firmware y Capa 4 constantes)
TDS_UMBRAL_ALTO = 500.0
NIVEL_UMBRAL_ALTO = 0.40   # m (inundación)
NIVEL_UMBRAL_DESBORDE = 3.50  # m (desborde)
PH_MIN, PH_MAX = 6.5, 8.5


class MapekEngine:
    def __init__(self):
        self.model = None
        self.load_model()

    def load_model(self):
        """Carga el modelo Isolation Forest pre-entrenado (si existe)."""
        if os.path.exists(MODEL_PATH):
            try:
                self.model = joblib.load(MODEL_PATH)
                print("[IA] Modelo Isolation Forest cargado correctamente.")
            except Exception as e:
                print(f"[IA-ERROR] Error al cargar el modelo: {e}")
                self.model = None
        else:
            print("[IA-WARN] No se encontró isolation_forest.pkl. Evaluación únicamente por reglas determinísticas.")

    def _features_df(self, data: SensorData) -> pd.DataFrame:
        return pd.DataFrame({nombre: [getattr(data, nombre)] for nombre in FEATURES})

    def analyze(self, data: SensorData) -> bool:
        """
        Fase ANALYZE: True si Isolation Forest clasifica la lectura multivariable
        como anomalía (predicción == -1). Si no hay modelo, delega en las reglas.
        """
        if self.model is None:
            return False

        features_df = self._features_df(data)
        try:
            prediccion = self.model.predict(features_df)
            return bool(prediccion[0] == -1)
        except Exception as e:
            print(f"[IA-WARN] Fallo en la inferencia Isolation Forest: {e}")
            return False

    def analyze_con_score(self, data: SensorData) -> Tuple[bool, float]:
        """Fase ANALYZE extendida para diagnósticos síncronos HTTP de la Capa 4."""
        if self.model is None:
            return False, None

        features_df = self._features_df(data)
        try:
            prediccion = self.model.predict(features_df)
            es_anomalia = bool(prediccion[0] == -1)
            score = float(self.model.decision_function(features_df)[0])
            return es_anomalia, score
        except Exception as e:
            print(f"[IA-WARN] Fallo en el diagnóstico con score: {e}")
            return False, None

    def evaluate_mapek_state(self, data: SensorData, es_anomalia_ia: bool) -> Tuple[int, bool]:
        """
        Fase PLAN: clasifica el estado MAPE-K combinando reglas determinísticas
        (físico-química del agua) con el veredicto de la IA multivariable.

        0: Normal | 1: Contaminación | 2: Inundación | 3: Crítico (Doble Falla)

        NOTA DE PARIDAD (Capa 1 <-> Capa 2 <-> Capa 3):
        las reglas determinísticas de calidad (TDS/pH) y de nivel (inundación/
        desborde) son EXACTAMENTE las mismas que usa el generador sintético
        (Capa 2) y el firmware ESP32 (Capa 1), de modo que los estados MAPE-K
        sean coherentes en todo el pipeline. La turbidez se usa como variable
        de entrada de la IA (multivariable), no como umbral duro. La detección
        de la IA se incorpora como categoría de contaminación SOLO cuando las
        reglas determinísticas no disparan (no escala artificialmente un evento
        de inundación ya clasificado).
        """
        es_contaminacion = data.tds_ppm > TDS_UMBRAL_ALTO or data.ph < PH_MIN or data.ph > PH_MAX
        es_inundacion = data.nivel_m < NIVEL_UMBRAL_ALTO or data.nivel_m > NIVEL_UMBRAL_DESBORDE

        if es_contaminacion and es_inundacion:
            estado_mapek = 3
        elif es_inundacion:
            estado_mapek = 2
        elif es_contaminacion:
            estado_mapek = 1
        elif es_anomalia_ia:
            estado_mapek = 1
        else:
            estado_mapek = 0

        alerta = estado_mapek > 0
        return estado_mapek, alerta
