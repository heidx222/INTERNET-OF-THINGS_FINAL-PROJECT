import React from "react";
import { Routes, Route } from "react-router-dom";
import Layout from "./components/layout/Layout.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Notificaciones from "./pages/Notificaciones.jsx";
import Historico from "./pages/Historico.jsx";
import Telecontrol from "./pages/Telecontrol.jsx";
import MapaGIS from "./pages/MapaGIS.jsx";

/**
 * Enrutador raíz de la SPA "Yaku Qhawaq".
 * Todas las rutas comparten el mismo Layout (Sidebar + Topbar).
 */
export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/notificaciones" element={<Notificaciones />} />
        <Route path="/historico" element={<Historico />} />
        <Route path="/telecontrol" element={<Telecontrol />} />
        <Route path="/mapa" element={<MapaGIS />} />
      </Routes>
    </Layout>
  );
}
