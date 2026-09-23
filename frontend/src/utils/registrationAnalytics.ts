import { GA_MEASUREMENT_ID } from './analytics';
import { getStoredCookieConsent } from './cookieConsent';

// Local deduplication only: account IDs are never included in analytics payloads.
const completedAccounts = new Set<string>();

/** Retorna o contexto responsivo do dispositivo ('mobile' | 'tablet' | 'desktop') sem qualquer PII. */
export function getDeviceContext(): 'mobile' | 'tablet' | 'desktop' {
  if (typeof window === 'undefined') return 'desktop';
  const width = window.innerWidth;
  if (width < 640) return 'mobile';
  if (width < 1024) return 'tablet';
  return 'desktop';
}

/** Sanitiza códigos de erro técnicos garantindo identificadores maiúsculos/alfanuméricos sem PII. */
export function sanitizeErrorCode(rawCode: unknown): string {
  if (typeof rawCode !== 'string' || !rawCode.trim()) return 'UNKNOWN_ERROR';
  const cleaned = rawCode.trim().replace(/[^a-zA-Z0-9_]/g, '_').toUpperCase().slice(0, 40);
  return cleaned || 'UNKNOWN_ERROR';
}

/** 1. signup_open: Disparar quando o usuário abrir o modal/tela "Criar Minha Conta". */
export function trackSignupOpen(meta?: { planCode?: string; professionCode?: string }): void {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;
  if (getStoredCookieConsent()?.analytics !== true) return;

  const payload: Record<string, any> = {
    send_to: GA_MEASUREMENT_ID,
    signup_step: 'form',
    device_context: getDeviceContext(),
    page_location: 'https://zemda.com.br/cadastro',
    page_title: 'Zemda • Criar Conta'
  };
  if (meta?.planCode) payload.plan_code = String(meta.planCode).slice(0, 30);
  if (meta?.professionCode) payload.profession_code = String(meta.professionCode).slice(0, 50);

  try {
    window.gtag('event', 'signup_open', payload);
  } catch {}
}

/** 2. signup_started: Disparar uma única vez quando o usuário começar efetivamente a preencher o cadastro. */
export function trackSignupStarted(meta?: { planCode?: string; professionCode?: string }): void {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;
  if (getStoredCookieConsent()?.analytics !== true) return;

  const payload: Record<string, any> = {
    send_to: GA_MEASUREMENT_ID,
    signup_step: 'form',
    device_context: getDeviceContext(),
    page_location: 'https://zemda.com.br/cadastro',
    page_title: 'Zemda • Criar Conta'
  };
  if (meta?.planCode) payload.plan_code = String(meta.planCode).slice(0, 30);
  if (meta?.professionCode) payload.profession_code = String(meta.professionCode).slice(0, 50);

  try {
    window.gtag('event', 'signup_started', payload);
  } catch {}
}

/** 3. signup_email_validation: Disparar quando o usuário avançar para a etapa de validação de e-mail. */
export function trackSignupEmailValidation(meta?: { planCode?: string; professionCode?: string }): void {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;
  if (getStoredCookieConsent()?.analytics !== true) return;

  const payload: Record<string, any> = {
    send_to: GA_MEASUREMENT_ID,
    signup_step: 'verify_email',
    device_context: getDeviceContext(),
    page_location: 'https://zemda.com.br/cadastro',
    page_title: 'Zemda • Validação de E-mail'
  };
  if (meta?.planCode) payload.plan_code = String(meta.planCode).slice(0, 30);
  if (meta?.professionCode) payload.profession_code = String(meta.professionCode).slice(0, 50);

  try {
    window.gtag('event', 'signup_email_validation', payload);
  } catch {}
}

/** 4. signup_email_verified: Disparar somente após o e-mail ser validado com sucesso. */
export function trackSignupEmailVerified(meta?: { planCode?: string; professionCode?: string }): void {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;
  if (getStoredCookieConsent()?.analytics !== true) return;

  const payload: Record<string, any> = {
    send_to: GA_MEASUREMENT_ID,
    signup_step: 'plans',
    device_context: getDeviceContext(),
    page_location: 'https://zemda.com.br/cadastro',
    page_title: 'Zemda • E-mail Verificado'
  };
  if (meta?.planCode) payload.plan_code = String(meta.planCode).slice(0, 30);
  if (meta?.professionCode) payload.profession_code = String(meta.professionCode).slice(0, 50);

  try {
    window.gtag('event', 'signup_email_verified', payload);
  } catch {}
}

/** 5. signup_plan_selected: Disparar quando o usuário selecionar um plano. */
export function trackSignupPlanSelected(planCode: string, meta?: { professionCode?: string }): void {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;
  if (getStoredCookieConsent()?.analytics !== true) return;
  if (!planCode || typeof planCode !== 'string') return;

  const payload: Record<string, any> = {
    send_to: GA_MEASUREMENT_ID,
    plan_code: String(planCode).slice(0, 30),
    signup_step: 'plans',
    device_context: getDeviceContext(),
    page_location: 'https://zemda.com.br/cadastro',
    page_title: 'Zemda • Escolha de Plano'
  };
  if (meta?.professionCode) payload.profession_code = String(meta.professionCode).slice(0, 50);

  try {
    window.gtag('event', 'signup_plan_selected', payload);
  } catch {}
}

/** 6. signup_submit: Disparar quando o usuário tentar finalizar o cadastro. */
export function trackSignupSubmit(meta?: { planCode?: string; professionCode?: string }): void {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;
  if (getStoredCookieConsent()?.analytics !== true) return;

  const payload: Record<string, any> = {
    send_to: GA_MEASUREMENT_ID,
    signup_step: 'plans',
    device_context: getDeviceContext(),
    page_location: 'https://zemda.com.br/cadastro',
    page_title: 'Zemda • Criando Conta'
  };
  if (meta?.planCode) payload.plan_code = String(meta.planCode).slice(0, 30);
  if (meta?.professionCode) payload.profession_code = String(meta.professionCode).slice(0, 50);

  try {
    window.gtag('event', 'signup_submit', payload);
  } catch {}
}

/** 7. sign_up & 8. trial_started: PRESERVAR eventos existentes (apenas após sucesso real). */
export function trackCompletedRegistration(
  accountId: unknown,
  trialPeriodDays?: number,
  meta?: { planCode?: string; professionCode?: string }
): void {
  if (typeof window === 'undefined' || typeof accountId !== 'string' || !accountId.trim()) return;
  if (completedAccounts.has(accountId) || getStoredCookieConsent()?.analytics !== true) return;
  if (typeof window.gtag !== 'function') return;

  // Mark before sending so an ambiguous SDK error cannot cause a duplicate retry.
  completedAccounts.add(accountId);
  const context: Record<string, any> = {
    send_to: GA_MEASUREMENT_ID,
    // Never inherit invite/trial tokens, form parameters or private referrers.
    page_location: 'https://zemda.com.br/login',
    page_title: 'Zemda • Cadastro concluído',
    page_referrer: '',
    signup_step: 'completed',
    device_context: getDeviceContext()
  };
  if (meta?.planCode) context.plan_code = String(meta.planCode).slice(0, 30);
  if (meta?.professionCode) context.profession_code = String(meta.professionCode).slice(0, 50);

  try {
    window.gtag('event', 'sign_up', { method: 'email', ...context });
  } catch {
    // Analytics must never interrupt successful registration or authentication.
  }
  if (typeof trialPeriodDays === 'number' && Number.isInteger(trialPeriodDays) && trialPeriodDays > 0) {
    try {
      window.gtag('event', 'trial_started', { trial_period_days: trialPeriodDays, ...context });
    } catch {
      // Keep the existing success flow independent of the tracking provider.
    }
  }
}

/** 9. signup_error: Disparar quando ocorrer erro durante o cadastro (sem dados pessoais). */
export function trackSignupError(params: {
  step: 'form' | 'initial_data' | 'profession' | 'security' | 'verify_email' | 'plans' | string;
  errorCode?: string;
  errorType?: 'validation' | 'api_error' | 'server_error' | 'network_error' | 'unknown';
  planCode?: string;
  professionCode?: string;
}): void {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;
  if (getStoredCookieConsent()?.analytics !== true) return;

  const payload: Record<string, any> = {
    send_to: GA_MEASUREMENT_ID,
    step: params.step,
    signup_step: params.step,
    error_code: sanitizeErrorCode(params.errorCode),
    error_type: params.errorType || 'unknown',
    device_context: getDeviceContext(),
    page_location: 'https://zemda.com.br/cadastro',
    page_title: 'Zemda • Erro no Cadastro'
  };
  if (params.planCode) payload.plan_code = String(params.planCode).slice(0, 30);
  if (params.professionCode) payload.profession_code = String(params.professionCode).slice(0, 50);

  try {
    window.gtag('event', 'signup_error', payload);
  } catch {}
}

/** 10. login_started: Separar o início do login do cadastro para não misturar com form_start. */
export function trackLoginStarted(params?: { method?: string }): void {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;
  if (getStoredCookieConsent()?.analytics !== true) return;

  const payload: Record<string, any> = {
    send_to: GA_MEASUREMENT_ID,
    method: params?.method || 'email',
    device_context: getDeviceContext(),
    page_location: 'https://zemda.com.br/login',
    page_title: 'Zemda • Acesso'
  };

  try {
    window.gtag('event', 'login_started', payload);
  } catch {}
}
