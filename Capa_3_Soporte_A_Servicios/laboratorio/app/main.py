from fastapi import FastAPI
from contextlib import asynccontextmanager
import asyncio
import json
import aiomqtt
import asyncpg 
from app.schemas import SensorData, AlertaOut
from app.services.mapek_engine import MapekEngine
from pydantic import ValidationError

# Configuraciones de red
MQTT_BROKER = "broker_chancay_huaral"
MQTT_PORT = 1883
MQTT_USER = "backend_central"
MQTT_PASSWORD = "backendChancay2026"
MQTT_TOPIC_SUB = "chancay/cuenca/#"  # <-- El comodín (#) hace que escuche histórico y tiempo real
# [CORREGIDO] Quitado el comodín '#' porque es ilegal para publicar
MQTT_TOPIC_PUB = "chancay/actuadores/alerta/"

# Configuración de Base de Datos (Mismos datos de la Capa 2)
DB_USER = "adminChancayHuaral"
DB_PASS = "adminChancayHuaral123"
DB_NAME = "chancayhuaral_auth"
DB_HOST = "db_postgres" 

engine = MapekEngine()
app_state = {} 

async def guardar_en_bd(nodo_id: str, data: SensorData, es_anomalia: bool):
    """Guarda de forma asíncrona la lectura en PostgreSQL (Fase Knowledge)"""
    pool = app_state.get("db_pool")
    if not pool:
        print("[DB-ERROR] Pool de conexiones no disponible.")
        return
    
    async with pool.acquire() as connection:
        query = """
            INSERT INTO telemetria_cuenca 
            (nodo_id, nivel_m, temp_ambiente_c, temp_agua_c, tds_ppm, ph, turbidez_ntu, es_anomalia)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8);
        """
        await connection.execute(
            query, nodo_id, data.nivel_m, data.temp_ambiente_c, 
            data.temp_agua_c, data.tds_ppm, data.ph, data.turbidez_ntu, es_anomalia
        )

async def mqtt_listener():
    """Fase MONITOR del lazo MAPE-K con persistencia"""
    while True:
        try:
            async with aiomqtt.Client(
                hostname=MQTT_BROKER, port=MQTT_PORT, 
                username=MQTT_USER, password=MQTT_PASSWORD
            ) as client:
                print(f"[NETWORK] Conectado exitosamente a Mosquitto")
                await client.subscribe(MQTT_TOPIC_SUB)
                
                async for message in client.messages:
                    payload = message.payload.decode()
                    topic = message.topic.value
                    
                    try:
                        # 1. MONITOR
                        data_dict = json.loads(payload)
                        sensor_data = SensorData(**data_dict)
                        nodo_id = topic.split("/")[-1]
                        
                        # 2. ANALYZE
                        analisis_raw = engine.analyze(sensor_data)
                        
                        # [CORREGIDO] Casteo de seguridad: Evita que numpy destruya asyncpg
                        # Si Isolation Forest devuelve -1 (Anomalía), es True. Si no, normaliza a bool.
                        if str(analisis_raw) == "-1":
                            is_anomaly = True
                        else:
                            is_anomaly = bool(analisis_raw)
                        
                        # [PERSISTENCIA]
                        await guardar_en_bd(nodo_id, sensor_data, is_anomaly)
                        
                        # 3. PLAN
                        if is_anomaly:
                            print(f"[ALERTA] Anomalía detectada en {nodo_id}.")
                            alerta = AlertaOut(
                                comando="ACTIVAR_SIRENA_COMPUERTA",
                                motivo="Anomalía crítica detectada por Isolation Forest",
                                severidad="ALTA"
                            )
                            # 4. EXECUTE
                            await client.publish(
                                f"{MQTT_TOPIC_PUB}{nodo_id}", 
                                payload=alerta.model_dump_json(), 
                                qos=1
                            )
                            
                    except ValidationError as e:
                        print(f"[SECURITY] Tampering rechazado: {e}")
                    except json.JSONDecodeError:
                        print("[SECURITY] Payload MQTT no es un JSON válido.")
                    except Exception as e:
                        # [CORREGIDO] ¡Aquí estaba la muerte silenciosa! Ahora gritará el error.
                        print(f"[CRITICAL ERROR] Fallo interno procesando mensaje: {e}")
                        
        except aiomqtt.MqttError as error:
            print(f"[NETWORK-WARN] Conexión MQTT perdida. Reintentando en 5s...")
            await asyncio.sleep(5)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Inicializar el pool de conexiones a la BD al arrancar
    print("[DB] Creando pool de conexiones con PostgreSQL...")
    app_state["db_pool"] = await asyncpg.create_pool(
        user=DB_USER, password=DB_PASS, database=DB_NAME, host=DB_HOST
    )
    
    # Arrancar el lazo MQTT
    task = asyncio.create_task(mqtt_listener())
    yield
    # Limpieza al apagar
    task.cancel()
    await app_state["db_pool"].close()
    print("[DB] Pool de conexiones cerrado.")

app = FastAPI(title="Motor Autonómico MAPE-K", lifespan=lifespan)

@app.get("/telemetria/reciente")
async def obtener_telemetria(limit: int = 20):
    """Endpoint para que la Capa 4 consulte los datos históricos guardados"""
    pool = app_state.get("db_pool")
    async with pool.acquire() as connection:
        rows = await connection.fetch(
            "SELECT * FROM telemetria_cuenca ORDER BY timestamp_registro DESC LIMIT $1;", limit
        )
        return [dict(row) for row in rows]
