import React from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { format } from "date-fns";

/**
 * Gráfico de líneas interactivo genérico para series temporales de
 * sensores (Nivel del río, Caudal estimado, pH, TDS, Turbidez, etc.).
 *
 * @param {Array} data - Array de lecturas con campo `ts` (epoch ms)
 * @param {Array} lines - [{ dataKey, name, color }]
 * @param {string} yUnit - Unidad mostrada en el eje Y / tooltip
 */
export default function TimeSeriesChart({ data = [], lines = [], height = 260, yUnit = "" }) {
  const formatted = data.map((d) => ({ ...d, _label: format(new Date(d.ts), "HH:mm:ss") }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={formatted} margin={{ top: 5, right: 12, left: -12, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#EEF1F3" />
        <XAxis dataKey="_label" tick={{ fontSize: 11, fill: "#7C8894" }} minTickGap={30} />
        <YAxis tick={{ fontSize: 11, fill: "#7C8894" }} unit={yUnit} width={48} />
        <Tooltip
          contentStyle={{ borderRadius: 12, border: "1px solid #D3D8DD", fontSize: 12 }}
          labelStyle={{ fontWeight: 600, color: "#12181F" }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {lines.map((line) => (
          <Line
            key={line.dataKey}
            type="monotone"
            dataKey={line.dataKey}
            name={line.name}
            stroke={line.color}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
