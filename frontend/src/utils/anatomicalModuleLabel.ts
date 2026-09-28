/** Display legacy module identifiers without rewriting historical records. */
export function anatomicalModuleLabel(value?: string | null): string {
  if (!value) return 'Geral';
  return /^(?:zemda[-_]?body|zemda[-_]?360)$/i.test(value) ? 'Zemda360' : value;
}
