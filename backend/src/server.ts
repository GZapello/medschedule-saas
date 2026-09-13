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

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Inicializa tabelas e seeds do banco de dados relacional
initializeDatabase();

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

import { renderPreRenderedHtml } from './seo/preRender';

// Servir downloads de executáveis oficiais (Windows e Android)
const downloadsDir = path.resolve(__dirname, '../public/downloads');
if (fs.existsSync(downloadsDir)) {
  console.log(`[Downloads API] Servindo executáveis estáticos de: ${downloadsDir}`);
  app.use('/downloads', express.static(downloadsDir));
}

// Rota pública para robots.txt com cabeçalho text/plain
app.get('/robots.txt', (req, res) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.send(`User-agent: *
Allow: /
Allow: /sistema-para-clinicas
Allow: /sistema-para-psicologos
Allow: /sistema-para-fonoaudiologos
Allow: /sistema-para-fisioterapeutas
Allow: /sistema-para-nutricionistas
Allow: /sistema-para-medicos
Allow: /agenda-online
Allow: /prontuario
Allow: /gestao-financeira
Allow: /blog
Allow: /downloads
Disallow: /api/
Disallow: /v1/
Disallow: /dashboard
Disallow: /patients
Disallow: /calendar
Disallow: /clinical
Disallow: /professionals
Disallow: /services
Disallow: /financial
Disallow: /receipts
Disallow: /staff
Disallow: /settings
Disallow: /superadmin
Disallow: /audit

Sitemap: https://zemda.com.br/sitemap.xml
`);
});

// Rota pública para sitemap.xml com cabeçalho rigoroso application/xml
const handleSitemap = (req: express.Request, res: express.Response) => {
  res.status(200);
  res.type('application/xml');
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600');
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://zemda.com.br/</loc>
    <lastmod>2026-09-13</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://zemda.com.br/sistema-para-clinicas</loc>
    <lastmod>2026-09-13</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>https://zemda.com.br/sistema-para-psicologos</loc>
    <lastmod>2026-09-13</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>https://zemda.com.br/sistema-para-fonoaudiologos</loc>
    <lastmod>2026-09-13</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>https://zemda.com.br/sistema-para-fisioterapeutas</loc>
    <lastmod>2026-09-13</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>https://zemda.com.br/sistema-para-nutricionistas</loc>
    <lastmod>2026-09-13</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>https://zemda.com.br/sistema-para-medicos</loc>
    <lastmod>2026-09-13</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>https://zemda.com.br/agenda-online</loc>
    <lastmod>2026-09-13</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://zemda.com.br/prontuario</loc>
    <lastmod>2026-09-13</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://zemda.com.br/gestao-financeira</loc>
    <lastmod>2026-09-13</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://zemda.com.br/blog</loc>
    <lastmod>2026-09-13</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://zemda.com.br/downloads</loc>
    <lastmod>2026-09-13</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
</urlset>`.trim());
};

app.get('/sitemap.xml', handleSitemap);
app.get('/sitemap', handleSitemap);
app.get('/sitemap_index.xml', handleSitemap);

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

  // Qualquer rota da interface web que não seja API ou health check retorna o index.html com SSR / pré-renderização de SEO
  app.get('*', (req, res, next) => {
    if (
      req.path.startsWith('/api') ||
      req.path.startsWith('/v1') ||
      req.path.startsWith('/health')
    ) {
      return res.status(404).json({
        error: `Endpoint ${req.method} ${req.path} não encontrado na API Zemda.`,
        code: 'ROUTE_NOT_FOUND'
      });
    }

    const indexPath = path.join(frontendDist, 'index.html');
    if (fs.existsSync(indexPath)) {
      try {
        const rawHtml = fs.readFileSync(indexPath, 'utf-8');
        const renderedHtml = renderPreRenderedHtml(rawHtml, req.path);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(renderedHtml);
      } catch (e) {
        res.sendFile(indexPath);
      }
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
