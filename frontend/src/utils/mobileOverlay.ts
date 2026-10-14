/** Returns true only when a visible overlay exposes an explicit dismiss control. */
export function dismissTopOverlay(): boolean {
  const overlays = Array.from(document.querySelectorAll<HTMLElement>('.mobile-modal, [role="dialog"]'))
    .filter(element => element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden')
    .map((element, order) => ({ element, order, z: Number.parseInt(getComputedStyle(element).zIndex, 10) || 0 }))
    .sort((a, b) => b.z - a.z || b.order - a.order);
  for (const { element } of overlays) {
    const buttons = Array.from(element.querySelectorAll<HTMLButtonElement>('button')).filter(button => button.getClientRects().length && !button.disabled);
    const close = buttons.find(button => /^fechar\b/i.test(button.getAttribute('aria-label') || '') || button.classList.contains('close-modal'))
      || buttons.find(button => /^fechar\b/i.test(button.textContent?.trim() || '') || /^(cancelar|voltar)$/i.test(button.textContent?.trim() || ''));
    if (close) { close.click(); return true; }
  }
  return false;
}
