# Stage 1: Compilação do Frontend SPA
FROM node:22-alpine AS frontend-builder
WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# Stage 2: Compilação do Backend TypeScript
FROM node:22-alpine AS backend-builder
WORKDIR /app/backend

COPY backend/package*.json ./
RUN npm ci

COPY backend/ ./
RUN npm run build

# Stage 3: Imagem de Produção Otimizada
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000
ENV DATABASE_PATH=/data/saas_schedule.db

# Instala apenas as dependências de produção do backend
COPY backend/package*.json ./
RUN npm ci --omit=dev

# Copia o código compilado do backend e o schema de banco relacional
COPY --from=backend-builder /app/backend/dist ./dist
COPY --from=backend-builder /app/backend/src/config/schema.sql ./dist/config/schema.sql
COPY --from=backend-builder /app/backend/src/config/schema.sql ./src/config/schema.sql

# Copia os assets compilados do frontend
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Copia downloads de instaladores (APK Android e Executável Windows)
COPY backend/public ./public
COPY android/MedSchedule.apk ./android/MedSchedule.apk

# Garante o diretório de dados persistente para o banco SQLite
RUN mkdir -p /data

EXPOSE 4000
VOLUME ["/data"]

CMD ["node", "dist/server.js"]
