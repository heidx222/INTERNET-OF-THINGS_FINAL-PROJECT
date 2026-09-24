import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Yaku Qhawaq · Frontend Capa 4 (Producción Campo)
 * Configuración ligera de Vite optimizada para despliegue directo en Railway sin Docker.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    chunkSizeWarningLimit: 1000,
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