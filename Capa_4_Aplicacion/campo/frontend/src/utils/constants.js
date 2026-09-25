/**
 * Constantes del dominio "Yaku Qhawaq"
 * Alineadas con Capa 1 (firmware ESP32), Capa 2 (MQTT) y Capa 3 (FastAPI/PostgreSQL).
 * Estaciones oficiales hidrométricas de la Cuenca Chancay-Huaral (ANA / SENAMHI).
 */

export const NODO_POR_DEFECTO = "nodo_chancay_01";

// Centro operativo de la Cuenca Chancay-Huaral para el mapa Leaflet
export const CENTRO_CUENCA = [-11.4885, -77.0323]; // Huaral / Santo Domingo

export const RECORRIDO_RIO = [
  [-11.2722, -76.8153], // Alta Cuenca (San Miguel de Acos)
  [-11.4500, -76.9500], // Media Cuenca (Santo Domingo / Huaral)
  [-11.5683, -77.2703], // Baja Cuenca (Bocatoma / Chancay - Océano Pacífico)
];

export const SENSOR_META = {
  nivel_m: { label: "Nivel del Río", unidad: "m", color: "#1A83AC" },
  temp_ambiente_c: { label: "Temp. Ambiente", unidad: "°C", color: "#F0A93E" },
  temp_agua_c: { label: "Temp. del Agua", unidad: "°C", color: "#3FA3C7" },
  tds_ppm: { label: "TDS (Sólidos Disueltos)", unidad: "ppm", color: "#12997E" },
  ph: { label: "pH", unidad: "", color: "#0F5273" },
  turbidez_ntu: { label: "Turbidez", unidad: "NTU", color: "#E4483C" },
};

// Umbrales operacionales y de alerta de la Cuenca Chancay-Huaral
// (deben coincidir con Capa 1 verificarAlertas() y Capa 3 MapekEngine)
export const UMBRALES = {
  nivel_m: { min: 0.4, max: 3.5 },
  tds_ppm: { min: 0, max: 500 },
  ph: { min: 6.5, max: 8.5 },
  turbidez_ntu: { min: 0, max: 50 },
};

// Estaciones Oficiales de Control - Cuenca Chancay-Huaral (ANA / SENAMHI).
// `id` es el `node_id` que viaja en el payload MQTT y que persiste la Capa 3.
export const NODOS_CUENCA = [
  {
    id: "nodo_chancay_01",
    nombre: "Estación Santo Domingo - Huaral (Principal)",
    tipo: "Hidrométrica Control",
    estado_infraestructura: "Operativa",
    lat: -11.4885,
    lng: -77.0323,
  },
  {
    id: "nodo_chancay_02",
    nombre: "Estación Acos - San Miguel de Acos (Alta Cuenca)",
    tipo: "Hidrométrica / Alerta Temprana",
    estado_infraestructura: "Planificada",
    lat: -11.2722,
    lng: -76.8153,
  },
  {
    id: "nodo_chancay_03",
    nombre: "Estación Chancay - Bocatoma (Baja Cuenca)",
    tipo: "Monitoreo Calidad de Agua",
    estado_infraestructura: "Planificada",
    lat: -11.5681,
    lng: -77.2703,
  },
];
