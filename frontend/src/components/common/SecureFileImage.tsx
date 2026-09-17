import React, { useState, useEffect } from 'react';
import { ApiClient } from '../../api/client';
import { Image as ImageIcon } from 'lucide-react';

export interface SecureFileImageProps {
  fileId?: string | null;
  fallbackUrl?: string | null;
  alt?: string;
  className?: string;
  containerClassName?: string;
  placeholderText?: string;
  onClick?: () => void;
}

// Cache simples em memória para evitar chamadas duplicadas aos endpoints de assinatura
const urlCache = new Map<string, { url: string; expiresAt: number }>();

export const SecureFileImage: React.FC<SecureFileImageProps> = ({
  fileId,
  fallbackUrl,
  alt = 'Imagem',
  className = 'w-full h-full object-cover',
  containerClassName = 'w-full h-full flex items-center justify-center',
  placeholderText = 'Sem foto',
  onClick
}) => {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [hasError, setHasError] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;
    setHasError(false);

    if (fileId) {
      // 1. Checa no cache se já existe uma URL válida e não expirada
      const cached = urlCache.get(fileId);
      const now = Date.now();
      if (cached && cached.expiresAt > now + 30000) {
        setImageUrl(cached.url);
        return;
      }

      setLoading(true);
      ApiClient.get<{ url: string; expiresIn?: number }>(`/files/${encodeURIComponent(fileId)}/url`)
        .then((res) => {
          if (!isMounted) return;
          if (res && res.url) {
            const expSec = res.expiresIn || 300;
            urlCache.set(fileId, {
              url: res.url,
              expiresAt: Date.now() + (expSec - 30) * 1000
            });
            setImageUrl(res.url);
          } else if (fallbackUrl) {
            setImageUrl(fallbackUrl);
          } else {
            setImageUrl(null);
          }
        })
        .catch((err) => {
          if (!isMounted) return;
          console.warn(`[SecureFileImage] Não foi possível carregar URL assinada para fileId=${fileId}:`, err);
          if (fallbackUrl) {
            setImageUrl(fallbackUrl);
          } else {
            setHasError(true);
          }
        })
        .finally(() => {
          if (isMounted) setLoading(false);
        });
    } else if (fallbackUrl) {
      setImageUrl(fallbackUrl);
      setLoading(false);
    } else {
      setImageUrl(null);
      setLoading(false);
    }

    return () => {
      isMounted = false;
    };
  }, [fileId, fallbackUrl]);

  if (loading) {
    return (
      <div className={`${containerClassName} bg-slate-100 animate-pulse`}>
        <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (hasError || !imageUrl) {
    return (
      <div className={`${containerClassName} bg-slate-100 text-slate-400 select-none`}>
        <div className="flex flex-col items-center justify-center gap-1 p-2 text-center">
          <ImageIcon className="w-8 h-8 text-slate-300" />
          <span className="text-[10px] font-medium text-slate-400">{placeholderText}</span>
        </div>
      </div>
    );
  }

  return (
    <img
      src={imageUrl}
      alt={alt}
      className={className}
      onClick={onClick}
      onError={() => {
        // Se falhar a URL do worker e tiver fallbackUrl não testada ainda
        if (imageUrl !== fallbackUrl && fallbackUrl) {
          setImageUrl(fallbackUrl);
        } else {
          setHasError(true);
        }
      }}
    />
  );
};
