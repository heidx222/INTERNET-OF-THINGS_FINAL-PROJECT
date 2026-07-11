import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * =================================================================
 * Yaku Qhawaq · Frontend - Configuración de Vite
 *
 * El proxy de desarrollo (`/api`, `/ws`) evita problemas de CORS
 * durante `npm run dev`, redirigiendo las peticiones hacia el
 * backend Node-RED expuesto en el host en el puerto 1880
 * (ver docker-compose.yml -> node_red_app -> "1880:1880").
 *
 * En producción (build estático servido por NGINX, ver
 * `frontend/Dockerfile` y `frontend/nginx.conf`), este proxy no
 * se usa: NGINX asume ese mismo rol reenviando `/api` y `/ws`
 * hacia `app_nodered_chancay:1880` dentro de la red Docker interna.
 * =================================================================
 */
export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:1880",
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://localhost:1880",
        ws: true,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor_react: ["react", "react-dom", "react-router-dom"],
          vendor_charts: ["recharts"],
          vendor_maps: ["leaflet", "react-leaflet"],
        },
      },
    },
  },
});