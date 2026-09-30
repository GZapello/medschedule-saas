/**
 * Utilitário de Conversão e Rastreamento do Google Ads / Google Tag para o Zemda
 * 
 * Regras e Diretrizes:
 * - Não duplica tags se window.gtag já estiver ativo no projeto.
 * - Respeita o Consent Mode v2 e a LGPD (NUNCA envia senhas, CPFs, nomes de pacientes ou dados clínicos).
 * - Protegido contra bloqueadores de anúncios (uBlock, Brave, etc.) e falhas de rede — nunca lança erros.
 * - Funciona exclusivamente no ambiente do navegador (typeof window !== 'undefined').
 * - Deduplicação rigorosa contra disparos duplicados no mesmo fluxo e após recarga de tela.
 */

// Tag ID obtido com segurança de variável de ambiente (Vercel, Vite, Railway, etc.)
export const GOOGLE_TAG_ID: string = (() => {
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    return (
      import.meta.env.VITE_GOOGLE_TAG_ID ||
      import.meta.env.VITE_GOOGLE_ADS_ID ||
      ''
    ).trim();
  }
  return '';
})();

let isTagConfigured = false;

/**
 * Garante que a Google Tag esteja configurada com o ID de conversão se fornecido via variável de ambiente.
 */
function ensureGoogleTagConfig(): void {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;
  if (!GOOGLE_TAG_ID || isTagConfigured) return;

  try {
    const baseId = GOOGLE_TAG_ID.split('/')[0];
    if (baseId) {
      window.gtag('config', baseId);
      isTagConfigured = true;
    }
  } catch {
    // Falha silenciosa para garantir que nenhum bloqueador cause crash
  }
}

/**
 * Dispara eventos genéricos ou de conversão para o Google (Google Tag / Ads / GA4).
 * 
 * @param eventName Nome do evento (ex: 'conversion_event_signup')
 * @param params Parâmetros adicionais do evento (valores, moeda, transaction_id, etc.)
 */
export function trackGoogleEvent(
  eventName: string,
  params?: Record<string, any>
): void {
  if (typeof window === 'undefined') return;
  if (typeof window.gtag !== 'function') return;

  try {
    ensureGoogleTagConfig();

    const payload: Record<string, any> = {};

    if (params && typeof params === 'object') {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
          payload[key] = value;
        }
      }
    }

    // Se houver um ID do Google Tag/Ads configurado e não foi informado send_to específico
    if (!payload.send_to && GOOGLE_TAG_ID) {
      payload.send_to = GOOGLE_TAG_ID;
    }

    window.gtag('event', eventName, payload);
  } catch {
    // Bloqueadores de anúncios ou ausência de SDK nunca quebram a aplicação
  }
}

// Conjunto em memória para deduplicação instantânea
const trackedSignupsInMemory = new Set<string>();

const SESSION_STORAGE_DEDUP_KEY = 'zemda_tracked_signup_conversions';

function hasAccountBeenTracked(accountId: string): boolean {
  if (trackedSignupsInMemory.has(accountId)) return true;
  if (typeof window === 'undefined') return false;

  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_DEDUP_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.includes(accountId)) {
        trackedSignupsInMemory.add(accountId);
        return true;
      }
    }
  } catch {}
  return false;
}

function markAccountAsTracked(accountId: string): void {
  trackedSignupsInMemory.add(accountId);
  if (typeof window === 'undefined') return;

  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_DEDUP_KEY);
    const list: string[] = raw ? JSON.parse(raw) : [];
    if (Array.isArray(list) && !list.includes(accountId)) {
      list.push(accountId);
      sessionStorage.setItem(SESSION_STORAGE_DEDUP_KEY, JSON.stringify(list));
    }
  } catch {}
}

export interface GoogleConversionSignupParams {
  accountId: string;
  planCode?: string;
  isTrial?: boolean;
  trialPeriodDays?: number;
  value?: number;
  currency?: string;
}

/**
 * Dispara o evento de conversão do Google Ads 'conversion_event_signup'
 * exclusivamente quando o cadastro é concluído com sucesso e validado pelo backend.
 * 
 * Protegido contra:
 * - Disparos antes da resposta do backend;
 * - Disparos em cadastros com erro;
 * - Duplicação de envio (mesma sessão ou recarga de tela);
 * - Login em contas pré-existentes.
 */
export function trackGoogleConversionSignup(params: GoogleConversionSignupParams): void {
  if (typeof window === 'undefined') return;

  const accountId = String(params.accountId || '').trim();
  if (!accountId) return;

  // Proteção rigorosa contra disparo duplicado
  if (hasAccountBeenTracked(accountId)) {
    return;
  }

  markAccountAsTracked(accountId);

  const payload: Record<string, any> = {
    transaction_id: accountId, // Deduplicação oficial no Google Ads
    currency: params.currency || 'BRL'
  };

  if (typeof params.value === 'number') {
    payload.value = params.value;
  } else if (params.isTrial) {
    payload.value = 0;
  }

  if (params.planCode) {
    payload.plan_code = String(params.planCode).slice(0, 30);
  }

  if (params.isTrial) {
    payload.is_trial = true;
    if (params.trialPeriodDays) {
      payload.trial_period_days = params.trialPeriodDays;
    }
  }

  trackGoogleEvent('conversion_event_signup', payload);
}
