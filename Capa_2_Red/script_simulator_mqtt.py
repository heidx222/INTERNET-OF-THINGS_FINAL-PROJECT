# =================================================================
# PROYECTO: Sistema IoT Autónomo - Cuenca Chancay-Huaral
# ARCHIVO: script_simulator_mqtt.py (Capa 2 - Inyector Histórico)
# ENFOQUE: Simulación de Big Data y STRIDE (Autenticación Obligatoria)
# =================================================================

import csv
import json
import time
import paho.mqtt.client as mqtt

# --- CONFIGURACIÓN DE RED (Alineado con el ESP32 e IP de tu PC) ---
MQTT_SERVER = "172.16.247.X"  # <--- COLOCA AQUÍ LA DIRECCIÓN IP DE TU COMPUTADORA
MQTT_PORT = 1883
MQTT_USER = "nodo_chancay_01"
MQTT_PASS = "token_seguro_stride"

# Tópico específico para datos históricos según tu README
MQTT_TOPIC_HISTORICO = "chancay/cuenca/historico" 
CSV_FILE = "dataset_sintetico_chancay.csv"

def conectar_broker():
    # Creamos el cliente con un identificador único virtual para diferenciarlo del ESP32
    client = mqtt.Client(client_id="Nodo_Virtual_Historico_Chancay")
    
    # MITIGACIÓN STRIDE (Spoofing): Forzamos las credenciales guardadas en configuration_usuarios.txt
    client.username_pw_set(MQTT_USER, MQTT_PASS)
    
    print(f"[RED] Conectando al Broker MQTT en {MQTT_SERVER}:{MQTT_PORT}...")
    try:
        client.connect(MQTT_SERVER, MQTT_PORT, 60)
        return client
    except Exception as e:
        print(f"[ERROR] Conexión fallida: {e}")
        return None

def transmitir_historico():
    client = conectar_broker()
    if not client:
        return

    client.loop_start() # Inicia el hilo de red en segundo plano
    print(f"[PROCESO] Vinculando archivo histórico: {CSV_FILE}")

    try:
        with open(CSV_FILE, mode='r', encoding='utf-8') as archivo:
            lector_csv = csv.DictReader(archivo)
            
            contador = 0
            for fila in lector_csv:
                # Construimos el Payload JSON idéntico estructuralmente al del ESP32
                payload = {
                    "node_id": fila.get("node_id", "nodo_chancay_01"),
                    "timestamp_ms": int(fila.get("timestamp_ms", 0)),
                    "conductividad": float(fila.get("conductividad", 0.0)),
                    "temp_agua": float(fila.get("temp_agua", 0.0)),
                    "temp_ambiente": float(fila.get("temp_ambiente", 0.0)),
                    "humedad": float(fila.get("humedad", 0.0)),
                    "nivel_agua_cm": float(fila.get("nivel_agua_cm", 0.0)),
                    "alerta": fila.get("alerta", "false"),
                    "tipo_emergencia": int(fila.get("tipo_emergencia", 0))
                }
                
                # Serialización estricta (Mitigación de Tampering / Alteración)
                json_payload = json.dumps(payload)
                
                # Publicamos con QoS 1 (Garantiza entrega según la matriz STRIDE de tu README)
                client.publish(MQTT_TOPIC_HISTORICO, json_payload, qos=1)
                
                contador += 1
                print(f"[INYECTADO #{contador}] Enviado a {MQTT_TOPIC_HISTORICO}: {json_payload}")
                
                # Pequeña pausa (10 milisegundos) para inyectar en ráfaga masiva de forma óptima sin saturar la RAM de tu PC
                time.sleep(0.01) 
                
        print(f"\n[ÉXITO] Vinculación completada. {contador} registros históricos transmitidos por MQTT.")
        
    except FileNotFoundError:
        print(f"[ERROR] No se encontró el archivo '{CSV_FILE}' en esta ruta.")
    except Exception as e:
        print(f"[ERROR] Fallo en la transmisión streaming: {e}")

    client.loop_stop()
    client.disconnect()

if __name__ == "__main__":
    transmitir_historico()
