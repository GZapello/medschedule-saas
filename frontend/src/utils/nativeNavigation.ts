import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { AppLauncher } from '@capacitor/app-launcher';
import { currentPrintHtml, printNativeHtml } from './nativePrint';

function externalUrl(value: string): URL | null {
  try {
    const url = new URL(value, window.location.href);
    if (['mailto:', 'tel:'].includes(url.protocol)) return url;
    if (['https:', 'http:'].includes(url.protocol) && url.origin !== window.location.origin) return url;
  } catch { /* Non-URL window targets remain with the existing web implementation. */ }
  return null;
}

export async function navigateToUrl(value: string) {
  const url = externalUrl(value);
  if (Capacitor.isNativePlatform() && url && ['https:', 'http:'].includes(url.protocol)) {
    await Browser.open({ url: url.href });
  } else window.location.assign(value);
}

export function installNativeNavigation() {
  if (!Capacitor.isNativePlatform()) return;
  window.print = () => { void printNativeHtml(currentPrintHtml(), document.title).catch(() => window.alert('Não foi possível abrir a impressão.')); };
  const open = async (url: URL) => {
    try {
      if (url.protocol === 'mailto:' || url.protocol === 'tel:') {
        const result = await AppLauncher.openUrl({ url: url.href });
        if (!result.completed) throw new Error('Nenhum aplicativo compatível instalado.');
      } else await Browser.open({ url: url.href });
    } catch {
      window.alert('Não foi possível abrir o link. Verifique se há um aplicativo compatível instalado.');
    }
  };
  const originalOpen = window.open.bind(window);
  window.open = ((url?: string | URL, target?: string, features?: string) => {
    const external = url ? externalUrl(String(url)) : null;
    if (external) { void open(external); return null; }
    return originalOpen(url, target, features);
  }) as typeof window.open;
  document.addEventListener('click', event => {
    if (event.defaultPrevented || !(event.target instanceof Element)) return;
    const anchor = event.target.closest('a[href]');
    if (!anchor) return;
    const url = externalUrl(anchor.getAttribute('href') || '');
    if (url) { event.preventDefault(); void open(url); }
  });
  document.addEventListener('focusin', event => {
    if (event.target instanceof HTMLElement && event.target.matches('input, select, textarea')) {
      const element = event.target;
      setTimeout(() => { if (document.activeElement === element) element.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, 300);
    }
  });
}
