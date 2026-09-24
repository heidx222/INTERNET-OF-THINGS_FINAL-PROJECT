from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

class SensorData(BaseModel):
    node_id: str = Field(default="nodo_chancay_01", description="Identificador del nodo IoT")
    origen: Optional[str] = Field(default="realtime", description="Origen de la muestra (sintetico/realtime)")
    timestamp_ms: Optional[int] = Field(default=0, description="Timestamp UNIX en ms")
    nivel_m: float
    temp_ambiente_c: float
    temp_agua_c: float
    tds_ppm: float
    ph: float
    turbidez_ntu: float
    alerta: Optional[bool] = False
    estado_mapek: Optional[int] = 0

class AlertaOut(BaseModel):
    comando: str
    motivo: str
    severidad: str

class DiagnosticoOut(BaseModel):
    es_anomalia: bool
    score: Optional[float] = None

class TelecontrolComandoIn(BaseModel):
    comando_id: str
    nodo_id: str
    actuador: str
    accion: str
    operador: str
    origen: str
    ts_comando: datetime

class TelecontrolComandoOut(TelecontrolComandoIn):
    id: int
    timestamp_registro: datetime