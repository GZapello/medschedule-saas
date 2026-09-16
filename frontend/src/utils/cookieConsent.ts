/**
 * Utilitário de Gerenciamento de Consentimento de Cookies e Google Consent Mode v2
 * Plataforma Zemda
 */

export interface CookieConsentState {
  necessary: boolean; // Sempre ativo (autenticação, sessão, segurança, funcionamento)
  analytics: boolean; // Google Analytics 4 (anônimo, sem PII/dados clínicos)
  marketing: boolean; // Publicidade/Marketing (inativo por padrão)
  timestamp: string;
  version: string;
}

export const COOKIE_CONSENT_STORAGE_KEY = 'zemda_cookie_consent';
export const COOKIE_CONSENT_VERSION = '2026.1';

declare global {
  interface Window {
    gtag?: (...args: any[]) => void;
    dataLayer?: any[];
  }
}

/**
 * Retorna o consentimento atualmente salvo no navegador, ou null se for a primeira visita.
 */
export function getStoredCookieConsent(): CookieConsentState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.analytics === 'boolean') {
      return parsed as CookieConsentState;
    }
  } catch (_) {}
  return null;
}

/**
 * Atualiza o Google Consent Mode v2 via gtag('consent', 'update', ...)
 */
export function applyGtagConsent(analyticsGranted: boolean): void {
  if (typeof window === 'undefined') return;

  if (typeof window.gtag === 'function') {
    window.gtag('consent', 'update', {
      analytics_storage: analyticsGranted ? 'granted' : 'denied',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied'
    });
  } else if (Array.isArray(window.dataLayer)) {
    window.dataLayer.push([
      'consent',
      'update',
      {
        analytics_storage: analyticsGranted ? 'granted' : 'denied',
        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied'
      }
    ]);
  }
}

/**
 * Salva a escolha de consentimento do usuário e atualiza os serviços.
 */
export function saveCookieConsent(choices: { analytics: boolean; marketing?: boolean }): CookieConsentState {
  const consent: CookieConsentState = {
    necessary: true,
    analytics: Boolean(choices.analytics),
    marketing: false, // Inativo no Zemda
    timestamp: new Date().toISOString(),
    version: COOKIE_CONSENT_VERSION
  };

  try {
    localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, JSON.stringify(consent));
  } catch (_) {}

  applyGtagConsent(consent.analytics);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('zemda-cookie-consent-changed', { detail: consent }));
  }

  return consent;
}

/**
 * Aceitar todos os cookies aplicáveis (Necessários + Analytics).
 */
export function acceptAllCookies(): CookieConsentState {
  return saveCookieConsent({ analytics: true, marketing: false });
}

/**
 * Rejeitar cookies não necessários (Apenas Necessários permanecem ativos).
 */
export function rejectNonEssentialCookies(): CookieConsentState {
  return saveCookieConsent({ analytics: false, marketing: false });
}

/**
 * Dispara evento global para abrir o modal de preferências de cookies de qualquer lugar da aplicação.
 */
export function openCookiePreferencesModal(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('open-cookie-preferences'));
  }
}
