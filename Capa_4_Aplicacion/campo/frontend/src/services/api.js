import axios from "axios";
import { NODOS_CUENCA } from "../utils/constants.js";

/**
 * Normaliza cualquier variable de URL de API eliminando barras
 * o protocolos duplicados para evitar rutas relativas en Axios.
 */
function obtenerBaseUrl() {
  let envUrl = import.meta.env.VITE_API_BASE_URL || "internet-of-thingsfinal-project-production-80a2.up.railway.app";
  
  // Limpiar cualquier protocolo previo para procesarlo limpiamente
  let domainOnly = envUrl.replace(/^(https?:\/\/|wss?:\/\/)/, "").replace(/\/+$/, "");
  
  // Devuelve la URL lista con HTTPS
  return `https://${domainOnly}`;
}

const baseURL = obtenerBaseUrl();

export const api = axios.create({
  baseURL,
  timeout: 10000,
  headers: { "Content-Type": "application/json" },
});

// --- Endpoints de Telemetría (Capa 3 FastAPI) ---
export const getTelemetriaReciente = (limit = 30) =>
  api.get("/telemetria/reciente", { params: { limit } }).then((r) => r.data || []);

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
    .get("/telemetria/historico", { params: { node_id: nodoId, limit } })
    .then((r) => r.data || []);

// CORREGIDO: Ahora usa 'api.get' de Axios en lugar de 'fetchApi'
export const getTelemetriaHistorica = ({ desde, hasta, nodoId, limit = 500 } = {}) => {
  const params = { limit };
  if (nodoId) params.node_id = nodoId;
  if (desde) params.desde = desde;
  if (hasta) params.hasta = hasta;

  return api.get("/telemetria/historico", { params }).then((r) => r.data || []);
};

// --- Diagnóstico con Inferencia IA ---
export const postDiagnostico = (data) =>
  api.post("/diagnostico", data).then((r) => r.data);

// --- Salud Hídrica (Dashboard) ---
export const getSaludHidrica = () =>
  api.get("/telemetria/salud").then((r) => r.data || null);

// --- Presencia de nodos ---
export const getEstadoNodos = () =>
  api.get("/nodos/estado").then((r) => r.data || {});

// --- Alertas ---
export const getAlertas = ({ nodoId, limit = 200 } = {}) =>
  api
    .get("/telemetria/historico", { params: { node_id: nodoId, limit } })
    .then((r) =>
      (r.data || [])
        .filter((d) => d.alerta === true || d.es_anomalia === true)
        .map(normalizarAlerta)
    );

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

// --- Nodos GIS ---
export const getNodosGIS = () => Promise.resolve(NODOS_CUENCA);

// --- Telecontrol ---
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
      params: { limit, ...(nodoId ? { node_id: nodoId } : {}) },
    })
    .then((r) => r.data || []);

// --- Exportación CSV ---
export function buildExportCsvUrl({ tipo = "lecturas", nodoId, limite = 1000 } = {}) {
  const base = obtenerBaseUrl();
  const params = new URLSearchParams({ tipo, limit: String(limite) });
  if (nodoId) params.append("nodo_id", nodoId);

  return `${base}/export/csv?${params.toString()}`;
}

// --- Health Check ---
export const getHealth = () => api.get("/").then((r) => r.data);

export default api;