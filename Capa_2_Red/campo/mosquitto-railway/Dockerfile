# =================================================================
# PROYECTO: Sistema IoT Autónomo - Cuenca Chancay-Huaral (Yaku Qhawaq)
# ARCHIVO:  Dockerfile  (Capa 2 - Red / Broker MQTT en Railway)
# DESTINO:  Railway
# -----------------------------------------------------------------
# Contexto de build = esta carpeta (Capa_2_Red/campo/mosquitto-railway).
# En Railway: Settings -> Root Directory = Capa_2_Red/campo/mosquitto-railway
#
# El broker se expone por MQTT (1883). Para que el ESP32 (internet) se
# conecte, habilita en Railway: Settings -> Networking -> TCP Proxy
# apuntando al puerto 1883 (te dará host/puerto públicos).
# =================================================================
FROM iegomez/mosquitto-go-auth:latest

# Configuración con las credenciales de tu PostgreSQL (editar mosquitto.conf)
COPY mosquitto.conf /etc/mosquitto/mosquitto.conf

EXPOSE 1883

CMD ["/usr/sbin/mosquitto", "-c", "/etc/mosquitto/mosquitto.conf"]
