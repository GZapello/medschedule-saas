"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MEDICAL_NOTE_KEYS = void 0;
exports.medicalObject = medicalObject;
exports.medicalSpecialtyNotes = medicalSpecialtyNotes;
exports.consultationFromLegacy = consultationFromLegacy;
exports.consultationFromRecord = consultationFromRecord;
exports.MEDICAL_NOTE_KEYS = [
    'internalMedicineNotes', 'neurologicalExam', 'psychiatricNotes', 'pediatricNotes', 'geriatricNotes',
    'cardioNotes', 'dermatoNotes', 'orthoNotes', 'rheumaNotes', 'gynecoNotes', 'endocrinoNotes',
    'gastroNotes', 'ophtalmoNotes', 'otorrinoNotes', 'uroNotes', 'sharedAssessments'
];
function medicalObject(value) {
    try {
        const parsed = typeof value === 'string' ? JSON.parse(value) : value;
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    }
    catch {
        return {};
    }
}
function medicalSpecialtyNotes(body) {
    return Object.fromEntries(exports.MEDICAL_NOTE_KEYS.filter(key => body[key] != null).map(key => [key, medicalObject(body[key])]));
}
function consultationFromLegacy(row) {
    const specialtyNotes = medicalObject(row.specialty_notes_json);
    const neurologicalExam = medicalObject(row.neurological_exam_json);
    if (Object.keys(neurologicalExam).length && !specialtyNotes.neurologicalExam) {
        specialtyNotes.neurologicalExam = neurologicalExam;
    }
    let diagnoses = row.diagnostic_hypotheses_json;
    try {
        if (typeof diagnoses === 'string')
            diagnoses = JSON.parse(diagnoses);
    }
    catch {
        diagnoses = [];
    }
    return {
        ...row, specialtyNotes, neurologicalExam,
        vitalSigns: medicalObject(row.vital_signs_json), physicalExam: medicalObject(row.physical_exam_json),
        soapNotes: medicalObject(row.soap_notes_json),
        diagnosticHypotheses: Array.isArray(diagnoses) ? diagnoses.filter(item => typeof item === 'string') : []
    };
}
function consultationFromRecord(row) {
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
