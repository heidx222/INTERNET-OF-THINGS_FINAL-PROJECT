import React from "react";
import clsx from "clsx";

/** Tarjeta compacta de indicador clave (KPI) con icono, valor y tendencia. */
export default function KpiCard({ icon: Icon, label, value, unit, tone = "river" }) {
  const toneClasses = {
    river: "bg-river-500/10 text-river-600",
    aqua: "bg-aqua-500/10 text-aqua-600",
    critical: "bg-critical/10 text-critical",
    warning: "bg-warning/10 text-warning",
  };

  return (
    <div className="bg-white rounded-2xl shadow-card border border-slate_tech-200/70 p-5 flex items-center gap-4">
      <div className={clsx("w-12 h-12 rounded-xl flex items-center justify-center shrink-0", toneClasses[tone])}>
        {Icon && <Icon className="w-6 h-6" strokeWidth={2} />}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate_tech-500 truncate">{label}</p>
        <p className="font-display font-bold text-2xl text-slate_tech-900 leading-tight">
          {value}
          {unit && <span className="text-sm font-medium text-slate_tech-500 ml-1">{unit}</span>}
        </p>
      </div>
    </div>
  );
}
