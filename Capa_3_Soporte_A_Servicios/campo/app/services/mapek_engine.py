import os
import joblib
import pandas as pd
from app.schemas import SensorData

MODEL_PATH = os.path.join(os.path.dirname(__file__), "../models/isolation_forest.pkl")

class MapekEngine:
    def __init__(self):
        self.model = None
        self.load_model()

    def load_model(self):
        """Carga el modelo Isolation Forest pre-entrenado."""
        if os.path.exists(MODEL_PATH):
            try:
                self.model = joblib.load(MODEL_PATH)
                print("[IA] Modelo Isolation Forest cargado correctamente.")
            except Exception as e:
                print(f"[IA-ERROR] Error al cargar el modelo: {e}")
        else:
            print("[IA-WARN] No se encontró isolation_forest.pkl. Evaluación únicamente por reglas determinísticas.")

    def analyze(self, data: SensorData) -> bool:
        """
        Fase ANALYZE: Retorna True si detecta anomalía multivariable vía IA.
        """
        if self.model is None:
            return False

        datos_para_ia = {
            "nivel_m": [data.nivel_m],
            "temp_ambiente_c": [data.temp_ambiente_c],
            "temp_agua_c": [data.temp_agua_c],
            "tds_ppm": [data.tds_ppm],
            "ph": [data.ph],
            "turbidez_ntu": [data.turbidez_ntu]
        }
        features_df = pd.DataFrame(datos_para_ia)
        prediccion = self.model.predict(features_df)
        return prediccion[0] == -1

    def evaluate_mapek_state(self, data: SensorData, es_anomalia_ia: bool) -> tuple[int, bool]:
        """
        Calcula el estado MAPE-K basándose en el Payload de la Capa 2:
        0: Normal | 1: Contaminación | 2: Inundación | 3: Crítico (Doble Falla)
        """
        es_contaminacion = (data.tds_ppm > 500.0) or (data.ph < 6.5 or data.ph > 8.5) or es_anomalia_ia
        es_inundacion = data.nivel_m < 0.40 or data.nivel_m > 3.50

        if es_contaminacion and es_inundacion:
            estado_mapek = 3
        elif es_inundacion:
            estado_mapek = 2
        elif es_contaminacion:
            estado_mapek = 1
        else:
            estado_mapek = 0

        alerta = estado_mapek > 0
        return estado_mapek, alerta

    def analyze_con_score(self, data: SensorData):
        """Fase ANALYZE extendida para diagnósticos síncronos HTTP de la Capa 4."""
        if self.model is None:
            return False, None

        datos_para_ia = {
            "nivel_m": [data.nivel_m],
            "temp_ambiente_c": [data.temp_ambiente_c],
            "temp_agua_c": [data.temp_agua_c],
            "tds_ppm": [data.tds_ppm],
            "ph": [data.ph],
            "turbidez_ntu": [data.turbidez_ntu]
        }
        features_df = pd.DataFrame(datos_para_ia)
        prediccion = self.model.predict(features_df)
        es_anomalia = bool(prediccion[0] == -1)

        score = None
        try:
            score = float(self.model.decision_function(features_df)[0])
        except Exception:
            score = None

        return es_anomalia, score