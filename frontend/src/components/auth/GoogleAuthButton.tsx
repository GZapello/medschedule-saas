import React, { useEffect, useRef, useState } from 'react';

export { GOOGLE_LOGIN_ERROR } from './googleAuthErrors';
import { GOOGLE_LOGIN_ERROR, googleAuthError } from './googleAuthErrors';

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
    googleAuthError(err);
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
  onSuccess: (idToken: string) => void | Promise<void>;
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

// GIS maintains one global configuration: initialize once and route the response to
// the button actually clicked, even when login and signup are both mounted.
let gsiLoad: Promise<void> | null = null;
let initializedClient = '';
const receivers = new Map<string, (credential: unknown) => void>();
let nextButton = 0;
function loadGsi(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (gsiLoad) return gsiLoad;
  gsiLoad = new Promise<void>((resolve, reject) => {
    let script = document.getElementById('google-gsi-client') as HTMLScriptElement | null;
    const finish = (error?: Error) => {
      clearTimeout(timeout); clearInterval(poll);
      script?.removeEventListener('error', failed);
      if (error) { script?.remove(); gsiLoad = null; reject(error); } else resolve();
    };
    const failed = () => finish(new Error('Serviço de autenticação temporariamente indisponível.'));
    const timeout = window.setTimeout(failed, 12000);
    const poll = window.setInterval(() => { if (window.google?.accounts?.id) finish(); }, 100);
    if (!script) {
      script = document.createElement('script'); script.id = 'google-gsi-client';
      script.src = 'https://accounts.google.com/gsi/client?hl=pt-BR'; script.async = true; script.defer = true;
      script.addEventListener('error', failed); document.head.appendChild(script);
    } else script.addEventListener('error', failed);
  });
  return gsiLoad;
}

export const GoogleAuthButton: React.FC<GoogleAuthButtonProps> = ({
  onSuccess, onError, text = 'continue_with', theme = 'outline', shape = 'rectangular',
  size = 'large', width, disabled = false, className = '', customLabel
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const callbacks = useRef({onSuccess,onError,disabled});
  callbacks.current = {onSuccess,onError,disabled};
  const [error,setError] = useState('');
  const [ready,setReady] = useState(false);
  const [attempt,setAttempt] = useState(0);
  const clientId = (import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim();
  useEffect(() => {
    let live = true;
    let responseTimer: number | undefined;
    const buttonState = `zemda-google-${++nextButton}`;
    let pending = false;
    const fail = (message?: string) => {
      if (!live) return;
      setError(GOOGLE_LOGIN_ERROR);
      if (message) googleAuthError(message);
      callbacks.current.onError?.(GOOGLE_LOGIN_ERROR);
    };
    const receive = (credential: unknown) => {
      if (!live || !pending || callbacks.current.disabled) return;
      pending = false;
      clearTimeout(responseTimer);
      if (typeof credential !== 'string' || !credential.trim()) {
        fail('Credencial vazia ou inválida'); return;
      }
      setError('');
      // Only the primitive token crosses the GIS/application boundary.
      Promise.resolve().then(() => { if (live && !callbacks.current.disabled) return callbacks.current.onSuccess(credential); }).catch(error => {
        googleAuthError(error);
        if (live) fail('Processamento da credencial falhou');
      });
    };
    setError(''); setReady(false);
    if (!/^[\w-]+\.apps\.googleusercontent\.com$/.test(clientId)) {
      fail('Configuração de autenticação indisponível');
      return () => { live=false; };
    }
    if (!window.isSecureContext) {
      fail('Ambiente seguro obrigatório');
      return () => { live=false; };
    }
    loadGsi().then(() => {
      if (!live || !containerRef.current) return;
      const api = window.google!.accounts!.id!;
      if (initializedClient !== clientId) {
        api.initialize({
          client_id: clientId,
          ux_mode: 'popup',
          callback: response => {
            if (typeof response?.state === 'string') receivers.get(response.state)?.(response.credential);
          },
          // Compatible popup flow across Chrome, Edge, Opera, Firefox, Safari.
          // Never force FedCM where unsupported or restricted.
          use_fedcm_for_button: false,
          // Intelligent Tracking Prevention (ITP) for Safari, WebKit and Firefox.
          itp_support: true,
          button_auto_select: false,
          auto_select: false
        });
        initializedClient = clientId;
      }
      receivers.set(buttonState, receive);
      containerRef.current.replaceChildren();
      api.renderButton(containerRef.current,{type:'standard',theme,size,text,shape,logo_alignment:'left',
        width:Math.min(typeof width==='number'?width:320,Math.max(200,containerRef.current.clientWidth || 320)),locale:'pt-BR',state:buttonState,
        click_listener:() => {
          if (callbacks.current.disabled) return;
          pending = true;
          setError(''); clearTimeout(responseTimer);
          responseTimer = window.setTimeout(() => { pending = false; fail('Tempo limite esgotado.'); }, 45000);
        }});
      setReady(true);
    }).catch(e => { googleAuthError(e); fail('Falha ao inicializar autenticação Google'); });
    return () => {
      live=false; clearTimeout(responseTimer);
      receivers.delete(buttonState);
    };
  },[clientId,text,theme,shape,size,width,attempt]);
  return <div className={`w-full flex flex-col items-center gap-2 ${className}`}>
    <div ref={containerRef} {...(disabled ? {inert: ''} : {})} aria-disabled={disabled} className={`w-full flex items-center justify-center min-h-[40px] ${disabled?'pointer-events-none opacity-50':''}`} />
    {!ready&&!error&&<p role="status" className="text-xs text-slate-500">Carregando {customLabel || 'login Google'}…</p>}
    {error&&<div role="alert" className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-xl p-3 max-w-sm"><p>{error}</p><button type="button" disabled={disabled} className="underline font-semibold mt-2" onClick={()=>setAttempt(v=>v+1)}>Tentar novamente</button></div>}
  </div>;
};
