/**
 * Servidor mock TEMPORAL (no forma parte del entregable final) usado
 * únicamente durante el desarrollo para validar visualmente que el
 * Frontend "Yaku Qhawaq" consume correctamente el contrato de la API
 * definido en flows.json, sin necesidad de levantar todo el stack
 * Docker (Mosquitto + PostgreSQL + FastAPI + Node-RED).
 *
 * Se elimina antes de la entrega final del repositorio.
 */
const http = require("http");

const NODOS = ["nodo_chancay_01", "nodo_chancay_02", "nodo_chancay_03"];

function lecturaAleatoria(nodoId) {
  return {
    nodo_id: nodoId,
    ts: Date.now(),
    nivel_m: +(1.2 + (Math.random() - 0.5) * 0.4).toFixed(2),
    temp_ambiente_c: +(21 + Math.random() * 4).toFixed(1),
    temp_agua_c: +(16.5 + Math.random() * 2).toFixed(1),
    tds_ppm: +(230 + Math.random() * 60).toFixed(1),
    ph: +(7.3 + (Math.random() - 0.5) * 0.6).toFixed(2),
    turbidez_ntu: +(15 + Math.random() * 20).toFixed(1),
    diagnostico: { ia_disponible: true, es_anomalia: Math.random() < 0.1, score: -0.1 },
    salud_hidrica_pct: Math.round(70 + Math.random() * 25),
  };
}

const alertasMock = [
  {
    id: "AL-1",
    ts: Date.now() - 60000,
    fecha_iso: new Date(Date.now() - 60000).toISOString(),
    nodo_id: "nodo_chancay_01",
    severidad: "CRITICO",
    tipo: "RIESGO_DESBORDE",
    mensaje: "Nivel del río crítico: 0.32 m (< 0.40 m). Riesgo de desborde/huayco.",
    origen: "motor_ia_chancay (HTTP /diagnostico)",
    atendida: false,
  },
  {
    id: "AL-2",
    ts: Date.now() - 300000,
    fecha_iso: new Date(Date.now() - 300000).toISOString(),
    nodo_id: "nodo_chancay_01",
    severidad: "ADVERTENCIA",
    tipo: "CONTAMINACION_QUIMICA",
    mensaje: "TDS elevado: 630 ppm (> 500 ppm). Posible vertimiento químico/minero.",
    origen: "motor_ia_chancay (HTTP /diagnostico)",
    atendida: true,
  },
];

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }

  if (url.pathname === "/api/telemetria/actual") {
    return res.end(JSON.stringify(NODOS.map(lecturaAleatoria)));
  }
  if (url.pathname === "/api/telemetria/serie") {
    const nodoId = url.searchParams.get("nodo_id") || NODOS[0];
    const datos = Array.from({ length: 50 }, (_, i) => ({
      ...lecturaAleatoria(nodoId),
      ts: Date.now() - (50 - i) * 5000,
    }));
    return res.end(JSON.stringify({ nodo_id: nodoId, total: datos.length, datos }));
  }
  if (url.pathname === "/api/telemetria/historico") {
    const datos = Array.from({ length: 30 }, (_, i) => ({
      timestamp_registro: new Date(Date.now() - (30 - i) * 3600000).toISOString(),
      nodo_id: "nodo_chancay_01",
      nivel_m: 1.2 + (Math.random() - 0.5) * 0.4,
      temp_ambiente_c: 22,
      temp_agua_c: 17,
      tds_ppm: 230 + Math.random() * 60,
      ph: 7.3 + (Math.random() - 0.5) * 0.5,
      turbidez_ntu: 15 + Math.random() * 15,
      es_anomalia: Math.random() < 0.1,
    }));
    return res.end(JSON.stringify(datos));
  }
  if (url.pathname === "/api/alertas") {
    return res.end(JSON.stringify({ total: 2, criticas: 1, advertencias: 1, alertas: alertasMock }));
  }
  if (url.pathname === "/api/salud") {
    return res.end(JSON.stringify({ salud_hidrica_pct: 82, estado: "OPTIMO", nodos_evaluados: 3, ts: Date.now() }));
  }
  if (url.pathname === "/api/nodos") {
    return res.end(
      JSON.stringify([
        { nodo_id: "nodo_chancay_01", nombre: "Puente Huando (Estación Principal)", lat: -11.4959, lng: -77.2072, estado_infraestructura: "ACTIVO", ultima_lectura: lecturaAleatoria("nodo_chancay_01") },
        { nodo_id: "nodo_chancay_02", nombre: "Media Cuenca - Acos (Planificado)", lat: -11.3336, lng: -76.7864, estado_infraestructura: "PLANIFICADO", ultima_lectura: null },
        { nodo_id: "nodo_chancay_03", nombre: "Desembocadura - Chancay (Planificado)", lat: -11.5744, lng: -77.2694, estado_infraestructura: "PLANIFICADO", ultima_lectura: null },
      ])
    );
  }
  if (url.pathname === "/api/telecontrol/historial") {
    return res.end(JSON.stringify([]));
  }
  if (req.method === "POST" && url.pathname === "/api/telecontrol/comando") {
    return res.end(JSON.stringify({ ok: true, comando: { id: "TC-1", ts: Date.now() } }));
  }
  res.writeHead(404);
  res.end(JSON.stringify({ error: true }));
});

server.listen(1880, "0.0.0.0", () => console.log("Mock backend escuchando en :1880"));