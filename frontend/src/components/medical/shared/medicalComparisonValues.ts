/** Stable paths keep regional findings and lesion identities aligned between visits. */
export function medicalComparisonValues(value: unknown, prefix = ''): Record<string, string> {
  if (value === null || value === undefined || value === '') return {};
  if (typeof value !== 'object') return { [prefix]: String(value) };
  const result: Record<string, string> = {};
  for (const [key, child] of Object.entries(value)) {
    if (['id', 'photos', 'attachments', 'assessmentId', 'patient_id', 'appointment_id', 'created_at', 'updated_at'].includes(key)) continue;
    const identity = Array.isArray(value) && child && typeof child === 'object'
      ? String(child.id || child.scaleName || child.name || child.label || key) : key;
    Object.assign(result, medicalComparisonValues(child, prefix ? `${prefix} / ${identity}` : identity));
  }
  return result;
}
