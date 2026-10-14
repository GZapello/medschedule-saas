export const GOOGLE_LOGIN_ERROR = 'Este navegador não conseguiu concluir o acesso com Google. Tente novamente ou utilize seu e-mail e senha.';
export const GOOGLE_SIGNUP_ERROR = 'Este navegador não conseguiu concluir o acesso com Google. Tente novamente ou utilize seu e-mail e senha.';

// Never stringify or inspect an external object: it can contain a cross-origin Window.
export function googleAuthError(error: unknown, context: 'login' | 'signup' | 'link' = 'login'): string {
  if (import.meta.env.DEV) {
    try {
      const msg = typeof error === 'string' ? error : (error instanceof Error ? error.message : '');
      console.warn('[GoogleAuth]', msg || 'Authentication error');
    } catch { /* Diagnostics cannot interrupt auth. */ }
  }
  if (context === 'link') {
    try {
      if ((error as { message?: unknown })?.message === 'Senha incorreta para vincular conta Google.') {
        return 'Senha incorreta. Confira sua senha do Zemda e tente novamente.';
      }
    } catch { /* Unknown objects may have throwing getters. */ }
  }
  return GOOGLE_LOGIN_ERROR;
}

