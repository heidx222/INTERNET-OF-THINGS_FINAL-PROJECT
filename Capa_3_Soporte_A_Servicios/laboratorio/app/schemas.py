from pydantic import BaseModel, Field
from datetime import datetime

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


class TelecontrolComandoIn(BaseModel):
    """
    Contrato de entrada del endpoint `POST /telecontrol/historial`.

    Consumido por Node-RED (Tab 04 - Telecontrol) inmediatamente
    después de validar y publicar un comando MQTT inverso hacia los
    actuadores simulados (Sirena / Compuerta), para dejar constancia
    persistente y redundante en PostgreSQL (tabla
    `telecontrol_historial`, ver Capa_2/postgres/init.sql), de forma
    independiente al Contexto Global de Node-RED.
    """
    comando_id: str = Field(..., description="Identificador único del comando, ej. 'TC-1728412345678'")
    nodo_id: str = Field(..., description="Nodo objetivo del comando (ej. 'nodo_chancay_01')")
    actuador: str = Field(..., pattern="^(sirena|compuerta)$", description="Actuador objetivo")
    accion: str = Field(..., pattern="^(activar|desactivar)$", description="Acción a ejecutar")
    operador: str = Field(default="operador_no_identificado", description="Operador que ejecuta la anulación manual")
    origen: str = Field(default="panel_telecontrol_manual", description="Origen lógico del comando")
    ts_comando: int = Field(..., description="Epoch (ms) de emisión del comando, generado por Node-RED")


class TelecontrolComandoOut(TelecontrolComandoIn):
    """Registro persistido, enriquecido con el timestamp de la BD."""
    id: int
    timestamp_registro: datetime