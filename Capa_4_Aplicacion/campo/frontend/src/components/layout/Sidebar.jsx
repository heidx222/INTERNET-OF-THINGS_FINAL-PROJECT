import React, { useMemo } from "react";
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  BellRing,
  History,
  SlidersHorizontal,
  Map as MapIcon,
  Droplets,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Activity,
} from "lucide-react";
import { useTelemetry } from "../../context/TelemetryContext.jsx";
import clsx from "clsx";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/notificaciones", label: "Notificaciones", icon: BellRing, badgeKey: "alertas" },
  { to: "/historico", label: "Estadísticas Históricas", icon: History },
  { to: "/telecontrol", label: "Telecontrol", icon: SlidersHorizontal },
  { to: "/mapa", label: "Mapa GIS", icon: MapIcon },
];

export default function Sidebar({ isOpen, onClose, collapsed, onToggleCollapse }) {
  const { wsTelemetriaConectado, wsAlertasConectado, telemetria, alertas = [] } = useTelemetry();

  // Alertas no atendidas para la badget
  const alertasNoAtendidas = useMemo(() => {
    return Array.isArray(alertas) ? alertas.filter((a) => !a.atendida).length : 0;
  }, [alertas]);

  // EVALUACIÓN DINÁMICA DE LAS 4 CAPAS
  const capasEstado = useMemo(() => {
    const ultimaLectura = Array.isArray(telemetria) && telemetria.length > 0 ? telemetria[0] : null;
    const tsUltimo = ultimaLectura?.timestamp_registro || ultimaLectura?.ts;
    const haceCuanto = tsUltimo ? Date.now() - new Date(tsUltimo).getTime() : Infinity;

    // Si llegó una lectura en los últimos 30 segundos, Capa 1 está transmitiendo
    const capa1Online = haceCuanto < 30000;
    const capa2Online = Boolean(wsTelemetriaConectado);
    const capa3Online = Boolean(wsAlertasConectado);
    const capa4Online = typeof navigator !== "undefined" ? navigator.onLine : true;

    return {
      capa1: { label: "C1: Campo", online: capa1Online, sub: capa1Online ? "Transmitiendo" : "Sin Lectura" },
      capa2: { label: "C2: Gateway (Node-RED)", online: capa2Online, sub: capa2Online ? "WS Conectado" : "Desconectado" },
      capa3: { label: "C3: IA & Servidores", online: capa3Online, sub: capa3Online ? "FastAPI / BD" : "Sin Servicio" },
      capa4: { label: "C4: Interfaz", online: capa4Online, sub: capa4Online ? "En Línea" : "Sin Red" },
    };
  }, [wsTelemetriaConectado, wsAlertasConectado, telemetria]);

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
          "fixed z-40 inset-y-0 left-0 bg-slate_tech-900 text-white flex flex-col border-r border-slate_tech-800 shadow-2xl transition-all duration-300 select-none",
          "lg:static lg:z-0",
          isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
          collapsed ? "lg:w-20" : "lg:w-72",
          "w-72"
        )}
      >
        {/* Marca */}
        <div className="flex items-center justify-between px-5 py-5 border-b border-slate_tech-800/80">
          <div className="flex items-center gap-3.5 overflow-hidden">
            <div className="relative shrink-0 w-10 h-10 rounded-xl bg-gradient-to-tr from-river-600 via-aqua-500 to-teal-400 flex items-center justify-center shadow-lg shadow-river-900/40">
              <Droplets className="w-6 h-6 text-white" strokeWidth={2.2} />
              <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-aqua-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-aqua-500"></span>
              </span>
            </div>
            {(!collapsed || isOpen) && (
              <div className="transition-all duration-300 min-w-0">
                <h1 className="font-display font-bold text-base leading-tight tracking-tight text-slate-100 truncate">
                  Yaku Qhawaq
                </h1>
                <p className="text-[10px] font-semibold text-aqua-400 uppercase tracking-widest truncate">
                  Guardián del Agua
                </p>
              </div>
            )}
          </div>

          {/* Botón Colapsar Desktop */}
          <button
            onClick={onToggleCollapse}
            className="hidden lg:flex p-1.5 rounded-lg bg-slate_tech-800/80 hover:bg-slate_tech-700 text-slate_tech-400 hover:text-white transition-colors"
            title={collapsed ? "Expandir menú" : "Colapsar menú"}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* Navegación Principal */}
        <nav className="flex-1 px-3 py-6 space-y-1.5 overflow-y-auto custom-scrollbar">
          {NAV_ITEMS.map(({ to, label, icon: Icon, badgeKey }) => (
            <NavLink
              key={to}
              to={to}
              onClick={onClose}
              className={({ isActive }) =>
                clsx(
                  "group relative flex items-center gap-3.5 px-3.5 py-3 rounded-xl text-sm font-medium transition-all duration-200",
                  isActive
                    ? "bg-gradient-to-r from-river-600/90 to-river-700 text-white shadow-md shadow-river-900/30 font-semibold"
                    : "text-slate-400 hover:bg-slate_tech-800/60 hover:text-slate-200"
                )
              }
              title={collapsed ? label : undefined}
            >
              <Icon className="w-5 h-5 shrink-0 transition-transform group-hover:scale-110" strokeWidth={2} />
              
              {(!collapsed || isOpen) && (
                <span className="truncate flex-1">{label}</span>
              )}

              {/* Badges especiales */}
              {badgeKey === "alertas" && alertasNoAtendidas > 0 && (
                <span
                  className={clsx(
                    "bg-critical text-white font-bold text-[10px] rounded-full flex items-center justify-center transition-all",
                    collapsed && !isOpen
                      ? "absolute top-2 right-2 w-2 h-2 p-0"
                      : "px-2 py-0.5"
                  )}
                >
                  {(!collapsed || isOpen) && (alertasNoAtendidas > 99 ? "99+" : alertasNoAtendidas)}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Card de Estado por Capas */}
        {(!collapsed || isOpen) ? (
          <div className="m-3 p-3.5 rounded-xl bg-slate_tech-950/60 border border-slate_tech-800/80 text-xs space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-aqua-400" /> Estado por Capas
              </span>
            </div>

            <div className="space-y-2">
              {Object.entries(capasEstado).map(([key, capa]) => (
                <div key={key} className="flex items-center justify-between text-slate-300">
                  <span className="flex items-center gap-2">
                    <span
                      className={clsx(
                        "w-2 h-2 rounded-full transition-all",
                        capa.online ? "bg-aqua-400 animate-pulse shadow-sm shadow-aqua-400" : "bg-critical"
                      )}
                    />
                    <span className="text-[11px] font-medium">{capa.label}</span>
                  </span>
                  <span
                    className={clsx(
                      "font-mono text-[9px] px-1.5 py-0.5 rounded font-semibold",
                      capa.online ? "bg-aqua-950/80 text-aqua-300" : "bg-red-950/80 text-red-400"
                    )}
                  >
                    {capa.online ? "ONLINE" : "OFFLINE"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="p-3 flex flex-col items-center gap-2 border-t border-slate_tech-800">
            {Object.entries(capasEstado).map(([key, capa]) => (
              <span
                key={key}
                className={clsx(
                  "w-2.5 h-2.5 rounded-full transition-all",
                  capa.online ? "bg-aqua-400 animate-pulse" : "bg-critical"
                )}
                title={`${capa.label}: ${capa.online ? "ONLINE" : "OFFLINE"}`}
              />
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate_tech-800/80 text-[11px] text-slate_tech-500 flex items-center justify-between">
          {(!collapsed || isOpen) && (
            <>
              <span>Chancay-Huaral v2.0</span>
              <ShieldCheck className="w-4 h-4 text-aqua-500/70" />
            </>
          )}
        </div>
      </aside>
    </>
  );
}