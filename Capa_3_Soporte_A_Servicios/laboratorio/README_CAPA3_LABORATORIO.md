# Capa 3: Soporte a Servicios - Motor de Inteligencia Artificial y Control Autonómico

Este módulo contiene los elementos de procesamiento analítico, inferencia estadística en el Edge y la lógica del lazo de control autonómico, estructurados bajo el **Modelo de 4 Capas de la ITU-T (Y.2060)** y evaluados bajo la metodología de ciberseguridad **STRIDE**.

> **NOTA DE VERSIÓN:** Esta es la versión **Laboratorio (Gemelo Digital)**. Se omite temporalmente el despliegue del software en servidores Cloud-Native externos, ejecutando el middleware y el pipeline de Inteligencia Artificial dentro del entorno contenedorizado local para validar la lógica transaccional antes del pase a producción.

## 1. Diseño de la Infraestructura de Cómputo y Lazo Autonómico
* **Paradigma de Procesamiento:** Event-Driven Architecture (Arquitectura Dirigida por Eventos).
* **Middleware Core:** FastAPI asíncrono actuando como orquestador del ciclo de vida del sistema.
* **Motor de Conectividad:** Cliente asíncrono `aiomqtt` integrado nativamente en las tareas en segundo plano (*Background Tasks*) del servidor web.
* **Pipeline de IA:** Modelo Machine Learning *Isolation Forest* deserializado con la librería `joblib`.
* **Flujo Operacional (Lazo MAPE-K):**
  1. **Monitor:** Escucha perpetua y asíncrona del broker MQTT.
  2. **Analyze:** Vectorización instantánea de las cargas útiles y clasificación del estado de la cuenca.
  3. **Plan:** Generación dinámica de directivas de mitigación en formato estructurado JSON si la IA detecta anomalías.
  4. **Execute:** Despacho automatizado de comandos hacia los actuadores con prioridad crítica.

## 2. Matriz de Variables y Mapeo Decisor (Lazo MAPE-K)
El motor de IA analiza vectorialmente la firma combinada de los 6 sensores en tiempo real para evitar falsos positivos provocados por lecturas aisladas.

| Variable de Entrada | Tipo de Dato | Rango de Validación (Pydantic) | Acción Analítica ante Anomalía (-1) |
| :--- | :--- | :--- | :--- |
| `nivel_m` | float | Mayor o igual a 0.0, Menor o igual a 20.0 | Activación de compuertas de desborde por crecida. |
| `temp_ambiente_c` | float | Mayor o igual a -10.0, Menor o igual a 50.0 | Correlación térmica ambiental del ecosistema. |
| `temp_agua_c` | float | Mayor o igual a -10.0, Menor o igual a 50.0 | Detección de vertimientos industriales térmicos. |
| `tds_ppm` | float | Mayor o igual a 0.0 | Alerta por contaminación química o relaves mineros. |
| `ph` | float | Mayor o igual a 0.0, Menor o igual a 14.0 | Mitigación por acidificación o alcalinidad crítica. |
| `turbidez_ntu` | float | Mayor o igual a 0.0 | Identificación de arrastre de sedimentos pesados. |

## 3. Matriz de Mitigación de Amenazas (Enfoque STRIDE)
Debido a la criticidad de la toma de decisiones autónomas del motor de IA, la Capa de Soporte a Servicios implementa las siguientes contenciones en su arquitectura:

* **Spoofing (Suplantación):** Mitigado forzando al cliente asíncrono interno (`aiomqtt`) a autenticarse explícitamente ante el broker mediante las credenciales criptográficas configuradas en la Capa 2, impidiendo que un tercero intercepte el canal de comandos de la IA.
* **Tampering (Alteración de Datos):** Mitigado mediante validación de esquemas en tiempo de ejecución con **Pydantic**. Cualquier JSON malformado, fuera de los rangos físicos establecidos en la matriz de variables o que intente inyecciones de código, es rechazado en la fase de monitoreo sin pasar al modelo de IA.
* **Information Disclosure (Filtración de Información):** Mitigado mediante el aislamiento del procesamiento dentro de la red privada interna de Docker (`iot_network`). Los payloads de telemetría e inferencias no se exponen públicamente a la WAN, y los futuros endpoints REST del dashboard se estructuran bajo contratos estrictos HTTPS/TLS.

## 4. Contenido de esta Carpeta
* `/app/models/`: Almacena el cerebro serializado `isolation_forest.pkl` una vez entrenado por el pipeline.
* `/app/services/mapek_engine.py`: Motor matemático que procesa las fases de *Analyze* y *Plan* ejecutando la inferencia de la IA.
* `/app/main.py`: Punto de entrada del microservicio. Inicializa FastAPI, levanta el demonio asíncrono de escucha MQTT y expone los *healthchecks*.
* `/app/schemas.py`: Define los contratos de datos y las reglas estrictas de validación de Pydantic para mitigar el Tampering.
* `Dockerfile`: Receta de construcción basada en una imagen ligera de Python Linux para el empaquetado del microservicio.
* `requirements.txt`: Manifiesto de dependencias de software con versiones congeladas para asegurar la reproducibilidad.
* `train_modelo_ia.py`: Pipeline de Machine Learning encargado de consumir el dataset de la Capa 2 y exportar el modelo matemático entrenado.

## 5. Pasos para ejecución
Siga esta secuencia exacta para entrenar e integrar el cerebro autonómico en el sistema:
1. **Entrenar el modelo de Inteligencia Artificial:**
Ejecute el script de entrenamiento para que procese el Gemelo Digital ubicado en la Capa 2:
```bash
python train_modelo_ia.py
```
Verifique que el archivo isolation_forest.pkl aparezca dentro de la ruta app/models/.

2. **Compilar la imagen del microservicio:**
Construya el contenedor local utilizando el manifiesto de Docker:
```bash
docker build -t motor_ia_chancay 
```

3. **Lanzamiento e Integración Global:**
Regrese a la carpeta de la Capa 2 e inicie el ecosistema unificado. El motor de IA se conectará automáticamente al Broker y comenzará a evaluar el tráfico inyectado:
```bash
docker-compose up -d
```

4. **Monitoreo de Decisiones del Lazo:**
Para inspeccionar las clasificaciones de la IA y verificar si el ciclo de control está ordenando activar los actuadores, revise los logs del contenedor:
```bash
docker logs -f motor_ia_chancay
```