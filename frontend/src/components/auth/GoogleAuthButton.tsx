import React, { useEffect, useRef, useState } from 'react';

export interface GoogleJwtPayload {
  sub: string;
  email: string;
  email_verified: boolean;
  name: string;
  picture?: string;
  given_name?: string;
  family_name?: string;
}

export function parseJwtPayload(token: string): GoogleJwtPayload | null {
  try {
    const base64Url = token.split('.')[1];
    if (!base64Url) return null;
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (err) {
    console.warn('[GoogleAuth] Falha ao decodificar token no frontend:', err);
    return null;
  }
}

export const GoogleIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      fill="#4285F4"
    />
    <path
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      fill="#34A853"
    />
    <path
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
      fill="#FBBC05"
    />
    <path
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
      fill="#EA4335"
    />
  </svg>
);

interface GoogleAuthButtonProps {
  onSuccess: (idToken: string, payload?: GoogleJwtPayload) => void;
  onError?: (error: string) => void;
  text?: 'continue_with' | 'signin_with' | 'signup_with';
  theme?: 'outline' | 'filled_blue' | 'filled_black';
  shape?: 'rectangular' | 'pill' | 'circle' | 'square';
  size?: 'large' | 'medium' | 'small';
  width?: number | string;
  disabled?: boolean;
  className?: string;
  customLabel?: string;
}

export const GoogleAuthButton: React.FC<GoogleAuthButtonProps> = ({
  onSuccess,
  onError,
  text = 'continue_with',
  theme = 'outline',
  shape = 'rectangular',
  size = 'large',
  width,
  disabled = false,
  className = '',
  customLabel
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [initFailed, setInitFailed] = useState(false);

  const clientId = (import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim();

  // 1. Carrega o script Google Identity Services uma única vez
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (window.google?.accounts?.id) {
      setScriptLoaded(true);
      return;
    }

    const existingScript = document.getElementById('google-gsi-client');
    if (existingScript) {
      const checkInterval = setInterval(() => {
        if (window.google?.accounts?.id) {
          clearInterval(checkInterval);
          setScriptLoaded(true);
        }
      }, 100);
      return () => clearInterval(checkInterval);
    }

    const script = document.createElement('script');
    script.id = 'google-gsi-client';
    script.src = 'https://accounts.google.com/gsi/client?hl=pt-BR';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      setScriptLoaded(true);
    };
    script.onerror = () => {
      console.error('[GoogleAuth] Falha ao carregar script do Google Identity Services.');
      setInitFailed(true);
      onError?.('Não foi possível abrir o login do Google. Atualize a página e tente novamente.');
    };
    document.head.appendChild(script);
  }, [onError]);

  // 2. Inicializa e renderiza o botão oficial do Google
  useEffect(() => {
    if (!scriptLoaded || !containerRef.current || !clientId || disabled) return;

    try {
      window.google?.accounts?.id?.initialize({
        client_id: clientId,
        callback: (response: { credential: string }) => {
          if (!response.credential) {
            onError?.('Credencial não retornada pelo Google.');
            return;
          }
          const payload = parseJwtPayload(response.credential);
          onSuccess(response.credential, payload || undefined);
        },
        use_fedcm_for_button: true,
        button_auto_select: false,
        auto_select: false
      });

      // Limpa renderizações anteriores
      containerRef.current.innerHTML = '';

      window.google?.accounts?.id?.renderButton(containerRef.current, {
        type: 'standard',
        theme,
        size,
        text,
        shape,
        logo_alignment: 'left',
        width: typeof width === 'number' ? width : 320,
        locale: 'pt-BR'
      });
    } catch (err: any) {
      console.error('[GoogleAuth] Erro ao renderizar botão oficial:', err);
      setInitFailed(true);
      onError?.('Não foi possível abrir o login do Google. Atualize a página e tente novamente.');
    }
  }, [scriptLoaded, clientId, text, theme, shape, size, width, disabled, onSuccess, onError]);

  // Se o Client ID não estiver configurado no ambiente
  if (!clientId) {
    return (
      <div className={`w-full flex justify-center ${className}`}>
        <button
          type="button"
          disabled
          title="VITE_GOOGLE_CLIENT_ID não configurado"
          className="w-full max-w-[320px] py-2.5 px-4 rounded-xl border border-slate-200 bg-slate-50 text-slate-400 font-semibold text-xs flex items-center justify-center gap-2.5 opacity-60 cursor-not-allowed shadow-2xs"
        >
          <GoogleIcon className="w-4 h-4 grayscale opacity-60" />
          <span>{customLabel || 'Continuar com Google'}</span>
        </button>
      </div>
    );
  }

  // Fallback caso a renderização oficial do iframe do Google falhe (ex: adblock)
  if (initFailed) {
    return (
      <div className={`w-full flex justify-center ${className}`}>
        <button
          type="button"
          onClick={() => {
            onError?.('Não foi possível abrir o login do Google. Atualize a página e tente novamente.');
          }}
          className="w-full max-w-[320px] py-2.5 px-4 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center justify-center gap-2.5 transition-all shadow-2xs cursor-pointer"
        >
          <GoogleIcon className="w-4 h-4" />
          <span>{customLabel || 'Continuar com Google'}</span>
        </button>
      </div>
    );
  }

  return (
    <div className={`w-full flex flex-col items-center justify-center ${className}`}>
      {/* Container onde o Google Identity Services injeta o botão oficial */}
      <div
        ref={containerRef}
        className="w-full flex items-center justify-center overflow-hidden min-h-[40px]"
      />
    </div>
  );
};
