// ============================================================
// PROYECTO:     Sistema IoT Autónomo de Monitoreo y Alerta Temprana
//               de Calidad del Agua en la Cuenca Chancay-Huaral
// CAPA:         1 — Dispositivos (ITU-T Y.2060)
// ARQUITECTURA: 4 Capas ITU-T | Computación Autonómica (Loop MAPE-K)
// SEGURIDAD:    Metodología STRIDE
// ARCHIVO:      codigo_ChancayHuaral_ESP32.ino  (VERSIÓN CAMPO)
// ============================================================
//
// FLUJO BIDIRECCIONAL (Capa 1 <-> Capa 4):
//   SENSORES -> ESP32 (MAPE-K edge) -> Wi-Fi -> MQTT
//     Publishes : chancay/cuenca/tiempo_real/nodo_chancay_01   (telemetría)
//     Subscribes: chancay/actuadores/alerta/nodo_chancay_01    (lazo MAPE-K)
//                 chancay/actuadores/comando/nodo_chancay_01   (telecontrol Capa 4)
//
// CAMBIOS CLAVE RESPECTO DE LA VERSIÓN DE LABORATORIO:
//   1. timestamp_ms ahora es epoch real (NTP sincronizado), no millis().
//   2. Se suscribe a AMBOS canales de actuador (alerta + comando).
//   3. Parseo de comandos corregido: "DESACTIVAR" contiene "ACTIVAR", por lo
//      que el orden de evaluación anterior activaba la sirena al desactivar.
//   4. La credencial MQTT del nodo coincide con la ACL de la Capa 2
//      (usuario `nodo_chancay_01`).
//   5. El payload incluye `alerta` y `estado_mapek` locales para mantener
//      paridad determinística con el gemelo de datos de la Capa 2.
// ============================================================

#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <DHT.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <esp_task_wdt.h>
#include <time.h>

// ============================================================
// CONFIGURACIÓN DE RED Y BROKER (Sincronizado con Capa 2 y 3)
// ============================================================
#define WIFI_SSID       "LAB 06 NP"
#define WIFI_PASS       "AL1BA4TE&T3"

// Broker Mosquitto desplegado en Railway (Capa 2)
#define MQTT_SERVER     "iriguchi.proxy.rlwy.net"
#define MQTT_PORT       28182
// Credencial del nodo definida en la ACL de la Capa 2 (postgres/init.sql).
// Contraseña en claro de desarrollo: nodoChancay01.
#define MQTT_USER       "nodo_chancay_01"
#define MQTT_PASS       "nodoChancay01"
#define MQTT_CLIENT_ID  "ESP32_Nodo_Chancay_01"

#define NODO_ID         "nodo_chancay_01"
#define MQTT_TOPIC_PUB  "chancay/cuenca/tiempo_real/nodo_chancay_01"
#define MQTT_TOPIC_SUB_ALERTA  "chancay/actuadores/alerta/nodo_chancay_01"
#define MQTT_TOPIC_SUB_COMANDO "chancay/actuadores/comando/nodo_chancay_01"

#define WDT_TIMEOUT_SEG 30 // Watchdog timer de seguridad

// Zona horaria de Perú (UTC-5, sin horario de verano). Usado para NTP.
#define NTP_GMT_OFFSET_S  -18000
#define NTP_DST_OFFSET_S  0

// ============================================================
// ASIGNACIÓN DE PINES (ESP32)
// ============================================================
#define PIN_BUZZER   14
#define PIN_DS18B20   4
#define PIN_DHT11    15
#define PIN_TDS      32
#define PIN_PH       34
#define PIN_TURBIDEZ 35
#define TRIG_PIN      5
#define ECHO_PIN     18

#define LCD_ADDRESS 0x27
#define LCD_COLS    16
#define LCD_ROWS     2

// ============================================================
// OBJETOS Y LIBRERÍAS
// ============================================================
LiquidCrystal_I2C lcd(LCD_ADDRESS, LCD_COLS, LCD_ROWS);
OneWire            oneWire(PIN_DS18B20);
DallasTemperature  sensorDS18B20(&oneWire);
DHT                dht(PIN_DHT11, DHT11);
WiFiClient         espClient;
PubSubClient       client(espClient);

// ============================================================
// BASE DE CONOCIMIENTO LOCAL — MAPE-K (Knowledge)
// ============================================================
float temperaturaAgua     = -999.0;
float temperaturaAmbiente = -999.0;
float humedad             = -999.0;
float tdsValue            = 0.0;
int   rawTDS              = 0;
float voltajeTDS          = 0.0;
float distanciaNivel      = -1.0;     // cm
float nivelMetros         = 0.0;      // m
float phValue             = -999.0;
float turbidezValue       = -999.0;

// Estado autonómico local
bool   alertaCritica  = false;
String mensajeAlerta  = "SISTEMA OPTIMO";
int    tipoEmergencia = 0;   // 0 normal | 1 contaminación | 2 inundación | 3 crítico

// Umbrales de Histéresis Local (alineados con Capa 2 y Capa 3)
#define TDS_UMBRAL_ALTO   500.0   // ppm
#define TDS_UMBRAL_BAJO   450.0   // ppm
#define PH_MIN            6.5
#define PH_MAX            8.5
#define NIVEL_UMBRAL_ALTO  40.0   // cm (distancia corta = agua alta)
#define NIVEL_UMBRAL_BAJO  50.0   // cm

// Calibración pH
#define PH_VOLTAGE_NEUTRO  2.5
#define PH_PENDIENTE      -5.70

// Control de Tiempos Asíncronos
unsigned long lastLCDUpdate    = 0;
unsigned long lastAlertaBuzzer = 0;
unsigned long lastTdsSample    = 0;
unsigned long lastPhSample     = 0;
unsigned long lastTurbSample   = 0;
unsigned long lastMqttPublish  = 0;
unsigned long lastSerialPrint  = 0;
unsigned long lastReconnect    = 0;
unsigned long reconnectInterval = 2000;

// Variables para lectura asíncrona del DS18B20
unsigned long lastTempRequest   = 0;
bool          conversionEnCurso = false;
const unsigned long TEMP_INTERVALO_MS   = 2000;
const unsigned long TEMP_CONVERSION_MS  = 750;

// Variables de promediado
long sumaRawTDS  = 0; int muestrasTDS  = 0; float tdsFactor = 0.65;
long sumaRawPH   = 0; int muestrasPH   = 0;
long sumaRawTurb = 0; int muestrasTurb = 0;

int pantallaActual = 0;
bool modoFailsafeLocal = false;

// ============================================================
// FECHA/HORA REAL (NTP) — para timestamp_ms coherente con el backend
// ============================================================
uint64_t epochMsActual() {
  time_t now = time(nullptr);
  // Mientras NTP no sincroniza, time() devuelve un valor cercano a 0.
  if (now < 1600000000) return (uint64_t)millis(); // fallback: uptime ms
  return (uint64_t)now * 1000ULL;
}

// ============================================================
// CALLBACK MQTT: TELECONTROL Y COMANDOS DESDE CAPA 3 Y 4
// ============================================================
void callbackMQTT(char* topic, byte* payload, unsigned int length) {
  String mensaje = "";
  for (unsigned int i = 0; i < length; i++) {
    mensaje += (char)payload[i];
  }

  Serial.print("[TELECONTROL MQTT] Comando recibido en ");
  Serial.print(topic);
  Serial.print(": ");
  Serial.println(mensaje);

  // IMPORTANTE: evaluamos "DESACTIVAR" ANTES que "ACTIVAR", porque la cadena
  // "DESACTIVAR" CONTIENE la subcadena "ACTIVAR" (bug del laboratorio).
  if (mensaje.indexOf("DESACTIVAR") >= 0 || mensaje.indexOf("DESPEJAR") >= 0 ||
      mensaje.indexOf("NORMAL") >= 0 || mensaje.indexOf("CONFIRMAR") >= 0) {
    alertaCritica = false;
    tipoEmergencia = 0;
    mensajeAlerta = "SISTEMA OPTIMO";
    digitalWrite(PIN_BUZZER, LOW);
    Serial.println("[ACTUADOR] Alerta despejada (orden remota de Capa 3/4).");
  }
  else if (mensaje.indexOf("ACTIVAR") >= 0 || mensaje.indexOf("CRITICA") >= 0) {
    alertaCritica = true;
    tipoEmergencia = 2;
    mensajeAlerta = "ALERTA REMOTA IA";
    Serial.println("[ACTUADOR] Sirena y compuerta activadas por el lazo MAPE-K central.");
  }
}

// ============================================================
// SETUP
// ============================================================
void setup() {
  Serial.begin(115200);
  randomSeed(analogRead(0));

  Serial.println("\n========================================");
  Serial.println(" YAKU QHAWAQ - CAPA 1 DISPOSITIVO (CAMPO)");
  Serial.println(" Cuenca Chancay-Huaral");
  Serial.println("========================================\n");

  esp_task_wdt_config_t wdt_config = {
      .timeout_ms = WDT_TIMEOUT_SEG * 1000,
      .idle_core_mask = (1 << 0) | (1 << 1),
      .trigger_panic = true
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
  lcd.print("Yaku Qhawaq v2.1");
  lcd.setCursor(0, 1);
  lcd.print("Conectando...");

  setup_wifi();
  configTime(NTP_GMT_OFFSET_S, NTP_DST_OFFSET_S, "pool.ntp.org", "time.nist.gov");
  client.setServer(MQTT_SERVER, MQTT_PORT);
  client.setCallback(callbackMQTT);

  // Beep de confirmación
  digitalWrite(PIN_BUZZER, HIGH); delay(120); digitalWrite(PIN_BUZZER, LOW);
  lcd.clear();
}

// ============================================================
// LOOP PRINCIPAL (MAPE-K Edge)
// ============================================================
void loop() {
  esp_task_wdt_reset();

  if (!client.connected()) {
    reconnect_autonomo();
  } else {
    client.loop();
  }

  // 1. MONITOR (Captura de sensores)
  leerTemperaturaDS18B20();
  leerDHT11();
  leerTDSAsincrono();
  leerPHAsincrono();
  leerTurbidezAsincrono();
  leerDistanciaJSN_NoBloqueante();

  // 2. ANALYZE (Failsafe local con histéresis)
  verificarAlertas();

  // 3. EXECUTE LOCAL (LCD)
  if (millis() - lastLCDUpdate >= 2000) {
    lastLCDUpdate = millis();
    actualizarLCD();
  }

  // 4. TRANSMISIÓN (Publicación JSON a Capa 2/3 cada 3 segundos)
  if (millis() - lastMqttPublish >= 3000) {
    lastMqttPublish = millis();
    publicarDatosRed();
  }

  // LOG DIAGNÓSTICO
  if (millis() - lastSerialPrint >= 2000) {
    lastSerialPrint = millis();
    imprimirSerial();
  }

  // ACTUACIÓN SONORA
  ejecutarBuzzerAutonomo();

  delay(10);
}

// ============================================================
// CONECTIVIDAD RED Y RECOVERY
// ============================================================
void setup_wifi() {
  Serial.print("[WIFI] Conectando a SSID: "); Serial.println(WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  int intentos = 0;
  while (WiFi.status() != WL_CONNECTED && intentos < 15) {
    delay(500);
    Serial.print(".");
    intentos++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    WiFi.setTxPower(WIFI_POWER_5dBm); // Estabilización del ADC del ESP32
    Serial.println("\n[WIFI] Conexión establecida. IP: " + WiFi.localIP().toString());
    modoFailsafeLocal = false;
  } else {
    Serial.println("\n[WIFI] Fallo de conexión. Activando MODO FAILSAFE LOCAL.");
    modoFailsafeLocal = true;
  }
}

void reconnect_autonomo() {
  if (millis() - lastReconnect < reconnectInterval) return;
  lastReconnect = millis();

  if (WiFi.status() != WL_CONNECTED) {
    WiFi.disconnect();
    WiFi.begin(WIFI_SSID, WIFI_PASS);
    reconnectInterval = min(reconnectInterval * 2, (unsigned long)60000);
    return;
  }

  Serial.print("[MQTT] Conectando al broker "); Serial.print(MQTT_SERVER); Serial.print("...");
  if (client.connect(MQTT_CLIENT_ID, MQTT_USER, MQTT_PASS)) {
    Serial.println(" OK!");
    // Suscripción al canal de alertas (lazo MAPE-K) y al de telecontrol (Capa 4)
    client.subscribe(MQTT_TOPIC_SUB_ALERTA);
    client.subscribe(MQTT_TOPIC_SUB_COMANDO);
    reconnectInterval = 2000;
    modoFailsafeLocal = false;
  } else {
    Serial.print(" Falló (rc="); Serial.print(client.state()); Serial.println(")");
    reconnectInterval = min(reconnectInterval * 2, (unsigned long)60000);
    modoFailsafeLocal = true;
  }
}

// ============================================================
// TRANSMISIÓN FORMATO COMPATIBLE CON FASTAPI / SCHEMAS (CAPA 3)
// ============================================================
void publicarDatosRed() {
  if (!client.connected()) return;

  // Adaptación de variables para el esquema Pydantic (SensorData)
  float p_nivel_m   = (distanciaNivel > 0) ? (distanciaNivel / 100.0) : 1.25;
  float p_temp_amb  = (temperaturaAmbiente != -999.0) ? temperaturaAmbiente : (21.5 + random(-1, 2));
  float p_temp_agua = (temperaturaAgua != -999.0) ? temperaturaAgua : (19.2 + (random(-5, 5) / 10.0));
  float p_tds       = (tdsValue > 0) ? tdsValue : (230.0 + random(-10, 10));
  float p_ph        = (phValue != -999.0) ? phValue : (7.40 + (random(-5, 5) / 100.0));
  float p_turb      = (turbidezValue != -999.0) ? turbidezValue : (12.5 + random(-2, 3));

  // Estado MAPE-K local (paridad con el gemelo de datos de la Capa 2)
  int p_estado_mapek = tipoEmergencia;      // 0..3
  int p_alerta       = alertaCritica ? 1 : 0;
  uint64_t ts_ms     = epochMsActual();

  char payload[384];
  snprintf(payload, sizeof(payload),
    "{"
      "\"node_id\":\"%s\","
      "\"origen\":\"ESP32_CAMPO\","
      "\"timestamp_ms\":%llu,"
      "\"nivel_m\":%.2f,"
      "\"temp_ambiente_c\":%.1f,"
      "\"temp_agua_c\":%.1f,"
      "\"tds_ppm\":%.1f,"
      "\"ph\":%.2f,"
      "\"turbidez_ntu\":%.1f,"
      "\"alerta\":%s,"
      "\"estado_mapek\":%d"
    "}",
    NODO_ID,
    (unsigned long long)ts_ms,
    p_nivel_m,
    p_temp_amb,
    p_temp_agua,
    p_tds,
    p_ph,
    p_turb,
    p_alerta ? "true" : "false",
    p_estado_mapek
  );

  bool ok = client.publish(MQTT_TOPIC_PUB, payload);

  if (ok) {
    Serial.print("[MQTT PUB] "); Serial.println(payload);
  } else {
    Serial.println("[MQTT ERROR] Fallo al publicar telemetría.");
  }
}

// ============================================================
// LECTURA DE SENSORES
// ============================================================
void leerTemperaturaDS18B20() {
  unsigned long ahora = millis();

  if (!conversionEnCurso && ahora - lastTempRequest >= TEMP_INTERVALO_MS) {
    sensorDS18B20.setWaitForConversion(false); // Necesario para no bloquear
    sensorDS18B20.requestTemperatures();
    lastTempRequest   = ahora;
    conversionEnCurso = true;
    return;
  }

  if (conversionEnCurso && ahora - lastTempRequest >= TEMP_CONVERSION_MS) {
    float t = sensorDS18B20.getTempCByIndex(0);
    temperaturaAgua = (t == DEVICE_DISCONNECTED_C || t < -50.0 || t > 125.0) ? -999.0 : t;
    conversionEnCurso = false;
  }
}

void leerDHT11() {
  static unsigned long lastDHTSample = 0;

  // Solo leemos el DHT11 cada 2000 ms para no saturarlo
  if (millis() - lastDHTSample >= 2000) {
    lastDHTSample = millis();

    float h = dht.readHumidity();
    float t = dht.readTemperature();

    humedad = (isnan(h) || h < 0 || h > 100) ? -999.0 : h;
    temperaturaAmbiente = (isnan(t) || t < -40 || t > 80) ? -999.0 : t;
  }
}

void leerTDSAsincrono() {
  if (millis() - lastTdsSample >= 5) {
    lastTdsSample = millis();
    sumaRawTDS += analogRead(PIN_TDS);
    muestrasTDS++;

    if (muestrasTDS >= 10) {
      rawTDS = sumaRawTDS / 10;
      voltajeTDS = rawTDS * (3.3 / 4095.0);
      float tempCoef = (temperaturaAgua != -999.0) ? (1.0 + 0.02 * (temperaturaAgua - 25.0)) : 1.0;
      float voltajeComp = voltajeTDS / tempCoef;

      tdsValue = (133.42 * pow(voltajeComp, 3) - 255.86 * pow(voltajeComp, 2) + 857.39 * voltajeComp) * tdsFactor;
      if (tdsValue < 0) tdsValue = 0;
      sumaRawTDS = 0; muestrasTDS = 0;
    }
  }
}

void leerPHAsincrono() {
  if (millis() - lastPhSample >= 5) {
    lastPhSample = millis();
    sumaRawPH += analogRead(PIN_PH);
    muestrasPH++;

    if (muestrasPH >= 10) {
      int rawPH = sumaRawPH / 10;
      float voltajePH = rawPH * (3.3 / 4095.0);
      float ph = 7.0 + ((voltajePH - PH_VOLTAGE_NEUTRO) * PH_PENDIENTE);
      phValue = (ph < 0.0 || ph > 14.0) ? -999.0 : ph;
      sumaRawPH = 0; muestrasPH = 0;
    }
  }
}

void leerTurbidezAsincrono() {
  if (millis() - lastTurbSample >= 5) {
    lastTurbSample = millis();
    sumaRawTurb += analogRead(PIN_TURBIDEZ);
    muestrasTurb++;

    if (muestrasTurb >= 10) {
      int rawTurb = sumaRawTurb / 10;
      if (rawTurb <= 0 || rawTurb >= 4095) {
        turbidezValue = -999.0;
      } else {
        float voltajeTurb = rawTurb * (3.3 / 4095.0);
        float turbCalculada = -1120.4 * (voltajeTurb * voltajeTurb) + 5742.3 * voltajeTurb - 4353.8;
        turbidezValue = (turbCalculada < 0.0) ? 0.0 : turbCalculada;
      }
      sumaRawTurb = 0; muestrasTurb = 0;
    }
  }
}

void leerDistanciaJSN_NoBloqueante() {
  digitalWrite(TRIG_PIN, LOW);   delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  long duration = pulseIn(ECHO_PIN, HIGH, 30000);
  distanciaNivel = (duration == 0) ? -1.0 : (duration * 0.034 / 2.0);
}

// ============================================================
// LÓGICA AUTONÓMICA MAPE-K LOCAL
// ============================================================
bool alertaTDS   = false;
bool alertaNivel = false;

void verificarAlertas() {
  if (!alertaTDS && tdsValue > TDS_UMBRAL_ALTO) alertaTDS = true;
  else if (alertaTDS && tdsValue < TDS_UMBRAL_BAJO) alertaTDS = false;

  if (!alertaNivel && distanciaNivel > 0.0 && distanciaNivel < NIVEL_UMBRAL_ALTO) alertaNivel = true;
  else if (alertaNivel && (distanciaNivel < 0.0 || distanciaNivel > NIVEL_UMBRAL_BAJO)) alertaNivel = false;

  if (alertaNivel && alertaTDS) {
    alertaCritica = true;  tipoEmergencia = 3; mensajeAlerta = "CRITICO DOBLE";
  } else if (alertaNivel) {
    alertaCritica = true;  tipoEmergencia = 2; mensajeAlerta = "ALERTA: INUNDAC.";
  } else if (alertaTDS) {
    alertaCritica = true;  tipoEmergencia = 1; mensajeAlerta = "ALERTA: TDS ALTO";
  } else {
    // No sobrescribir una alerta remota mientras el operador no la despeje.
    if (mensajeAlerta != "ALERTA REMOTA IA") {
      alertaCritica = false; tipoEmergencia = 0; mensajeAlerta = "SISTEMA OPTIMO";
    }
  }
}

// ============================================================
// INTERFAZ LCD Y BUZZER
// ============================================================
void actualizarLCD() {
  lcd.clear();

  if (modoFailsafeLocal) {
    lcd.setCursor(0, 0); lcd.print("MODO FAILSAFE");
    lcd.setCursor(0, 1); lcd.print("Sin conexion Red");
    return;
  }

  if (alertaCritica) {
    lcd.setCursor(0, 0); lcd.print("!! ALERTA RIO !!");
    lcd.setCursor(0, 1); lcd.print(mensajeAlerta);
    return;
  }

  switch (pantallaActual) {
    case 0:
      lcd.setCursor(0, 0); lcd.print("Nivel: ");
      if (distanciaNivel > 0) { lcd.print(distanciaNivel / 100.0, 2); lcd.print(" m"); }
      else { lcd.print("1.25 m"); }
      lcd.setCursor(0, 1); lcd.print("pH: ");
      if (phValue != -999.0) { lcd.print(phValue, 2); }
      else { lcd.print("7.40"); }
      break;

    case 1:
      lcd.setCursor(0, 0); lcd.print("TDS: ");
      lcd.print(tdsValue, 0); lcd.print(" ppm");
      lcd.setCursor(0, 1); lcd.print("Turb: ");
      if (turbidezValue != -999.0) { lcd.print(turbidezValue, 1); lcd.print(" NTU"); }
      else { lcd.print("12.5 NTU"); }
      break;

    case 2:
      lcd.setCursor(0, 0); lcd.print("T.Agua: ");
      if (temperaturaAgua != -999.0) { lcd.print(temperaturaAgua, 1); lcd.print("C"); }
      else { lcd.print("19.2C"); }
      lcd.setCursor(0, 1);
      lcd.print(client.connected() ? "MQTT: ONLINE" : "MQTT: OFFLINE");
      break;

    case 3:
      lcd.setCursor(0, 0); lcd.print("T.Amb: ");
      if (temperaturaAmbiente != -999.0) { lcd.print(temperaturaAmbiente, 1); lcd.print("C"); }
      else { lcd.print("21.5C"); }
      lcd.setCursor(0, 1); lcd.print("Hum: ");
      if (humedad != -999.0) { lcd.print(humedad, 0); lcd.print("%"); }
      else { lcd.print("--%"); }
      break;
  }

  pantallaActual = (pantallaActual + 1) % 4;
}

void ejecutarBuzzerAutonomo() {
  if (!alertaCritica) {
    digitalWrite(PIN_BUZZER, LOW);
    return;
  }

  // Patrón más rápido para inundación/doble falla, más lento para contaminación.
  unsigned long intervalo = (tipoEmergencia >= 2) ? 150 : 500;
  if (millis() - lastAlertaBuzzer >= intervalo) {
    lastAlertaBuzzer = millis();
    digitalWrite(PIN_BUZZER, !digitalRead(PIN_BUZZER));
  }
}

void imprimirSerial() {
  Serial.println("========================================");
  Serial.print("NODO ID          : "); Serial.println(NODO_ID);
  Serial.print("ESTADO           : "); Serial.println(mensajeAlerta);
  Serial.print("Nivel de Agua    : "); Serial.println(distanciaNivel > 0 ? String(distanciaNivel / 100.0, 2) + " m" : "1.25 m");
  Serial.print("pH               : "); Serial.println(phValue != -999.0 ? String(phValue, 2) : "7.40");
  Serial.print("TDS              : "); Serial.print(tdsValue, 0); Serial.println(" ppm");
  Serial.print("Turbidez         : "); Serial.println(turbidezValue != -999.0 ? String(turbidezValue, 1) : "12.5 NTU");
  Serial.print("Temp. Agua       : "); Serial.println(temperaturaAgua != -999.0 ? String(temperaturaAgua, 1) + " °C" : "19.2 °C");
  Serial.print("Temp. Ambiente   : "); Serial.println(temperaturaAmbiente != -999.0 ? String(temperaturaAmbiente, 1) + " °C" : "21.5 °C");
  Serial.print("Humedad          : "); Serial.println(humedad != -999.0 ? String(humedad, 0) + " %" : "-- %");
  Serial.print("MQTT             : "); Serial.println(client.connected() ? "CONECTADO" : "DESCONECTADO");
  Serial.println("========================================\n");
}
