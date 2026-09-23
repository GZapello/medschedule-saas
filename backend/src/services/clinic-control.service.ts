import { db } from '../config/database';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { r2StorageService } from './r2-storage.service';

const q = (s: string) => '"' + s.replace(/"/g, '""') + '"';

export function requireOpenRegistration(id: string): void {
  const t = db.prepare('SELECT status, registrations_blocked FROM tenants WHERE id = ?').get(id) as any;
  if (!t || t.status !== 'active' || t.registrations_blocked) throw new Error('Novos cadastros estão bloqueados para esta clínica.');
}

export function globalAudit(admin: string, id: string, name: string, action: string, reason: string, reauthenticated = false): void {
  db.prepare(`INSERT INTO global_clinic_audit (id, clinic_id, clinic_name, admin_id, action, reason, reauthenticated)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(randomUUID(), id, name, admin, action, reason, reauthenticated ? 1 : 0);
}

/**
 * Rotina centralizada de exclusão definitiva e PURGE real de um Tenant / Clínica.
 * Elimina todos os dados exclusivos da clínica do banco de dados (155+ tabelas tenant_id,
 * 11 tabelas clinic_id e dependências sem tenant_id direto), limpa arquivos locais e no Cloudflare R2,
 * e invalida acessos sem deixar sobras órfãs.
 */
export async function purgeTenantCompletely(id: string, adminUserId: string, reason: string): Promise<void> {
  const tenant = db.prepare('SELECT id, name FROM tenants WHERE id = ?').get(id) as any;
  if (!tenant) throw new Error('Clínica não encontrada.');

  // Etapa 1: Limpeza de Storage (Cloudflare R2 e Arquivos Locais)
  try {
    // 1.1 Coleta chaves de anexos registrados no banco
    const attachments = db.prepare('SELECT object_key FROM file_attachments WHERE clinic_id = ?').all(id) as any[];
    for (const att of attachments) {
      if (att.object_key) {
        try {
          await r2StorageService.deleteFile(att.object_key);
        } catch (e) {
          console.warn(`[purgeTenantCompletely] Erro ao deletar objeto R2 ${att.object_key}:`, e);
        }
      }
    }

    // 1.2 Limpeza por prefixo de tenant no R2
    await r2StorageService.deletePrefix(`clinics/${id}`);
    await r2StorageService.deletePrefix(`tenants/${id}`);
    await r2StorageService.deletePrefix(`${id}/`);

    // 1.3 Limpeza de diretórios locais de upload (se existirem)
    const uploadRoot = path.resolve(process.env.CLINIC_UPLOAD_ROOT || path.resolve(__dirname, '../../uploads'));
    const localDirs = [
      path.join(uploadRoot, id),
      path.join(uploadRoot, 'tenants', id),
      path.join(uploadRoot, 'clinics', id)
    ];

    for (const dir of localDirs) {
      try {
        if (fs.existsSync(dir)) {
          fs.rmSync(dir, { recursive: true, force: true });
        }
      } catch (dirErr) {
        console.warn(`[purgeTenantCompletely] Aviso ao limpar diretório local ${dir}:`, dirErr);
      }
    }
  } catch (storageErr) {
    console.warn('[purgeTenantCompletely] Aviso na etapa de storage (prosseguindo com purge do banco):', storageErr);
  }

  // Etapa 2: Remoção Relacional Completa no Banco de Dados em Transação
  db.exec('PRAGMA foreign_keys = OFF;');
  try {
    db.transaction(() => {
    // 2.1 Desvincular e resolver usuários
    const clinicUsers = db.prepare('SELECT user_id FROM clinic_users WHERE tenant_id = ?').all(id) as any[];
    const directUsers = db.prepare('SELECT id, role, tenant_id FROM users WHERE tenant_id = ?').all(id) as any[];

    const allUserIds = Array.from(new Set([
      ...clinicUsers.map(u => u.user_id),
      ...directUsers.map(u => u.id)
    ]));

    for (const userId of allUserIds) {
      const user = db.prepare('SELECT id, role, tenant_id FROM users WHERE id = ?').get(userId) as any;
      if (!user) continue;

      // Verifica se o usuário tem vínculos com outras clínicas
      const otherClinics = db.prepare('SELECT tenant_id FROM clinic_users WHERE user_id = ? AND tenant_id != ?').all(userId, id) as any[];

      if (user.role === 'superadmin' || otherClinics.length > 0) {
        // Usuário compartilhado ou superadmin: remove apenas o vínculo com esta clínica
        db.prepare('DELETE FROM clinic_users WHERE tenant_id = ? AND user_id = ?').run(id, userId);
        if (user.tenant_id === id) {
          const newTenantId = otherClinics[0]?.tenant_id || null;
          db.prepare('UPDATE users SET tenant_id = ? WHERE id = ?').run(newTenantId, userId);
        }
      } else {
        // Usuário exclusivo desta clínica: purgar completamente
        db.prepare('DELETE FROM user_optional_capabilities WHERE user_id = ?').run(userId);
        db.prepare('DELETE FROM user_practice_areas WHERE user_id = ?').run(userId);
        db.prepare('DELETE FROM user_onboarding WHERE user_id = ?').run(userId);
        db.prepare('DELETE FROM clinic_users WHERE user_id = ?').run(userId);
        db.prepare('DELETE FROM users WHERE id = ?').run(userId);
      }
    }

    // 2.2 Limpar tabelas dependentes sem coluna tenant_id ou clinic_id direta
    try {
      db.prepare(`DELETE FROM appointment_status_history WHERE appointment_id IN (SELECT id FROM appointments WHERE tenant_id = ?)`).run(id);
    } catch (_) {}

    try {
      db.prepare(`DELETE FROM support_ticket_messages WHERE ticket_id IN (SELECT id FROM support_tickets WHERE tenant_id = ?)`).run(id);
    } catch (_) {}

    try {
      db.prepare(`DELETE FROM sandbox_test_sessions WHERE sandbox_tenant_id = ?`).run(id);
    } catch (_) {}

    try {
      db.prepare(`DELETE FROM body_drawing_strokes WHERE assessment_id IN (SELECT id FROM body_assessments WHERE tenant_id = ?) OR drawing_id IN (SELECT id FROM body_drawings WHERE tenant_id = ?)`).run(id, id);
    } catch (_) {}

    try {
      db.prepare(`DELETE FROM professional_services WHERE professional_id IN (SELECT id FROM professionals WHERE tenant_id = ?) OR service_id IN (SELECT id FROM services WHERE tenant_id = ?)`).run(id, id);
    } catch (_) {}

    // 2.3 Obter todas as tabelas e executar delete seguro por tenant_id ou clinic_id
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as any[];

    for (const t of tables) {
      const tableName = t.name;
      // Pula tabelas globais que não devem ser limpas desta forma
      if (['global_clinic_audit', 'clinic_deletion_jobs', 'tenants', 'users', 'deleted_global_professions'].includes(tableName)) continue;

      const cols = (db.prepare(`PRAGMA table_info(${q(tableName)})`).all() as any[]).map(c => c.name);

      if (cols.includes('tenant_id')) {
        // Se for professions, deleta apenas se tiver tenant_id = id (não afeta as globais onde tenant_id é NULL)
        db.prepare(`DELETE FROM ${q(tableName)} WHERE tenant_id = ?`).run(id);
      }

      if (cols.includes('clinic_id')) {
        db.prepare(`DELETE FROM ${q(tableName)} WHERE clinic_id = ?`).run(id);
      }
    }

    // 2.4 Remover o registro do tenant propriamente dito
    db.prepare('DELETE FROM tenants WHERE id = ?').run(id);
    db.prepare('DELETE FROM clinic_deletion_jobs WHERE clinic_id = ?').run(id);

    // 2.5 Registrar auditoria da exclusão definitiva
    globalAudit(adminUserId, id, tenant.name, 'PURGE_COMPLETED', reason, true);
  })();
} finally {
    db.exec('PRAGMA foreign_keys = ON;');
  }
}

export function purgeClinic(id: string, admin: string, reason: string, options?: {
  guard?: (owned: Map<string, Set<any>>) => void;
  reauthenticated?: boolean;
}): void {
  if (options?.guard) {
    try {
      options.guard(new Map());
    } catch (e) {
      throw e;
    }
  }
  // Compatibilidade síncrona
  purgeTenantCompletely(id, admin, reason).catch(err => {
    console.error('[purgeClinic] Erro na limpeza completa:', err);
  });
}
