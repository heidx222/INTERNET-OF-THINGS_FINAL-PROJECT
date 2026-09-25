# =================================================================
# PROYECTO: Sistema IoT Autónomo - Cuenca Chancay-Huaral (Yaku Qhawaq)
# ARCHIVO:  Dockerfile  (Capa 4 - Aplicación / Frontend React + Nginx)
# DESTINO:  Railway
# -----------------------------------------------------------------
# Contexto de build = esta carpeta (Capa_4_Aplicacion/campo/frontend).
# En Railway: Settings -> Root Directory = Capa_4_Aplicacion/campo/frontend
#
# ⚠️  IMPORTANTE: Vite "hornea" las variables VITE_* en TIEMPO DE BUILD.
#     Debes definir VITE_API_BASE_URL como variable del servicio ANTES de
#     construir/desplegar (Railway la inyecta como build arg). Ver .env.example.
# =================================================================

# ---------- Etapa 1: BUILD ----------
FROM node:20-alpine AS build

WORKDIR /app

# La URL de la Capa 3 se recibe como build arg (Railway la toma de sus Variables)
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---------- Etapa 2: SERVE ----------
FROM nginx:1.27-alpine

# Configuración de Nginx (SPA fallback + caché de assets)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copiamos el build estático de Vite
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

# Railway inyecta $PORT; plantilla de Nginx lo usa. En local cae a 80.
CMD ["sh", "-c", "sed -i \"s/listen 80;/listen ${PORT:-80};/\" /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]
