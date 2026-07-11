# =================================================================
# PROYECTO   : Sistema IoT Autónomo - Cuenca Chancay-Huaral
# MÓDULO     : Capa 4 - Aplicación (Frontend "Yaku Qhawaq")
# ARCHIVO    : frontend/Dockerfile
#
# Build MULTI-STAGE: la etapa "builder" compila la SPA React/Vite
# (`npm run build`) usando Node 20 (mismo runtime validado en el
# entorno de desarrollo); la etapa final sirve exclusivamente los
# artefactos estáticos resultantes (`dist/`) mediante NGINX Alpine,
# reduciendo drásticamente la superficie de ataque e imagen final
# (no se embarca Node.js ni node_modules en producción).
# =================================================================

# --- Etapa 1: Build de producción ---
FROM node:20-alpine AS builder

WORKDIR /app

# Instalación reproducible: usa el árbol exacto fijado en package-lock.json
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# --- Etapa 2: Servir con NGINX ---
FROM nginx:1.27-alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
