import { Request, Response } from 'express';
import { db } from '../config/database';
import { logAudit } from '../middlewares/audit.middleware';

export class OnboardingController {
  // Retorna o status de conclusão do onboarding da clínica atual e checklist
  static getStatus(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: 'Identificação de clínica obrigatória' });
        return;
      }

      const tenantStmt = db.prepare(`
        SELECT 
          id, name, corporate_name, trade_name, person_type, cnpj_cpf,
          municipal_registration, state_registration, professional_board, professional_registry,
          email, phone, mobile, whatsapp, website, description,
          address, street, number, complement, neighborhood, city, state, zip_code, country,
          responsible_name, responsible_cpf, responsible_email, responsible_phone, responsible_role,
          onboarding_completed, onboarding_step, manager_confirmed, status
        FROM tenants
        WHERE id = ?
      `);
      const tenant = tenantStmt.get(tenantId) as any;

      if (!tenant) {
        res.status(404).json({ error: 'Clínica não encontrada' });
        return;
      }

      // Checa configurações de recibo
      const recStmt = db.prepare('SELECT is_configured FROM receipt_settings WHERE tenant_id = ?');
      const rec = recStmt.get(tenantId) as any;
      const receiptConfigured = rec?.is_configured === 1;

      // Checa profissionais cadastrados
      const profCount = (db.prepare('SELECT COUNT(*) as total FROM professionals WHERE tenant_id = ? AND active = 1').get(tenantId) as any)?.total || 0;

      // Checa serviços cadastrados
      const srvCount = (db.prepare('SELECT COUNT(*) as total FROM services WHERE tenant_id = ? AND active = 1').get(tenantId) as any)?.total || 0;

      // Avaliação de cada etapa
      const checklist = {
        managerConfirmed: tenant.manager_confirmed === 1,
        clinicData: Boolean((tenant.corporate_name || tenant.name) && (tenant.cnpj_cpf || tenant.email)),
        addressData: Boolean(tenant.city && tenant.state && (tenant.street || tenant.address)),
        responsibleData: Boolean(tenant.responsible_name && (tenant.responsible_cpf || tenant.responsible_email)),
        receiptsConfigured: receiptConfigured,
        hasProfessionals: profCount > 0,
        hasServices: srvCount > 0
      };

      const totalItems = Object.keys(checklist).length;
      const completedItems = Object.values(checklist).filter(Boolean).length;
      const percentage = Math.round((completedItems / totalItems) * 100);

      res.json({
        tenant,
        percentage,
        isCompleted: tenant.onboarding_completed === 1 || percentage === 100,
        currentStep: tenant.onboarding_step || 1,
        checklist
      });
    } catch (err: any) {
      console.error('[OnboardingController.getStatus] Erro:', err);
      res.status(500).json({ error: 'Erro ao consultar status do onboarding' });
    }
  }

  // Confirmação no backend do papel do usuário como Gestor da Clínica
  static confirmManager(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const userId = req.user?.userId;
      const { isManager } = req.body;

      if (!tenantId || !userId) {
        res.status(400).json({ error: 'Autenticação e identificação de clínica obrigatórias' });
        return;
      }

      if (!isManager) {
        res.status(400).json({
          error: 'A confirmação do gestor responsável é obrigatória para prosseguir com a administração desta clínica.'
        });
        return;
      }

      // 1. Atualiza na tabela tenants que o gestor foi validado
      db.prepare("UPDATE tenants SET manager_confirmed = 1, updated_at = datetime('now') WHERE id = ?").run(tenantId);

      // 2. Garante que o usuário possua a role clinic_admin
      db.prepare("UPDATE users SET role = 'clinic_admin', updated_at = datetime('now') WHERE id = ?").run(userId);

      // 3. Registra na tabela de clinic_users como is_manager = 1
      db.prepare(`
        INSERT INTO clinic_users (id, tenant_id, user_id, role, status, is_manager, approved_at)
        VALUES (?, ?, ?, 'clinic_admin', 'active', 1, datetime('now'))
        ON CONFLICT(tenant_id, user_id) DO UPDATE SET
          role = 'clinic_admin',
          status = 'active',
          is_manager = 1,
          approved_at = datetime('now')
      `).run('cu-mgr-' + tenantId, tenantId, userId);

      logAudit(req, 'CONFIRM_MANAGER_ROLE', 'tenants', tenantId, { userId, role: 'clinic_admin' });

      res.json({
        success: true,
        message: 'Função de Gestor da Clínica confirmada e validada com sucesso no backend.'
      });
    } catch (err: any) {
      console.error('[OnboardingController.confirmManager] Erro:', err);
      res.status(500).json({ error: 'Erro ao confirmar papel de gestor' });
    }
  }

  // Salva dados parciais das etapas de onboarding
  static saveStep(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: 'Identificação de clínica obrigatória' });
        return;
      }

      const {
        step,
        // Dados da Clínica
        corporateName, tradeName, personType, cnpjCpf, municipalRegistration, stateRegistration,
        professionalBoard, professionalRegistry, phone, mobile, whatsapp, website, description,
        // Endereço
        street, number, complement, neighborhood, city, state, zipCode, country,
        // Responsável
        responsibleName, responsibleCpf, responsibleEmail, responsiblePhone, responsibleRole
      } = req.body;

      const updateStmt = db.prepare(`
        UPDATE tenants SET
          corporate_name = COALESCE(?, corporate_name),
          trade_name = COALESCE(?, trade_name),
          name = COALESCE(?, name),
          person_type = COALESCE(?, person_type),
          cnpj_cpf = COALESCE(?, cnpj_cpf),
          municipal_registration = COALESCE(?, municipal_registration),
          state_registration = COALESCE(?, state_registration),
          professional_board = COALESCE(?, professional_board),
          professional_registry = COALESCE(?, professional_registry),
          phone = COALESCE(?, phone),
          mobile = COALESCE(?, mobile),
          whatsapp = COALESCE(?, whatsapp),
          website = COALESCE(?, website),
          description = COALESCE(?, description),
          street = COALESCE(?, street),
          number = COALESCE(?, number),
          complement = COALESCE(?, complement),
          neighborhood = COALESCE(?, neighborhood),
          city = COALESCE(?, city),
          state = COALESCE(?, state),
          zip_code = COALESCE(?, zip_code),
          country = COALESCE(?, country),
          address = COALESCE(?, address),
          responsible_name = COALESCE(?, responsible_name),
          responsible_cpf = COALESCE(?, responsible_cpf),
          responsible_email = COALESCE(?, responsible_email),
          responsible_phone = COALESCE(?, responsible_phone),
          responsible_role = COALESCE(?, responsible_role),
          onboarding_step = COALESCE(?, onboarding_step),
          updated_at = datetime('now')
        WHERE id = ?
      `);

      const fullAddress = street && city ? `${street}, ${number || 'S/N'} - ${neighborhood || ''}, ${city}/${state || ''}` : null;

      updateStmt.run(
        corporateName || null,
        tradeName || null,
        tradeName || corporateName || null,
        personType || null,
        cnpjCpf || null,
        municipalRegistration || null,
        stateRegistration || null,
        professionalBoard || null,
        professionalRegistry || null,
        phone || null,
        mobile || null,
        whatsapp || null,
        website || null,
        description || null,
        street || null,
        number || null,
        complement || null,
        neighborhood || null,
        city || null,
        state || null,
        zipCode || null,
        country || null,
        fullAddress,
        responsibleName || null,
        responsibleCpf || null,
        responsibleEmail || null,
        responsiblePhone || null,
        responsibleRole || null,
        step || null,
        tenantId
      );

      res.json({ message: 'Etapa salva com sucesso' });
    } catch (err: any) {
      console.error('[OnboardingController.saveStep] Erro:', err);
      res.status(500).json({ error: 'Erro ao salvar etapa do onboarding' });
    }
  }

  // Conclui formalmente o onboarding da clínica
  static complete(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: 'Identificação de clínica obrigatória' });
        return;
      }

      const tenant = db.prepare('SELECT corporate_name, name, responsible_name, manager_confirmed FROM tenants WHERE id = ?').get(tenantId) as any;
      if (!tenant) {
        res.status(404).json({ error: 'Clínica não encontrada' });
        return;
      }

      if (tenant.manager_confirmed !== 1) {
        res.status(400).json({ error: 'Você precisa confirmar que é o gestor responsável antes de concluir.' });
        return;
      }

      db.prepare(`
        UPDATE tenants SET
          onboarding_completed = 1,
          status = 'active',
          updated_at = datetime('now')
        WHERE id = ?
      `).run(tenantId);

      if (req.body.receiptSettings) {
        const rs = req.body.receiptSettings;
        db.prepare(`
          INSERT INTO receipt_settings (
            id, tenant_id, emitter_type, emitter_name, emitter_document, emitter_registry_number,
            emitter_phone, emitter_email, emitter_street, receipt_prefix, next_sequence, is_configured, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))
          ON CONFLICT(tenant_id) DO UPDATE SET
            emitter_type = COALESCE(excluded.emitter_type, emitter_type),
            emitter_name = COALESCE(excluded.emitter_name, emitter_name),
            emitter_document = COALESCE(excluded.emitter_document, emitter_document),
            emitter_registry_number = COALESCE(excluded.emitter_registry_number, emitter_registry_number),
            emitter_phone = COALESCE(excluded.emitter_phone, emitter_phone),
            emitter_email = COALESCE(excluded.emitter_email, emitter_email),
            emitter_street = COALESCE(excluded.emitter_street, emitter_street),
            receipt_prefix = COALESCE(excluded.receipt_prefix, receipt_prefix),
            next_sequence = COALESCE(excluded.next_sequence, next_sequence),
            is_configured = 1,
            updated_at = datetime('now')
        `).run(
          'rec-set-' + tenantId, tenantId, rs.emitterType || 'pj',
          rs.emitterName || tenant.name, rs.emitterDocument || '00.000.000/0001-00',
          rs.emitterRegistry || null, rs.emitterPhone || null, rs.emitterEmail || null,
          rs.emitterAddress || null, rs.receiptPrefix || 'REC-', rs.nextSequence || 1
        );
      }

      logAudit(req, 'COMPLETE_CLINIC_ONBOARDING', 'tenants', tenantId);

      res.json({
        success: true,
        message: 'Configuração da clínica concluída com sucesso! Bem-vindo à sua plataforma.'
      });
    } catch (err: any) {
      console.error('[OnboardingController.complete] Erro:', err);
      res.status(500).json({ error: 'Erro ao concluir configuração' });
    }
  }
}
