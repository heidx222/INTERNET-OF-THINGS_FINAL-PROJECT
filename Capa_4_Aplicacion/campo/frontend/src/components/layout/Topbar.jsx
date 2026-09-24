import React, { useState, useEffect } from "react";
import { Menu, Bell, Clock, ShieldAlert, Cpu, CheckCircle } from "lucide-react";
import { useLocation, Link } from "react-router-dom";
import { useTelemetry } from "../../context/TelemetryContext.jsx";
import { format } from "date-fns";
import { es } from "date-fns/locale";

const TITULOS = {
  "/": "Dashboard Central",
  "/notificaciones": "Notificaciones en Tiempo Real",
  "/historico": "Estadísticas Históricas",
  "/telecontrol": "Panel de Telecontrol",
  "/mapa": "Mapa Geográfico (GIS)",
};

export default function Topbar({ onOpenSidebar }) {
  const location = useLocation();
  const { alertas = [], wsTelemetriaConectado } = useTelemetry();
  const [fechaHora, setFechaHora] = useState(new Date());

  // Reloj industrial en tiempo real
  useEffect(() => {
    const timer = setInterval(() => setFechaHora(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const alertasCriticas = alertas.filter((a) => !a.atendida && (a.severidad === "CRITICO" || a.nivel === "CRITICA")).length;
  const alertasPendientes = alertas.filter((a) => !a.atendida).length;
  const currentNav = TITULOS[location.pathname] || { titulo: "Yaku Qhawaq", sub: "Monitoreo Ambiental" };

  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-4 px-4 lg:px-8 py-4 bg-white/90 backdrop-blur border-b border-slate_tech-200">
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenSidebar}
          className="lg:hidden p-2 rounded-lg hover:bg-slate_tech-100 text-slate_tech-700"
          aria-label="Abrir menú"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div>
          <h2 className="font-display font-bold text-lg text-slate_tech-900 leading-snug">
            {currentNav.titulo}
          </h2>
          <p className="text-xs text-slate_tech-500 hidden sm:block">
            {currentNav.sub}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 sm:gap-4">
        {/* Status Chip del Sistema */}
        <div className="hidden xl:flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate_tech-100/80 border border-slate_tech-200 text-xs font-medium text-slate_tech-700">
          {wsTelemetriaConectado ? (
            <>
              <CheckCircle className="w-3.5 h-3.5 text-aqua-600" />
              <span>Sistema Operativo</span>
            </>
          ) : (
            <>
              <Cpu className="w-3.5 h-3.5 text-critical animate-pulse" />
              <span className="text-critical font-semibold">Conexión Inestable</span>
            </>
          )}
        </div>

        {/* Reloj Industrial */}
        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate_tech-50 border border-slate_tech-200 font-mono text-xs text-slate_tech-700">
          <Clock className="w-3.5 h-3.5 text-river-600" />
          <span>{format(fechaHora, "dd MMM yyyy · HH:mm:ss", { locale: es })}</span>
        </div>

        {/* Botón / Icono de Notificaciones con Badge de Impacto */}
        <Link
          to="/notificaciones"
          className="relative p-2 rounded-xl border border-slate_tech-200 hover:bg-slate_tech-100 transition-colors text-slate_tech-700"
          title="Ver notificaciones"
        >
          <Bell className="w-5 h-5" />
          {alertasPendientes > 0 && (
            <span
              className={`absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 rounded-full text-white text-[10px] font-bold flex items-center justify-center shadow-md ${
                alertasCriticas > 0 ? "bg-critical animate-bounce" : "bg-warning text-slate-900"
              }`}
            >
              {alertasPendientes > 99 ? "99+" : alertasPendientes}
            </span>
          )}
        </Link>

        {/* Perfil del Operador */}
        <div className="flex items-center gap-2.5 pl-3 border-l border-slate_tech-200">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-river-700 to-river-900 text-white font-bold text-xs flex items-center justify-center shadow-sm border border-river-500/20">
            OP
          </div>
          <div className="hidden sm:block text-xs">
            <p className="font-semibold text-slate_tech-900 leading-tight">Operador SCADA</p>
            <p className="text-[11px] text-slate_tech-500">Sala Huaral</p>
          </div>
        </div>
      </div>
    </header>
  );
}
