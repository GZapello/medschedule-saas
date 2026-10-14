import { Capacitor, registerPlugin } from '@capacitor/core';

const ZemdaPrint = registerPlugin<{ printHtml(options: { html: string; title: string }): Promise<void> }>('ZemdaPrint');
export function isNativePrint() { return Capacitor.getPlatform() === 'android'; }
export async function printNativeHtml(html: string, title = 'Documento Zemda') {
  const css = Array.from(document.styleSheets).map(sheet => {
    try { return Array.from(sheet.cssRules).map(rule => rule.cssText).join('\n'); } catch { return ''; }
  }).join('\n');
  const styled = html.includes('</head>') ? html.replace('</head>', `<style>${css}</style></head>`) : `<head><style>${css}</style></head>${html}`;
  await ZemdaPrint.printHtml({ html: styled, title });
}
export function currentPrintHtml() {
  const clone = document.documentElement.cloneNode(true) as HTMLElement;
  const fields = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input, textarea, select');
  clone.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input, textarea, select').forEach((field, index) => {
    const original = fields[index];
    if (field instanceof HTMLTextAreaElement) field.textContent = original.value;
    else if (field instanceof HTMLInputElement) { field.setAttribute('value', original.value); field.toggleAttribute('checked', (original as HTMLInputElement).checked); }
    else Array.from(field.options).forEach(option => option.toggleAttribute('selected', option.value === original.value));
  });
  clone.querySelectorAll('script, link[rel="stylesheet"]').forEach(element => element.remove());
  const style = document.createElement('style');
  style.textContent = Array.from(document.styleSheets).map(sheet => {
    try { return Array.from(sheet.cssRules).map(rule => rule.cssText).join('\n'); } catch { return ''; }
  }).join('\n');
  clone.querySelector('head')?.appendChild(style);
  return '<!doctype html>' + clone.outerHTML;
}
