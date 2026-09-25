# =================================================================
# PROYECTO: Sistema IoT Autónomo - Cuenca Chancay-Huaral (Yaku Qhawaq)
# ARCHIVO:  app/schemas.py  (Capa 3 - Contratos Pydantic)
# -----------------------------------------------------------------
# Estos esquemas son el CONTRATO común entre las 4 capas:
#   - Capa 1 (ESP32) y Capa 2 (simulador) publican exactamente estos
#     campos en el payload JSON de telemetría.
#   - Capa 3 los valida (SensorData) antes de persistir y difundir.
#   - Capa 4 consume/emite TelecontrolAccionIn y SaludHidricaOut.
# =================================================================

from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class SensorData(BaseModel):
    """Lectura de telemetría emitida por un nodo sensor (Capa 1 / Capa 2)."""

    node_id: str = Field(default="nodo_chancay_01", description="Identificador del nodo IoT")
    origen: Optional[str] = Field(default="realtime", description="Origen de la muestra (sintetico/realtime)")
    timestamp_ms: Optional[int] = Field(default=0, description="Timestamp UNIX en ms (epoch del dispositivo)")
    nivel_m: float = Field(..., description="Nivel/distancia del río en metros")
    temp_ambiente_c: float = Field(..., description="Temperatura ambiente en °C")
    temp_agua_c: float = Field(..., description="Temperatura del agua en °C")
    tds_ppm: float = Field(..., description="Sólidos disueltos totales en ppm")
    ph: float = Field(..., description="pH del agua (0-14)")
    turbidez_ntu: float = Field(..., description="Turbidez en NTU")
    alerta: Optional[bool] = Field(default=False, description="Flag de alerta local emitido por el nodo")
    estado_mapek: Optional[int] = Field(default=0, description="Estado MAPE-K local (0..3)")


class AlertaOut(BaseModel):
    """Comando/alerta emitido por el PLAN del lazo MAPE-K hacia los actuadores."""

    comando: str
    motivo: str
    severidad: str


class DiagnosticoOut(BaseModel):
    es_anomalia: bool
    score: Optional[float] = None


class SaludHidricaOut(BaseModel):
    """Índice agregado de salud hídrica de la cuenca (consumido por el Dashboard)."""

    salud_hidrica_pct: float
    estado: str
    anomalias_pct: float = 0.0
    total_lecturas: int = 0


class TelecontrolComandoIn(BaseModel):
    """Registro persistido de un comando de telecontrol (bitácora de auditoría)."""

    comando_id: str
    nodo_id: str
    actuador: str
    accion: str
    operador: str
    origen: str
    # BIGINT en PostgreSQL => int (epoch ms). Ver init.sql -> telecontrol_historial.ts_comando
    ts_comando: int


class TelecontrolComandoOut(TelecontrolComandoIn):
    id: int
    timestamp_registro: datetime


class TelecontrolAccionIn(BaseModel):
    """
    Payload que envía el Panel de Telecontrol del Frontend (Capa 4) para
    accionar manualmente un actuador. El `comando_id` es opcional: si no
    llega, el backend lo genera (uuid) garantizando idempotencia.
    """

    nodo_id: str = Field(default="nodo_chancay_01")
    actuador: str = Field(..., description="sirena | compuerta")
    accion: str = Field(..., description="activar | desactivar")
    operador: Optional[str] = "operador_sala_monitoreo"
    origen: Optional[str] = "panel_telecontrol_manual"
    comando_id: Optional[str] = None
