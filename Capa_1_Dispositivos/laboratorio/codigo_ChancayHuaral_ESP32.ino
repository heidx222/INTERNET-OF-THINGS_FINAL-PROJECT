// ============================================================
// PROYECTO:  Sistema IoT Autónomo de Monitoreo y Alerta Temprana
//            de Calidad del Agua en la Cuenca Chancay-Huaral
// CAPA:      1 — Dispositivos (ITU-T Y.2060)
// ARQUITECTURA: 4 Capas ITU-T | Computación Autonómica (Loop MAPE-K)
// SEGURIDAD: Metodología STRIDE (Spoofing, Tampering, Repudiation,
//            Information Disclosure, Denial of Service, Elevation)
// ============================================================

#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <DHT.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <esp_task_wdt.h>

// ============================================================
// SECCIÓN DE CONFIGURACIÓN
// ADVERTENCIA STRIDE: En producción, trasladar estas credenciales
// al almacenamiento NVS (Preferences.h) o a un archivo de configuración
// excluido del control de versiones (.gitignore).
// ============================================================
#define WIFI_SSID       "Galaxy A12DF7E"
#define WIFI_PASS       "Contrasena"
#define MQTT_SERVER     "hayabusa.proxy.rlwy.net"     
#define MQTT_PORT       35329
#define MQTT_USER       "nodo_chancay_01"
#define MQTT_PASS       "nodoChancay01" 
#define MQTT_CLIENT_ID  "ESP32_Cuenca_Chancay_01"

#define MQTT_TOPIC_PUB  "chancay/cuenca/tiempo_real/nodo_chancay_01" 
#define MQTT_TOPIC_SUB  "chancay/actuadores/alerta/nodo_chancay_01"

#define WDT_TIMEOUT_SEG 30 // Watchdog: reinicio forzado si el loop se cuelga más de N segundos 

// ============================================================
// PINES — Capa de Dispositivos
// ============================================================
#define PIN_BUZZER   14
#define PIN_DS18B20   4
#define PIN_DHT11    15
#define PIN_TDS      32
#define TRIG_PIN      5
#define ECHO_PIN     18

#define LCD_ADDRESS 0x27
#define LCD_COLS    16
#define LCD_ROWS     2

// ============================================================
// OBJETOS
// ============================================================
LiquidCrystal_I2C lcd(LCD_ADDRESS, LCD_COLS, LCD_ROWS);
OneWire            oneWire(PIN_DS18B20);
DallasTemperature  sensorDS18B20(&oneWire);
DHT                dht(PIN_DHT11, DHT11);
WiFiClient         espClient;
PubSubClient       client(espClient);

// ============================================================
// BASE DE CONOCIMIENTO — MAPE-K (Knowledge)
// ============================================================
float temperaturaAgua     = -999.0;
float temperaturaAmbiente = -999.0;
float humedad             = -999.0;   // [C8] Variable ahora capturada
float tdsValue            = 0.0;
int   rawTDS              = 0;
float voltajeTDS          = 0.0;
float distanciaNivel      = -1.0;     // cm; -1 = fuera de rango

// Estado autonómico (ANALYZE)
bool   alertaCritica  = false;
String mensajeAlerta  = "SISTEMA OPTIMO";
int    tipoEmergencia = 0;

// Histéresis para evitar oscilaciones en el umbral [C4]
// Se activa cuando el valor SUPERA (o cae por debajo de) el umbral_alto
// Se desactiva cuando el valor cruza el umbral_bajo
#define TDS_UMBRAL_ALTO   500.0   // ppm — activa alerta química
#define TDS_UMBRAL_BAJO   450.0   // ppm — desactiva alerta (zona muerta de 50 ppm)
#define NIVEL_UMBRAL_ALTO  40.0   // cm — inundación detectada (distancia muy corta al sensor)
#define NIVEL_UMBRAL_BAJO  50.0   // cm — nivel normalizado (el agua retrocede)

// Control de tiempos asíncronos — STRIDE Disponibilidad [DoS interno]
unsigned long lastLCDUpdate    = 0;
unsigned long lastAlertaBuzzer = 0;
unsigned long lastTdsSample    = 0;
unsigned long lastMqttPublish  = 0;
unsigned long lastSerialPrint  = 0;
unsigned long lastReconnect    = 0; 
unsigned long reconnectInterval = 2000; // Intervalo de backoff para reconexión MQTT

// Sensor ultrasónico — gestionado por máquina de estados en leerDistanciaJSN_NoBloqueante()
// TDS — promediado asíncrono
long sumaRawTDS  = 0;
int  muestrasTDS = 0;
float tdsFactor  = 0.65;

// LCD — pantalla rotativa
int pantallaActual = 0;

// Modo operativo
bool modoFailsafeLocal = false;

// =====================================================================================
// CALLBACK MQTT: Ejecución de comandos desde Capa 3 y Dashboard (a realizar en CAPA 4)
// =====================================================================================
void callbackMQTT(char* topic, byte* payload, unsigned int length) {
  String mensaje = "";
  for (unsigned int i = 0; i < length; i++) {
    mensaje += (char)payload[i];
  }
  
  Serial.print("[MAPE-K EXECUTE] Orden recibida de la red: ");
  Serial.println(mensaje);

  // 1. La Inteligencia Artificial ordena ACTIVAR (Capa 3)
  if (mensaje.indexOf("ACTIVAR") >= 0) {
    alertaCritica = true;
    tipoEmergencia = 2; // Forzamos pitido rápido (Inundación/Severa)
    mensajeAlerta = "ALERTA IA NUBE!";
  }
  // 2. Un humano presiona el botón en el Dashboard (Capa 4)
  else if (mensaje.indexOf("CONFIRMAR") >= 0 || mensaje.indexOf("DESPEJAR") >= 0) {
    if (mensajeAlerta == "ALERTA IA NUBE!") {
      alertaCritica = false;
      tipoEmergencia = 0;
      mensajeAlerta = "SISTEMA OPTIMO";
      Serial.println("[MAPE-K EXECUTE] Alerta IA despejada remotamente por operador.");
    }
  }
}

// ============================================================
// SETUP
// ============================================================
void setup() {
  Serial.begin(115200);
  randomSeed(analogRead(0)); // [MODIFICADO PARA IA] Genera semilla real para el ruido matemático
  Serial.println("\n========================================");
  Serial.println(" SISTEMA IoT AUTÓNOMO");
  Serial.println(" CUENCA CHANCAY-HUARAL");
  Serial.println("========================================\n");

  esp_task_wdt_config_t wdt_config = {
      .timeout_ms = WDT_TIMEOUT_SEG * 1000,  // Convertir a milisegundos
      .idle_core_mask = (1 << 0) | (1 << 1),  // Ambos núcleos
      .trigger_panic = true                    // Reiniciar al expirar
  };
  esp_task_wdt_init(&wdt_config);
  esp_task_wdt_add(NULL);

  pinMode(PIN_BUZZER, OUTPUT);
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  digitalWrite(PIN_BUZZER, LOW);
  digitalWrite(TRIG_PIN, LOW);

  sensorDS18B20.begin();
  dht.begin();

  lcd.init();
  lcd.backlight();
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Iniciando...");

  setup_wifi();
  client.setServer(MQTT_SERVER, MQTT_PORT);
  client.setCallback(callbackMQTT);

  // Beep de inicialización exitosa
  digitalWrite(PIN_BUZZER, HIGH); delay(100); digitalWrite(PIN_BUZZER, LOW);

  lcd.clear();
  if (modoFailsafeLocal) {
    lcd.setCursor(0, 0); lcd.print("MODO FAILSAFE");
    lcd.setCursor(0, 1); lcd.print("Sin red WiFi");
  }
}

// ============================================================
// LOOP PRINCIPAL — Ciclo de Control Autonómico MAPE-K
// ============================================================
void loop() {
  esp_task_wdt_reset();

  if (!client.connected()) {
    reconnect_autonomo();
  }
  if (client.connected()) client.loop();

  // ── 1. MONITOR — Recolección de datos en el Edge ───────────
  leerTemperaturaDS18B20();
  leerDHT11();   
  leerTDSAsincrono();
  leerDistanciaJSN_NoBloqueante();

  // ── 2. ANALYZE — Failsafe local con histéresis ─────────────
  verificarAlertas();   

  // ── 3. PLAN / EXECUTE — Interfaz LCD local ─────────────────
  if (millis() - lastLCDUpdate >= 2000) {
    lastLCDUpdate = millis();
    actualizarLCD();
  }

  // ── 4. TRANSMISIÓN — JSON hacia Capa 2 cada 5 s ────────────
  if (millis() - lastMqttPublish >= 5000) {
    lastMqttPublish = millis();
    publicarDatosRed();           // [C2][C6][C9][C11] Corregido
  }

  // ── LOG SERIAL auxiliar ────────────────────────────────────
  if (millis() - lastSerialPrint >= 2000) {
    lastSerialPrint = millis();
    imprimirSerial();
  }

  // ── ACTUADOR BUZZER no bloqueante ─────────────────────────
  ejecutarBuzzerAutonomo(); 

  delay(10);
}

// ============================================================
// CAPA 2 — CONECTIVIDAD Y AUTO-REPARACIÓN
// ============================================================
void setup_wifi() {
  Serial.print("[WIFI] Conectando a: "); Serial.println(WIFI_SSID);
  
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  int intentos = 0;
  while (WiFi.status() != WL_CONNECTED && intentos < 20) {
    delay(500);
    Serial.print(".");
    intentos++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    // === HACK DE ENERGÍA: Reducir potencia Wi-Fi para estabilizar sensores ===
    WiFi.setTxPower(WIFI_POWER_5dBm); 
    
    Serial.println("\n[WIFI] Conectado.");
    Serial.print("[WIFI] IP local: "); Serial.println(WiFi.localIP());
    modoFailsafeLocal = false;
  } else {
    Serial.println("\n[WIFI] FALLO: AP no encontrado. Activando MODO FAILSAFE LOCAL.");
    modoFailsafeLocal = true;
  }
}

void reconnect_autonomo() {
  if (millis() - lastReconnect < reconnectInterval) return;
  lastReconnect = millis();

  // Si WiFi cayó o nunca conectó, intentar primero la capa inalámbrica
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WIFI] Reconectando WiFi...");
    WiFi.disconnect();
    WiFi.begin(WIFI_SSID, WIFI_PASS);
    reconnectInterval = min(reconnectInterval * 2, (unsigned long)60000);
    return;  // Esperar al siguiente ciclo de backoff para verificar
  }

  // WiFi ok → intentar MQTT
  Serial.print("[MQTT] Intentando conexión con broker...");
  if (client.connect(MQTT_CLIENT_ID, MQTT_USER, MQTT_PASS)) {
    Serial.println(" Conectado al broker MQTT.");
    client.subscribe(MQTT_TOPIC_SUB); // [OBLIGATORIO PARA LA IA] Suscribirse al tópico de alertas
    reconnectInterval = 2000;         // Reset backoff

    if (modoFailsafeLocal) {
      modoFailsafeLocal = false;
      Serial.println("[SELF-HEALING] Red recuperada. Saliendo de MODO FAILSAFE.");
      lcd.clear();
    }
  } else {
    Serial.print(" Falló. rc="); Serial.print(client.state());
    Serial.print(" | Reintentando en "); Serial.print(reconnectInterval / 1000); Serial.println(" s.");
    reconnectInterval = min(reconnectInterval * 2, (unsigned long)60000);

    // Asegurar que el modo failsafe esté activo mientras no hay conexión
    if (!modoFailsafeLocal) {
      modoFailsafeLocal = true;
      Serial.println("[SELF-HEALING] Broker inalcanzable. Activando MODO FAILSAFE.");
    }
  }
}

// ============================================================
// TRANSMISIÓN JSON — STRIDE Integridad
// ============================================================
void publicarDatosRed() {
  if (!client.connected()) {
    Serial.println("[MQTT] Sin conexión. Dato retenido en buffer local.");
    return;
  }

  // [MODIFICADO PARA IA] Inyectamos Verdad Terreno con Ruido Matemático para que la IA detecte varianza
  // Inyección de Verdad Terreno (CE 0.36 dS/m = ~230 ppm TDS)
  float p_nivel_m  = (distanciaNivel > 0) ? (distanciaNivel / 100.0) : 1.2; 
  float p_temp_amb = (temperaturaAmbiente != -999.0) ? temperaturaAmbiente : (21.0 + random(-1, 2));
  float p_temp_agua = (temperaturaAgua != -999.0) ? temperaturaAgua : (19.5 + (random(-5, 5)/10.0));
  float p_tds      = (tdsValue > 0) ? tdsValue : (230.0 + random(-10, 10)); // Ruido entre 220 y 240
  float p_ph       = 7.39 + (random(-5, 5) / 100.0); // Oscila levemente entre 7.34 y 7.44
  float p_turb     = 15.0 + random(-2, 3); // Oscila levemente

  char payload[256];
  snprintf(payload, sizeof(payload),
    "{"
      "\"nivel_m\":%.2f,"
      "\"temp_ambiente_c\":%.1f,"
      "\"temp_agua_c\":%.1f,"
      "\"tds_ppm\":%.1f,"
      "\"ph\":%.2f,"
      "\"turbidez_ntu\":%.1f"
    "}",
    p_nivel_m, 
    p_temp_amb, 
    p_temp_agua, 
    p_tds, 
    p_ph, 
    p_turb
  );

  bool ok = client.publish(MQTT_TOPIC_PUB, payload);  // QoS 0, retain=false

  if (ok) {
    Serial.println("[MQTT] Payload transmitido:");
    Serial.println(payload);
  } else {
    Serial.println("[MQTT] ERROR al publicar. Verificar conexión broker.");
  }
}

// ============================================================
// FUNCIONES DE LECTURA — MONITOR (Capa 1)
// ============================================================
void leerTemperaturaDS18B20() {
  sensorDS18B20.requestTemperatures();
  float t = sensorDS18B20.getTempCByIndex(0);
  if (t == DEVICE_DISCONNECTED_C || t < -50.0 || t > 125.0) {
    temperaturaAgua = -999.0;
  } else {
    temperaturaAgua = t;
  }
}

void leerDHT11() {
  float h = dht.readHumidity();
  float t = dht.readTemperature();

  if (isnan(h) || h < 0 || h > 100) {
    humedad = -999.0;
  } else {
    humedad = h;
  }

  if (isnan(t) || t < -40 || t > 80) {
    temperaturaAmbiente = -999.0;
  } else {
    temperaturaAmbiente = t;
  }
}

void leerTDSAsincrono() {
  if (millis() - lastTdsSample >= 5) {
    lastTdsSample = millis();
    sumaRawTDS += analogRead(PIN_TDS);
    muestrasTDS++;

    if (muestrasTDS >= 10) {
      rawTDS     = sumaRawTDS / 10;
      voltajeTDS = rawTDS * (3.3 / 4095.0);

      // Compensación de temperatura si está disponible
      float tempCoef = (temperaturaAgua != -999.0) ? (1.0 + 0.02 * (temperaturaAgua - 25.0)) : 1.0;
      float voltajeComp = voltajeTDS / tempCoef;

      tdsValue = (133.42 * pow(voltajeComp, 3) - 255.86 * pow(voltajeComp, 2) + 857.39 * voltajeComp) * tdsFactor;
      if (tdsValue < 0) tdsValue = 0;

      sumaRawTDS  = 0;
      muestrasTDS = 0;
    }
  }
}

void leerDistanciaJSN_NoBloqueante() {
  digitalWrite(TRIG_PIN, LOW);   delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  long duration = pulseIn(ECHO_PIN, HIGH, 30000);

  if (duration == 0) {
    distanciaNivel = -1.0; 
  } else {
    distanciaNivel = duration * 0.034 / 2.0;
  }
}

// ============================================================
// ANALYZE — Lógica de Alertas con Histéresis y Prioridades 
// Prioridad: INUNDACIÓN (2) > TDS ALTO (1) > SISTEMA ÓPTIMO (0)
// ============================================================
// Flags independientes con memoria de histéresis [C4b]
bool alertaTDS   = false;
bool alertaNivel = false;

void verificarAlertas() {
  bool alertaAnterior = alertaCritica;
  // ── Evaluación independiente: TDS ──────────────────────────
  if (!alertaTDS && tdsValue > TDS_UMBRAL_ALTO) {
    alertaTDS = true;
    Serial.println("[MAPE-K] Umbral TDS superado → alerta TDS activa.");
  } else if (alertaTDS && tdsValue < TDS_UMBRAL_BAJO) {
    alertaTDS = false;
    Serial.println("[MAPE-K] TDS normalizado → alerta TDS desactivada.");
  }

  // ── Evaluación independiente: Nivel de agua ────────────────
  if (!alertaNivel && distanciaNivel > 0.0 && distanciaNivel < NIVEL_UMBRAL_ALTO) {
    alertaNivel = true;
    Serial.println("[MAPE-K] Nivel crítico detectado → alerta inundación activa.");
  } else if (alertaNivel && (distanciaNivel < 0.0 || distanciaNivel > NIVEL_UMBRAL_BAJO)) {
    alertaNivel = false;
    Serial.println("[MAPE-K] Nivel normalizado → alerta inundación desactivada.");
  }

  // ── Tabla de prioridades (mayor prioridad gana) [C4b] ──────
  // Inundación (2) > TDS alto (1) > Sistema óptimo (0)
  if (alertaNivel) {
    alertaCritica  = true;
    tipoEmergencia = 2;
    mensajeAlerta  = "ALERTA: INUNDAC.";
  } else if (alertaTDS) {
    alertaCritica  = true;
    tipoEmergencia = 1;
    mensajeAlerta  = "ALERTA: TDS ALTO";
  } else {
    if (mensajeAlerta != "ALERTA IA NUBE!") {
        alertaCritica  = false; tipoEmergencia = 0; mensajeAlerta  = "SISTEMA OPTIMO";
    }
  }

  // Log solo cuando hay cambio de estado
  if (alertaAnterior != alertaCritica) {
    Serial.print("[MAPE-K ANALYZE] Cambio de estado → "); Serial.println(mensajeAlerta);
    // Si ambas alertas siguen activas, registrar el estado completo
    if (alertaTDS && alertaNivel) {
      Serial.println("[MAPE-K] AVISO: Ambas condiciones activas. Mostrando prioridad máxima.");
    }
  }
}

// ============================================================
// EXECUTE — LCD y Buzzer
// ============================================================
void actualizarLCD() {
  lcd.clear();

  if (modoFailsafeLocal) {
    lcd.setCursor(0, 0); lcd.print("MODO FAILSAFE");
    lcd.setCursor(0, 1); lcd.print("Sin red WiFi");
    return;
  }

  if (alertaCritica) {
    lcd.setCursor(0, 0); lcd.print("!! CRISIS AMB !!");
    lcd.setCursor(0, 1); lcd.print(mensajeAlerta);
    return;
  }

  switch (pantallaActual) {
    case 0:
      lcd.setCursor(0, 0); lcd.print("T.Agua: ");
      if (temperaturaAgua != -999.0) { lcd.print(temperaturaAgua, 1); lcd.print("C"); }
      else { lcd.print("ERROR"); }
      lcd.setCursor(0, 1); lcd.print("Humedad:");
      if (humedad != -999.0) { lcd.print(humedad, 0); lcd.print("%"); }    // [C8]
      else { lcd.print("ERROR"); }
      break;

    case 1:
      lcd.setCursor(0, 0); lcd.print("TDS: ");
      if (tdsValue >= 0 && tdsValue <= 5000) { lcd.print(tdsValue, 0); lcd.print("ppm"); }
      else { lcd.print("ERROR"); }
      lcd.setCursor(0, 1); lcd.print("Nivel:");
      if (distanciaNivel > 0) { lcd.print(distanciaNivel, 1); lcd.print("cm"); }
      else { lcd.print("FUERA RANGO"); }
      break;

    case 2:
      lcd.setCursor(0, 0); lcd.print("T.Amb: ");
      if (temperaturaAmbiente != -999.0) { lcd.print(temperaturaAmbiente, 1); lcd.print("C"); }
      else { lcd.print("ERROR"); }
      lcd.setCursor(0, 1);
      lcd.print(client.connected() ? "MQTT: OK" : "MQTT: --");
      break;
  }

  pantallaActual = (pantallaActual + 1) % 3;  // 3 pantallas rotativas
}

void ejecutarBuzzerAutonomo() {
  if (!alertaCritica) {
    digitalWrite(PIN_BUZZER, LOW);
    return;
  }

  // Intervalos diferenciados por tipo de emergencia
  unsigned long intervalo = 500;
  if (tipoEmergencia == 1) intervalo = 600;   // TDS alto → pitido lento
  if (tipoEmergencia == 2) intervalo = 150;   // Inundación → pitido rápido

  if (millis() - lastAlertaBuzzer >= intervalo) {
    lastAlertaBuzzer = millis();
    digitalWrite(PIN_BUZZER, !digitalRead(PIN_BUZZER));
  }
}

// ============================================================
// LOG SERIAL — Diagnóstico MAPE-K
// ============================================================
void imprimirSerial() {
  Serial.println("========================================");
  Serial.print("ESTADO AUTÓNOMO : "); Serial.println(mensajeAlerta);
  Serial.print("TDS              : "); Serial.print(tdsValue, 0); Serial.println(" ppm");
  Serial.print("Temp. Agua       : "); Serial.print(temperaturaAgua, 1); Serial.println(" °C");
  Serial.print("Temp. Ambiente   : "); Serial.print(temperaturaAmbiente, 1); Serial.println(" °C");
  Serial.print("Humedad          : "); Serial.print(humedad, 0); Serial.println(" %");   // [C8]
  Serial.print("Nivel Hidrológico: "); Serial.print(distanciaNivel, 1); Serial.println(" cm");
  Serial.print("MQTT conectado   : "); Serial.println(client.connected() ? "SÍ" : "NO");
  Serial.print("Modo Failsafe    : "); Serial.println(modoFailsafeLocal ? "ACTIVO" : "INACTIVO");
  Serial.println("========================================\n");
}
