import React from "react";
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  BellRing,
  History,
  SlidersHorizontal,
  Map as MapIcon,
  Droplets,
  Circle,
} from "lucide-react";
import { useTelemetry } from "../../context/TelemetryContext.jsx";
import clsx from "clsx";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/notificaciones", label: "Notificaciones", icon: BellRing },
  { to: "/historico", label: "Estadísticas Históricas", icon: History },
  { to: "/telecontrol", label: "Telecontrol", icon: SlidersHorizontal },
  { to: "/mapa", label: "Mapa GIS", icon: MapIcon },
];

/**
 * Barra lateral de navegación principal. En móvil se colapsa fuera del
 * viewport y se controla mediante `isOpen`/`onClose` (ver Layout.jsx).
 */
export default function Sidebar({ isOpen, onClose }) {
  const { wsTelemetriaConectado, wsAlertasConectado } = useTelemetry();

  return (
    <>
      {/* Overlay móvil */}
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate_tech-900/50 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={clsx(
          "fixed z-40 inset-y-0 left-0 w-72 bg-river-950 text-white flex flex-col",
          "transform transition-transform duration-300 lg:translate-x-0 lg:static lg:z-0",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Marca */}
        <div className="flex items-center gap-3 px-6 py-6 border-b border-white/10">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-river-500 to-aqua-500 flex items-center justify-center shadow-card">
            <Droplets className="w-6 h-6 text-white" strokeWidth={2.2} />
          </div>
          <div>
            <h1 className="font-display font-bold text-lg leading-tight tracking-tight">
              Yaku Qhawaq
            </h1>
            <p className="text-[11px] text-river-300 uppercase tracking-wider">
              Guardián del Agua
            </p>
          </div>
        </div>

        {/* Navegación */}
        <nav className="flex-1 px-3 py-6 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={onClose}
              className={({ isActive }) =>
                clsx(
                  "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors",
                  isActive
                    ? "bg-white/10 text-white shadow-inner"
                    : "text-river-200 hover:bg-white/5 hover:text-white"
                )
              }
            >
              <Icon className="w-5 h-5 shrink-0" strokeWidth={2} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Estado de conexión */}
        <div className="px-6 py-5 border-t border-white/10 text-xs space-y-2">
          <div className="flex items-center gap-2 text-river-200">
            <Circle
              className={clsx(
                "w-2.5 h-2.5",
                wsTelemetriaConectado ? "fill-aqua-400 text-aqua-400" : "fill-critical text-critical"
              )}
            />
            Telemetría en vivo
          </div>
          <div className="flex items-center gap-2 text-river-200">
            <Circle
              className={clsx(
                "w-2.5 h-2.5",
                wsAlertasConectado ? "fill-aqua-400 text-aqua-400" : "fill-critical text-critical"
              )}
            />
            Motor de alertas
          </div>
          <p className="pt-2 text-river-400">
            Cuenca Chancay-Huaral · Capa 4
          </p>
        </div>
      </aside>
    </>
  );
}
