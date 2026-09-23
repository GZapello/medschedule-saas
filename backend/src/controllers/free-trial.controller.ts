import { Request, Response } from 'express';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { db, CURRENT_TERMS_VERSION, CURRENT_PRIVACY_VERSION } from '../config/database';
import { hashPassword } from '../utils/password';
import { generateToken } from '../utils/jwt';
import { logAudit } from '../middlewares/audit.middleware';
import { createDefaultSchedules } from '../utils/schedule-defaults';
import { ensureDefaultClinicService } from '../services/default-service.service';

const VALID_PERIODS: Record<number, string> = {
  7: '7 dias',
  15: '15 dias',
  30: '30 dias',
  90: '3 meses'
};

function parseIsoDate(d: string | null | undefined): Date | null {
  if (!d) return null;
  let str = d.trim();
  if (!str.includes('T') && str.includes(' ')) {
    str = str.replace(' ', 'T') + 'Z';
  } else if (str.includes('T') && !str.endsWith('Z') && !str.includes('+') && !str.slice(10).includes('-')) {
    str = str + 'Z';
  }
  const parsed = new Date(str);
  return isNaN(parsed.getTime()) ? new Date(d) : parsed;
}

export class FreeTrialController {
  /**
   * Criação de novo link de teste grátis (Exclusivo SuperAdmin)
   */
  static async create(req: Request, res: Response): Promise<void> {
    try {
      if (req.user?.role !== 'superadmin') {
        res.status(403).json({ error: 'Acesso negado. Recurso exclusivo do Administrador da Plataforma.' });
        return;
      }

      const { targetName, targetEmail, durationDays, notes, plan } = req.body;

      if (!targetName || typeof targetName !== 'string' || !targetName.trim()) {
        res.status(400).json({ error: 'O nome do cliente/clínica é obrigatório.' });
        return;
      }

      // Validação obrigatória do plano comercial a ser testado
      const normalizedPlan = typeof plan === 'string' ? plan.replace(/^zemda-/i, '').toUpperCase().trim() : '';
      if (!['SOLO', 'TEAM', 'CLINIC'].includes(normalizedPlan)) {
        res.status(400).json({
          error: 'O plano do teste grátis é obrigatório. Selecione: Zemda Solo (SOLO), Zemda Equipe (TEAM) ou Zemda Clínica (CLINIC).'
        });
        return;
      }

      const daysNum = Number(durationDays);
      if (!VALID_PERIODS[daysNum]) {
        res.status(400).json({
          error: 'Período inválido. Os períodos disponíveis são: 7 dias, 15 dias, 30 dias ou 3 meses (90 dias).'
        });
        return;
      }

      const durationLabel = VALID_PERIODS[daysNum];
      const token = crypto.randomBytes(24).toString('hex');
      const now = new Date();
      const nowIso = now.toISOString();
      const linkExpiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
      const trialId = uuidv4();

      db.prepare(`
        INSERT INTO free_trials (
          id, token, target_name, target_email, duration_days, duration_label,
          plan, status, created_by, created_at, link_expires_at, notes, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)
      `).run(
        trialId,
        token,
        targetName.trim(),
        targetEmail && typeof targetEmail === 'string' && targetEmail.trim() ? targetEmail.trim().toLowerCase() : null,
        daysNum,
        durationLabel,
        normalizedPlan,
        req.user?.userId,
        nowIso,
        linkExpiresAt,
        notes && typeof notes === 'string' ? notes.trim() : null,
        nowIso
      );

      logAudit(req, 'CREATE_FREE_TRIAL', 'free_trials', trialId, {
        targetName: targetName.trim(),
        durationDays: daysNum,
        durationLabel,
        plan: normalizedPlan,
        linkExpiresAt
      });

      res.status(201).json({
        success: true,
        trial: {
          id: trialId,
          token,
          targetName: targetName.trim(),
          targetEmail: targetEmail?.trim() || null,
          durationDays: daysNum,
          durationLabel,
          plan: normalizedPlan,
          createdAt: nowIso,
          linkExpiresAt,
          status: 'pending'
        }
      });
    } catch (err: any) {
      console.error('[FreeTrialController.create] Erro ao gerar teste grátis:', err);
      res.status(500).json({ error: 'Erro interno ao gerar link de teste grátis.' });
    }
  }

  /**
   * Listagem completa de testes grátis com status dinâmico (Exclusivo SuperAdmin)
   */
  static async listAll(req: Request, res: Response): Promise<void> {
    try {
      if (req.user?.role !== 'superadmin') {
        res.status(403).json({ error: 'Acesso negado. Recurso exclusivo do Administrador da Plataforma.' });
        return;
      }

      const rows = db.prepare(`
        SELECT 
          ft.*,
          u_creator.name as creator_name,
          u_creator.email as creator_email,
          t.name as tenant_name,
          t.slug as tenant_slug,
          u_activated.name as activated_user_name,
          u_activated.email as activated_user_email
        FROM free_trials ft
        LEFT JOIN users u_creator ON u_creator.id = ft.created_by
        LEFT JOIN tenants t ON t.id = ft.tenant_id
        LEFT JOIN users u_activated ON u_activated.id = ft.user_id
        ORDER BY ft.created_at DESC
      `).all() as any[];

      const now = new Date();

      const trials = rows.map(r => {
        let computedStatus = r.status;
        const linkExpiresAt = parseIsoDate(r.link_expires_at) || new Date(r.link_expires_at);
        const trialEndAt = parseIsoDate(r.trial_end_at);
        const activatedAt = parseIsoDate(r.activated_at);

        if (r.status === 'revoked') {
          computedStatus = 'revoked';
        } else if (activatedAt) {
          if (trialEndAt && now > trialEndAt) {
            computedStatus = 'ended';
          } else {
            computedStatus = 'active';
          }
        } else {
          if (now > linkExpiresAt) {
            computedStatus = 'expired';
          } else {
            computedStatus = 'pending';
          }
        }

        return {
          ...r,
          computed_status: computedStatus
        };
      });

      const summary = {
        total: trials.length,
        pending: trials.filter(t => t.computed_status === 'pending').length,
        active: trials.filter(t => t.computed_status === 'active').length,
        ended: trials.filter(t => t.computed_status === 'ended' || t.computed_status === 'used').length,
        expired: trials.filter(t => t.computed_status === 'expired').length,
        revoked: trials.filter(t => t.computed_status === 'revoked').length
      };

      res.status(200).json({
        trials,
        summary
      });
    } catch (err: any) {
      console.error('[FreeTrialController.listAll] Erro ao listar testes grátis:', err);
      res.status(500).json({ error: 'Erro ao carregar lista de testes grátis.' });
    }
  }

  /**
   * Revogação manual de link não ativado (Exclusivo SuperAdmin)
   */
  static async revoke(req: Request, res: Response): Promise<void> {
    try {
      if (req.user?.role !== 'superadmin') {
        res.status(403).json({ error: 'Acesso negado. Recurso exclusivo do Administrador da Plataforma.' });
        return;
      }

      const { id } = req.params;
      const trial = db.prepare('SELECT * FROM free_trials WHERE id = ?').get(id) as any;

      if (!trial) {
        res.status(404).json({ error: 'Registro de teste grátis não encontrado.' });
        return;
      }

      if (trial.activated_at || trial.status === 'active' || trial.status === 'used') {
        res.status(400).json({ error: 'Não é possível revogar um teste grátis que já foi ativado e utilizado.' });
        return;
      }

      if (trial.status === 'revoked') {
        res.status(400).json({ error: 'Este link de teste já se encontra revogado.' });
        return;
      }

      const nowIso = new Date().toISOString();
      db.prepare(`
        UPDATE free_trials
        SET status = 'revoked', revoked_at = ?, revoked_by = ?, updated_at = ?
        WHERE id = ?
      `).run(nowIso, req.user?.userId, nowIso, trial.id);

      logAudit(req, 'REVOKE_FREE_TRIAL', 'free_trials', trial.id, {
        targetName: trial.target_name,
        token: trial.token
      });

      res.status(200).json({
        success: true,
        message: 'Link de teste grátis revogado com sucesso.'
      });
    } catch (err: any) {
      console.error('[FreeTrialController.revoke] Erro ao revogar teste grátis:', err);
      res.status(500).json({ error: 'Erro ao revogar link de teste grátis.' });
    }
  }

  /**
   * Exclusão definitiva de registro de teste grátis (Exclusivo SuperAdmin)
   */
  static async deletePermanent(req: Request, res: Response): Promise<void> {
    try {
      if (req.user?.role !== 'superadmin') {
        res.status(403).json({ error: 'Acesso negado. Recurso exclusivo do Administrador da Plataforma.' });
        return;
      }

      const { id } = req.params;
      const trial = db.prepare('SELECT * FROM free_trials WHERE id = ?').get(id) as any;

      if (!trial) {
        res.status(404).json({ error: 'Registro de teste grátis não encontrado.' });
        return;
      }

      // Excluir SOMENTE o registro de free_trials.
      // NÃO excluir tenant, usuário, clínica, assinatura, prontuários ou qualquer outro dado vinculado.
      db.prepare('DELETE FROM free_trials WHERE id = ?').run(id);

      logAudit(req, 'DELETE_FREE_TRIAL', 'free_trials', id, {
        targetName: trial.target_name,
        targetEmail: trial.target_email,
        status: trial.status,
        token: trial.token,
        tenantId: trial.tenant_id,
        userId: trial.user_id
      });

      res.status(200).json({
        success: true,
        message: 'Registro de teste grátis excluído definitivamente com sucesso.'
      });
    } catch (err: any) {
      console.error('[FreeTrialController.deletePermanent] Erro ao excluir teste grátis:', err);
      res.status(500).json({ error: 'Erro ao excluir registro de teste grátis.' });
    }
  }

  /**
   * Validação pública de token de teste grátis antes da exibição do formulário
   */
  static async validateToken(req: Request, res: Response): Promise<void> {
    try {
      const { token } = req.params;

      if (!token || typeof token !== 'string') {
        res.status(400).json({ valid: false, code: 'INVALID_TOKEN', error: 'Token de teste grátis não fornecido.' });
        return;
      }

      const trial = db.prepare('SELECT * FROM free_trials WHERE token = ?').get(token.trim()) as any;

      if (!trial) {
        res.status(404).json({
          valid: false,
          code: 'LINK_NOT_FOUND',
          error: 'Link de teste grátis não encontrado ou inválido.'
        });
        return;
      }

      if (trial.status === 'revoked') {
        res.status(410).json({
          valid: false,
          code: 'LINK_REVOKED',
          error: 'Este link de teste grátis foi cancelado/revogado pelo administrador.'
        });
        return;
      }

      if (trial.activated_at || trial.status === 'active' || trial.status === 'used') {
        res.status(409).json({
          valid: false,
          code: 'LINK_ALREADY_USED',
          error: 'Este link de teste grátis já foi utilizado e não permite uma segunda ativação.'
        });
        return;
      }

      const now = new Date();
      const expiresAt = parseIsoDate(trial.link_expires_at) || new Date(trial.link_expires_at);

      if (now.getTime() > expiresAt.getTime()) {
        res.status(410).json({
          valid: false,
          code: 'LINK_EXPIRED',
          error: 'Este link de teste grátis expirou. O prazo para ativação é de até 24 horas a partir da sua criação.'
        });
        return;
      }

      const PLAN_NAMES: Record<string, string> = {
        SOLO: 'Zemda Solo',
        TEAM: 'Zemda Equipe',
        CLINIC: 'Zemda Clínica'
      };
      const trialPlan = (trial.plan || 'SOLO').replace(/^zemda-/i, '').toUpperCase();

      res.status(200).json({
        valid: true,
        trial: {
          id: trial.id,
          targetName: trial.target_name,
          targetEmail: trial.target_email,
          durationDays: trial.duration_days,
          durationLabel: trial.duration_label,
          plan: trialPlan,
          planLabel: PLAN_NAMES[trialPlan] || 'Zemda Solo',
          linkExpiresAt: trial.link_expires_at
        }
      });
    } catch (err: any) {
      console.error('[FreeTrialController.validateToken] Erro ao validar token:', err);
      res.status(500).json({ valid: false, code: 'INTERNAL_ERROR', error: 'Erro ao validar link de teste grátis.' });
    }
  }

  /**
   * Ativação atômica do teste grátis, criação de tenant, gestor e emissão de JWT
   */
  static async activate(req: Request, res: Response): Promise<void> {
    try {
      const { token } = req.params;
      const {
        clinicName,
        managerName,
        managerEmail,
        managerPassword,
        managerPhone,
        professionId,
        termsAccepted,
        privacyAccepted
      } = req.body;

      if (!token || typeof token !== 'string') {
        res.status(400).json({ error: 'Token de teste grátis inválido.' });
        return;
      }

      if (!clinicName || typeof clinicName !== 'string' || !clinicName.trim()) {
        res.status(400).json({ error: 'O nome da clínica é obrigatório.' });
        return;
      }

      if (!managerName || typeof managerName !== 'string' || !managerName.trim()) {
        res.status(400).json({ error: 'O nome do gestor responsável é obrigatório.' });
        return;
      }

      if (!managerEmail || typeof managerEmail !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(managerEmail.trim())) {
        res.status(400).json({ error: 'Forneça um e-mail válido para o gestor.' });
        return;
      }

      if (!managerPassword || typeof managerPassword !== 'string' || managerPassword.length < 6) {
        res.status(400).json({ error: 'A senha de acesso deve ter pelo menos 6 caracteres.' });
        return;
      }

      if (!professionId || typeof professionId !== 'string' || !professionId.trim()) {
        res.status(400).json({ error: 'A área de atuação do profissional é obrigatória.' });
        return;
      }

      if (!termsAccepted || !privacyAccepted) {
        res.status(400).json({ error: 'É obrigatório aceitar os Termos de Uso e a Política de Privacidade para continuar.' });
        return;
      }

      const cleanEmail = managerEmail.trim().toLowerCase();

      // Transação atômica
      const executeActivation = db.transaction(async () => {
        // 1. Revalidar token sob lock de transação
        const trial = db.prepare('SELECT * FROM free_trials WHERE token = ?').get(token.trim()) as any;

        if (!trial) {
          throw { status: 404, code: 'LINK_NOT_FOUND', message: 'Link de teste grátis não encontrado.' };
        }

        if (trial.status === 'revoked') {
          throw { status: 410, code: 'LINK_REVOKED', message: 'Este link de teste grátis foi cancelado pelo administrador.' };
        }

        if (trial.activated_at || trial.status === 'active' || trial.status === 'used') {
          throw { status: 409, code: 'LINK_ALREADY_USED', message: 'Este link de teste grátis já foi utilizado e não permite novo cadastro.' };
        }

        const now = new Date();
        const expiresAt = parseIsoDate(trial.link_expires_at) || new Date(trial.link_expires_at);
        if (now.getTime() > expiresAt.getTime()) {
          throw { status: 410, code: 'LINK_EXPIRED', message: 'Este link de teste grátis expirou. O prazo de ativação de 24 horas encerrou.' };
        }

        // 2. Verificar se o e-mail do usuário já existe
        const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail);
        if (existingUser) {
          throw {
            status: 409,
            code: 'EMAIL_ALREADY_EXISTS',
            message: 'O e-mail informado já está cadastrado no sistema. Por favor, use outro e-mail para seu cadastro.'
          };
        }

        // 3. Gerar slug exclusivo para a clínica
        let baseSlug = clinicName
          .trim()
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '');

        if (!baseSlug) baseSlug = 'clinica';
        let uniqueSlug = baseSlug;
        let suffix = 1;
        while (db.prepare('SELECT id FROM tenants WHERE slug = ?').get(uniqueSlug)) {
          uniqueSlug = `${baseSlug}-${suffix++}`;
        }

        const tenantId = uuidv4();
        const userId = uuidv4();
        const nowIso = now.toISOString();

        // O período de teste começa exatamente AGORA (momento da ativação)
        const trialEnd = new Date(now.getTime() + trial.duration_days * 24 * 60 * 60 * 1000);
        const trialEndIso = trialEnd.toISOString();

        const passwordHash = await hashPassword(managerPassword);

        // 3.1 Resolver a profissão informada
        const profRow = db.prepare('SELECT id, name, slug FROM professions WHERE id = ? OR slug = ? OR name = ?').get(
          professionId.trim(), professionId.trim(), professionId.trim()
        ) as any;
        const selectedProfessionId = profRow ? profRow.id : professionId.trim();
        const selectedProfessionName = profRow ? profRow.name : professionId.trim();
        const selectedProfessionSlug = profRow ? profRow.slug : (professionId.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-'));

        // 4. Resolver o plano exato definido pelo SuperAdmin no teste grátis (SOLO, TEAM ou CLINIC)
        const trialPlanCode = (trial.plan || 'SOLO').replace(/^zemda-/i, '').toUpperCase().trim();
        const planRow = (db.prepare("SELECT id, name, code FROM plans WHERE code = ? OR id = ? OR id = ?").get(trialPlanCode, `zemda-${trialPlanCode}`, `plan-${trialPlanCode.toLowerCase()}`) as any)
          || (db.prepare("SELECT id, name, code FROM plans WHERE code = 'SOLO' OR id = 'zemda-SOLO'").get() as any)
          || { id: 'zemda-SOLO', name: 'Zemda Solo', code: 'SOLO' };

        // 4.1 Criar o Tenant (Clínica) com o plan_id exato
        db.prepare(`
          INSERT INTO tenants (
            id, slug, name, trade_name, corporate_name, email, phone, plan_id,
            status, billing_required, onboarding_completed, onboarding_step,
            terms_accepted, terms_accepted_at, privacy_accepted, privacy_accepted_at,
            responsible_name, responsible_email, responsible_phone, responsible_role,
            manager_profession, manager_practice_areas,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', 0, 0, 1, 1, ?, 1, ?, ?, ?, ?, 'Gestor da Clínica', ?, ?, ?, ?)
        `).run(
          tenantId,
          uniqueSlug,
          clinicName.trim(),
          clinicName.trim(),
          clinicName.trim(),
          cleanEmail,
          managerPhone && typeof managerPhone === 'string' ? managerPhone.trim() : null,
          planRow.id,
          nowIso,
          nowIso,
          managerName.trim(),
          cleanEmail,
          managerPhone && typeof managerPhone === 'string' ? managerPhone.trim() : null,
          selectedProfessionName,
          selectedProfessionName,
          nowIso,
          nowIso
        );

        // 5. Criar o Usuário Gestor (clinic_admin) com área profissional vinculada
        db.prepare(`
          INSERT INTO users (
            id, tenant_id, name, email, password_hash, role, phone, status,
            profession_id, profession_name, practice_areas,
            terms_version_accepted, privacy_version_accepted, terms_accepted_at, privacy_accepted_at,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, 'clinic_admin', ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          userId,
          tenantId,
          managerName.trim(),
          cleanEmail,
          passwordHash,
          managerPhone && typeof managerPhone === 'string' ? managerPhone.trim() : null,
          selectedProfessionId,
          selectedProfessionName,
          selectedProfessionName,
          CURRENT_TERMS_VERSION,
          CURRENT_PRIVACY_VERSION,
          nowIso,
          nowIso,
          nowIso,
          nowIso
        );

        // 5.1 Criar cadastro inicial do profissional para o gestor na clínica
        const profRecordId = 'pro-' + uuidv4().slice(0, 8);
        const profSlug = managerName.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + profRecordId.slice(-4);
        db.prepare(`
          INSERT INTO professionals (
            id, tenant_id, user_id, name, slug, public_booking_enabled,
            profession_id, practice_areas, buffer_minutes, active, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, 10, 1, ?, ?)
        `).run(
          profRecordId,
          tenantId,
          userId,
          managerName.trim(),
          profSlug,
          selectedProfessionId,
          selectedProfessionName,
          nowIso,
          nowIso
        );

        // 5.2 Cria grade de horários padrão de segunda a sexta (ativo) e sábado/domingo (inativo)
        createDefaultSchedules(db, tenantId, profRecordId);

        // 6. Criar vínculo na tabela clinic_users
        db.prepare(`
          INSERT INTO clinic_users (
            id, tenant_id, user_id, role, status, is_manager, created_at
          ) VALUES (?, ?, ?, 'clinic_admin', 'active', 1, ?)
        `).run(uuidv4(), tenantId, userId, nowIso);

        // 7. Registrar aceite legal (LGPD Compliance)
        db.prepare(`
          INSERT INTO legal_acceptances (
            id, user_id, clinic_id, terms_version, privacy_version, marketing_opt_in,
            accepted_at, ip_address, user_agent, created_at
          ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
        `).run(
          uuidv4(),
          userId,
          tenantId,
          CURRENT_TERMS_VERSION,
          CURRENT_PRIVACY_VERSION,
          nowIso,
          req.ip || null,
          (req.headers['user-agent'] as string) || null,
          nowIso
        );

        // 8 e 9. Criar assinatura com status 'trial' no plano selecionado (${planRow.name || planRow.id})
        db.prepare(`
          INSERT INTO subscriptions (
            id, tenant_id, clinic_id, plan_id, status, current_period_start, current_period_end,
            cancel_at_period_end, managed, is_current, created_at
          ) VALUES (?, ?, ?, ?, 'trial', ?, ?, 0, 0, 1, ?)
        `).run(
          uuidv4(),
          tenantId,
          tenantId,
          planRow.id,
          nowIso,
          trialEndIso,
          nowIso
        );

        // 10. Atualizar e bloquear o token de teste grátis
        db.prepare(`
          UPDATE free_trials
          SET status = 'active', activated_at = ?, trial_end_at = ?,
              tenant_id = ?, user_id = ?, updated_at = ?
          WHERE id = ?
        `).run(
          nowIso,
          trialEndIso,
          tenantId,
          userId,
          nowIso,
          trial.id
        );

        // 10.1 Criação automática e idempotente do serviço inicial padrão 'Atendimento / Consulta' (R$ 180,00)
        ensureDefaultClinicService(tenantId);

        // 11. Gerar token JWT para login instantâneo
        const authToken = generateToken({
          userId,
          tenantId,
          role: 'clinic_admin',
          email: cleanEmail,
          name: managerName.trim()
        });

        return {
          authToken,
          user: {
            id: userId,
            tenantId,
            name: managerName.trim(),
            email: cleanEmail,
            role: 'clinic_admin',
            phone: managerPhone || null,
            status: 'active',
            profession_id: selectedProfessionId,
            profession_name: selectedProfessionName,
            professionSlug: selectedProfessionSlug,
            professionId: selectedProfessionId,
            professionName: selectedProfessionName,
            practice_areas: selectedProfessionName
          },
          tenant: {
            id: tenantId,
            name: clinicName.trim(),
            slug: uniqueSlug,
            status: 'active',
            manager_profession: selectedProfessionName,
            manager_practice_areas: selectedProfessionName
          },
          trialEndAt: trialEndIso,
          durationDays: trial.duration_days,
          durationLabel: trial.duration_label
        };
      });

      const result = await executeActivation();

      logAudit(req, 'ACTIVATE_FREE_TRIAL', 'free_trials', token, {
        tenantId: result.tenant.id,
        userId: result.user.id,
        durationDays: result.durationDays,
        trialEndAt: result.trialEndAt
      });

      res.status(200).json({
        success: true,
        message: 'Teste grátis ativado com sucesso! Seja bem-vindo à plataforma Zemda.',
        token: result.authToken,
        user: result.user,
        tenant: result.tenant,
        trialEndAt: result.trialEndAt,
        durationDays: result.durationDays,
        durationLabel: result.durationLabel
      });
    } catch (err: any) {
      if (err?.status) {
        res.status(err.status).json({
          success: false,
          code: err.code || 'ACTIVATION_ERROR',
          error: err.message
        });
        return;
      }

      console.error('[FreeTrialController.activate] Erro na ativação do teste grátis:', err);
      res.status(500).json({
        success: false,
        code: 'INTERNAL_ERROR',
        error: 'Não foi possível concluir a ativação do teste grátis. Tente novamente em instantes.'
      });
    }
  }
}
