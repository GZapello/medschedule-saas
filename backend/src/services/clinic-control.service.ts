import { db } from '../config/database';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

const q = (s: string) => '"' + s.replace(/"/g, '""') + '"';
export function requireOpenRegistration(id: string): void {
  const t = db.prepare('SELECT status, registrations_blocked FROM tenants WHERE id = ?').get(id);
  if (!t || t.status !== 'active' || t.registrations_blocked) throw new Error('Novos cadastros estão bloqueados para esta clínica.');
}

export function globalAudit(admin: string, id: string, name: string, action: string, reason: string, reauthenticated = false): void {
  db.prepare(`INSERT INTO global_clinic_audit (id, clinic_id, clinic_name, admin_id, action, reason, reauthenticated)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(randomUUID(), id, name, admin, action, reason, reauthenticated ? 1 : 0);
}

// Resolve ownership before any DELETE. An unexpected cross-clinic reference aborts
// the transaction instead of allowing SQLite CASCADE / SET NULL to affect it.
export function purgeClinic(id: string, admin: string, reason: string): void {
  const existingJob = db.prepare('SELECT * FROM clinic_deletion_jobs WHERE clinic_id = ?').get(id);
  if (existingJob) { finishFiles(id); return; }
  db.transaction(() => {
    const tenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(id);
    if (!tenant) throw new Error('Clínica não encontrada.');
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all()
      .map((t: any) => t.name).filter((n: string) => !['global_clinic_audit', 'clinic_deletion_jobs'].includes(n));
    const data = new Map<string, any[]>();
    const owned = new Map<string, Set<any>>();
    const cols = new Map<string, string[]>();
    const fks = new Map<string, any[]>();
    for (const table of tables) {
      cols.set(table, db.prepare(`PRAGMA table_info(${q(table)})`).all().map((c: any) => c.name));
      fks.set(table, db.prepare(`PRAGMA foreign_key_list(${q(table)})`).all());
      const relevant = cols.get(table)!.filter(c => ['id', 'tenant_id', 'clinic_id', 'organization_id', 'role', 'user_id', 'entity', 'entity_id', 'ticket_id',
        'file_url', 'pdf_url', 'photo_url', 'avatar_url', 'logo_url', 'file_path', 'storage_path'].includes(c) || fks.get(table)!.some(f => f.from === c));
      data.set(table, db.prepare(`SELECT rowid AS __rowid${relevant.length ? ', ' + relevant.map(q).join(', ') : ''} FROM ${q(table)}`).all());
      const scope = cols.get(table)!.filter(c => ['tenant_id', 'clinic_id', 'organization_id'].includes(c));
      owned.set(table, new Set(data.get(table)!.filter(r => table === 'tenants' ? r.id === id : table !== 'users' && scope.some(c => r[c] === id))));
    }
    for (const user of data.get('users') || []) {
      const links = (data.get('clinic_users') || []).filter(r => r.user_id === user.id);
      if (user.tenant_id !== id && !links.some(r => r.tenant_id === id)) continue;
      const other = links.find(r => r.tenant_id !== id);
      if (user.role === 'superadmin' || other || (user.tenant_id && user.tenant_id !== id)) {
        if (user.tenant_id === id) db.prepare('UPDATE users SET tenant_id = ? WHERE id = ?').run(other?.tenant_id || null, user.id);
      } else owned.get('users')!.add(user);
    }
    for (const row of data.get('audit_logs') || []) {
      if (!row.tenant_id && [...owned.get('users')!].some(user => row.user_id === user.id || row.entity === 'users' && row.entity_id === user.id)) owned.get('audit_logs')!.add(row);
    }
    // Tables without a tenant column inherit ownership through their foreign keys.
    let changed = true;
    while (changed) {
      changed = false;
      for (const table of tables) {
        if (['users', 'tenants'].includes(table)) continue;
        const scope = cols.get(table)!.filter(c => ['tenant_id', 'clinic_id', 'organization_id'].includes(c));
        for (const row of data.get(table)!) {
          if (owned.get(table)!.has(row)) continue;
          for (const fk of fks.get(table)!) {
            if (row[fk.from] == null || ![...(owned.get(fk.table) || [])].some(p => p[fk.to || 'id'] === row[fk.from])) continue;
            if (scope.length || table === 'support_ticket_messages' && !owned.get('support_tickets')!.has(data.get('support_tickets')!.find(t => t.id === row.ticket_id))) {
              throw new Error(`Referência externa em ${table}; exclusão cancelada para preservar outras clínicas.`);
            }
            owned.get(table)!.add(row); changed = true; break;
          }
        }
      }
    }
    const files = new Set<string>();
    const uploadRoot = path.resolve(process.env.CLINIC_UPLOAD_ROOT || path.resolve(__dirname, '../../uploads'));
    const resolveFile = (value: string): string | null => {
      if (!value || value.startsWith('data:')) return null;
      if (/^https?:/i.test(value)) throw new Error('Arquivo remoto sem adaptador de exclusão configurado. Exclusão interrompida.');
      const relative = value.replace(/^\/?uploads\//, '');
      const target = path.resolve(uploadRoot, relative);
      if (!target.startsWith(uploadRoot + path.sep)) throw new Error('Caminho de arquivo fora da área de uploads.');
      return target;
    };
    const fileColumns = ['file_url', 'pdf_url', 'photo_url', 'avatar_url', 'logo_url', 'file_path', 'storage_path'];
    const keptFiles = new Set<string>();
    for (const table of tables) for (const row of data.get(table)!) for (const col of fileColumns) {
      if (!row[col] || typeof row[col] !== 'string') continue;
      if (owned.get(table)!.has(row)) { const file = resolveFile(row[col]); if (file) files.add(file); }
      else if (!/^https?:|^data:/i.test(row[col])) { const file = resolveFile(row[col]); if (file) keptFiles.add(file); }
    }
    for (const file of keptFiles) files.delete(file);
    // Include unreferenced files only in a verified directory named by this tenant.
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error('Identificador de clínica inválido.');
    const walk = (dir: string) => {
      if (!fs.existsSync(dir)) return;
      if (fs.lstatSync(dir).isSymbolicLink()) throw new Error('Link simbólico em uploads; exclusão interrompida.');
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const file = path.join(dir, entry.name);
        if (entry.isSymbolicLink()) throw new Error('Link simbólico em uploads; exclusão interrompida.');
        if (entry.isDirectory()) walk(file); else if (!keptFiles.has(file)) files.add(file);
      }
    };
    walk(path.join(uploadRoot, id)); walk(path.join(uploadRoot, 'tenants', id));
    for (const file of files) {
      let current = file;
      while (current !== uploadRoot) {
        if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw new Error('Link simbólico em uploads.');
        current = path.dirname(current);
      }
    }
    globalAudit(admin, id, tenant.name, 'DELETE_REQUESTED', reason, true);
    db.prepare('INSERT INTO clinic_deletion_jobs (clinic_id, files_json) VALUES (?, ?)').run(id, JSON.stringify([...files]));
    db.exec('PRAGMA defer_foreign_keys = ON');
    // Child-first ordering avoids CASCADE changing records before their explicit removal.
    const ordered: string[] = []; const visiting = new Set<string>();
    const visit = (table: string) => {
      if (visiting.has(table)) return; visiting.add(table);
      for (const child of tables) if (fks.get(child)!.some(f => f.table === table)) visit(child);
      ordered.push(table);
    };
    tables.forEach(visit);
    for (const table of ordered) for (const row of owned.get(table)!) db.prepare(`DELETE FROM ${q(table)} WHERE rowid = ?`).run(row.__rowid);
    for (const table of tables) {
      const scope = cols.get(table)!.filter(c => ['tenant_id', 'clinic_id', 'organization_id'].includes(c));
      for (const col of scope) if (db.prepare(`SELECT 1 FROM ${q(table)} WHERE ${q(col)} = ? LIMIT 1`).get(id)) throw new Error(`Dados restantes em ${table}.`);
    }
    if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Falha na integridade referencial.');
  })();
  finishFiles(id);
}

function finishFiles(id: string): void {
  const job = db.prepare('SELECT files_json FROM clinic_deletion_jobs WHERE clinic_id = ?').get(id);
  if (!job) return;
  // Durable manifest supports retry after process failure; never reports premature success.
  for (const file of JSON.parse(job.files_json)) {
    const root = path.resolve(process.env.CLINIC_UPLOAD_ROOT || path.resolve(__dirname, '../../uploads'));
    if (!path.resolve(file).startsWith(root + path.sep)) throw new Error('Manifesto fora da área de uploads.');
    let current = path.dirname(file);
    while (current !== root) {
      if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw new Error('Link simbólico na limpeza de arquivos.');
      current = path.dirname(current);
    }
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
  db.transaction(() => {
    db.prepare("UPDATE global_clinic_audit SET action = 'DELETE_COMPLETED' WHERE clinic_id = ? AND action = 'DELETE_REQUESTED'").run(id);
    db.prepare('DELETE FROM clinic_deletion_jobs WHERE clinic_id = ?').run(id);
  })();
}
