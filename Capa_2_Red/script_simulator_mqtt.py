"""
PROYECTO: Sistema IoT Autónomo de Monitoreo y Alerta Temprana - Cuenca Chancay-Huaral
CAPA 2: RED (Script de Simulación e Inyección de Dataset Sintético)

¿PARA QUÉ SIRVE ESTE SCRIPT?
Este programa emula el comportamiento de una estación de monitoreo histórica en la red MQTT.
Lee el archivo CSV (generado con la muestra real de laboratorio) y transmite cada registro 
al Broker MQTT de la Smart City en ráfagas de tiempo configurables. Esto permite:
1. Alentar y poblar la Base de Datos (Capa 3) con miles de datos en minutos para generar analítica.
2. Forzar de forma controlada las anomalías inyectadas (vertimientos y huaycos) para evaluar 
   la reacción autónoma (ciclo MAPE-K) de los actuadores físicos (Buzzer y LCD) en el laboratorio.
"""

import pandas as pd
import time
import json
import paho.mqtt.client as mqtt  # Línea Clave 1: Librería para el protocolo MQTT

# --- CONFIGURACIÓN DE LA RED MQTT (Topología Estrella) ---
MQTT_BROKER = "localhost"        # Tu PC actuará como el servidor/broker central
MQTT_PORT = 1883                 # Puerto estándar de MQTT
MQTT_TOPIC = "chancay/cuenca/historico"  # Canal donde se enviarán los datos

CSV_FILE = "dataset_sintetico_chancay.csv"
INTERVALO_ENVIO = 0.5            # Envía un registro cada 0.5 segundos (Simulación acelerada)

def conectar_mqtt():
    """Establece la conexión con el Broker MQTT aplicando reglas STRIDE (Autenticación)"""
    cliente = mqtt.Client(client_id="Simulador_Historico_Chancay")
    
    # [ENFOQUE STRIDE - Mitigación de Spoofing y Tampering]
    # Descomenta las líneas de abajo cuando configures usuario y contraseña en tu Broker Mosquitto
    # cliente.username_pw_set("tu_usuario_iot", "tu_contrasena_segura")
    
    try:
        cliente.connect(MQTT_BROKER, MQTT_PORT, 60)
        print(f"[*] Conectado exitosamente al Broker MQTT en {MQTT_BROKER}:{MQTT_PORT}")
        return cliente
    except Exception as e:
        print(f"[-] Error de conexión al Broker: {e}")
        return None

def iniciar_simulacion():
    # Línea Clave 2: Carga del dataset en memoria de trabajo
    try:
        df = pd.read_csv(CSV_FILE)
        print(f"[*] Archivo '{CSV_FILE}' cargado con {len(df)} registros.")
    except FileNotFoundError:
        print(f"[-] Error: No se encontró el archivo '{CSV_FILE}'. Ejecuta primero el generador.")
        return

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
                "timestamp": str(fila['Fecha_Hora']),
                "conductividad": float(fila['Conductividad_uS_cm']),
                "ph": float(fila['pH']),
                "temp_agua": float(fila['Temp_Agua_C']),
                "temp_ambiente": float(fila['Temp_Ambiente_C']),
                "nivel_agua": float(fila['Nivel_Agua_m'])
            }
            
            # Línea Clave 4: Conversión y envío del mensaje por la red
            mensaje_json = json.dumps(payload)
            cliente.publish(MQTT_TOPIC, mensaje_json, qos=1) # QoS 1 asegura que el dato llegue a la BD
            
            print(f"[ENVIO] Registro {index+1} -> pH: {payload['ph']} | CE: {payload['conductividad']} uS/cm | Nivel: {payload['nivel_agua']}m")
            
            # Control de tiempo para simulación en el laboratorio
            time.sleep(INTERVALO_ENVIO)
            
    except KeyboardInterrupt:
        print("\n[-] Simulación detenida por el usuario.")
    finally:
        cliente.loop_stop()
        cliente.disconnect()
        print("[*] Conexión MQTT cerrada de forma segura.")

if __name__ == "__main__":
    iniciar_simulacion()