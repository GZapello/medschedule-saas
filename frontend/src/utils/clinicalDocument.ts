/** Calendar dates are not UTC instants: preserve the recorded clinical day. */
export function formatClinicalDate(value?: string | null): string {
  const match=String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})(?:$|[T ])/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : '';
}
