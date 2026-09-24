import { registerPublicSite } from './seo/publicSite';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { BillingWebhookService } from './services/billing-webhook.service';
import { initializeDatabase } from './config/database';
import apiRoutes from './routes';

import path from 'path';
import fs from 'fs';

dotenv.config();

if (process.env.NODE_ENV === 'production' && !process.env.ZEMDA_FILES_SIGNING_SECRET) {
  console.error('[FATAL] ZEMDA_FILES_SIGNING_SECRET é obrigatório em ambiente de produção para assinar tokens do Cloudflare Worker!');
  throw new Error('ZEMDA_FILES_SIGNING_SECRET não configurado em ambiente de produção');
}

const app = express();
const PORT = process.env.PORT || 4000;

// Configuração segura de proxy reverso (Railway / Edge)
// Permite que req.ip obtenha o IP real do cliente sem confiar em cabeçalhos forjados diretamente
app.set('trust proxy', 1);

// Cabeçalhos de segurança HTTP padrão (CSP desabilitado: a API serve JSON e o SPA já define o seu próprio)
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }));

// Lista de origens de navegador autorizadas a chamar a API (apps nativos/Electron não enviam Origin e não são afetados)
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'https://zemda.com.br,https://www.zemda.com.br,http://localhost:5173,http://localhost:4000')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

// Configurações de Middleware
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`Origem não autorizada pela política de CORS: ${origin}`));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-ID', 'X-Requested-With', 'Accept']
}));

// Limite geral de requisições por IP, protegendo a API contra abuso e força bruta
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  standardHeaders: true,
  legacyHeaders: false
});
app.use(['/api', '/v1'], apiLimiter);

// Limite mais rígido para rotas sensíveis de autenticação
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Muitas tentativas. Tente novamente em alguns minutos.', code: 'RATE_LIMITED' }
});
app.use(['/api/v1/auth/login', '/v1/auth/login', '/api/v1/auth/register', '/v1/auth/register', '/api/v1/auth/reset-password', '/v1/auth/reset-password', '/api/v1/public/auth/reset-password'], authLimiter);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Logger estruturado para monitoramento de rotas de API com medição de latência
app.use((req, res, next) => {
  if (req.url.startsWith('/api') || req.url.startsWith('/v1')) {
    const startTime = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      const tenant = req.headers['x-tenant-id'] || '-';
      const status = res.statusCode;
      if (status >= 400) {
        console.warn(`[API ${req.method}] ${req.originalUrl || req.url} -> Status ${status} (${duration}ms) | Tenant: ${tenant}`);
      } else if (req.method !== 'GET') {
        console.log(`[API ${req.method}] ${req.originalUrl || req.url} -> Status ${status} (${duration}ms) | Tenant: ${tenant}`);
      }
    });
  }
  next();
});

// Inicializa tabelas e seeds do banco de dados relacional
initializeDatabase();
BillingWebhookService.start();

// Inicia o motor de segundo plano para lembretes automáticos (Zemda Notifications API)
import { NotificationService } from './services/notification.service';
NotificationService.startBackgroundWorker(30000);

// Redirecionamento canônico de www.zemda.com.br para https://zemda.com.br
app.use((req, res, next) => {
  const host = req.headers.host || '';
  if (host.startsWith('www.zemda.com.br')) {
    return res.redirect(301, `https://zemda.com.br${req.url}`);
  }
  next();
});

// Reescreve requisições que chegam em /v1/... para /api/v1/... para compatibilidade total entre web, mobile e desktop
app.use((req, res, next) => {
  if (req.url.startsWith('/v1/')) {
    req.url = `/api${req.url}`;
  }
  next();
});

// Endpoints públicos de Health Check (sempre retornam JSON 200 sem autenticação)
const healthHandler = (req: express.Request, res: express.Response) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'Zemda-API-Core',
    version: '1.1.2',
    cloud: 'production'
  });
};

app.get('/api/health', healthHandler);
app.get('/health', healthHandler);
app.get('/api/v1/health', healthHandler);
app.get('/v1/health', healthHandler);

// Registra as rotas da API em /api
app.use('/api', apiRoutes);

// Middleware universal de 404 para chamadas de API: NUNCA retorna HTML, SEMPRE JSON
app.all(['/api', '/api/*', '/v1', '/v1/*'], (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(404).json({
    success: false,
    error: `Endpoint ${req.method} ${req.originalUrl || req.url} não encontrado na API Zemda.`,
    code: 'ROUTE_NOT_FOUND'
  });
});


// Servir downloads de executáveis oficiais (Windows e Android)
const downloadsDir = path.resolve(__dirname, '../public/downloads');
if (fs.existsSync(downloadsDir)) {
  console.log(`[Downloads API] Servindo executáveis estáticos de: ${downloadsDir}`);
  app.use('/downloads', express.static(downloadsDir));
}

const possibleFrontendDistPaths = [
  process.env.FRONTEND_DIST_PATH,
  path.resolve(__dirname, '../../frontend/dist'),
  path.resolve(__dirname, '../public/dist'),
  path.resolve(process.cwd(), 'frontend/dist'),
  path.resolve(process.cwd(), 'dist/frontend'),
  path.resolve(process.cwd(), 'public')
].filter((p): p is string => Boolean(p && fs.existsSync(p)));

registerPublicSite(app, possibleFrontendDistPaths[0]);

// Middleware de tratamento centralizado de erros
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[Unhandled Error]', err);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Ocorreu um erro interno no servidor',
    code: err.code || 'INTERNAL_SERVER_ERROR'
  });
});

app.listen(PORT, () => {
  console.log(`[SaaS Core API] Servidor rodando com sucesso na porta ${PORT}`);
  console.log(`[SaaS Core API] Rotas ativas em http://localhost:${PORT}/api/v1`);
});
