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
  onMessageRef.current = onMessage;

  const connect = useCallback(() => {
    // Obtener la URL del backend desde las variables de entorno o fallback
    const apiBase = import.meta.env.VITE_API_BASE_URL || "https://internet-of-thingsfinal-project-production-80a2.up.railway.app";
    // Reemplazar http/https por ws/wss
    const wsBaseUrl = apiBase.replace(/^http/, "ws");
    const url = `${wsBaseUrl}${path}`;

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => setConnected(true);

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
        reconnectTimer.current = setTimeout(connect, 3000);
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch (e) {
      reconnectTimer.current = setTimeout(connect, 3000);
    }
  }, [path]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { connected };
}

export default useWebSocket;
