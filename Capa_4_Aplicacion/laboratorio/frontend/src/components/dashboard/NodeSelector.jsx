import React from "react";
import { NODOS_CUENCA } from "../../utils/constants.js";

/** Selector simple de nodo de monitoreo, reutilizado en Dashboard e Histórico. */
export default function NodeSelector({ value, onChange }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="text-sm border border-slate_tech-200 rounded-lg px-3 py-2 bg-white text-slate_tech-800 focus:outline-none focus:ring-2 focus:ring-river-400"
    >
      {NODOS_CUENCA.map((n) => (
        <option key={n.id} value={n.id}>
          {n.nombre}
        </option>
      ))}
    </select>
  );
}
