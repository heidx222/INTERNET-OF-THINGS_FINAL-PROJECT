import React from "react";
import clsx from "clsx";
import { AlertTriangle, AlertOctagon, Info } from "lucide-react";

const CONFIG = {
  CRITICO: {
    label: "Crítico",
    icon: AlertOctagon,
    classes: "bg-critical/10 text-critical border-critical/30",
  },
  ADVERTENCIA: {
    label: "Advertencia",
    icon: AlertTriangle,
    classes: "bg-warning/10 text-warning border-warning/30",
  },
  INFO: {
    label: "Informativo",
    icon: Info,
    classes: "bg-river-500/10 text-river-600 border-river-500/30",
  },
};

/** Insignia visual de criticidad: Rojo = Crítico, Amarillo = Advertencia. */
export default function SeverityBadge({ severidad = "INFO", size = "md" }) {
  const cfg = CONFIG[severidad] || CONFIG.INFO;
  const Icon = cfg.icon;
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 font-semibold rounded-full border",
        cfg.classes,
        size === "sm" ? "text-[11px] px-2 py-0.5" : "text-xs px-2.5 py-1"
      )}
    >
      <Icon className={size === "sm" ? "w-3 h-3" : "w-3.5 h-3.5"} />
      {cfg.label}
    </span>
  );
}
