export function isStretch(ex: { category?: string; muscle_group?: string }): boolean {
  return [ex.category, ex.muscle_group].some(value => (value || '').toLowerCase().startsWith('alongamento'));
}
