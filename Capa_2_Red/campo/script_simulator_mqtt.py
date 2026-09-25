# =================================================================
# PROYECTO: Sistema IoT Autónomo - Cuenca Chancay-Huaral (Yaku Qhawaq)
# ARCHIVO: script_simulator_mqtt.py (Capa 2 - Inyector MQTT)
# =================================================================

import csv
import json
import os
import time
import sys
from dotenv import load_dotenv
import paho.mqtt.client as mqtt

# Cargar variables de entorno locales si existen
load_dotenv()

# --- CONFIGURACIÓN DE RED Y RAILWAY ---
MQTT_SERVER = os.getenv("MQTT_HOST", "iriguchi.proxy.rlwy.net")
MQTT_PORT = int(os.getenv("MQTT_PORT", 28182))
MQTT_USER = os.getenv("MQTT_USER", "simulador_python")
MQTT_PASS = os.getenv("MQTT_PASS", "simulador123")

# Tópico histórico de la cuenca. Debe pertenecer al prefijo `chancay/cuenca/#`
# para que sea visible a la ACL de escritura del simulador (Capa 2 -> MQTT ->
# Capa 3) y consumido por el listener `chancay/cuenca/#` del backend FastAPI.
MQTT_TOPIC_HISTORICO = os.getenv("MQTT_TOPIC", "chancay/cuenca/historico")
CSV_FILE = os.getenv("CSV_FILE", "dataset_sintetico_chancay.csv")

def conectar_broker():
    # Uso de CallbackAPIVersion.VERSION2 para compatibilidad estricta
    client = mqtt.Client(
        callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
        client_id="Nodo_Virtual_Historico_Chancay"
    )
    
    if MQTT_USER and MQTT_PASS:
        client.username_pw_set(MQTT_USER, MQTT_PASS)
        
    print(f"[RED] Conectando al Broker MQTT en {MQTT_SERVER}:{MQTT_PORT}...")
    try:
        client.connect(MQTT_SERVER, MQTT_PORT, keepalive=60)
        return client
    except Exception as e:
        print(f"[ERROR] Conexión fallida al broker: {e}")
        return None

def transmitir_historico(velocidad_delay=0.01):
    if not os.path.exists(CSV_FILE):
        print(f"[ERROR CRÍTICO] El archivo '{CSV_FILE}' no existe. Ejecuta primero 'generar_dataset_sintetico_PRO.py'.")
        sys.exit(1)

    client = conectar_broker()
    if not client:
        sys.exit(1)

    client.loop_start()
    print(f"[PROCESO] Iniciando transmisión desde: {CSV_FILE}")

    try:
        with open(CSV_FILE, mode='r', encoding='utf-8') as archivo:
            lector_csv = csv.DictReader(archivo)
            
            contador = 0
            for fila in lector_csv:
                # Payload completo alineado con la base de datos y la Capa 3
                payload = {
                    "node_id": fila.get("node_id", "nodo_chancay_sim"),
                    "origen": fila.get("origen", "sintetico"),
                    "timestamp_ms": int(fila.get("timestamp_ms", int(time.time() * 1000))),
                    "nivel_m": float(fila.get("nivel_m", 0.0)),
                    "temp_ambiente_c": float(fila.get("temp_ambiente_c", 0.0)),
                    "temp_agua_c": float(fila.get("temp_agua_c", 0.0)),
                    "tds_ppm": float(fila.get("tds_ppm", 0.0)),
                    "ph": float(fila.get("ph", 0.0)),
                    "turbidez_ntu": float(fila.get("turbidez_ntu", 0.0)),
                    "alerta": fila.get("alerta", "false").lower() == "true",
                    "estado_mapek": int(fila.get("estado_mapek", 0))
                }
                
                json_payload = json.dumps(payload)
                
                # Publicación QoS 1
                info = client.publish(MQTT_TOPIC_HISTORICO, json_payload, qos=1)
                info.wait_for_publish(timeout=2.0)
                
                contador += 1
                if contador % 100 == 0 or contador == 1:
                    print(f"[TRANSMITIENDO #{contador}] Tópico: {MQTT_TOPIC_HISTORICO} | Payload: {json_payload}")
                
                time.sleep(velocidad_delay)
                
        print(f"\n[ÉXITO] Transmisión finalizada. {contador} registros enviados exitosamente.")
        
    except Exception as e:
        print(f"[ERROR] Fallo durante el streaming MQTT: {e}")
    finally:
        client.loop_stop()
        client.disconnect()
        print("[*] Conexión MQTT cerrada de forma segura.")

if __name__ == "__main__":
    transmitir_historico()