export const GOOGLE_LOGIN_ERROR = 'Este navegador não conseguiu concluir o acesso com Google. Tente novamente ou utilize seu e-mail e senha.';
export const GOOGLE_SIGNUP_ERROR = 'Não foi possível concluir o cadastro com Google. Tente novamente ou cadastre-se com e-mail e senha.';

/**
 * Mapeia erros de autenticação do Google para mensagens claras, amigáveis e informativas.
 * Diferencia cancelamento pelo usuário, falha de rede, e-mail já existente, token inválido,
 * erros de validação e instabilidade do servidor, sem culpar o navegador por erros de backend.
 */
export function googleAuthError(error: unknown, context: 'login' | 'signup' | 'link' = 'login'): string {
  let code = '';
  let msg = '';
  let status = 0;

  try {
    if (typeof error === 'string') {
      msg = error;
    } else if (error && typeof error === 'object') {
      const errObj = error as Record<string, any>;
      code = typeof errObj.code === 'string' ? errObj.code : '';
      status = typeof errObj.status === 'number' ? errObj.status : (typeof errObj.statusCode === 'number' ? errObj.statusCode : 0);
      msg = typeof errObj.message === 'string' ? errObj.message : (typeof errObj.error === 'string' ? errObj.error : '');
    }
  } catch {
    // Evita interrupção caso objetos externos tenham getters que lancem exceção
  }

  if (typeof import.meta !== 'undefined' && (import.meta as any)?.env?.DEV) {
    try {
      console.warn('[GoogleAuth]', { code, status, msg: msg || 'Authentication error', context });
    } catch { /* Ignora em DEV */ }
  }

  // 1. Contexto de vinculação de conta
  if (context === 'link') {
    if (msg.includes('Senha incorreta') || code === 'INVALID_PASSWORD') {
      return 'Senha incorreta. Confira sua senha do Zemda e tente novamente.';
    }
  }

  // 2. Cancelamento da autorização pelo usuário ou fechamento do popup
  if (
    code === 'POPUP_CLOSED' ||
    /popup_closed|access_denied|user_cancel|abort|cancel/i.test(msg) ||
    /fechou|cancelou/i.test(msg)
  ) {
    return 'A autorização com o Google foi cancelada. Clique no botão para continuar quando desejar.';
  }

  // 3. Google Identity Services indisponível ou falha de script
  if (
    /indisponível|temporariamente indisponível|gsi|failed to load/i.test(msg) ||
    msg.includes('Falha ao inicializar autenticação')
  ) {
    return 'O serviço do Google está temporariamente indisponível. Aguarde alguns instantes ou use seu e-mail e senha.';
  }

  // 4. Falha de rede ou timeout
  if (
    /network|failed to fetch|conexão|internet|timeout|tempo limite/i.test(msg) ||
    code === 'NETWORK_ERROR' ||
    code === 'ECONNABORTED'
  ) {
    return 'Falha de conexão com a internet. Verifique sua rede e tente novamente.';
  }

  // 5. Token Google inválido ou expirado
  if (
    code === 'INVALID_GOOGLE_TOKEN' ||
    /token.*inválido|token.*expirado|credencial.*(inválid|expirad)|jwt/i.test(msg)
  ) {
    return 'Sua credencial do Google expirou ou é inválida. Por favor, clique novamente para autorizar.';
  }

  // 6. E-mail já cadastrado ou conta Google já vinculada
  if (code === 'ACCOUNT_EXISTS' || msg.includes('já possui uma conta cadastrada com este Google')) {
    return 'Você já possui uma conta cadastrada com este Google. Faça login para acessar.';
  }
  if (code === 'EMAIL_ALREADY_EXISTS' || msg.includes('já está cadastrado')) {
    return 'Este e-mail do Google já está cadastrado no Zemda. Faça login para vincular sua conta.';
  }

  // 7. Plano inválido
  if (code === 'PLAN_INVALID' || msg.includes('plano')) {
    return 'O plano selecionado não é válido. Por favor, selecione um plano disponível.';
  }

  // 8. Dados obrigatórios ausentes ou erro de validação
  if (code === 'VALIDATION_ERROR' || (status === 400 && msg && !msg.toLowerCase().includes('google'))) {
    return msg;
  }

  // 9. Bloqueio de usuário ou clínica
  if (code === 'USER_BLOCKED' || code === 'CLINIC_BLOCKED' || code === 'CLINIC_BANNED') {
    return msg || 'Seu acesso está temporariamente indisponível. Entre em contato com a administração.';
  }

  // 10. Erro interno do servidor ou falha de transação no backend
  if (
    status >= 500 ||
    code === 'INTERNAL_SERVER_ERROR' ||
    code === 'SIGNUP_TRANSACTION_FAILED' ||
    /servidor|instabilidade/i.test(msg)
  ) {
    return 'Ocorreu uma instabilidade no servidor ao concluir seu cadastro. Por favor, tente novamente em instantes.';
  }

  // Se houver mensagem específica amigável (sem vazar SQL/banco)
  if (msg && !/sqlite|syntax|sql|insert into|syntaxerror|constraint/i.test(msg)) {
    return msg;
  }

  return context === 'signup' ? GOOGLE_SIGNUP_ERROR : GOOGLE_LOGIN_ERROR;
}
