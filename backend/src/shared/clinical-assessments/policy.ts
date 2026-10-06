import policy from './policy.json';
export const assessmentCapabilities = Object.keys(policy);
export function fieldCapability(field: string): string | undefined {
  for (const [cap, patterns] of Object.entries(policy)) for (const pattern of patterns) {
    if (pattern.endsWith('*') ? field.startsWith(pattern.slice(0,-1)) : field === pattern) return cap;
  }
}
export function projectClinicalData(value: any, capabilities: string[]): any {
  if (Array.isArray(value)) return value.filter(v => !v?.field || !fieldCapability(v.field) || capabilities.includes(fieldCapability(v.field)!)).map(v => projectClinicalData(v, capabilities));
  if (!value || typeof value !== 'object') return value;
  const output: any = {};
  for (const [key, item] of Object.entries(value)) {
    const cap = fieldCapability(key);
    if (cap && !capabilities.includes(cap)) continue;
    if (['tav_comparison','derived','references'].includes(key) && !capabilities.includes('BODY_COMPOSITION')) continue;
    if (['current_photos','previous_photos'].includes(key) && !capabilities.includes('PHOTO_MONITORING')) continue;
    if(key==='posture_json' && typeof item==='string' && !capabilities.includes('PHOTO_MONITORING')) {
      try { const posture=JSON.parse(item); delete posture.views; output[key]=JSON.stringify(posture); } catch { output[key]=null; }
    } else output[key] = projectClinicalData(item, capabilities);
  }
  return output;
}
