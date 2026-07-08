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