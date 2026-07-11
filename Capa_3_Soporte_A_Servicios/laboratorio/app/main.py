from fastapi import FastAPI
from contextlib import asynccontextmanager
import asyncio
import json
import os
import aiomqtt
import asyncpg 
import warnings # <-- NUEVO: Importar la librería de advertencias

# <-- NUEVO: Silenciar específicamente la queja de sklearn sobre los nombres de las columnas
warnings.filterwarnings("ignore", message="X does not have valid feature names")

from app.schemas import SensorData, AlertaOut, DiagnosticoOut, TelecontrolComandoIn, TelecontrolComandoOut
from app.services.mapek_engine import MapekEngine
from pydantic import ValidationError
from datetime import datetime
from typing import Optional
from fastapi.middleware.cors import CORSMiddleware

# Configuraciones de red
# [MODIFICADO] Ahora se leen desde variables de entorno (Railway/producción),
# con los valores de docker-compose local como fallback si no existen.
MQTT_BROKER = os.getenv("MQTT_BROKER", "broker_chancay_huaral")
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))
MQTT_USER = os.getenv("MQTT_USER", "backend_central")
MQTT_PASSWORD = os.getenv("MQTT_PASSWORD", "backendChancay2026")
MQTT_TOPIC_SUB = "chancay/cuenca/#"  # <-- El comodín (#) hace que escuche histórico y tiempo real
# [CORREGIDO] Quitado el comodín '#' porque es ilegal para publicar
MQTT_TOPIC_PUB = "chancay/actuadores/alerta/"

# Configuración de Base de Datos (Mismos datos de la Capa 2)
# [MODIFICADO] Ahora se leen desde variables de entorno (Railway/producción),
# con los valores de docker-compose local como fallback si no existen.
DB_USER = os.getenv("DB_USER", "adminChancayHuaral")
DB_PASS = os.getenv("DB_PASS", "adminChancayHuaral123")
DB_NAME = os.getenv("DB_NAME", "chancayhuaral_auth")
DB_HOST = os.getenv("DB_HOST", "db_postgres")
DB_PORT = int(os.getenv("DB_PORT", "5432"))

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
        user=DB_USER, password=DB_PASS, database=DB_NAME, host=DB_HOST, port=DB_PORT
    )
    
    # Arrancar el lazo MQTT
    task = asyncio.create_task(mqtt_listener())
    yield
    # Limpieza al apagar
    task.cancel()
    await app_state["db_pool"].close()
    print("[DB] Pool de conexiones cerrado.")

app = FastAPI(title="Motor Autonómico MAPE-K", lifespan=lifespan)

# [CAPA 4] Habilitar CORS a nivel de microservicio también, como defensa en
# profundidad adicional a la configurada en Node-RED (settings.js -> httpNodeCors).
# Necesario porque el endpoint /diagnostico y /telemetria/historico pueden ser
# consultados directamente en entornos de depuración desde el navegador.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

@app.get("/telemetria/reciente")
async def obtener_telemetria(limit: int = 20):
    """Endpoint para que la Capa 4 consulte los datos históricos guardados"""
    pool = app_state.get("db_pool")
    async with pool.acquire() as connection:
        rows = await connection.fetch(
            "SELECT * FROM telemetria_cuenca ORDER BY timestamp_registro DESC LIMIT $1;", limit
        )
        return [dict(row) for row in rows]

@app.get("/telemetria/historico")
async def obtener_telemetria_historico(
    desde: Optional[str] = None,
    hasta: Optional[str] = None,
    nodo_id: Optional[str] = None,
    limit: int = 500,
):
    """
    [CAPA 4] Endpoint consultado por Node-RED (`GET /api/telemetria/historico`)
    para alimentar la Sección de Estadísticas Históricas del Frontend
    "Yaku Qhawaq" (tablas, selectores de fecha y tendencias de salud hídrica).

    Parámetros:
      - desde / hasta: Fechas ISO-8601 (ej. '2026-06-01T00:00:00') para
        acotar el rango de `timestamp_registro`.
      - nodo_id: Filtra por un nodo específico de la cuenca.
      - limit: Tope de registros retornados (por defecto 500).
    """
    pool = app_state.get("db_pool")
    if not pool:
        return []

    condiciones = []
    valores = []
    idx = 1

    if desde:
        condiciones.append(f"timestamp_registro >= ${idx}")
        # [CORREGIDO] Python 3.10 no soporta el sufijo 'Z' (Zulu/UTC) en
        # fromisoformat (eso llegó recién en 3.11). El Frontend envía fechas
        # con 'Z' (via .toISOString()), así que lo normalizamos primero.
        # [CORREGIDO 2] La columna timestamp_registro es TIMESTAMP sin zona
        # horaria (naive). Quitamos el tzinfo después de parsear el 'Z',
        # porque asyncpg no permite comparar datetime "aware" contra una
        # columna "naive" (TypeError: can't subtract offset-naive and
        # offset-aware datetimes).
        valores.append(datetime.fromisoformat(desde.replace("Z", "+00:00")).replace(tzinfo=None))
        idx += 1
    if hasta:
        condiciones.append(f"timestamp_registro <= ${idx}")
        valores.append(datetime.fromisoformat(hasta.replace("Z", "+00:00")).replace(tzinfo=None))
        idx += 1
    if nodo_id:
        condiciones.append(f"nodo_id = ${idx}")
        valores.append(nodo_id)
        idx += 1

    where_clause = f"WHERE {' AND '.join(condiciones)}" if condiciones else ""
    valores.append(limit)

    query = f"""
        SELECT * FROM telemetria_cuenca
        {where_clause}
        ORDER BY timestamp_registro DESC
        LIMIT ${idx};
    """

    async with pool.acquire() as connection:
        rows = await connection.fetch(query, *valores)
        return [dict(row) for row in rows]

@app.post("/telecontrol/historial", response_model=TelecontrolComandoOut, status_code=201)
async def registrar_comando_telecontrol(comando: TelecontrolComandoIn):
    """
    [CAPA 4 -> CAPA 3] Persistencia redundante de auditoría de Telecontrol.

    Node-RED (Tab 04) invoca este endpoint inmediatamente después de
    validar un comando de Anulación Manual y publicarlo vía MQTT hacia
    `chancay/actuadores/comando/<nodo_id>`. El registro se almacena en
    la tabla relacional `telecontrol_historial` (PostgreSQL, ver
    Capa_2/postgres/init.sql), garantizando trazabilidad forense de
    largo plazo independiente del Contexto Global volátil de Node-RED.

    Es idempotente respecto a `comando_id` (columna UNIQUE): reintentos
    de red desde Node-RED no duplican el registro de auditoría.
    """
    pool = app_state.get("db_pool")
    if not pool:
        return TelecontrolComandoOut(
            id=-1, timestamp_registro=datetime.utcnow(), **comando.model_dump()
        )

    async with pool.acquire() as connection:
        row = await connection.fetchrow(
            """
            INSERT INTO telecontrol_historial
                (comando_id, nodo_id, actuador, accion, operador, origen, ts_comando)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (comando_id) DO UPDATE SET comando_id = EXCLUDED.comando_id
            RETURNING id, comando_id, nodo_id, actuador, accion, operador, origen,
                      ts_comando, timestamp_registro;
            """,
            comando.comando_id, comando.nodo_id, comando.actuador, comando.accion,
            comando.operador, comando.origen, comando.ts_comando,
        )
        return TelecontrolComandoOut(**dict(row))


@app.get("/telecontrol/historial", response_model=list[TelecontrolComandoOut])
async def obtener_historial_telecontrol(nodo_id: Optional[str] = None, limit: int = 100):
    """
    [CAPA 4] Endpoint de auditoría de largo plazo. Complementa a
    `GET /api/telecontrol/historial` de Node-RED (que sirve la vista
    rápida desde el Contexto Global) permitiendo reconstruir la
    bitácora completa de comandos incluso tras un reinicio total del
    stack de Node-RED, directamente desde PostgreSQL.
    """
    pool = app_state.get("db_pool")
    if not pool:
        return []

    async with pool.acquire() as connection:
        if nodo_id:
            rows = await connection.fetch(
                """
                SELECT id, comando_id, nodo_id, actuador, accion, operador, origen,
                       ts_comando, timestamp_registro
                FROM telecontrol_historial
                WHERE nodo_id = $1
                ORDER BY timestamp_registro DESC
                LIMIT $2;
                """,
                nodo_id, limit,
            )
        else:
            rows = await connection.fetch(
                """
                SELECT id, comando_id, nodo_id, actuador, accion, operador, origen,
                       ts_comando, timestamp_registro
                FROM telecontrol_historial
                ORDER BY timestamp_registro DESC
                LIMIT $1;
                """,
                limit,
            )
        return [TelecontrolComandoOut(**dict(row)) for row in rows]


@app.post("/diagnostico", response_model=DiagnosticoOut)
async def diagnosticar_lectura(data: SensorData):
    """
    [CAPA 4] Endpoint síncrono consultado por Node-RED (Tab 01 - Ingesta MQTT)
    en cada lectura recibida por el broker, para obtener un veredicto de
    Isolation Forest de forma inmediata (fase ANALYZE bajo demanda), en
    paralelo al lazo autónomo asíncrono que ya corre en `mqtt_listener()`.

    Esto permite que el Frontend reciba el diagnóstico fusionado con la
    lectura casi en tiempo real, sin depender exclusivamente de la
    persistencia en PostgreSQL.
    """
    es_anomalia, score = engine.analyze_con_score(data)
    return DiagnosticoOut(es_anomalia=es_anomalia, score=score)
# redeploy-fix-fecha-z

@app.post("/telemetria/historico", status_code=201)
async def api_guardar_historico(payload: dict):
    """
    [NUEVO] Endpoint expuesto para que Node-RED guarde los datos directamente 
    en PostgreSQL a través de FastAPI, evitando conflictos de certificados SSL.
    """
    try:
        # Extraemos el nodo_id (por defecto usa el autorizado si no viene)
        nodo_id = payload.get("nodo_id", "nodo_chancay_01")
        
        # Validamos y estructuramos los datos usando tu esquema existente SensorData
        sensor_data = SensorData(
            nivel_m=float(payload.get("nivel_m", 0.0)),
            temp_ambiente_c=float(payload.get("temp_ambiente_c", 0.0)),
            temp_agua_c=float(payload.get("temp_agua_c", 0.0)),
            tds_ppm=float(payload.get("tds_ppm", 0.0)),
            ph=float(payload.get("ph", 7.0)),
            turbidez_ntu=float(payload.get("turbidez_ntu", 0.0))
        )
        
        # Evaluamos el estado de anomalía enviado por Node-RED
        es_anomalia = payload.get("es_anomalia", False) or payload.get("is_anomaly", False)
        if isinstance(es_anomalia, str):
            es_anomalia = es_anomalia.lower() == "true"
            
        # Invocamos tu función interna nativa que ya escribe perfecto en Railway
        await guardar_en_bd(nodo_id, sensor_data, es_anomalia)
        return {"status": "success", "message": "Datos guardados exitosamente en Railway vía FastAPI"}
        
    except Exception as e:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail=f"Error al procesar la inserción: {str(e)}")