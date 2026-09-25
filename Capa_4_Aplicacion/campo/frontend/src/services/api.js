import axios from "axios";
import { NODOS_CUENCA } from "../utils/constants.js";

/**
 * Cliente HTTP centralizado de la Capa 4 (Aplicación) apuntando al
 * microservicio FastAPI de la Capa 3 (Soporte a Servicios).
 *
 * Contrato real expuesto por la Capa 3 (app/main.py):
 *   GET  /                         → health
 *   GET  /nodos/estado             → presencia ONLINE/OFFLINE por nodo
 *   GET  /telemetria/reciente      → últimas N lecturas
 *   GET  /telemetria/historico     → histórico filtrado
 *   GET  /telemetria/salud         → índice agregado de salud hídrica
 *   POST /diagnostico              → veredicto Isolation Forest
 *   POST /telecontrol/comando      → comando manual del operador → Capa 1
 *   GET  /telecontrol/historial    → bitácora de auditoría
 *   GET  /export/csv               → exportación CSV server-side
 *   WS   /ws/telemetria, /ws/alertas
 */
const baseURL =
  import.meta.env.VITE_API_BASE_URL ||
  "https://internet-of-thingsfinal-project-production-80a2.up.railway.app";

export const api = axios.create({
  baseURL,
  timeout: 10000,
  headers: { "Content-Type": "application/json" },
});

// --- Endpoints de Telemetría (Capa 3 FastAPI) ---
export const getTelemetriaReciente = (limit = 30) =>
  api.get("/telemetria/reciente", { params: { limit } }).then((r) => r.data || []);

/**
 * Devuelve la última lectura de un nodo concreto. La Capa 3 no expone un
 * endpoint "por nodo" para /reciente, así que pedimos un bloque reciente y
 * filtramos en el cliente (los nodos publican cada 3 s, un bloque de 60
 * cubre con holgura a todos los nodos activos).
 */
export const getTelemetriaActual = (nodoId) =>
  api
    .get("/telemetria/reciente", { params: { limit: 60 } })
    .then((r) => {
      const lista = r.data || [];
      if (!nodoId) return lista[0] || null;
      return lista.find((d) => (d.node_id || d.nodo_id) === nodoId) || null;
    });

export const getSerieTemporal = (nodoId, limit = 200) =>
  api
    .get("/telemetria/historico", { params: { nodo_id: nodoId, limit } })
    .then((r) => r.data || []);

export const getTelemetriaHistorica = ({ desde, hasta, nodoId, limit = 500 } = {}) =>
  api
    .get("/telemetria/historico", {
      params: { desde, hasta, nodo_id: nodoId, limit },
    })
    .then((r) => r.data || []);

// --- Diagnóstico con Inferencia IA ---
export const postDiagnostico = (data) =>
  api.post("/diagnostico", data).then((r) => r.data);

// --- Salud Hídrica (Dashboard) ---
export const getSaludHidrica = () =>
  api.get("/telemetria/salud").then((r) => r.data || null);

// --- Presencia de nodos (Capa 1 online/offline) ---
export const getEstadoNodos = () =>
  api.get("/nodos/estado").then((r) => r.data || {});

// --- Alertas: se derivan de las lecturas con `alerta === true` ---
export const getAlertas = ({ nodoId, limit = 200 } = {}) =>
  api
    .get("/telemetria/historico", { params: { nodo_id: nodoId, limit } })
    .then((r) =>
      (r.data || [])
        .filter((d) => d.alerta === true || d.es_anomalia === true)
        .map(normalizarAlerta)
    );

/**
 * Traduce una fila de telemetría-alerta de la Capa 3 al formato de alerta que
 * consume la UI (mensaje, severidad, timestamp), derivando la severidad del
 * estado MAPE-K persistido.
 */
export function normalizarAlerta(fila) {
  const estado = Number(fila.estado_mapek ?? 0);
  const severidad = { 0: "INFO", 1: "ADVERTENCIA", 2: "CRITICO", 3: "CRITICO" }[estado] || "INFO";
  const motivos = {
    1: "Contaminación detectada (TDS/pH fuera de rango o anomalía IA)",
    2: "Riesgo de inundación / desborde (nivel fuera de rango)",
    3: "Evento crítico combinado (contaminación + inundación)",
  };
  return {
    id: fila.id ?? `alt_${fila.node_id}_${fila.created_at}`,
    node_id: fila.node_id || fila.nodo_id,
    nodo_id: fila.node_id || fila.nodo_id,
    mensaje: motivos[estado] || "Evento detectado en los sensores.",
    severidad,
    estado_mapek: estado,
    origen: fila.origen || "Motor IA",
    timestamp: fila.created_at || fila.timestamp_registro || fila.timestamp_ms,
    atendida: false,
  };
}

// --- Nodos GIS: coordenadas desde las constantes del dominio (fuente única) ---
export const getNodosGIS = () => Promise.resolve(NODOS_CUENCA);

// --- Telecontrol (Panel de Anulación Manual) ---
export const enviarComandoTelecontrol = ({ nodoId, actuador, accion, operador }) =>
  api
    .post("/telecontrol/comando", {
      nodo_id: nodoId,
      actuador,
      accion,
      operador: operador || "operador_sala_monitoreo",
      origen: "panel_telecontrol_manual",
    })
    .then((r) => r.data);

export const getHistorialTelecontrol = (limit = 50, nodoId) =>
  api
    .get("/telecontrol/historial", {
      params: { limit, ...(nodoId ? { nodo_id: nodoId } : {}) },
    })
    .then((r) => r.data || []);

// --- Exportación CSV server-side (Capa 3) ---
export const buildExportCsvUrl = ({ nodoId, desde, hasta } = {}) => {
  const params = new URLSearchParams();
  if (nodoId) params.set("nodo_id", nodoId);
  if (desde) params.set("desde", desde);
  if (hasta) params.set("hasta", hasta);
  const qs = params.toString();
  return `${baseURL}/export/csv${qs ? `?${qs}` : ""}`;
};

// --- Health Check ---
export const getHealth = () => api.get("/").then((r) => r.data);

export default api;
