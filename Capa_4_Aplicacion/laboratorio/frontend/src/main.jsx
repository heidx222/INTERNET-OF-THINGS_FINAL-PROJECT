import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { TelemetryProvider } from "./context/TelemetryContext.jsx";
import "./index.css";

/**
 * Punto de entrada de la SPA "Yaku Qhawaq".
 *
 * El `TelemetryProvider` envuelve toda la aplicación porque casi todas
 * las vistas (Dashboard, Notificaciones, Estadísticas, GIS) necesitan
 * acceso reactivo al mismo estado global de telemetría/alertas en vivo
 * (alimentado por los WebSockets `/ws/telemetria` y `/ws/alertas`
 * expuestos por el backend Node-RED).
 */
ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <TelemetryProvider>
        <App />
      </TelemetryProvider>
    </BrowserRouter>
  </React.StrictMode>
);
