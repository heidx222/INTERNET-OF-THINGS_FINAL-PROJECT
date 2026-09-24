import { useEffect, useRef, useState, useCallback } from "react";

/**
 * Hook genérico de conexión WebSocket con reconexión automática
 * (backoff fijo de 3s) y parseo seguro de JSON.
 *
 * Usado para conectar contra los dos canales expuestos por el
 * backend Node-RED (Capa 4, Tab 01 y Tab 02):
 *   - /ws/telemetria → lecturas fusionadas con diagnóstico de IA
 *   - /ws/alertas    → alertas clasificadas por severidad
 *
 * @param {string} path - Ruta del WebSocket (ej. "/ws/telemetria")
 * @param {(data: any) => void} onMessage - Callback ante cada mensaje válido
 */
export function useWebSocket(path, onMessage) {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);
  const onMessageRef = useRef(onMessage);

  // Mantener actualizado el callback sin forzar re-suscripciones
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  const connect = useCallback(() => {
    // 1. Obtener la URL base
    const apiBase = import.meta.env.VITE_API_BASE_URL || "https://internet-of-thingsfinal-project-production-80a2.up.railway.app";
    
    // 2. Convertir correctamente http/https a ws/wss
    let wsBaseUrl = apiBase.startsWith("https")
      ? apiBase.replace(/^https/, "wss")
      : apiBase.replace(/^http/, "ws");

    // Limpiar diagonal final si la URL la tiene para evitar '//ws/'
    if (wsBaseUrl.endsWith("/")) {
      wsBaseUrl = wsBaseUrl.slice(0, -1);
    }

    const url = `${wsBaseUrl}${path}`;

    try {
      // Limpiar sockets o timers previos antes de conectar
      if (wsRef.current) {
        wsRef.current.close();
      }

      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log(`[WS CONNECTED] Canal: ${path}`);
        setConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          onMessageRef.current?.(data);
        } catch (e) {
          // Ignorar mensajes no-JSON (heartbeats, etc.)
        }
      };

      ws.onclose = () => {
        setConnected(false);
        // Intentar reconexión limpia tras 3 segundos
        reconnectTimer.current = setTimeout(() => {
          connect();
        }, 3000);
      };

      ws.onerror = (err) => {
        console.error(`[WS ERROR] Canal ${path}:`, err);
        ws.close();
      };
    } catch (e) {
      console.error(`[WS EXCEPTION] Fallo al instanciar socket:`, e);
      reconnectTimer.current = setTimeout(() => {
        connect();
      }, 3000);
    }
  }, [path]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      if (wsRef.current) {
        wsRef.current.onclose = null; // Evitar reconexión al desmontar
        wsRef.current.close();
      }
    };
  }, [connect]);

  return { connected };
}

export default useWebSocket;
