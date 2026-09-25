import { useEffect, useRef, useState, useCallback } from "react";

export function useWebSocket(path, onMessage) {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);
  const pingInterval = useRef(null);
  const onMessageRef = useRef(onMessage);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  const connect = useCallback(() => {
    // 1. Obtener variable o fallback de producción
    let apiBase =
      import.meta.env.VITE_API_BASE_URL ||
      "internet-of-thingsfinal-project-production-80a2.up.railway.app";

    // 2. Extraer ÚNICAMENTE el host/dominio limpio sin protocolos
    let cleanDomain = apiBase
      .replace(/^(https?:\/\/|wss?:\/\/)/, "") // remueve http://, https://, ws://, wss://
      .replace(/\/+$/, "");                  // remueve barras al final

    cleanDomain = cleanDomain.split("/")[0]; // asegura quedarse solo con el dominio

    // 3. Formar la URL WSS limpia
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

      console.log(`[WS INTENTO CONEXION] -> ${url}`);
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log(`[WS CONECTADO OK] -> ${url}`);
        setConnected(true);

        // Activar Heartbeat cada 20s para evitar timeout del Proxy de Railway
        if (pingInterval.current) clearInterval(pingInterval.current);
        pingInterval.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "ping" }));
          }
        }, 20000);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          onMessageRef.current?.(data);
        } catch (e) {
          // Ignorar mensajes planos no JSON
        }
      };

      ws.onclose = (e) => {
        console.warn(`[WS CERRADO] Canal ${cleanPath} (Código: ${e.code}). Reintentando en 3s...`);
        setConnected(false);
        wsRef.current = null;
        if (pingInterval.current) clearInterval(pingInterval.current);

        if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
        reconnectTimer.current = setTimeout(() => {
          connect();
        }, 3000);
      };

      ws.onerror = (err) => {
        console.error(`[WS ERROR CANAL] ${cleanPath}:`, err);
        ws.close();
      };
    } catch (e) {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      reconnectTimer.current = setTimeout(() => {
        connect();
      }, 3000);
    }
  }, [path]);

  useEffect(() => {
    connect();
    return () => {
      if (pingInterval.current) clearInterval(pingInterval.current);
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, [connect]);

  return { connected };
}

export default useWebSocket;