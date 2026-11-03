import React from 'react';
import ReactDOM from 'react-dom/client';
import { installDomTranslateGuard } from './utils/domTranslateGuard';
import { App } from './App';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { triggerChunkRecovery, cleanRefreshQueryParam } from './utils/chunkRecovery';
import './styles/global.css';
import './styles/mobile.css';
import { installNativeNavigation } from './utils/nativeNavigation';

// Proteção preventiva contra quebras de reconciliação do React causadas por tradução automática do navegador (Google Translate)
installDomTranslateGuard();

installNativeNavigation();

// Limpa parâmetro de cache-busting (__zemda_refresh) da URL sem recarregar a página
cleanRefreshQueryParam();

// Interceptor global do Vite para falhas de carregamento de chunks desatualizados após deploy
window.addEventListener('vite:preloadError', (event: any) => {
  event.preventDefault();
  console.warn('[Vite] Evento vite:preloadError interceptado:', event?.payload?.message || event);
  triggerChunkRecovery('vite:preloadError');
});

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
