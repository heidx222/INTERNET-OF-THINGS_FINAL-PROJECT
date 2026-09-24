import axios from "axios";

/**
 * Cliente HTTP centralizado apuntando a la Capa 3 (FastAPI en Railway).
 */
const baseURL = import.meta.env.VITE_API_BASE_URL || "https://internet-of-thingsfinal-project-production-80a2.up.railway.app";

export const api = axios.create({
  baseURL,
  timeout: 10000,
  headers: { "Content-Type": "application/json" },
});

// --- Endpoints de Telemetría (Capa 3 FastAPI) ---
export const getTelemetriaActual = (nodoId) =>
  api.get("/telemetria/reciente", { params: { limit: 1 } }).then((r) => r.data[0] || null);

export const getSerieTemporal = (nodoId, limit = 200) =>
  api.get("/telemetria/reciente", { params: { limit } }).then((r) => r.data);

export const getTelemetriaHistorica = ({ desde, hasta, nodoId, limit = 500 } = {}) =>
  api
    .get("/telemetria/historico", {
      params: { desde, hasta, nodo_id: nodoId, limit },
    })
    .then((r) => r.data);

// --- Diagnóstico con Inferencia IA ---
export const postDiagnostico = (data) =>
  api.post("/diagnostico", data).then((r) => r.data);

// --- Endpoints de Salud Hídrica / Alertas / GIS ---
export const getSaludHidrica = () =>
  api.get("/telemetria/reciente", { params: { limit: 20 } }).then((r) => r.data);

export const getAlertas = ({ nodoId, limit = 100 } = {}) =>
  api.get("/telemetria/reciente", { params: { limit } }).then((r) => {
    // Filtrar en frontend registros que generaron alerta
    return r.data.filter((d) => d.alerta === true);
  });

export const getNodosGIS = () =>
  Promise.resolve([
    { id: "nodo_chancay_01", nombre: "Estación Santo Domingo (Huaral)", lat: -11.4925, lng: -77.2081 },
    { id: "nodo_chancay_02", nombre: "Estación Acos (Media Cuenca)", lat: -11.2722, lng: -76.8153 },
    { id: "nodo_chancay_03", nombre: "Estación Chancay (Desembocadura)", lat: -11.5683, lng: -77.2703 },
  ]);

// --- Health Check ---
export const getHealth = () => api.get("/").then((r) => r.data);

export default api;