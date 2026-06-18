# Capa 2: Red - Sistema IoT Autónomo Cuenca Chancay-Huaral

Este módulo contiene los elementos de conectividad, enrutamiento y seguridad para el transporte de los payloads de calidad del agua, estructurados bajo el **Modelo de 4 Capas de la ITU-T** y evaluados bajo la metodología **STRIDE**.

## 1. Diseño de la Infraestructura de Red
* **Topología:** Estrella. 
* **Nodo Central (Hub):** Punto de Acceso Wi-Fi (Router de laboratorio o Hotspot móvil).
* **Protocolo de Transporte:** MQTT (Message Queuing Telemetry Transport) sobre TCP/IP, operando en el puerto estándar `1883`.
* **Clientes de Red:**
  1. **ESP32 Dev Kit V1 (Físico):** Publica datos en tiempo real de los 5 sensores y se suscribe a alertas.
  2. **Script Simulator (Virtual):** Publica el dataset sintético calibrado con la Muestra N°4 real del río.
  3. **Node-RED (Servidor):** Suscriptor central que procesa el lazo autonómico MAPE-K.

## 2. Matriz de Tópicos MQTT (Arquitectura de Canales)
| Tópico MQTT | Tipo | Emisor | Receptor | Descripción / Carga útil |
| :--- | :--- | :--- | :--- | :--- |
| `chancay/cuenca/tiempo_real` | Publicar | ESP32 (Físico) | Node-RED / BD | Payload JSON con lecturas en vivo de los 5 sensores. |
| `chancay/cuenca/historico` | Publicar | Script Python | Node-RED / BD | Ráfaga del dataset sintético para analítica masiva. |
| `chancay/actuadores/alerta` | Suscribir | Node-RED | ESP32 | Comando binario (`1` o `0`) para activar el Buzzer y LCD. |

## 3. Matriz de Mitigación de Amenazas (Enfoque STRIDE)
Debido a que el agua de la cuenca Chancay-Huaral abastece a la agricultura y población, la Capa de Red implementa las siguientes contenciones de seguridad configuradas en el archivo `mosquitto.conf`:

* **Spoofing (Suplantación):** Mitigado mediante la directiva `allow_anonymous false`. El Broker rechaza cualquier dispositivo pirata que intente hacerse pasar por el ESP32 si no incluye el token/usuario autorizado.
* **Tampering (Alteración de Datos):** Mitigado mediante el uso de payloads estrictamente formateados en estructuras JSON cerradas. Cualquier paquete corrupto o modificado maliciosamente que no valide sintácticamente es descartado en la Capa 3.
* **Denial of Service (DoS):** Mitigado mediante políticas de Calidad de Servicio (`QoS 1`) en las publicaciones críticas de alertas tempranas, asegurando el acuerdo de recepción (*Handshake*) entre el cliente y el broker.

## 4. Contenido de esta Carpeta
* `generar_dataset_sintetico.py`: Script de modelado estocástico en Python.
* `script_simulator_mqtt.py`: Motor de inyección de datos históricos hacia la red MQTT.
* `mosquitto.conf`: Archivo de gobernanza y seguridad del Broker central.