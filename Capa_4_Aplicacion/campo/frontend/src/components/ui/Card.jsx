import React from "react";
import clsx from "clsx";

/** Contenedor de tarjeta corporativo estándar, reutilizado en todo el sistema. */
export default function Card({ children, className, title, subtitle, actions }) {
  return (
    <div className={clsx("bg-white rounded-2xl shadow-card border border-slate_tech-200/70 p-5", className)}>
      {(title || actions) && (
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            {title && <h3 className="font-display font-semibold text-slate_tech-900">{title}</h3>}
            {subtitle && <p className="text-xs text-slate_tech-500 mt-0.5">{subtitle}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </div>
  );
}
