import asyncio
import json
import os
import warnings
from datetime import datetime
from typing import Optional, List
from contextlib import asynccontextmanager

import aiomqtt
import asyncpg
# SE AÑADE WebSocket Y WebSocketDisconnect
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect 
from fastapi.middleware.cors import CORSMiddleware
from pydantic import ValidationError

warnings.filterwarnings("ignore", message="X does not have valid feature names")

from app.schemas import SensorData, AlertaOut, DiagnosticoOut, TelecontrolComandoIn, TelecontrolComandoOut
from app.services.mapek_engine import MapekEngine

# Configuración de red y Railway Proxy TCP
MQTT_BROKER = os.getenv("MQTT_HOST", os.getenv("MQTT_BROKER", "iriguchi.proxy.rlwy.net"))
MQTT_PORT = int(os.getenv("MQTT_PORT", "28182"))
MQTT_USER = os.getenv("MQTT_USER", "")
MQTT_PASSWORD = os.getenv("MQTT_PASSWORD", "")
MQTT_TOPIC_SUB = os.getenv("MQTT_TOPIC", "chancay/cuenca/tiempo_real/#")
MQTT_TOPIC_PUB = "chancay/actuadores/alerta/"

# Configuración Base de Datos PostgreSQL
DATABASE_URL = os.getenv("DATABASE_URL")
if DATABASE_URL and DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

DB_USER = os.getenv("DB_USER", "adminChancayHuaral")
DB_PASS = os.getenv("DB_PASS", "adminChancayHuaral123")
DB_NAME = os.getenv("DB_NAME", "chancayhuaral_auth")
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = int(os.getenv("DB_PORT", "5432"))

engine = MapekEngine()
app_state = {}

# ==========================================
# GESTOR DE CONEXIONES WEBSOCKET
# ==========================================
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        print(f"[WEBSOCKET] Cliente conectado. Total clientes: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            print(f"[WEBSOCKET] Cliente desconectado. Total clientes: {len(self.active_connections)}")

    async def broadcast(self, message: dict):
        """Envía el mensaje en tiempo real a todos los frontends conectados."""
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception as e:
                print(f"[WEBSOCKET-ERROR] Fallo al enviar a cliente: {e}")

manager_alertas = ConnectionManager()
manager_telemetria = ConnectionManager()

# ==========================================
# PERSISTENCIA Y MONITOR MAPE-K
# ==========================================
async def guardar_en_bd(data: SensorData, es_anomalia: bool, estado_mapek: int):
    """Guarda la lectura en PostgreSQL (Fase Knowledge del lazo MAPE-K)"""
    pool = app_state.get("db_pool")
    if not pool:
        print("[DB-ERROR] Imposible guardar: Pool de conexiones a la BD no disponible.")
        return

    try:
        async with pool.acquire() as connection:
            query = """
                INSERT INTO telemetria_cuenca 
                (node_id, origen, timestamp_ms, nivel_m, temp_ambiente_c, temp_agua_c, tds_ppm, ph, turbidez_ntu, alerta, estado_mapek)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11);
            """
            await connection.execute(
                query, 
                data.node_id, 
                data.origen, 
                data.timestamp_ms, 
                data.nivel_m, 
                data.temp_ambiente_c, 
                data.temp_agua_c, 
                data.tds_ppm, 
                data.ph, 
                data.turbidez_ntu, 
                es_anomalia, 
                estado_mapek
            )
    except Exception as e:
        print(f"[DB-ERROR] Error al insertar en PostgreSQL: {e}")

async def mqtt_listener():
    """Fase MONITOR del lazo autonomico MAPE-K"""
    while True:
        try:
            async with aiomqtt.Client(
                hostname=MQTT_BROKER, port=MQTT_PORT, 
                username=MQTT_USER if MQTT_USER else None, 
                password=MQTT_PASSWORD if MQTT_PASSWORD else None
            ) as client:
                print(f"[CAPA 3 - NETWORK] Conectado exitosamente al Broker Mosquitto ({MQTT_BROKER}:{MQTT_PORT})")
                await client.subscribe(MQTT_TOPIC_SUB)
                
                async for message in client.messages:
                    payload = message.payload.decode()
                    topic = message.topic.value
                    
                    try:
                        # 1. MONITOR
                        data_dict = json.loads(payload)
                        sensor_data = SensorData(**data_dict)
                        
                        # Solo si el JSON no trae node_id, extraerlo del final del tópico
                        if not sensor_data.node_id:
                            sensor_data.node_id = topic.split("/")[-1]

                        # Registrar la hora del último mensaje recibido por nodo para el estado ONLINE
                        app_state[f"last_seen_{sensor_data.node_id}"] = datetime.now()

                        # 2. ANALYZE
                        es_anomalia_ia = bool(engine.analyze(sensor_data)) # <-- Convertir a bool nativo de Python
                        estado_mapek, requiere_alerta = engine.evaluate_mapek_state(sensor_data, es_anomalia_ia)
                        estado_mapek = int(estado_mapek)

                        # 3. KNOWLEDGE
                        await guardar_en_bd(sensor_data, requiere_alerta, estado_mapek)
                        
                        # 4. BROADCAST TELEMETRÍA EN TIEMPO REAL (NUEVO)
                        # Envía TODOS los paquetes de sensores al canal /ws/telemetria
                        payload_telemetria = sensor_data.model_dump()
                        payload_telemetria["es_anomalia"] = es_anomalia_ia
                        payload_telemetria["estado_mapek"] = estado_mapek
                        await manager_telemetria.broadcast(payload_telemetria)

                        # 5. PLAN & EXECUTE (alertas)
                        if requiere_alerta:
                            print(f"[ALERTA MAPE-K] Anomalía detectada en {sensor_data.node_id} | Estado: {estado_mapek}")
                            alerta = AlertaOut(
                                comando="ACTIVAR_SIRENA_COMPUERTA",
                                motivo=f"Alerta nivel {estado_mapek} detectada por MAPE-K / IA",
                                severidad="CRITICA" if estado_mapek == 3 else "ALTA"
                            )

                            # A) Publicar por MQTT hacia los actuadores de campo
                            await client.publish(
                                f"{MQTT_TOPIC_PUB}{sensor_data.node_id}", 
                                payload=alerta.model_dump_json(), 
                                qos=1
                            )

                            # B) NOTIFICAR EN TIEMPO REAL AL FRONTEND VÍA WEBSOCKET
                            payload_ws = alerta.model_dump()
                            payload_ws["node_id"] = sensor_data.node_id
                            payload_ws["timestamp"] = datetime.now().isoformat()
                            await manager_alertas.broadcast(payload_ws)
                            
                    except ValidationError as e:
                        print(f"[SECURITY] Payload incompatible rechazado: {e}")
                    except json.JSONDecodeError:
                        print("[SECURITY] Payload no es JSON válido.")
                    except Exception as e:
                        print(f"[CRITICAL ERROR] Fallo en lazo MAPE-K: {e}")
                        
        except aiomqtt.MqttError as error:
            print(f"[NETWORK-WARN] Conexión perdida con Mosquitto ({error}). Reintentando en 5s...")
            await asyncio.sleep(5)

# ==========================================
# LIFESPAN & INSTANCIA FASTAPI
# ==========================================
@asynccontextmanager
async def lifespan(app: FastAPI):
    print("[DB] Creando pool de conexiones con PostgreSQL...")
    try:
        if DATABASE_URL:
            app_state["db_pool"] = await asyncpg.create_pool(dsn=DATABASE_URL)
        else:
            app_state["db_pool"] = await asyncpg.create_pool(
                user=DB_USER, password=DB_PASS, database=DB_NAME, host=DB_HOST, port=DB_PORT
            )
        print("[DB] Pool de PostgreSQL conectado correctamente.")
    except Exception as e:
        print(f"[DB-WARN] No se pudo conectar a PostgreSQL: {e}")
        app_state["db_pool"] = None
    
    task = asyncio.create_task(mqtt_listener())
    yield
    task.cancel()
    if app_state.get("db_pool"):
        await app_state["db_pool"].close()
        print("[DB] Pool de conexiones cerrado.")

app = FastAPI(title="Motor Autonómico MAPE-K - Yaku Qhawaq", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# ==========================================
# ENDPOINT WEBSOCKET 
# ==========================================
# Canal WebSocket para Alertas Críticas
@app.websocket("/ws/alertas")
async def websocket_alertas_endpoint(websocket: WebSocket):
    await manager_alertas.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager_alertas.disconnect(websocket)
    except Exception as e:
        manager_alertas.disconnect(websocket)

# Canal WebSocket para Telemetría en Vivo (Nivel, pH, Turbidez, etc.)
@app.websocket("/ws/telemetria")
async def websocket_telemetria_endpoint(websocket: WebSocket):
    await manager_telemetria.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager_telemetria.disconnect(websocket)
    except Exception as e:
        manager_telemetria.disconnect(websocket)

# ==========================================
# ENDPOINTS REST HTTP
# ==========================================
@app.get("/")
def root():
    return {"proyecto": "Yaku Qhawaq", "capa": "3 - Soporte a Servicios", "status": "online"}

@app.get("/telemetria/reciente")
async def obtener_telemetria(limit: int = 20):
    pool = app_state.get("db_pool")
    if not pool:
        raise HTTPException(status_code=503, detail="Base de datos no disponible")
        
    async with pool.acquire() as connection:
        rows = await connection.fetch(
            "SELECT * FROM telemetria_cuenca ORDER BY created_at DESC LIMIT $1;", limit
        )
        return [dict(row) for row in rows]

@app.get("/telemetria/historico")
async def obtener_telemetria_historico(
    desde: Optional[str] = None,
    hasta: Optional[str] = None,
    nodo_id: Optional[str] = None,
    limit: int = 500,
):
    pool = app_state.get("db_pool")
    if not pool:
        return []

    condiciones = []
    valores = []
    idx = 1

    if desde:
        condiciones.append(f"created_at >= ${idx}")
        valores.append(datetime.fromisoformat(desde.replace("Z", "+00:00")).replace(tzinfo=None))
        idx += 1
    if hasta:
        condiciones.append(f"created_at <= ${idx}")
        valores.append(datetime.fromisoformat(hasta.replace("Z", "+00:00")).replace(tzinfo=None))
        idx += 1
    if nodo_id:
        condiciones.append(f"node_id = ${idx}")
        valores.append(nodo_id)
        idx += 1

    where_clause = f"WHERE {' AND '.join(condiciones)}" if condiciones else ""
    valores.append(limit)

    query = f"""
        SELECT * FROM telemetria_cuenca
        {where_clause}
        ORDER BY created_at DESC
        LIMIT ${idx};
    """

    async with pool.acquire() as connection:
        rows = await connection.fetch(query, *valores)
        return [dict(row) for row in rows]

@app.post("/diagnostico", response_model=DiagnosticoOut)
async def diagnosticar_lectura(data: SensorData):
    es_anomalia, score = engine.analyze_con_score(data)
    return DiagnosticoOut(es_anomalia=es_anomalia, score=score)

@app.post("/telemetria/historico", status_code=201)
async def api_guardar_historico(payload: dict):
    try:
        sensor_data = SensorData(**payload)
        es_anomalia_ia = engine.analyze(sensor_data)
        estado_mapek, requiere_alerta = engine.evaluate_mapek_state(sensor_data, es_anomalia_ia)
        
        await guardar_en_bd(sensor_data, requiere_alerta, estado_mapek)
        return {"status": "success", "message": "Datos guardados exitosamente vía FastAPI"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error en inserción: {str(e)}")

@app.get("/nodos/estado")
async def obtener_estado_nodos():
    """Endpoint consultado por el Sidebar de Capa 4 para verificar la presencia de Capa 1"""
    ahora = datetime.now()
    
    # Evalúa el nodo principal
    ultimo_registro = app_state.get("last_seen_nodo_chancay_01")
    
    if ultimo_registro:
        diferencia_seg = (ahora - ultimo_registro).total_seconds()
        # Si envió un mensaje hace menos de 20 segundos, está ONLINE
        is_online = diferencia_seg < 20 
    else:
        is_online = False
        diferencia_seg = None

    return {
        "node_id": "nodo_chancay_01",
        "status": "ONLINE" if is_online else "OFFLINE",
        "segundos_desde_ultimo_envio": int(diferencia_seg) if diferencia_seg else "N/A"
    }