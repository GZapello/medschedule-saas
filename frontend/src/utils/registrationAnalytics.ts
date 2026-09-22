import { GA_MEASUREMENT_ID } from './analytics';
import { getStoredCookieConsent } from './cookieConsent';

// Local deduplication only: account IDs are never included in analytics payloads.
const completedAccounts = new Set<string>();

/** Call only from a confirmed account-creation response, never from a React effect. */
export function trackCompletedRegistration(accountId: unknown, trialPeriodDays?: number): void {
  if (typeof window === 'undefined' || typeof accountId !== 'string' || !accountId.trim()) return;
  if (completedAccounts.has(accountId) || getStoredCookieConsent()?.analytics !== true) return;
  if (typeof window.gtag !== 'function') return;

  // Mark before sending so an ambiguous SDK error cannot cause a duplicate retry.
  completedAccounts.add(accountId);
  const context = {
    send_to: GA_MEASUREMENT_ID,
    // Never inherit invite/trial tokens, form parameters or private referrers.
    page_location: 'https://zemda.com.br/login',
    page_title: 'Zemda • Cadastro concluído',
    page_referrer: ''
  };
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
