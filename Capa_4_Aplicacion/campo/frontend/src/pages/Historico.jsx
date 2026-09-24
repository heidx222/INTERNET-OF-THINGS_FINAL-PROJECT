import React, { useState, useCallback, useMemo } from "react";
import { format, subDays } from "date-fns";
import { Download, Search, TrendingUp, TrendingDown } from "lucide-react";
import Card from "../components/ui/Card.jsx";
import TimeSeriesChart from "../components/ui/TimeSeriesChart.jsx";
import NodeSelector from "../components/dashboard/NodeSelector.jsx";
import { getTelemetriaHistorica } from "../services/api.js";
import { buildExportCsvUrl } from "../services/api.js";
import { descargarCsv } from "../utils/csv.js";
import { NODO_POR_DEFECTO } from "../utils/constants.js";

const hoyIso = () => format(new Date(), "yyyy-MM-dd'T'HH:mm");
const hace7diasIso = () => format(subDays(new Date(), 7), "yyyy-MM-dd'T'HH:mm");

/**
 * Sección de Estadísticas Históricas.
 *
 * Permite al analista seleccionar un rango de fechas y un nodo,
 * consultar el histórico persistido en PostgreSQL (a través del
 * proxy `GET /api/telemetria/historico` de Node-RED → `motor_ia_chancay`),
 * visualizar tendencias y calcular el % de salud hídrica del periodo.
 */
export default function Historico() {
  const [nodoId, setNodoId] = useState(NODO_POR_DEFECTO);
  const [desde, setDesde] = useState(hace7diasIso());
  const [hasta, setHasta] = useState(hoyIso());
  const [datos, setDatos] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [consultado, setConsultado] = useState(false);

  const consultar = useCallback(async () => {
    setCargando(true);
    try {
      const resp = await getTelemetriaHistorica({
        desde: desde ? new Date(desde).toISOString() : undefined,
        hasta: hasta ? new Date(hasta).toISOString() : undefined,
        nodoId,
        limit: 1000,
      });
      const normalizado = (Array.isArray(resp) ? resp : [])
        .map((r) => ({
          ...r,
          ts: new Date(r.timestamp_registro).getTime(),
        }))
        .sort((a, b) => a.ts - b.ts);
      setDatos(normalizado);
    } catch (e) {
      setDatos([]);
    } finally {
      setCargando(false);
      setConsultado(true);
    }
  }, [desde, hasta, nodoId]);

  const stats = useMemo(() => {
    if (datos.length === 0) return null;

    const anomalias = datos.filter((d) => d.es_anomalia).length;
    const pctAnomalias = ((anomalias / datos.length) * 100).toFixed(1);
    const saludHidricaPct = Math.max(0, 100 - Number(pctAnomalias) * 2).toFixed(1);

    const promedio = (campo) =>
      (datos.reduce((acc, d) => acc + (Number(d[campo]) || 0), 0) / datos.length).toFixed(2);

    return {
      totalRegistros: datos.length,
      anomalias,
      pctAnomalias,
      saludHidricaPct,
      nivelProm: promedio("nivel_m"),
      phProm: promedio("ph"),
      tdsProm: promedio("tds_ppm"),
      turbidezProm: promedio("turbidez_ntu"),
    };
  }, [datos]);

  const exportarVistaActual = () => {
    descargarCsv(
      datos,
      [
        { key: "timestamp_registro", header: "timestamp" },
        { key: "nodo_id", header: "nodo_id" },
        { key: "nivel_m", header: "nivel_m" },
        { key: "temp_ambiente_c", header: "temp_ambiente_c" },
        { key: "temp_agua_c", header: "temp_agua_c" },
        { key: "tds_ppm", header: "tds_ppm" },
        { key: "ph", header: "ph" },
        { key: "turbidez_ntu", header: "turbidez_ntu" },
        { key: "es_anomalia", header: "es_anomalia" },
      ],
      `historico_${nodoId}_${Date.now()}.csv`
    );
  };

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <Card title="Filtros de Consulta" subtitle="Rango de fechas y nodo de monitoreo">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs font-medium text-slate_tech-500 mb-1">Nodo</label>
            <NodeSelector value={nodoId} onChange={setNodoId} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate_tech-500 mb-1">Desde</label>
            <input
              type="datetime-local"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
              className="text-sm border border-slate_tech-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-river-400"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate_tech-500 mb-1">Hasta</label>
            <input
              type="datetime-local"
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
              className="text-sm border border-slate_tech-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-river-400"
            />
          </div>
          <button
            onClick={consultar}
            disabled={cargando}
            className="inline-flex items-center gap-2 bg-river-700 hover:bg-river-800 text-white text-sm font-semibold rounded-lg px-4 py-2 transition-colors disabled:opacity-60"
          >
            <Search className="w-4 h-4" />
            {cargando ? "Consultando..." : "Consultar"}
          </button>

          <div className="ml-auto flex gap-2">
            <button
              onClick={exportarVistaActual}
              disabled={datos.length === 0}
              className="inline-flex items-center gap-2 text-xs font-semibold text-river-700 border border-river-300 hover:bg-river-50 rounded-lg px-3 py-2 transition-colors disabled:opacity-40"
            >
              <Download className="w-3.5 h-3.5" /> CSV (vista actual)
            </button>
            <a
              href={buildExportCsvUrl({ tipo: "lecturas", nodoId })}
              className="inline-flex items-center gap-2 text-xs font-semibold text-white bg-slate_tech-700 hover:bg-slate_tech-800 rounded-lg px-3 py-2 transition-colors"
            >
              <Download className="w-3.5 h-3.5" /> CSV (buffer en vivo)
            </a>
          </div>
        </div>
      </Card>

      {/* KPIs de salud hídrica del periodo */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card>
            <p className="text-xs text-slate_tech-500">Salud Hídrica del Periodo</p>
            <p className="font-display font-bold text-2xl text-aqua-600 flex items-center gap-1">
              {stats.saludHidricaPct}% <TrendingUp className="w-4 h-4" />
            </p>
          </Card>
          <Card>
            <p className="text-xs text-slate_tech-500">Registros Analizados</p>
            <p className="font-display font-bold text-2xl text-slate_tech-800">{stats.totalRegistros}</p>
          </Card>
          <Card>
            <p className="text-xs text-slate_tech-500">Anomalías Detectadas</p>
            <p className="font-display font-bold text-2xl text-critical flex items-center gap-1">
              {stats.anomalias} <TrendingDown className="w-4 h-4" />
            </p>
          </Card>
          <Card>
            <p className="text-xs text-slate_tech-500">% de Anomalías</p>
            <p className="font-display font-bold text-2xl text-warning">{stats.pctAnomalias}%</p>
          </Card>
        </div>
      )}

      {/* Gráficos de tendencia */}
      {datos.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card title="Tendencia: Nivel del Río" subtitle="Rango de fechas seleccionado">
            <TimeSeriesChart
              data={datos}
              lines={[{ dataKey: "nivel_m", name: "Nivel (m)", color: "#1A83AC" }]}
            />
          </Card>
          <Card title="Tendencia: pH y Turbidez" subtitle="Rango de fechas seleccionado">
            <TimeSeriesChart
              data={datos}
              lines={[
                { dataKey: "ph", name: "pH", color: "#0F5273" },
                { dataKey: "turbidez_ntu", name: "Turbidez (NTU)", color: "#E4483C" },
              ]}
            />
          </Card>
        </div>
      )}

      {/* Tabla de registros */}
      <Card title="Registros Detallados" subtitle="Tabla completa de lecturas del periodo consultado">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate_tech-500 border-b border-slate_tech-200">
                <th className="py-2 pr-4">Fecha/Hora</th>
                <th className="py-2 pr-4">Nodo</th>
                <th className="py-2 pr-4">Nivel (m)</th>
                <th className="py-2 pr-4">Temp. Agua (°C)</th>
                <th className="py-2 pr-4">TDS (ppm)</th>
                <th className="py-2 pr-4">pH</th>
                <th className="py-2 pr-4">Turbidez (NTU)</th>
                <th className="py-2 pr-4">Estado</th>
              </tr>
            </thead>
            <tbody>
              {datos.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center text-slate_tech-400 py-10">
                    {consultado
                      ? "No se encontraron registros para el rango seleccionado."
                      : "Realice una consulta para visualizar los registros históricos."}
                  </td>
                </tr>
              )}
              {datos
                .slice()
                .reverse()
                .slice(0, 200)
                .map((d, i) => (
                  <tr key={i} className="border-b border-slate_tech-100 hover:bg-slate_tech-50">
                    <td className="py-2 pr-4 text-slate_tech-600 whitespace-nowrap">
                      {format(new Date(d.ts), "dd/MM/yyyy HH:mm:ss")}
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs">{d.nodo_id}</td>
                    <td className="py-2 pr-4">{Number(d.nivel_m).toFixed(2)}</td>
                    <td className="py-2 pr-4">{Number(d.temp_agua_c).toFixed(1)}</td>
                    <td className="py-2 pr-4">{Number(d.tds_ppm).toFixed(0)}</td>
                    <td className="py-2 pr-4">{Number(d.ph).toFixed(2)}</td>
                    <td className="py-2 pr-4">{Number(d.turbidez_ntu).toFixed(1)}</td>
                    <td className="py-2 pr-4">
                      {d.es_anomalia ? (
                        <span className="text-critical font-semibold">Anomalía</span>
                      ) : (
                        <span className="text-aqua-600 font-medium">Normal</span>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
