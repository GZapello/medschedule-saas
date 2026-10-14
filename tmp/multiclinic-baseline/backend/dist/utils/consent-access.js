"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasConsentDocumentAccess = hasConsentDocumentAccess;
exports.hasConsentAccess = hasConsentAccess;
const database_1 = require("../config/database");
const clinical_controller_1 = require("../controllers/clinical.controller");
const capability_service_1 = require("../services/capability.service");
/** Applies the same professional scope to legacy read/export entry points. */
function hasConsentDocumentAccess(req, consentId) {
    if (!req.user || !req.tenantId)
        return false;
    const row = database_1.db.prepare('SELECT p.template_version_id,p.professional_snapshot_json,t.module FROM patient_consents p LEFT JOIN consent_templates t ON t.id=p.template_id WHERE p.id=? AND p.tenant_id=?').get(consentId, req.tenantId);
    if (!row)
        return false;
    if (!row.template_version_id)
        return true;
    // Gestores da clínica e recepcionistas têm acesso operacional de leitura aos termos dos pacientes da clínica
    if (req.user.role === 'clinic_admin' || req.user.role === 'receptionist')
        return true;
    const snapshot = JSON.parse(row.professional_snapshot_json || '{}');
    const module = snapshot.consentModule || row.module || 'general';
    if (snapshot.consentProfession && snapshot.consentProfession !== capability_service_1.CapabilityService.computeUserCapabilities(req.user.userId, req.tenantId).professionId)
        return false;
    return module === 'general' || module === capability_service_1.CapabilityService.computeUserCapabilities(req.user.userId, req.tenantId).commercialModule;
}
/** Consent evidence is patient-scoped, without the general chart's clinic-wide professional fallback. */
function hasConsentAccess(req, patientId) {
    if (!req.user || !req.tenantId)
        return false;
    // Paciente deve pertencer à clínica
    if (!database_1.db.prepare('SELECT 1 FROM patients WHERE id=? AND tenant_id=?').get(patientId, req.tenantId))
        return false;
    // Gestores da clínica e recepcionistas têm acesso operacional aos termos de pacientes da clínica
    if (req.user.role === 'clinic_admin' || req.user.role === 'receptionist')
        return true;
    // Profissionais clínicos precisam ter vínculo com o paciente
    if (req.user.role === 'professional') {
        if (!(0, clinical_controller_1.hasClinicalAccess)(req, patientId))
            return false;
        const professionals = database_1.db.prepare('SELECT id FROM professionals WHERE tenant_id=? AND user_id=? AND active=1').all(req.tenantId, req.user.userId);
        for (const p of professionals) {
            const args = [req.tenantId, patientId, p.id];
            if (database_1.db.prepare('SELECT id FROM appointments WHERE tenant_id=? AND patient_id=? AND professional_id=? LIMIT 1').get(...args)
                || database_1.db.prepare("SELECT id FROM patient_referrals WHERE tenant_id=? AND patient_id=? AND to_professional_id=? AND status NOT IN ('cancelled','rejected') LIMIT 1").get(...args)
                || database_1.db.prepare('SELECT id FROM records WHERE tenant_id=? AND patient_id=? AND professional_id=? LIMIT 1').get(...args))
                return true;
            // Specialty assessments and workouts also constitute documented patient relationships.
            for (const table of ['personal_assessments', 'personal_workouts', 'physiotherapy_assessments', 'nutrition_assessments', 'occupational_therapy_assessments', 'speech_therapy_assessments']) {
                const cols = new Set(database_1.db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name));
                if (cols.has('professional_id') && cols.has('patient_id') && cols.has('tenant_id') && database_1.db.prepare(`SELECT id FROM ${table} WHERE tenant_id=? AND patient_id=? AND professional_id=? LIMIT 1`).get(...args))
                    return true;
            }
        }
        return false;
    }
    return false;
}
