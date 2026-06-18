# Capa 3: Soporte a Servicios - Motor de Inteligencia Artificial y Control Autonómico

Esta capa representa el núcleo decisor de la Smart City, implementando el lazo de control **MAPE-K** mediante un enfoque híbrido de servicios e Inteligencia Artificial descentralizada.

## 1. Algoritmo de IA: Isolation Forest (Bosque de Aislamiento)
Se seleccionó **Isolation Forest** (Scikit-Learn) debido a su alta eficiencia en entornos IoT de recursos optimizados. A diferencia de otros algoritmos supervisados, Isolation Forest aísla las anomalías basándose en que las lecturas críticas (ej. vertimientos industriales o desbordes en el Río Chancay) poseen atributos drásticamente distintos a la línea base normal, sin requerir un etiquetado previo exhaustivo.

## 2. Flujo del Ciclo Autonómico (MAPE-K)
1. **Monitor:** FastAPI recibe vía HTTPS (Puerto 8000) o Paho-MQTT las variables de los 5 sensores.
2. **Analyze:** El modelo `modelo_isolation_forest.pkl` evalúa vectorialmente la firma de los datos.
3. **Plan:** Si la predicción retorna un valor de `-1`, se estructura una respuesta de emergencia en formato JSON.
4. **Execute:** Paho-MQTT despacha un mensaje con prioridad `QoS 1` al tópico `chancay/actuadores/alerta` forzando la activación del hardware en la Capa 1.

## 3. Mitigación STRIDE Implementada
* **Information Disclosure:** Toda la comunicación REST hacia la API está protegida bajo cifrado asimétrico **HTTPS/TLS**, impidiendo que atacantes intercepten los payloads de calidad del agua en tránsito.
* **Tampering:** El middleware valida estrictamente los esquemas mediante la librería `Pydantic`. Payload malformados o inyecciones de código son rechazadas inmediatamente con un código HTTP 422.