import { GA_MEASUREMENT_ID } from './analytics';
import { getStoredCookieConsent } from './cookieConsent';

const sent = new Set<string>();

/** Only pass the authenticated billing summary after gateway reconciliation. */
export function trackConfirmedPurchase(purchase: unknown): void {
  const p = purchase as {transaction_id?: unknown; value?: unknown} | null;
  if (!p || typeof p.transaction_id !== 'string' || !p.transaction_id || typeof p.value !== 'number' || !Number.isFinite(p.value) || p.value <= 0) return;
  if (getStoredCookieConsent()?.analytics !== true || typeof window.gtag !== 'function') return;
  const key = `zemda_purchase_${p.transaction_id}`;
  if (sent.has(key)) return;
  try {
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, 'sent');
  } catch { /* The in-memory guard still protects React renders. */ }
  sent.add(key);
  try {
    window.gtag('event', 'purchase', {
      transaction_id: p.transaction_id, value: p.value, currency: 'BRL', send_to: GA_MEASUREMENT_ID,
      page_location: 'https://zemda.com.br/assinatura/sucesso', page_title: 'Zemda • Pagamento confirmado', page_referrer: ''
    });
  } catch { /* Tracking must never interrupt payment or access. */ }
}
