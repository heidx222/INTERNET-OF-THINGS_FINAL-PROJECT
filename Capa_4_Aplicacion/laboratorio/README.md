# Capa 4: Aplicación — "Yaku Qhawaq" (Guardián del Agua)

Sistema IoT Autónomo para el monitoreo ambiental de la Cuenca Chancay-Huaral.
Este módulo contiene el **Backend de orquestación (Node-RED)** y el
**Frontend web responsive (React + Vite + Tailwind CSS)**, estructurados
bajo el **Modelo de 4 Capas de la ITU-T (Y.2060)** y evaluados bajo la
metodología de ciberseguridad **STRIDE**.

> **NOTA DE VERSIÓN:** Esta es la versión **Laboratorio (Gemelo Digital)**.
> El backend Node-RED actúa como capa de orquestación entre el Broker MQTT
> (Capa 2), el microservicio de IA `motor_ia_chancay` (Capa 3) y el
> Frontend, exponiendo una API REST unificada y dos canales WebSocket para
> telemetría en vivo.

---

## 1. Arquitectura de la Capa 4

```
                         ┌─────────────────────────────────────────┐
                         │        Frontend "Yaku Qhawaq"            │
                         │  (React 18 + Vite + Tailwind CSS)        │
                         │  Servido por NGINX :80 (contenedor       │
                         │  yaku_qhawaq_frontend, host :8080)       │
                         └───────────────┬───────────────────────────┘
                                         │  HTTP /api/*  ·  WS /ws/*
                                         ▼
                         ┌─────────────────────────────────────────┐
                         │     Backend Node-RED (app_nodered_chancay)│
                         │     Puerto 1880 · settings.js (CORS)     │
                         │  ┌───────────────────────────────────┐  │
                         │  │ Tab 01 · Ingesta MQTT + Diag. IA  │  │
                         │  │ Tab 02 · Motor de Alertas         │  │
                         │  │ Tab 03 · API REST /api (CORS)     │  │
                         │  │ Tab 04 · Telecontrol (Comandos)   │  │
                         │  └───────────────────────────────────┘  │
                         └───────┬───────────────────┬───────────────┘
                     MQTT (1883) │                   │ HTTP (8000)
                                 ▼                   ▼
                 ┌───────────────────────┐  ┌─────────────────────────────┐
                 │ Broker Mosquitto       │  │ motor_ia_chancay (FastAPI)  │
                 │ broker_chancay_huaral  │  │ Isolation Forest + MAPE-K   │
                 └───────────┬────────────┘  └───────────────┬─────────────┘
                             │                                │
                             └──────────────┬─────────────────┘
                                            ▼
                              ┌───────────────────────────┐
                              │ PostgreSQL (bd_credenciales_iot) │
                              │ ACLs Mosquitto + telemetria_cuenca │
                              │ + telecontrol_historial          │
                              └───────────────────────────┘
```

### 1.1 Backend Node-RED (`nodered-data/`)

El runtime de Node-RED se organiza en **4 pestañas (tabs)** dentro de
`flows.json`, generado de forma determinística por `tools/build_flows.js`
(ver sección 5):

| Tab | Nombre | Responsabilidad |
| :-- | :--- | :--- |
| 01 | Ingesta MQTT y Diagnóstico IA | Se suscribe a `chancay/cuenca/tiempo_real/#`, normaliza cada lectura, la envía a `motor_ia_chancay` (`POST /diagnostico`), calcula el Índice de Salud Hídrica local, cachea en Contexto Global y retransmite en vivo por `/ws/telemetria`. También escucha `chancay/actuadores/alerta/#` (alertas directas del lazo MAPE-K de la Capa 3). |
| 02 | Motor de Alertas | Clasifica severidad (`CRITICO` / `ADVERTENCIA`), construye el registro estándar de alerta, lo persiste en `alertas_historial` (Contexto Global) y lo retransmite por `/ws/alertas`. |
| 03 | API REST `/api` (CORS) | Expone todos los endpoints consumidos por el Frontend (telemetría, salud hídrica, alertas, nodos GIS, histórico, exportación CSV, health-check). |
| 04 | Telecontrol (Comandos Inversos) | Valida y publica comandos MQTT inversos (`chancay/actuadores/comando/<nodo_id>`) hacia los actuadores simulados (Sirena / Compuerta), registra la acción en `telecontrol_historial` (Contexto Global) y la persiste redundantemente en PostgreSQL vía `motor_ia_chancay`. |

**Persistencia del Contexto Global** (`settings.js -> contextStorage`):
`telemetria_cache`, `series_buffer`, `alertas_historial` y
`telecontrol_historial` se respaldan en disco (`/data/context`,
módulo `localfilesystem`), sobreviviendo a reinicios del contenedor.

**CORS global** (`settings.js -> httpNodeCors`): habilitado para
`GET, PUT, POST, DELETE, OPTIONS` desde cualquier origen (`*`), de forma
que el Frontend (Vite `:5173` en desarrollo, NGINX `:8080` en producción)
pueda consumir la API sin bloqueos de navegador.

### 1.2 Frontend "Yaku Qhawaq" (`frontend/`)

SPA construida con **React 18 + Vite 5 + Tailwind CSS 3**, con las
siguientes vistas (`src/pages/`):

| Ruta | Vista | Descripción |
| :--- | :--- | :--- |
| `/` | Dashboard | KPIs instantáneos, gauges de Salud Hídrica/Nivel/pH, series temporales en vivo (WebSocket), últimas 5 alertas. |
| `/notificaciones` | Notificaciones | Panel completo de alertas en tiempo real, filtrable por severidad/nodo. |
| `/historico` | Estadísticas Históricas | Consulta por rango de fechas y nodo contra PostgreSQL (`GET /telemetria/historico`), gráficos de tendencia, tabla de registros y **exportación CSV**. |
| `/telecontrol` | Telecontrol | Anulación manual del operador: activa/desactiva Sirena y Compuerta por nodo, con bitácora de auditoría. |
| `/mapa` | Mapa GIS | Mapa interactivo (Leaflet + OpenStreetMap) con los 3 nodos de la cuenca, coloreados por estado y con popups de la última lectura. |

**Librerías clave**: `leaflet` / `react-leaflet` (mapa), `recharts`
(series temporales), `lucide-react` (iconografía), `axios` (cliente
HTTP), `date-fns` (formateo de fechas), `react-router-dom` (enrutamiento
SPA).

**Comunicación con el Backend** (`src/services/api.js`,
`src/hooks/useWebSocket.js`): rutas relativas (`/api/*`, `/ws/*`); en
desarrollo Vite hace *proxy* hacia `http://localhost:1880`
(`vite.config.js`); en producción NGINX hace *proxy* hacia
`app_nodered_chancay:1880` dentro de la red interna de Docker
(`frontend/nginx.conf`). Esto mantiene el mismo origen desde la
perspectiva del navegador, eliminando fricciones de CORS.

---

## 2. Endpoints de la API

### 2.1 API pública consumida por el Frontend (Node-RED, prefijo `/api`)

| Método | Ruta | Descripción |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Health-check del backend Node-RED. |
| `GET` | `/api/telemetria/actual` | Último snapshot conocido (todos los nodos, o `?nodo_id=`). |
| `GET` | `/api/telemetria/serie` | Serie temporal en buffer de un nodo (`?nodo_id=&limit=`). |
| `GET` | `/api/telemetria/historico` | Proxy hacia `motor_ia_chancay` (PostgreSQL). Filtros: `?desde=&hasta=&nodo_id=&limit=`. |
| `GET` | `/api/alertas` | Historial de alertas. Filtros: `?severidad=&nodo_id=&limit=`. |
| `GET` | `/api/nodos` | Metadatos GIS (coordenadas) fusionados con la última lectura de cada nodo. |
| `GET` | `/api/salud` | Índice de Salud Hídrica promedio de la cuenca. |
| `GET` | `/api/export/csv` | Exportación de auditoría (`?tipo=alertas\|lecturas&nodo_id=`), descarga directa `Content-Disposition: attachment`. |
| `POST` | `/api/telecontrol/comando` | Valida y publica un comando MQTT inverso. Body: `{ nodo_id, actuador, accion, operador }`. |
| `GET` | `/api/telecontrol/historial` | Bitácora de auditoría de Telecontrol (memoria, respaldada en disco). |
| `WS` | `/ws/telemetria` | Stream en vivo de lecturas fusionadas con diagnóstico de IA. |
| `WS` | `/ws/alertas` | Stream en vivo de alertas clasificadas. |

### 2.2 Microservicio de IA (`motor_ia_chancay`, Capa 3, puerto `8000`)

| Método | Ruta | Descripción |
| :--- | :--- | :--- |
| `POST` | `/diagnostico` | Diagnóstico síncrono de Isolation Forest sobre una lectura (`SensorData`). Consumido por Node-RED Tab 01. |
| `GET` | `/telemetria/reciente` | Últimos N registros persistidos en `telemetria_cuenca`. |
| `GET` | `/telemetria/historico` | Histórico filtrable por fecha/nodo (`?desde=&hasta=&nodo_id=&limit=`), persistido en PostgreSQL. Consumido por Node-RED Tab 03 (`/api/telemetria/historico`). |
| `POST` | `/telecontrol/historial` | Persistencia redundante de auditoría de Telecontrol en PostgreSQL (tabla `telecontrol_historial`). Invocado por Node-RED Tab 04 tras cada comando validado. |
| `GET` | `/telecontrol/historial` | Bitácora de auditoría de largo plazo, reconstruible íntegramente desde PostgreSQL incluso tras reinicio total de Node-RED. |

---

## 3. Tópicos MQTT de Telecontrol

| Tópico | Dirección | Descripción |
| :--- | :--- | :--- |
| `chancay/actuadores/comando/<nodo_id>` | Node-RED → Actuadores simulados | Comando inverso publicado tras la validación del Panel de Telecontrol. Payload JSON: `{ id, ts, nodo_id, actuador, accion, operador, origen }`. |
| `chancay/actuadores/alerta/<nodo_id>` | `motor_ia_chancay` → Node-RED | Alerta autónoma del lazo MAPE-K (Capa 3) ante una anomalía detectada por Isolation Forest. |

El usuario MQTT `dashboard_nodered` (ver `Capa_2_Red/laboratorio/postgres/init.sql`)
posee permiso de **escritura** (`rw = 2`) sobre `chancay/actuadores/comando/#`,
exclusivo para esta capa, cumpliendo el principio de mínimo privilegio
(mitigación STRIDE — *Elevation of Privilege*).

---

## 4. Contenido de esta Carpeta

```
Capa_4_Aplicacion/laboratorio/
├── Dockerfile.nodered          # Imagen del backend Node-RED
├── nodered-data/
│   ├── flows.json              # Flujo compilado (generado, NO editar a mano)
│   ├── flows_cred.json         # Credenciales MQTT cifradas (AES-256-CTR)
│   ├── settings.js             # Runtime: CORS, contextStorage, credentialSecret
│   └── tools/build_flows.js    # Generador determinístico de flows.json
└── frontend/
    ├── Dockerfile               # Build multi-stage (Node 20 -> NGINX Alpine)
    ├── nginx.conf                # Proxy /api y /ws hacia app_nodered_chancay
    ├── .dockerignore
    ├── src/                      # Código fuente React (pages, components, hooks, services)
    ├── vite.config.js            # Proxy de desarrollo /api, /ws -> :1880
    └── package.json
```

---

## 5. Instrucciones de Despliegue

### 5.1 Despliegue completo con un solo comando (recomendado)

Todo el stack (PostgreSQL, Mosquitto, `motor_ia_chancay`, Node-RED y el
Frontend) se orquesta desde el `docker-compose.yml` de la **Capa 2**:

```bash
cd Capa_2_Red/laboratorio
docker-compose up -d --build
```

Esto levanta 5 contenedores en la red interna `iot_network`:

| Contenedor | Servicio | Puerto (host) |
| :--- | :--- | :--- |
| `bd_credenciales_iot` | PostgreSQL 13 | `5432` |
| `broker_chancay_huaral` | Mosquitto (Go Auth) | `1883` |
| `motor_ia_chancay` | FastAPI + Isolation Forest | `8000` |
| `app_nodered_chancay` | Node-RED (backend/API) | `1880` |
| `yaku_qhawaq_frontend` | Frontend NGINX (SPA) | `8080` |

Verificar que todos los contenedores estén activos:

```bash
docker ps
```

Acceder al Dashboard "Yaku Qhawaq":

```
http://localhost:8080
```

Editor visual de Node-RED (depuración de flujos):

```
http://localhost:1880/admin
```

Documentación interactiva de `motor_ia_chancay` (Swagger UI):

```
http://localhost:8000/docs
```

### 5.2 Regenerar `flows.json` tras modificar `build_flows.js`

```bash
cd Capa_4_Aplicacion/laboratorio/nodered-data
node tools/build_flows.js
```

Esto regenera `flows.json` (nodos completos) y `flows_cred.json`
(credenciales MQTT re-cifradas con AES-256-CTR usando el
`credentialSecret` de `settings.js`).

### 5.3 Desarrollo local del Frontend (fuera de Docker)

```bash
cd Capa_4_Aplicacion/laboratorio/frontend
npm install
npm run dev       # http://localhost:5173 (proxy /api, /ws -> :1880)
```

Requiere que `broker_chancay_huaral`, `motor_ia_chancay` y
`app_nodered_chancay` ya estén corriendo (vía `docker-compose up -d`
desde la Capa 2) para que el proxy de Vite tenga un backend real al
que reenviar las peticiones.

Build de producción local (sin Docker):

```bash
npm run build      # genera frontend/dist/
npm run preview    # sirve dist/ en http://localhost:4173
```

---

## 6. Matriz de Mitigación de Amenazas (Enfoque STRIDE) — Capa 4

* **Spoofing:** El backend Node-RED se autentica ante Mosquitto con
  credenciales dedicadas (`dashboard_nodered`, ACL de solo lectura salvo
  el tópico de comandos), evitando suplantación de otros componentes.
* **Tampering:** El endpoint `POST /api/telecontrol/comando` valida
  estrictamente `nodo_id`, `actuador` y `accion` contra listas blancas
  antes de publicar cualquier comando MQTT, rechazando payloads
  malformados con `HTTP 400`.
* **Repudiation:** Cada comando de Telecontrol queda auditado con doble
  redundancia: Contexto Global de Node-RED (`telecontrol_historial`,
  respaldado en disco) **y** tabla relacional en PostgreSQL
  (`telecontrol_historial`, vía `motor_ia_chancay`), garantizando
  trazabilidad incluso ante fallos de un solo componente.
* **Information Disclosure:** Todo el tráfico inter-capas circula dentro
  de la red privada `iot_network` de Docker; solo los puertos
  estrictamente necesarios (`8080` Frontend, `1880` Node-RED admin,
  `8000` Swagger IA) se exponen al host para depuración del laboratorio.
* **Denial of Service:** `apiMaxLength: "5mb"` en `settings.js` limita
  el tamaño de payload HTTP entrante; el `switch` de validación en el
  Tab 04 descarta tempranamente comandos inválidos antes de tocar el
  broker MQTT o la base de datos.
