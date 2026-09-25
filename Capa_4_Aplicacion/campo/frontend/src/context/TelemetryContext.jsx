import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import useWebSocket from "../hooks/useWebSocket.js";
import {
  getTelemetriaReciente,
  getAlertas,
  getSaludHidrica,
  normalizarAlerta,
} from "../services/api.js";

/**
 * =================================================================
 * TelemetryContext
 * -----------------------------------------------------------------
 * Estado global reactivo compartido por toda la SPA "Yaku Qhawaq":
 *
 *   - `nodos`          : { [nodo_id]: últimaLectura }  (tiempo real)
 *   - `seriesPorNodo`  : { [nodo_id]: Array<lectura> } (buffer local
 *                        acumulado en el cliente para graficar)
 *   - `alertas`        : Array<alerta> (más reciente primero), fusionando
 *                        el historial inicial (`GET /telemetria/historico`)
 *                        con el stream en vivo (`WS /ws/alertas`).
 *   - `saludGlobal`    : Índice de Salud Hídrica promedio de la cuenca.
 *   - `wsTelemetriaConectado` / `wsAlertasConectado`: estado de enlace.
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

  // Helper para asegurar que el objeto tenga las propiedades esperadas por los componentes
  const normalizarLectura = useCallback((lectura) => {
    if (!lectura) return null;
    const id = lectura.node_id || lectura.nodo_id || "nodo_chancay_01";
    // `ts` (epoch ms) se deriva de la marca de tiempo persistida en la Capa 3.
    const rawTs =
      lectura.created_at || lectura.timestamp_registro || lectura.timestamp_ms || lectura.ts;
    const parsed = rawTs ? new Date(rawTs).getTime() : Date.now();
    return {
      ...lectura,
      node_id: id,
      nodo_id: id,
      ts: isNaN(parsed) ? Date.now() : parsed,
    };
  }, []);

  // --- Carga inicial (snapshot) vía REST, antes de que lleguen eventos WS ---
  useEffect(() => {
    let activo = true;
    (async () => {
      try {
        const [recientes, alertasResp, salud] = await Promise.all([
          getTelemetriaReciente(120).catch(() => []),
          getAlertas({ limit: 200 }).catch(() => []),
          getSaludHidrica().catch(() => null),
        ]);
        if (!activo) return;

        // Construye el mapa de nodos con la lectura más reciente de cada uno
        // y pre-carga su serie temporal para que los gráficos arranquen llenos.
        const nodosIniciales = {};
        const seriesIniciales = {};
        (Array.isArray(recientes) ? recientes : []).forEach((item) => {
          const norm = normalizarLectura(item);
          if (!norm) return;
          // /reciente llega ordenado DESC: la primera vista de un nodo es la última lectura
          if (!nodosIniciales[norm.nodo_id]) nodosIniciales[norm.nodo_id] = norm;
          seriesIniciales[norm.nodo_id] = [...(seriesIniciales[norm.nodo_id] || []), norm];
        });
        Object.keys(seriesIniciales).forEach((k) => {
          seriesIniciales[k] = seriesIniciales[k].sort((a, b) => a.ts - b.ts).slice(-MAX_SERIE_LOCAL);
        });

        setNodos(nodosIniciales);
        setSeriesPorNodo(seriesIniciales);
        setAlertas(Array.isArray(alertasResp) ? alertasResp : []);
        setSaludGlobal(salud);
      } finally {
        if (activo) setCargandoInicial(false);
      }
    })();
    return () => {
      activo = false;
    };
  }, [normalizarLectura]);

  // --- Ingesta en vivo: /ws/telemetria (Capa 3 -> Capa 4) ---
  const onTelemetria = useCallback(
    (lectura) => {
      const norm = normalizarLectura(lectura);
      if (!norm) return;

      setNodos((prev) => ({ ...prev, [norm.nodo_id]: norm }));

      setSeriesPorNodo((prev) => {
        const actual = prev[norm.nodo_id] || [];
        const nueva = [...actual, norm].slice(-MAX_SERIE_LOCAL);
        return { ...prev, [norm.nodo_id]: nueva };
      });

      // Si el evento en vivo trae estado de alerta, lo añadimos al historial.
      if (norm.alerta === true || norm.es_anomalia === true) {
        setAlertas((prev) => [normalizarAlerta(norm), ...prev].slice(0, MAX_ALERTAS_LOCAL));
      }
    },
    [normalizarLectura]
  );

  // --- Ingesta en vivo: /ws/alertas (Capa 3 -> Capa 4) ---
  const onAlerta = useCallback((alerta) => {
    if (!alerta) return;
    const normalizada = alerta.severidad ? alerta : normalizarAlerta(alerta);
    setAlertas((prev) => [
      { ...normalizada, id: normalizada.id ?? `alt_${Date.now()}` },
      ...prev,
    ].slice(0, MAX_ALERTAS_LOCAL));
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
