import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import useWebSocket from "../hooks/useWebSocket.js";
import { getTelemetriaActual, getAlertas, getSaludHidrica } from "../services/api.js";

/**
 * =================================================================
 * TelemetryContext
 * -----------------------------------------------------------------
 * Estado global reactivo compartido por toda la SPA "Yaku Qhawaq":
 *
 *   - `nodos`          : { [nodo_id]: últimaLectura }  (tiempo real)
 *   - `seriesPorNodo`  : { [nodo_id]: Array<lectura> } (buffer local
 *                        acumulado en el cliente para graficar sin
 *                        depender de recargas del backend)
 *   - `alertas`        : Array<alerta> ordenado cronológicamente (más
 *                        reciente primero), fusionando el historial
 *                        inicial (`GET /api/alertas`) con el stream
 *                        en vivo (`WS /ws/alertas`).
 *   - `saludGlobal`    : Índice de Salud Hídrica promedio de la cuenca.
 *   - `wsTelemetriaConectado` / `wsAlertasConectado`: estado de enlace.
 *
 * Este patrón centraliza la lógica de "tiempo real" para que los
 * componentes de presentación (Dashboard, NotificationPanel, GIS,
 * HistoryTable) permanezcan simples y desacoplados del transporte.
 * =================================================================
 */

const TelemetryContext = createContext(null);

const MAX_SERIE_LOCAL = 300;
const MAX_ALERTAS_LOCAL = 500;

export function TelemetryProvider({ children }) {
  const [nodos, setNodos] = useState({});
  const [seriesPorNodo, setSeriesPorNodo] = useState({});
  const [alertas, setAlertas] = useState([]);
  const [saludGlobal, setSaludGlobal] = useState(null);
  const [cargandoInicial, setCargandoInicial] = useState(true);

  // --- Carga inicial (snapshot) vía REST, antes de que lleguen eventos WS ---
  useEffect(() => {
    let activo = true;
    (async () => {
      try {
        const [actual, alertasResp, salud] = await Promise.all([
          getTelemetriaActual().catch(() => []),
          getAlertas({ limit: 200 }).catch(() => ({ alertas: [] })),
          getSaludHidrica().catch(() => null),
        ]);
        if (!activo) return;

        const nodosIniciales = {};
        (Array.isArray(actual) ? actual : []).forEach((lectura) => {
          if (lectura && lectura.nodo_id) nodosIniciales[lectura.nodo_id] = lectura;
        });
        setNodos(nodosIniciales);
        setAlertas(alertasResp?.alertas || []);
        setSaludGlobal(salud);
      } finally {
        if (activo) setCargandoInicial(false);
      }
    })();
    return () => {
      activo = false;
    };
  }, []);

  // --- Ingesta en vivo: /ws/telemetria (Tab 01 del backend) ---
  const onTelemetria = useCallback((lectura) => {
    if (!lectura || !lectura.nodo_id) return;

    setNodos((prev) => ({ ...prev, [lectura.nodo_id]: lectura }));

    setSeriesPorNodo((prev) => {
      const actual = prev[lectura.nodo_id] || [];
      const nueva = [...actual, lectura].slice(-MAX_SERIE_LOCAL);
      return { ...prev, [lectura.nodo_id]: nueva };
    });
  }, []);

  // --- Ingesta en vivo: /ws/alertas (Tab 02 del backend) ---
  const onAlerta = useCallback((alerta) => {
    if (!alerta || !alerta.id) return;
    setAlertas((prev) => [alerta, ...prev].slice(0, MAX_ALERTAS_LOCAL));
  }, []);

  const { connected: wsTelemetriaConectado } = useWebSocket("/ws/telemetria", onTelemetria);
  const { connected: wsAlertasConectado } = useWebSocket("/ws/alertas", onAlerta);

  // --- Polling de respaldo para el índice de salud hídrica global (cada 15s) ---
  useEffect(() => {
    const interval = setInterval(() => {
      getSaludHidrica().then(setSaludGlobal).catch(() => {});
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  const listaNodos = useMemo(() => Object.values(nodos), [nodos]);

  const marcarAlertaAtendida = useCallback((alertaId) => {
    setAlertas((prev) =>
      prev.map((a) => (a.id === alertaId ? { ...a, atendida: true } : a))
    );
  }, []);

  const value = useMemo(
    () => ({
      nodos,
      listaNodos,
      seriesPorNodo,
      alertas,
      saludGlobal,
      cargandoInicial,
      wsTelemetriaConectado,
      wsAlertasConectado,
      marcarAlertaAtendida,
    }),
    [
      nodos,
      listaNodos,
      seriesPorNodo,
      alertas,
      saludGlobal,
      cargandoInicial,
      wsTelemetriaConectado,
      wsAlertasConectado,
      marcarAlertaAtendida,
    ]
  );

  return <TelemetryContext.Provider value={value}>{children}</TelemetryContext.Provider>;
}

export function useTelemetry() {
  const ctx = useContext(TelemetryContext);
  if (!ctx) throw new Error("useTelemetry debe usarse dentro de <TelemetryProvider>");
  return ctx;
}

export default TelemetryContext;
