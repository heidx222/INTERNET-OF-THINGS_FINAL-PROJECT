import axios from "axios";

/**
 * =================================================================
 * Cliente HTTP centralizado hacia la API REST del Backend Node-RED
 * (Capa 4, Tab 03 - "API REST /api (CORS)").
 *
 * `baseURL` queda vacío a propósito: en desarrollo, Vite (vite.config.js)
 * reenvía `/api` hacia `http://localhost:1880`; en producción, NGINX
 * (frontend/nginx.conf) reenvía `/api` hacia `app_nodered_chancay:1880`
 * dentro de la red interna de Docker. Esto evita hardcodear hosts y
 * elimina cualquier fricción de CORS al mantener el mismo origen desde
 * la perspectiva del navegador.
 *
 * Si se requiere apuntar a un backend externo, definir
 * `VITE_API_BASE_URL` en un archivo `.env` (ver `.env.example`).
 * =================================================================
 */
const baseURL = import.meta.env.VITE_API_BASE_URL || "";

export const api = axios.create({
  baseURL,
  timeout: 10000,
  headers: { "Content-Type": "application/json" },
});

// --- Endpoints de Telemetría ---
export const getTelemetriaActual = (nodoId) =>
  api.get("/api/telemetria/actual", { params: nodoId ? { nodo_id: nodoId } : {} }).then((r) => r.data);

export const getSerieTemporal = (nodoId, limit = 200) =>
  api.get("/api/telemetria/serie", { params: { nodo_id: nodoId, limit } }).then((r) => r.data);

export const getTelemetriaHistorica = ({ desde, hasta, nodoId, limit = 500 } = {}) =>
  api
    .get("/api/telemetria/historico", {
      params: { desde, hasta, nodo_id: nodoId, limit },
    })
    .then((r) => r.data);

// --- Endpoints de Salud Hídrica ---
export const getSaludHidrica = () => api.get("/api/salud").then((r) => r.data);

// --- Endpoints de Alertas / Notificaciones ---
export const getAlertas = ({ severidad, nodoId, limit = 100 } = {}) =>
  api
    .get("/api/alertas", { params: { severidad, nodo_id: nodoId, limit } })
    .then((r) => r.data);

// --- Endpoints GIS ---
export const getNodosGIS = () => api.get("/api/nodos").then((r) => r.data);

// --- Endpoints de Telecontrol ---
export const enviarComandoTelecontrol = ({ nodoId, actuador, accion, operador }) =>
  api
    .post("/api/telecontrol/comando", { nodo_id: nodoId, actuador, accion, operador })
    .then((r) => r.data);

export const getHistorialTelecontrol = (limit = 100) =>
  api.get("/api/telecontrol/historial", { params: { limit } }).then((r) => r.data);

// --- Exportación de Auditoría ---
export const buildExportCsvUrl = ({ tipo = "alertas", nodoId } = {}) => {
  const params = new URLSearchParams({ tipo });
  if (nodoId) params.set("nodo_id", nodoId);
  return `${baseURL}/api/export/csv?${params.toString()}`;
};

// --- Health Check ---
export const getHealth = () => api.get("/api/health").then((r) => r.data);

export default api;
