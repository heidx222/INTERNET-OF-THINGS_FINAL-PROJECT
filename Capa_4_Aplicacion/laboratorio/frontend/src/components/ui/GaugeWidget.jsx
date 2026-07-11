import React from "react";
import { RadialBarChart, RadialBar, PolarAngleAxis } from "recharts";
import clsx from "clsx";

/**
 * Widget tipo medidor (gauge) semicircular construido sobre Recharts.
 * Usado para representar estados críticos de un solo vistazo:
 * Índice de Salud Hídrica, Nivel de Río relativo a umbral, etc.
 *
 * @param {number} value - Valor actual (0-100 por defecto)
 * @param {number} max - Valor máximo de la escala
 * @param {string} label - Etiqueta descriptiva bajo el medidor
 * @param {string} unit - Unidad mostrada junto al valor central
 */
export default function GaugeWidget({ value = 0, max = 100, label, unit = "%", colorClass }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));

  let color = "#17B896"; // aqua-500 (óptimo)
  if (pct < 45) color = "#E4483C"; // critical
  else if (pct < 75) color = "#F0A93E"; // warning

  const data = [{ name: label, value: pct, fill: color }];

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-full max-w-[180px] aspect-[2/1.15]">
        <RadialBarChart
          width={180}
          height={104}
          cx="50%"
          cy="100%"
          innerRadius="130%"
          outerRadius="180%"
          barSize={14}
          data={data}
          startAngle={180}
          endAngle={0}
        >
          <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
          <RadialBar
            background={{ fill: "#EEF1F3" }}
            dataKey="value"
            cornerRadius={8}
            angleAxisId={0}
          />
        </RadialBarChart>
        <div className="absolute inset-0 flex flex-col items-center justify-end pb-1">
          <span className={clsx("font-display font-bold text-2xl", colorClass)} style={{ color }}>
            {Math.round(value)}
            <span className="text-sm font-medium">{unit}</span>
          </span>
        </div>
      </div>
      {label && <p className="text-xs font-medium text-slate_tech-500 mt-1 text-center">{label}</p>}
    </div>
  );
}
