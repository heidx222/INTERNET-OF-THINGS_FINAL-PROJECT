# Capa 2: Red - Sistema IoT Autónomo Cuenca Chancay-Huaral

Este módulo contiene los elementos de conectividad, enrutamiento y seguridad para el transporte de los payloads de calidad del agua, estructurados bajo el **Modelo de 4 Capas de la ITU-T (Y.2060)** y evaluados bajo la metodología de ciberseguridad **STRIDE**.

> **NOTA DE VERSIÓN:** Esta es la versión **Laboratorio (Gemelo Digital)**. Se omite temporalmente el nodo físico ESP32 en favor de una arquitectura de datos sintéticos inyectados a un Broker Cloud-Native, validando la lógica y seguridad antes del despliegue en campo.

## 1. Diseño de la Infraestructura de Red
* **Topología:** Estrella (Hub-and-Spoke).
* **Infraestructura Core:** Broker Eclipse Mosquitto orquestado vía Docker.
* **Protocolo de Transporte:** MQTT v3.1.1 sobre TCP/IP (Puerto `1883`).
* **Gestión de Identidad (IAM):** Plugin *Mosquitto Go Auth* conectado a una base de datos PostgreSQL en tiempo real.
* **Clientes de Red:**
  1. **Simulador Histórico (Python):** Inyecta el dataset sintético masivo simulando años de telemetría.
  2. **Simulador Tiempo Real (Python):** Emula el comportamiento en vivo del ESP32.
  3. **Sistema Central (Capa 3):** Suscriptor que procesará el Big Data y ejecutará el lazo analítico.

## 2. Matriz de Tópicos MQTT (Listas de Control de Acceso - ACLs)
El sistema emplea segregación estricta de tópicos. Ningún nodo puede escribir en el canal de otro.

| Tópico MQTT | Permiso | Entidad | Descripción / Carga útil |
| :--- | :--- | :--- | :--- |
| `chancay/cuenca/tiempo_real/nodo_01` | Write | Gemelo ESP32 | Payload JSON con lecturas cada 5s de los 5 sensores. |
| `chancay/cuenca/historico` | Write | Python (Big Data) | Ráfaga masiva del dataset sintético para analítica. |
| `chancay/actuadores/alerta/nodo_01` | Read | Gemelo ESP32 | Comando binario para activar alarmas remotas. |
| `chancay/cuenca/#` | Read | Backend Central | Lectura global de toda la telemetría de la cuenca. |
| `chancay/actuadores/comando/#` | Write | Capa 4 (`dashboard_nodered`) | Comandos MQTT inversos del Panel de Telecontrol (Sirena/Compuerta). |

## 3. Matriz de Mitigación de Amenazas (Enfoque STRIDE)
Debido a la criticidad del monitoreo de desbordes, la Capa de Red implementa las siguientes contenciones en `mosquitto.conf` y su arquitectura:

* **Spoofing (Suplantación):** Mitigado eliminando accesos anónimos (`allow_anonymous false`) y gestionando credenciales en una BD **PostgreSQL** mediante *Mosquitto Go Auth*. Las contraseñas están protegidas mediante hashing criptográfico **Bcrypt**.
* **Tampering (Alteración de Datos):** Mitigado con persistencia de disco habilitada y el uso de Calidad de Servicio (`QoS 1` - *At least once*), forzando un acuse de recibo (`PUBACK`) entre el cliente y el broker para evitar pérdida o corrupción en tránsito.
* **Denial of Service (DoS):** Mitigado mediante la restricción de conexiones simultáneas (`max_connections 50`), límite de mensajes en cola (`max_queued_messages 1000`) y restricción de tamaño de payload (`message_size_limit 2048` bytes), evitando saturaciones de memoria.

## 4. Contenido de esta Carpeta
* `/mosquitto/`: Contiene `mosquitto.conf` con las directivas de seguridad, persistencia y la configuración del plugin *Go Auth*.
* `/postgres/`: Contiene `init.sql`, el script de inicialización que define el esquema relacional y las credenciales de los nodos.
* `docker-compose.yml`: Orquestador de servicios que gestiona el ciclo de vida del broker y la base de datos, incluyendo *healthchecks* para garantizar la conectividad.
* `generar_dataset_sintetico_PRO.py`: Motor de modelado estocástico para la creación del Gemelo Digital de datos.
* `script_simulator_mqtt.py`: Cliente MQTT que inyecta el dataset sintético al broker bajo políticas de autenticación segura.

## 5. Pasos para ejecución
Para levantar el ecosistema y comenzar con la analítica, siga estos pasos en su terminal:

1. **Desplegar la infraestructura de red:**
   ```bash
   docker-compose up -d
   ```
   Verifique que los contenedores estén activos con *docker ps*.

2. **Generar el Gemelo Digital de datos:**
  ```bash
  python generar_dataset_sintetico.py
  ```
  Esto creará el archivo dataset_sintetico_chancay.csv con las anomalías de campo programadas.

3. **Ejecutar la inyección masiva (Histórico):**
  ```bash
  python script_simulator_mqtt.py
  ```
  El script se autenticará contra PostgreSQL y comenzará a publicar el dataset en el tópico chancay/cuenca/historico.

4. **Verificación de tráfico (Modo Sniffer):**
  Para observar el flujo de datos en tiempo real y validar que la autenticación es correcta, ejecute:
  ```bash
  docker exec -it broker_chancay_huaral mosquitto_sub -h localhost -p 1883 -t "#" -u
  ```