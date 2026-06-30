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

## 5. Manual de Operación y Despliegue
Este apartado describe los pasos necesarios para inicializar, configurar y validar la infraestructura de red perimetral e híbrida del sistema.
### Prerrequisitos del Entorno
* **Python 3.10+** instalado en el sistema operativo central (Servidor).
* **Eclipse Mosquitto MQTT Broker** instalado y registrado en las variables de entorno del sistema (`C:\Program Files\mosquitto`).
* Biblioteca de comunicación perimetral instalada ejecutando:
  ```bash
  pip install paho-mqtt==1.6.1
  ```

### Paso 1: Configuración Criptográfica y Consolidación del Directorio (STRIDE - Mitigación de Spoofing)
Antes de inicializar el ecosistema de red, es obligatorio generar las credenciales de acceso cifradas para que el Broker rechace cualquier dispositivo extraño que intente suplantar al hardware perimetral.
1. Abra la terminal o CMD de su sistema operativo como **Administrador**.
2. Desplácese hacia el directorio nativo de instalación de Mosquitto:
   ```bash
   cd "C:\Program Files\mosquitto"
   ```
   2.1. Ejecute la utilidad criptográfica de Mosquitto para registrar al usuario autorizado (nodo_chancay_01) y crear el archivo local:
   ```bash
    mosquitto_passwd -c configuration_usuarios.txt nodo_chancay_01
   ```
  * El sistema le solicitará una contraseña por consola. Ingrese el token exacto configurado en el firmware del ESP32: token_seguro_stride **(Nota: Los caracteres no se mostrarán en pantalla por seguridad; digítelos y presione Enter).**
  * Copie el archivo generado configuration_usuarios.txt y trasládelo a su carpeta de trabajo de la Capa 2 (servidor_IOT/).
  * Al finalizar este procedimiento, asegúrese de que los siguientes 4 elementos clave coexistan de forma estricta dentro del mismo directorio:
    * **mosquitto.conf** (Archivo de gobernanza y directivas de red)
    * **configuration_usuarios.txt** (Base de datos local con las credenciales criptográficas hash)
    * **dataset_sintetico_chancay.csv** (Gemelo digital de datos históricos calibrados)
    * **script_simulator_mqtt.py** (Inyector analítico virtual en ráfaga)

### Paso 2: Inicialización del Broker Central (Gobernanza y STRIDE)
Abra una interfaz de línea de comandos (CMD / Terminal), navegue hasta el directorio consolidado e inicialice el orquestador de red aplicando las políticas restrictivas:
```bash
cd "C:\Users\user.ADMIN\Downloads\servidor_IoT"
"C:\Program Files\Mosquitto\mosquitto.exe" -c mosquitto.conf -v
```
**⚠️Nota de Auditoría:** Mantenga esta ventana abierta. El flag -v (Verbose) expondrá en tiempo real los logs de conexión, handshakes de QoS 1 y publicaciones entrantes para validación del jurado.

### Paso 3: Activación del Flujo Físico en Tiempo Real (Capa 1)
1. Obtenga la dirección IPv4 local del servidor ejecutando ipconfig en una nueva terminal.
2. Configure dicha IP en la directiva #define MQTT_SERVER del código fuente del ESP32 (.ino).
3. Energice el hardware físico. El terminal del Broker Mosquitto deberá reflejar el Handshake de conexión de manera automática:
  ```bash
  New client connected from [IP_ESP32] as ESP32_Cuenca_Chancay_01 (u'nodo_chancay_01').
  Received PUBLISH from ESP32_Cuenca_Chancay_01 on 'chancay/cuenca/tiempo_real'
  ```

### Paso 4: Inyección Streaming de Big Data (Nodo Histórico Virtual)
Para validar la resiliencia y la capacidad analítica masiva de la red, abra una segunda terminal paralela y ejecute el inyector síncronizado con el gemelo digital:
```bash
cd "C:\Users\user.ADMIN\Downloads\servidor_IoT"
python script_simulator_mqtt.py
```
El script leerá el DataFrame consolidado y transmitirá en ráfaga controlada los registros históricos a través del canal seguro hacia el tópico **chancay/cuenca/historico**.

### Paso 5: Prueba de Bucle Cerrado / Downlink (Lazo MAPE-K)
Para comprobar de extremo a extremo la capacidad del lazo de control autónomo y la respuesta física de los actuadores ante una contraorden de la Capa de  (Capa 1), abra una tercera terminal e inyecte un comando binario forzado de criticidad ambiental:
* **Activar Alerta Remota (Buzzer y LCD en Crisis):**
  ```bash
  "C:\Program Files\Mosquitto\mosquitto_pub" -h [IP_TU_PC] -u nodo_chancay_01 -P token_seguro_stride -t "chancay/actuadores/alerta" -m "1"
  Restablecer Sistema (Modo Óptimo):
  ```
  
  ```bash
  "C:\Program Files\Mosquitto\mosquitto_pub" -h [IP_TU_PC] -u nodo_chancay_01 -P token_seguro_stride -t "chancay/actuadores/alerta" -m "0"
  ```
  Al ejecutar el comando "1", la Capa 2 enrutará el paquete de manera inmediata hacia el microcontrolador perimetral, forzando la conmutación de frecuencias del Buzzer Piezoeléctrico y la reestructuración de la interfaz del LCD local, dando cumplimiento absoluto al diseño metodológico propuesto.
