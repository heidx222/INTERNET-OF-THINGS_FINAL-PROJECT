import React, { useState } from "react";
import Sidebar from "./Sidebar.jsx";
import Topbar from "./Topbar.jsx";

/**
 * Shell general de la aplicación: Sidebar fijo (colapsable en móvil) +
 * Topbar + área de contenido con scroll independiente. Todas las
 * páginas (Dashboard, NotificationPanel, HistoryTable, Telecontrol,
 * GIS) se renderizan dentro de este contenedor vía <Outlet />.
 */
export default function Layout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-slate_tech-100">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar onOpenSidebar={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
