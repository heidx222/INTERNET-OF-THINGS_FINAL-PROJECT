import React, { useMemo, useState } from "react";
import { format } from "date-fns";
import { Download, CheckCircle2, Filter } from "lucide-react";
import { useTelemetry } from "../context/TelemetryContext.jsx";
import Card from "../components/ui/Card.jsx";
import SeverityBadge from "../components/ui/SeverityBadge.jsx";
import { buildExportCsvUrl } from "../services/api.js";

const FILTROS = [
  { value: "TODAS", label: "Todas" },
  { value: "CRITICO", label: "Críticas" },
  { value: "ADVERTENCIA", label: "Advertencias" },
];

/**
 * Motor de Notificaciones en Tiempo Real.
 *
 * Combina un panel de eventos instantáneos (los más recientes, con
 * indicador visual pulsante para no-atendidos) con el historial
 * cronológico completo de todas las anomalías detectadas por la IA
 * (fuente: `GET /api/alertas`, actualizado en vivo por `WS /ws/alertas`).
 */
export default function Notificaciones() {
  const { alertas, marcarAlertaAtendida } = useTelemetry();
  const [filtro, setFiltro] = useState("TODAS");

  const alertasFiltradas = useMemo(() => {
    if (filtro === "TODAS") return alertas;
    return alertas.filter((a) => a.severidad === filtro);
  }, [alertas, filtro]);

  const criticas = alertas.filter((a) => a.severidad === "CRITICO").length;
  const advertencias = alertas.filter((a) => a.severidad === "ADVERTENCIA").length;

  return (
    <div className="space-y-6">
      {/* Resumen */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-l-4 border-l-critical">
          <p className="text-xs text-slate_tech-500">Alertas Críticas</p>
          <p className="font-display font-bold text-3xl text-critical">{criticas}</p>
        </Card>
        <Card className="border-l-4 border-l-warning">
          <p className="text-xs text-slate_tech-500">Advertencias</p>
          <p className="font-display font-bold text-3xl text-warning">{advertencias}</p>
        </Card>
        <Card className="border-l-4 border-l-aqua-500">
          <p className="text-xs text-slate_tech-500">Total Histórico (sesión)</p>
          <p className="font-display font-bold text-3xl text-aqua-600">{alertas.length}</p>
        </Card>
      </div>

      <Card
        title="Historial Cronológico de Anomalías"
        subtitle="Alimentado en tiempo real por el motor Isolation Forest (motor_ia_chancay)"
        actions={
          <a
            href={buildExportCsvUrl({ tipo: "alertas" })}
            className="inline-flex items-center gap-2 text-xs font-semibold text-white bg-river-700 hover:bg-river-800 rounded-lg px-3 py-2 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Exportar CSV
          </a>
        }
      >
        {/* Filtros */}
        <div className="flex items-center gap-2 mb-4">
          <Filter className="w-4 h-4 text-slate_tech-400" />
          {FILTROS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFiltro(f.value)}
              className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
                filtro === f.value
                  ? "bg-river-700 text-white border-river-700"
                  : "bg-white text-slate_tech-600 border-slate_tech-200 hover:border-river-400"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Lista */}
        <div className="space-y-2 max-h-[560px] overflow-y-auto pr-1">
          {alertasFiltradas.length === 0 && (
            <p className="text-sm text-slate_tech-400 text-center py-12">
              No hay alertas registradas para este filtro.
            </p>
          )}

          {alertasFiltradas.map((a) => (
            <div
              key={a.id}
              className={`flex items-start gap-3 p-4 rounded-xl border transition-colors ${
                a.atendida
                  ? "bg-slate_tech-50 border-slate_tech-200"
                  : a.severidad === "CRITICO"
                  ? "bg-critical/5 border-critical/30 animate-pulse-slow"
                  : "bg-warning/5 border-warning/30"
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <SeverityBadge severidad={a.severidad} size="sm" />
                  <span className="text-[11px] font-mono text-slate_tech-400">{a.id}</span>
                  <span className="text-[11px] text-slate_tech-400">
                    {format(new Date(a.ts), "dd/MM/yyyy HH:mm:ss")}
                  </span>
                </div>
                <p className="text-sm font-medium text-slate_tech-800">{a.mensaje}</p>
                <p className="text-xs text-slate_tech-500 mt-0.5">
                  Nodo: <span className="font-mono">{a.nodo_id}</span> · Origen: {a.origen}
                </p>
              </div>

              {!a.atendida ? (
                <button
                  onClick={() => marcarAlertaAtendida(a.id)}
                  title="Marcar como atendida"
                  className="shrink-0 p-2 rounded-lg hover:bg-white text-slate_tech-400 hover:text-aqua-600 transition-colors"
                >
                  <CheckCircle2 className="w-5 h-5" />
                </button>
              ) : (
                <span className="shrink-0 text-[11px] font-medium text-aqua-600 flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" /> Atendida
                </span>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
