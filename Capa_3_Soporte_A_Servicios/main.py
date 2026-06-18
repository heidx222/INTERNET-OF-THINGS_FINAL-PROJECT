# main.py
from fastapi import FastAPI, HTTPException, Depends
from pydantic import BaseModel
import joblib
import numpy as np
import paho.mqtt.client as mqtt
import json

app = FastAPI(title="Middleware Autónomo Cuenca Chancay-Huaral", version="1.0")

# 1. Cargar el modelo de IA entrenado
modelo_ia = joblib.load("modelo_isolation_forest.pkl")

# 2. Configurar Cliente MQTT Embebido para Ejecutar Acciones (Lazo Autonómico)
MQTT_BROKER = "localhost"
MQTT_PORT = 1883
MQTT_TOPIC_ALERTA = "chancay/actuadores/alerta"

cliente_mqtt = mqtt.Client(client_id="Middleware_Capa3")
cliente_mqtt.connect(MQTT_BROKER, MQTT_PORT, 60)
cliente_mqtt.loop_start()

# Modelo de validación de datos entrantes (Tus 5 sensores)
class LecturaSensor(BaseModel):
    conductividad: float
    ph: float
    temp_agua: float
    temp_ambiente: float
    nivel_agua: float

@app.post("/api/v1/monitoreo", status_code=200)
async def procesar_lectura(datos: LecturaSensor):
    """
    Endpoint HTTPS que recibe datos de los sensores, aplica IA (Isolation Forest)
    y ejecuta la lógica autonómica (MAPE-K) vía MQTT si hay riesgo ambiental.
    """
    # Preparar datos para la predicción de Scikit-Learn
    vector = np.array([[datos.conductividad, datos.ph, datos.temp_agua, datos.temp_ambiente, datos.nivel_agua]])
    
    # [ANALYZE] Predicción de la IA: 1 = Normal, -1 = Anomalía (Contaminación o Caudal Crítico)
    resultado_prediccion = modelo_ia.predict(vector)[0]
    
    # [PLAN / EXECUTE] Lógica Autonómica basada en la IA
    if resultado_prediccion == -1:
        # Si es anomalía, enviamos la orden inmediata por MQTT para activar Buzzer y LCD
        payload_alerta = {"alerta": 1, "mensaje": "ANOMALIA DETECTADA"}
        cliente_mqtt.publish(MQTT_TOPIC_ALERTA, json.dumps(payload_alerta), qos=1)
        estado_sistema = "CRÍTICO - Alerta Temprana Activada Automáticamente"
    else:
        # Estado normal, nos aseguramos de mantener apagados los actuadores de emergencia
        payload_alerta = {"alerta": 0, "mensaje": "AGUA OPTIMA"}
        cliente_mqtt.publish(MQTT_TOPIC_ALERTA, json.dumps(payload_alerta), qos=1)
        estado_sistema = "Estable"

    return {
        "status": "procesado",
        "ia_clasificacion": "Anomalía" if resultado_prediccion == -1 else "Normal",
        "sistema_autonomo_accion": estado_sistema
    }

import requests

def enviar_alerta_whatsapp(mensaje_alerta):
    # Simulación de Webhook de alerta hacia la población mediante CallMeBot (Gratuito)
    # Reemplazas con tu número y tu API Key de prueba
    numero_celular = "+51999888777" 
    api_key_prueba = "123456"
    
    url = f"https://api.callmebot.com/whatsapp.php?phone={numero_celular}&text={mensaje_alerta}&apikey={api_key_prueba}"
    
    try:
        # La Capa 3 ejecuta la orden de red hacia el exterior
        requests.get(url, timeout=5)
    except Exception:
        print("Mensaje encolado localmente (Simulación Offline)")