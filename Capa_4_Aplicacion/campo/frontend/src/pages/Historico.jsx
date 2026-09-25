import React, { useState, useCallback, useMemo, useEffect } from "react";
import { format } from "date-fns";
import { Download, Search, TrendingUp, TrendingDown, RefreshCw } from "lucide-react";
import Card from "../components/ui/Card.jsx";
import TimeSeriesChart from "../components/ui/TimeSeriesChart.jsx";
import NodeSelector from "../components/dashboard/NodeSelector.jsx";
import { getTelemetriaHistorica, buildExportCsvUrl } from "../services/api.js";
import { descargarCsv } from "../utils/csv.js";
import { NODO_POR_DEFECTO } from "../utils/constants.js";

function formatearFechaSegura(rawFecha) {
  if (!rawFecha) return "—";
  const d = new Date(rawFecha);
  if (isNaN(d.getTime())) return "—";
  return format(d, "dd/MM/yyyy HH:mm:ss");
}

function formatearNumero(valor, decimales = 2) {
  const num = Number(valor);
  if (isNaN(num) || valor === null || valor === undefined) return "0.00";
  return num.toFixed(decimales);
}

export default function Historico() {
  const [nodoId, setNodoId] = useState(NODO_POR_DEFECTO);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [datos, setDatos] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [consultado, setConsultado] = useState(false);

  const consultar = useCallback(async () => {
    setCargando(true);
    try {
      const params = {
        nodoId: nodoId || undefined,
        limit: 500,
      };

      if (desde) {
        params.desde = new Date(desde).toISOString();
      }
      if (hasta) {
        params.hasta = new Date(hasta).toISOString();
      }

      const resp = await getTelemetriaHistorica(params);
      const lista = Array.isArray(resp) ? resp : [];

      const normalizado = lista
        .map((r) => {
          const rawTime = r.created_at || r.timestamp_registro || r.timestamp_ms || r.ts;
          const parsedTime = rawTime ? new Date(rawTime).getTime() : Date.now();

          return {
            ...r,
            ts: isNaN(parsedTime) ? Date.now() : parsedTime,
            nodo_id: r.node_id || r.nodo_id || nodoId,
            nivel_m: Number(r.nivel_m ?? r.nivel) || 0,
            temp_ambiente_c: Number(r.temp_ambiente_c) || 0,
            temp_agua_c: Number(r.temp_agua_c ?? r.temp_agua) || 0,
            tds_ppm: Number(r.tds_ppm ?? r.tds) || 0,
            ph: Number(r.ph) || 0,
            turbidez_ntu: Number(r.turbidez_ntu ?? r.turbidez) || 0,
            es_anomalia: Boolean(r.es_anomalia || r.alerta),
          };
        })
        .sort((a, b) => a.ts - b.ts);

      setDatos(normalizado);
    } catch (e) {
      console.error("Error al consultar histórico:", e);
      setDatos([]);
    } finally {
      setCargando(false);
      setConsultado(true);
    }
  }, [desde, hasta, nodoId]);

  // Carga inicial automática de datos desde PostgreSQL
  useEffect(() => {
    consultar();
  }, [nodoId]);

  const stats = useMemo(() => {
    if (!datos || datos.length === 0) return null;

    const total = datos.length;
    const anomalias = datos.filter((d) => d.es_anomalia).length;
    const pctAnomalias = ((anomalias / total) * 100).toFixed(1);
    const saludHidricaPct = Math.max(0, 100 - Number(pctAnomalias) * 2).toFixed(1);

    return {
      totalRegistros: total,
      anomalias,
      pctAnomalias,
      saludHidricaPct,
    };
  }, [datos]);

  const exportarVistaActual = () => {
    descargarCsv(
      datos,
      [
        { key: "ts", header: "timestamp" },
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
            <label className="block text-xs font-medium text-slate_tech-500 mb-1">Desde (Opcional)</label>
            <input
              type="datetime-local"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
              className="text-sm border border-slate_tech-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-river-400"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate_tech-500 mb-1">Hasta (Opcional)</label>
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
            {cargando ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            {cargando ? "Consultando..." : "Consultar"}
          </button>

          {(desde || hasta) && (
            <button
              onClick={() => { setDesde(""); setHasta(""); }}
              className="text-xs text-slate_tech-500 underline py-2"
            >
              Limpiar Fechas
            </button>
          )}

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
              target="_blank"
              rel="noopener noreferrer"
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
          <Card title="Tendencia: Nivel del Río" subtitle="Histórico persistido en PostgreSQL">
            <TimeSeriesChart
              data={datos}
              lines={[{ dataKey: "nivel_m", name: "Nivel (m)", color: "#1A83AC" }]}
            />
          </Card>
          <Card title="Tendencia: pH y Turbidez" subtitle="Histórico persistido en PostgreSQL">
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
                      ? "No se encontraron registros en PostgreSQL para el filtro actual."
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
                      {formatearFechaSegura(d.created_at || d.ts)}
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs">{d.nodo_id || nodoId}</td>
                    <td className="py-2 pr-4">{formatearNumero(d.nivel_m, 2)}</td>
                    <td className="py-2 pr-4">{formatearNumero(d.temp_agua_c, 1)}</td>
                    <td className="py-2 pr-4">{formatearNumero(d.tds_ppm, 0)}</td>
                    <td className="py-2 pr-4">{formatearNumero(d.ph, 2)}</td>
                    <td className="py-2 pr-4">{formatearNumero(d.turbidez_ntu, 1)}</td>
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