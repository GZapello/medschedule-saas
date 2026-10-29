import { Request, Response } from 'express';
import { GoogleCalendarService, GoogleCalendarError } from '../services/google-calendar.service';
function publicError(err: any, fallback: string): string { return err instanceof GoogleCalendarError ? err.message : fallback; }

import { db } from '../config/database';

function resolveProfessionalId(tenantId: string, userId: string): string | null {
  const row = db.prepare(`
    SELECT id FROM professionals WHERE tenant_id = ? AND user_id = ?
  `).get(tenantId, userId) as { id: string } | undefined;
  if (row?.id) return row.id;

  // Se professionals.user_id estiver nulo, busca pelo nome do usuário no mesmo tenant
  const user = db.prepare('SELECT email, name FROM users WHERE id = ?').get(userId) as { email: string; name: string } | undefined;
  if (user?.name) {
    const profByName = db.prepare(`
      SELECT id FROM professionals WHERE tenant_id = ? AND (user_id IS NULL OR user_id = '') AND LOWER(name) = LOWER(?) LIMIT 1
    `).get(tenantId, user.name) as { id: string } | undefined;
    if (profByName?.id) {
      try {
        db.prepare("UPDATE professionals SET user_id = ?, updated_at = datetime('now') WHERE id = ?").run(userId, profByName.id);
      } catch (_) {}
      return profByName.id;
    }
  }

  // Fallback para clínica com apenas 1 profissional ativo
  const soleProf = db.prepare(`
    SELECT id FROM professionals WHERE tenant_id = ? AND active = 1
  `).all(tenantId) as { id: string }[];
  if (soleProf.length === 1) {
    try {
      db.prepare("UPDATE professionals SET user_id = ?, updated_at = datetime('now') WHERE id = ? AND user_id IS NULL").run(userId, soleProf[0].id);
    } catch (_) {}
    return soleProf[0].id;
  }

  return null;
}

export class GoogleCalendarController {
  /**
   * Inicia o fluxo de autorização OAuth 2.0.
   * GET /v1/integrations/google-calendar/connect
   */
  public static async connect(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId || (req.user ? req.user.tenantId : null);
      const userId = req.user ? req.user.userId : null;

      if (!tenantId || !userId) {
        res.status(401).json({ error: 'Usuário não autenticado ou clínica não identificada.' });
        return;
      }

      if (!GoogleCalendarService.isConfigured()) {
        res.status(400).json({
          error: 'Google Agenda ainda não configurado pelo administrador. Confira as credenciais OAuth e a chave dedicada de criptografia no servidor.'
        });
        return;
      }

      const professionalId = resolveProfessionalId(tenantId, userId);
      const returnUrl = (req.query.return_url as string) || (req.headers.referer as string) || undefined;

      const { url } = GoogleCalendarService.generateAuthUrl(tenantId, userId, professionalId, returnUrl);

      if (req.query.redirect === 'true') {
        res.redirect(url);
      } else {
        res.status(200).json({ url });
      }
    } catch (err: any) {
      console.error('[GoogleCalendarController.connect] Erro:', 'Operação Google Agenda falhou');
      res.status(500).json({ error: publicError(err, 'Falha ao iniciar conexão com Google Agenda') });
    }
  }

  /**
   * Endpoint de callback OAuth 2.0 retornado pelo Google.
   * GET /v1/integrations/google-calendar/callback
   */
  public static async callback(req: Request, res: Response): Promise<void> {
    const code = req.query.code as string;
    const state = req.query.state as string;
    const error = req.query.error as string;

    const appUrl = (process.env.APP_URL || process.env.PUBLIC_APP_URL || 'https://zemda.com.br').replace(/\/+$/, '');

    if (error) {
      if (typeof state === 'string') db.prepare('DELETE FROM google_calendar_oauth_states WHERE state = ?').run(state);
      res.redirect(`${appUrl}/configuracoes?tab=integrations&google_calendar_error=${encodeURIComponent('Autorização Google não concluída.')}`);
      return;
    }

    try {
      const result = await GoogleCalendarService.handleCallback(code, state);

      const redirectTarget = GoogleCalendarService.safeReturnUrl(result.returnUrl);
      const target = new URL(redirectTarget);
      target.searchParams.delete('google_calendar');
      target.searchParams.delete('google_calendar_error');
      target.searchParams.set(result.success ? 'google_calendar' : 'google_calendar_error', result.success ? 'connected' : result.error || 'Erro na autorização');
      res.redirect(target.href);
    } catch (err: any) {
      console.error('[GoogleCalendarController.callback] Exceção no callback:', 'Operação Google Agenda falhou');
      res.redirect(`${appUrl}/configuracoes?tab=integrations&google_calendar_error=${encodeURIComponent(publicError(err, 'Não foi possível concluir a autorização. Tente novamente.'))}`);
    }
  }

  /**
   * Retorna o status de conexão da Google Agenda do usuário.
   * GET /v1/integrations/google-calendar/status
   */
  public static async getStatus(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId || (req.user ? req.user.tenantId : null);
      const userId = req.user ? req.user.userId : null;

      if (!tenantId || !userId) {
        res.status(401).json({ error: 'Não autenticado' });
        return;
      }

      const professionalId = resolveProfessionalId(tenantId, userId);
      const status = GoogleCalendarService.getStatus(tenantId, userId, professionalId);

      res.status(200).json(status);
    } catch (err: any) {
      console.error('[GoogleCalendarController.getStatus] Erro:', 'Operação Google Agenda falhou');
      res.status(500).json({ error: 'Erro ao consultar status da integração' });
    }
  }

  /**
   * Lista as agendas disponíveis da conta Google conectada.
   * GET /v1/integrations/google-calendar/calendars
   */
  public static async getCalendars(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId || (req.user ? req.user.tenantId : null);
      const userId = req.user ? req.user.userId : null;

      if (!tenantId || !userId) {
        res.status(401).json({ error: 'Não autenticado' });
        return;
      }

      const calendars = await GoogleCalendarService.listCalendars(tenantId, userId);
      res.status(200).json({ calendars });
    } catch (err: any) {
      console.error('[GoogleCalendarController.getCalendars] Erro:', 'Operação Google Agenda falhou');
      res.status(400).json({ error: publicError(err, 'Erro ao listar agendas Google') });
    }
  }

  /**
   * Atualiza as preferências da integração Google Agenda.
   * PUT /v1/integrations/google-calendar/settings
   */
  public static async updateSettings(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId || (req.user ? req.user.tenantId : null);
      const userId = req.user ? req.user.userId : null;

      if (!tenantId || !userId) {
        res.status(401).json({ error: 'Não autenticado' });
        return;
      }

      await GoogleCalendarService.updateSettings(tenantId, userId, req.body);
      res.status(200).json({ success: true, message: 'Configurações atualizadas com sucesso.' });
    } catch (err: any) {
      console.error('[GoogleCalendarController.updateSettings] Erro:', 'Operação Google Agenda falhou');
      res.status(400).json({ error: publicError(err, 'Erro ao atualizar configurações') });
    }
  }

  /**
   * Força uma sincronização manual imediata.
   * POST /v1/integrations/google-calendar/sync
   */
  public static async sync(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId || (req.user ? req.user.tenantId : null);
      const userId = req.user ? req.user.userId : null;

      if (!tenantId || !userId) {
        res.status(401).json({ error: 'Não autenticado' });
        return;
      }

      const professionalId = resolveProfessionalId(tenantId, userId);
      const result = await GoogleCalendarService.syncNow(tenantId, userId, professionalId);

      res.status(200).json({ success: true, ...result });
    } catch (err: any) {
      console.error('[GoogleCalendarController.sync] Erro:', 'Operação Google Agenda falhou');
      res.status(500).json({ error: publicError(err, 'Erro ao sincronizar com Google Agenda') });
    }
  }

  /**
   * Desconecta a Google Agenda do usuário autenticado.
   * DELETE /v1/integrations/google-calendar/disconnect
   */
  public static async disconnect(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId || (req.user ? req.user.tenantId : null);
      const userId = req.user ? req.user.userId : null;

      if (!tenantId || !userId) {
        res.status(401).json({ error: 'Não autenticado' });
        return;
      }

      const result = await GoogleCalendarService.disconnect(tenantId, userId);
      res.status(200).json({ success: true, revoked: result.revoked, message: result.revoked ? 'Google Agenda desconectada.' : 'Conexão local removida. Não foi possível confirmar a revogação no Google; remova o acesso em myaccount.google.com/permissions.' });
    } catch (err: any) {
      console.error('[GoogleCalendarController.disconnect] Erro:', 'Operação Google Agenda falhou');
      res.status(500).json({ error: 'Erro ao desconectar Google Agenda' });
    }
  }

  /**
   * Webhook público para receber notificações de push do Google Calendar.
   * POST /v1/integrations/google-calendar/webhook
   */
  public static async webhook(req: Request, res: Response): Promise<void> {
    // Responde 200 imediatamente para o Google
    res.status(200).send('OK');

    // Executa em background
    GoogleCalendarService.handleWebhook(req.headers as any).catch(err => {
      console.warn('[GoogleCalendarController.webhook] Erro ao tratar notificação:', 'Operação Google Agenda falhou');
    });
  }

  /**
   * Resolve divergência de horário detectada entre o Zemda e o Google Agenda.
   * POST /v1/integrations/google-calendar/divergence/:appointmentId/resolve
   */
  public static async resolveDivergence(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId || (req.user ? req.user.tenantId : null);
      const { appointmentId } = req.params;
      const { action } = req.body; // 'apply_google' | 'keep_zemda'

      if (!tenantId) {
        res.status(401).json({ error: 'Não autenticado' });
        return;
      }

      if (!action || !['apply_google', 'keep_zemda'].includes(action)) {
        res.status(400).json({ error: 'Ação inválida. Utilize "apply_google" ou "keep_zemda".' });
        return;
      }

      const apptId = Array.isArray(appointmentId) ? appointmentId[0] : String(appointmentId);
      const result = await GoogleCalendarService.resolveDivergence(apptId, tenantId, action, req.user!.userId);
      res.status(200).json({ success: true, ...result });
    } catch (err: any) {
      console.error('[GoogleCalendarController.resolveDivergence] Erro:', 'Operação Google Agenda falhou');
      res.status(400).json({ error: publicError(err, 'Erro ao resolver divergência') });
    }
  }
}
