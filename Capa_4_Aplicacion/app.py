""" 
PROMPT PARA GENERAR LA APP PARA LAS AUTORIDADES (EJ. ANA , MINAM)
Actúa como un Desarrollador Senior de Software IoT y Científico de Datos experto en Smart Cities. Necesito que generes el código completo en Python usando el framework Streamlit para el archivo `app_dashboard.py` (Capa 4 - Aplicación, según el modelo de 4 capas de la ITU-T).

Este sistema está estrictamente orientado a altas entidades gubernamentales de fiscalización ambiental, tales como la Autoridad Nacional del Agua (ANA) y el Ministerio del Ambiente (MINAM) de Perú, para supervisar el "Sistema IoT Autónomo de Monitoreo y Alerta Temprana de Calidad del Agua en la Cuenca Chancay-Huaral".

Requisitos críticos de Arquitectura y Datos que NO debes modificar ni omitir bajo riesgo de romper el sistema híbrido:
1. Las 5 variables físicas de entrada de los sensores mapeadas en los endpoints JSON son exactamente:
   - 'Conductividad_uS_cm' (Línea base normal: 360.0 uS/cm)
   - 'pH' (Línea base normal: 7.39)
   - 'Temp_Agua_C' (Normal: ~16.2 °C)
   - 'Temp_Ambiente_C' (Normal: ~21.5 °C)
   - 'Nivel_Agua_m' (Normal: ~1.20 metros)
2. El archivo histórico origen es "../Capa_2_Red/dataset_sintetico_chancay.csv".
3. La aplicación debe consumir datos simulando llamadas HTTPS REST en el puerto 8000 hacia el middleware FastAPI de la Capa 3.

Quiero que la aplicación sea altamente robusta, profesional y visualmente ejecutiva, organizada mediante un menú lateral (`st.sidebar.selectbox`) con las siguientes 4 secciones detalladas:

--- SECCIÓN 1: CENTRO DE MANDO EN TIEMPO REAL (FISCALIZACIÓN) ---
- Diseña una interfaz de sala de crisis con KPIs superiores grandes usando `st.metric`.
- Incluye alertas semafóricas dinámicas en base a si la IA (Isolation Forest) clasifica el estado actual como NORMAL (Verde) o ANOMALÍA (Rojo / Alerta de vertimiento químico o Huayco).
- Gráficos interactivos en tiempo real que muestren la correlación entre el pH y la Conductividad Eléctrica.

--- SECCIÓN 2: HISTÓRICO Y FISCALIZACIÓN ANALÍTICA (FORMATO ANA/MINAM) ---
- Carga el archivo CSV analítico e implementa filtros temporales avanzados.
- Agrega un botón interactivo llamado "Generar Reporte de Fiscalización Oficial PDF". Al presionarlo, debe simular la compilación y permitir la descarga de un reporte estructurado con el sello digital del ANA conteniendo promedios ponderados, picos fuera de los Estándares de Calidad Ambiental (ECA) para Agua (Categoría 3: Riego de vegetales y bebida de animales, aplicable a Huaral) y firmas de auditoría.

--- SECCIÓN 3: BITÁCORA FORENSE DE SEGURIDAD (STRIDE - ANTIREPUDIO) ---
- Diseña una tabla de datos simulada que represente los logs inalterables de la base de datos de la Capa 3.
- Debe mostrar columnas: [Timestamp, ID_Sensor, Evento, Clasificación_IA, Operador_Responsable, Firma_Digital_Hash].
- Esto servirá para demostrar al jurado la mitigación de la amenaza de 'Repudio' en la matriz STRIDE, probando que ningún funcionario puede negar el conocimiento de un desastre ecológico detectado por la IA.

--- SECCIÓN 4: CONTROL MAESTRO DE LA COMPUTACIÓN AUTONÓMICA ---
- Una consola de administración donde se visualice el estado del ciclo MAPE-K (Monitor, Analyze, Plan, Execute, Knowledge).
- Incluye dos botones de anulación manual de emergencia (Override) para enviar comandos vía solicitudes a la API con el fin de encender/apagar el Buzzer de 5V y modificar los mensajes del LCD físico del laboratorio, simulando pruebas de calibración o mantenimiento de hardware por parte de técnicos del MINAM.

Genera el código limpio, libre de errores de indentación, utilizando componentes nativos de Streamlit y layouts avanzados (`st.columns`, `st.tabs`, `st.expander`), optimizando el manejo de excepciones por si el archivo CSV o la API FastAPI local se encuentran momentáneamente desconectados durante la demostración en vivo.
"""
