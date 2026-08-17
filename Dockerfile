FROM node:20-alpine

WORKDIR /transpaservic-dist

# Instalar dependencias de producción
COPY package*.json ./
RUN npm ci --omit=dev

# Copiar el código ya compilado
COPY dist/ ./dist/
COPY frontend/ ./frontend/

# Crear las carpetas por si no existen (el volumen las montará encima)
RUN mkdir -p uploads backups

EXPOSE 3000

CMD ["node", "dist/main.js"]