"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerPublicSite = registerPublicSite;
const express_1 = __importDefault(require("express"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const seoRoutes_1 = require("./seoRoutes");
const preRender_1 = require("./preRender");
/** Public infrastructure only; does not initialize a database or register API routes. */
function registerPublicSite(app, frontendDist) {
    app.use((req, res, next) => {
        if (req.hostname === 'www.zemda.com.br')
            return res.redirect(301, 'https://zemda.com.br' + req.originalUrl);
        next();
    });
    // Rota pública para robots.txt com cabeçalho text/plain
    app.get('/robots.txt', (req, res) => {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.send((0, seoRoutes_1.generateRobotsTxt)());
    });
    // Rota pública para sitemap.xml com cabeçalho rigoroso application/xml
    const handleSitemap = (req, res) => {
        res.status(200);
        res.type('application/xml');
        res.setHeader('Content-Type', 'application/xml; charset=utf-8');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600');
        res.send((0, seoRoutes_1.generateSitemapXml)());
    };
    app.get('/sitemap.xml', handleSitemap);
    app.get('/sitemap', handleSitemap);
    app.get('/sitemap_index.xml', (_req, res) => {
        res.type('application/xml').send((0, seoRoutes_1.generateSitemapIndexXml)());
    });
    if (!frontendDist)
        return;
    app.use(express_1.default.static(frontendDist, {
        index: false,
        setHeaders: (res, filePath) => {
            const normalized = filePath.replace(/\\/g, '/');
            if (normalized.includes('/assets/')) {
                // Assets com hash único gerados pelo bundler (Vite) recebem cache longo imutável
                res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            }
            else if (normalized.endsWith('index.html')) {
                // index.html nunca deve ser mantido em cache pelo navegador
                res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
                res.setHeader('Pragma', 'no-cache');
                res.setHeader('Expires', '0');
            }
        }
    }));
    // Bloqueio rigoroso de assets ausentes: NUNCA retornar index.html para chunks ou assets estáticos inexistentes
    app.all(['/assets/*', '/assets'], (req, res) => {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.status(404).send('Asset not found');
    });
    app.all(/\.(js|css|map|wasm|woff2?|ttf|eot)$/, (req, res) => {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.status(404).send('Static file not found');
    });
    // Qualquer rota da interface web que não seja API ou health check retorna o index.html com SSR / pré-renderização de SEO
    app.get('*', (req, res, next) => {
        if (req.path.startsWith('/api') ||
            req.path.startsWith('/v1') ||
            req.path.startsWith('/health')) {
            return res.status(404).json({
                error: `Endpoint ${req.method} ${req.path} não encontrado na API Zemda.`,
                code: 'ROUTE_NOT_FOUND'
            });
        }
        // Padronização estrita de trailing slash para SEO: subpáginas não devem ter barra no final
        if (req.path.length > 1 && req.path.endsWith('/')) {
            const cleanPath = req.path.replace(/\/+$/, '');
            const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
            return res.redirect(301, cleanPath + query);
        }
        const indexPath = path_1.default.join(frontendDist, 'index.html');
        if (fs_1.default.existsSync(indexPath)) {
            try {
                if (/^\/(?:assinar-termo|verificar)\//.test(req.path))
                    res.setHeader('Referrer-Policy', 'no-referrer');
                const rawHtml = fs_1.default.readFileSync(indexPath, 'utf-8');
                const normPath = (0, seoRoutes_1.normalizePath)(req.path);
                const isPublic = (0, seoRoutes_1.isPublicRoute)(normPath);
                const isInternal = (0, seoRoutes_1.isValidInternalRoute)(normPath);
                const isLegit = isPublic || isInternal;
                // Cabeçalhos universais de cache para HTML da aplicação: sempre valida com servidor
                res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
                res.setHeader('Pragma', 'no-cache');
                res.setHeader('Expires', '0');
                if (isInternal && !isPublic) {
                    // Páginas privadas / autenticadas recebem cabeçalho noindex estrito
                    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
                }
                if (!isLegit) {
                    // URLs verdadeiramente inexistentes retornam status HTTP 404 real
                    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
                    res.status(404);
                    const renderedHtml = (0, preRender_1.renderPreRenderedHtml)(rawHtml, req.path);
                    res.setHeader('Content-Type', 'text/html; charset=utf-8');
                    return res.send(renderedHtml);
                }
                const renderedHtml = (0, preRender_1.renderPreRenderedHtml)(rawHtml, req.path);
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                res.status(200).send(renderedHtml);
            }
            catch (e) {
                res.setHeader('X-Robots-Tag', 'noindex, nofollow');
                res.status(500).send('Não foi possível carregar a página.');
            }
        }
        else {
            next();
        }
    });
}
