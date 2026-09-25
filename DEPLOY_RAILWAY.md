# 🚀 Guía de Despliegue en Railway — Carpetas **campo** (Yaku Qhawaq)

Sistema IoT Autónomo · Cuenca Chancay-Huaral · Arquitectura de 4 capas (ITU-T Y.2060)

> **Ámbito:** este documento cubre **únicamente** las carpetas `campo/` de las 4 capas.
> La carpeta `laboratorio/` es una versión desfasada y **no se despliega**.

---

## 0. Resumen: qué se despliega

El sistema son **6 servicios Railway** independientes (4 capas, con la Capa 2 partida en
broker + simulador y el frontend autónomo):

| # | Servicio Railway | Capa | Root Directory | Dockerfile | Puerto |
|:-:|:---|:---:|:---|:---|:---|
| 1 | `railway-postgres` (plugin) | Soporte DB | — | (plugin nativo) | 5432 (privado) |
| 2 | `broker-mqtt` | **Capa 2** | `Capa_2_Red/campo/mosquitto-railway` | `Dockerfile` | **1883** (+ TCP Proxy) |
| 3 | `simulador-historico` | **Capa 2** | `Capa_2_Red/campo` | `Dockerfile.simulator` | — (worker) |
| 4 | `backend-central` | **Capa 3** | `Capa_3_Soporte_A_Servicios/campo` | `Dockerfile` | `$PORT` (HTTP) |
| 5 | `frontend-yaku` | **Capa 4** | `Capa_4_Aplicacion/campo/frontend` | `Dockerfile` | `$PORT` (HTTP) |
| 6 | ESP32 físico | **Capa 1** | — | (Arduino IDE, no Railway) | — |

**Flujo de datos (bidireccional, Capa 1 ⇄ Capa 4):**

```
ESP32 ──publish──▶ chancay/cuenca/tiempo_real/# ──▶ broker ──▶ Backend (Capa 3) ──▶ PostgreSQL
Simulador ─publish─▶ chancay/cuenca/historico  ──▶ broker ──▶ Backend (Capa 3)
                                                                │
                                        Frontend (Capa 4) ◀─────┘ REST + WebSocket
                                        Frontend ──POST /telecontrol/comando──▶ Backend
                                                                │
                          chancay/actuadores/comando/<nodo> ◀───┘ ──▶ ESP32 (actúa)
                          chancay/actuadores/alerta/<nodo>  ◀────┘ ──▶ ESP32 (sirena MAPE-K)
```

---

## 1. Orden de despliegue (respétalo)

1. **PostgreSQL** (plugin) → obtén credenciales.
2. **Broker MQTT** (`broker-mqtt`) → editando `mosquitto.conf` con las credenciales del paso 1.
3. **Backend** (`backend-central`).
4. **Simulador** (`simulador-historico`).
5. **Frontend** (`frontend-yaku`).
6. **ESP32** (flasheo con Arduino IDE, al final).

> 💡 **Red privada:** si todos los servicios viven en el **mismo proyecto** Railway, el
> backend y el simulador pueden hablar con el broker por su hostname **privado**
> (`<servicio>.railway.internal`, puerto interno `1883`) en lugar del TCP Proxy público.
> El **ESP32** (internet) SÍ necesita el **TCP Proxy público**.

---

## 2. Paso 1 — PostgreSQL

1. En tu proyecto Railway: **New → Database → Add PostgreSQL**.
2. Railway crea las variables `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`,
   y también `DATABASE_URL`.
3. **Aprovisiona el esquema.** Abre la consola del plugin Postgres (**Data → Query**) y
   pega el contenido de:
   `Capa_2_Red/campo/postgres/init.sql`
   Esto crea las tablas `test_user`, `test_acl` (identidad MQTT) y
   `telemetria_cuenca`, `telecontrol_historial` (datos de la cuenca).

> ℹ️ El backend (Capa 3) **también autoprovisiona** el esquema al arrancar
> (`app/db_schema.py`, idempotente). Aun así, **es obligatorio** cargar `init.sql`
> porque el broker MQTT necesita `test_user`/`test_acl` con los hashes bcrypt
> para autenticar a los clientes.

---

## 3. Paso 2 — Broker MQTT (`broker-mqtt`)

**Settings:**
- **Root Directory:** `Capa_2_Red/campo/mosquitto-railway`
- **Dockerfile Path:** `Dockerfile` (ya declarado en `railway.toml`)
- **Networking → TCP Proxy:** añade un proxy al puerto **`1883`**.
  Railway te dará algo como `xxxxx.proxy.rlwy.net : <puerto>`.
  **Anota ese host y puerto** (los usarán el ESP32, el simulador y el backend).

**Antes de desplegar:** edita
`Capa_2_Red/campo/mosquitto-railway/mosquitto.conf`
y reemplaza los 5 marcadores `[EDITA: ...]` con los datos del servicio Postgres
(ver la **§7 Lista de archivos a editar**).

> ⚠️ Mosquitto **no** expande variables de entorno: los valores deben quedar
> **escritos literalmente** en `mosquitto.conf`.

---

## 4. Paso 3 — Backend (`backend-central`)

**Settings:**
- **Root Directory:** `Capa_3_Soporte_A_Servicios/campo`
- **Dockerfile Path:** `Dockerfile` (ya declarado en `railway.toml`)
- Railway inyecta `$PORT` automáticamente; el `CMD` ya lo usa.

**Variables a definir** (copia de `Capa_3_Soporte_A_Servicios/campo/.env.example`):
- **Base de datos** (opción recomendada): referencia la del plugin:
  `DATABASE_URL = ${{Postgres.DATABASE_URL}}`
  Si el backend y el plugin están en el mismo proyecto, esta referencia se rellena sola.
- **Broker MQTT:** `MQTT_HOST`, `MQTT_PORT`, `MQTT_USER`, `MQTT_PASSWORD`, `MQTT_TOPIC`.

Tras desplegar, anota su **URL pública** (`Networking → Public Networking → Generate Domain`),
p. ej. `https://backend-central-production-xxxx.up.railway.app`.

---

## 5. Paso 4 — Simulador (`simulador-historico`)

**Settings:**
- **Root Directory:** `Capa_2_Red/campo`
- **Dockerfile Path:** `Dockerfile.simulator` (ya declarado en `railway.toml`)

**Variables a definir** (copia de `Capa_2_Red/campo/.env.simulator.example`):
`MQTT_HOST`, `MQTT_PORT`, `MQTT_USER=simulador_python`, `MQTT_PASS=simulador123`,
`MQTT_TOPIC=chancay/cuenca/historico`, `CSV_FILE=dataset_sintetico_chancay.csv`.

> Es un **worker**: no expone puerto y no requiere dominio público.

---

## 6. Paso 5 — Frontend (`frontend-yaku`)

**Settings:**
- **Root Directory:** `Capa_4_Aplicacion/campo/frontend`
- **Dockerfile Path:** `Dockerfile` (ya declarado en `railway.toml`)
- **⚠️ Variable de BUILD (crítica):** `VITE_API_BASE_URL` **debe** existir **antes**
  de construir. Vite "hornea" las variables `VITE_*` en tiempo de compilación; si la
  añades después, el frontend apuntará a la URL por defecto.
  - Valor: la **URL pública del backend** (Paso 3), p. ej.
    `https://backend-central-production-xxxx.up.railway.app`
- Tras añadir/editar `VITE_API_BASE_URL`, haz **Redeploy** (rebuild) para reincrustarla.

> El frontend consume el backend **directamente** por su URL pública (REST + WS).
> No hay reverse-proxy: CORS ya está abierto (`allow_origins=["*"]`) en el backend.

---

## 7. 📋 LISTA DEFINITIVA de archivos que TÚ debes editar

> Estos son **todos** los puntos donde debes colocar tus **URLs públicas, host/puerto,
> usuarios y contraseñas**. Ningún otro archivo requiere cambios manuales.
> Las credenciales en los `.env.example` son **valores por defecto del repo**
> (coinciden con los hashes de `postgres/init.sql`); cámbialas si quieres otras.

### 🧩 Capa 1 — Dispositivos (ESP32)

| Archivo | Qué editar | Valor de ejemplo |
|:---|:---|:---|
| `Capa_1_Dispositivos/campo/codigo_ChancayHuaral_ESP32.ino` | `WIFI_SSID` | *tu red WiFi* |
| | `WIFI_PASS` | *tu contraseña WiFi* |
| | `MQTT_SERVER` | `xxxxx.proxy.rlwy.net` (TCP Proxy del broker) |
| | `MQTT_PORT` | *puerto del TCP Proxy* |
| | `MQTT_USER` / `MQTT_PASS` | `nodo_chancay_01` / `nodoChancay01` |

### 🧩 Capa 2 — Red

| Archivo | Qué editar | Valor de ejemplo |
|:---|:---|:---|
| `Capa_2_Red/campo/mosquitto-railway/mosquitto.conf` | `auth_opt_pg_host` | `containers-us-west-xx.railway.app` o `<pg>.railway.internal` |
| | `auth_opt_pg_port` | `5432` |
| | `auth_opt_pg_dbname` | `railway` |
| | `auth_opt_pg_user` | `postgres` |
| | `auth_opt_pg_password` | *tu PGPASSWORD de Railway* |

**Plantillas de variables (no se despliegan, son referencia para la pestaña *Variables*):**

| Archivo | Variables a copiar en Railway | Cuándo |
|:---|:---|:---|
| `Capa_2_Red/campo/.env.simulator.example` | `MQTT_HOST`, `MQTT_PORT`, `MQTT_USER`, `MQTT_PASS` | Servicio `simulador-historico` |
| `Capa_2_Red/campo/.env.example` | `MQTT_*`, `DB_*` | Referencia local/simulador |

### 🧩 Capa 3 — Soporte a Servicios (backend)

| Archivo | Qué editar | Valor de ejemplo |
|:---|:---|:---|
| `Capa_3_Soporte_A_Servicios/campo/.env.example` | `DATABASE_URL` **o** `DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASS` | `${{Postgres.DATABASE_URL}}` |
| | `MQTT_HOST` / `MQTT_PORT` | host/puerto del broker |
| | `MQTT_USER` / `MQTT_PASSWORD` | `backend_central` / `backendChancay2026` |
| | `MQTT_TOPIC` | `chancay/cuenca/#` |

> En Railway **no** subes este `.env`: copias sus claves a **Variables** del servicio.

### 🧩 Capa 4 — Aplicación (frontend)

| Archivo | Qué editar | Valor de ejemplo |
|:---|:---|:---|
| `Capa_4_Aplicacion/campo/frontend/.env.example` | `VITE_API_BASE_URL` | `https://backend-central-production-xxxx.up.railway.app` |

> En Railway **no** subes este `.env`: define `VITE_API_BASE_URL` en **Variables** del
> servicio **antes** del build.

### 🔑 Dónde viven los usuarios/contraseñas de MQTT

Las cuentas MQTT (con hashes **bcrypt**) y sus ACL están en:
`Capa_2_Red/campo/postgres/init.sql`

| Usuario | Contraseña por defecto | Rol |
|:---|:---|:---|
| `nodo_chancay_01` | `nodoChancay01` | ESP32 (Capa 1) |
| `simulador_python` | `simulador123` | Simulador (Capa 2) |
| `backend_central` | `backendChancay2026` | Backend (Capa 3) |
| `dashboard_nodered` | `dashboardChancay2026` | Dashboard (opcional) |

> Si cambias una contraseña, debes: (1) actualizarla en el cliente correspondiente
> (firmware / variables del servicio) **y** (2) regenerar el **hash bcrypt** y
> actualizarlo en `init.sql`. El proyecto incluye `hash_bcrypt.py` para generarlo.
> El backend (Capa 3) **no** cambia el hash: usa `MQTT_USER`/`MQTT_PASSWORD` en texto
> plano, y el **broker** es quien valida contra el hash.

---

## 8. Verificación post-despliegue

| Comprobación | Cómo |
|:---|:---|
| Backend vivo | `curl https://<backend>/` → `{"capa":"3 - Soporte a Servicios",...}` |
| Esquema creado | Logs del backend: `[DB] Esquema de la cuenca verificado/creado correctamente.` |
| Broker acepta conexión | Logs del simulador: `[TRANSMITIENDO #N] Tópico: chancay/cuenca/historico ...` |
| Telemetría fluye | `curl https://<backend>/telemetria/reciente?limit=5` → filas JSON |
| Frontend conectado | Abrir la URL del frontend → dashboard con datos en vivo |
| Lazo inverso Capa 4→1 | En el panel de Telecontrol pulsar **ACTIVAR** → el ESP32 actúa; `GET /telecontrol/historial` registra el comando |

---

## 9. Notas de arquitectura (por qué funciona)

- **Paridad de reglas** entre Capa 1 (firmware), Capa 2 (generador de dataset) y
  Capa 3 (motor MAPE-K): las mismas reglas producen las mismas alertas → **0 discrepancias**.
- **Lazo MAPE-K** (Monitor→Analyze→Plan→Execute→Knowledge) repartido en las 4 capas:
  Capa 1 sensa/actúa · Capa 2 transporta · Capa 3 analiza (Isolation Forest + reglas)
  y planifica · Capa 4 presenta y permite el control manual (Telecontrol).
- **STRIDE:** autenticación MQTT por PostgreSQL+bcrypt, QoS 1, límites de conexión/mensaje.
- **Aislamiento de fallos:** si la BD cae, el backend sigue publicando/recibiendo MQTT
  (solo pierde persistencia) — no bloquea la telemetría en vivo.
