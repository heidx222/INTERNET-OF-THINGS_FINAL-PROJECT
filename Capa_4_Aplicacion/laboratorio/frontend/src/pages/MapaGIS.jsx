import React, { useEffect, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, Polyline } from "react-leaflet";
import L from "leaflet";
import { format } from "date-fns";
import Card from "../components/ui/Card.jsx";
import SeverityBadge from "../components/ui/SeverityBadge.jsx";
import { getNodosGIS } from "../services/api.js";
import { useTelemetry } from "../context/TelemetryContext.jsx";

// Corrección estándar de rutas de iconos de Leaflet al empaquetar con Vite.
delete L.Icon.Default.prototype._getIconUrl;

const CENTRO_CUENCA = [-11.45, -76.95]; // Centro aproximado de la Cuenca Chancay-Huaral
const RECORRIDO_RIO = [
  [-11.30, -76.72],
  [-11.3336, -76.7864],
  [-11.4959, -77.2072],
  [-11.5744, -77.2694],
];

function colorPorEstado(lectura) {
  if (!lectura) return "#7C8894"; // gris técnico (sin datos)
  if (lectura.diagnostico?.es_anomalia) return "#E4483C"; // crítico
  if ((lectura.salud_hidrica_pct ?? 100) < 75) return "#F0A93E"; // advertencia
  return "#17B896"; // óptimo
}

/**
 * Mapa Geográfico (GIS) interactivo basado en Leaflet.
 *
 * Ubica los nodos de monitoreo de la Cuenca Chancay-Huaral sobre el
 * mapa base OpenStreetMap, coloreando cada marcador según su estado
 * (óptimo / advertencia / crítico / sin datos) y mostrando sus
 * métricas más recientes en un popup flotante al hacer clic.
 */
export default function MapaGIS() {
  const [nodosGIS, setNodosGIS] = useState([]);
  const { nodos } = useTelemetry();

  useEffect(() => {
    let activo = true;
    const cargar = () => getNodosGIS().then((data) => activo && setNodosGIS(data)).catch(() => {});
    cargar();
    const interval = setInterval(cargar, 10000);
    return () => {
      activo = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="space-y-6">
      <Card
        title="Distribución Geográfica de Nodos"
        subtitle="Cuenca Chancay-Huaral · Departamento de Lima, Perú"
      >
        <div className="rounded-xl overflow-hidden border border-slate_tech-200" style={{ height: 520 }}>
          <MapContainer center={CENTRO_CUENCA} zoom={10} style={{ height: "100%", width: "100%" }}>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            <Polyline positions={RECORRIDO_RIO} pathOptions={{ color: "#1A83AC", weight: 3, opacity: 0.6, dashArray: "6 6" }} />

            {nodosGIS.map((n) => {
              const lecturaViva = nodos[n.nodo_id] || n.ultima_lectura;
              return (
                <CircleMarker
                  key={n.nodo_id}
                  center={[n.lat, n.lng]}
                  radius={12}
                  pathOptions={{
                    color: "#ffffff",
                    weight: 2,
                    fillColor: colorPorEstado(lecturaViva),
                    fillOpacity: 0.9,
                  }}
                >
                  <Popup>
                    <div className="text-sm space-y-1 min-w-[200px]">
                      <p className="font-bold text-slate_tech-900">{n.nombre}</p>
                      <p className="text-xs text-slate_tech-500 font-mono">{n.nodo_id}</p>
                      <p className="text-xs">
                        Estado infraestructura:{" "}
                        <span className="font-semibold">{n.estado_infraestructura}</span>
                      </p>

                      {lecturaViva ? (
                        <div className="pt-2 border-t border-slate_tech-100 space-y-1">
                          <p>
                            Nivel: <b>{lecturaViva.nivel_m?.toFixed(2)} m</b>
                          </p>
                          <p>
                            pH: <b>{lecturaViva.ph?.toFixed(2)}</b> · TDS:{" "}
                            <b>{lecturaViva.tds_ppm?.toFixed(0)} ppm</b>
                          </p>
                          <p>
                            Turbidez: <b>{lecturaViva.turbidez_ntu?.toFixed(1)} NTU</b>
                          </p>
                          {lecturaViva.diagnostico?.es_anomalia && (
                            <div className="pt-1">
                              <SeverityBadge severidad="CRITICO" size="sm" />
                            </div>
                          )}
                          <p className="text-[10px] text-slate_tech-400 pt-1">
                            Última lectura: {lecturaViva.ts ? format(new Date(lecturaViva.ts), "dd/MM HH:mm:ss") : "—"}
                          </p>
                        </div>
                      ) : (
                        <p className="text-xs text-slate_tech-400 pt-2 border-t border-slate_tech-100">
                          Sin telemetría disponible (nodo planificado / offline).
                        </p>
                      )}
                    </div>
                  </Popup>
                </CircleMarker>
              );
            })}
          </MapContainer>
        </div>
      </Card>

      {/* Leyenda */}
      <Card title="Leyenda">
        <div className="flex flex-wrap gap-6 text-sm">
          <span className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-ok inline-block" /> Óptimo
          </span>
          <span className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-warning inline-block" /> Advertencia
          </span>
          <span className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-critical inline-block" /> Crítico
          </span>
          <span className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-slate_tech-400 inline-block" /> Sin datos / Planificado
          </span>
        </div>
      </Card>
    </div>
  );
}
