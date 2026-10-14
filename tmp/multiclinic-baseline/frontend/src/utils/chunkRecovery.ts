/**
 * Utilitário central de recuperação de falhas de carregamento de chunks dinâmicos (Vite / React.lazy).
 * 
 * Previne falhas após novos deploys onde hashes antigos de chunks deixam de existir no servidor.
 * Executa recuperação controlada com proteção contra loops infinitos e cache-busting.
 * NUNCA apaga localStorage (preserva auth_token, sessão, tenant e preferências).
 */

const RECOVERY_STORAGE_KEY = 'zemda_chunk_recovery';
const RECOVERY_COOLDOWN_MS = 45000; // 45 segundos de cooldown para evitar loop

/**
 * Identifica se um erro é tipicamente de falha de download/importação de chunk ou script desatualizado
 */
export function isChunkLoadError(error: any): boolean {
  if (!error) return false;
  const msg = String(error?.message || error || '').toLowerCase();
  const name = String(error?.name || '').toLowerCase();

  return (
    msg.includes('failed to fetch dynamically imported module') ||
    msg.includes('importing a module script failed') ||
    msg.includes('chunkloaderror') ||
    msg.includes('loading chunk failed') ||
    msg.includes('error loading dynamically imported module') ||
    name.includes('chunkloaderror')
  );
}

/**
 * Remove o parâmetro __zemda_refresh da URL caso tenha sido inserido durante um reload com cache-busting
 */
export function cleanRefreshQueryParam(): void {
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.has('__zemda_refresh')) {
      url.searchParams.delete('__zemda_refresh');
      const cleanUrl = url.pathname + (url.search ? url.search : '') + url.hash;
      window.history.replaceState(window.history.state, '', cleanUrl);
    }
  } catch (e) {
    console.warn('[chunkRecovery] Erro ao limpar parâmetro de refresh:', e);
  }
}

/**
 * Limpa caches técnicos do navegador (CacheStorage) SEM tocar no localStorage
 */
export async function clearTechnicalAssetCaches(): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    if ('caches' in window) {
      const keys = await window.caches.keys();
      await Promise.all(keys.map(k => window.caches.delete(k)));
      console.log('[chunkRecovery] CacheStorage de assets limpo com sucesso.');
    }
  } catch (e) {
    console.warn('[chunkRecovery] Erro ao limpar CacheStorage:', e);
  }
}

/**
 * Dispara uma recuperação controlada da aplicação.
 * Retorna true se a recuperação foi iniciada (recarregamento em andamento), ou false se foi abortada por cooldown.
 */
export function triggerChunkRecovery(source: string = 'unknown'): boolean {
  if (typeof window === 'undefined') return false;

  const now = Date.now();
  let lastAttempt = 0;

  try {
    const raw = sessionStorage.getItem(RECOVERY_STORAGE_KEY);
    if (raw) {
      lastAttempt = parseInt(raw, 10) || 0;
    }
  } catch (e) {
    console.warn('[chunkRecovery] Erro ao ler sessionStorage:', e);
  }

  // Proteção contra loop: se já tentou nos últimos 45 segundos, não recarrega de novo
  if (lastAttempt > 0 && (now - lastAttempt) < RECOVERY_COOLDOWN_MS) {
    console.warn(`[chunkRecovery] Tentativa recente há ${Math.round((now - lastAttempt) / 1000)}s. Abortando loop e deixando ErrorBoundary assumir.`);
    return false;
  }

  try {
    sessionStorage.setItem(RECOVERY_STORAGE_KEY, String(now));
  } catch {}

  console.warn(`[chunkRecovery] Recuperando aplicação devido a falha de chunk (origem: ${source}). Atualizando versão...`);

  // Limpa CacheStorage em segundo plano antes do reload
  clearTechnicalAssetCaches().finally(() => {
    // Cache-busting URL sem alterar o pathname ou hash atual (preserva a rota do usuário)
    const url = new URL(window.location.href);
    url.searchParams.set('__zemda_refresh', String(now));
    window.location.replace(url.toString());
  });

  return true;
}
