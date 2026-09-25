# =================================================================
# PROYECTO: Sistema IoT Autónomo - Cuenca Chancay-Huaral (Yaku Qhawaq)
# ARCHIVO:  Dockerfile  (Capa 3 - Soporte a Servicios / backend FastAPI)
# DESTINO:  Railway (o cualquier PaaS con contenedores)
# -----------------------------------------------------------------
# Contexto de build = esta carpeta (Capa_3_Soporte_A_Servicios/campo).
# En Railway: Settings -> Root Directory = Capa_3_Soporte_A_Servicios/campo
# =================================================================
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Dependencias del sistema mínimas (curl para el HEALTHCHECK)
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

# 1º dependencias (cache de capas)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 2º código fuente + modelo IA ya entrenado (app/models/isolation_forest.pkl)
COPY app ./app

EXPOSE 8000

# Railway inyecta $PORT; en local cae a 8000.
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
