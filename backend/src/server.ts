import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initializeDatabase } from './config/database';
import apiRoutes from './routes';

import path from 'path';
import fs from 'fs';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// Configurações de Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-ID']
}));

app.use(express.json());

// Inicializa tabelas e seeds do banco de dados relacional
initializeDatabase();

// Registra as rotas da API em /api
app.use('/api', apiRoutes);

// Health check para monitoramento
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'SaaS-Schedule-Core',
    version: '1.0.0'
  });
});

// Servir arquivos estáticos do frontend em produção (Single Page Application unificada)
const possibleFrontendDistPaths = [
  process.env.FRONTEND_DIST_PATH,
  path.resolve(__dirname, '../../frontend/dist'),
  path.resolve(__dirname, '../public/dist'),
  path.resolve(process.cwd(), 'frontend/dist'),
  path.resolve(process.cwd(), 'dist/frontend'),
  path.resolve(process.cwd(), 'public')
].filter((p): p is string => Boolean(p && fs.existsSync(p)));

if (possibleFrontendDistPaths.length > 0) {
  const frontendDist = possibleFrontendDistPaths[0];
  console.log(`[Frontend SPA] Servindo aplicação estática a partir de: ${frontendDist}`);
  app.use(express.static(frontendDist));

  // Qualquer rota da interface web que não comece com /api ou /health retorna o index.html
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/health')) {
      return next();
    }
    const indexPath = path.join(frontendDist, 'index.html');
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      next();
    }
  });
}

// Middleware de tratamento centralizado de erros
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[Unhandled Error]', err);
  res.status(500).json({ error: 'Ocorreu um erro interno no servidor', details: err.message });
});

app.listen(PORT, () => {
  console.log(`[SaaS Core API] Servidor rodando com sucesso na porta ${PORT}`);
  console.log(`[SaaS Core API] Rotas ativas em http://localhost:${PORT}/api/v1`);
});
