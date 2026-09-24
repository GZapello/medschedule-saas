import type { Request, Response, NextFunction } from 'express';
import { EmailService } from './email.service';

/**
 * Monitoramento de erros de produção com alerta por e-mail (via Resend) para os colaboradores
 * listados em ERROR_ALERT_EMAILS. Agrupa ocorrências iguais e limita o volume de e-mails.
 * Nunca inclui corpo de requisição, query string, cabeçalhos ou dados de pacientes.
 */

interface ErrorContext {
  source: string;
  method?: string;
  route?: string;
  status?: number;
  tenantId?: string;
  userId?: string;
}

interface Incident {
  fingerprint: string;
  title: string;
  detail: string;
  context: ErrorContext;
  pendingCount: number;
  totalCount: number;
  firstSeen: number;
  lastSeen: number;
  lastAlertAt: number | null;
}

const MAX_TRACKED_INCIDENTS = 500;
const incidents = new Map<string, Incident>();
let recentAlerts: number[] = [];
const pendingSends = new Set<Promise<unknown>>();
let warnedNoRecipients = false;

function config() {
  return {
    recipients: (process.env.ERROR_ALERT_EMAILS || '').split(',').map((e) => e.trim()).filter(Boolean),
    throttleMs: (Number(process.env.ERROR_ALERT_THROTTLE_MINUTES) || 30) * 60_000,
    maxPerHour: Number(process.env.ERROR_ALERT_MAX_PER_HOUR) || 20,
    environment: process.env.NODE_ENV === 'production' ? 'produção' : (process.env.NODE_ENV || 'desenvolvimento'),
    appUrl: process.env.APP_URL || ''
  };
}

const ID_SEGMENT = /^(?:\d+|[0-9a-f]{8}-[0-9a-f-]{27,}|[0-9a-f]{16,}|[A-Za-z0-9_-]{24,}|[a-z]+-[0-9a-f]{6,}(?:-[0-9a-f]+)*)$/i;

/** Caminho sem query string e com segmentos que parecem IDs/tokens trocados por ":id". */
export function sanitizePath(url: string): string {
  const pathOnly = url.split('?')[0].split('#')[0];
  return pathOnly.split('/').map((seg) => (ID_SEGMENT.test(seg) ? ':id' : seg)).join('/');
}

function normalizeMessage(message: string): string {
  return message
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<uuid>')
    .replace(/\d+/g, '#')
    .slice(0, 200);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function routeOf(req: Request): string {
  const pattern = req.route?.path;
  if (typeof pattern === 'string') return `${req.baseUrl}${pattern}`;
  return sanitizePath(req.originalUrl || req.url);
}

function record(fingerprint: string, title: string, detail: string, context: ErrorContext): void {
  const now = Date.now();
  let incident = incidents.get(fingerprint);
  if (!incident) {
    if (incidents.size >= MAX_TRACKED_INCIDENTS) {
      const oldest = [...incidents.values()].sort((a, b) => a.lastSeen - b.lastSeen)[0];
      incidents.delete(oldest.fingerprint);
    }
    incident = { fingerprint, title, detail, context, pendingCount: 0, totalCount: 0, firstSeen: now, lastSeen: now, lastAlertAt: null };
    incidents.set(fingerprint, incident);
  }
  incident.pendingCount++;
  incident.totalCount++;
  incident.lastSeen = now;
  incident.detail = detail;
  incident.context = context;
  maybeAlert(incident);
}

function maybeAlert(incident: Incident): void {
  const cfg = config();
  if (cfg.recipients.length === 0) {
    if (!warnedNoRecipients && process.env.NODE_ENV === 'production') {
      warnedNoRecipients = true;
      console.warn('[ErrorMonitor] ERROR_ALERT_EMAILS não definido: erros de produção NÃO geram alertas por e-mail.');
    }
    return;
  }

  const now = Date.now();
  if (incident.lastAlertAt !== null && now - incident.lastAlertAt < cfg.throttleMs) return;
  recentAlerts = recentAlerts.filter((t) => now - t < 60 * 60_000);
  if (recentAlerts.length >= cfg.maxPerHour) return;

  recentAlerts.push(now);
  incident.lastAlertAt = now;
  const occurrences = incident.pendingCount;
  incident.pendingCount = 0;

  const send = sendAlert(incident, occurrences, cfg)
    .catch((err) => console.error('[ErrorMonitor] Falha ao enviar alerta por e-mail:', err?.message || err))
    .finally(() => pendingSends.delete(send));
  pendingSends.add(send);
}

async function sendAlert(incident: Incident, occurrences: number, cfg: ReturnType<typeof config>): Promise<void> {
  const ctx = incident.context;
  const when = new Date(incident.lastSeen).toISOString();
  const subject = `[Zemda][${cfg.environment}] ${incident.title}${occurrences > 1 ? ` (${occurrences}x)` : ''}`.slice(0, 180);
  const rows: Array<[string, string | undefined]> = [
    ['Ambiente', `${cfg.environment}${cfg.appUrl ? ` — ${cfg.appUrl}` : ''}`],
    ['Origem', ctx.source],
    ['Rota', ctx.route ? `${ctx.method ?? ''} ${ctx.route}`.trim() : undefined],
    ['Status HTTP', ctx.status ? String(ctx.status) : undefined],
    ['Clínica (tenant_id)', ctx.tenantId],
    ['Usuário (id)', ctx.userId],
    ['Ocorrências desde o último alerta', String(occurrences)],
    ['Total desde que o servidor subiu', String(incident.totalCount)],
    ['Primeira ocorrência', new Date(incident.firstSeen).toISOString()],
    ['Última ocorrência (UTC)', when]
  ];
  const table = rows
    .filter(([, v]) => v)
    .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#64748b;white-space:nowrap">${escapeHtml(k)}</td><td style="padding:4px 0;color:#0f172a">${escapeHtml(v!)}</td></tr>`)
    .join('');

  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:720px">
      <h2 style="margin:0 0 8px;color:#b91c1c;font-size:18px">Erro em ${escapeHtml(cfg.environment)}: ${escapeHtml(incident.title)}</h2>
      <table style="border-collapse:collapse;font-size:13px;margin:12px 0">${table}</table>
      <pre style="background:#0f172a;color:#e2e8f0;padding:12px;border-radius:8px;font-size:12px;white-space:pre-wrap;word-break:break-word">${escapeHtml(incident.detail.slice(0, 4000))}</pre>
      <p style="font-size:12px;color:#64748b">Veja os logs do servidor (Railway) próximos de ${escapeHtml(when)} UTC para o contexto completo.
      Novos alertas deste mesmo erro ficam agrupados por ${Math.round(cfg.throttleMs / 60_000)} min.</p>
    </div>`;

  const ok = await EmailService.sendCustomEmail(cfg.recipients, subject, html);
  if (!ok) throw new Error('Resend recusou ou não está configurado (RESEND_API_KEY).');
}

export const ErrorMonitor = {
  /** Registra uma exceção (erro não tratado, job em segundo plano, etc.). */
  captureException(err: unknown, context: Partial<ErrorContext> & { source: string }): void {
    try {
      const error = err instanceof Error ? err : new Error(String(err));
      const topFrame = (error.stack || '').split('\n').find((l) => l.trim().startsWith('at ')) || '';
      const fingerprint = `exc:${context.source}:${error.name}:${normalizeMessage(error.message)}:${topFrame.trim()}`;
      record(fingerprint, `${error.name}: ${error.message}`.slice(0, 140), error.stack || error.message, context);
    } catch (monitorErr) {
      console.error('[ErrorMonitor] Falha interna ao registrar erro:', monitorErr);
    }
  },

  /** Middleware que observa todas as respostas e registra as que terminam com status 5xx. */
  requestMiddleware(req: Request, res: Response, next: NextFunction): void {
    const originalJson = res.json.bind(res);
    res.json = (body: any) => {
      if (res.statusCode >= 500 && body && typeof body === 'object') {
        const message = body.error ?? body.message;
        if (typeof message === 'string') res.locals.errorMessage = message.slice(0, 500);
      }
      return originalJson(body);
    };

    res.on('finish', () => {
      if (res.statusCode < 500 || res.locals.errorCaptured) return;
      try {
        const route = routeOf(req);
        const user = (req as any).user;
        const message: string = res.locals.errorMessage || '(a resposta não trouxe mensagem de erro)';
        record(
          `http:${req.method}:${route}:${res.statusCode}`,
          `HTTP ${res.statusCode} em ${req.method} ${route}`,
          `Mensagem retornada ao cliente: ${message}\n\nO controller tratou o erro e respondeu ${res.statusCode}; o stack trace completo está no log do servidor.`,
          { source: 'http', method: req.method, route, status: res.statusCode, tenantId: (req as any).tenantId, userId: user?.userId }
        );
      } catch (monitorErr) {
        console.error('[ErrorMonitor] Falha interna ao registrar resposta 5xx:', monitorErr);
      }
    });
    next();
  },

  /** Registra o erro de uma requisição que chegou ao tratador central de erros do Express. */
  captureRequestError(err: unknown, req: Request, res: Response): void {
    res.locals.errorCaptured = true;
    ErrorMonitor.captureException(err, {
      source: 'http',
      method: req.method,
      route: routeOf(req),
      status: (err as any)?.status || 500,
      tenantId: (req as any).tenantId,
      userId: (req as any).user?.userId
    });
  },

  /** Aguarda os e-mails em andamento (usado antes de encerrar o processo). */
  async flush(timeoutMs = 5000): Promise<void> {
    if (pendingSends.size === 0) return;
    await Promise.race([
      Promise.allSettled([...pendingSends]),
      new Promise((resolve) => setTimeout(resolve, timeoutMs).unref())
    ]);
  },

  /**
   * Alerta sobre exceções não tratadas e promises rejeitadas sem tratamento e então encerra o processo,
   * como o Node já faria por padrão (o Railway reinicia o serviço).
   */
  installProcessHandlers(): void {
    const crash = (source: string) => async (err: unknown) => {
      console.error(`[ErrorMonitor] ${source}:`, err);
      ErrorMonitor.captureException(err, { source });
      await ErrorMonitor.flush();
      process.exit(1);
    };
    process.on('uncaughtException', crash('uncaughtException'));
    process.on('unhandledRejection', crash('unhandledRejection'));
  }
};
