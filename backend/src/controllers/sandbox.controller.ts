import { Request, Response } from 'express';
import { SandboxService } from '../services/sandbox.service';
import { logAudit } from '../middlewares/audit.middleware';

export class SandboxController {
  /**
   * 1. Criar Sessão de Teste do Laboratório Zemda
   */
  public static createSession(req: Request, res: Response): void {
    try {
      if (!req.user || req.user.role !== 'superadmin') {
        res.status(403).json({ error: 'Acesso negado: o Laboratório Zemda é exclusivo para o SuperAdmin.' });
        return;
      }

      const { professionId, practiceAreaIds = [], planCode = 'ALL' } = req.body;
      if (!professionId) {
        res.status(400).json({ error: 'professionId é obrigatório' });
        return;
      }

      const session = SandboxService.createTestSession({
        adminUserId: req.user.userId,
        professionId,
        practiceAreaIds,
        planCode
      });

      logAudit(req, 'CREATE_SANDBOX_SESSION', 'sandbox_test_sessions', session.sessionId, {
        professionId,
        practiceAreaIds,
        planCode
      });

      res.status(201).json(session);
    } catch (err: any) {
      console.error('[SandboxController.createSession] Erro:', err);
      res.status(500).json({ error: err.message || 'Erro ao inicializar sessão do Laboratório Zemda' });
    }
  }

  /**
   * 2. Resetar Dados do Sandbox
   */
  public static resetSandbox(req: Request, res: Response): void {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Não autenticado' });
        return;
      }

      const tenantId = req.tenantId || req.body.tenantId;
      if (!tenantId || !tenantId.startsWith('sbx-tenant-')) {
        res.status(400).json({ error: 'O reset só pode ser executado em ambientes isolados de teste (sandbox).' });
        return;
      }

      SandboxService.resetSandbox(tenantId);
      logAudit(req, 'RESET_SANDBOX_DATA', 'tenants', tenantId, {});

      res.json({
        message: 'Ambiente de teste resetado com sucesso! Dados reais permaneceram intactos.',
        success: true
      });
    } catch (err: any) {
      console.error('[SandboxController.resetSandbox] Erro:', err);
      res.status(500).json({ error: err.message || 'Erro ao resetar ambiente de teste' });
    }
  }
}
