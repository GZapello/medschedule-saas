"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProfessionTaxonomyService = void 0;
const database_1 = require("../config/database");
const profession_module_1 = require("../utils/profession-module");
class ProfessionTaxonomyService {
    /**
     * Atualiza a profissão, conselho, áreas de atuação e flags de módulos
     * de forma estrita, garantindo exclusividade mútua e remoção de resquícios de módulos anteriores.
     */
    static updateProfessionalTaxonomy(params) {
        const { tenantId, professionalId, newProfessionId, newProfessionName, newSpecialtyId, newSpecialtyCustom, practiceAreas, registrationType, registrationNumber } = params;
        // 1. Busca profissional atual
        const currentProf = database_1.db.prepare(`
      SELECT id, tenant_id, user_id, name, profession_id, profession_name,
             registration_type, registration_number, practice_areas, specialty_id, specialty_custom
      FROM professionals
      WHERE id = ? AND tenant_id = ?
    `).get(professionalId, tenantId);
        if (!currentProf) {
            throw new Error('Profissional não encontrado');
        }
        const isNewProfession = Boolean(newProfessionId && newProfessionId !== currentProf.profession_id);
        const targetProfId = (newProfessionId || currentProf.profession_id || '').trim();
        const targetProfName = (newProfessionName || (newProfessionId ? '' : currentProf.profession_name) || '').trim();
        // 2. Resolução canônica
        const resolution = (0, profession_module_1.resolveCanonicalProfession)({
            id: targetProfId,
            name: targetProfName,
            registrationType: isNewProfession ? (registrationType || '') : (registrationType || currentProf.registration_type)
        });
        const commercialModule = resolution.commercialModule;
        const flags = resolution.flags;
        const boardLabel = resolution.boardLabel || registrationType || (isNewProfession ? '' : currentProf.registration_type) || 'Conselho';
        // 3. Sanitização de Áreas de Atuação
        const rawAreas = practiceAreas !== undefined ? practiceAreas : currentProf.practice_areas;
        const finalPracticeAreas = (0, profession_module_1.cleanPracticeAreasForNewProfession)(targetProfId, rawAreas);
        // 4. Sanitização de Especialidades
        let finalSpecialtyId = null;
        let finalSpecialtyCustom = null;
        const candidateSpecialtyId = newSpecialtyId !== undefined ? newSpecialtyId : currentProf.specialty_id;
        const candidateSpecialtyCustom = newSpecialtyCustom !== undefined ? newSpecialtyCustom : currentProf.specialty_custom;
        if (candidateSpecialtyId) {
            const validSpec = database_1.db.prepare(`
        SELECT id, name FROM specialties
        WHERE id = ? AND (
          profession_id = ? OR profession_id = ?
        )
      `).get(candidateSpecialtyId, targetProfId, resolution.canonicalId);
            if (validSpec) {
                finalSpecialtyId = validSpec.id;
                finalSpecialtyCustom = candidateSpecialtyCustom || validSpec.name;
            }
        }
        else if (candidateSpecialtyCustom && !newProfessionId) {
            // Mantém custom se a profissão não mudou
            finalSpecialtyCustom = candidateSpecialtyCustom;
        }
        // 5. Atualização atômica em professionals
        database_1.db.prepare(`
      UPDATE professionals SET
        profession_id = ?,
        profession_name = ?,
        specialty_id = ?,
        specialty_custom = ?,
        registration_type = ?,
        registration_number = COALESCE(?, registration_number),
        practice_areas = ?,
        zemda_fisio_enabled = ?,
        zemda_odonto_enabled = ?,
        zemda_nutri_enabled = ?,
        zemda_to_enabled = ?,
        zemda_fono_enabled = ?,
        zemda_pp_enabled = ?,
        zemda_psico_enabled = ?,
        zemda_personal_enabled = ?,
        zemda_med_enabled = ?,
        updated_at = datetime('now')
      WHERE id = ? AND tenant_id = ?
    `).run(resolution.canonicalId, resolution.canonicalName, finalSpecialtyId, finalSpecialtyCustom, boardLabel, registrationNumber || null, finalPracticeAreas, flags.zemda_fisio_enabled, flags.zemda_odonto_enabled, flags.zemda_nutri_enabled, flags.zemda_to_enabled, flags.zemda_fono_enabled, flags.zemda_pp_enabled, flags.zemda_psico_enabled, flags.zemda_personal_enabled, flags.zemda_med_enabled, professionalId, tenantId);
        // 6. Atualização em cascata para users e clinic_users
        if (currentProf.user_id) {
            const userId = currentProf.user_id;
            // Atualiza users
            database_1.db.prepare(`
        UPDATE users SET
          profession_id = ?,
          profession_name = ?,
          practice_areas = ?,
          registration_type = ?,
          registration_number = COALESCE(?, registration_number),
          zemda_fisio_enabled = ?,
          zemda_odonto_enabled = ?,
          zemda_nutri_enabled = ?,
          zemda_to_enabled = ?,
          zemda_fono_enabled = ?,
          zemda_pp_enabled = ?,
          zemda_psico_enabled = ?,
          zemda_personal_enabled = ?,
          zemda_med_enabled = ?,
          updated_at = datetime('now')
        WHERE id = ?
      `).run(resolution.canonicalId, resolution.canonicalName, finalPracticeAreas, boardLabel, registrationNumber || null, flags.zemda_fisio_enabled, flags.zemda_odonto_enabled, flags.zemda_nutri_enabled, flags.zemda_to_enabled, flags.zemda_fono_enabled, flags.zemda_pp_enabled, flags.zemda_psico_enabled, flags.zemda_personal_enabled, flags.zemda_med_enabled, userId);
            // Atualiza permissões do clinic_users:
            // Remove estritamente permissões residuais do módulo anterior
            const cuRow = database_1.db.prepare('SELECT permissions_json FROM clinic_users WHERE user_id = ? AND tenant_id = ?').get(userId, tenantId);
            let currentPerms = [];
            if (cuRow?.permissions_json) {
                try {
                    currentPerms = JSON.parse(cuRow.permissions_json);
                }
                catch { }
            }
            // Permissão ZemdaPersonal: estritamente para Personal Trainer / Ed. Física
            if (commercialModule === 'ZemdaPersonal') {
                if (!currentPerms.includes('access_zemda_personal')) {
                    currentPerms.push('access_zemda_personal');
                }
            }
            else {
                currentPerms = currentPerms.filter((p) => p !== 'access_zemda_personal');
            }
            // Permissão ZemdaMed: estritamente para Médico
            if (commercialModule === 'ZemdaMed') {
                if (!currentPerms.includes('access_zemda_med')) {
                    currentPerms.push('access_zemda_med');
                }
            }
            else {
                currentPerms = currentPerms.filter((p) => p !== 'access_zemda_med');
            }
            database_1.db.prepare(`
        UPDATE clinic_users SET
          profession_id = ?,
          profession_name = ?,
          profession_custom = ?,
          practice_areas = ?,
          permissions_json = ?,
          zemda_fisio_enabled = ?,
          zemda_odonto_enabled = ?,
          zemda_nutri_enabled = ?,
          zemda_to_enabled = ?,
          zemda_fono_enabled = ?,
          zemda_pp_enabled = ?,
          zemda_psico_enabled = ?,
          zemda_personal_enabled = ?,
          zemda_med_enabled = ?
        WHERE user_id = ? AND tenant_id = ?
      `).run(resolution.canonicalId, resolution.canonicalName, resolution.canonicalName, finalPracticeAreas, JSON.stringify(currentPerms), flags.zemda_fisio_enabled, flags.zemda_odonto_enabled, flags.zemda_nutri_enabled, flags.zemda_to_enabled, flags.zemda_fono_enabled, flags.zemda_pp_enabled, flags.zemda_psico_enabled, flags.zemda_personal_enabled, flags.zemda_med_enabled, userId, tenantId);
            // Limpeza de capacidades residuais incompatíveis
            try {
                database_1.db.prepare('DELETE FROM user_optional_capabilities WHERE user_id = ? AND tenant_id = ?').run(userId, tenantId);
            }
            catch { }
            // Limpeza de áreas de atuação do catálogo que não pertencem à nova profissão
            try {
                database_1.db.prepare(`
          DELETE FROM user_practice_areas
          WHERE user_id = ? AND tenant_id = ?
            AND practice_area_id IN (
              SELECT id FROM practice_areas WHERE profession_id != ? AND profession_id != ?
            )
        `).run(userId, tenantId, resolution.canonicalId, targetProfId);
            }
            catch { }
            // Se não for mais médico, limpa vínculo com árvore médica
            if (commercialModule !== 'ZemdaMed') {
                try {
                    database_1.db.prepare('DELETE FROM user_medical_specialties WHERE user_id = ? AND tenant_id = ?').run(userId, tenantId);
                    database_1.db.prepare('DELETE FROM user_medical_practice_areas WHERE user_id = ? AND tenant_id = ?').run(userId, tenantId);
                }
                catch { }
            }
        }
        return {
            success: true,
            canonicalProfessionId: resolution.canonicalId,
            canonicalProfessionName: resolution.canonicalName,
            commercialModule,
            boardLabel,
            finalSpecialtyId,
            finalSpecialtyCustom,
            finalPracticeAreas
        };
    }
}
exports.ProfessionTaxonomyService = ProfessionTaxonomyService;
