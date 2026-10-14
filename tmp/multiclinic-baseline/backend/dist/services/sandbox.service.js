"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SandboxService = void 0;
const database_1 = require("../config/database");
const uuid_1 = require("uuid");
const jwt_1 = require("../utils/jwt");
const capability_service_1 = require("./capability.service");
const medical_tree_service_1 = require("./medical-tree.service");
const profession_module_1 = require("../utils/profession-module");
class SandboxService {
    /**
     * Cria uma sessão isolada de teste para o SuperAdmin
     */
    static createTestSession(params) {
        const { adminUserId, professionId, practiceAreaIds, planCode } = params;
        // 1. Validação de SuperAdmin
        const admin = database_1.db.prepare('SELECT id, role FROM users WHERE id = ?').get(adminUserId);
        if (!admin || admin.role !== 'superadmin') {
            throw new Error('Apenas administradores globais (SuperAdmin) podem acessar o Laboratório Zemda.');
        }
        const sessionId = 'sbx-' + (0, uuid_1.v4)().slice(0, 8);
        const sandboxTenantId = 'sbx-tenant-' + (0, uuid_1.v4)().slice(0, 8);
        const sandboxUserId = 'sbx-user-' + (0, uuid_1.v4)().slice(0, 8);
        const sandboxProfId = 'sbx-prof-' + (0, uuid_1.v4)().slice(0, 8);
        const resolution = (0, profession_module_1.resolveCanonicalProfession)({ id: professionId });
        const canonicalProfId = resolution.canonicalId;
        const profRow = database_1.db.prepare('SELECT name, registration_board_label FROM professions WHERE id = ?').get(canonicalProfId);
        const profName = resolution.canonicalName || profRow?.name || 'Profissional de Saúde';
        const regBoard = resolution.boardLabel || profRow?.registration_board_label || 'CRM/REG';
        const commercialModule = resolution.commercialModule || 'ZemdaGestao';
        let finalAreaIds = Array.isArray(practiceAreaIds) && practiceAreaIds.length > 0 ? [...practiceAreaIds] : [];
        if (finalAreaIds.length === 0 && resolution.inferredAreaId) {
            finalAreaIds = [resolution.inferredAreaId];
        }
        const flags = resolution.flags;
        // 2. Cria Tenant Sandbox Isolado
        database_1.db.prepare(`
      INSERT INTO tenants (
        id, slug, name, trade_name, email, phone, status, client_term_label, created_at, updated_at
      ) VALUES (
        ?, ?, ?, 'Ambiente de Teste Zemda', 'sandbox@zemda.test', '(11) 99999-0000', 'active', 'Paciente',
        datetime('now'), datetime('now')
      )
    `).run(sandboxTenantId, 'sandbox-' + sessionId, `Clínica Sandbox (${profName})`);
        // 3. Cria Usuário Profissional Simulado
        database_1.db.prepare(`
      INSERT INTO users (
        id, tenant_id, name, email, password_hash, role, status,
        profession_id, profession_name, practice_areas,
        zemda_fisio_enabled, zemda_odonto_enabled, zemda_nutri_enabled,
        zemda_to_enabled, zemda_fono_enabled, zemda_pp_enabled,
        zemda_psico_enabled, zemda_personal_enabled, zemda_med_enabled,
        created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, 'sandbox_hash', 'professional', 'active',
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        datetime('now'), datetime('now')
      )
    `).run(sandboxUserId, sandboxTenantId, `Dr(a). Teste Sandbox (${profName})`, `sandbox-${sessionId}@zemda.test`, canonicalProfId, profName, finalAreaIds.join(', '), flags.zemda_fisio_enabled, flags.zemda_odonto_enabled, flags.zemda_nutri_enabled, flags.zemda_to_enabled, flags.zemda_fono_enabled, flags.zemda_pp_enabled, flags.zemda_psico_enabled, flags.zemda_personal_enabled, flags.zemda_med_enabled);
        // 4. Cria Vínculo clinic_users Simulado
        database_1.db.prepare(`
      INSERT INTO clinic_users (
        id, tenant_id, user_id, role, status, is_manager,
        zemda_fisio_enabled, zemda_odonto_enabled, zemda_nutri_enabled,
        zemda_to_enabled, zemda_fono_enabled, zemda_pp_enabled,
        zemda_psico_enabled, zemda_personal_enabled, zemda_med_enabled,
        zemda_body_enabled, created_at
      ) VALUES (
        ?, ?, ?, 'professional', 'active', 0,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        1, datetime('now')
      )
    `).run('cu-' + sessionId, sandboxTenantId, sandboxUserId, flags.zemda_fisio_enabled, flags.zemda_odonto_enabled, flags.zemda_nutri_enabled, flags.zemda_to_enabled, flags.zemda_fono_enabled, flags.zemda_pp_enabled, flags.zemda_psico_enabled, flags.zemda_personal_enabled, flags.zemda_med_enabled);
        // 5. Cria Cadastro em professionals
        database_1.db.prepare(`
      INSERT INTO professionals (
        id, tenant_id, user_id, name, profession_id, registration_type,
        registration_number, practice_areas,
        zemda_fisio_enabled, zemda_odonto_enabled, zemda_nutri_enabled,
        zemda_to_enabled, zemda_fono_enabled, zemda_pp_enabled,
        zemda_psico_enabled, zemda_personal_enabled, zemda_med_enabled,
        active, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, '123456-TESTE', ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        1, datetime('now'), datetime('now')
      )
    `).run(sandboxProfId, sandboxTenantId, sandboxUserId, `Dr(a). Teste Sandbox (${profName})`, canonicalProfId, regBoard, finalAreaIds.join(', '), flags.zemda_fisio_enabled, flags.zemda_odonto_enabled, flags.zemda_nutri_enabled, flags.zemda_to_enabled, flags.zemda_fono_enabled, flags.zemda_pp_enabled, flags.zemda_psico_enabled, flags.zemda_personal_enabled, flags.zemda_med_enabled);
        // 6. Registra Áreas de Atuação na Sessão
        capability_service_1.CapabilityService.setUserPracticeAreas(sandboxUserId, sandboxTenantId, finalAreaIds);
        let medSpecIds = undefined;
        let medPaIds = undefined;
        if (canonicalProfId === 'prof-medico' || commercialModule === 'ZemdaMed') {
            try {
                let specs = [];
                if (resolution.medicalSpecialtyId) {
                    specs.push(resolution.medicalSpecialtyId);
                }
                const fromFinal = finalAreaIds.filter(a => a.startsWith('med-spec-'));
                for (const s of fromFinal) {
                    if (!specs.includes(s))
                        specs.push(s);
                }
                if (specs.length === 0) {
                    specs = ['med-spec-clinica'];
                }
                const pas = finalAreaIds.filter(a => a.startsWith('med-pa-'));
                medical_tree_service_1.MedicalTreeService.setUserMedicalHierarchy(sandboxUserId, sandboxTenantId, specs, pas);
                medSpecIds = specs;
                medPaIds = pas;
            }
            catch (sbxMedErr) {
                console.warn('[SandboxService] Erro ao gravar hierarquia médica no sandbox:', sbxMedErr);
            }
        }
        // 7. Popula Dados Automáticos de Teste no Sandbox
        this.seedSandboxData(sandboxTenantId, sandboxProfId, sandboxUserId, profName);
        // 8. Calcula Capabilities para a Simulação
        const capabilities = capability_service_1.CapabilityService.calculateCapabilities({
            professionId: canonicalProfId,
            commercialModule,
            practiceAreaIds: finalAreaIds,
            medicalSpecialtyIds: medSpecIds,
            medicalPracticeAreaIds: medPaIds,
            tenantId: sandboxTenantId,
            planCode: planCode || 'ALL'
        });
        // 9. Gera Token Especial com Flag isSandbox
        const token = (0, jwt_1.generateToken)({
            userId: sandboxUserId,
            tenantId: sandboxTenantId,
            name: `Dr(a). Teste Sandbox (${profName})`,
            role: 'professional',
            email: `sandbox-${sessionId}@zemda.test`,
            sessionVersion: 0
        });
        // 10. Registra Sessão no Banco
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        database_1.db.prepare(`
      INSERT INTO sandbox_test_sessions (
        id, admin_user_id, profession_id, practice_areas_json, plan_code,
        token, sandbox_tenant_id, created_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
    `).run(sessionId, adminUserId, canonicalProfId, JSON.stringify(finalAreaIds), planCode, token, sandboxTenantId, expiresAt);
        const permissions = ['view_schedule', 'create_appointment', 'edit_appointment', 'create_patient', 'edit_patient'];
        if (flags.zemda_personal_enabled === 1)
            permissions.push('access_zemda_personal');
        if (flags.zemda_med_enabled === 1)
            permissions.push('access_zemda_med');
        if (flags.zemda_fisio_enabled === 1)
            permissions.push('access_zemda_fisio');
        if (flags.zemda_odonto_enabled === 1)
            permissions.push('access_zemda_odonto');
        if (flags.zemda_nutri_enabled === 1)
            permissions.push('access_zemda_nutri');
        if (flags.zemda_to_enabled === 1)
            permissions.push('access_zemda_to');
        if (flags.zemda_fono_enabled === 1)
            permissions.push('access_zemda_fono');
        if (flags.zemda_psico_enabled === 1)
            permissions.push('access_zemda_psico');
        if (flags.zemda_pp_enabled === 1)
            permissions.push('access_zemda_pp');
        const userObj = {
            id: sandboxUserId,
            name: `Dr(a). Teste (${profName})`,
            email: `sandbox-${sessionId}@zemda.test`,
            role: 'professional',
            status: 'active',
            tenantId: sandboxTenantId,
            professionalId: sandboxProfId,
            professionId: canonicalProfId,
            professionName: profName,
            canonicalProfessionId: canonicalProfId,
            canonicalProfessionName: profName,
            registrationType: regBoard,
            registrationNumber: '123456-TESTE',
            practiceAreas: finalAreaIds.join(', '),
            practiceAreaIds: finalAreaIds,
            commercialModule,
            capabilities: capabilities.activeCapabilities,
            permissions,
            zemdaMedEnabled: flags.zemda_med_enabled === 1,
            zemdaFisioEnabled: flags.zemda_fisio_enabled === 1,
            zemdaOdontoEnabled: flags.zemda_odonto_enabled === 1,
            zemdaNutriEnabled: flags.zemda_nutri_enabled === 1,
            zemdaToEnabled: flags.zemda_to_enabled === 1,
            zemdaFonoEnabled: flags.zemda_fono_enabled === 1,
            zemdaPsicoEnabled: flags.zemda_psico_enabled === 1,
            zemdaPPEnabled: flags.zemda_pp_enabled === 1,
            zemdaPersonalEnabled: flags.zemda_personal_enabled === 1,
            zemda360Enabled: true,
            zemdaBodyEnabled: true,
            isSandbox: true,
            sandboxSessionId: sessionId,
            sandboxPlanCode: planCode
        };
        const tenantObj = {
            id: sandboxTenantId,
            name: `Clínica Sandbox (${profName})`,
            client_term_label: 'Paciente',
            isSandbox: true
        };
        return {
            token,
            sessionId,
            sandboxTenantId,
            user: userObj,
            tenant: tenantObj,
            capabilities
        };
    }
    /**
     * Reseta apenas os dados do ambiente de sandbox especificado
     */
    static resetSandbox(sandboxTenantId, profName = 'Profissional') {
        if (!sandboxTenantId || !sandboxTenantId.startsWith('sbx-tenant-')) {
            throw new Error('Operação negada: o reset só pode ser executado em tenants de sandbox.');
        }
        database_1.db.transaction(() => {
            // Limpa dados clínicos simulados
            database_1.db.prepare('DELETE FROM medical_consultations WHERE tenant_id = ?').run(sandboxTenantId);
            database_1.db.prepare('DELETE FROM records WHERE tenant_id = ?').run(sandboxTenantId);
            database_1.db.prepare('DELETE FROM appointments WHERE tenant_id = ?').run(sandboxTenantId);
            database_1.db.prepare('DELETE FROM clinical_certificates WHERE tenant_id = ?').run(sandboxTenantId);
            database_1.db.prepare('DELETE FROM clinical_prescriptions WHERE tenant_id = ?').run(sandboxTenantId);
            database_1.db.prepare('DELETE FROM clinical_exam_requests WHERE tenant_id = ?').run(sandboxTenantId);
            database_1.db.prepare('DELETE FROM patient_exams WHERE tenant_id = ?').run(sandboxTenantId);
            database_1.db.prepare('DELETE FROM body_assessments WHERE tenant_id = ?').run(sandboxTenantId);
            database_1.db.prepare('DELETE FROM body_anthropometric_assessments WHERE tenant_id = ?').run(sandboxTenantId);
            database_1.db.prepare('DELETE FROM patients WHERE tenant_id = ?').run(sandboxTenantId);
            // Busca IDs de profissional e usuário sandbox para recriar dados
            const prof = database_1.db.prepare('SELECT id, user_id FROM professionals WHERE tenant_id = ?').get(sandboxTenantId);
            if (prof) {
                this.seedSandboxData(sandboxTenantId, prof.id, prof.user_id, profName);
            }
        })();
    }
    /**
     * Popula dados mockados seguros dentro do sandbox
     */
    static seedSandboxData(tenantId, profId, userId, profName) {
        const p1Id = 'pat-sbx-01-' + (0, uuid_1.v4)().slice(0, 6);
        const p2Id = 'pat-sbx-02-' + (0, uuid_1.v4)().slice(0, 6);
        // Paciente Teste 01
        database_1.db.prepare(`
      INSERT INTO patients (id, tenant_id, full_name, phone, email, birth_date, active, created_at)
      VALUES (?, ?, 'Paciente Teste 01 (João da Silva)', '(11) 98888-1111', 'joao.teste@zemda.test', '1985-04-12', 1, datetime('now'))
    `).run(p1Id, tenantId);
        // Paciente Teste 02
        database_1.db.prepare(`
      INSERT INTO patients (id, tenant_id, full_name, phone, email, birth_date, active, created_at)
      VALUES (?, ?, 'Paciente Teste 02 (Maria Santos)', '(11) 97777-2222', 'maria.teste@zemda.test', '1992-08-25', 1, datetime('now'))
    `).run(p2Id, tenantId);
        // Serviço Padrão Teste
        const srvId = 'srv-sbx-' + (0, uuid_1.v4)().slice(0, 6);
        database_1.db.prepare(`
      INSERT INTO services (id, tenant_id, name, duration_minutes, price, active, created_at)
      VALUES (?, ?, 'Consulta Padrão de Teste', 50, 200.0, 1, datetime('now'))
    `).run(srvId, tenantId);
        // Agendamento Teste
        const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
        const apptId = 'appt-sbx-' + (0, uuid_1.v4)().slice(0, 6);
        database_1.db.prepare(`
      INSERT INTO appointments (
        id, tenant_id, appointment_number, patient_id, professional_id, service_id,
        start_time, end_time, status, modality, patient_notes, created_at
      ) VALUES (
        ?, ?, 'TEST-001', ?, ?, ?,
        ?, ?, 'confirmed', 'presential', 'Sessão simulada no Laboratório Zemda', datetime('now')
      )
    `).run(apptId, tenantId, p1Id, profId, srvId, `${todayStr}T14:00:00`, `${todayStr}T14:50:00`);
        // Prontuário / Evolução Teste
        const recId = 'rec-sbx-' + (0, uuid_1.v4)().slice(0, 6);
        database_1.db.prepare(`
      INSERT INTO records (
        id, tenant_id, patient_id, appointment_id, professional_id, session_date,
        title, clinical_evolution, is_sealed, created_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        'Evolução Clínica de Teste',
        'Paciente compareceu para atendimento de rotina. Relata boa adesão ao tratamento e melhora sintomática progressiva. Conduta mantida.',
        1, datetime('now')
      )
    `).run(recId, tenantId, p1Id, apptId, profId, todayStr);
        // Consulta Médica Simulada (se for ZemdaMed)
        const medConsId = 'med-sbx-' + (0, uuid_1.v4)().slice(0, 6);
        database_1.db.prepare(`
      INSERT INTO medical_consultations (
        id, tenant_id, patient_id, appointment_id, professional_id, specialty_preset,
        chief_complaint, hpi, vital_signs_json, diagnostic_hypotheses_json, cid_code, cid_description,
        clinical_conduct, return_in_days, created_at
      ) VALUES (
        ?, ?, ?, ?, ?, 'clinica-medica',
        'Avaliação clínica geral e check-up preventivo',
        'Paciente assintomático, nega queixas agudas.',
        '{"paSystolic":120,"paDiastolic":80,"heartRate":72,"respiratoryRate":16,"temperature":36.5,"oxygenSaturation":98,"bloodGlucose":92}',
        '["Exame médico geral de rotina"]', 'Z00.0', 'Exame médico geral',
        'Manter hábitos saudáveis e retorno anual.', 365, datetime('now')
      )
    `).run(medConsId, tenantId, p1Id, apptId, profId);
    }
}
exports.SandboxService = SandboxService;
