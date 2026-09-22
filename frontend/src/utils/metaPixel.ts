import { COOKIE_CONSENT_STORAGE_KEY, CookieConsentState, getStoredCookieConsent } from './cookieConsent';

export const META_PIXEL_ID = '1146672904351523';
type PixelCommand = [string, ...unknown[]];
interface MetaPixel {
  (...args: PixelCommand): void;
  callMethod?: (...args: PixelCommand) => void;
  queue: PixelCommand[];
  push: MetaPixel;
  loaded: boolean;
  version: string;
}
declare global {
  interface Window { fbq?: MetaPixel; _fbq?: MetaPixel }
}

// Deliberately independent of the router: new routes must opt in after review.
const publicPaths = new Set(['/', '/planos', '/sistema-para-clinicas', '/sistema-para-medicos',
  '/sistema-para-psicologos', '/sistema-para-fonoaudiologos', '/sistema-para-fisioterapeutas',
  '/sistema-para-nutricionistas', '/sistema-para-psicopedagogos', '/agenda-online',
  '/prontuario', '/gestao-financeira', '/blog', '/termos-de-uso', '/privacidade']);
const anchors = new Set(['', '#conteudo', '#inicio', '#como-funciona', '#profissoes', '#zemdabody',
  '#funcionalidades', '#agenda', '#autosave', '#documentos', '#gestao', '#ia', '#seguranca', '#planos', '#faq']);
function safeUrl(url: URL): boolean {
  return url.protocol === 'https:' && ['zemda.com.br', 'www.zemda.com.br'].includes(url.hostname)
    && publicPaths.has(url.pathname) && !url.search && anchors.has(url.hash);
}
function safeReferrer(): boolean {
  if (!document.referrer) return true;
  try {
    const referrer = new URL(document.referrer);
    // External origin-only referrers have no patient path, query or fragment.
    return safeUrl(referrer) || (referrer.origin !== location.origin
      && !['zemda.com.br', 'www.zemda.com.br'].includes(referrer.hostname)
      && referrer.protocol === 'https:' && referrer.pathname === '/' && !referrer.search && !referrer.hash);
  } catch { return false; }
}

let contextPath: string | null = null;
let consent = false;
let listening = false;
let ready = false;
let initialized = false;
let ownedPixel: MetaPixel | undefined;
let lastPath: string | null = null;

function eligible(): boolean {
  return consent && contextPath === location.pathname && safeUrl(new URL(location.href)) && safeReferrer();
}
function sync(): void {
  if (!eligible()) {
    if (initialized) ownedPixel?.('consent', 'revoke');
    return;
  }
  if (!ownedPixel) {
    // Never add a second installer alongside a tag manager or another integration.
    if (window.fbq || document.querySelector('script[src*="/fbevents.js"]')) return;
    const pixel = function (...args: PixelCommand) {
      if (pixel.callMethod) pixel.callMethod(...args);
      else pixel.queue.push(args);
    } as MetaPixel;
    pixel.queue = []; pixel.push = pixel; pixel.loaded = true; pixel.version = '2.0';
    ownedPixel = window.fbq = window._fbq = pixel;
    const script = document.createElement('script');
    script.id = 'zemda-meta-pixel'; script.async = true;
    script.referrerPolicy = 'no-referrer';
    script.src = 'https://connect.facebook.net/en_US/fbevents.js';
    // No queued visits: recheck consent and the current screen after download.
    script.onload = () => { ready = true; sync(); };
    document.head.appendChild(script);
  }
  if (!ready) return;
  ownedPixel('consent', 'grant');
  if (!initialized) {
    ownedPixel('set', 'autoConfig', false, META_PIXEL_ID);
    ownedPixel('init', META_PIXEL_ID);
    initialized = true;
  }
  if (lastPath !== contextPath) {
    ownedPixel('track', 'PageView');
    lastPath = contextPath;
  }
}

/** Called after React commits the actual public screen, including in-memory login changes. */
export function updateMetaPixelContext(path: string | null): void {
  if (!listening) {
    listening = true;
    consent = getStoredCookieConsent()?.marketing === true;
    window.addEventListener('zemda-cookie-consent-changed', event => {
      consent = (event as CustomEvent<CookieConsentState>).detail?.marketing === true;
      sync();
    });
    window.addEventListener('storage', event => {
      if (event.key === COOKIE_CONSENT_STORAGE_KEY || event.key === null) {
        consent = getStoredCookieConsent()?.marketing === true;
        sync();
      }
    });
    window.addEventListener('popstate', sync);
    window.addEventListener('hashchange', sync);
  }
  if (path !== contextPath) lastPath = null;
  contextPath = path;
  sync();
}
