export const MEDICAL_NOTE_KEYS = [
  'internalMedicineNotes', 'neurologicalExam', 'psychiatricNotes', 'pediatricNotes', 'geriatricNotes',
  'cardioNotes', 'dermatoNotes', 'orthoNotes', 'rheumaNotes', 'gynecoNotes', 'endocrinoNotes',
  'gastroNotes', 'ophtalmoNotes', 'otorrinoNotes', 'uroNotes', 'sharedAssessments'
] as const;

export function medicalObject(value: unknown): Record<string, any> {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, any> : {};
  } catch { return {}; }
}

export function medicalSpecialtyNotes(body: Record<string, any>): Record<string, any> {
  return Object.fromEntries(MEDICAL_NOTE_KEYS.filter(key => body[key] != null).map(key => [key, medicalObject(body[key])]));
}

export function consultationFromRecord(row: Record<string, any>): Record<string, any> {
  const payload = medicalObject(row.technical_notes);
  return {
    ...row, specialty_preset: payload.specialtyPreset || 'clinica-medica',
    chief_complaint: payload.chiefComplaint, hpi: payload.hpi,
    past_medical_history: payload.pastMedicalHistory, family_history: payload.familyHistory,
    habits_lifestyle: payload.habitsLifestyle, vitalSigns: medicalObject(payload.vitalSigns),
    physicalExam: medicalObject(payload.physicalExam), neurologicalExam: medicalObject(payload.neurologicalExam),
    soapNotes: medicalObject(payload.soapNotes), diagnosticHypotheses: Array.isArray(payload.diagnosticHypotheses) ? payload.diagnosticHypotheses : [],
    clinical_conduct: payload.conducts, specialtyNotes: medicalSpecialtyNotes(payload),
    cid_code: payload.cidCode, cid_description: payload.cidDescription, return_in_days: payload.returnInDays
  };
}
