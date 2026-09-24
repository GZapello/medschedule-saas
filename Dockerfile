# Stage 1: Compilação do Frontend SPA
FROM node:22-slim AS frontend-builder
WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm install

COPY backend/src/seo/landingContent.ts ../backend/src/seo/landingContent.ts
COPY backend/src/seo/blogContent.ts ../backend/src/seo/blogContent.ts
COPY backend/src/seo/seoRoutes.ts ../backend/src/seo/seoRoutes.ts
COPY backend/src/seo/seoPresentation.ts ../backend/src/seo/seoPresentation.ts
COPY backend/src/types/registration-professions.ts ../backend/src/types/registration-professions.ts
COPY backend/src/utils/profession-module.ts ../backend/src/utils/profession-module.ts
COPY frontend/ ./
RUN npm run build

# Stage 2: Compilação do Backend TypeScript
FROM node:22-slim AS backend-builder
WORKDIR /app/backend

COPY backend/package*.json ./
RUN npm install

COPY backend/ ./
RUN npm run build

# Stage 3: Imagem de Produção Otimizada
FROM node:22-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000
ENV DATABASE_PATH=/data/saas_schedule.db

# Instala apenas as dependências de produção do backend
COPY backend/package*.json ./
RUN npm install --omit=dev

# Copia código compilado do backend e o schema de banco de dados
COPY --from=backend-builder /app/backend/dist ./dist
COPY --from=backend-builder /app/backend/src/config/schema.sql ./dist/config/schema.sql
COPY --from=backend-builder /app/backend/src/config/schema.sql ./src/config/schema.sql

# Copia os assets compilados do frontend SPA
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Garante o diretório de dados persistente para o banco SQLite
RUN mkdir -p /data

EXPOSE 4000

CMD ["node", "dist/server.js"]
