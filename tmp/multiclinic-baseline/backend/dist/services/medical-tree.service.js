"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MedicalTreeService = void 0;
const database_1 = require("../config/database");
class MedicalTreeService {
    /**
     * Retorna a árvore hierárquica completa de Medicina:
     * ESPECIALIDADE MÉDICA -> ÁREA DE ATUAÇÃO / SUBÁREA -> PRESET & CAPABILITIES
     */
    static getMedicalTree() {
        const specialtiesRows = database_1.db.prepare(`
      SELECT id, name, slug, description, icon_name, focus_areas_json, sort_order
      FROM medical_specialties
      WHERE active = 1
      ORDER BY sort_order ASC, name ASC
    `).all();
        const practiceAreasRows = database_1.db.prepare(`
      SELECT id, medical_specialty_id, name, slug, description, sort_order
      FROM medical_practice_areas
      WHERE active = 1
      ORDER BY sort_order ASC, name ASC
    `).all();
        const capabilitiesRows = database_1.db.prepare(`
      SELECT medical_specialty_id, capability_id, rule
      FROM medical_specialty_capabilities
    `).all();
        const areaCapabilities = database_1.db.prepare('SELECT medical_practice_area_id, capability_id, rule FROM medical_practice_area_capabilities').all();
        // Agrupa áreas de atuação por especialidade
        const areasBySpec = new Map();
        for (const pa of practiceAreasRows) {
            const list = areasBySpec.get(pa.medical_specialty_id) || [];
            list.push({
                id: pa.id,
                medicalSpecialtyId: pa.medical_specialty_id,
                name: pa.name,
                slug: pa.slug,
                description: pa.description || undefined,
                defaultCapabilities: areaCapabilities.filter(cap => cap.medical_practice_area_id === pa.id && cap.rule === 'DEFAULT').map(cap => cap.capability_id),
                optionalCapabilities: areaCapabilities.filter(cap => cap.medical_practice_area_id === pa.id && cap.rule === 'OPTIONAL').map(cap => cap.capability_id),
                hiddenCapabilities: areaCapabilities.filter(cap => cap.medical_practice_area_id === pa.id && cap.rule === 'HIDDEN').map(cap => cap.capability_id),
                sortOrder: pa.sort_order
            });
            areasBySpec.set(pa.medical_specialty_id, list);
        }
        // Agrupa capabilities por especialidade
        const capsBySpec = new Map();
        for (const cap of capabilitiesRows) {
            let entry = capsBySpec.get(cap.medical_specialty_id);
            if (!entry) {
                entry = { defaultCaps: [], optionalCaps: [] };
                capsBySpec.set(cap.medical_specialty_id, entry);
            }
            if (cap.rule === 'DEFAULT') {
                entry.defaultCaps.push(cap.capability_id);
            }
            else if (cap.rule === 'OPTIONAL') {
                entry.optionalCaps.push(cap.capability_id);
            }
        }
        const specialties = specialtiesRows.map(spec => {
            let focusAreas = [];
            try {
                if (spec.focus_areas_json) {
                    focusAreas = JSON.parse(spec.focus_areas_json);
                }
            }
            catch (_) { }
            const caps = capsBySpec.get(spec.id) || { defaultCaps: [], optionalCaps: [] };
            return {
                id: spec.id,
                name: spec.name,
                slug: spec.slug,
                description: spec.description || undefined,
                iconName: spec.icon_name || 'Stethoscope',
                focusAreas,
                sortOrder: spec.sort_order,
                practiceAreas: areasBySpec.get(spec.id) || [],
                defaultCapabilities: caps.defaultCaps,
                optionalCapabilities: caps.optionalCaps
            };
        });
        return { specialties };
    }
    /**
     * Obtém a hierarquia médica configurada para um usuário em um tenant
     */
    static getUserMedicalHierarchy(userId, tenantId) {
        const specRows = database_1.db.prepare(`
      SELECT medical_specialty_id
      FROM user_medical_specialties
      WHERE user_id = ? AND tenant_id = ?
    `).all(userId, tenantId);
        const paRows = database_1.db.prepare(`
      SELECT medical_practice_area_id
      FROM user_medical_practice_areas
      WHERE user_id = ? AND tenant_id = ?
    `).all(userId, tenantId);
        return {
            specialtyIds: specRows.map(r => r.medical_specialty_id),
            practiceAreaIds: paRows.map(r => r.medical_practice_area_id)
        };
    }
    /**
     * Validação estrita:
     * 1. As especialidades existem e estão ativas
     * 2. As áreas de atuação existem, estão ativas e pertencem a uma das especialidades selecionadas
     */
    static validateMedicalHierarchy(specialtyIds, practiceAreaIds) {
        if (!Array.isArray(specialtyIds) || specialtyIds.length === 0) {
            return { valid: false, error: 'Pelo menos uma especialidade médica deve ser selecionada.' };
        }
        // 1. Valida especialidades
        const specPlaceholders = specialtyIds.map(() => '?').join(',');
        const foundSpecs = database_1.db.prepare(`
      SELECT id, active FROM medical_specialties
      WHERE id IN (${specPlaceholders})
    `).all(...specialtyIds);
        const foundSpecMap = new Map(foundSpecs.map(s => [s.id, s]));
        for (const specId of specialtyIds) {
            const s = foundSpecMap.get(specId);
            if (!s || s.active !== 1) {
                return { valid: false, error: `Especialidade médica '${specId}' não encontrada ou inativa.` };
            }
        }
        // 2. Valida áreas de atuação (se fornecidas)
        if (Array.isArray(practiceAreaIds) && practiceAreaIds.length > 0) {
            const paPlaceholders = practiceAreaIds.map(() => '?').join(',');
            const foundPas = database_1.db.prepare(`
        SELECT id, medical_specialty_id, active FROM medical_practice_areas
        WHERE id IN (${paPlaceholders})
      `).all(...practiceAreaIds);
            const foundPaMap = new Map(foundPas.map(p => [p.id, p]));
            for (const paId of practiceAreaIds) {
                const pa = foundPaMap.get(paId);
                if (!pa || pa.active !== 1) {
                    return { valid: false, error: `Área de atuação médica '${paId}' não encontrada ou inativa.` };
                }
                if (!specialtyIds.includes(pa.medical_specialty_id)) {
                    return {
                        valid: false,
                        error: `Área de atuação '${paId}' não pertence a nenhuma das especialidades médicas selecionadas.`
                    };
                }
            }
        }
        return { valid: true };
    }
    /**
     * Salva atomicamente as especialidades e áreas médicas do usuário
     */
    static setUserMedicalHierarchy(userId, tenantId, specialtyIds, practiceAreaIds) {
        const validation = this.validateMedicalHierarchy(specialtyIds, practiceAreaIds);
        if (!validation.valid) {
            throw new Error(validation.error || 'Configuração médica inválida');
        }
        database_1.db.transaction(() => {
            // 1. Atualiza user_medical_specialties
            database_1.db.prepare('DELETE FROM user_medical_specialties WHERE user_id = ? AND tenant_id = ?').run(userId, tenantId);
            const insSpec = database_1.db.prepare(`
        INSERT OR IGNORE INTO user_medical_specialties (user_id, medical_specialty_id, tenant_id)
        VALUES (?, ?, ?)
      `);
            for (const sId of specialtyIds) {
                insSpec.run(userId, sId, tenantId);
            }
            // 2. Atualiza user_medical_practice_areas
            database_1.db.prepare('DELETE FROM user_medical_practice_areas WHERE user_id = ? AND tenant_id = ?').run(userId, tenantId);
            const insPa = database_1.db.prepare(`
        INSERT OR IGNORE INTO user_medical_practice_areas (user_id, medical_practice_area_id, tenant_id)
        VALUES (?, ?, ?)
      `);
            for (const paId of practiceAreaIds) {
                insPa.run(userId, paId, tenantId);
            }
            // 3. Atualiza campo specialty_id do profissional para integridade de documentos e relatórios
            if (specialtyIds.length > 0) {
                try {
                    database_1.db.prepare(`
            UPDATE professionals
            SET specialty_id = ?
            WHERE user_id = ? AND tenant_id = ?
          `).run(specialtyIds[0], userId, tenantId);
                }
                catch (_) { }
            }
        })();
    }
}
exports.MedicalTreeService = MedicalTreeService;
