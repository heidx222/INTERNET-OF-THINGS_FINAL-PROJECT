/**
 * =================================================================
 * PROYECTO   : Sistema IoT Autónomo - Cuenca Chancay-Huaral
 * MÓDULO     : Capa 4 - Aplicación (Backend Node-RED)
 * ARCHIVO    : nodered-data/settings.js
 *
 * Configuración del runtime de Node-RED. Puntos clave para este
 * proyecto:
 *
 *   1. httpNodeCors  → habilita CORS COMPLETO para todos los nodos
 *      `http in` desplegados bajo el prefijo `/api` (Tab 03), de
 *      forma que el Frontend "Yaku Qhawaq" (servido en otro origen/
 *      puerto, ej. Vite :5173 en desarrollo o NGINX :8080 en
 *      producción) pueda consumir la API sin bloqueos de navegador.
 *
 *   2. contextStorage → persiste el Contexto Global (telemetría en
 *      caché, buffers de series, historial de alertas e historial
 *      de telecontrol) en disco (`/data/context`), sobreviviendo a
 *      reinicios del contenedor `app_nodered_chancay`.
 *
 *   3. credentialSecret → clave simétrica usada para descifrar
 *      `flows_cred.json` (credenciales del broker MQTT). Debe
 *      coincidir exactamente con la constante `CREDENTIAL_SECRET`
 *      usada en `tools/build_flows.js`.
 *
 *   4. uiPort/uiHost → Node-RED escucha en 0.0.0.0:1880 dentro del
 *      contenedor; el mapeo hacia el host se define en
 *      docker-compose.yml (`"1880:1880"`).
 * =================================================================
 */

module.exports = {
    // ---------------------------------------------------------------
    // Red / Puerto
    // ---------------------------------------------------------------
    uiPort: process.env.PORT || 1880,
    uiHost: "0.0.0.0",

    // ---------------------------------------------------------------
    // Persistencia de flujos y credenciales
    // ---------------------------------------------------------------
    flowFile: "flows.json",
    credentialSecret: process.env.NODE_RED_CREDENTIAL_SECRET || "ChancayHuaralYakuQhawaq2026",
    flowFilePretty: true,

    // ---------------------------------------------------------------
    // CORS GLOBAL para todos los endpoints /api/* (Requerimiento explícito)
    // Aplica a TODOS los nodos "http in" desplegados en el runtime.
    // ---------------------------------------------------------------
    httpNodeCors: {
        origin: "*",
        methods: "GET,PUT,POST,DELETE,OPTIONS",
        allowedHeaders: "Content-Type, Authorization, X-Requested-With",
        credentials: false,
        maxAge: "86400",
    },

    // Prefijo base para los nodos "http in" (ya usamos /api/... explícito en cada nodo,
    // por lo que dejamos httpNodeRoot en la raíz para no duplicar el prefijo).
    httpNodeRoot: "/",

    // Deshabilita la exposición del editor visual de administración en producción.
    // En el laboratorio se mantiene accesible para depuración (http://localhost:1880).
    httpAdminRoot: "/admin",
    disableEditor: process.env.NODE_RED_DISABLE_EDITOR === "true",

    // ---------------------------------------------------------------
    // Contexto Global Persistente (Knowledge - Fase K del lazo MAPE-K)
    // ---------------------------------------------------------------
    contextStorage: {
        default: {
            module: "localfilesystem",
        },
    },

    // ---------------------------------------------------------------
    // Editor / UX
    // ---------------------------------------------------------------
    editorTheme: {
        projects: {
            enabled: false,
        },
        header: {
            title: "Yaku Qhawaq · Backend Node-RED (Cuenca Chancay-Huaral)",
        },
        palette: {
            editable: true,
        },
    },

    // ---------------------------------------------------------------
    // Logging
    // ---------------------------------------------------------------
    logging: {
        console: {
            level: "info",
            metrics: false,
            audit: false,
        },
    },

    // Límite razonable de tamaño de payload HTTP entrante (telecontrol / diagnósticos)
    apiMaxLength: "5mb",

    // Zona horaria operativa del proyecto
    functionGlobalContext: {
        // Utilidades disponibles en todos los nodos "function" vía global.get(...)
        env: process.env,
    },

    // No exponer información sensible de la versión del runtime
    exportGlobalContextKeys: false,
};