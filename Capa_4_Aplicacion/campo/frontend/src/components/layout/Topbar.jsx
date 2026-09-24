import React from "react";
import { Menu, Bell } from "lucide-react";
import { useLocation } from "react-router-dom";
import { useTelemetry } from "../../context/TelemetryContext.jsx";

const TITULOS = {
  "/": "Dashboard Central",
  "/notificaciones": "Notificaciones en Tiempo Real",
  "/historico": "Estadísticas Históricas",
  "/telecontrol": "Panel de Telecontrol",
  "/mapa": "Mapa Geográfico (GIS)",
};

export default function Topbar({ onOpenSidebar }) {
  const location = useLocation();
  const { alertas } = useTelemetry();
  const alertasNoAtendidas = alertas.filter((a) => !a.atendida).length;
  const titulo = TITULOS[location.pathname] || "Yaku Qhawaq";

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
          <h2 className="font-display font-semibold text-lg text-slate_tech-900">{titulo}</h2>
          <p className="text-xs text-slate_tech-500 hidden sm:block">
            Monitoreo ambiental autónomo · Cuenca Chancay-Huaral
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative">
          <Bell className="w-5 h-5 text-slate_tech-600" />
          {alertasNoAtendidas > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-critical text-white text-[10px] font-bold flex items-center justify-center">
              {alertasNoAtendidas > 99 ? "99+" : alertasNoAtendidas}
            </span>
          )}
        </div>
        <div className="hidden sm:flex items-center gap-2 pl-3 border-l border-slate_tech-200">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-river-600 to-aqua-500 flex items-center justify-center text-white text-xs font-bold">
            OP
          </div>
          <div className="text-xs">
            <p className="font-medium text-slate_tech-800">Operador</p>
            <p className="text-slate_tech-500">Sala de Monitoreo</p>
          </div>
        </div>
      </div>
    </header>
  );
}
