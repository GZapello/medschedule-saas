import { Request, Response } from 'express';
import { SandboxError, SandboxService } from '../services/sandbox.service';
import { logAudit } from '../middlewares/audit.middleware';

export class SandboxController {
  /**
   * Consulta o status atual do Ambiente de Teste Reutilizável (Exclusivo SuperAdmin)
   * GET /api/v1/sandbox/status
   */
  public static getStatus(req: Request, res: Response): void {
    try {
      if (!req.user || req.user.role !== 'superadmin' || req.isSandboxSession) {
        res.status(403).json({ error: 'Apenas SuperAdmin fora do sandbox pode consultar o Laboratório.' });
        return;
      }

      const status = SandboxService.getEnvironmentStatus(req.user.userId);
      res.json(status);
    } catch (err: any) {
      if (err instanceof SandboxError) {
        res.status(err.statusCode).json({ error: err.message, code: err.code });
        return;
      }
      console.error('[SandboxController.getStatus] Erro:', err);
      res.status(500).json({ error: err?.message || 'Erro ao consultar status do Ambiente de Teste' });
    }
  }

  /**
   * Relatório apenas de leitura de sandboxes históricos legados (NUNCA exclui automaticamente)
   * GET /api/v1/sandbox/legacy-report
   */
  public static getLegacyReport(req: Request, res: Response): void {
    try {
      if (!req.user || req.user.role !== 'superadmin' || req.isSandboxSession) {
        res.status(403).json({ error: 'Acesso exclusivo ao SuperAdmin.' });
        return;
      }

      const report = SandboxService.getLegacySandboxReport();
      res.json(report);
    } catch (err: any) {
      console.error('[SandboxController.getLegacyReport] Erro:', err);
      res.status(500).json({ error: err?.message || 'Erro ao consultar relatório de sandboxes legados' });
    }
  }

  /**
   * Inicia ou reutiliza uma sessão de teste (Gestor de Teste ou Profissional de Teste)
   * POST /api/v1/sandbox/create-session
   */
  public static async createSession(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user || req.user.role !== 'superadmin' || req.isSandboxSession) {
        res.status(403).json({ error: 'Apenas SuperAdmin pode iniciar sessões no Laboratório Sandbox.' });
        return;
      }

      const {
        mode = 'professional',
        establishmentProfile = 'clinic',
        professionId,
        practiceAreaIds = [],
        planCode = 'ALL'
      } = req.body || {};

      if (mode !== 'manager' && mode !== 'professional') {
        res.status(400).json({ error: 'Modo de simulação inválido. Utilize manager ou professional.' });
        return;
      }

      if (establishmentProfile && !['clinic', 'studio', 'mixed'].includes(establishmentProfile)) {
        res.status(400).json({ error: 'Perfil do estabelecimento inválido. Utilize clinic, studio ou mixed.' });
        return;
      }

      if (mode === 'professional' && !professionId) {
        res.status(400).json({ error: 'professionId é obrigatório para simulação de Profissional.' });
        return;
      }

      const session = await SandboxService.createTestSession({
        adminUserId: req.user.userId,
        mode,
        establishmentProfile,
        professionId: professionId || 'prof-fisioterapeuta',
        practiceAreaIds: Array.isArray(practiceAreaIds) ? practiceAreaIds : [],
        planCode
      });

      logAudit(req, 'CREATE_SANDBOX_SESSION', 'sandbox_test_sessions', session.sessionId, {
        mode,
        establishmentProfile,
        professionId: professionId || null,
        practiceAreaIds,
        planCode,
        sandboxTenantId: session.sandboxTenantId
      });

      res.status(200).json(session);
    } catch (err: any) {
      if (err instanceof SandboxError) {
        res.status(err.statusCode).json({ error: err.message, code: err.code });
        return;
      }
      console.error('[SandboxController.createSession] Erro:', err);
      res.status(500).json({ error: err?.message || 'Erro ao iniciar sessão do laboratório sandbox' });
    }
  }

  /**
   * Encerra e revoga a sessão de teste ativa no backend
   * POST /api/v1/sandbox/exit
   */
  public static exitSession(req: Request, res: Response): void {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Não autenticado' });
        return;
      }

      const sessionId = req.sandboxSessionId || (typeof req.body?.sessionId === 'string' ? req.body.sessionId : undefined);
      const result = SandboxService.exitSession({
        sessionId,
        userId: req.user.userId,
        userRole: req.user.role
      });

      logAudit(req, 'EXIT_SANDBOX_SESSION', 'sandbox_test_sessions', sessionId || req.user.userId, {
        revokedCount: result.revokedCount
      });

      res.json({ success: true, ...result });
    } catch (err: any) {
      console.error('[SandboxController.exitSession] Erro:', err);
      res.status(500).json({ error: err?.message || 'Erro ao encerrar sessão de teste' });
    }
  }

  /**
   * Reseta todos os dados mutáveis de teste do Ambiente Sandbox autorizado, preservando identidades e dados reais.
   * POST /api/v1/sandbox/reset
   */
  public static async resetSandbox(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Não autenticado' });
        return;
      }

      const requestedTenantId = typeof req.body?.tenantId === 'string' && req.body.tenantId.trim()
        ? req.body.tenantId.trim()
        : undefined;

      const result = await SandboxService.resetSandboxEnvironment({
        actorUserId: req.user.userId,
        actorRole: req.user.role,
        actorTenantId: req.tenantId || req.user.tenantId,
        isSandboxSession: req.isSandboxSession,
        sandboxSessionId: req.sandboxSessionId,
        sandboxAccountType: req.sandboxAccountType,
        requestedTenantId,
        confirmationText: typeof req.body?.confirmation === 'string' ? req.body.confirmation : undefined
      });

      logAudit(req, 'RESET_SANDBOX_DATA', 'sandbox_environments', result.environmentId, {
        sandboxTenantId: result.sandboxTenantId,
        deletedTablesCount: result.deletedTables.length,
        removedFilesCount: result.removedFilesCount
      });

      res.json({
        message: 'Ambiente de teste restaurado com sucesso! Dados reais permaneceram intactos.',
        ...result
      });
    } catch (err: any) {
      if (err instanceof SandboxError) {
        res.status(err.statusCode).json({ error: err.message, code: err.code });
        return;
      }
      console.error('[SandboxController.resetSandbox] Erro:', err);
      res.status(500).json({ error: err?.message || 'Erro ao resetar ambiente de teste' });
    }
  }
}
