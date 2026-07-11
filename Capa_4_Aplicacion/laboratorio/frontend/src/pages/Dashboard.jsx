import React, { useMemo, useState, useEffect } from "react";
import { Waves, Thermometer, Gauge as GaugeIcon, FlaskConical, ShieldAlert } from "lucide-react";
import { useTelemetry } from "../context/TelemetryContext.jsx";
import Card from "../components/ui/Card.jsx";
import KpiCard from "../components/ui/KpiCard.jsx";
import GaugeWidget from "../components/ui/GaugeWidget.jsx";
import TimeSeriesChart from "../components/ui/TimeSeriesChart.jsx";
import SeverityBadge from "../components/ui/SeverityBadge.jsx";
import NodeSelector from "../components/dashboard/NodeSelector.jsx";
import { getSerieTemporal } from "../services/api.js";
import { NODO_POR_DEFECTO } from "../utils/constants.js";

/**
 * Dashboard Central — Vista principal de "Yaku Qhawaq".
 *
 * Combina:
 *   1. KPIs instantáneos de la última lectura del nodo seleccionado.
 *   2. Gauges de estados críticos (Salud Hídrica global, Nivel del río,
 *      pH) para lectura inmediata del estado de la cuenca.
 *   3. Gráficos de líneas de series temporales (Nivel, Caudal estimado,
 *      pH, TDS) alimentados en tiempo real vía WebSocket.
 *   4. Últimas 5 alertas para contexto inmediato sin cambiar de vista.
 */
export default function Dashboard() {
  const { nodos, seriesPorNodo, saludGlobal, alertas } = useTelemetry();
  const [nodoSeleccionado, setNodoSeleccionado] = useState(NODO_POR_DEFECTO);
  const [serieInicial, setSerieInicial] = useState([]);

  const lecturaActual = nodos[nodoSeleccionado];

  // Precarga histórica corta (buffer del backend) para que el gráfico no
  // arranque vacío mientras llegan los primeros eventos por WebSocket.
  useEffect(() => {
    let activo = true;
    getSerieTemporal(nodoSeleccionado, 200)
      .then((resp) => {
        if (activo) setSerieInicial(resp?.datos || []);
      })
      .catch(() => {});
    return () => {
      activo = false;
    };
  }, [nodoSeleccionado]);

  const serieCombinada = useMemo(() => {
    const enVivo = seriesPorNodo[nodoSeleccionado] || [];
    const mapa = new Map();
    [...serieInicial, ...enVivo].forEach((d) => mapa.set(d.ts, d));
    return Array.from(mapa.values()).sort((a, b) => a.ts - b.ts).slice(-200);
  }, [serieInicial, seriesPorNodo, nodoSeleccionado]);

  // "Caudal estimado" derivado ilustrativamente del nivel (Q ~ k * h^1.5),
  // sección transversal simplificada del cauce para fines de visualización.
  const serieConCaudal = useMemo(
    () =>
      serieCombinada.map((d) => ({
        ...d,
        caudal_m3s: +(4.2 * Math.pow(Math.max(d.nivel_m, 0), 1.5)).toFixed(2),
      })),
    [serieCombinada]
  );

  const ultimasAlertas = alertas.slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Selector de nodo */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate_tech-500">
          Vista consolidada de la estación de monitoreo seleccionada.
        </p>
        <NodeSelector value={nodoSeleccionado} onChange={setNodoSeleccionado} />
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={Waves}
          label="Nivel del Río"
          value={lecturaActual?.nivel_m?.toFixed(2) ?? "—"}
          unit="m"
          tone="river"
        />
        <KpiCard
          icon={Thermometer}
          label="Temp. del Agua"
          value={lecturaActual?.temp_agua_c?.toFixed(1) ?? "—"}
          unit="°C"
          tone="aqua"
        />
        <KpiCard
          icon={FlaskConical}
          label="TDS"
          value={lecturaActual?.tds_ppm?.toFixed(0) ?? "—"}
          unit="ppm"
          tone="warning"
        />
        <KpiCard
          icon={GaugeIcon}
          label="pH"
          value={lecturaActual?.ph?.toFixed(2) ?? "—"}
          unit=""
          tone={
            lecturaActual && (lecturaActual.ph < 6.5 || lecturaActual.ph > 8.5) ? "critical" : "river"
          }
        />
      </div>

      {/* Gauges + Alertas recientes */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="Salud Hídrica de la Cuenca" subtitle="Índice global (promedio de nodos activos)">
          <div className="flex justify-center py-2">
            <GaugeWidget value={saludGlobal?.salud_hidrica_pct ?? 0} label={saludGlobal?.estado || "SIN DATOS"} />
          </div>
        </Card>
        <Card title="Nivel del Río (Nodo Actual)" subtitle="Umbral crítico: 0.40 m">
          <div className="flex justify-center py-2">
            <GaugeWidget
              value={lecturaActual ? Math.min(100, (lecturaActual.nivel_m / 3.0) * 100) : 0}
              label={lecturaActual ? `${lecturaActual.nivel_m.toFixed(2)} m` : "Sin lectura"}
            />
          </div>
        </Card>
        <Card
          title="Últimas Alertas"
          subtitle="Panel completo en 'Notificaciones'"
          actions={<ShieldAlert className="w-5 h-5 text-slate_tech-400" />}
        >
          <ul className="space-y-2 max-h-[180px] overflow-y-auto">
            {ultimasAlertas.length === 0 && (
              <li className="text-sm text-slate_tech-400 text-center py-6">Sin alertas recientes.</li>
            )}
            {ultimasAlertas.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 text-xs border-b border-slate_tech-100 pb-2 last:border-0">
                <span className="truncate text-slate_tech-700">{a.mensaje}</span>
                <SeverityBadge severidad={a.severidad} size="sm" />
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* Series temporales */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Nivel del Río y Caudal Estimado" subtitle="Serie temporal en vivo">
          <TimeSeriesChart
            data={serieConCaudal}
            lines={[
              { dataKey: "nivel_m", name: "Nivel (m)", color: "#1A83AC" },
              { dataKey: "caudal_m3s", name: "Caudal est. (m³/s)", color: "#12997E" },
            ]}
          />
        </Card>
        <Card title="pH y TDS" subtitle="Serie temporal en vivo">
          <TimeSeriesChart
            data={serieCombinada}
            lines={[
              { dataKey: "ph", name: "pH", color: "#0F5273" },
              { dataKey: "tds_ppm", name: "TDS (ppm)", color: "#F0A93E" },
            ]}
          />
        </Card>
      </div>
    </div>
  );
}
