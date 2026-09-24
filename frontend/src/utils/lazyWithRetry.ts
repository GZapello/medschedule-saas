import React, { ComponentType, lazy, LazyExoticComponent } from 'react';
import { triggerChunkRecovery, isChunkLoadError } from './chunkRecovery';

/**
 * Wrapper para React.lazy que intercepta falhas de importação de chunks desatualizados após deploys.
 * Executa uma recuperação controlada caso o chunk não exista mais no servidor (404 / Failed to fetch module).
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  chunkName?: string
): LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      return await factory();
    } catch (error: any) {
      if (isChunkLoadError(error)) {
        console.warn(`[Zemda] Falha ao carregar componente "${chunkName || 'lazy'}":`, error?.message);
        const initiated = triggerChunkRecovery(`lazyWithRetry:${chunkName || 'unknown'}`);
        if (initiated) {
          // Mantém a Promise pendente enquanto o browser executa window.location.replace
          return new Promise<{ default: T }>(() => {});
        }
      }
      // Se não for erro de chunk ou se o cooldown já estiver ativo, delega para o ErrorBoundary
      throw error;
    }
  });
}
