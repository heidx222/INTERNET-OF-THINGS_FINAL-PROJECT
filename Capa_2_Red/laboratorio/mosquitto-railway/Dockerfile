# Imagen base: Mosquitto con el plugin Go-Auth ya instalado
FROM iegomez/mosquitto-go-auth:latest

# Reemplazamos la configuración por la versión para Railway
# (mismo contenido que el local, solo cambia el host de PostgreSQL)
COPY mosquitto.conf /etc/mosquitto/mosquitto.conf

EXPOSE 1883
