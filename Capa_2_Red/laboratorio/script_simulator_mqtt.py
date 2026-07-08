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
    
    # [ENFOQUE STRIDE - Mitigación de Spoofing y Tampering] Usando el usuario inyectado en PostgreSQL
    cliente.username_pw_set("simulador_python", "simulador123")
    
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

    cliente = conectar_mqtt()
    if not cliente:
        return

    cliente.loop_start() # Mantiene la conexión MQTT activa en segundo plano
    print(f"[*] Iniciando transmisión en el tópico '{MQTT_TOPIC}'...")
    print("------------------------------------------------------------------")

    try:
        # Línea Clave 3: Iteración fila por fila sobre las 5 variables de los sensores
        for index, fila in df.iterrows():
            # Estructuramos el Payload en formato JSON (Estándar de la industria IoT)
            payload = {
                "id_nodo": str(fila['node_id']),
                "timestamp": int(fila['timestamp_ms']),
                "sensores": {
                    "nivel_m": round(float(fila['nivel_agua_cm']) / 100.0, 2), # Convertir cm a metros
                    "temp_agua_c": float(fila['temp_agua']),
                    "tds_ppm": float(fila['conductividad']),
                    "ph": float(fila['ph']),
                    "turbidez_ntu": float(fila['turbidez'])
                },
                "estado_mapek": int(fila['estado_mapek']),
                "datos_recuperados": True # Al ser historial, esto va en True
            }
            
            # Línea Clave 4: Conversión y envío del mensaje por la red
            mensaje_json = json.dumps(payload)
            cliente.publish(MQTT_TOPIC, mensaje_json, qos=1)            
            print(f"[ENVIO] Registro {index+1} -> Nivel: {payload['sensores']['nivel_m']}m | MAPE-K: {payload['estado_mapek']}")
            
            # Control de tiempo para simulación en el laboratorio
            time.sleep(INTERVALO_ENVIO)
            
    except KeyboardInterrupt:
        print("\n[-] Simulación detenida por el usuario.")
    finally:
        cliente.loop_stop()
        cliente.disconnect()
        print("[*] Conexión MQTT cerrada de forma segura.")
>>>>>>> ac14955 (Actualización Capa 2 - Proyecto Final IoT):Capa_2_Red/laboratorio/script_simulator_mqtt.py

if __name__ == "__main__":
    transmitir_historico()
