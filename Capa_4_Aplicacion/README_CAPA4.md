# Capa 4: Aplicación - Centro de Control de la Smart City
Esta capa representa el nivel superior del modelo de la ITU-T, proveyendo la interfaz humano-máquina (HMI) interactiva para la toma de decisiones por parte de las autoridades o la población de la provincia de Huaral.

## 1. Tecnologías Seleccionadas
* **Framework Visual:** Streamlit (Python Dashboarding Framework).
* **Consumo de Servicios:** Peticiones asíncronas REST (HTTP/JSON) hacia el Middleware de la Capa 3.
* **Componentes de Interfaz:** Tarjetas de métricas en tiempo real (KPIs), semáforos de alerta temprana y visualizadores dinámicos de series temporales.

## 2. Mitigación de Amenazas (Enfoque STRIDE)
* **Repudiation (Repudio):** La aplicación web cuenta con un sistema de visualización de bitácoras de logs no modificables provenientes de la base de datos de la Capa 3. Cada cambio de estado de alerta generado por la IA queda indexado permanentemente con su respectiva marca de tiempo (*Timestamp*), impidiendo que un operador niegue la existencia de una alerta de contaminación previa.
* **Information Disclosure:** El dashboard solo se renderiza si el canal HTTPS de la API valida los tokens de sesión del navegador, protegiendo los gráficos de la cuenca contra accesos de visualización no autorizados.