/** Patch only the capabilities being edited; other specialties retain their findings. */
export function mergeMedicalRegional(previous: Record<string, any> = {}, payload: Record<string, any>, capabilities: string[]) {
  const next = { ...payload };
  const fields = [
    ['PAIN_ASSESSMENT', 'pain_json'], ['MOBILITY_ASSESSMENT', 'adm_json'],
    ['MUSCLE_STRENGTH', 'strength_json']
  ];
  for (const [capability, field] of fields) if (!capabilities.includes(capability)) delete next[field];
  if (!capabilities.some(cap => cap === 'FUNCTIONAL_TESTS' || cap === 'FUNCTIONAL_ASSESSMENT')) delete next.tests_json;
  // These have their own shared editors and must not be overwritten by regional defaults.
  delete next.functional_scales_json;
  delete next.plan_link_json;
  return { ...previous, ...next };
}
