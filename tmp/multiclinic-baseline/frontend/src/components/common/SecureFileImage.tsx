import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ApiClient } from '../../api/client';
import { Image as ImageIcon, RefreshCw } from 'lucide-react';

export interface SecureFileImageProps {
  lazy?: boolean;
  fileId?: string | null;
  fallbackUrl?: string | null;
  alt?: string;
  className?: string;
  containerClassName?: string;
  placeholderText?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
}

// Cache em memória para evitar chamadas duplicadas aos endpoints de assinatura (TTL ~4 minutos)
const urlCache = new Map<string, { url: string; expiresAt: number }>();

/**
 * Registra ou atualiza no cache em memória uma URL temporária válida já conhecida
 */
export function cacheFileUrl(fileId: string, url: string, expiresInSeconds: number = 240): void {
  if (!fileId || !url || typeof fileId !== 'string' || typeof url !== 'string') return;
  urlCache.set(fileId, {
    url,
    expiresAt: Date.now() + Math.max(30, expiresInSeconds) * 1000
  });
}

/**
 * Validação de segurança para URLs de fallback:
 * NUNCA permite URLs blob: locais expiradas, URLs do Cloudflare Worker expiradas,
 * nem URLs diretas *.r2.cloudflarestorage.com (o bucket é estritamente privado).
 */
export function isSafeFallbackUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (
    trimmed.startsWith('blob:') ||
    trimmed.startsWith('data:') ||
    trimmed.includes('workers.dev') ||
    trimmed.includes('r2.cloudflarestorage.com')
  ) {
    return false;
  }
  return true;
}

/**
 * Helper exportado para obter URL temporária fresca do Cloudflare Worker via backend
 */
export async function fetchFreshFileUrl(fileId: string, forceFresh: boolean = false): Promise<string> {
  if (!fileId || typeof fileId !== 'string') {
    throw new Error('fileId inválido');
  }

  const cached = urlCache.get(fileId);
  const now = Date.now();
  if (!forceFresh && cached && cached.expiresAt > now + 30000) {
    return cached.url;
  }

  const res = await ApiClient.get<{ url: string; expiresIn?: number }>(`/files/${encodeURIComponent(fileId)}/url`);
  if (!res || !res.url) {
    throw new Error('URL assinada não retornada pelo servidor');
  }

  const expSec = res.expiresIn || 300;
  // Cache de 4 minutos (reserva 60s de margem de segurança)
  urlCache.set(fileId, {
    url: res.url,
    expiresAt: Date.now() + Math.max(60, expSec - 60) * 1000
  });

  return res.url;
}

export const SecureFileImage: React.FC<SecureFileImageProps> = ({
  lazy = false,
  fileId,
  fallbackUrl,
  alt = 'Imagem',
  className = 'w-full h-full object-cover',
  containerClassName = 'w-full h-full flex items-center justify-center',
  placeholderText = 'Sem foto',
  style,
  onClick
}) => {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [hasError, setHasError] = useState<boolean>(false);
  const retryCountRef = useRef<number>(0);
  const requestRef = useRef(0);
  const hostRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(!lazy);
  const [decoded, setDecoded] = useState(false);
  useEffect(() => {
    if (!lazy || visible) return;
    if (!('IntersectionObserver' in window)) { setVisible(true); return; }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: '160px' });
    if (hostRef.current) observer.observe(hostRef.current);
    return () => observer.disconnect();
  }, [lazy, visible]);

  const safeFallback = isSafeFallbackUrl(fallbackUrl) ? fallbackUrl : null;

  const loadFileUrl = useCallback(async (forceFresh: boolean = false) => {
    const request = ++requestRef.current;
    if (!fileId) {
      if (safeFallback) {
        setImageUrl(safeFallback);
        setHasError(false);
      } else {
        setImageUrl(null);
      }
      setLoading(false);
      return;
    }

    setLoading(true);
    setHasError(false);

    try {
      const freshUrl = await fetchFreshFileUrl(fileId, forceFresh);
      if (request !== requestRef.current) return;
      setImageUrl(freshUrl);
      setHasError(false);
    } catch (err) {
      if (request !== requestRef.current) return;
      console.warn(`[SecureFileImage] Não foi possível carregar URL assinada para fileId=${fileId}:`, err);
      if (safeFallback) {
        setImageUrl(safeFallback);
        setHasError(false);
      } else {
        setImageUrl(null);
        setHasError(true);
      }
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, [fileId, safeFallback]);

  useEffect(() => {
    if (!visible) return;
    setDecoded(false);
    retryCountRef.current = 0;
    loadFileUrl(false);
    return () => { requestRef.current++; };
  }, [loadFileUrl, visible]);

  const handleImageError = () => {
    if (fileId && retryCountRef.current < 1) {
      retryCountRef.current += 1;
      urlCache.delete(fileId);
      loadFileUrl(true);
      return;
    }

    if (imageUrl !== safeFallback && safeFallback) {
      setImageUrl(safeFallback);
    } else {
      setHasError(true);
    }
  };

  const handleManualRetry = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (fileId) {
      urlCache.delete(fileId);
      retryCountRef.current = 0;
      loadFileUrl(true);
    }
  };

  if (!visible) return <div ref={hostRef} className={containerClassName} style={style} />;
  if (loading) {
    return (
      <div data-image-pending="true" className={`${containerClassName} bg-slate-100 animate-pulse`} style={style}>
        <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (hasError || !imageUrl) {
    return (
      <div className={`${containerClassName} bg-slate-100 text-slate-400 select-none flex flex-col items-center justify-center p-2 text-center`} style={style}>
        <ImageIcon className="w-8 h-8 text-slate-300 mb-1" />
        <span className="text-[10px] font-medium text-slate-400">{placeholderText}</span>
        {fileId && hasError && (
          <button
            type="button"
            onClick={handleManualRetry}
            className="mt-1 flex items-center gap-1 text-[10px] text-indigo-600 hover:text-indigo-800 font-medium cursor-pointer"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Tentar novamente</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <img
      data-image-pending={!decoded}
      loading={lazy ? 'lazy' : 'eager'}
      decoding="async"
      onLoad={() => setDecoded(true)}
      src={imageUrl}
      alt={alt}
      className={className}
      style={style}
      onClick={onClick}
      onError={handleImageError}
    />
  );
};
