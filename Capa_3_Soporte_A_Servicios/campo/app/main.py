# =================================================================
# PROYECTO: Sistema IoT Autónomo - Cuenca Chancay-Huaral (Yaku Qhawaq)
# ARCHIVO:  app/main.py  (Capa 3 - Soporte a Servicios)
# ROL:      Middleware FastAPI + Lazo Autonómico MAPE-K + Persistencia
# =================================================================
#
# FLUJO DE DATOS (Capa 1 <-> Capa 4):
#
#   Capa 1 (ESP32 / simulador)
#        │  MQTT publish  → chancay/cuenca/tiempo_real/<nodo>   (telemetría)
#        ▼
#   Capa 2 (Broker Mosquitto, RFC de tópicos/ACL)
#        │  MQTT subscribe chancay/cuenca/#  (MONITOR)
#        ▼
#   Capa 3 (este microservicio)
#        ├─ ANALYZE  : Isolation Forest + reglas determinísticas
#        ├─ KNOWLEDGE: INSERT en PostgreSQL (telemetria_cuenca)
#        ├─ PLAN     : clasificación de severidad por estado MAPE-K
#        └─ EXECUTE  : publish MQTT → chancay/actuadores/alerta/<nodo>
#                      + broadcast WebSocket → Capa 4 (telemetría/alertas)
#        ▼
#   Capa 4 (React)  → REST /telemetria/*, /nodos/estado, WS /ws/*
#                      → telecontrol → POST /telecontrol/historial
#                                    + MQTT chancay/actuadores/comando/<nodo>
#        ▲
#        └── el retorno Capa 4 → Capa 1 se cierra con los comandos MQTT
#            (el ESP32 está suscrito a chancay/actuadores/alerta/<nodo>)
# =================================================================

import asyncio
import csv
import io
import json
import os
import warnings
from datetime import datetime, timezone
from typing import Optional, List
from contextlib import asynccontextmanager

import aiomqtt
import asyncpg
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import ValidationError

warnings.filterwarnings("ignore", message="X does not have valid feature names")

from app.schemas import (
    SensorData,
    AlertaOut,
    DiagnosticoOut,
    SaludHidricaOut,
    TelecontrolComandoIn,
    TelecontrolComandoOut,
    TelecontrolAccionIn,
)
from app.services.mapek_engine import MapekEngine
from app.db_schema import ensure_schema

# -----------------------------------------------------------------
# CONFIGURACIÓN DE RED (Broker MQTT en Railway / Mosquitto local)
# -----------------------------------------------------------------
MQTT_BROKER = os.getenv("MQTT_HOST", os.getenv("MQTT_BROKER", "iriguchi.proxy.rlwy.net"))
MQTT_PORT = int(os.getenv("MQTT_PORT", "28182"))
MQTT_USER = os.getenv("MQTT_USER", "backend_central")
MQTT_PASSWORD = os.getenv("MQTT_PASSWORD", "backendChancay2026")
# Suscribe a TODA la telemetría de la cuenca (tiempo real + histórico de la Capa 2)
MQTT_TOPIC_SUB = os.getenv("MQTT_TOPIC", "chancay/cuenca/#")
# Base para publicar comandos hacia los actuadores de la Capa 1
MQTT_TOPIC_PUB_ALERTA = "chancay/actuadores/alerta/"
# Base para publicar comandos inversos de telecontrol (Capa 4 -> Capa 1)
MQTT_TOPIC_PUB_COMANDO = "chancay/actuadores/comando/"

# -----------------------------------------------------------------
# CONFIGURACIÓN DE BASE DE DATOS (PostgreSQL / Railway)
# -----------------------------------------------------------------
DATABASE_URL = os.getenv("DATABASE_URL")
if DATABASE_URL and DATABASE_URL.startswith("postgres://"):
    # asyncpg no acepta el esquema heredado "postgres://" de Heroku/Railway
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

DB_USER = os.getenv("DB_USER", "adminChancayHuaral")
DB_PASS = os.getenv("DB_PASS", "adminChancayHuaral123")
DB_NAME = os.getenv("DB_NAME", "chancayhuaral_auth")
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = int(os.getenv("DB_PORT", "5432"))

# Umbrales operacionales de la cuenca (alineados con Capa 1 y Capa 4)
NIVEL_CRITICO_M = 0.40        # distancia mínima puente-agua (inundación)
NIVEL_DESBORDE_M = 3.50       # nivel máximo de cauce (desborde)
TDS_UMBRAL_ALTO = 500.0       # ppm
PH_MIN, PH_MAX = 6.5, 8.5
TURBIDEZ_UMBRAL = 50.0        # NTU

engine = MapekEngine()
app_state = {}


# ============================================================
# GESTOR DE CONEXIONES WEBSOCKET (Capa 3 -> Capa 4)
# ============================================================
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
        desconectados = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception as e:
                print(f"[WEBSOCKET-ERROR] Fallo al enviar a cliente: {e}")
                desconectados.append(connection)
        for c in desconectados:
            self.disconnect(c)


manager_alertas = ConnectionManager()
manager_telemetria = ConnectionManager()


# ============================================================
# PERSISTENCIA (Fase KNOWLEDGE del lazo MAPE-K)
# ============================================================
async def guardar_en_bd(data: SensorData, alerta: bool, es_anomalia: bool, estado_mapek: int):
    """
    Guarda la lectura en PostgreSQL (Fase Knowledge del lazo MAPE-K).

    `alerta`      -> flag operativo de la cuenca (reglas determinísticas > 0).
    `es_anomalia` -> veredicto del Isolation Forest (IA multivariable).
    Se persisten en columnas DISTINTAS: mezclarlos falseaba la analítica de
    anomalías de la IA en el histórico consultado por la Capa 4.
    """
    pool = app_state.get("db_pool")
    if not pool:
        print("[DB-ERROR] Imposible guardar: Pool de conexiones a la BD no disponible.")
        return

    try:
        async with pool.acquire() as connection:
            query = """
                INSERT INTO telemetria_cuenca 
                (node_id, origen, timestamp_ms, nivel_m, temp_ambiente_c, temp_agua_c,
                 tds_ppm, ph, turbidez_ntu, alerta, estado_mapek, es_anomalia)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12);
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
                bool(alerta),
                int(estado_mapek),
                bool(es_anomalia),
            )
    except Exception as e:
        print(f"[DB-ERROR] Error al insertar en PostgreSQL: {e}")


async def registrar_comando_bd(comando: TelecontrolComandoIn) -> Optional[TelecontrolComandoOut]:
    """
    Persiste (idempotente) un comando de telecontrol validado en la bitácora
    de auditoría `telecontrol_historial`. Se invoca tanto desde el endpoint
    REST (Capa 4) como desde el lazo MQTT (comandos publicados a campo).
    """
    pool = app_state.get("db_pool")
    if not pool:
        print("[DB-WARN] Sin pool: comando de telecontrol no persistido.")
        return None

    try:
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
    except Exception as e:
        print(f"[DB-ERROR] Error al registrar comando de telecontrol: {e}")
        return None


# ============================================================
# LAZO AUTONÓMICO MAPE-K (MONITOR + ANALYZE + PLAN + EXECUTE)
# ============================================================
async def procesar_lectura(sensor_data: SensorData, client_ctx=None):
    """
    Ejecuta el ciclo MAPE-K completo para una lectura de telemetría y devuelve
    el payload enriquecido que se difunde a la Capa 4.

    Se reutiliza tanto desde el listener MQTT (client_ctx = cliente aiomqtt
    conectado) como desde el endpoint HTTP POST /telemetria/historico.
    """
    # 1. ANALYZE — IA no supervisada (Isolation Forest)
    es_anomalia_ia = bool(engine.analyze(sensor_data))

    # 2. ANALYZE + PLAN — reglas determinísticas + clasificación MAPE-K
    estado_mapek, requiere_alerta = engine.evaluate_mapek_state(sensor_data, es_anomalia_ia)
    estado_mapek = int(estado_mapek)
    requiere_alerta = bool(requiere_alerta)

    # 3. KNOWLEDGE — persistencia en PostgreSQL
    #    `alerta` (reglas) y `es_anomalia` (IA) son columnas INDEPENDIENTES.
    await guardar_en_bd(sensor_data, requiere_alerta, es_anomalia_ia, estado_mapek)

    # 4. Payload enriquecido para difusión (Capa 4)
    payload = sensor_data.model_dump()
    payload["es_anomalia"] = es_anomalia_ia
    payload["estado_mapek"] = estado_mapek
    payload["alerta"] = requiere_alerta
    payload["severidad"] = {
        0: "INFO", 1: "ADVERTENCIA", 2: "CRITICO", 3: "CRITICO"
    }.get(estado_mapek, "INFO")

    # 5. EXECUTE — difusión (broadcast WS) de la telemetría
    await manager_telemetria.broadcast(payload)

    # 6. PLAN & EXECUTE — comando hacia actuadores de Capa 1 + alerta a Capa 4
    #
    # CORRECCIÓN DEL LAZO INVERSO (Capa 3 -> Capa 1):
    # el bloque anterior evaluaba `if estado_mapek in (1,2,3) ... else DESACTIVAR`
    # DENTRO de `if requiere_alerta`, y `requiere_alerta == (estado_mapek > 0)`.
    # Por tanto la rama `else` (DESACTIVAR) era CÓDIGO MUERTO y la sirena del
    # ESP32 nunca se despejaba automáticamente al volver la cuenca a estado
    # NORMAL. Ahora la transición se evalúa SIEMPRE y solo se emite el comando
    # cuando el estado cambia (evita inundar el broker con órdenes idénticas).
    estado_anterior = app_state.get(f"estado_mapek_{sensor_data.node_id}")

    if estado_mapek != estado_anterior:
        app_state[f"estado_mapek_{sensor_data.node_id}"] = estado_mapek

        comando_txt = "ACTIVAR" if estado_mapek in (1, 2, 3) else "DESACTIVAR"
        motivo = (
            f"Alerta nivel {estado_mapek} detectada por MAPE-K / IA"
            if comando_txt == "ACTIVAR"
            else "Cuenca en estado NORMAL: se despeja la alerta del nodo"
        )
        alerta = AlertaOut(
            comando=comando_txt,
            motivo=motivo,
            severidad="CRITICA" if estado_mapek == 3 else ("ALTA" if estado_mapek == 2 else "MEDIA"),
        )

        if comando_txt == "ACTIVAR":
            print(f"[ALERTA MAPE-K] Anomalía detectada en {sensor_data.node_id} | Estado: {estado_mapek}")
        else:
            print(f"[ALERTA MAPE-K] {sensor_data.node_id} normalizado -> se publica DESACTIVAR (estaba en {estado_anterior}).")

        # A) Publicar por MQTT hacia los actuadores de campo (Capa 1)
        if client_ctx is not None:
            try:
                await client_ctx.publish(
                    f"{MQTT_TOPIC_PUB_ALERTA}{sensor_data.node_id}",
                    payload=alerta.model_dump_json(),
                    qos=1,
                )
            except Exception as e:
                print(f"[MQTT-WARN] No se pudo publicar la alerta a campo: {e}")

        # B) Notificar en tiempo real al Frontend vía WebSocket (Capa 4)
        payload_ws = alerta.model_dump()
        payload_ws["node_id"] = sensor_data.node_id
        payload_ws["nodo_id"] = sensor_data.node_id
        payload_ws["estado_mapek"] = estado_mapek
        payload_ws["mensaje"] = alerta.motivo
        payload_ws["timestamp"] = datetime.now(timezone.utc).isoformat()
        await manager_alertas.broadcast(payload_ws)

    return payload


async def mqtt_listener():
    """Fase MONITOR del lazo autonómico MAPE-K (suscripción permanente)."""
    while True:
        try:
            async with aiomqtt.Client(
                hostname=MQTT_BROKER, port=MQTT_PORT,
                username=MQTT_USER if MQTT_USER else None,
                password=MQTT_PASSWORD if MQTT_PASSWORD else None,
            ) as client:
                print(f"[CAPA 3 - NETWORK] Conectado al Broker Mosquitto ({MQTT_BROKER}:{MQTT_PORT})")
                await client.subscribe(MQTT_TOPIC_SUB)

                async for message in client.messages:
                    payload = message.payload.decode()
                    topic = message.topic.value

                    try:
                        # Ignorar los tópicos de actuadores/comandos (no son telemetría)
                        if topic.startswith("chancay/actuadores/"):
                            continue

                        # 1. MONITOR
                        data_dict = json.loads(payload)
                        sensor_data = SensorData(**data_dict)

                        # Registrar la hora del último mensaje recibido por nodo (estado ONLINE)
                        app_state[f"last_seen_{sensor_data.node_id}"] = datetime.now(timezone.utc)

                        # 2..6 MAPE-K completo
                        await procesar_lectura(sensor_data, client_ctx=client)

                    except ValidationError as e:
                        print(f"[SECURITY] Payload incompatible rechazado: {e}")
                    except json.JSONDecodeError:
                        print("[SECURITY] Payload no es JSON válido.")
                    except Exception as e:
                        print(f"[CRITICAL ERROR] Fallo en lazo MAPE-K: {e}")

        except aiomqtt.MqttError as error:
            print(f"[NETWORK-WARN] Conexión perdida con Mosquitto ({error}). Reintentando en 5s...")
            await asyncio.sleep(5)
        except Exception as error:
            print(f"[NETWORK-ERROR] Error inesperado en listener MQTT ({error}). Reintentando en 5s...")
            await asyncio.sleep(5)


# ============================================================
# LIFESPAN & INSTANCIA FASTAPI
# ============================================================
@asynccontextmanager
async def lifespan(app: FastAPI):
    print("[DB] Creando pool de conexiones con PostgreSQL...")
    try:
        if DATABASE_URL:
            app_state["db_pool"] = await asyncpg.create_pool(dsn=DATABASE_URL, min_size=1, max_size=5)
        else:
            app_state["db_pool"] = await asyncpg.create_pool(
                user=DB_USER, password=DB_PASS, database=DB_NAME, host=DB_HOST, port=DB_PORT,
                min_size=1, max_size=5,
            )
        print("[DB] Pool de PostgreSQL conectado correctamente.")
        # Autoprovisión idempotente del esquema (Railway arranca con BD vacía)
        try:
            await ensure_schema(app_state["db_pool"])
        except Exception as e:
            print(f"[DB-WARN] No se pudo asegurar el esquema de la cuenca: {e}")
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
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)


# ============================================================
# ENDPOINTS WEBSOCKET (Capa 3 -> Capa 4)
# ============================================================
@app.websocket("/ws/alertas")
async def websocket_alertas_endpoint(websocket: WebSocket):
    await manager_alertas.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager_alertas.disconnect(websocket)
    except Exception:
        manager_alertas.disconnect(websocket)


@app.websocket("/ws/telemetria")
async def websocket_telemetria_endpoint(websocket: WebSocket):
    await manager_telemetria.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager_telemetria.disconnect(websocket)
    except Exception:
        manager_telemetria.disconnect(websocket)


# ============================================================
# ENDPOINTS REST HTTP
# ============================================================
@app.get("/")
def root():
    return {
        "proyecto": "Yaku Qhawaq",
        "capa": "3 - Soporte a Servicios",
        "status": "online",
        "mqtt_broker": f"{MQTT_BROKER}:{MQTT_PORT}",
    }


def serializar_fila_bd(row) -> dict:
    """Convierte tipos no serializables (datetime/Decimal) a texto ISO."""
    item = dict(row)
    for clave, valor in item.items():
        if isinstance(valor, datetime):
            item[clave] = valor.isoformat()
        elif hasattr(valor, "real") and not isinstance(valor, (int, float, bool, str)) and valor is not None:
            # Decimal / numpy scalars
            item[clave] = float(valor)
    return item


@app.get("/nodos/estado")
async def obtener_estado_nodos():
    """
    Estado de presencia de los nodos (Capa 1) usando el último instante en que
    cada nodo publicó telemetría por MQTT. Consultado por el Sidebar (Capa 4).
    """
    ahora = datetime.now(timezone.utc)
    nodos = {}
    for clave, valor in list(app_state.items()):
        if not clave.startswith("last_seen_"):
            continue
        node_id = clave.replace("last_seen_", "")
        diferencia_seg = (ahora - valor).total_seconds()
        is_online = diferencia_seg < 20
        nodos[node_id] = {
            "node_id": node_id,
            "status": "ONLINE" if is_online else "OFFLINE",
            "is_online": is_online,
            "last_seen": valor.isoformat(),
            "segundos_desde_ultimo_envio": int(diferencia_seg),
        }

    principal = nodos.get("nodo_chancay_01", {
        "node_id": "nodo_chancay_01",
        "status": "OFFLINE",
        "is_online": False,
        "last_seen": None,
        "segundos_desde_ultimo_envio": None,
    })

    return {**principal, "nodos": nodos}


@app.get("/telemetria/reciente")
async def obtener_telemetria(limit: int = 20):
    pool = app_state.get("db_pool")
    if not pool:
        raise HTTPException(status_code=503, detail="Base de datos no disponible")

    async with pool.acquire() as connection:
        rows = await connection.fetch(
            "SELECT * FROM telemetria_cuenca ORDER BY created_at DESC LIMIT $1;", limit
        )
        return [serializar_fila_bd(row) for row in rows]


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
        return [serializar_fila_bd(row) for row in rows]


@app.post("/diagnostico", response_model=DiagnosticoOut)
async def diagnosticar_lectura(data: SensorData):
    es_anomalia, score = engine.analyze_con_score(data)
    return DiagnosticoOut(es_anomalia=bool(es_anomalia), score=float(score) if score is not None else None)


@app.get("/export/csv")
async def exportar_csv(
    nodo_id: Optional[str] = None,
    desde: Optional[str] = None,
    hasta: Optional[str] = None,
    limit: int = 5000,
):
    """
    Exportación CSV server-side del histórico de telemetría (Capa 4 -> Capa 3).
    Se sirve como StreamingResponse para no materializar todo el dataset en
    memoria y permitir la descarga directa desde el navegador (Content-Disposition).
    """
    rows = await obtener_telemetria_historico(desde=desde, hasta=hasta, nodo_id=nodo_id, limit=limit)

    columnas = ["id", "node_id", "origen", "timestamp_ms", "nivel_m", "temp_ambiente_c",
                "temp_agua_c", "tds_ppm", "ph", "turbidez_ntu", "alerta", "estado_mapek",
                "es_anomalia", "created_at"]

    def generar():
        buffer = io.StringIO()
        writer = csv.writer(buffer)
        writer.writerow(columnas)
        yield buffer.getvalue()
        buffer.seek(0)
        buffer.truncate(0)
        for fila in rows:
            writer.writerow([fila.get(c, "") for c in columnas])
            yield buffer.getvalue()
            buffer.seek(0)
            buffer.truncate(0)

    nombre = f"yaku_qhawaq_telemetria_{nodo_id or 'cuenca'}.csv"
    return StreamingResponse(
        generar(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{nombre}"'},
    )


@app.post("/telemetria/historico", status_code=201)
async def api_guardar_historico(payload: dict):
    """
    Ingesta HTTP alternativa (Capa 2 -> Capa 3) para nodos o gateways sin
    soporte MQTT. Ejecuta el mismo lazo MAPE-K que el listener MQTT.
    """
    try:
        sensor_data = SensorData(**payload)
        resultado = await procesar_lectura(sensor_data, client_ctx=None)
        return {"status": "success", "message": "Datos guardados exitosamente vía FastAPI",
                "estado_mapek": resultado["estado_mapek"], "es_anomalia": resultado["es_anomalia"]}
    except ValidationError as e:
        raise HTTPException(status_code=422, detail=f"Payload inválido: {e.errors()}")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error en inserción: {str(e)}")


# ============================================================
# SALUD HÍDRICA (consumido por el Dashboard de la Capa 4)
# ============================================================
@app.get("/telemetria/salud", response_model=SaludHidricaOut)
async def obtener_salud_hidrica(limit: int = 200):
    """
    Calcula un índice global de salud hídrica a partir de las últimas `limit`
    lecturas persistidas. Devuelve el porcentaje, el estado cualitativo y el
    porcentaje de anomalías detectadas en la ventana analizada.
    """
    pool = app_state.get("db_pool")
    if not pool:
        return SaludHidricaOut(salud_hidrica_pct=0.0, estado="SIN DATOS", anomalias_pct=0.0, total_lecturas=0)

    try:
        async with pool.acquire() as connection:
            rows = await connection.fetch(
                "SELECT alerta, es_anomalia FROM telemetria_cuenca ORDER BY created_at DESC LIMIT $1;",
                limit,
            )
    except Exception as e:
        print(f"[DB-WARN] No se pudo calcular la salud hídrica: {e}")
        return SaludHidricaOut(salud_hidrica_pct=0.0, estado="SIN DATOS", anomalias_pct=0.0, total_lecturas=0)

    total = len(rows)
    if total == 0:
        return SaludHidricaOut(salud_hidrica_pct=0.0, estado="SIN DATOS", anomalias_pct=0.0, total_lecturas=0)

    anomalias = sum(1 for r in rows if r["alerta"] or r["es_anomalia"])
    anomalias_pct = (anomalias / total) * 100.0
    salud_pct = max(0.0, 100.0 - anomalias_pct * 2.0)

    if salud_pct >= 90:
        estado = "ÓPTIMO"
    elif salud_pct >= 75:
        estado = "ESTABLE"
    elif salud_pct >= 50:
        estado = "ADVERTENCIA"
    else:
        estado = "CRÍTICO"

    return SaludHidricaOut(
        salud_hidrica_pct=round(salud_pct, 1),
        estado=estado,
        anomalias_pct=round(anomalias_pct, 1),
        total_lecturas=total,
    )


# ============================================================
# TELECONTROL (Capa 4 -> Capa 3 -> Capa 1)
# ============================================================
@app.post("/telecontrol/comando", response_model=TelecontrolComandoOut, status_code=201)
async def enviar_comando_telecontrol(accion: TelecontrolAccionIn):
    """
    Recibe un comando manual del operador (Capa 4), lo publica por MQTT hacia
    los actuadores de campo (Capa 1) en `chancay/actuadores/comando/<nodo>` y
    registra el evento en la bitácora de auditoría. Devuelve el registro creado.
    """
    import uuid

    comando = TelecontrolComandoIn(
        comando_id=accion.comando_id or f"cmd_{uuid.uuid4().hex[:12]}",
        nodo_id=accion.nodo_id,
        actuador=accion.actuador,
        accion=accion.accion,
        operador=accion.operador or "operador_sala_monitoreo",
        origen=accion.origen or "panel_telecontrol_manual",
        # ts_comando es BIGINT en PostgreSQL (epoch ms), no un datetime.
        ts_comando=int(datetime.now(timezone.utc).timestamp() * 1000),
    )

    # EXECUTE — publicar el comando inverso hacia la Capa 1
    mqtt_ok = await publicar_comando_campo(comando)
    if not mqtt_ok:
        print(f"[TELECONTROL-WARN] Comando {comando.comando_id} no pudo publicarse por MQTT (¿broker caído?).")

    registro = await registrar_comando_bd(comando)
    if registro is None:
        # Sin BD disponible: devolvemos un eco para no romper la UX del operador
        registro = TelecontrolComandoOut(
            id=-1, timestamp_registro=datetime.now(timezone.utc), **comando.model_dump()
        )
    return registro


@app.post("/telecontrol/historial", response_model=TelecontrolComandoOut, status_code=201)
async def registrar_comando_telecontrol(comando: TelecontrolComandoIn):
    """Persistencia idempotente de auditoría (compatible con integraciones directas)."""
    registro = await registrar_comando_bd(comando)
    if registro is None:
        return TelecontrolComandoOut(id=-1, timestamp_registro=datetime.now(timezone.utc), **comando.model_dump())
    return registro


@app.get("/telecontrol/historial", response_model=List[TelecontrolComandoOut])
async def obtener_historial_telecontrol(nodo_id: Optional[str] = None, limit: int = 100):
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


async def publicar_comando_campo(comando: TelecontrolComandoIn) -> bool:
    """
    Publica un comando de telecontrol (activar/desactivar) sobre el tópico
    `chancay/actuadores/comando/<nodo_id>`, que el firmware ESP32 (Capa 1)
    interpreta para accionar la sirena/buzzer. Conexión MQTT efímera.
    """
    payload = json.dumps({
        "comando_id": comando.comando_id,
        "accion": comando.accion.upper(),
        "actuador": comando.actuador,
        "operador": comando.operador,
        "origen": comando.origen,
    })
    try:
        async with aiomqtt.Client(
            hostname=MQTT_BROKER, port=MQTT_PORT,
            username=MQTT_USER if MQTT_USER else None,
            password=MQTT_PASSWORD if MQTT_PASSWORD else None,
        ) as client:
            await client.publish(f"{MQTT_TOPIC_PUB_COMANDO}{comando.nodo_id}", payload=payload, qos=1)
        return True
    except Exception as e:
        print(f"[TELECONTROL-ERROR] Fallo al publicar comando a campo: {e}")
        return False
