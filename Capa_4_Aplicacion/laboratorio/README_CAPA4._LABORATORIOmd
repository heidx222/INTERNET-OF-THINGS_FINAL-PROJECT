# Capa 4: Aplicación - Sistema de Visualización y Difusión Ciudadana de Alertas

Este módulo contiene la interfaz gráfica de usuario, el orquestador de flujos lógicos y el motor de notificaciones masivas para la población de la Cuenca Chancay-Huaral, estructurado bajo el **Modelo de 4 Capas de la ITU-T (Y.2060)** y evaluado bajo la metodología de ciberseguridad **STRIDE**.

> **NOTA DE VERSIÓN:** Esta es la versión **Laboratorio (Gemelo Digital)**. Se expone un Dashboard web/móvil responsivo de acceso local y se emula el motor de notificaciones masivas utilizando un puente automatizado hacia WhatsApp Web y una integración por API con un Agente de Inteligencia Artificial Generativa.

## 1. Diseño de la Infraestructura de la Aplicación y Dashboard
* **Orquestador Core:** Node-RED v4.0+ corriendo en entorno contenedorizado de Node.js.
* **Motor de Interfaz de Usuario:** *Node-RED Dashboard 2.0* (`@flowfuse/node-red-dashboard`), optimizado nativamente con layouts responsivos para su correcta visualización en Smartphones (Android/iOS) y pantallas de escritorio.
* **Integración AI (Súper Agente):** Nodo `http request` conectado vía REST a la API del modelo fundacional (GenSpark/LLM API) para la reescritura contextual de alertas ambientales en lenguaje natural.
* **Canal de Difusión Masiva:** Nodo `node-red-contrib-whatsapp-link` (basado en la automatización de `whatsapp-web.js`), que convierte a Node-RED en un bot transaccional ciudadano mediante el escaneo de un código QR de pruebas.

## 2. Matriz de Flujos y Orquestación de Nodos
El sistema opera de forma asíncrona reaccionando de manera diferenciada según el origen del evento (Polling HTTP vs Event-Driven MQTT).

| Entrada del Flujo | Nodo de Procesamiento | Destino de Salida | Propósito y Comportamiento Técnico |
| :--- | :--- | :--- | :--- |
| `Inject (Cada 5s)` | `HTTP Request: GET /telemetria/reciente` | Gráficos e Historial Web | Consume el endpoint de la Capa 3 para actualizar las tendencias de los 6 sensores en el Dashboard. |
| `MQTT In (chancay/cuenca/#)` | `Switch Node (Evaluación de estados)` | UI Gauges y Semáforos | Actualiza instantáneamente el widget visual móvil (Verde/Amarillo/Rojo) según el peligro actual. |
| `MQTT In (chancay/actuadores/alerta/#)` | `Template Node + HTTP Post (AI)` | API Súper Agente | Captura la orden de la IA de la Capa 3, extrae las variables físicas y despacha el prompt de contextualización humana. |
| `API AI Response` | `Function Node (Sanitizado de texto)` | WhatsApp Client Node | Recibe el texto amigable redactado por la AI y lo difunde masivamente a la base de contactos de los ciudadanos. |

## 3. Matriz de Mitigación de Amenazas (Enfoque STRIDE)
Debido a que esta capa interactúa directamente con los ciudadanos y expone interfaces a la red, se implementan las siguientes directivas de mitigación en `settings.js`:

* **Spoofing (Suplantación del Administrador):** Mitigado deshabilitando el acceso libre al editor de flujos de Node-RED. Se activa la autenticación obligatoria por formulario utilizando contraseñas cifradas mediante el algoritmo de hash **bcrypt** en las variables de entorno.
* **Information Disclosure (Fuga de Credenciales):** Mitigado mediante la exclusión de tokens de API y contraseñas dentro del código del flujo JSON. Todas las API Keys del Súper Agente de IA se inyectan dinámicamente como variables de entorno del contenedor Docker (`${AI_API_KEY}`).
* **Tampering (Inyección de Mensajes Falsos):** Mitigado mediante nodos de filtrado estricto. El flujo de WhatsApp únicamente reacciona ante payloads que provengan exclusivamente de la red interna del broker Mosquitto autenticado, descartando inyecciones externas desde la WAN.

## 4. Contenido de esta Carpeta
* `/data/flows.json`: El archivo maestro que contiene la programación visual de todos los nodos, conexiones de gráficos, la API del Súper Agente y el bot de WhatsApp.
* `/data/settings.js`: Archivo de configuración central de Node-RED donde se declara la seguridad del editor y parámetros globales de red.
* `Dockerfile.nodered`: Receta de construcción personalizada que automatiza la instalación de las dependencias (`npm package install`) del Dashboard 2.0 y el nodo de WhatsApp al compilar el contenedor.

## 5. Pasos para ejecución
Siga esta secuencia exacta para desplegar la capa de presentación e interactuar con el Gemelo Digital:

<Sequence>
{/* Reason: El orden es estricto; el contenedor de Node-RED requiere que las capas base existan, y el flujo exige el escaneo físico del QR para enlazar WhatsApp antes de recibir alertas de la IA. */}
  <Step title="Inyectar servicio Node-RED al ecosistema unificado" subtitle="Configuración centralizada">
    Asegúrese de que el servicio de Node-RED esté declarado en su archivo `docker-compose.yml` central en la raíz o en la Capa 2, apuntando al volumen local de la Capa 4 para no perder los flujos guardados.
  </Step>
  <Step title="Levantar la arquitectura multi-contenedor" subtitle="Tiempo estimado: 2 min">
    Ejecute el despliegue global desde su terminal:
    ```bash
    docker-compose up -d --build
    ```
    Esto compilará el Dockerfile de Node-RED e instalará automáticamente el Dashboard y las librerías de mensajería.
  </Step>
  <Step title="Vincular el Bot de WhatsApp Ciudadano" subtitle="Intervención manual">
    Abra en su navegador `http://localhost:1880`. Diríjase a la pestaña de *Debug* o abra la consola del contenedor para visualizar el código QR generado por el nodo de WhatsApp. Escanéelo con su teléfono inteligente de pruebas utilizando la opción *Dispositivos Vinculados*.
  </Step>
  <Step title="Acceder al Dashboard Público" subtitle="Visualización Web y Móvil">
    Ingrese a `http://localhost:1880/dashboard`. Verifique que las gráficas comiencen a pintar el histórico de datos extraídos desde el PostgreSQL de la Capa 3 y que la interfaz se adapte correctamente al cambiar el tamaño del navegador a dimensiones móviles.
  </Step>
</Sequence>

---

> **Mecanismo del Lazo de Alerta AI (Prompt de Sistema embebido en Node-RED):**
> *"Eres el Asistente Inteligente de Alerta Temprana de la Cuenca Chancay-Huaral. Se ha recibido un reporte analítico de anomalía crítica: {{payload}}. Traduce estos datos técnicos a un mensaje amigable, claro y preventivo dirigido a los agricultores y pobladores de la zona a través de WhatsApp. Explica brevemente el riesgo del indicador alterado y qué medida inmediata deben tomar. Mantén un tono empático, firme y oficial."*