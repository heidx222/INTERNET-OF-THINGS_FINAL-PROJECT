import { useEffect, useRef, useState, useCallback } from "react";

export function useWebSocket(path, onMessage) {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);
  const onMessageRef = useRef(onMessage);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  const connect = useCallback(() => {
    let apiBase =
      import.meta.env.VITE_API_BASE_URL ||
      "https://internet-of-thingsfinal-project-production-80a2.up.railway.app";

    // 1. Limpiar completamente el protocolo y dejar solo el dominio
    let cleanDomain = apiBase
      .replace(/^https?:\/\//, "")
      .replace(/\/+$/, "");

    // 2. Construir la URL WSS limpia
    const cleanPath = path.startsWith("/") ? path : `/${path}`;
    const url = `wss://${cleanDomain}${cleanPath}`;

    try {
      if (
        wsRef.current &&
        (wsRef.current.readyState === WebSocket.OPEN ||
          wsRef.current.readyState === WebSocket.CONNECTING)
      ) {
        return;
      }

      console.log(`[WS CONECTANDO] -> ${url}`);
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log(`[WS CONECTADO EXITOSAMENTE] -> ${url}`);
        setConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          onMessageRef.current?.(data);
        } catch (e) {
          // Ignorar mensajes no JSON
        }
      };

      ws.onclose = (e) => {
        setConnected(false);
        wsRef.current = null;
        reconnectTimer.current = setTimeout(() => {
          connect();
        }, 3000);
      };

      ws.onerror = (err) => {
        console.error(`[WS ERROR EN CANAL] ${cleanPath}:`, err);
        ws.close();
      };
    } catch (e) {
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
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, [connect]);

  return { connected };
}

export default useWebSocket;