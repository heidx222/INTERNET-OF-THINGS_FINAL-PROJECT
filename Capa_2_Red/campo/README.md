# Capa 2 · Red — Sistema IoT Autónomo Cuenca Chancay-Huaral (Yaku Qhawaq)

Módulo de conectividad, enrutamiento y seguridad del transporte de payloads de
calidad del agua, bajo el **Modelo de 4 Capas de la ITU-T (Y.2060)** y evaluado
con la metodología **STRIDE**.

> **Nota de versión:** esta es la variante **Campo**, diseñada para operar con
> nodos reales (ESP32, Capa 1) y con el simulador histórico. La carpeta
> `laboratorio/` es una versión desfasada y **no debe usarse como referencia**.

## 1. Diseño de la infraestructura de red

* **Topología:** estrella (hub-and-spoke) con el broker como punto central.
* **Core:** Eclipse Mosquitto + plugin *Mosquitto Go Auth* sobre PostgreSQL.
* **Transporte:** MQTT v3.1.1 sobre TCP/IP (puerto `1883`).
* **Clientes de red:**
  1. **Nodo físico / firmware ESP32** (Capa 1) — telemetría en tiempo real.
  2. **Simulador histórico Python** (`script_simulator_mqtt.py`) — inyecta el
     dataset sintético (`generar_dataset_sintetico_PRO.py`).
  3. **Sistema central FastAPI** (Capa 3) — suscriptor `chancay/cuenca/#`.

## 2. Matriz de tópicos MQTT (ACL)

| Tópico MQTT | Permiso | Entidad | Descripción |
| :--- | :--- | :--- | :--- |
| `chancay/cuenca/tiempo_real/nodo_chancay_01` | Write | ESP32 (Capa 1) | Telemetría JSON en vivo (5 s a 30 s adaptativo). |
| `chancay/cuenca/historico` | Write | Simulador Python (Capa 2) | Ráfaga del dataset sintético para analítica. |
| `chancay/cuenca/#` | Read | Backend FastAPI (Capa 3) | Lectura global de toda la telemetría de la cuenca. |
| `chancay/actuadores/alerta/nodo_chancay_01` | Read | ESP32 (Capa 1) | Comando del lazo MAPE-K para activar sirena/buzzer. |
| `chancay/actuadores/alerta/#` | Write | Backend FastAPI (Capa 3) | Publicación de la orden de actuación. |
| `chancay/actuadores/comando/#` | Read | ESP32 (Capa 1) | Comandos inversos de Telecontrol (Capa 4). |
| `chancay/actuadores/comando/#` | Write | Backend FastAPI (Capa 3) | Publicación del comando manual del operador. |

> **Coherencia entre capas:** los tópicos de escritura del nodo y de lectura de
> comandos (`alerta/<nodo>`) forman el par que cierra el lazo bidireccional
> Capa 1 ⇄ Capa 4. El firmware ESP32 se **suscribe a ambos** canales de actuador.

## 3. Matriz de mitigación de amenazas (STRIDE)

* **Spoofing:** `allow_anonymous false` + credenciales en PostgreSQL vía *Go
  Auth*, contraseñas protegidas con **Bcrypt** (`$2b$12$…`).
* **Tampering:** persistencia en disco y **QoS 1** (at-least-once con PUBACK).
* **Denial of Service:** `max_connections 50`, `max_queued_messages 1000`,
  `message_size_limit 4096` bytes.

## 4. Contenido de esta carpeta

```
campo/
├── docker-compose.yml              # Broker Mosquitto + PostgreSQL de identidad
├── .env.example                    # Plantilla de configuración (sin secretos)
├── mosquitto/config/mosquitto.conf # Seguridad, persistencia y Go Auth
├── mosquitto-railway/init.sql      # Puntero (esquema canónico en postgres/)
├── postgres/init.sql               # Identidad MQTT + esquema de datos de la cuenca
├── generar_dataset_sintetico_PRO.py# Gemelo Digital de datos (paridad con Capa 1/3)
├── script_simulator_mqtt.py        # Inyector MQTT del dataset histórico
└── requirements.txt
```

## 5. Ejecución

1. **Desplegar la infraestructura de red**
   ```bash
   cp .env.example .env
   docker-compose up -d
   ```
2. **Generar el Gemelo Digital de datos**
   ```bash
   python generar_dataset_sintetico_PRO.py
   ```
3. **Inyectar el histórico por MQTT**
   ```bash
   python script_simulator_mqtt.py
   ```
4. **Verificación de tráfico (sniffer)**
   ```bash
   docker exec -it broker_chancay_campo mosquitto_sub -h localhost -p 1883 -t "#" -u backend_central -P backendChancay2026 -v
   ```
