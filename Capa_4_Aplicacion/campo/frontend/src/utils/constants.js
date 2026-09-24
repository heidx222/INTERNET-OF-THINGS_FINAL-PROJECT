/**
 * Constantes del dominio "Yaku Qhawaq"
 * Alineadas con Capa 2 (MQTT) y Capa 3 (FastAPI/PostgreSQL).
 * Estaciones oficiales hidrométricas de la Cuenca Chancay-Huaral (ANA / SENAMHI).
 */

export const NODO_POR_DEFECTO = "nodo_chancay_01";

export const SENSOR_META = {
  nivel_m: { label: "Nivel del Río", unidad: "m", color: "#1A83AC" },
  temp_ambiente_c: { label: "Temp. Ambiente", unidad: "°C", color: "#F0A93E" },
  temp_agua_c: { label: "Temp. del Agua", unidad: "°C", color: "#3FA3C7" },
  tds_ppm: { label: "TDS (Sólidos Disueltos)", unidad: "ppm", color: "#12997E" },
  ph: { label: "pH", unidad: "", color: "#0F5273" },
  turbidez_ntu: { label: "Turbidez", unidad: "NTU", color: "#E4483C" },
};

// Umbrales operacionales y de alerta de la Cuenca Chancay-Huaral
export const UMBRALES = {
  nivel_m: { min: 0.4, max: 3.5 },
  tds_ppm: { min: 0, max: 500 },
  ph: { min: 6.5, max: 8.5 },
  turbidez_ntu: { min: 0, max: 50 },
};

// Estaciones Oficiales de Control - Cuenca Chancay-Huaral (ANA / SENAMHI)
export const NODOS_CUENCA = [
  { 
    id: "nodo_chancay_01", 
    nombre: "Estación Santo Domingo - Huaral (Principal)",
    tipo: "Hidrométrica Control",
    lat: -11.4925,
    lng: -77.2081
  },
  { 
    id: "nodo_chancay_02", 
    nombre: "Estación Acos - San Miguel de Acos (Alta Cuenca)",
    tipo: "Hidrométrica / Alerta Temprana",
    lat: -11.2722,
    lng: -76.8153
  },
  { 
    id: "nodo_chancay_03", 
    nombre: "Estación Chancay - Bocatoma (Baja Cuenca)",
    tipo: "Monitoreo Calidad de Agua",
    lat: -11.5683,
    lng: -77.2703
  },
];