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
    // BUGFIX (Capa 4): `path` puede llegar ya como una URL ws(s):// ABSOLUTA
    // (TelemetryContext.jsx invoca useWebSocket(`${WS_BASE_URL}/ws/telemetria`, ...)).
    // Reconstruir SIEMPRE una base y concatenarla con `path` genera URLs
    // duplicadas del tipo:
    //   wss://<backend>/wss://<backend>/ws/telemetria
    // que el servidor (uvicorn/FastAPI) rechaza en el handshake con
    // HTTP 403 "Unexpected response code: 403" (verificado en vivo). Esto
    // deja wsTelemetriaConectado / wsAlertasConectado en `false` para
    // siempre y el Sidebar muestra C1/C2/C3 como OFFLINE aunque el
    // backend, el broker MQTT y la BD estén operativos.
    //
    // Regla: si `path` YA es una URL ws:// o wss:// absoluta, se usa TAL
    // CUAL. Solo si es una ruta relativa (ej. "/ws/telemetria") se
    // construye la URL a partir de VITE_API_BASE_URL.
    let url;

    if (/^wss?:\/\//i.test(path)) {
      url = path;
    } else {
      let apiBase =
        import.meta.env.VITE_API_BASE_URL ||
        "https://internet-of-thingsfinal-project-production-80a2.up.railway.app";

      // 1. Limpiar completamente el protocolo y dejar solo el dominio
      let cleanDomain = apiBase
        .replace(/^https?:\/\//, "")
        .replace(/\/+$/, "");

      // 2. Construir la URL WSS limpia
      const cleanPath = path.startsWith("/") ? path : `/${path}`;
      url = `wss://${cleanDomain}${cleanPath}`;
    }

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
        // BUGFIX: usar `url` (siempre definida) en vez de una variable que
        // solo existía dentro de un scope condicional.
        console.error(`[WS ERROR EN CANAL] ${url}:`, err);
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
