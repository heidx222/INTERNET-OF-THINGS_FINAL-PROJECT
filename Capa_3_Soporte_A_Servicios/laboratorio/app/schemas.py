from pydantic import BaseModel, Field

class SensorData(BaseModel):
    nivel_m: float = Field(..., ge=0, le=20.0, description="Nivel del río en metros")
    temp_ambiente_c: float = Field(..., ge=-10, le=50.0, description="Temperatura ambiente en °C")
    temp_agua_c: float = Field(..., ge=-10, le=50.0, description="Temperatura del agua en °C")
    tds_ppm: float = Field(..., ge=0, description="Sólidos disueltos en ppm")
    ph: float = Field(..., ge=0, le=14.0, description="Nivel de pH (0-14)")
    turbidez_ntu: float = Field(..., ge=0, description="Turbidez en NTU")

class AlertaOut(BaseModel):
    comando: str
    motivo: str
    severidad: str

class DiagnosticoOut(BaseModel):
    """
    Contrato de respuesta del endpoint síncrono `POST /diagnostico`.
    Consumido por la Capa 4 (Node-RED) en el pipeline de ingesta en
    tiempo real para fusionar cada lectura MQTT con el veredicto de
    la IA antes de retransmitirla al Frontend "Yaku Qhawaq".
    """
    es_anomalia: bool = Field(..., description="True si Isolation Forest detecta un patrón anómalo")
    score: float | None = Field(None, description="Función de decisión del modelo (negativo = más anómalo)")