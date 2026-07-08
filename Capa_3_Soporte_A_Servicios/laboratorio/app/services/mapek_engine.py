import joblib
import numpy as np
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
        
        # Vectorizamos en el orden exacto en que fue entrenado el modelo
        features = np.array([[
            data.nivel_m, 
            data.temp_ambiente_c,
            data.temp_agua_c, 
            data.tds_ppm, 
            data.ph, 
            data.turbidez_ntu
        ]])
        
        # Isolation Forest retorna -1 para anomalías, 1 para normales
        prediccion = self.model.predict(features)
        return prediccion[0] == -1