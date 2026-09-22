import { getRouteByPath, generateSitemapXml, generateRobotsTxt } from '../backend/src/seo/seoRoutes';
import { renderSeoHead } from '../backend/src/seo/seoPresentation';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: process.env.BUILD_TARGET === 'desktop' ? './' : '/',
  plugins: [react(), {
    name: 'zemda-public-seo',
    transformIndexHtml(html) { return renderSeoHead(html, getRouteByPath('/')!); },
    generateBundle() {
      this.emitFile({type:'asset', fileName:'sitemap.xml', source:generateSitemapXml()});
      this.emitFile({type:'asset', fileName:'robots.txt', source:generateRobotsTxt()});
    }
  }],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true
      }
    }
  }
});
