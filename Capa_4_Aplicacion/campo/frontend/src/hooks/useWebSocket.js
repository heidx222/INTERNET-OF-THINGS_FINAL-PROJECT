import { useEffect, useRef, useState, useCallback } from "react";

/**
 * Hook genérico de conexión WebSocket con reconexión automática
 * para el microservicio FastAPI (Capa 3).
 */
export function useWebSocket(path, onMessage) {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);
  const onMessageRef = useRef(onMessage);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  const connect = useCallback(() => {
    // 1. Obtener la URL base desde las variables de entorno de Vite o fallback
    let apiBase = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_BACKEND_URL;
    
    // Si no hay variable definida, usamos la URL pública directa de FastAPI en Railway
    if (!apiBase) {
      apiBase = "https://internet-of-thingsfinal-project-production-80a2.up.railway.app";
    }

    // 2. Convertir http/https a ws/wss
    let wsBaseUrl = apiBase
      .replace(/^https:\/\//, "wss://")
      .replace(/^http:\/\//, "ws://");

    // Limpiar diagonales al final para evitar URLs como wss://domain.com//ws/telemetria
    if (wsBaseUrl.endsWith("/")) {
      wsBaseUrl = wsBaseUrl.slice(0, -1);
    }

    // Si la ruta no empieza con /, agregársela
    const cleanPath = path.startsWith("/") ? path : `/${path}`;
    const url = `${wsBaseUrl}${cleanPath}`;

    try {
      if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
        return; // Ya hay una conexión activa o conectando
      }

      console.log(`[WS INTENTANDO CONEXIÓN] -> ${url}`);
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log(`[WS CONECTADO] -> ${url}`);
        setConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          onMessageRef.current?.(data);
        } catch (e) {
          // Ignorar mensajes no-JSON
        }
      };

      ws.onclose = () => {
        setConnected(false);
        wsRef.current = null;
        reconnectTimer.current = setTimeout(() => {
          connect();
        }, 4000);
      };

      ws.onerror = (err) => {
        console.error(`[WS ERROR] En canal ${cleanPath}:`, err);
        if (wsRef.current) {
          wsRef.current.close();
        }
      };
    } catch (e) {
      console.error(`[WS EXCEPTION] Fallo al instanciar socket:`, e);
      reconnectTimer.current = setTimeout(() => {
        connect();
      }, 4000);
    }
  }, [path]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, [connect]);

  return { connected };
}

export default useWebSocket;