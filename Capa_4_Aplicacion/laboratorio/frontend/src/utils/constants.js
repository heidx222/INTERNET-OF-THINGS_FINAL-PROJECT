/**
 * Constantes compartidas del dominio "Yaku Qhawaq".
 * Alineadas 1:1 con la matriz de variables de la Capa 3
 * (ver Capa_3_Soporte_A_Servicios/laboratorio/README_CAPA3_LABORATORIO.md).
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

// Umbrales de referencia (alineados con generar_dataset_sintetico_PRO.py)
export const UMBRALES = {
  nivel_m: { min: 0.4, max: 3.0 },
  tds_ppm: { min: 0, max: 500 },
  ph: { min: 6.5, max: 8.5 },
  turbidez_ntu: { min: 0, max: 50 },
};

export const NODOS_CUENCA = [
  { id: "nodo_chancay_01", nombre: "Puente Huando (Estación Principal)" },
  { id: "nodo_chancay_02", nombre: "Media Cuenca - Acos" },
  { id: "nodo_chancay_03", nombre: "Desembocadura - Chancay" },
];
