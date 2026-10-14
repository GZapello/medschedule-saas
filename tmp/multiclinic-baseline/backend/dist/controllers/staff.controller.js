"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StaffController = void 0;
const billing_controller_1 = require("./billing.controller");
const billing_service_1 = require("../services/billing.service");
const clinic_control_service_1 = require("../services/clinic-control.service");
const database_1 = require("../config/database");
const uuid_1 = require("uuid");
const crypto_1 = __importDefault(require("crypto"));
const audit_middleware_1 = require("../middlewares/audit.middleware");
const schedule_defaults_1 = require("../utils/schedule-defaults");
const profession_taxonomy_service_1 = require("../services/profession-taxonomy.service");
const profession_module_1 = require("../utils/profession-module");
const registration_professions_1 = require("../types/registration-professions");
const role_permissions_1 = require("../utils/role-permissions");
/**
 * Purga com segurança colaboradores desativados há mais de 30 dias (Item 3).
 * Preserva prontuários, documentos, registros financeiros e histórico de atendimentos
 * através da anonimização de dados pessoais e desvinculação da clínica.
 */
function purgeExpiredDeactivatedAccounts(tenantId) {
    try {
        const expiredUsers = database_1.db.prepare(`
      SELECT u.id, u.name, u.email
      FROM users u
      JOIN clinic_users cu ON cu.user_id = u.id AND cu.tenant_id = ?
      WHERE (u.status IN ('inactive', 'blocked') OR cu.status IN ('inactive', 'blocked'))
        AND (
          (u.scheduled_deletion_at IS NOT NULL AND u.scheduled_deletion_at <= datetime('now'))
          OR (cu.scheduled_deletion_at IS NOT NULL AND cu.scheduled_deletion_at <= datetime('now'))
        )
    `).all(tenantId);
        for (const exp of expiredUsers) {
            const anonEmail = `anon_${exp.id}@zemda.internal`;
            const anonName = '[Colaborador Excluído]';
            database_1.db.prepare(`
        UPDATE users SET
          name = ?, email = ?, phone = NULL, avatar_url = NULL,
          status = 'deleted', updated_at = datetime('now')
        WHERE id = ?
      `).run(anonName, anonEmail, exp.id);
            database_1.db.prepare("UPDATE professionals SET active = 0 WHERE user_id = ?").run(exp.id);
            database_1.db.prepare("DELETE FROM clinic_users WHERE user_id = ? AND tenant_id = ?").run(exp.id, tenantId);
        }
    }
    catch (err) {
        console.error('[purgeExpiredDeactivatedAccounts] Erro ao purgar contas expiradas:', err);
    }
}
class StaffController {
    // Lista todos os funcionários e profissionais vinculados à clínica
    static listStaff(req, res) {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) {
                res.status(400).json({ error: 'Identificação de clínica obrigatória' });
                return;
            }
            // 0. Executa purga de contas desativadas há mais de 30 dias (Item 3)
            purgeExpiredDeactivatedAccounts(tenantId);
            // 1. Busca usuários vinculados à clínica via clinic_users
            const usersStmt = database_1.db.prepare(`
        SELECT 
          u.id, u.tenant_id, u.name, u.email, u.role, u.phone, u.avatar_url,
          COALESCE(cu.status, u.status) as status, u.created_at,
          COALESCE(cu.deactivated_at, u.deactivated_at) as deactivated_at,
          COALESCE(cu.scheduled_deletion_at, u.scheduled_deletion_at) as scheduled_deletion_at,
          cu.is_manager, cu.permissions_json, cu.approved_at, cu.approved_by,
          cu.zemda_body_enabled, cu.zemda_personal_enabled,
          COALESCE(cu.profession_custom, prof.name, u.role) as profession_name,
          COALESCE(cu.practice_areas, p.practice_areas, p.bio) as practice_areas,
          p.id as professional_id, p.registration_type, p.registration_number,
          p.zemda_fisio_enabled, p.zemda_odonto_enabled,
          spec.name as specialty_name
        FROM users u
        JOIN clinic_users cu ON cu.user_id = u.id AND cu.tenant_id = ?
        LEFT JOIN professionals p ON p.user_id = u.id AND p.tenant_id = ?
        LEFT JOIN professions prof ON prof.id = p.profession_id
        LEFT JOIN specialties spec ON spec.id = p.specialty_id
        WHERE cu.tenant_id = ? AND u.role NOT IN ('patient')
        ORDER BY 
          CASE WHEN COALESCE(cu.status, u.status) = 'pending' THEN 0 ELSE 1 END,
          u.created_at DESC
      `);
            const staffList = usersStmt.all(tenantId, tenantId, tenantId);
            // Converte permissões em array
            for (const s of staffList) {
                try {
                    s.permissions = s.permissions_json ? JSON.parse(s.permissions_json) : [];
                }
                catch {
                    s.permissions = [];
                }
                if (s.role === 'receptionist' || s.role === 'secretary') {
                    s.permissions = Array.from(new Set([...s.permissions, ...role_permissions_1.DEFAULT_RECEPTIONIST_PERMISSIONS]));
                }
                else if (s.role === 'professional') {
                    s.permissions = Array.from(new Set([...s.permissions, ...role_permissions_1.DEFAULT_PROFESSIONAL_PERMISSIONS]));
                }
                else if (s.permissions.length === 0) {
                    s.permissions = (0, role_permissions_1.getDefaultPermissionsForRole)(s.role);
                }
            }
            // 2. Busca convites pendentes
            const invitesStmt = database_1.db.prepare(`
        SELECT id, tenant_id, email, name, phone, role, registration_number, permissions_json, status, created_at, expires_at
        FROM invites
        WHERE tenant_id = ? AND status = 'pending'
        ORDER BY created_at DESC
      `);
            const invites = invitesStmt.all(tenantId);
            for (const inv of invites) {
                try {
                    inv.permissions = inv.permissions_json ? JSON.parse(inv.permissions_json) : [];
                }
                catch {
                    inv.permissions = [];
                }
            }
            res.json({
                staff: staffList,
                invites
            });
        }
        catch (err) {
            if ((0, billing_controller_1.respondBillingError)(res, err))
                return;
            console.error('[StaffController.listStaff] Erro:', err);
            res.status(500).json({ error: 'Erro ao listar funcionários da clínica' });
        }
    }
    // Criação direta de membro descontinuada (Item 2)
    static async invite(req, res) {
        res.status(403).json({
            error: 'A criação direta de usuários pelo gerente foi descontinuada. Novos usuários devem se cadastrar na plataforma, selecionar a clínica e aguardar aprovação da solicitação.',
            code: 'DIRECT_MEMBER_CREATION_DISABLED'
        });
    }
    // Aprova a solicitação de acesso de um funcionário pendente
    static approve(req, res) {
        try {
            (0, clinic_control_service_1.requireOpenRegistration)(req.tenantId);
            const tenantId = req.tenantId;
            const { id } = req.params;
            const user = database_1.db.prepare('SELECT id, tenant_id, name, status FROM users WHERE id = ?').get(id);
            if (!user) {
                res.status(404).json({ error: 'Funcionário não encontrado' });
                return;
            }
            if (user.tenant_id !== tenantId) {
                res.status(403).json({ error: 'Acesso negado: funcionário não pertence a esta clínica' });
                return;
            }
            (0, billing_service_1.requireCapacity)(tenantId, 1, String(id));
            const cu = database_1.db.prepare("SELECT role, permissions_json, profession_custom, practice_areas FROM clinic_users WHERE user_id = ? AND tenant_id = ?").get(id, tenantId);
            let existingPerms = [];
            try {
                existingPerms = cu?.permissions_json ? JSON.parse(cu.permissions_json) : [];
            }
            catch { }
            const targetRole = cu?.role || user.role;
            const defaultRolePerms = (0, role_permissions_1.getDefaultPermissionsForRole)(targetRole);
            const mergedPerms = Array.from(new Set([...existingPerms, ...defaultRolePerms]));
            database_1.db.prepare("UPDATE users SET status = 'active', updated_at = datetime('now') WHERE id = ?").run(id);
            database_1.db.prepare(`
        UPDATE clinic_users SET
          status = 'active',
          permissions_json = ?,
          approved_by = ?,
          approved_at = datetime('now')
        WHERE user_id = ? AND tenant_id = ?
      `).run(JSON.stringify(mergedPerms), req.user?.userId || null, id, tenantId);
            // Ativa registro profissional caso exista ou vincula se houver profissional com mesmo nome
            const profUpdated = database_1.db.prepare("UPDATE professionals SET active = 1 WHERE user_id = ? AND tenant_id = ?").run(id, tenantId);
            if (profUpdated.changes > 0) {
                const existingProf = database_1.db.prepare("SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ?").get(id, tenantId);
                if (existingProf) {
                    (0, schedule_defaults_1.createDefaultSchedules)(database_1.db, tenantId, existingProf.id);
                }
            }
            else {
                if (user.role === 'professional' || cu?.role === 'professional') {
                    const unlinked = database_1.db.prepare("SELECT id FROM professionals WHERE tenant_id = ? AND (user_id IS NULL OR user_id = '') AND LOWER(name) = LOWER(?) LIMIT 1").get(tenantId, user.name);
                    if (unlinked) {
                        database_1.db.prepare("UPDATE professionals SET user_id = ?, active = 1 WHERE id = ?").run(id, unlinked.id);
                        (0, schedule_defaults_1.createDefaultSchedules)(database_1.db, tenantId, unlinked.id);
                    }
                    else {
                        const profId = 'pro-' + (0, uuid_1.v4)().slice(0, 8);
                        database_1.db.prepare(`
              INSERT INTO professionals (id, tenant_id, user_id, name, registration_type, practice_areas, active)
              VALUES (?, ?, ?, ?, 'Conselho', ?, 1)
            `).run(profId, tenantId, id, user.name, cu?.practice_areas || null);
                        (0, schedule_defaults_1.createDefaultSchedules)(database_1.db, tenantId, profId);
                    }
                }
            }
            (0, audit_middleware_1.logAudit)(req, 'APPROVE_STAFF', 'users', id, { name: user.name });
            res.json({ message: `Acesso do funcionário ${user.name} aprovado com sucesso.` });
        }
        catch (err) {
            if ((0, billing_controller_1.respondBillingError)(res, err))
                return;
            console.error('[StaffController.approve] Erro:', err);
            res.status(500).json({ error: 'Erro ao aprovar funcionário' });
        }
    }
    // Recusa o acesso de um funcionário
    static reject(req, res) {
        try {
            const tenantId = req.tenantId;
            const { id } = req.params;
            const user = database_1.db.prepare('SELECT id, tenant_id, name FROM users WHERE id = ?').get(id);
            if (!user) {
                res.status(404).json({ error: 'Funcionário não encontrado' });
                return;
            }
            if (user.tenant_id !== tenantId) {
                res.status(403).json({ error: 'Acesso negado: funcionário não pertence a esta clínica' });
                return;
            }
            database_1.db.prepare("UPDATE users SET status = 'rejected', updated_at = datetime('now') WHERE id = ?").run(id);
            database_1.db.prepare("UPDATE clinic_users SET status = 'rejected' WHERE user_id = ? AND tenant_id = ?").run(id, tenantId);
            database_1.db.prepare("UPDATE professionals SET active = 0 WHERE user_id = ? AND tenant_id = ?").run(id, tenantId);
            (0, audit_middleware_1.logAudit)(req, 'REJECT_STAFF', 'users', id, { name: user.name });
            res.json({ message: `Solicitação de ${user.name} foi recusada.` });
        }
        catch (err) {
            if ((0, billing_controller_1.respondBillingError)(res, err))
                return;
            console.error('[StaffController.reject] Erro:', err);
            res.status(500).json({ error: 'Erro ao recusar funcionário' });
        }
    }
    // Atualiza cargo, profissão e áreas de atuação de um membro da equipe
    static updateRoleProfession(req, res) {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) {
                res.status(400).json({ error: 'Tenant não informado' });
                return;
            }
            const { id } = req.params;
            const { role, professionId, professionName, practiceAreas } = req.body;
            const user = database_1.db.prepare('SELECT id, tenant_id, name, role FROM users WHERE id = ?').get(id);
            if (!user) {
                res.status(404).json({ error: 'Usuário não encontrado' });
                return;
            }
            if (user.tenant_id !== tenantId) {
                res.status(403).json({ error: 'Acesso negado: usuário não pertence a esta clínica' });
                return;
            }
            const newRole = role || user.role;
            if (newRole === 'superadmin' || user.role === 'superadmin') {
                res.status(403).json({ error: 'O Administrador do Sistema não pode ser criado ou alterado pelo controle de funcionários.' });
                return;
            }
            const isManager = (newRole === 'clinic_admin' || newRole === 'clinical_coordinator') ? 1 : 0;
            // Resolve profissão canônica (se fornecida)
            const rawProf = professionId || req.body.profession_id;
            let canonicalProfId = null;
            let finalProfName = professionName || null;
            if (rawProf && rawProf !== 'none') {
                const directRow = database_1.db.prepare('SELECT id, name FROM professions WHERE id = ?').get(rawProf);
                if (directRow) {
                    canonicalProfId = directRow.id;
                    finalProfName = professionName || directRow.name;
                }
                else {
                    canonicalProfId = registration_professions_1.REGISTRATION_PROFESSION_ALIASES[rawProf] || rawProf;
                    const pRow = database_1.db.prepare('SELECT id, name FROM professions WHERE id = ?').get(canonicalProfId);
                    if (pRow) {
                        finalProfName = pRow.name;
                    }
                }
            }
            else if (professionName && professionName !== 'none') {
                const canonical = (0, profession_module_1.resolveCanonicalProfession)({ name: professionName });
                if (canonical.canonicalId) {
                    canonicalProfId = canonical.canonicalId;
                    finalProfName = canonical.canonicalName;
                }
            }
            // Atualiza usuário
            database_1.db.prepare(`
        UPDATE users SET
          role = ?,
          profession_id = ?,
          profession_name = ?,
          practice_areas = ?,
          updated_at = datetime('now')
        WHERE id = ?
      `).run(newRole, canonicalProfId, finalProfName, practiceAreas || null, id);
            // Atualiza clinic_users
            const cuRow = database_1.db.prepare('SELECT permissions_json FROM clinic_users WHERE user_id = ? AND tenant_id = ?').get(id, tenantId);
            let currentPerms = [];
            try {
                currentPerms = cuRow?.permissions_json ? JSON.parse(cuRow.permissions_json) : [];
            }
            catch { }
            const roleDefaults = (0, role_permissions_1.getDefaultPermissionsForRole)(newRole);
            const updatedPerms = Array.from(new Set([...currentPerms, ...roleDefaults]));
            database_1.db.prepare(`
        UPDATE clinic_users SET
          role = ?,
          is_manager = ?,
          permissions_json = ?,
          profession_id = ?,
          profession_name = ?,
          profession_custom = ?,
          practice_areas = ?
        WHERE user_id = ? AND tenant_id = ?
      `).run(newRole, isManager, JSON.stringify(updatedPerms), canonicalProfId, finalProfName, finalProfName, practiceAreas || null, id, tenantId);
            // Sincroniza tabela professionals e taxonomia se usuário tem perfil clínico ou é 'professional'
            const isAdministrative = ['receptionist', 'secretary', 'financial', 'assistant'].includes(newRole);
            const existingProf = database_1.db.prepare('SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ?').get(id, tenantId);
            if (existingProf) {
                if (isAdministrative) {
                    database_1.db.prepare("UPDATE professionals SET active = 0 WHERE user_id = ? AND tenant_id = ?").run(id, tenantId);
                }
                else {
                    database_1.db.prepare(`
            UPDATE professionals SET
              profession_id = COALESCE(?, profession_id),
              profession_name = COALESCE(?, profession_name),
              practice_areas = ?,
              active = 1
            WHERE user_id = ? AND tenant_id = ?
          `).run(canonicalProfId, finalProfName, practiceAreas || null, id, tenantId);
                    if (canonicalProfId) {
                        profession_taxonomy_service_1.ProfessionTaxonomyService.updateProfessionalTaxonomy({
                            tenantId,
                            professionalId: existingProf.id,
                            newProfessionId: canonicalProfId,
                            newProfessionName: finalProfName || undefined,
                            practiceAreas
                        });
                    }
                }
            }
            else if (!isAdministrative && (canonicalProfId || newRole === 'professional')) {
                const profId = 'pro-' + (0, uuid_1.v4)().slice(0, 8);
                database_1.db.prepare(`
          INSERT INTO professionals (id, tenant_id, user_id, name, profession_id, profession_name, registration_type, practice_areas, active)
          VALUES (?, ?, ?, ?, ?, ?, 'Conselho', ?, 1)
        `).run(profId, tenantId, id, user.name, canonicalProfId, finalProfName, practiceAreas || null);
                (0, schedule_defaults_1.createDefaultSchedules)(database_1.db, tenantId, profId);
                if (canonicalProfId) {
                    profession_taxonomy_service_1.ProfessionTaxonomyService.updateProfessionalTaxonomy({
                        tenantId,
                        professionalId: profId,
                        newProfessionId: canonicalProfId,
                        newProfessionName: finalProfName || undefined,
                        practiceAreas
                    });
                }
            }
            (0, audit_middleware_1.logAudit)(req, 'UPDATE_ROLE_PROFESSION', 'users', id, { role: newRole, professionName, practiceAreas });
            res.json({ message: 'Cargo, profissão e áreas de atuação atualizados com sucesso' });
        }
        catch (err) {
            if ((0, billing_controller_1.respondBillingError)(res, err))
                return;
            console.error('[StaffController.updateRoleProfession] Erro:', err);
            res.status(500).json({ error: 'Erro ao atualizar cargo e profissão do membro da equipe' });
        }
    }
    // Atualiza as permissões específicas do funcionário
    static updatePermissions(req, res) {
        try {
            const tenantId = req.tenantId;
            const { id } = req.params;
            const { permissions } = req.body;
            if (!Array.isArray(permissions)) {
                res.status(400).json({ error: 'Permissões devem ser enviadas como uma lista' });
                return;
            }
            const user = database_1.db.prepare('SELECT id, tenant_id, name, role, profession_id, profession_name FROM users WHERE id = ?').get(id);
            if (!user || user.tenant_id !== tenantId) {
                res.status(403).json({ error: 'Acesso negado: usuário não pertence a esta clínica' });
                return;
            }
            // Remove seleções manuais de módulos gerenciados automaticamente (ZemdaPersonal e Zemda360/ZemdaBody)
            const sanitizedPermissions = permissions.filter((p) => p !== 'access_zemda_personal' && p !== 'access_zemda_body' && p !== 'access_zemda_360');
            // Verifica se a profissão canônica do usuário é Personal Trainer / Ed. Física
            const profRow = database_1.db.prepare('SELECT profession_id, profession_name FROM professionals WHERE user_id = ? AND tenant_id = ?').get(id, tenantId);
            const checkProfId = profRow?.profession_id || user.profession_id;
            const checkProfName = profRow?.profession_name || user.profession_name;
            const resolution = (0, profession_module_1.resolveCanonicalProfession)({ id: checkProfId, name: checkProfName });
            if (resolution.commercialModule === 'ZemdaPersonal') {
                sanitizedPermissions.push('access_zemda_personal');
            }
            const permsJson = JSON.stringify(sanitizedPermissions);
            const zemdaBodyActive = 1; // Universal para profissionais e equipe clínica
            const zemdaPersonalActive = resolution.commercialModule === 'ZemdaPersonal' ? 1 : 0;
            const userRole = user.role || 'professional';
            database_1.db.prepare(`
        INSERT INTO clinic_users (id, tenant_id, user_id, role, status, is_manager, permissions_json, zemda_body_enabled, zemda_personal_enabled)
        VALUES (?, ?, ?, ?, 'active', 0, ?, ?, ?)
        ON CONFLICT(tenant_id, user_id) DO UPDATE SET
          permissions_json = excluded.permissions_json,
          zemda_body_enabled = excluded.zemda_body_enabled,
          zemda_personal_enabled = excluded.zemda_personal_enabled
      `).run('cu-' + (0, uuid_1.v4)().slice(0, 8), tenantId, id, userRole, permsJson, zemdaBodyActive, zemdaPersonalActive);
            (0, audit_middleware_1.logAudit)(req, 'UPDATE_STAFF_PERMISSIONS', 'users', id, { permissionsCount: permissions.length });
            res.json({ message: 'Permissões do funcionário atualizadas com sucesso' });
        }
        catch (err) {
            if ((0, billing_controller_1.respondBillingError)(res, err))
                return;
            console.error('[StaffController.updatePermissions] Erro:', err);
            res.status(500).json({ error: 'Erro ao atualizar permissões do funcionário' });
        }
    }
    // Desativa ou reativa um funcionário com agendamento de exclusão em 30 dias (Item 3)
    static toggleStatus(req, res) {
        try {
            const tenantId = req.tenantId;
            const { id } = req.params;
            const user = database_1.db.prepare('SELECT id, tenant_id, name, status FROM users WHERE id = ?').get(id);
            if (!user || user.tenant_id !== tenantId) {
                res.status(403).json({ error: 'Acesso negado: usuário não pertence a esta clínica' });
                return;
            }
            const isCurrentlyActive = user.status === 'active';
            const newStatus = isCurrentlyActive ? 'inactive' : 'active';
            if (newStatus === 'active')
                (0, billing_service_1.requireCapacity)(tenantId, 1, String(id));
            if (newStatus === 'inactive') {
                // Bloqueia o acesso imediatamente, registra data e agenda exclusão para +30 dias
                database_1.db.prepare(`
          UPDATE users SET
            status = 'inactive',
            deactivated_at = datetime('now'),
            scheduled_deletion_at = datetime('now', '+30 days'),
            updated_at = datetime('now')
          WHERE id = ?
        `).run(id);
                database_1.db.prepare(`
          UPDATE clinic_users SET
            status = 'inactive',
            deactivated_at = datetime('now'),
            scheduled_deletion_at = datetime('now', '+30 days')
          WHERE user_id = ? AND tenant_id = ?
        `).run(id, tenantId);
                database_1.db.prepare("UPDATE professionals SET active = 0 WHERE user_id = ? AND tenant_id = ?").run(id, tenantId);
            }
            else {
                // Reativação durante os 30 dias: cancela exclusão automaticamente e restaura acesso
                database_1.db.prepare(`
          UPDATE users SET
            status = 'active',
            deactivated_at = NULL,
            scheduled_deletion_at = NULL,
            updated_at = datetime('now')
          WHERE id = ?
        `).run(id);
                database_1.db.prepare(`
          UPDATE clinic_users SET
            status = 'active',
            deactivated_at = NULL,
            scheduled_deletion_at = NULL
          WHERE user_id = ? AND tenant_id = ?
        `).run(id, tenantId);
                database_1.db.prepare("UPDATE professionals SET active = 1 WHERE user_id = ? AND tenant_id = ?").run(id, tenantId);
            }
            (0, audit_middleware_1.logAudit)(req, 'TOGGLE_STAFF_STATUS', 'users', id, { newStatus });
            res.json({
                message: newStatus === 'active' ? 'Conta reativada com sucesso' : 'Conta desativada. Exclusão programada para 30 dias.',
                status: newStatus
            });
        }
        catch (err) {
            if ((0, billing_controller_1.respondBillingError)(res, err))
                return;
            console.error('[StaffController.toggleStatus] Erro:', err);
            res.status(500).json({ error: 'Erro ao alterar status do funcionário' });
        }
    }
    // =========================================================================
    // GESTÃO DE CONVITES POR LINK ÚNICO DA CLÍNICA (Itens 14 a 23)
    // =========================================================================
    /**
     * Gera um novo link de convite exclusivo e seguro para a clínica.
     */
    static async createInvite(req, res) {
        try {
            const tenantId = req.tenantId;
            const userId = req.user?.userId;
            if (!tenantId || !userId) {
                res.status(400).json({ error: 'Identificação de clínica e usuário obrigatória' });
                return;
            }
            const { role = 'professional', validityDays = 7, maxUses = 1 } = req.body;
            if (role === 'superadmin') {
                res.status(403).json({ error: 'Convites de clínica não podem conceder administração global.' });
                return;
            }
            // Busca dados do tenant para compor o slug e URL
            const tenant = database_1.db.prepare('SELECT id, name, slug, status, registrations_blocked FROM tenants WHERE id = ?').get(tenantId);
            if (!tenant) {
                res.status(404).json({ error: 'Clínica não encontrada' });
                return;
            }
            if (tenant.status === 'banned') {
                res.status(403).json({ error: 'Esta clínica está banida pelo Administrador do Sistema. A geração de novos convites está bloqueada.' });
                return;
            }
            if (tenant.registrations_blocked === 1) {
                res.status(403).json({ error: 'Novos cadastros e convites estão bloqueados para esta clínica pelo Administrador do Sistema.' });
                return;
            }
            // Gera token seguro e imprevisível de 48 caracteres hexadecimais
            const token = crypto_1.default.randomBytes(24).toString('hex');
            const inviteId = 'cinv-' + (0, uuid_1.v4)().slice(0, 8);
            const days = Math.max(1, Math.min(Number(validityDays) || 7, 30));
            const insertStmt = database_1.db.prepare(`
        INSERT INTO clinic_invites (
          id, tenant_id, created_by, token, role, expires_at, status, max_uses, used_count
        ) VALUES (
          ?, ?, ?, ?, ?, datetime('now', '+' || ? || ' days'), 'pending', ?, 0
        )
      `);
            insertStmt.run(inviteId, tenantId, userId, token, role, days, Number(maxUses) || 1);
            // Busca o registro recém-criado
            const createdInvite = database_1.db.prepare('SELECT * FROM clinic_invites WHERE id = ?').get(inviteId);
            const clinicSlug = tenant.slug || tenant.id;
            const invitePath = `/convite/${clinicSlug}/${token}`;
            (0, audit_middleware_1.logAudit)(req, 'CREATE_CLINIC_INVITE', 'clinic_invites', inviteId, {
                tenantId,
                role,
                validityDays: days,
                expiresAt: createdInvite.expires_at
            });
            res.status(201).json({
                message: 'Link de convite gerado com sucesso!',
                invite: {
                    ...createdInvite,
                    clinicName: tenant.name,
                    clinicSlug,
                    inviteUrl: invitePath
                }
            });
        }
        catch (err) {
            if ((0, billing_controller_1.respondBillingError)(res, err))
                return;
            console.error('[StaffController.createInvite] Erro:', err);
            res.status(500).json({ error: 'Erro ao gerar link de convite' });
        }
    }
    /**
     * Lista todos os convites da clínica, auto-expirando links vencidos.
     */
    static listInvites(req, res) {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) {
                res.status(400).json({ error: 'Identificação de clínica obrigatória' });
                return;
            }
            // Auto-expira convites vencidos no banco
            database_1.db.prepare(`
        UPDATE clinic_invites
        SET status = 'expired', updated_at = datetime('now')
        WHERE tenant_id = ? AND status = 'pending' AND expires_at < datetime('now')
      `).run(tenantId);
            const tenant = database_1.db.prepare('SELECT id, name, slug FROM tenants WHERE id = ?').get(tenantId);
            const clinicSlug = tenant?.slug || tenantId;
            const invites = database_1.db.prepare(`
        SELECT 
          ci.id, ci.tenant_id, ci.created_by, ci.token, ci.role, ci.expires_at,
          ci.status, ci.max_uses, ci.used_count, ci.used_at, ci.used_by,
          ci.created_at, ci.updated_at,
          u.name as creator_name,
          ub.name as used_by_name
        FROM clinic_invites ci
        LEFT JOIN users u ON u.id = ci.created_by
        LEFT JOIN users ub ON ub.id = ci.used_by
        WHERE ci.tenant_id = ?
        ORDER BY ci.created_at DESC
      `).all(tenantId);
            const formatted = invites.map(inv => ({
                ...inv,
                clinicSlug,
                inviteUrl: `/convite/${clinicSlug}/${inv.token}`
            }));
            res.json({ invites: formatted });
        }
        catch (err) {
            if ((0, billing_controller_1.respondBillingError)(res, err))
                return;
            console.error('[StaffController.listInvites] Erro:', err);
            res.status(500).json({ error: 'Erro ao listar links de convite' });
        }
    }
    /**
     * Cancela um link de convite antes de ser utilizado.
     */
    static cancelInvite(req, res) {
        try {
            const tenantId = req.tenantId;
            const { id } = req.params;
            if (!tenantId || !id) {
                res.status(400).json({ error: 'Parâmetros obrigatórios ausentes' });
                return;
            }
            const invite = database_1.db.prepare('SELECT * FROM clinic_invites WHERE id = ? AND tenant_id = ?').get(id, tenantId);
            if (!invite) {
                res.status(404).json({ error: 'Convite não encontrado nesta clínica' });
                return;
            }
            if (invite.status === 'used') {
                res.status(400).json({ error: 'Não é possível cancelar um convite que já foi utilizado.' });
                return;
            }
            database_1.db.prepare(`
        UPDATE clinic_invites
        SET status = 'cancelled', updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ?
      `).run(id, tenantId);
            (0, audit_middleware_1.logAudit)(req, 'CANCEL_CLINIC_INVITE', 'clinic_invites', id, { tenantId });
            res.json({ message: 'Convite cancelado com sucesso' });
        }
        catch (err) {
            if ((0, billing_controller_1.respondBillingError)(res, err))
                return;
            console.error('[StaffController.cancelInvite] Erro:', err);
            res.status(500).json({ error: 'Erro ao cancelar convite' });
        }
    }
}
exports.StaffController = StaffController;
