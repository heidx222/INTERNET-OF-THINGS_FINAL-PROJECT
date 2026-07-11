import joblib
import numpy as np
import pandas as pd
import os
from app.schemas import SensorData

# Ruta absoluta basada en la ubicación de este script
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
            print("[IA-WARN] No se encontró isolation_forest.pkl. La IA está inactiva.")

    def analyze(self, data: SensorData) -> bool:
        """
        Fase ANALYZE: Retorna True si detecta anomalía, False si es normal.
        """
        if self.model is None:
            return False # Failsafe si el modelo no está disponible
        
        # [CORREGIDO] Construimos un DataFrame con los nombres exactos de las columnas
        datos_para_ia = {
            "nivel_m": [data.nivel_m],
            "temp_ambiente_c": [data.temp_ambiente_c],
            "temp_agua_c": [data.temp_agua_c],
            "tds_ppm": [data.tds_ppm],
            "ph": [data.ph],
            "turbidez_ntu": [data.turbidez_ntu]
        }
        features_df = pd.DataFrame(datos_para_ia)
        
        # Isolation Forest retorna -1 para anomalías, 1 para normales
        prediccion = self.model.predict(features_df)
        return prediccion[0] == -1

    def analyze_con_score(self, data: SensorData):
        """
        Variante extendida de la fase ANALYZE usada por el endpoint HTTP
        `/diagnostico` (consumido por la Capa 4 - Node-RED).

        Retorna una tupla (es_anomalia: bool, score: float | None), donde
        `score` corresponde a la función de decisión de Isolation Forest
        (`decision_function`): valores negativos indican mayor anormalidad,
        valores positivos indican mayor normalidad. Se expone crudo para que
        el Frontend "Yaku Qhawaq" pueda graduar visualmente la severidad.
        """
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
