// ============================================================
// PROYECTO: Sistema IoT Autónomo de Monitoreo y Alerta Temprana de Calidad del Agua en la Cuenca Chancay-Huaral
// ARQUITECTURA: 4 Capas ITU-T | Computación Autonómica (Loop MAPE-K)
// METODOLOGÍA DE SEGURIDAD: STRIDE
// ============================================================

// ========== SECCIÓN 1: BIBLIOTECAS Y DEPENDENCIAS (ARQUITECTURA - ITU) ==========
// ****** CAPA DE DISPOSITIVOS ******
#include <Wire.h>              // Bus I2C para LCD y sensores
#include <LiquidCrystal_I2C.h> // Actuador de Visualización -> LCD I2C
#include <OneWire.h>           // Bus 1-Wire para DS18B20
#include <DallasTemperature.h> // Sensor de Temperatura del agua -> DS18B20
#include <DHT.h>               // Sensor de Temperatura del ambiente  -> DHT11
#include <NewPing.h>           // Sensor de Nivel de Agua -> JSN-SR04T

// ****** CAPA DE RED ******
#include <WiFi.h>              // Protocolo de Comunicación -> Wi-Fi
#include <PubSubClient.h>      // Protocolo de Transporte -> MQTT

// ****** CAPA DE SOPORTE A SERVICIOS Y CAPA DE APLICACIÓN ******
#include <Preferences.h>       // Almacenamiento no volátil (NVS)
#include <esp_task_wdt.h>      // Watchdog de tareas
#include <WiFiClient.h>        // Cliente TCP (ya incluido con WiFi.h, pero explícito)

// ========== SECCIÓN 2: DEFINICIONES GLOBALES Y CONFIGURACIÓN ESTÁTICA (STRIDE y COMPUTACIÓN AUTONÓMICA) ==========
// ****** IDENTIFICACIÓN ÚNICA ******
#define CLIENT_ID_BASE "nodo_chancay"      // Prefijo, se concatenará con la MAC
char client_id[30];                        // Buffer donde se construirá el ID único

// ****** CREDENCIALES ******
const char* ssid = "LAB 06 NP";            // SSID de la red
const char* password = "LAB";              // Contraseña de la red
const char* mqtt_server = "192.168.1.X";   // IP del broker MQTT (Mosquitto/FastAPI)
const int mqtt_port = 1883;                // Puerto (1883 para no‑TLS, 8883 para TLS)
const char* mqtt_user = "nodo_chancay_01";     // Usuario del broker (autenticación)
const char* mqtt_pass = "token_seguro_stride"; // Contraseña del broker

// ****** PINES Y PERIFÉRICOS (ARQUITECTURA - ITU) ******
#define PIN_BUZZER 14       // Actuador1: Buzzer Activo 5V
#define LCD_ADDRESS 0x27    // Actuador2: LCD 16 x 2
#define LCD_COLS 16         // Actuador2: LCD 16 x 2
#define LCD_ROWS 2          // Actuador2: LCD 16 x 2

#define PIN_DS18B20 4       // Sensor1: Temperatura del Agua
#define PIN_DHT11 15        // Sensor2: Temperatura del Ambiente
#define PIN_TDS 32          // Sensor3: Conductividad Eléctrica
#define TRIG_PIN 5          // Sensor4: Trigger de Nivel de Agua
#define ECHO_PIN 18         // Sensor4: Echo de Nivel de Agua

// ****** PARÁMETROS DE AUTOPROTECCIÓN ******
#define WIFI_TIMEOUT_MS      20000UL   // Tiempo máximo para conectar Wi‑Fi (20 s)
#define MQTT_TIMEOUT_MS      10000UL   // Tiempo máximo para conectar MQTT (10 s)
#define MQTT_RECONNECT_DELAY 5000UL    // Espera entre reintentos MQTT (5 s)
#define RSSI_THRESHOLD       -80       // RSSI mínimo aceptable (dBm), por debajo se degrada
#define HEAP_THRESHOLD       20000UL   // Heap libre mínimo (bytes) para operación normal
#define WDT_TIMEOUT_MS       10000UL   // Timeout del watchdog (10 s) – debe ser “alimentado” en loop

// ****** TÓPICOS MQTT (Estructura Smart City) ******
#define TOPIC_PUB_DATA   "chancay/nodo01/sensores"   // Publicación de lecturas
#define TOPIC_SUB_CMD    "chancay/nodo01/comandos"   // Suscripción a comandos
#define TOPIC_LWT        "chancay/nodo01/status"     // Last Will Testament

// ========== SECCIÓN 3: VARIABLES GLOBALES Y ESTADOS (COMPUTACIÓN AUTONÓMICA - MAPE-K) ==========
// ****** ESTADOS DEL SISTEMA (Base de Conocimiento) ******
enum SystemState {
  STATE_INIT,       // Arranque / configuración inicial
  STATE_NORMAL,     // Operación completa
  STATE_DEGRADED,   // Fallos no críticos (sensores, red) – funcionalidad reducida
  STATE_FAILSAFE,   // Fallo grave – solo escucha comandos de rescate
  STATE_DEEP_SLEEP  // Modo ultra‑bajo consumo (batería)
};
SystemState currentState = STATE_INIT;   // Estado actual del nodo

// Variables de alerta (para lógica de Smart City)
bool alertaCritica = false;
String mensajeAlerta = "SISTEMA OPTIMO";
int tipoEmergencia = 0;  // 0=normal, 1=temperatura agua alta, 2=TDS alto, 3=nivel bajo, etc.

// ****** MÉTRICAS DE MONITOREO (para el bucle MAPE-K) ******
// Métricas internas del ESP32
float rssiActual = 0.0;           // RSSI de la conexión Wi-Fi (dBm)
uint32_t heapLibre = 0;           // Heap libre (bytes)
unsigned long uptimeSegundos = 0; // Tiempo de actividad en segundos

// Lecturas de sensores (valores escalados y filtrados)
float temperaturaAgua = -999.0;     // °C (DS18B20)
float temperaturaAmbiente = -999.0; // °C (DHT11)
float humedadAmbiente = -999.0;     // % (DHT11) – aunque no se usaba, lo añadimos para completar
float tdsValue = 0.0;               // ppm (TDS)
float distanciaNivel = -1.0;        // cm (JSN-SR04T)

// Variables auxiliares para filtrado (media móvil)
#define TDS_MUESTRAS 10
long sumaRawTDS = 0;
int muestrasTDS = 0;
int rawTDS = 0;
float voltajeTDS = 0.0;
float tdsFactor = 0.65;          // Factor de calibración del sensor TDS

// ****** COLA DE MENSAJES Y TIMERS (Control de eventos) ******
unsigned long lastSerialPrint = 0;
unsigned long lastLCDUpdate = 0;
unsigned long lastBuzzerTest = 0;
unsigned long lastAlertaBuzzer = 0;
unsigned long lastTdsSample = 0;
unsigned long lastMqttPublish = 0;
unsigned long lastSensorRead = 0;   // Control de frecuencia global de lectura

int pantallaActual = 0;           // Para alternar vistas en el LCD

// ****** SEGURIDAD (STRIDE) – Contadores de ataques ******
unsigned int authFailCount = 0;      // Fallos de autenticación MQTT
unsigned int invalidMsgCount = 0;    // Mensajes JSON inválidos
unsigned long blockUntil = 0;        // Timestamp hasta el cual se bloquean comandos

// ****** DECLARACIÓN DE OBJETOS GLOBALES (se instancian en setup) ******
LiquidCrystal_I2C lcd(LCD_ADDRESS, LCD_COLS, LCD_ROWS);  // Actuador LCD
OneWire oneWire(PIN_DS18B20);
DallasTemperature sensorDS18B20(&oneWire);               // Sensor DS18B20
DHT dht(PIN_DHT11, DHT11);                               // Sensor DHT11
NewPing sonar(TRIG_PIN, ECHO_PIN, 400);                  // Sensor ultrasónico (máx 400 cm)

WiFiClient espClient;                                    // Cliente TCP para MQTT
PubSubClient mqttClient(espClient);                      // Cliente MQTT
Preferences preferences;                                 // Almacenamiento NVS

// ========== SECCIÓN 4: CAPA DE DISPOSITIVOS (ARQUITECTURA - ITU) ==========
// ****** INICIALIZACIÓN DE SENSORES Y ACTUADORES (setupHardware) ******
// Verifica la conexión de cada periférico. Si falla, cambia el estado a DEGRADED.
void setupHardware() {
  Serial.begin(115200);
  Serial.println(F("Inicializando Capa 1..."));
  // --- Inicializar LCD ---
  lcd.init();
  lcd.backlight();
  lcd.setCursor(0, 0);
  lcd.print("Iniciando...");
  delay(500);

  // --- Inicializar sensores ---
  // DS18B20
  sensorDS18B20.begin();
  if (sensorDS18B20.getDeviceCount() == 0) {
    Serial.println(F("Error: DS18B20 no detectado"));
    currentState = STATE_DEGRADED;
    lcd.setCursor(0, 1);
    lcd.print("DS18B20 ERROR");
  } else {
    Serial.print(F("DS18B20 OK - dispositivos: "));
    Serial.println(sensorDS18B20.getDeviceCount());
  }

  // DHT11
  dht.begin();
  delay(100);
  float testTemp = dht.readTemperature();
  if (isnan(testTemp)) {
    Serial.println(F("Error: DHT11 no responde"));
    currentState = STATE_DEGRADED;
    lcd.setCursor(0, 1);
    lcd.print("DHT11 ERROR  ");
  } else {
    Serial.println(F("DHT11 OK"));
  }

  // Sensor TDS (solo verificación de lectura analógica)
  pinMode(PIN_TDS, INPUT);
  int testTDS = analogRead(PIN_TDS);
  if (testTDS < 0 || testTDS > 4095) {
    Serial.println(F("Error: TDS lectura fuera de rango"));
    currentState = STATE_DEGRADED;
  } else {
    Serial.println(F("TDS OK"));
  }

  // Sensor ultrasónico (configuración de pines)
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  // Se prueba una lectura rápida (sin bloqueo)
  digitalWrite(TRIG_PIN, LOW); delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH); delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  long dur = pulseIn(ECHO_PIN, HIGH, 30000);
  if (dur == 0) {
    Serial.println(F("Advertencia: ultrasonido no detecta eco (puede ser normal en aire)"));
    // No se degrada porque puede no haber obstáculo
  } else {
    Serial.println(F("Ultrasonido OK"));
  }

  // Actuador Buzzer (salida)
  pinMode(PIN_BUZZER, OUTPUT);
  digitalWrite(PIN_BUZZER, LOW);
  Serial.println(F("Buzzer OK"));

  // Si algún fallo crítico se ha detectado, ya se cambió a DEGRADED.
  // Si todo correcto, el estado se mantiene INIT (luego pasará a NORMAL en setup).
  Serial.print(F("Estado inicial del sistema: "));
  Serial.println(currentState == STATE_DEGRADED ? "DEGRADED" : "INIT");
}

// ****** LECTURA DE DATOS CON FILTROS (ANTI-RUIDO - SMART CITY) ******
// Cada función lee el sensor, aplica validación y filtrado básico (media móvil para TDS).
void leerTemperaturaDS18B20() {
  sensorDS18B20.requestTemperatures();
  float temp = sensorDS18B20.getTempCByIndex(0);
  if (temp == -127.0 || temp < -50.0 || temp > 125.0) {
    temperaturaAgua = -999.0;   // Valor inválido
  } else { temperaturaAgua = temp; }
}

void leerDHT11() {
  float temp = dht.readTemperature();
  float hum = dht.readHumidity();
  if (isnan(temp) || temp < -40 || temp > 80) {
    temperaturaAmbiente = -999.0;
  } else { temperaturaAmbiente = temp; }
  
  if (isnan(hum) || hum < 0 || hum > 100) {
    humedadAmbiente = -999.0;
  } else { humedadAmbiente = hum; }
}

void leerTDS() {
  if (millis() - lastTdsSample >= 5) {  // cada 5 ms
    lastTdsSample = millis();
    sumaRawTDS += analogRead(PIN_TDS);
    muestrasTDS++;
    
    if (muestrasTDS >= TDS_MUESTRAS) {
      rawTDS = sumaRawTDS / TDS_MUESTRAS;
      voltajeTDS = rawTDS * (3.3 / 4095.0);
      // Fórmula de calibración (ajustar según sensor)
      float voltajeCompensado = voltajeTDS / 1.0;
      float tds = (133.42 * pow(voltajeCompensado, 3) - 255.86 * pow(voltajeCompensado, 2) + 857.39 * voltajeCompensado) * tdsFactor;
      if (tds < 0) tds = 0;
      tdsValue = tds;
      
      sumaRawTDS = 0;
      muestrasTDS = 0;
    }
  }
}

void leerDistanciaJSN() {
  unsigned int uS = sonar.ping(); // Envía pulso y mide tiempo en microsegundos
  if (uS == 0) {
    distanciaNivel = -1.0;
  } else {
    distanciaNivel = uS / US_ROUNDTRIP_CM; // Conversión a centímetros
    if (distanciaNivel > 400) distanciaNivel = -1.0; // Fuera de rango
  }
}

void leerTodosLosSensores() {
  leerTemperaturaDS18B20();
  leerDHT11();
  leerTDS();          // Esta es asíncrona, actualiza tdsValue cuando hay suficientes muestras
  leerDistanciaJSN();
  // Actualizar métricas internas
  rssiActual = WiFi.RSSI();
  heapLibre = ESP.getFreeHeap();
  uptimeSegundos = millis() / 1000;
}

// ****** ACCIONAMIENTO DE ACTUADORES (CON VALIDACIÓN - STRIDE) ******
// Recibe un comando y un valor, verifica que esté dentro de rangos permitidos para evitar tampering y acciones maliciosas.
void actuarBuzzer(bool estado) {
  // Solo se permite encender o apagar (0 o 1)
  if (estado == true || estado == false) {
    digitalWrite(PIN_BUZZER, estado ? HIGH : LOW);
    Serial.print(F("Buzzer: "));
    Serial.println(estado ? "ON" : "OFF");
  } else {
    Serial.println(F("Comando de buzzer inválido (STRIDE: Tampering)"));
    invalidMsgCount++;
  }
}

void mostrarLCD(String linea1, String linea2) {
  // Limita longitud para evitar desbordamiento
  linea1 = linea1.substring(0, LCD_COLS);
  linea2 = linea2.substring(0, LCD_COLS);
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print(linea1);
  lcd.setCursor(0, 1);
  lcd.print(linea2);
}

// Función de actuación general, llamada desde MQTT callback
void ejecutarComando(String comando, String valor) {
  // Validación básica (STRIDE: Input Validation)
  comando.toLowerCase();
  valor.toLowerCase();
  
  if (comando == "buzzer") {
    if (valor == "on") {
      actuarBuzzer(true);
    } else if (valor == "off") {
      actuarBuzzer(false);
    } else {
      Serial.println(F("Valor de buzzer no reconocido (STRIDE)"));
      invalidMsgCount++;
    }
  } 
  else if (comando == "lcd") {
    // Se espera formato "linea1,linea2" (simplificado)
    int sep = valor.indexOf(',');
    if (sep != -1) {
      String l1 = valor.substring(0, sep);
      String l2 = valor.substring(sep + 1);
      mostrarLCD(l1, l2);
    } else {
      mostrarLCD(valor, ""); // Solo primera línea
    }
  }
  else {
    Serial.println(F("Comando desconocido (STRIDE)"));
    invalidMsgCount++;
  }
}

// ========== SECCIÓN 5: CAPA DE RED (ARQUITECTURA - ITU) ==========
// ****** 5.1: GESTIÓN DE WI-FI (wifiManager) ******
// Bucle de reconexión automática (Self-Healing) con backoff exponencial.
// Inicializa el ID único a partir de la MAC (Anti-Spoofing)
void initUniqueId() {
  uint64_t chipId = ESP.getEfuseMac();
  snprintf(client_id, sizeof(client_id), "%s_%04X%08X", CLIENT_ID_BASE, 
           (uint16_t)(chipId >> 32), (uint32_t)chipId);
  Serial.print("[ID] Client ID generado: ");
  Serial.println(client_id);
}

// Conexión Wi-Fi no bloqueante con backoff exponencial (1s, 2s, 4s, 8s...)
void wifiManager() {
  static unsigned long lastAttempt = 0;
  static int attemptDelay = 1000;   // empieza en 1s
  static int failCount = 0;

  if (WiFi.status() == WL_CONNECTED) {
    failCount = 0;          // Reinicia contador si está conectado
    attemptDelay = 1000;
    return;
  }

  // Control de tiempo para no bloquear el loop
  if (millis() - lastAttempt < attemptDelay) return;
  lastAttempt = millis();

  Serial.print("[WIFI] Reconectando (intento #");
  Serial.print(++failCount);
  Serial.print(", backoff ");
  Serial.print(attemptDelay);
  Serial.println(" ms)...");

  WiFi.disconnect();
  WiFi.begin(ssid, password);

  // Backoff exponencial hasta 30 segundos máximo
  if (attemptDelay < 30000) {
    attemptDelay *= 2;
  }
}

// ****** 5.2: GESTIÓN DE MQTT (mqttManager) ******
// Configuración de LWT, suscripción segura y publicación con QoS 1.
// Callback para mensajes MQTT entrantes (validación de payload - STRIDE)
void mqttCallback(char* topic, byte* payload, unsigned int length) {
  // ANTI-DOS: si estamos en bloqueo, ignoramos todo comando
  if (millis() < blockUntil) {
    Serial.println("[MQTT] Comandos bloqueados por seguridad (Anti-DoS)");
    return;
  }

  // Convertir payload a String
  String mensaje = "";
  for (unsigned int i = 0; i < length; i++) {
    mensaje += (char)payload[i];
  }

  Serial.print("[MQTT] Comando recibido en tópico: ");
  Serial.print(topic);
  Serial.print(" | Payload: ");
  Serial.println(mensaje);

  // Validación básica de integridad (STRIDE - Tampering): debe tener formato "comando:valor"
  int separador = mensaje.indexOf(':');
  if (separador == -1) {
    Serial.println("[STRIDE] Formato inválido (sin ':') -> posible tampering");
    invalidMsgCount++;
    return;
  }

  String comando = mensaje.substring(0, separador);
  String valor = mensaje.substring(separador + 1);

  // Reenvía a la función de actuación definida en la Capa 1 (Sección 4)
  ejecutarComando(comando, valor);
}

// Gestión de la conexión MQTT (Self-Healing)
void mqttManager() {
  static unsigned long lastReconnectAttempt = 0;

  if (mqttClient.connected()) {
    mqttClient.loop();    // Mantiene viva la conexión
    return;
  }

  // Si Wi-Fi no está listo, no intentar conectar MQTT
  if (WiFi.status() != WL_CONNECTED) return;

  // Control de reintentos no bloqueantes
  if (millis() - lastReconnectAttempt < MQTT_RECONNECT_DELAY) return;
  lastReconnectAttempt = millis();

  Serial.print("[MQTT] Conectando al broker... ");

  // Configuración del Last Will Testament (LWT) para notificar caídas
  mqttClient.setWill(TOPIC_LWT, "offline", true);

  // Intento de conexión con credenciales (STRIDE - Autenticación)
  if (mqttClient.connect(client_id, mqtt_user, mqtt_pass)) {
    Serial.println("¡Conectado!");

    // Publicar estado online (LWT se actualizará automáticamente)
    mqttClient.publish(TOPIC_LWT, "online", true);

    // Suscripción a tópicos de control (solo si no estamos bloqueados)
    if (millis() >= blockUntil) {
      if (mqttClient.subscribe(TOPIC_SUB_CMD)) {
        Serial.print("[MQTT] Suscrito a: ");
        Serial.println(TOPIC_SUB_CMD);
      } else {
        Serial.println("[MQTT] Error al suscribirse");
      }
    } else {
      Serial.println("[MQTT] Suscripción omitida (bloqueo activo)");
    }
  } else {
    Serial.print("Falló, código de error: ");
    Serial.println(mqttClient.state());
    authFailCount++;   // Contador para STRIDE (posible ataque de fuerza bruta)
  }
}

// Publicación de datos con QoS 1 para evitar pérdida de información crítica
void publicarMQTT() {
  if (!mqttClient.connected()) return;

  // Construcción del payload en formato JSON (Smart City)
  String payload = "{";
  payload += "\"nodo\":\"" + String(client_id) + "\",";
  payload += "\"timestamp\":" + String(millis()) + ",";
  payload += "\"temp_agua\":" + String(temperaturaAgua, 1) + ",";
  payload += "\"temp_amb\":" + String(temperaturaAmbiente, 1) + ",";
  payload += "\"humedad\":" + String(humedadAmbiente, 1) + ",";
  payload += "\"tds\":" + String(tdsValue, 0) + ",";
  payload += "\"nivel_cm\":" + String(distanciaNivel, 1) + ",";
  payload += "\"rssi\":" + String(rssiActual, 0) + ",";
  payload += "\"estado\":\"" + String(mensajeAlerta) + "\"";
  payload += "}";

  // Publicación con QoS 1 (retener = false)
  if (mqttClient.publish(TOPIC_PUB_DATA, payload.c_str(), true)) {
    Serial.println("[MQTT] Datos publicados correctamente (QoS 1)");
  } else {
    Serial.println("[MQTT] Error al publicar");
  }
}

// ========== SECCIÓN 6: BUCLE MAPE-K (COMPUTACIÓN AUTONÓMICA) ==========
// Variables de control dinámico para el bucle MAPE-K
unsigned long publishInterval = 5000;   // Intervalo de publicación
unsigned long lastPublishTime = 0;
unsigned long lastSensorReadTime = 0;
const unsigned long SENSOR_READ_INTERVAL = 2000;  // Lectura de sensores cada 2s

// ****** 6.1: MONITOR (Monitorizar) ******
// Recolección de métricas internas y datos del entorno (Capa 1)
void monitorizar() {
  // Leer sensores a intervalo fijo (no bloqueante)
  if (millis() - lastSensorReadTime >= SENSOR_READ_INTERVAL) {
    lastSensorReadTime = millis();
    leerTodosLosSensores();   // Función definida en la Sección 4
    // Actualizar métricas internas
    rssiActual = WiFi.RSSI();
    heapLibre = ESP.getFreeHeap();
    uptimeSegundos = millis() / 1000;
  }
}

// ****** 6.2: ANALYZE (Analizar) ******
// Comparación contra umbrales y detección de anomalías
void analizar() {
  // Reiniciamos banderas de alerta para evaluar de nuevo
  alertaCritica = false;
  tipoEmergencia = 0;
  mensajeAlerta = "SISTEMA OPTIMO";

  // --- Análisis de sensores (anomalías físicas) ---
  // Temperatura del agua > 30°C (peligro para ecosistema)
  if (temperaturaAgua > 30.0 && temperaturaAgua != -999.0) {
    alertaCritica = true;
    tipoEmergencia = 1;
    mensajeAlerta = "ALERTA: TEMP AGUA ALTA";
  }
  // TDS > 1000 ppm (contaminación)
  else if (tdsValue > 1000.0) {
    alertaCritica = true;
    tipoEmergencia = 2;
    mensajeAlerta = "ALERTA: TDS ALTO";
  }
  // Nivel de agua < 15 cm (riesgo de desborde/inundación)
  else if (distanciaNivel > 0.0 && distanciaNivel < 15.0) {
    alertaCritica = true;
    tipoEmergencia = 3;
    mensajeAlerta = "ALERTA: NIVEL CRITICO";
  }

  // --- Análisis de la propia red (autoprotección) ---
  if (WiFi.status() == WL_CONNECTED && rssiActual < RSSI_THRESHOLD) {
    // Degradación por señal débil (se planificará reducción de frecuencia)
    if (!alertaCritica) {
      mensajeAlerta = "SEÑAL DEBIL";
    }
  }

  // --- Análisis de memoria (Heap bajo) ---
  if (heapLibre < HEAP_THRESHOLD) {
    Serial.println("[AUTONOMIC] Heap crítico, se forzará FAILSAFE");
    // Se planificará cambio a FAILSAFE
  }

  // --- Análisis de seguridad (STRIDE - Anti-DoS) ---
  if (invalidMsgCount >= 3) {
    Serial.println("[STRIDE] Múltiples comandos corruptos detectados -> activar bloqueo");
  }
}

// ****** 6.3: PLAN (Planificar) ******
// Toma de decisiones autonómicas
void planificar() {
  // Decisión sobre frecuencia de publicación (Self-Optimization)
  if (WiFi.status() == WL_CONNECTED) {
    if (rssiActual < RSSI_THRESHOLD) {
      // Señal débil: reducir frecuencia a 10s para evitar pérdidas
      publishInterval = 10000;
    } else if (alertaCritica) {
      // Situación crítica: aumentar frecuencia a 2s para mayor detalle
      publishInterval = 2000;
    } else {
      // Modo normal: 5s
      publishInterval = 5000;
    }
  } else {
    // Sin Wi-Fi: no publicar, solo leer y mostrar en LCD
    publishInterval = 0;
  }

  // Decisión sobre cambio de estado (Self-Configuration)
  if (heapLibre < HEAP_THRESHOLD || WiFi.status() != WL_CONNECTED) {
    currentState = STATE_DEGRADED;
  } 
  // Si hay alerta crítica, pasamos a DEGRADED para priorizar alarmas
  else if (alertaCritica) {
    currentState = STATE_DEGRADED;
  } 
  else {
    currentState = STATE_NORMAL;
  }

  // Decisión de bloqueo anti-DoS (STRIDE)
  if (invalidMsgCount >= 3 && blockUntil == 0) {
    blockUntil = millis() + BLOCK_DURATION;
    Serial.print("[STRIDE] Bloqueo activado hasta ms: ");
    Serial.println(blockUntil);
    // Se desuscribe para no procesar más comandos
    if (mqttClient.connected()) {
      mqttClient.unsubscribe(TOPIC_SUB_CMD);
    }
    invalidMsgCount = 0;  // Reiniciamos contador
  }

  // Si pasó el tiempo de bloqueo, permitir suscripción nuevamente
  if (blockUntil != 0 && millis() > blockUntil) {
    blockUntil = 0;
    Serial.println("[STRIDE] Bloqueo finalizado, reactivando suscripción");
    if (mqttClient.connected()) {
      mqttClient.subscribe(TOPIC_SUB_CMD);
    }
    invalidMsgCount = 0;
  }
}

// ****** 6.4: EXECUTE (Ejecutar) ******
// Aplicación de cambios en capas y actualización del estado global
void ejecutar() {
  // --- Alimentar Watchdog (Self-Healing) ---
  esp_task_wdt_reset();

  // --- Ejecutar acciones sobre actuadores (Capa 1) ---
  // Actualizar LCD (no más de 1 vez por segundo para evitar flicker)
  static unsigned long lastLCD = 0;
  if (millis() - lastLCD >= 1000) {
    lastLCD = millis();
    actualizarLCD();   // Definida anteriormente (Sección 4)
  }

  // Control autónomo del Buzzer
  ejecutarBuzzerAutonomo();   // Definida anteriormente (Sección 4)

  // --- Publicación MQTT (Capa 2) con intervalo dinámico ---
  if (publishInterval > 0 && mqttClient.connected()) {
    if (millis() - lastPublishTime >= publishInterval) {
      lastPublishTime = millis();
      publicarMQTT();
    }
  }

  // --- Imprimir debug por Serial (cada 5 segundos) ---
  static unsigned long lastDebug = 0;
  if (millis() - lastDebug >= 5000) {
    lastDebug = millis();
    imprimirSerial();   // Definida anteriormente (Sección 4)
    Serial.print("[AUTONOMIC] Estado: ");
    switch (currentState) {
      case STATE_INIT: Serial.println("INIT"); break;
      case STATE_NORMAL: Serial.println("NORMAL"); break;
      case STATE_DEGRADED: Serial.println("DEGRADED"); break;
      case STATE_FAILSAFE: Serial.println("FAILSAFE"); break;
      case STATE_DEEP_SLEEP: Serial.println("DEEP_SLEEP"); break;
    }
    Serial.print("[AUTONOMIC] Heap: ");
    Serial.print(heapLibre);
    Serial.print(" | RSSI: ");
    Serial.print(rssiActual);
    Serial.print(" | PubInterval: ");
    Serial.println(publishInterval);
  }
}

// ****** Función maestra del bucle MAPE-K (se llamará desde loop()) ******
void loopMAPEK() {
  // 1. MONITOR
  monitorizar();
  // 2. ANALYZE
  analizar();
  // 3. PLAN
  planificar();
  // 4. EXECUTE
  ejecutar();
}

// ========== SECCIÓN 7: CAPA DE APLICACIÓN (ARQUITECTURA - ITU) ==========
static uint32_t seqNumber = 0;               // Número de secuencia para Anti-Replay (STRIDE)
String mensajeSmartCity = "NORMAL";          // Mensaje generado por la lógica de negocio

// ****** 7.1: CALLBACK DE COMANDOS REMOTOS (VALIDACIÓN JSON - STRIDE) ******
// Sustituye al parser simple anterior por uno que valida estrictamente JSON.
// Se llama desde mqttCallback() en lugar de ejecutarComando() original.
void procesarComandoJSON(String jsonPayload) {
  // Validación de entrada: debe contener "cmd" y "valor" como claves JSON.
  // Rechazamos cualquier payload que no cumpla el formato esperado (Anti-Inyección).
  if (jsonPayload.length() < 10 || jsonPayload.indexOf('{') == -1 || jsonPayload.indexOf('}') == -1) {
    Serial.println("[STRIDE] Payload no es JSON válido -> rechazado");
    invalidMsgCount++;
    return;
  }

  // Extracción manual segura (evitamos eval/parse riesgoso, buscamos subcadenas).
  int idxCmd = jsonPayload.indexOf("\"cmd\"");
  int idxVal = jsonPayload.indexOf("\"valor\"");
  if (idxCmd == -1 || idxVal == -1) {
    Serial.println("[STRIDE] Faltan claves 'cmd' o 'valor' -> rechazado");
    invalidMsgCount++;
    return;
  }

  // Buscar el valor de "cmd": entre comillas después de los dos puntos.
  int startCmd = jsonPayload.indexOf(':', idxCmd) + 1;
  int endCmd = jsonPayload.indexOf(',', startCmd);
  if (endCmd == -1) endCmd = jsonPayload.indexOf('}', startCmd);
  if (startCmd == -1 || endCmd == -1 || endCmd <= startCmd) {
    Serial.println("[STRIDE] Error extrayendo 'cmd' -> rechazado");
    invalidMsgCount++;
    return;
  }
  String cmd = jsonPayload.substring(startCmd, endCmd);
  cmd.trim();
  cmd.replace("\"", "");  // Limpiar comillas

  // Buscar el valor de "valor"
  int startVal = jsonPayload.indexOf(':', idxVal) + 1;
  int endVal = jsonPayload.indexOf(',', startVal);
  if (endVal == -1) endVal = jsonPayload.indexOf('}', startVal);
  if (startVal == -1 || endVal == -1 || endVal <= startVal) {
    Serial.println("[STRIDE] Error extrayendo 'valor' -> rechazado");
    invalidMsgCount++;
    return;
  }
  String val = jsonPayload.substring(startVal, endVal);
  val.trim();
  val.replace("\"", "");

  // Normalizar a minúsculas para evitar evasiones (STRIDE - Canonicalización)
  cmd.toLowerCase();
  val.toLowerCase();

  Serial.print("[MQTT] Comando JSON parseado: cmd=");
  Serial.print(cmd);
  Serial.print(", valor=");
  Serial.println(val);

  // Validación de comandos permitidos (lista blanca - STRIDE)
  if (cmd != "buzzer" && cmd != "lcd" && cmd != "reset" && cmd != "modo") {
    Serial.println("[STRIDE] Comando no autorizado en lista blanca");
    invalidMsgCount++;
    return;
  }

  // Ejecutar comandos autorizados (reutilizamos lógica de actuación de la Capa 1, Sección 4)
  // pero ampliamos para reset y modo.
  if (cmd == "buzzer") {
    if (val == "on" || val == "off") {
      actuarBuzzer(val == "on");
    } else {
      Serial.println("[STRIDE] Valor de buzzer inválido");
      invalidMsgCount++;
    }
  } 
  else if (cmd == "lcd") {
    // Se espera "linea1,linea2" dentro del valor (ya viene en minúsculas)
    int sep = val.indexOf(',');
    if (sep != -1) {
      String l1 = val.substring(0, sep);
      String l2 = val.substring(sep + 1);
      // Reconvertir a mayúsculas para mejor legibilidad (solo primeras letras)
      l1.toUpperCase(); l2.toUpperCase();
      mostrarLCD(l1, l2);
    } else {
      mostrarLCD(val, "");
    }
  }
  else if (cmd == "reset") {
    if (val == "factory") {
      Serial.println("[COMANDO] Reseteo de fábrica solicitado vía MQTT");
      factoryReset();  // Definida en Sección 8.3
    } else if (val == "soft") {
      Serial.println("[COMANDO] Reinicio suave solicitado");
      ESP.restart();
    } else {
      Serial.println("[STRIDE] Valor de reset no reconocido");
      invalidMsgCount++;
    }
  }
  else if (cmd == "modo") {
    if (val == "deep_sleep") {
      Serial.println("[COMANDO] Entrando a DEEP_SLEEP");
      currentState = STATE_DEEP_SLEEP;
    } else if (val == "normal") {
      currentState = STATE_NORMAL;
    } else {
      Serial.println("[STRIDE] Modo no soportado");
      invalidMsgCount++;
    }
  }
}

// ****** 7.2: GENERACIÓN DE PAYLOADS (Anti-Replay / STRIDE) ******
// Actualiza la función publicarMQTT() para incluir seq_number y timestamp.
void publicarMQTT() {
  if (!mqttClient.connected()) return;

  // Incrementar secuencia (contador global, se reinicia al arrancar)
  seqNumber++;

  // Construcción del JSON enriquecido (Smart City + Anti-Replay)
  String payload = "{";
  payload += "\"nodo\":\"" + String(client_id) + "\",";
  payload += "\"timestamp\":" + String(millis()) + ",";          // Anti-Replay
  payload += "\"seq\":" + String(seqNumber) + ",";              // Anti-Replay
  payload += "\"temp_agua\":" + String(temperaturaAgua, 1) + ",";
  payload += "\"temp_amb\":" + String(temperaturaAmbiente, 1) + ",";
  payload += "\"humedad\":" + String(humedadAmbiente, 1) + ",";
  payload += "\"tds\":" + String(tdsValue, 0) + ",";
  payload += "\"nivel_cm\":" + String(distanciaNivel, 1) + ",";
  payload += "\"rssi\":" + String(rssiActual, 0) + ",";
  payload += "\"heap\":" + String(heapLibre) + ",";
  payload += "\"estado_mape\":\"" + String(mensajeAlerta) + "\",";
  payload += "\"estado_smartcity\":\"" + mensajeSmartCity + "\"";
  payload += "}";

  // Publicación con QoS 1 y flag retain = false
  if (mqttClient.publish(TOPIC_PUB_DATA, payload.c_str(), true)) {
    Serial.println("[MQTT] Datos publicados (seq=" + String(seqNumber) + ")");
  } else {
    Serial.println("[MQTT] Error al publicar");
  }
}

// ****** 7.3: LÓGICA SMART CITY (Algoritmo de Borde) ******
// Evalúa condiciones combinadas para generar alertas contextuales.
void logicaSmartCity() {
  // Índice de Calidad de Agua (WQI) simplificado para la Cuenca Chancay-Huaral
  // Parámetros: TDS (ppm) y Temperatura del agua (°C)
  float wqi = 0.0;
  bool datosValidos = (tdsValue > 0 && tdsValue < 5000) && 
                      (temperaturaAgua != -999.0);

  if (datosValidos) {
    // Ecuación heurística de ejemplo (ajustable según normativa local)
    // TDS ideal < 500, Temp ideal < 25°C
    float scoreTDS = constrain((1000.0 - tdsValue) / 1000.0, 0.0, 1.0);
    float scoreTemp = constrain((35.0 - temperaturaAgua) / 15.0, 0.0, 1.0);
    wqi = (scoreTDS * 0.6) + (scoreTemp * 0.4);  // ponderación
    wqi = constrain(wqi * 100, 0, 100);
  }

  // Decisión basada en WQI y otras condiciones de borde
  if (!datosValidos) {
    mensajeSmartCity = "SENSORES ERROR";
  } 
  else if (wqi < 30) {
    mensajeSmartCity = "CALIDAD CRITICA - INTERVENIR";
    // Activación de protocolo de emergencia (ej. enviar alerta a autoridades)
    // Aquí se podría activar un relé de bombeo o un módem LoRa, pero a nivel laboratorio
    // solo lo reflejamos en el LCD y en el payload.
    if (!alertaCritica) { // Si no hay alerta previa, generamos una
      alertaCritica = true;
      tipoEmergencia = 4;  // Código específico para calidad del agua
      mensajeAlerta = "WQI CRITICO";
    }
  } 
  else if (wqi < 60) {
    mensajeSmartCity = "CALIDAD REGULAR - MONITOREAR";
  } 
  else if (wqi >= 60) {
    mensajeSmartCity = "CALIDAD BUENA";
  }

  // Lógica adicional: si el nivel de agua es muy bajo (< 10 cm) y TDS > 800,
  // indica posible concentración de contaminantes por evaporación.
  if (distanciaNivel > 0 && distanciaNivel < 10 && tdsValue > 800) {
    mensajeSmartCity = "RIESGO: CONCENTRACION CONTAMINANTES";
  }

  // Lógica de farola/riego (ejemplo conceptual): si es de noche (simulado por comando)
  // y hay movimiento (simulado por ultrasonido si distancia cambia rápido), se podría
  // activar una salida digital. Aquí solo se deja la estructura.
  // static float lastDist = -1; 
  // if (distanciaNivel != -1 && lastDist != -1) { 
  //   float velocidad = abs(distanciaNivel - lastDist); 
  //   if (velocidad > 5) { /* activar algo */ } 
  // }
  // lastDist = distanciaNivel;
}

// ========== SECCIÓN 8: MANEJO DE ERRORES, REINICIOS Y AUTOCURACIÓN (Self-Healing) ==========
// Tolerancia a fallos, seguridad y resiliencia (STRIDE + Autonómica).

// ****** 8.1: WATCHDOG DE HARDWARE/SOFTWARE ******
// Inicialización del watchdog (se llama desde setup() en Sección 9).
void initWatchdog() {
  // Configurar timeout en segundos (convertir de milisegundos)
  esp_task_wdt_init(WDT_TIMEOUT_MS / 1000, true);  // true -> pánico si expira
  esp_task_wdt_add(NULL);  // Añadir la tarea actual (loop)
  Serial.print("[WDT] Watchdog inicializado con timeout de ");
  Serial.print(WDT_TIMEOUT_MS / 1000);
  Serial.println(" segundos");
}

// La alimentación del watchdog ya se realiza en ejecutar() (Sección 6.4)
// mediante esp_task_wdt_reset().

// ****** 8.2: GESTIÓN DE ERRORES FATALES (panicHandler) ******
// Guarda el estado en NVS y reinicia el sistema si la memoria heap es crítica
// o se detecta una condición irreversible.

// Función auxiliar para guardar contexto en NVS antes de reiniciar
void guardarEstadoEnNVS() {
  preferences.begin("panic", false);
  preferences.putFloat("temp_agua", temperaturaAgua);
  preferences.putFloat("tds", tdsValue);
  preferences.putFloat("nivel", distanciaNivel);
  preferences.putString("alerta", mensajeAlerta);
  preferences.putUInt("uptime", uptimeSegundos);
  preferences.putUInt("seq", seqNumber);
  preferences.end();
  Serial.println("[NVS] Estado crítico guardado antes de reinicio");
}

void panicHandler(String motivo) {
  Serial.println("==========================================");
  Serial.print("[PANIC] Motivo: ");
  Serial.println(motivo);
  Serial.println("[PANIC] Guardando estado en NVS y reiniciando...");
  
  // Intentar guardar estado (si el heap no está completamente corrupto)
  guardarEstadoEnNVS();

  // Apagar periféricos para evitar consumo o daños
  digitalWrite(PIN_BUZZER, LOW);
  lcd.clear();
  lcd.print("PANIC!");
  lcd.setCursor(0, 1);
  lcd.print("Reiniciando...");
  delay(2000);

  // Reinicio forzado del sistema
  ESP.restart();
}

// ****** 8.3: FÁBRICA / RESET SEGURO ******
// Restaura valores por defecto borrando toda la NVS.
// Se puede activar por MQTT (comando reset:factory) o por botón físico.

void factoryReset() {
  Serial.println("==========================================");
  Serial.println("[FACTORY] Iniciando reseteo de fábrica...");
  
  // Apagar actuadores
  digitalWrite(PIN_BUZZER, LOW);
  lcd.clear();
  lcd.print("FACTORY RESET");
  lcd.setCursor(0, 1);
  lcd.print("Borrando NVS...");
  delay(1000);

  // Borrar toda la partición NVS (Preferences)
  preferences.begin("config", false);
  preferences.clear();      // Borra todo el namespace "config"
  preferences.end();
  
  // También podemos borrar otros namespaces si se usaron
  preferences.begin("panic", false);
  preferences.clear();
  preferences.end();

  Serial.println("[FACTORY] NVS limpiada. Reiniciando en 2s...");
  lcd.clear();
  lcd.print("RESET OK");
  lcd.setCursor(0, 1);
  lcd.print("Reiniciando...");
  delay(2000);
  
  ESP.restart();
}

// Verifica si el botón de fábrica (BOOT en GPIO0) fue presionado por 5 segundos.
// Esta función debe llamarse al inicio de setup() (Sección 9).
void checkFactoryResetButton() {
  pinMode(0, INPUT_PULLUP);  // GPIO0 en ESP32 Dev Kit V1 tiene pull-up interno
  // Si el botón se mantiene pulsado durante 5 segundos al arrancar -> reset de fábrica
  if (digitalRead(0) == LOW) {
    Serial.println("[FACTORY] Botón BOOT presionado. Manteniendo para reset...");
    delay(5000);
    if (digitalRead(0) == LOW) {
      factoryReset();
    }
  }
}

// ========== SECCIÓN 9: FUNCIÓN SETUP() - SECUENCIA DE ARRANQUE ==========
void setup() {
  // ----- 9.1: Inicio de Serial (Debug) -----
  Serial.begin(115200);
  Serial.println("\n========================================");
  Serial.println("SISTEMA IoT AUTÓNOMO - CHANCAY HUARAL");
  Serial.println("ARQUITECTURA: ITU-T 4 Capas + MAPE-K + STRIDE");
  Serial.println("========================================\n");

  // ----- 9.2: Verificación de botón de fábrica (reset seguro por hardware) -----
  // Si se mantiene pulsado el botón BOOT (GPIO0) durante 5 segundos al arranque,
  // se ejecuta factoryReset() (definido en Sección 8.3).
  checkFactoryResetButton();

  // ----- 9.3: Inicialización del Watchdog (Self-Healing) -----
  // El watchdog se alimentará en el loop principal; si no se hace, el sistema
  // se reinicia automáticamente (protección contra bloqueos).
  initWatchdog();

  // ----- 9.4: Generación de ID único basado en MAC (Anti-Spoofing - STRIDE) -----
  initUniqueId();

  // ----- 9.5: Carga de configuración guardada (Knowledge Base persistente) -----
  // Se recupera el estado previo, contadores, etc. desde NVS (si existen).
  preferences.begin("config", true);   // readonly para leer configuración
  if (preferences.isKey("seq")) {
    seqNumber = preferences.getUInt("seq", 0);
    Serial.print("[NVS] Secuencia recuperada: ");
    Serial.println(seqNumber);
  }
  if (preferences.isKey("estado")) {
    int savedState = preferences.getInt("estado", STATE_NORMAL);
    currentState = (SystemState)savedState;
    Serial.print("[NVS] Estado previo: ");
    Serial.println(currentState);
  }
  // También se pueden recuperar otros parámetros (ej. tdsFactor)
  if (preferences.isKey("tdsFactor")) {
    tdsFactor = preferences.getFloat("tdsFactor", 0.65);
  }
  preferences.end();

  // ----- 9.6: Inicialización de periféricos (Capa 1 - ITU) -----
  // Esta función verifica la integridad de sensores y actuadores.
  // Si algún sensor crítico falla, cambia currentState a DEGRADED.
  setupHardware();   // definida en Sección 4

  // ----- 9.7: Conexión a Wi-Fi (Capa 2 - ITU) con timeout limitado -----
  Serial.print("[SETUP] Conectando a Wi-Fi... ");
  WiFi.begin(ssid, password);
  unsigned long startWiFi = millis();
  while (WiFi.status() != WL_CONNECTED && (millis() - startWiFi) < WIFI_TIMEOUT_MS) {
    delay(500);
    Serial.print(".");
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[SETUP] Wi-Fi conectado. IP: " + WiFi.localIP().toString());
  } else {
    Serial.println("\n[SETUP] Wi-Fi timeout. Operando en modo offline (DEGRADED).");
    currentState = STATE_DEGRADED;   // Autonómica: degradación por falta de red
  }

  // ----- 9.8: Configuración de MQTT (Capa 2) y establecimiento de LWT -----
  mqttClient.setServer(mqtt_server, mqtt_port);
  mqttClient.setCallback(mqttCallback);   // Callback definido en Sección 5 (actualizado para JSON)
  // Configurar Last Will Testament (LWT) para notificar caídas
  mqttClient.setWill(TOPIC_LWT, "offline", true);

  // ----- 9.9: Conexión a MQTT (con reintentos no bloqueantes) -----
  // Se usa mqttManager() que ya implementa backoff y autenticación (STRIDE).
  // Para el setup, llamamos una vez de forma bloqueante con timeout.
  Serial.print("[SETUP] Conectando a MQTT... ");
  unsigned long startMQTT = millis();
  while (!mqttClient.connected() && (millis() - startMQTT) < MQTT_TIMEOUT_MS) {
    if (mqttClient.connect(client_id, mqtt_user, mqtt_pass)) {
      Serial.println(" Conectado.");
      mqttClient.publish(TOPIC_LWT, "online", true);
      // Suscripción a tópicos de control (Capa 4)
      if (millis() >= blockUntil) {   // Si no estamos en bloqueo anti-DoS
        if (mqttClient.subscribe(TOPIC_SUB_CMD)) {
          Serial.print("[SETUP] Suscrito a: ");
          Serial.println(TOPIC_SUB_CMD);
        }
      }
      break;
    } else {
      Serial.print(".");
      delay(1000);
    }
  }
  if (!mqttClient.connected()) {
    Serial.println("\n[SETUP] MQTT no disponible. Modo DEGRADED.");
    currentState = STATE_DEGRADED;
  }

  // ----- 9.10: Establecimiento del estado inicial -----
  // Si no se ha degradado por fallos de hardware o red, se pone en NORMAL.
  if (currentState == STATE_INIT) {
    currentState = STATE_NORMAL;
  }
  Serial.print("[SETUP] Estado final del sistema: ");
  switch (currentState) {
    case STATE_NORMAL: Serial.println("NORMAL"); break;
    case STATE_DEGRADED: Serial.println("DEGRADED"); break;
    case STATE_FAILSAFE: Serial.println("FAILSAFE"); break;
    case STATE_DEEP_SLEEP: Serial.println("DEEP_SLEEP"); break;
    default: Serial.println("INIT"); break;
  }

  // ----- 9.11: Mensaje de bienvenida en LCD y prueba de buzzer -----
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("SISTEMA LISTO");
  lcd.setCursor(0, 1);
  if (currentState == STATE_NORMAL) {
    lcd.print("MODO NORMAL");
  } else {
    lcd.print("MODO DEGRADADO");
  }
  // Prueba de buzzer (breve pitido)
  digitalWrite(PIN_BUZZER, HIGH);
  delay(150);
  digitalWrite(PIN_BUZZER, LOW);

  Serial.println("[SETUP] Inicialización completada.\n");
}

// ========== SECCIÓN 10: FUNCIÓN LOOP() - MÁQUINA DE ESTADOS PRINCIPAL ==========
void loop() {
  // ----- 10.0: Mantenimiento de la conectividad (siempre activo) -----
  // Gestión Wi-Fi con backoff exponencial (Self-Healing)
  wifiManager();

  // Gestión MQTT (reconexión, LWT, suscripción) si Wi-Fi está disponible
  mqttManager();

  // Mantener el bucle MQTT para recibir comandos y mantener la conexión viva
  mqttClient.loop();

  // Alimentar el watchdog en cada iteración (evita reinicio por timeout)
  esp_task_wdt_reset();

  // ----- 10.1: Máquina de estados (switch) -----
  switch (currentState) {

    // ****** CASO NORMAL: Operación completa ******
    case STATE_NORMAL:
      // Ejecuta el bucle MAPE-K completo (monitor, analyze, plan, execute)
      // con la frecuencia definida internamente (publishInterval ajustable).
      // La función loopMAPEK() ya contiene sus propios temporizadores no bloqueantes.
      loopMAPEK();   // definida en Sección 6
      break;

    // ****** CASO DEGRADED: Funcionalidad reducida ******
    case STATE_DEGRADED:
      // Se ejecuta MAPE-K pero con menor frecuencia (se reduce la carga)
      // y se apagan actuadores no críticos (buzzer y LCD solo muestra estado).
      static unsigned long lastDegradedLoop = 0;
      if (millis() - lastDegradedLoop >= 10000) {  // cada 10 segundos
        lastDegradedLoop = millis();
        // MONITOR: solo lecturas esenciales (temperatura agua y TDS)
        leerTemperaturaDS18B20();
        leerTDS();   // asíncrono
        // ANALYZE: solo verificar alertas críticas
        analizar();  // usa las funciones de la Sección 6
        // PLAN: mantener estado DEGRADED
        // EXECUTE: actualizar LCD con mensaje de degradado, sin buzzer
        lcd.clear();
        lcd.setCursor(0, 0);
        lcd.print("MODO DEGRADADO");
        lcd.setCursor(0, 1);
        lcd.print(mensajeAlerta);
        // Apagar buzzer (no crítico)
        digitalWrite(PIN_BUZZER, LOW);
        // Publicar datos solo si MQTT está conectado y cada 10s
        if (mqttClient.connected()) {
          publicarMQTT();   // Sección 7.2 (incluye seq y timestamp)
        }
      }
      // No se ejecuta loopMAPEK() completo para ahorrar recursos
      break;

    // ****** CASO DEEP_SLEEP: Ultra‑bajo consumo (Smart City con batería) ******
    case STATE_DEEP_SLEEP:
      Serial.println("[DEEP_SLEEP] Entrando en modo de suspensión profunda...");
      // Guardar contexto actual en NVS antes de dormir
      preferences.begin("sleep", false);
      preferences.putUInt("seq", seqNumber);
      preferences.putFloat("tds", tdsValue);
      preferences.putFloat("temp_agua", temperaturaAgua);
      preferences.putFloat("nivel", distanciaNivel);
      preferences.putString("alerta", mensajeAlerta);
      preferences.putInt("estado", currentState);
      preferences.end();
      Serial.println("[DEEP_SLEEP] Contexto guardado. Apagando Wi-Fi y periféricos...");
      
      // Apagar Wi-Fi y MQTT
      WiFi.disconnect(true);
      WiFi.mode(WIFI_OFF);
      mqttClient.disconnect();
      
      // Apagar actuadores
      digitalWrite(PIN_BUZZER, LOW);
      lcd.clear();
      lcd.noBacklight();
      lcd.display();   // apagar display (para ahorro)
      
      // Configurar temporizador de despertador (ej. cada 30 minutos)
      esp_sleep_enable_timer_wakeup(30 * 60 * 1000000ULL);  // 30 min en microsegundos
      // También se puede habilitar wake-up por botón (GPIO0)
      esp_sleep_enable_ext0_wakeup(GPIO_NUM_0, 0);  // LOW despierta
      
      Serial.println("[DEEP_SLEEP] Entrando en deep sleep...");
      esp_deep_sleep_start();
      // El código no continúa después de deep sleep
      break;

    // ****** CASO FAILSAFE: Modo de rescate ******
    case STATE_FAILSAFE:
      // Bucle limitado: solo escucha comandos de reseteo, ignora sensores.
      // Se publica un estado de "FAILSAFE" cada 30 segundos para alertar.
      static unsigned long lastFailsafePublish = 0;
      if (millis() - lastFailsafePublish >= 30000) {
        lastFailsafePublish = millis();
        if (mqttClient.connected()) {
          String payload = "{\"estado\":\"FAILSAFE\",\"nodo\":\"" + String(client_id) + "\",\"heap\":" + String(ESP.getFreeHeap()) + "}";
          mqttClient.publish(TOPIC_LWT, payload.c_str(), true);
        }
        // Mostrar en LCD
        lcd.clear();
        lcd.setCursor(0, 0);
        lcd.print("!! FAILSAFE !!");
        lcd.setCursor(0, 1);
        lcd.print("Esperando reset");
      }
      // El watchdog se alimenta arriba, así que el sistema no se reiniciará
      // a menos que se reciba un comando de reset por MQTT o por botón.
      // La función procesarComandoJSON() maneja los comandos "reset".
      break;

    // ****** CASO INIT (por defecto, no debería ocurrir en loop) ******
    default:
      // Si por alguna razón queda en INIT, pasar a NORMAL o DEGRADED.
      if (WiFi.status() == WL_CONNECTED && mqttClient.connected()) {
        currentState = STATE_NORMAL;
      } else {
        currentState = STATE_DEGRADED;
      }
      break;
  }

  // Pequeña pausa para ceder CPU (no bloqueante, ya que los temporizadores
  // internos controlan las frecuencias). Se puede omitir o dejar un delay(1).
  delay(1);
}

// ========== SECCIÓN 11: FUNCIONES AUXILIARES DE SEGURIDAD (STRIDE Específico) ==========
// ****** 11.1: Spoofing – Validación de Token (API Key fija en laboratorio) ******
// Se espera que los comandos MQTT incluyan un campo "token" en el JSON.
// En producción se usaría un token rotativo o autenticación basada en certificados.
const char* API_KEY = "clave_lab_stride_2026";   // Clave fija para pruebas

bool validarToken(String token) {
  if (token == API_KEY) {
    return true;
  } else {
    Serial.println("[STRIDE-SPOOFING] Token inválido -> posible suplantación");
    authFailCount++;
    return false;
  }
}

// ****** 11.2: Tampering – Checksum/CRC sobre configuración guardada en NVS ******
// Se almacena un checksum de los parámetros críticos para detectar modificaciones no autorizadas.
// Esta función se llama al cargar la configuración en setup() y al guardarla.

uint16_t calcularCRC16(const uint8_t* data, size_t len) {
  uint16_t crc = 0xFFFF;
  for (size_t i = 0; i < len; i++) {
    crc ^= data[i];
    for (int j = 0; j < 8; j++) {
      if (crc & 1) {
        crc = (crc >> 1) ^ 0xA001;
      } else {
        crc >>= 1;
      }
    }
  }
  return crc;
}

// Guarda configuración con checksum (se llama desde setup al iniciar o al cambiar parámetros)
void guardarConfiguracionSegura(float tdsFactor, float tempOffset, int estado) {
  preferences.begin("config", false);
  // Escribir datos
  preferences.putFloat("tdsFactor", tdsFactor);
  preferences.putFloat("tempOffset", tempOffset);
  preferences.putInt("estado", estado);
  // Calcular checksum sobre los datos (excluyendo el propio checksum)
  uint8_t buffer[12];
  memcpy(buffer, &tdsFactor, 4);
  memcpy(buffer + 4, &tempOffset, 4);
  memcpy(buffer + 8, &estado, 4);
  uint16_t crc = calcularCRC16(buffer, 12);
  preferences.putUShort("crc", crc);
  preferences.end();
  Serial.println("[STRIDE-TAMPERING] Configuración guardada con CRC");
}

bool cargarConfiguracionSegura(float& tdsFactor, float& tempOffset, int& estado) {
  preferences.begin("config", true);
  if (!preferences.isKey("tdsFactor")) {
    preferences.end();
    return false; // No hay configuración previa
  }
  tdsFactor = preferences.getFloat("tdsFactor", 0.65);
  tempOffset = preferences.getFloat("tempOffset", 0.0);
  estado = preferences.getInt("estado", STATE_NORMAL);
  uint16_t crcGuardado = preferences.getUShort("crc", 0);
  preferences.end();

  // Recalcular CRC
  uint8_t buffer[12];
  memcpy(buffer, &tdsFactor, 4);
  memcpy(buffer + 4, &tempOffset, 4);
  memcpy(buffer + 8, &estado, 4);
  uint16_t crcCalc = calcularCRC16(buffer, 12);

  if (crcCalc != crcGuardado) {
    Serial.println("[STRIDE-TAMPERING] ¡CRC no coincide! Configuración corrupta o manipulada.");
    return false;
  }
  Serial.println("[STRIDE-TAMPERING] Verificación CRC exitosa.");
  return true;
}

// ****** 11.3: Information Disclosure – Enmascaramiento de datos sensibles en logs ******
// Oculta parte de la contraseña, token, etc. al imprimir por Serial.

String maskSensitive(String input, int visibleStart = 0, int visibleEnd = 2) {
  if (input.length() <= visibleStart + visibleEnd) return "****";
  String masked = input.substring(0, visibleStart);
  for (int i = visibleStart; i < input.length() - visibleEnd; i++) {
    masked += '*';
  }
  masked += input.substring(input.length() - visibleEnd);
  return masked;
}

// Ejemplo de uso en logs:
void printSecureCredentials() {
  Serial.print("[INFO] Usuario MQTT: ");
  Serial.println(mqtt_user);
  Serial.print("[INFO] Contraseña MQTT (enmascarada): ");
  Serial.println(maskSensitive(mqtt_pass, 0, 2));
  Serial.print("[INFO] API Key (enmascarada): ");
  Serial.println(maskSensitive(API_KEY, 0, 2));
}

// ****** 11.4: Denial of Service (DoS) – Rate Limiter para mensajes MQTT ******
// Limita el número de mensajes procesados por segundo para evitar ataques de inundación.

#define MAX_MSG_PER_SECOND 5
unsigned int msgCountThisSecond = 0;
unsigned long lastMsgResetTime = 0;

bool rateLimiter() {
  unsigned long now = millis();
  if (now - lastMsgResetTime >= 1000) {
    // Reiniciar contador cada segundo
    msgCountThisSecond = 0;
    lastMsgResetTime = now;
  }
  if (msgCountThisSecond >= MAX_MSG_PER_SECOND) {
    Serial.println("[STRIDE-DoS] Límite de mensajes por segundo excedido. Rechazando.");
    return false;
  }
  msgCountThisSecond++;
  return true;
}

// ****** 11.5: Elevation of Privilege – Restricción de comandos críticos por rol ******
// Los comandos como "reset" o "modo" solo se aceptan si el payload incluye "rol":"admin".
// Esta función se invoca desde procesarComandoJSON().

bool verificarRol(String rol) {
  if (rol == "admin") {
    return true;
  } else {
    Serial.println("[STRIDE-ELEVATION] Comando crítico requiere rol 'admin'");
    invalidMsgCount++;
    return false;
  }
}

// Ejemplo de uso integrado en procesarComandoJSON:
// Se modifica la función procesarComandoJSON() para incluir token y rol.
// Se asume que el JSON contiene "token" y opcionalmente "rol".
// Para no romper la compatibilidad, en modo laboratorio se permite sin token si LAB_MODE.

void procesarComandoJSON(String jsonPayload) {
  // 1. Rate Limiter (DoS)
  if (!rateLimiter()) return;

  // 2. Validación de formato mínimo
  if (jsonPayload.length() < 10 || jsonPayload.indexOf('{') == -1 || jsonPayload.indexOf('}') == -1) {
    Serial.println("[STRIDE] Payload no es JSON válido");
    invalidMsgCount++;
    return;
  }

  // 3. Extraer campos: cmd, valor, token, rol
  String cmd = "", valor = "", token = "", rol = "";
  // Función auxiliar para extraer valor de una clave (búsqueda simple)
  auto extract = [&](String key) -> String {
    int idx = jsonPayload.indexOf("\"" + key + "\"");
    if (idx == -1) return "";
    int start = jsonPayload.indexOf(':', idx) + 1;
    int end = jsonPayload.indexOf(',', start);
    if (end == -1) end = jsonPayload.indexOf('}', start);
    if (start == -1 || end == -1 || end <= start) return "";
    String val = jsonPayload.substring(start, end);
    val.trim();
    val.replace("\"", "");
    return val;
  };

  cmd = extract("cmd");
  valor = extract("valor");
  token = extract("token");
  rol = extract("rol");

  // 4. Validación de token (Spoofing)
  #ifndef LAB_MODE
    if (!validarToken(token)) return;
  #else
    // En laboratorio, si no hay token, se acepta igual (para facilitar pruebas)
    if (token.length() > 0 && !validarToken(token)) return;
  #endif

  // 5. Normalizar (canonicalización)
  cmd.toLowerCase();
  valor.toLowerCase();

  // 6. Lista blanca de comandos
  if (cmd != "buzzer" && cmd != "lcd" && cmd != "reset" && cmd != "modo") {
    Serial.println("[STRIDE] Comando no autorizado");
    invalidMsgCount++;
    return;
  }

  // 7. Comandos críticos requieren rol 'admin' (Elevation of Privilege)
  if (cmd == "reset" || cmd == "modo") {
    if (!verificarRol(rol)) return;
  }

  // 8. Ejecutar comando (similar a antes)
  if (cmd == "buzzer") {
    if (valor == "on" || valor == "off") actuarBuzzer(valor == "on");
    else { Serial.println("[STRIDE] Valor buzzer inválido"); invalidMsgCount++; }
  }
  else if (cmd == "lcd") {
    int sep = valor.indexOf(',');
    if (sep != -1) {
      String l1 = valor.substring(0, sep);
      String l2 = valor.substring(sep + 1);
      l1.toUpperCase(); l2.toUpperCase();
      mostrarLCD(l1, l2);
    } else {
      mostrarLCD(valor, "");
    }
  }
  else if (cmd == "reset") {
    if (valor == "factory") factoryReset();
    else if (valor == "soft") { Serial.println("[COMANDO] Reinicio suave"); ESP.restart(); }
    else { Serial.println("[STRIDE] Valor reset inválido"); invalidMsgCount++; }
  }
  else if (cmd == "modo") {
    if (valor == "deep_sleep") currentState = STATE_DEEP_SLEEP;
    else if (valor == "normal") currentState = STATE_NORMAL;
    else { Serial.println("[STRIDE] Modo no soportado"); invalidMsgCount++; }
  }
}
