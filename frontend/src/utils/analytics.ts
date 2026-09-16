/**
 * Utilitário de Analytics (Google Analytics 4) para o Zemda
 * 
 * REGRAS DE PRIVACIDADE E LGPD:
 * NUNCA enviar ao Google Analytics:
 * - Nome de pacientes
 * - CPF, RG ou documentos
 * - Telefone ou e-mail
 * - Prontuários, diagnósticos, anotações clínicas
 * - Medicamentos, prescrições ou exames
 * - Anexos ou dados sensíveis de saúde
 *
 * Este utilitário garante que apenas dados genéricos de navegação e telas
 * sejam registrados na SPA, prevenindo disparos duplicados.
 */

declare global {
  interface Window {
    dataLayer?: any[];
    gtag?: (...args: any[]) => void;
  }
}

export const GA_MEASUREMENT_ID = 'G-QFFJ7Y25ML';

let lastTrackedPath: string | null = null;

/**
 * Registra visualização de página na SPA de forma segura e anônima.
 * @param pagePath Caminho relativo da tela (ex: '/dashboard', '/calendar')
 * @param pageTitle Título amigável da tela (ex: 'Zemda • Agenda')
 */
export function trackPageView(pagePath: string, pageTitle?: string): void {
  if (typeof window === 'undefined') return;

  // Sanitização estrita: remove parâmetros de URL ou hashes que possam conter IDs ou tokens
  const cleanPath = (pagePath || '/').split('?')[0].split('#')[0].trim();

  // Evita duplicidade de registro consecutivo na mesma rota
  if (lastTrackedPath === cleanPath) {
    return;
  }
  lastTrackedPath = cleanPath;

  const title = pageTitle || `Zemda • ${cleanPath.replace(/^\//, '') || 'Início'}`;

  // Se o gtag estiver inicializado no window
  if (typeof window.gtag === 'function') {
    window.gtag('event', 'page_view', {
      page_title: title,
      page_location: window.location.origin + cleanPath,
      page_path: cleanPath,
      send_to: GA_MEASUREMENT_ID
    });
  } else if (Array.isArray(window.dataLayer)) {
    window.dataLayer.push({
      event: 'page_view',
      page_title: title,
      page_location: window.location.origin + cleanPath,
      page_path: cleanPath
    });
  }
}

/**
 * Registra eventos de uso genéricos do sistema (sem dados sensíveis).
 * @param action Ação realizada (ex: 'open_module_selector', 'login_success')
 * @param category Categoria funcional (ex: 'navigation', 'consultation')
 */
export function trackSafeEvent(action: string, category: string = 'general'): void {
  if (typeof window === 'undefined') return;

  const safeAction = String(action).slice(0, 50);
  const safeCategory = String(category).slice(0, 50);

  if (typeof window.gtag === 'function') {
    window.gtag('event', safeAction, {
      event_category: safeCategory,
      non_interaction: true
    });
  }
}
