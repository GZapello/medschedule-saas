export const GOOGLE_LOGIN_ERROR = 'Não foi possível entrar com o Google. Tente novamente ou utilize seu e-mail e senha.';
export const GOOGLE_SIGNUP_ERROR = 'Não foi possível concluir o cadastro com o Google. Tente novamente.';

// Never stringify or inspect an external object: it can contain a cross-origin Window.
export function googleAuthError(error: unknown, context: 'login' | 'signup' | 'link' = 'login'): string {
  if (import.meta.env.DEV) {
    try { console.error('[GoogleAuth]', error); } catch { /* Diagnostics cannot interrupt auth. */ }
  }
  if (context === 'link') {
    try {
      if ((error as { message?: unknown })?.message === 'Senha incorreta para vincular conta Google.') {
        return 'Senha incorreta. Confira sua senha do Zemda e tente novamente.';
      }
    } catch { /* Unknown objects may have throwing getters. */ }
  }
  return context === 'signup' ? GOOGLE_SIGNUP_ERROR : GOOGLE_LOGIN_ERROR;
}
