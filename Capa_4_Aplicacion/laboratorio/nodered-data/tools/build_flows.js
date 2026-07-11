#!/usr/bin/env node
/**
 * =================================================================
 * PROYECTO   : Sistema IoT Autónomo - Cuenca Chancay-Huaral
 * MÓDULO     : Capa 4 - Aplicación (Backend Node-RED)
 * ARCHIVO    : tools/build_flows.js
 *
 * PROPÓSITO
 * ---------
 * Este script GENERA de forma determinística el archivo
 * `nodered-data/flows.json` (y su acompañante `flows_cred.json`).
 *
 * Se optó por "compilar" el flujo en lugar de editarlo a mano
 * directamente en JSON plano por dos razones de ingeniería:
 *
 *   1. Trazabilidad: el flujo completo (40+ nodos) queda descrito
 *      como código versionable, documentado y revisable en PRs.
 *   2. Seguridad: las credenciales del broker MQTT (usuario
 *      `dashboard_nodered`, ver Capa_2/postgres/init.sql) se cifran
 *      aquí usando EXACTAMENTE el mismo algoritmo AES-256-CTR que
 *      usa el runtime de Node-RED (ver `encryptCredentials`), de
 *      forma que el archivo `flows_cred.json` resultante es
 *      100% compatible y funcional al importar sin pasos manuales,
 *      siempre que `credentialSecret` en `settings.js` coincida.
 *
 * USO
 * ---
 *   node tools/build_flows.js
 *
 * Esto (re)genera:
 *   ../flows.json
 *   ../flows_cred.json
 *
 * NOTA: Si cambias el `credentialSecret` en settings.js, DEBES
 * actualizar la constante CREDENTIAL_SECRET de este script y
 * volver a ejecutarlo, o las credenciales MQTT dejarán de
 * descifrarse correctamente.
 * =================================================================
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// -----------------------------------------------------------------
// 0. CONFIGURACIÓN GLOBAL DEL GENERADOR
// -----------------------------------------------------------------

// Debe coincidir con settings.js -> credentialSecret
const CREDENTIAL_SECRET =
  process.env.NODE_RED_CREDENTIAL_SECRET || "ChancayHuaralYakuQhawaq2026";

const MQTT_BROKER_HOST = process.env.MQTT_BROKER_HOST || "broker_chancay_huaral";
const MQTT_BROKER_PORT = "1883";
const MQTT_DASHBOARD_USER = "dashboard_nodered";
const MQTT_DASHBOARD_PASS = "dashboardChancay2026";

const MOTOR_IA_BASE_URL = "http://motor_ia_chancay:8000";

// -----------------------------------------------------------------
// 1. UTILIDADES DE CONSTRUCCIÓN (IDs, cifrado, helpers)
// -----------------------------------------------------------------

let seq = 1;
/** Genera IDs cortos y estables tipo Node-RED (hex de 16 chars). */
function nid(label) {
  const base = `yq-${seq++}-${label}`;
  return crypto.createHash("md5").update(base).digest("hex").slice(0, 16);
}

/** Replica EXACTA del cifrado de credenciales del runtime real de Node-RED
 *  (IV en hex + ciphertext en base64, concatenados como string). */
function encryptCredentials(secret, credentialsMap) {
  const encryptionKey = crypto.createHash("sha256").update(secret).digest();
  const initVector = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-ctr", encryptionKey, initVector);
  let result = cipher.update(JSON.stringify(credentialsMap), "utf8", "base64") + cipher.final("base64");
  result = initVector.toString("hex") + result;
  return result;
}

const nodes = [];
function add(node) {
  nodes.push(node);
  return node.id;
}

// -----------------------------------------------------------------
// 2. TABS (Pestañas del editor Node-RED)
// -----------------------------------------------------------------

const tabIngesta = nid("tab-ingesta");
const tabAlertas = nid("tab-alertas");
const tabApi = nid("tab-api");
const tabTelecontrol = nid("tab-telecontrol");

add({
  id: tabIngesta,
  type: "tab",
  label: "01 - Ingesta MQTT y Diagnóstico IA",
  disabled: false,
  info:
    "## Ingesta MQTT y Diagnóstico IA\n\n" +
    "Se suscribe al Broker MQTT (`broker_chancay_huaral:1883`) para recibir la " +
    "telemetría en tiempo real de los nodos de la cuenca (tópico " +
    "`chancay/cuenca/tiempo_real/#`).\n\n" +
    "Cada lectura se normaliza, se envía al microservicio de IA " +
    "`motor_ia_chancay` (Isolation Forest, endpoint `POST /diagnostico`) " +
    "para obtener un veredicto de anomalía independiente, se fusiona con " +
    "un índice de Salud Hídrica calculado localmente, se cachea en el " +
    "contexto global y se retransmite en vivo al Frontend vía WebSocket " +
    "(`/ws/telemetria`).\n\n" +
    "También escucha directamente el tópico `chancay/actuadores/alerta/#` " +
    "en el cual el propio lazo MAPE-K de la Capa 3 publica sus veredictos " +
    "críticos, para no perder ninguna alerta aunque el Frontend no esté " +
    "conectado en ese instante.",
});

add({
  id: tabAlertas,
  type: "tab",
  label: "02 - Motor de Alertas",
  disabled: false,
  info:
    "## Motor de Alertas\n\n" +
    "Punto único de clasificación de severidad (`CRITICO` / `ADVERTENCIA` / " +
    "`INFO`) y persistencia en memoria (contexto global `alertas_historial`, " +
    "respaldado en disco vía `contextStorage`). Alimentado por dos fuentes " +
    "(Tab 01): diagnóstico IA vía HTTP y alertas MQTT directas del motor IA.",
});

add({
  id: tabApi,
  type: "tab",
  label: "03 - API REST /api (CORS)",
  disabled: false,
  info:
    "## API REST pública para el Frontend Yaku Qhawaq\n\n" +
    "Todos los endpoints están bajo el prefijo `/api` y heredan la " +
    "configuración global `httpNodeCors` definida en `settings.js` " +
    "(permite `GET, POST, PUT, DELETE, OPTIONS` desde cualquier origen, " +
    "ideal para desarrollo local del Frontend en Vite `:5173` y producción " +
    "servida por NGINX en `:8080`).",
});

add({
  id: tabTelecontrol,
  type: "tab",
  label: "04 - Telecontrol (Comandos Inversos)",
  disabled: false,
  info:
    "## Telecontrol Manual\n\n" +
    "Permite al operador anular manualmente el sistema autónomo, " +
    "publicando comandos MQTT inversos hacia los actuadores simulados " +
    "(Sirena / Compuerta) en el tópico `chancay/actuadores/comando/<nodo_id>`. " +
    "Toda acción queda auditada en `telecontrol_historial`.",
});

// -----------------------------------------------------------------
// 3. CONFIG NODES GLOBALES (Broker MQTT + WebSocket listeners)
// -----------------------------------------------------------------

const brokerCfgId = nid("broker-cfg");
add({
  id: brokerCfgId,
  type: "mqtt-broker",
  name: "Broker Chancay-Huaral (broker_chancay_huaral:1883)",
  broker: MQTT_BROKER_HOST,
  port: MQTT_BROKER_PORT,
  clientid: "nodered_yaku_qhawaq",
  autoConnect: true,
  usetls: false,
  protocolVersion: "4",
  keepalive: "30",
  cleansession: true,
  birthTopic: "",
  closeTopic: "",
  willTopic: "",
  userProps: "",
  sessionExpiry: "",
});

const credentialsMap = {
  [brokerCfgId]: {
    user: MQTT_DASHBOARD_USER,
    password: MQTT_DASHBOARD_PASS,
  },
};

const wsTelemetriaId = nid("ws-telemetria");
add({
  id: wsTelemetriaId,
  type: "websocket-listener",
  path: "/ws/telemetria",
  wholemsg: "false",
});

const wsAlertasId = nid("ws-alertas");
add({
  id: wsAlertasId,
  type: "websocket-listener",
  path: "/ws/alertas",
  wholemsg: "false",
});

// -----------------------------------------------------------------
// 4. TAB 01 · INGESTA MQTT + DIAGNÓSTICO IA
// -----------------------------------------------------------------

const mqttInTelemetria = nid("mqtt-in-telemetria");
add({
  id: mqttInTelemetria,
  type: "mqtt in",
  z: tabIngesta,
  name: "MQTT · Telemetría Tiempo Real",
  topic: "chancay/cuenca/tiempo_real/#",
  qos: "1",
  datatype: "auto-detect",
  broker: brokerCfgId,
  nl: false,
  rap: true,
  rh: 0,
  inputs: 0,
  x: 160,
  y: 100,
  wires: [[]],
});

const fnNormalizarLectura = nid("fn-normalizar-lectura");
add({
  id: fnNormalizarLectura,
  type: "function",
  z: tabIngesta,
  name: "Normalizar Lectura",
  info:
    "Extrae el `nodo_id` desde el tópico MQTT, valida el JSON recibido y " +
    "construye un objeto de lectura estandarizado. Si el payload no es un " +
    "JSON válido o carece de campos obligatorios, descarta el mensaje " +
    "(mitigación STRIDE - Tampering) y lo registra en el nodo de estado.",
  func:
    "// Normaliza la lectura entrante y prepara el body para el motor de IA\n" +
    "let data;\n" +
    "try {\n" +
    "    data = (typeof msg.payload === 'string') ? JSON.parse(msg.payload) : msg.payload;\n" +
    "} catch (e) {\n" +
    "    node.warn('Payload MQTT no es JSON válido: ' + msg.payload);\n" +
    "    return null;\n" +
    "}\n" +
    "\n" +
    "const REQUIRED = ['nivel_m','temp_ambiente_c','temp_agua_c','tds_ppm','ph','turbidez_ntu'];\n" +
    "const faltantes = REQUIRED.filter(k => typeof data[k] !== 'number');\n" +
    "if (faltantes.length > 0) {\n" +
    "    node.warn('Lectura descartada. Campos inválidos/faltantes: ' + faltantes.join(', '));\n" +
    "    return null;\n" +
    "}\n" +
    "\n" +
    "const nodoId = msg.topic ? msg.topic.split('/').pop() : (data.node_id || 'nodo_desconocido');\n" +
    "\n" +
    "const lectura = {\n" +
    "    nodo_id: nodoId,\n" +
    "    ts: Date.now(),\n" +
    "    nivel_m: data.nivel_m,\n" +
    "    temp_ambiente_c: data.temp_ambiente_c,\n" +
    "    temp_agua_c: data.temp_agua_c,\n" +
    "    tds_ppm: data.tds_ppm,\n" +
    "    ph: data.ph,\n" +
    "    turbidez_ntu: data.turbidez_ntu\n" +
    "};\n" +
    "\n" +
    "msg.lectura = lectura;\n" +
    "// Body exacto que espera el esquema Pydantic SensorData del motor_ia_chancay\n" +
    "msg.payload = {\n" +
    "    nivel_m: lectura.nivel_m,\n" +
    "    temp_ambiente_c: lectura.temp_ambiente_c,\n" +
    "    temp_agua_c: lectura.temp_agua_c,\n" +
    "    tds_ppm: lectura.tds_ppm,\n" +
    "    ph: lectura.ph,\n" +
    "    turbidez_ntu: lectura.turbidez_ntu\n" +
    "};\n" +
    "return msg;\n",
  outputs: 1,
  timeout: 0,
  noerr: 0,
  initialize: "",
  finalize: "",
  libs: [],
  x: 400,
  y: 100,
  wires: [[]],
});

const httpReqDiagnostico = nid("http-req-diagnostico");
add({
  id: httpReqDiagnostico,
  type: "http request",
  z: tabIngesta,
  name: "POST → motor_ia_chancay /diagnostico",
  method: "POST",
  ret: "obj",
  paytoqs: "ignore",
  url: `${MOTOR_IA_BASE_URL}/diagnostico`,
  tls: "",
  persist: false,
  proxy: "",
  insecureHTTPParser: false,
  authType: "",
  senderr: false,
  headers: [{ keyType: "Content-Type", keyValue: "", valueType: "other", valueValue: "application/json" }],
  x: 660,
  y: 100,
  wires: [[]],
});

const fnFusionarDiagnostico = nid("fn-fusionar-diagnostico");
add({
  id: fnFusionarDiagnostico,
  type: "function",
  z: tabIngesta,
  name: "Fusionar Diagnóstico IA + Salud Hídrica",
  info:
    "Combina la lectura normalizada con la respuesta del microservicio de " +
    "IA (`es_anomalia`, `score`) y calcula un Índice de Salud Hídrica (0-100%) " +
    "en base a rangos técnicos de referencia (pH, TDS, turbidez, nivel). " +
    "Si `motor_ia_chancay` no respondiera (timeout de red), aplica un modo " +
    "'fail-safe' que NO bloquea el pipeline: continúa el flujo marcando " +
    "`ia_disponible = false`.",
  func:
    "const lectura = msg.lectura || {};\n" +
    "const diag = (msg.payload && typeof msg.payload === 'object') ? msg.payload : null;\n" +
    "const iaDisponible = !!diag && (typeof diag.es_anomalia !== 'undefined');\n" +
    "\n" +
    "// --- Cálculo del Índice de Salud Hídrica (0 a 100) ---\n" +
    "function puntuar(valor, ideal_min, ideal_max, limite_min, limite_max) {\n" +
    "    if (valor >= ideal_min && valor <= ideal_max) return 100;\n" +
    "    if (valor < ideal_min) {\n" +
    "        if (valor <= limite_min) return 0;\n" +
    "        return Math.round(100 * (valor - limite_min) / (ideal_min - limite_min));\n" +
    "    }\n" +
    "    if (valor >= limite_max) return 0;\n" +
    "    return Math.round(100 * (limite_max - valor) / (limite_max - ideal_max));\n" +
    "}\n" +
    "\n" +
    "const scorePh = puntuar(lectura.ph, 6.5, 8.5, 4.0, 11.0);\n" +
    "const scoreTds = puntuar(lectura.tds_ppm, 0, 500, 0, 1200);\n" +
    "const scoreTurbidez = puntuar(lectura.turbidez_ntu, 0, 50, 0, 600);\n" +
    "const scoreNivel = puntuar(lectura.nivel_m, 0.40, 3.0, 0.10, 5.0);\n" +
    "\n" +
    "let saludHidrica = Math.round((scorePh + scoreTds + scoreTurbidez + scoreNivel) / 4);\n" +
    "if (iaDisponible && diag.es_anomalia) {\n" +
    "    saludHidrica = Math.min(saludHidrica, 35); // Penalización dura ante veredicto de IA\n" +
    "}\n" +
    "\n" +
    "const fusion = {\n" +
    "    ...lectura,\n" +
    "    diagnostico: {\n" +
    "        ia_disponible: iaDisponible,\n" +
    "        es_anomalia: iaDisponible ? !!diag.es_anomalia : false,\n" +
    "        score: iaDisponible ? (diag.score !== undefined ? diag.score : null) : null\n" +
    "    },\n" +
    "    salud_hidrica_pct: saludHidrica\n" +
    "};\n" +
    "\n" +
    "msg.payload = fusion;\n" +
    "return msg;\n",
  outputs: 1,
  timeout: 0,
  noerr: 0,
  initialize: "",
  finalize: "",
  libs: [],
  x: 900,
  y: 100,
  wires: [[]],
});

const fnActualizarCache = nid("fn-actualizar-cache");
add({
  id: fnActualizarCache,
  type: "function",
  z: tabIngesta,
  name: "Actualizar Cache y Series",
  info:
    "Escribe la lectura fusionada en el Contexto Global de Node-RED:\n" +
    "- `telemetria_cache`: último valor conocido por nodo (para /api/telemetria/actual).\n" +
    "- `series_buffer`: buffer circular (máx. 500) por nodo, usado por los " +
    "gráficos de series temporales del Dashboard.",
  func:
    "const MAX_BUFFER = 500;\n" +
    "const lectura = msg.payload;\n" +
    "if (!lectura || !lectura.nodo_id) return null;\n" +
    "\n" +
    "let cache = global.get('telemetria_cache') || {};\n" +
    "cache[lectura.nodo_id] = lectura;\n" +
    "global.set('telemetria_cache', cache);\n" +
    "\n" +
    "let series = global.get('series_buffer') || {};\n" +
    "if (!series[lectura.nodo_id]) series[lectura.nodo_id] = [];\n" +
    "series[lectura.nodo_id].push(lectura);\n" +
    "if (series[lectura.nodo_id].length > MAX_BUFFER) {\n" +
    "    series[lectura.nodo_id] = series[lectura.nodo_id].slice(-MAX_BUFFER);\n" +
    "}\n" +
    "global.set('series_buffer', series);\n" +
    "\n" +
    "return msg;\n",
  outputs: 1,
  timeout: 0,
  noerr: 0,
  initialize: "",
  finalize: "",
  libs: [],
  x: 1150,
  y: 60,
  wires: [[]],
});

const wsOutTelemetria = nid("ws-out-telemetria");
add({
  id: wsOutTelemetria,
  type: "websocket out",
  z: tabIngesta,
  name: "WS → /ws/telemetria",
  server: wsTelemetriaId,
  client: "",
  x: 1400,
  y: 60,
  wires: [],
});

const switchEsAnomalia = nid("switch-es-anomalia");
add({
  id: switchEsAnomalia,
  type: "switch",
  z: tabIngesta,
  name: "¿Es Anomalía?",
  property: "payload.diagnostico.es_anomalia",
  propertyType: "msg",
  rules: [{ t: "true" }],
  checkall: "true",
  repair: false,
  outputs: 1,
  x: 1150,
  y: 140,
  wires: [[]],
});

const linkOutToAlertas = nid("link-out-to-alertas");
add({
  id: linkOutToAlertas,
  type: "link out",
  z: tabIngesta,
  name: "→ Motor de Alertas (IA HTTP)",
  mode: "link",
  links: [],
  x: 1400,
  y: 140,
  wires: [],
});

const mqttInAlertasDirecto = nid("mqtt-in-alertas-directo");
add({
  id: mqttInAlertasDirecto,
  type: "mqtt in",
  z: tabIngesta,
  name: "MQTT · Alertas Motor IA (directo)",
  topic: "chancay/actuadores/alerta/#",
  qos: "1",
  datatype: "auto-detect",
  broker: brokerCfgId,
  nl: false,
  rap: true,
  rh: 0,
  inputs: 0,
  x: 190,
  y: 260,
  wires: [[]],
});

const fnNormalizarAlertaMqtt = nid("fn-normalizar-alerta-mqtt");
add({
  id: fnNormalizarAlertaMqtt,
  type: "function",
  z: tabIngesta,
  name: "Normalizar Alerta MQTT Directa",
  info:
    "Traduce el mensaje `AlertaOut` publicado directamente por el lazo " +
    "MAPE-K de `motor_ia_chancay` (tópico `chancay/actuadores/alerta/#`) " +
    "al esquema unificado de alertas usado por el Motor de Alertas " +
    "(Tab 02), garantizando que NINGUNA alerta crítica se pierda incluso " +
    "si esta instancia de Node-RED reinicia o pierde el HTTP de diagnóstico.",
  func:
    "let data;\n" +
    "try {\n" +
    "    data = (typeof msg.payload === 'string') ? JSON.parse(msg.payload) : msg.payload;\n" +
    "} catch (e) {\n" +
    "    node.warn('Alerta MQTT con payload inválido: ' + msg.payload);\n" +
    "    return null;\n" +
    "}\n" +
    "\n" +
    "const nodoId = msg.topic ? msg.topic.split('/').pop() : 'desconocido';\n" +
    "\n" +
    "msg.payload = {\n" +
    "    nodo_id: nodoId,\n" +
    "    origen: 'motor_ia_chancay (MQTT directo)',\n" +
    "    severidad: (data.severidad || 'ALTA').toUpperCase() === 'ALTA' ? 'CRITICO' : 'ADVERTENCIA',\n" +
    "    tipo: data.comando || 'ANOMALIA_DETECTADA',\n" +
    "    mensaje: data.motivo || 'Anomalía crítica detectada por el motor de IA.',\n" +
    "    lectura: null\n" +
    "};\n" +
    "return msg;\n",
  outputs: 1,
  timeout: 0,
  noerr: 0,
  initialize: "",
  finalize: "",
  libs: [],
  x: 480,
  y: 260,
  wires: [[]],
});

const linkOutToAlertasDirecto = nid("link-out-to-alertas-directo");
add({
  id: linkOutToAlertasDirecto,
  type: "link out",
  z: tabIngesta,
  name: "→ Motor de Alertas (MQTT directo)",
  mode: "link",
  links: [],
  x: 780,
  y: 260,
  wires: [],
});

const commentIngesta = nid("comment-ingesta");
add({
  id: commentIngesta,
  type: "comment",
  z: tabIngesta,
  name: "Pipeline: MQTT → Normalizar → IA (HTTP) → Fusionar → Cache/WS/Alertas",
  info: "",
  x: 400,
  y: 40,
  wires: [],
});

// --- Wiring Tab 01 ---
nodes.find((n) => n.id === mqttInTelemetria).wires = [[fnNormalizarLectura]];
nodes.find((n) => n.id === fnNormalizarLectura).wires = [[httpReqDiagnostico]];
nodes.find((n) => n.id === httpReqDiagnostico).wires = [[fnFusionarDiagnostico]];
nodes.find((n) => n.id === fnFusionarDiagnostico).wires = [
  [fnActualizarCache, wsOutTelemetria, switchEsAnomalia],
];
nodes.find((n) => n.id === switchEsAnomalia).wires = [[linkOutToAlertas]];
nodes.find((n) => n.id === mqttInAlertasDirecto).wires = [[fnNormalizarAlertaMqtt]];
nodes.find((n) => n.id === fnNormalizarAlertaMqtt).wires = [[linkOutToAlertasDirecto]];

// -----------------------------------------------------------------
// 5. TAB 02 · MOTOR DE ALERTAS
// -----------------------------------------------------------------

const linkInAlertas = nid("link-in-alertas");
add({
  id: linkInAlertas,
  type: "link in",
  z: tabAlertas,
  name: "Entrada Unificada de Alertas",
  links: [linkOutToAlertas, linkOutToAlertasDirecto],
  x: 160,
  y: 120,
  wires: [[]],
});

// Enlazar los link-out de la Tab 01 hacia este link-in
nodes.find((n) => n.id === linkOutToAlertas).links = [linkInAlertas];
nodes.find((n) => n.id === linkOutToAlertasDirecto).links = [linkInAlertas];

const fnClasificarSeveridad = nid("fn-clasificar-severidad");
add({
  id: fnClasificarSeveridad,
  type: "function",
  z: tabAlertas,
  name: "Clasificar Severidad y Registrar",
  info:
    "Determina la severidad final (`CRITICO` / `ADVERTENCIA`) según el " +
    "parámetro físico que originó la anomalía, construye el registro " +
    "estándar de alerta y lo agrega al historial persistente en el " +
    "Contexto Global (`alertas_historial`, tope 2000 registros, respaldado " +
    "en disco por `contextStorage`, ver settings.js).",
  func:
    "const MAX_HIST = 2000;\n" +
    "const p = msg.payload || {};\n" +
    "\n" +
    "let severidad = p.severidad || 'ADVERTENCIA';\n" +
    "let tipo = p.tipo || 'ANOMALIA_DETECTADA';\n" +
    "let mensaje = p.mensaje || 'Anomalía detectada por el sistema.';\n" +
    "const lectura = p.lectura;\n" +
    "\n" +
    "// Reclasificación fina si contamos con la lectura física original\n" +
    "if (lectura) {\n" +
    "    if (lectura.nivel_m < 0.40) {\n" +
    "        severidad = 'CRITICO'; tipo = 'RIESGO_DESBORDE';\n" +
    "        mensaje = `Nivel del río crítico: ${lectura.nivel_m} m (< 0.40 m). Riesgo de desborde/huayco.`;\n" +
    "    } else if (lectura.turbidez_ntu > 500) {\n" +
    "        severidad = 'CRITICO'; tipo = 'ARRASTRE_SEDIMENTOS';\n" +
    "        mensaje = `Turbidez extrema: ${lectura.turbidez_ntu} NTU. Posible huayco / arrastre de sedimentos.`;\n" +
    "    } else if (lectura.tds_ppm > 500) {\n" +
    "        severidad = 'ADVERTENCIA'; tipo = 'CONTAMINACION_QUIMICA';\n" +
    "        mensaje = `TDS elevado: ${lectura.tds_ppm} ppm (> 500 ppm). Posible vertimiento químico/minero.`;\n" +
    "    } else if (lectura.ph < 6.5 || lectura.ph > 8.5) {\n" +
    "        severidad = 'ADVERTENCIA'; tipo = 'PH_FUERA_DE_RANGO';\n" +
    "        mensaje = `pH fuera de rango seguro: ${lectura.ph}.`;\n" +
    "    } else {\n" +
    "        severidad = 'ADVERTENCIA'; tipo = tipo || 'ANOMALIA_MULTIVARIABLE';\n" +
    "        mensaje = 'Isolation Forest detectó un patrón anómalo en la firma combinada de sensores.';\n" +
    "    }\n" +
    "}\n" +
    "\n" +
    "const alerta = {\n" +
    "    id: `AL-${Date.now()}-${Math.floor(Math.random()*1000)}`,\n" +
    "    ts: Date.now(),\n" +
    "    fecha_iso: new Date().toISOString(),\n" +
    "    nodo_id: p.nodo_id || 'desconocido',\n" +
    "    severidad,\n" +
    "    tipo,\n" +
    "    mensaje,\n" +
    "    origen: p.origen || 'motor_ia_chancay (HTTP /diagnostico)',\n" +
    "    lectura: lectura || null,\n" +
    "    atendida: false\n" +
    "};\n" +
    "\n" +
    "let historial = global.get('alertas_historial') || [];\n" +
    "historial.unshift(alerta);\n" +
    "if (historial.length > MAX_HIST) historial = historial.slice(0, MAX_HIST);\n" +
    "global.set('alertas_historial', historial);\n" +
    "\n" +
    "msg.payload = alerta;\n" +
    "return msg;\n",
  outputs: 1,
  timeout: 0,
  noerr: 0,
  initialize: "",
  finalize: "",
  libs: [],
  x: 420,
  y: 120,
  wires: [[]],
});

const wsOutAlertas = nid("ws-out-alertas");
add({
  id: wsOutAlertas,
  type: "websocket out",
  z: tabAlertas,
  name: "WS → /ws/alertas",
  server: wsAlertasId,
  client: "",
  x: 700,
  y: 120,
  wires: [],
});

const commentAlertas = nid("comment-alertas");
add({
  id: commentAlertas,
  type: "comment",
  z: tabAlertas,
  name: "Recibe eventos desde Tab 01 vía Link Nodes (HTTP-IA + MQTT directo)",
  info: "",
  x: 420,
  y: 60,
  wires: [],
});

nodes.find((n) => n.id === linkInAlertas).wires = [[fnClasificarSeveridad]];
nodes.find((n) => n.id === fnClasificarSeveridad).wires = [[wsOutAlertas]];

// -----------------------------------------------------------------
// 6. TAB 03 · API REST /api  (con CORS global vía settings.js)
// -----------------------------------------------------------------

function addCatchNode(tab, x, y, scopeIds) {
  const catchId = nid("catch");
  add({
    id: catchId,
    type: "catch",
    z: tab,
    name: "Captura de Errores API",
    scope: scopeIds,
    uncaught: false,
    x,
    y,
    wires: [[]],
  });
  const fnErrId = nid("fn-http-500");
  add({
    id: fnErrId,
    type: "function",
    z: tab,
    name: "Formatear Error 500",
    func:
      "msg.statusCode = 500;\n" +
      "msg.payload = { error: true, mensaje: (msg.error && msg.error.message) ? msg.error.message : 'Error interno del servidor.' };\n" +
      "msg.headers = { 'Content-Type': 'application/json' };\n" +
      "return msg;\n",
    outputs: 1,
    timeout: 0,
    noerr: 0,
    initialize: "",
    finalize: "",
    libs: [],
    x: x + 260,
    y,
    wires: [[]],
  });
  const respId = nid("http-resp-500");
  add({
    id: respId,
    type: "http response",
    z: tab,
    name: "HTTP 500",
    statusCode: "",
    headers: {},
    x: x + 500,
    y,
    wires: [],
  });
  nodes.find((n) => n.id === catchId).wires = [[fnErrId]];
  nodes.find((n) => n.id === fnErrId).wires = [[respId]];
  return catchId;
}

// --- 3.1 GET /api/health ---
const httpInHealth = nid("http-in-health");
add({
  id: httpInHealth,
  type: "http in",
  z: tabApi,
  name: "GET /api/health",
  url: "/api/health",
  method: "get",
  upload: false,
  swaggerDoc: "",
  x: 160,
  y: 60,
  wires: [[]],
});
const fnHealth = nid("fn-health");
add({
  id: fnHealth,
  type: "function",
  z: tabApi,
  name: "Construir Respuesta de Salud",
  func:
    "msg.payload = {\n" +
    "    servicio: 'Yaku Qhawaq - API Node-RED',\n" +
    "    estado: 'operativo',\n" +
    "    ts: Date.now(),\n" +
    "    nodos_activos: Object.keys(global.get('telemetria_cache') || {}).length\n" +
    "};\n" +
    "msg.headers = { 'Content-Type': 'application/json' };\n" +
    "return msg;\n",
  outputs: 1,
  timeout: 0,
  noerr: 0,
  initialize: "",
  finalize: "",
  libs: [],
  x: 420,
  y: 60,
  wires: [[]],
});
const httpRespHealth = nid("http-resp-health");
add({
  id: httpRespHealth,
  type: "http response",
  z: tabApi,
  name: "HTTP 200",
  statusCode: "",
  headers: {},
  x: 660,
  y: 60,
  wires: [],
});
nodes.find((n) => n.id === httpInHealth).wires = [[fnHealth]];
nodes.find((n) => n.id === fnHealth).wires = [[httpRespHealth]];

// --- 3.2 GET /api/telemetria/actual ---
const httpInActual = nid("http-in-actual");
add({
  id: httpInActual,
  type: "http in",
  z: tabApi,
  name: "GET /api/telemetria/actual",
  url: "/api/telemetria/actual",
  method: "get",
  upload: false,
  swaggerDoc: "",
  x: 180,
  y: 140,
  wires: [[]],
});
const fnActual = nid("fn-actual");
add({
  id: fnActual,
  type: "function",
  z: tabApi,
  name: "Leer Cache de Telemetría",
  info:
    "Devuelve el último snapshot conocido de todos los nodos (o de un " +
    "`nodo_id` específico vía querystring) directamente desde el Contexto " +
    "Global, sin necesidad de golpear la base de datos (baja latencia, " +
    "ideal para refresco del Dashboard cada pocos segundos).",
  func:
    "const cache = global.get('telemetria_cache') || {};\n" +
    "const nodoId = msg.req.query.nodo_id;\n" +
    "\n" +
    "msg.payload = nodoId ? (cache[nodoId] || {}) : Object.values(cache);\n" +
    "msg.headers = { 'Content-Type': 'application/json' };\n" +
    "return msg;\n",
  outputs: 1,
  timeout: 0,
  noerr: 0,
  initialize: "",
  finalize: "",
  libs: [],
  x: 460,
  y: 140,
  wires: [[]],
});
const httpRespActual = nid("http-resp-actual");
add({
  id: httpRespActual,
  type: "http response",
  z: tabApi,
  name: "HTTP 200",
  statusCode: "",
  headers: {},
  x: 720,
  y: 140,
  wires: [],
});
nodes.find((n) => n.id === httpInActual).wires = [[fnActual]];
nodes.find((n) => n.id === fnActual).wires = [[httpRespActual]];

// --- 3.3 GET /api/telemetria/serie ---
const httpInSerie = nid("http-in-serie");
add({
  id: httpInSerie,
  type: "http in",
  z: tabApi,
  name: "GET /api/telemetria/serie",
  url: "/api/telemetria/serie",
  method: "get",
  upload: false,
  swaggerDoc: "",
  x: 170,
  y: 220,
  wires: [[]],
});
const fnSerie = nid("fn-serie");
add({
  id: fnSerie,
  type: "function",
  z: tabApi,
  name: "Leer Serie Temporal (Buffer en memoria)",
  info:
    "Sirve la serie temporal de un nodo específico (`nodo_id`, obligatorio) " +
    "acotada por `limit` (por defecto 200), usada por los gráficos de " +
    "líneas (Nivel, Caudal estimado, pH, TDS) del Dashboard.",
  func:
    "const series = global.get('series_buffer') || {};\n" +
    "const nodoId = msg.req.query.nodo_id || 'nodo_chancay_01';\n" +
    "const limit = parseInt(msg.req.query.limit) || 200;\n" +
    "\n" +
    "const datos = (series[nodoId] || []).slice(-limit);\n" +
    "msg.payload = { nodo_id: nodoId, total: datos.length, datos };\n" +
    "msg.headers = { 'Content-Type': 'application/json' };\n" +
    "return msg;\n",
  outputs: 1,
  timeout: 0,
  noerr: 0,
  initialize: "",
  finalize: "",
  libs: [],
  x: 470,
  y: 220,
  wires: [[]],
});
const httpRespSerie = nid("http-resp-serie");
add({
  id: httpRespSerie,
  type: "http response",
  z: tabApi,
  name: "HTTP 200",
  statusCode: "",
  headers: {},
  x: 750,
  y: 220,
  wires: [],
});
nodes.find((n) => n.id === httpInSerie).wires = [[fnSerie]];
nodes.find((n) => n.id === fnSerie).wires = [[httpRespSerie]];

// --- 3.4 GET /api/telemetria/historico (proxy hacia motor_ia_chancay) ---
const httpInHistorico = nid("http-in-historico");
add({
  id: httpInHistorico,
  type: "http in",
  z: tabApi,
  name: "GET /api/telemetria/historico",
  url: "/api/telemetria/historico",
  method: "get",
  upload: false,
  swaggerDoc: "",
  x: 180,
  y: 300,
  wires: [[]],
});
const fnPrepHistorico = nid("fn-prep-historico");
add({
  id: fnPrepHistorico,
  type: "function",
  z: tabApi,
  name: "Preparar Consulta Histórica",
  info:
    "Traduce los parámetros de la Sección de Estadísticas Históricas " +
    "(`desde`, `hasta`, `nodo_id`, `limit`) hacia el endpoint persistente " +
    "`GET /telemetria/historico` del microservicio `motor_ia_chancay` " +
    "(PostgreSQL, tabla `telemetria_cuenca`).",
  func:
    "const q = msg.req.query || {};\n" +
    "const params = new URLSearchParams();\n" +
    "if (q.desde) params.set('desde', q.desde);\n" +
    "if (q.hasta) params.set('hasta', q.hasta);\n" +
    "if (q.nodo_id) params.set('nodo_id', q.nodo_id);\n" +
    "params.set('limit', q.limit || '500');\n" +
    "\n" +
    "msg.url = `${flow.get('MOTOR_IA_BASE_URL')}/telemetria/historico?${params.toString()}`;\n" +
    "return msg;\n",
  outputs: 1,
  timeout: 0,
  noerr: 0,
  initialize: "",
  finalize: "",
  libs: [],
  x: 470,
  y: 300,
  wires: [[]],
});
const httpReqHistorico = nid("http-req-historico");
add({
  id: httpReqHistorico,
  type: "http request",
  z: tabApi,
  name: "GET motor_ia_chancay /telemetria/historico",
  method: "GET",
  ret: "obj",
  paytoqs: "ignore",
  url: "",
  tls: "",
  persist: false,
  proxy: "",
  insecureHTTPParser: false,
  authType: "",
  senderr: true,
  headers: [],
  x: 760,
  y: 300,
  wires: [[]],
});
const fnRespHistorico = nid("fn-resp-historico");
add({
  id: fnRespHistorico,
  type: "function",
  z: tabApi,
  name: "Formatear Respuesta",
  func:
    "msg.payload = Array.isArray(msg.payload) ? msg.payload : [];\n" +
    "msg.headers = { 'Content-Type': 'application/json' };\n" +
    "return msg;\n",
  outputs: 1,
  timeout: 0,
  noerr: 0,
  initialize: "",
  finalize: "",
  libs: [],
  x: 1000,
  y: 300,
  wires: [[]],
});
const httpRespHistorico = nid("http-resp-historico");
add({
  id: httpRespHistorico,
  type: "http response",
  z: tabApi,
  name: "HTTP 200",
  statusCode: "",
  headers: {},
  x: 1220,
  y: 300,
  wires: [],
});
nodes.find((n) => n.id === httpInHistorico).wires = [[fnPrepHistorico]];
nodes.find((n) => n.id === fnPrepHistorico).wires = [[httpReqHistorico]];
nodes.find((n) => n.id === httpReqHistorico).wires = [[fnRespHistorico]];
nodes.find((n) => n.id === fnRespHistorico).wires = [[httpRespHistorico]];

// --- 3.5 GET /api/alertas ---
const httpInAlertas = nid("http-in-alertas");
add({
  id: httpInAlertas,
  type: "http in",
  z: tabApi,
  name: "GET /api/alertas",
  url: "/api/alertas",
  method: "get",
  upload: false,
  swaggerDoc: "",
  x: 160,
  y: 380,
  wires: [[]],
});
const fnAlertas = nid("fn-alertas");
add({
  id: fnAlertas,
  type: "function",
  z: tabApi,
  name: "Leer Historial de Alertas",
  info:
    "Fuente del panel de Notificaciones en Tiempo Real y del Historial " +
    "cronológico de anomalías. Soporta filtros `?severidad=CRITICO|ADVERTENCIA`, " +
    "`?nodo_id=` y `?limit=` (por defecto 100).",
  func:
    "let historial = global.get('alertas_historial') || [];\n" +
    "const q = msg.req.query || {};\n" +
    "\n" +
    "if (q.severidad) {\n" +
    "    historial = historial.filter(a => a.severidad === q.severidad.toUpperCase());\n" +
    "}\n" +
    "if (q.nodo_id) {\n" +
    "    historial = historial.filter(a => a.nodo_id === q.nodo_id);\n" +
    "}\n" +
    "const limit = parseInt(q.limit) || 100;\n" +
    "\n" +
    "msg.payload = {\n" +
    "    total: historial.length,\n" +
    "    criticas: historial.filter(a => a.severidad === 'CRITICO').length,\n" +
    "    advertencias: historial.filter(a => a.severidad === 'ADVERTENCIA').length,\n" +
    "    alertas: historial.slice(0, limit)\n" +
    "};\n" +
    "msg.headers = { 'Content-Type': 'application/json' };\n" +
    "return msg;\n",
  outputs: 1,
  timeout: 0,
  noerr: 0,
  initialize: "",
  finalize: "",
  libs: [],
  x: 430,
  y: 380,
  wires: [[]],
});
const httpRespAlertas = nid("http-resp-alertas");
add({
  id: httpRespAlertas,
  type: "http response",
  z: tabApi,
  name: "HTTP 200",
  statusCode: "",
  headers: {},
  x: 700,
  y: 380,
  wires: [],
});
nodes.find((n) => n.id === httpInAlertas).wires = [[fnAlertas]];
nodes.find((n) => n.id === fnAlertas).wires = [[httpRespAlertas]];

// --- 3.6 GET /api/nodos (GIS) ---
const httpInNodos = nid("http-in-nodos");
add({
  id: httpInNodos,
  type: "http in",
  z: tabApi,
  name: "GET /api/nodos",
  url: "/api/nodos",
  method: "get",
  upload: false,
  swaggerDoc: "",
  x: 150,
  y: 460,
  wires: [[]],
});
const fnNodos = nid("fn-nodos");
add({
  id: fnNodos,
  type: "function",
  z: tabApi,
  name: "Fusionar Metadatos GIS + Telemetría Actual",
  info:
    "Fuente del Mapa Geográfico (Leaflet). Combina las coordenadas " +
    "estáticas de los nodos de monitoreo de la cuenca con su última " +
    "lectura conocida, para mostrarlas en los popups del mapa.",
  func:
    "const NODOS_GIS = [\n" +
    "    { nodo_id: 'nodo_chancay_01', nombre: 'Puente Huando (Estación Principal)', lat: -11.4959, lng: -77.2072, estado_infraestructura: 'ACTIVO' },\n" +
    "    { nodo_id: 'nodo_chancay_02', nombre: 'Media Cuenca - Acos (Planificado)', lat: -11.3336, lng: -76.7864, estado_infraestructura: 'PLANIFICADO' },\n" +
    "    { nodo_id: 'nodo_chancay_03', nombre: 'Desembocadura - Chancay (Planificado)', lat: -11.5744, lng: -77.2694, estado_infraestructura: 'PLANIFICADO' }\n" +
    "];\n" +
    "\n" +
    "const cache = global.get('telemetria_cache') || {};\n" +
    "msg.payload = NODOS_GIS.map(n => ({ ...n, ultima_lectura: cache[n.nodo_id] || null }));\n" +
    "msg.headers = { 'Content-Type': 'application/json' };\n" +
    "return msg;\n",
  outputs: 1,
  timeout: 0,
  noerr: 0,
  initialize: "",
  finalize: "",
  libs: [],
  x: 460,
  y: 460,
  wires: [[]],
});
const httpRespNodos = nid("http-resp-nodos");
add({
  id: httpRespNodos,
  type: "http response",
  z: tabApi,
  name: "HTTP 200",
  statusCode: "",
  headers: {},
  x: 780,
  y: 460,
  wires: [],
});
nodes.find((n) => n.id === httpInNodos).wires = [[fnNodos]];
nodes.find((n) => n.id === fnNodos).wires = [[httpRespNodos]];

// --- 3.7 GET /api/salud ---
const httpInSalud = nid("http-in-salud");
add({
  id: httpInSalud,
  type: "http in",
  z: tabApi,
  name: "GET /api/salud",
  url: "/api/salud",
  method: "get",
  upload: false,
  swaggerDoc: "",
  x: 150,
  y: 540,
  wires: [[]],
});
const fnSalud = nid("fn-salud");
add({
  id: fnSalud,
  type: "function",
  z: tabApi,
  name: "Calcular Salud Hídrica Global",
  info:
    "Promedia el `salud_hidrica_pct` de todos los nodos activos para " +
    "obtener el indicador general de la cuenca mostrado en los widgets " +
    "tipo gauge del Dashboard.",
  func:
    "const cache = global.get('telemetria_cache') || {};\n" +
    "const lecturas = Object.values(cache);\n" +
    "\n" +
    "const promedio = lecturas.length\n" +
    "    ? Math.round(lecturas.reduce((acc, l) => acc + (l.salud_hidrica_pct || 0), 0) / lecturas.length)\n" +
    "    : null;\n" +
    "\n" +
    "let estado = 'SIN_DATOS';\n" +
    "if (promedio !== null) {\n" +
    "    if (promedio >= 75) estado = 'OPTIMO';\n" +
    "    else if (promedio >= 45) estado = 'ADVERTENCIA';\n" +
    "    else estado = 'CRITICO';\n" +
    "}\n" +
    "\n" +
    "msg.payload = { salud_hidrica_pct: promedio, estado, nodos_evaluados: lecturas.length, ts: Date.now() };\n" +
    "msg.headers = { 'Content-Type': 'application/json' };\n" +
    "return msg;\n",
  outputs: 1,
  timeout: 0,
  noerr: 0,
  initialize: "",
  finalize: "",
  libs: [],
  x: 430,
  y: 540,
  wires: [[]],
});
const httpRespSalud = nid("http-resp-salud");
add({
  id: httpRespSalud,
  type: "http response",
  z: tabApi,
  name: "HTTP 200",
  statusCode: "",
  headers: {},
  x: 700,
  y: 540,
  wires: [],
});
nodes.find((n) => n.id === httpInSalud).wires = [[fnSalud]];
nodes.find((n) => n.id === fnSalud).wires = [[httpRespSalud]];

// --- 3.8 GET /api/export/csv ---
const httpInExport = nid("http-in-export");
add({
  id: httpInExport,
  type: "http in",
  z: tabApi,
  name: "GET /api/export/csv",
  url: "/api/export/csv",
  method: "get",
  upload: false,
  swaggerDoc: "",
  x: 160,
  y: 620,
  wires: [[]],
});
const fnExportCsv = nid("fn-export-csv");
add({
  id: fnExportCsv,
  type: "function",
  z: tabApi,
  name: "Generar CSV de Auditoría",
  info:
    "Exportación de Auditoría para reportes gerenciales. Parámetro " +
    "`?tipo=alertas` (default) exporta el historial de anomalías; " +
    "`?tipo=lecturas&nodo_id=` exporta la serie temporal en buffer de un nodo. " +
    "Responde con `Content-Disposition: attachment` para forzar la descarga " +
    "directa desde el navegador.",
  func:
    "function toCsv(rows, columnas) {\n" +
    "    const escape = (v) => {\n" +
    "        if (v === null || v === undefined) return '';\n" +
    "        const s = String(v).replace(/\"/g, '\"\"');\n" +
    "        return /[,\"\\n]/.test(s) ? `\"${s}\"` : s;\n" +
    "    };\n" +
    "    const header = columnas.join(',');\n" +
    "    const body = rows.map(r => columnas.map(c => escape(r[c])).join(',')).join('\\n');\n" +
    "    return header + '\\n' + body;\n" +
    "}\n" +
    "\n" +
    "const tipo = (msg.req.query.tipo || 'alertas').toLowerCase();\n" +
    "let csv, filename;\n" +
    "\n" +
    "if (tipo === 'lecturas') {\n" +
    "    const nodoId = msg.req.query.nodo_id || 'nodo_chancay_01';\n" +
    "    const series = global.get('series_buffer') || {};\n" +
    "    const datos = (series[nodoId] || []).map(d => ({\n" +
    "        ts: new Date(d.ts).toISOString(), nodo_id: d.nodo_id, nivel_m: d.nivel_m,\n" +
    "        temp_ambiente_c: d.temp_ambiente_c, temp_agua_c: d.temp_agua_c,\n" +
    "        tds_ppm: d.tds_ppm, ph: d.ph, turbidez_ntu: d.turbidez_ntu,\n" +
    "        es_anomalia: d.diagnostico ? d.diagnostico.es_anomalia : false,\n" +
    "        salud_hidrica_pct: d.salud_hidrica_pct\n" +
    "    }));\n" +
    "    csv = toCsv(datos, ['ts','nodo_id','nivel_m','temp_ambiente_c','temp_agua_c','tds_ppm','ph','turbidez_ntu','es_anomalia','salud_hidrica_pct']);\n" +
    "    filename = `lecturas_${nodoId}_${Date.now()}.csv`;\n" +
    "} else {\n" +
    "    const historial = (global.get('alertas_historial') || []).map(a => ({\n" +
    "        id: a.id, fecha_iso: a.fecha_iso, nodo_id: a.nodo_id, severidad: a.severidad,\n" +
    "        tipo: a.tipo, mensaje: a.mensaje, origen: a.origen, atendida: a.atendida\n" +
    "    }));\n" +
    "    csv = toCsv(historial, ['id','fecha_iso','nodo_id','severidad','tipo','mensaje','origen','atendida']);\n" +
    "    filename = `alertas_chancay_huaral_${Date.now()}.csv`;\n" +
    "}\n" +
    "\n" +
    "msg.payload = csv;\n" +
    "msg.headers = {\n" +
    "    'Content-Type': 'text/csv; charset=utf-8',\n" +
    "    'Content-Disposition': `attachment; filename=\"${filename}\"`\n" +
    "};\n" +
    "return msg;\n",
  outputs: 1,
  timeout: 0,
  noerr: 0,
  initialize: "",
  finalize: "",
  libs: [],
  x: 460,
  y: 620,
  wires: [[]],
});
const httpRespExport = nid("http-resp-export");
add({
  id: httpRespExport,
  type: "http response",
  z: tabApi,
  name: "HTTP 200 (CSV)",
  statusCode: "",
  headers: {},
  x: 760,
  y: 620,
  wires: [],
});
nodes.find((n) => n.id === httpInExport).wires = [[fnExportCsv]];
nodes.find((n) => n.id === fnExportCsv).wires = [[httpRespExport]];

const commentApi = nid("comment-api");
add({
  id: commentApi,
  type: "comment",
  z: tabApi,
  name: "CORS habilitado globalmente en settings.js → httpNodeCors",
  info: "",
  x: 200,
  y: 20,
  wires: [],
});

addCatchNode(tabApi, 950, 700, [
  fnActual,
  fnSerie,
  fnPrepHistorico,
  httpReqHistorico,
  fnAlertas,
  fnNodos,
  fnSalud,
  fnExportCsv,
]);

// -----------------------------------------------------------------
// 7. TAB 04 · TELECONTROL (Comandos MQTT inversos)
// -----------------------------------------------------------------

const httpInComando = nid("http-in-comando");
add({
  id: httpInComando,
  type: "http in",
  z: tabTelecontrol,
  name: "POST /api/telecontrol/comando",
  url: "/api/telecontrol/comando",
  method: "post",
  upload: false,
  swaggerDoc: "",
  x: 190,
  y: 100,
  wires: [[]],
});

const fnValidarComando = nid("fn-validar-comando");
add({
  id: fnValidarComando,
  type: "function",
  z: tabTelecontrol,
  name: "Validar Comando de Telecontrol",
  info:
    "Valida estrictamente el body recibido antes de publicar cualquier " +
    "comando MQTT (mitigación STRIDE - Tampering / Elevation of Privilege). " +
    "Body esperado:\n" +
    "```json\n" +
    "{ \"nodo_id\": \"nodo_chancay_01\", \"actuador\": \"sirena|compuerta\", " +
    "\"accion\": \"activar|desactivar\", \"operador\": \"nombre_opcional\" }\n" +
    "```",
  func:
    "const NODOS_VALIDOS = ['nodo_chancay_01','nodo_chancay_02','nodo_chancay_03'];\n" +
    "const ACTUADORES_VALIDOS = ['sirena','compuerta'];\n" +
    "const ACCIONES_VALIDAS = ['activar','desactivar'];\n" +
    "\n" +
    "const body = msg.payload || {};\n" +
    "const { nodo_id, actuador, accion, operador } = body;\n" +
    "\n" +
    "const errores = [];\n" +
    "if (!NODOS_VALIDOS.includes(nodo_id)) errores.push(`nodo_id inválido: ${nodo_id}`);\n" +
    "if (!ACTUADORES_VALIDOS.includes(actuador)) errores.push(`actuador inválido: ${actuador}`);\n" +
    "if (!ACCIONES_VALIDAS.includes(accion)) errores.push(`accion inválida: ${accion}`);\n" +
    "\n" +
    "if (errores.length > 0) {\n" +
    "    msg.statusCode = 400;\n" +
    "    msg.payload = { error: true, detalles: errores };\n" +
    "    msg.headers = { 'Content-Type': 'application/json' };\n" +
    "    msg.comandoValido = false;\n" +
    "    return msg;\n" +
    "}\n" +
    "\n" +
    "msg.comandoValido = true;\n" +
    "msg.comando = {\n" +
    "    id: `TC-${Date.now()}`,\n" +
    "    ts: Date.now(),\n" +
    "    nodo_id, actuador, accion,\n" +
    "    operador: operador || 'operador_no_identificado',\n" +
    "    origen: 'panel_telecontrol_manual'\n" +
    "};\n" +
    "msg.topic = `chancay/actuadores/comando/${nodo_id}`;\n" +
    "msg.payload = JSON.stringify(msg.comando);\n" +
    "return msg;\n",
  outputs: 1,
  timeout: 0,
  noerr: 0,
  initialize: "",
  finalize: "",
  libs: [],
  x: 470,
  y: 100,
  wires: [[]],
});

const switchComandoValido = nid("switch-comando-valido");
add({
  id: switchComandoValido,
  type: "switch",
  z: tabTelecontrol,
  name: "¿Comando Válido?",
  property: "comandoValido",
  propertyType: "msg",
  rules: [{ t: "true" }, { t: "false" }],
  checkall: "true",
  repair: false,
  outputs: 2,
  x: 730,
  y: 100,
  wires: [[], []],
});

const mqttOutComando = nid("mqtt-out-comando");
add({
  id: mqttOutComando,
  type: "mqtt out",
  z: tabTelecontrol,
  name: "MQTT → chancay/actuadores/comando/<nodo_id>",
  topic: "",
  qos: "1",
  retain: "false",
  respTopic: "",
  contentType: "",
  broker: brokerCfgId,
  x: 1020,
  y: 80,
  wires: [],
});

const fnRegistrarBitacora = nid("fn-registrar-bitacora");
add({
  id: fnRegistrarBitacora,
  type: "function",
  z: tabTelecontrol,
  name: "Registrar en Bitácora de Auditoría",
  info:
    "Guarda cada acción de telecontrol manual en `telecontrol_historial` " +
    "(Contexto Global, tope 500 registros) para trazabilidad y auditoría, " +
    "y construye la respuesta HTTP de confirmación (ACK) al Frontend.",
  func:
    "const MAX_HIST = 500;\n" +
    "let historial = global.get('telecontrol_historial') || [];\n" +
    "historial.unshift(msg.comando);\n" +
    "if (historial.length > MAX_HIST) historial = historial.slice(0, MAX_HIST);\n" +
    "global.set('telecontrol_historial', historial);\n" +
    "\n" +
    "msg.statusCode = 200;\n" +
    "msg.payload = { ok: true, comando: msg.comando };\n" +
    "msg.headers = { 'Content-Type': 'application/json' };\n" +
    "return msg;\n",
  outputs: 1,
  timeout: 0,
  noerr: 0,
  initialize: "",
  finalize: "",
  libs: [],
  x: 1020,
  y: 140,
  wires: [[]],
});

const httpRespComandoOk = nid("http-resp-comando-ok");
add({
  id: httpRespComandoOk,
  type: "http response",
  z: tabTelecontrol,
  name: "HTTP 200",
  statusCode: "",
  headers: {},
  x: 1260,
  y: 140,
  wires: [],
});

const httpRespComandoError = nid("http-resp-comando-error");
add({
  id: httpRespComandoError,
  type: "http response",
  z: tabTelecontrol,
  name: "HTTP 400",
  statusCode: "",
  headers: {},
  x: 1020,
  y: 220,
  wires: [],
});

// --- Persistencia redundante hacia motor_ia_chancay (Capa 3 -> PostgreSQL) ---
// Rama en PARALELO (fire-and-forget) a la respuesta HTTP: NO bloquea el ACK
// al Frontend. Si el microservicio de IA estuviera caído, el comando ya se
// ejecutó (MQTT) y ya quedó auditado en el Contexto Global de Node-RED; esta
// rama únicamente añade una segunda capa de trazabilidad forense en la BD
// relacional (tabla `telecontrol_historial`, ver Capa_2/postgres/init.sql).
const fnPrepPersistTc = nid("fn-prep-persist-tc");
add({
  id: fnPrepPersistTc,
  type: "function",
  z: tabTelecontrol,
  name: "Preparar Persistencia en motor_ia_chancay",
  info:
    "Traduce `msg.comando` (generado por 'Validar Comando de Telecontrol') " +
    "al contrato `TelecontrolComandoIn` esperado por " +
    "`POST /telecontrol/historial` del microservicio `motor_ia_chancay`.",
  func:
    "msg.payload = {\n" +
    "    comando_id: msg.comando.id,\n" +
    "    nodo_id: msg.comando.nodo_id,\n" +
    "    actuador: msg.comando.actuador,\n" +
    "    accion: msg.comando.accion,\n" +
    "    operador: msg.comando.operador,\n" +
    "    origen: msg.comando.origen,\n" +
    "    ts_comando: msg.comando.ts\n" +
    "};\n" +
    "return msg;\n",
  outputs: 1,
  timeout: 0,
  noerr: 0,
  initialize: "",
  finalize: "",
  libs: [],
  x: 1020,
  y: 300,
  wires: [[]],
});
const httpReqPersistTc = nid("http-req-persist-tc");
add({
  id: httpReqPersistTc,
  type: "http request",
  z: tabTelecontrol,
  name: "POST → motor_ia_chancay /telecontrol/historial",
  method: "POST",
  ret: "obj",
  paytoqs: "ignore",
  url: `${MOTOR_IA_BASE_URL}/telecontrol/historial`,
  tls: "",
  persist: false,
  proxy: "",
  insecureHTTPParser: false,
  authType: "",
  senderr: false,
  headers: [{ keyType: "Content-Type", keyValue: "", valueType: "other", valueValue: "application/json" }],
  x: 1300,
  y: 300,
  wires: [[]],
});
const fnLogPersistTc = nid("fn-log-persist-tc");
add({
  id: fnLogPersistTc,
  type: "function",
  z: tabTelecontrol,
  name: "Log Resultado Persistencia (no crítico)",
  info:
    "Registra en consola si la persistencia redundante en PostgreSQL " +
    "tuvo éxito. Un fallo aquí NUNCA debe afectar al operador: el " +
    "comando MQTT y la bitácora en memoria ya se ejecutaron con éxito.",
  func:
    "if (msg.statusCode >= 200 && msg.statusCode < 300) {\n" +
    "    node.log(`Comando ${msg.payload && msg.payload.comando_id} persistido en motor_ia_chancay.`);\n" +
    "} else {\n" +
    "    node.warn('No se pudo persistir el comando de telecontrol en motor_ia_chancay (no crítico).');\n" +
    "}\n" +
    "return null;\n",
  outputs: 0,
  timeout: 0,
  noerr: 0,
  initialize: "",
  finalize: "",
  libs: [],
  x: 1560,
  y: 300,
  wires: [],
});

nodes.find((n) => n.id === httpInComando).wires = [[fnValidarComando]];
nodes.find((n) => n.id === fnValidarComando).wires = [[switchComandoValido]];
nodes.find((n) => n.id === switchComandoValido).wires = [
  [mqttOutComando, fnRegistrarBitacora],
  [httpRespComandoError],
];
nodes.find((n) => n.id === fnRegistrarBitacora).wires = [[httpRespComandoOk, fnPrepPersistTc]];
nodes.find((n) => n.id === fnPrepPersistTc).wires = [[httpReqPersistTc]];
nodes.find((n) => n.id === httpReqPersistTc).wires = [[fnLogPersistTc]];

// --- GET /api/telecontrol/historial (auditoría) ---
const httpInHistorialTc = nid("http-in-historial-tc");
add({
  id: httpInHistorialTc,
  type: "http in",
  z: tabTelecontrol,
  name: "GET /api/telecontrol/historial",
  url: "/api/telecontrol/historial",
  method: "get",
  upload: false,
  swaggerDoc: "",
  x: 200,
  y: 320,
  wires: [[]],
});
const fnLeerHistorialTc = nid("fn-leer-historial-tc");
add({
  id: fnLeerHistorialTc,
  type: "function",
  z: tabTelecontrol,
  name: "Leer Bitácora de Telecontrol",
  func:
    "const historial = global.get('telecontrol_historial') || [];\n" +
    "const limit = parseInt((msg.req.query || {}).limit) || 100;\n" +
    "msg.payload = historial.slice(0, limit);\n" +
    "msg.headers = { 'Content-Type': 'application/json' };\n" +
    "return msg;\n",
  outputs: 1,
  timeout: 0,
  noerr: 0,
  initialize: "",
  finalize: "",
  libs: [],
  x: 480,
  y: 320,
  wires: [[]],
});
const httpRespHistorialTc = nid("http-resp-historial-tc");
add({
  id: httpRespHistorialTc,
  type: "http response",
  z: tabTelecontrol,
  name: "HTTP 200",
  statusCode: "",
  headers: {},
  x: 760,
  y: 320,
  wires: [],
});
nodes.find((n) => n.id === httpInHistorialTc).wires = [[fnLeerHistorialTc]];
nodes.find((n) => n.id === fnLeerHistorialTc).wires = [[httpRespHistorialTc]];

addCatchNode(tabTelecontrol, 700, 420, [
  fnValidarComando,
  fnRegistrarBitacora,
  fnLeerHistorialTc,
  fnPrepPersistTc,
  httpReqPersistTc,
]);

const commentTelecontrol = nid("comment-telecontrol");
add({
  id: commentTelecontrol,
  type: "comment",
  z: tabTelecontrol,
  name: "Anulación manual del operador → comando MQTT inverso hacia actuadores simulados",
  info: "",
  x: 260,
  y: 40,
  wires: [],
});

// -----------------------------------------------------------------
// 8. Inicialización de flow-context (MOTOR_IA_BASE_URL) al desplegar
// -----------------------------------------------------------------

const globalConfigNode = nid("global-config");
add({
  id: globalConfigNode,
  type: "global-config",
  env: [],
});
// (nodo de configuración reservado para futuras variables globales)

// Insertar flow.set('MOTOR_IA_BASE_URL', ...) mediante un nodo inject inicial
const injectInit = nid("inject-init");
add({
  id: injectInit,
  type: "inject",
  z: tabApi,
  name: "Inicializar Configuración (al desplegar)",
  props: [{ p: "payload" }],
  repeat: "",
  crontab: "",
  once: true,
  onceDelay: 0.1,
  topic: "",
  payload: "",
  payloadType: "date",
  x: 160,
  y: 700,
  wires: [[]],
});
const fnInitConfig = nid("fn-init-config");
add({
  id: fnInitConfig,
  type: "function",
  z: tabApi,
  name: "Set MOTOR_IA_BASE_URL en flow context",
  func: `flow.set('MOTOR_IA_BASE_URL', '${MOTOR_IA_BASE_URL}');\nreturn null;\n`,
  outputs: 1,
  timeout: 0,
  noerr: 0,
  initialize: "",
  finalize: "",
  libs: [],
  x: 460,
  y: 700,
  wires: [[]],
});
nodes.find((n) => n.id === injectInit).wires = [[fnInitConfig]];
fnInitConfig; // eslint-disable-line

// Remove the placeholder 'global-config' node - not a real Node-RED node type.
const idxGlobalConfig = nodes.findIndex((n) => n.id === globalConfigNode);
nodes.splice(idxGlobalConfig, 1);

// -----------------------------------------------------------------
// 9. ESCRITURA DE ARCHIVOS DE SALIDA
// -----------------------------------------------------------------

const outDir = path.join(__dirname, "..");
const flowsPath = path.join(outDir, "flows.json");
const credsPath = path.join(outDir, "flows_cred.json");

fs.writeFileSync(flowsPath, JSON.stringify(nodes, null, 4) + "\n", "utf8");

const encrypted = encryptCredentials(CREDENTIAL_SECRET, credentialsMap);
fs.writeFileSync(credsPath, JSON.stringify({ $: encrypted }, null, 4) + "\n", "utf8");

console.log(`✅ flows.json generado (${nodes.length} nodos) → ${flowsPath}`);
console.log(`✅ flows_cred.json generado (cifrado AES-256-CTR) → ${credsPath}`);
