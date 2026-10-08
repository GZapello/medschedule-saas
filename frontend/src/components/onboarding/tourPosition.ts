export interface TourRect { top: number; left: number; right: number; bottom: number; width: number; height: number }

// All candidates are clamped on the cross axis only, preserving separation from the target.
export function positionTourCard(r: TourRect, width: number, height: number, vw: number, vh: number, obstacles: TourRect[] = []) {
  const gap = 12, margin = 12;
  const x = (value: number) => Math.max(margin, Math.min(value, vw - width - margin));
  const y = (value: number) => Math.max(margin, Math.min(value, vh - height - margin));
  const candidates = [
    { left: r.right + gap, top: y(r.top + (r.height - height) / 2) },
    { left: r.left - width - gap, top: y(r.top + (r.height - height) / 2) },
    { left: x(r.left + (r.width - width) / 2), top: r.bottom + gap },
    { left: x(r.left + (r.width - width) / 2), top: r.top - height - gap },
  ];
  const fits = (p: { top: number; left: number }) => p.left >= margin && p.top >= margin && p.left + width <= vw - margin && p.top + height <= vh - margin;
  const clear = (p: { top: number; left: number }) => !obstacles.some(o => p.left < o.right && p.left + width > o.left && p.top < o.bottom && p.top + height > o.top);
  // On a narrow drawer, place the card just beyond the remaining menu items.
  const menuBottom = Math.max(r.bottom, ...obstacles.filter(o => o.left < x(r.left) + width && o.right > x(r.left)).map(o => o.bottom));
  const afterMenu = { left: x(r.left), top: menuBottom + gap };
  return candidates.find(p => fits(p) && clear(p))
    || (fits(afterMenu) && clear(afterMenu) ? afterMenu : undefined)
    || candidates.find(fits)
    || { left: x((vw - width) / 2), top: y((vh - height) / 2) };
}
