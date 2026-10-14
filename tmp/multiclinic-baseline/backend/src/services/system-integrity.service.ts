import type { Request, Response } from 'express';
import { db } from '../config/database';

const startedAt = new Date().toISOString();
let lastCleanup = 0;
let initialized = false;

function initialize() {
  if (initialized) return;
  db.exec(`CREATE TABLE IF NOT EXISTS technical_events (
    id INTEGER PRIMARY KEY, event_type TEXT NOT NULL, tenant_id TEXT NOT NULL DEFAULT '',
    module TEXT NOT NULL, endpoint TEXT NOT NULL, severity TEXT NOT NULL, message TEXT NOT NULL,
    status_code INTEGER NOT NULL, bucket TEXT NOT NULL, occurrences INTEGER NOT NULL DEFAULT 1,
    first_seen TEXT NOT NULL DEFAULT (datetime('now')), last_seen TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(event_type, tenant_id, module, endpoint, status_code, bucket)
  ); CREATE INDEX IF NOT EXISTS idx_technical_events_recent ON technical_events(last_seen, severity);`);
  initialized = true;
}

export const SystemIntegrity = {
  observe(req: Request, res: Response) {
    // Only Express route templates are retained, never URLs, request/response bodies,
    // error messages, query strings, filenames, user identity or clinical payloads.
    const route = typeof req.route?.path === 'string' ? req.route.path : '/unmatched';
    if (route.includes('/admin/integrity')) return;
    const kind = /draft|autosave/.test(route) ? 'autosave' : /files|upload|attachment/.test(route) ? 'uploads' : 'api';
    const modules = ['physiotherapy', 'medical', 'nutrition', 'dentistry', 'speech-therapy', 'occupational-therapy', 'psychology', 'psychopedagogy', 'personal', 'estetic', 'fisio', 'fono', 'odonto', 'nutri', 'to', 'psico', 'pp', 'med'];
    const draftModule = typeof (req.params?.moduleType || req.body?.moduleType) === 'string'
      ? String(req.params?.moduleType || req.body?.moduleType).toLowerCase().replace(/^zemda/, '') : '';
    const module = modules.find(name => route.includes('/' + name)) || (kind === 'autosave' && modules.includes(draftModule) ? draftModule : 'clinical');
    try {
      initialize();
      const status = res.statusCode;
      db.prepare(`INSERT INTO technical_events(event_type,tenant_id,module,endpoint,severity,message,status_code,bucket)
        VALUES(?,?,?,?,?,?,?,strftime('%Y-%m-%d %H','now'))
        ON CONFLICT(event_type,tenant_id,module,endpoint,status_code,bucket) DO UPDATE SET
        occurrences=occurrences+1,last_seen=datetime('now')`).run(kind, req.tenantId || '', module,
        `${req.method} ${route}`, status >= 500 ? 'error' : status >= 400 ? 'warning' : 'info',
        status >= 400 ? `Resposta HTTP ${status}` : 'Requisição concluída', status);
      if (Date.now() - lastCleanup > 3600000) {
        db.exec("DELETE FROM technical_events WHERE last_seen < datetime('now','-7 days'); DELETE FROM technical_events WHERE id NOT IN (SELECT id FROM technical_events ORDER BY last_seen DESC LIMIT 20000)");
        lastCleanup = Date.now();
      }
    } catch { console.error('[SystemIntegrity] Falha ao registrar evento técnico.'); }
  },

  snapshot(page: number) {
    initialize();
    const where = "last_seen >= datetime('now','-24 hours')";
    const services = db.prepare(`SELECT event_type AS service, SUM(occurrences) AS attempts,
      SUM(CASE WHEN status_code < 400 THEN occurrences ELSE 0 END) AS successes,
      SUM(CASE WHEN status_code >= 400 THEN occurrences ELSE 0 END) AS failures,
      SUM(CASE WHEN status_code >= 500 THEN occurrences ELSE 0 END) AS errors, MAX(last_seen) AS last_seen
      FROM technical_events WHERE ${where} GROUP BY event_type`).all();
    const recent = db.prepare(`SELECT event_type,module,endpoint,severity,message,tenant_id,occurrences,last_seen
      FROM technical_events WHERE ${where} AND status_code >= 400 ORDER BY last_seen DESC,id DESC LIMIT 25 OFFSET ?`).all((page - 1) * 25);
    const count = (db.prepare(`SELECT COUNT(*) AS count FROM technical_events WHERE ${where} AND status_code >= 400`).get() as any).count;
    const affected = (db.prepare(`SELECT COUNT(DISTINCT tenant_id) AS count FROM technical_events WHERE ${where} AND status_code >= 400 AND tenant_id != ''`).get() as any).count;
    const frequent = db.prepare(`SELECT event_type,module,endpoint,status_code,SUM(occurrences) AS occurrences,
      COUNT(DISTINCT NULLIF(tenant_id,'')) AS clinics,MAX(last_seen) AS last_seen FROM technical_events
      WHERE ${where} AND status_code >= 400 GROUP BY event_type,module,endpoint,status_code ORDER BY occurrences DESC LIMIT 10`).all();
    const autosave = db.prepare(`SELECT module, SUM(occurrences) AS attempts,
      SUM(CASE WHEN status_code < 400 THEN occurrences ELSE 0 END) AS successes,
      SUM(CASE WHEN status_code >= 400 THEN occurrences ELSE 0 END) AS failures,MAX(last_seen) AS last_seen
      FROM technical_events WHERE ${where} AND event_type='autosave' GROUP BY module`).all();
    const whatsapp = db.prepare(`SELECT status,COUNT(*) AS count,MAX(COALESCE(sent_at,created_at)) AS last_seen
      FROM notifications WHERE channel='whatsapp' AND created_at >= datetime('now','-24 hours') GROUP BY status`).all();
    const pendingNotifications = (db.prepare("SELECT COUNT(*) AS count FROM notifications WHERE status='pending'").get() as any).count;
    const deletionJobs = (db.prepare('SELECT COUNT(*) AS count FROM clinic_deletion_jobs').get() as any).count;
    const webhookJobs = db.prepare(`SELECT processing_status AS status, COUNT(*) AS count
      FROM asaas_webhook_events WHERE processing_status IN ('PENDING','PROCESSING','RETRY')
      OR processed_at >= datetime('now','-24 hours') GROUP BY processing_status`).all();
    const lastWhatsappFailure = db.prepare(`SELECT MAX(COALESCE(sent_at,created_at)) AS last_seen
      FROM notifications WHERE channel='whatsapp' AND status='failed'
      AND created_at >= datetime('now','-24 hours')`).get() as any;
    const commit = process.env.RAILWAY_GIT_COMMIT_SHA || process.env.GITHUB_SHA || '';
    return { windowHours: 24, services, recent, frequent, autosave, affectedClinics: affected,
      pagination: { page, pageSize: 25, total: count }, whatsapp,
      lastWhatsappFailure: lastWhatsappFailure?.last_seen ? { last_seen: lastWhatsappFailure.last_seen, message: 'Falha de envio registrada na fila de notificações.' } : null,
      jobs: { pendingNotifications, pendingClinicDeletions: deletionJobs, webhookJobs,
        note: 'Webhooks mostram os estados persistidos. Notificações e exclusões não registram estado separado de execução.' },
      deployment: { environment: process.env.NODE_ENV === 'production' ? 'production' : process.env.NODE_ENV === 'test' ? 'test' : 'development',
        commit: /^[a-f0-9]{7,40}$/i.test(commit) ? commit : null, processStartedAt: startedAt,
        status: 'Processo em execução; status do deploy não informado pelo provedor.' } };
  }
};
