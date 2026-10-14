"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireOpenRegistration = requireOpenRegistration;
exports.globalAudit = globalAudit;
exports.purgeClinic = purgeClinic;
exports.purgeTenantCompletely = purgeTenantCompletely;
const database_1 = require("../config/database");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = require("crypto");
const r2_storage_service_1 = require("./r2-storage.service");
const consents_migration_1 = require("../config/consents.migration");
const q = (s) => '"' + s.replace(/"/g, '""') + '"';
function requireOpenRegistration(id) {
    const t = database_1.db.prepare('SELECT status, registrations_blocked FROM tenants WHERE id = ?').get(id);
    if (!t || t.status !== 'active' || t.registrations_blocked)
        throw new Error('Novos cadastros estão bloqueados para esta clínica.');
}
function globalAudit(admin, id, name, action, reason, reauthenticated = false) {
    database_1.db.prepare(`INSERT INTO global_clinic_audit (id, clinic_id, clinic_name, admin_id, action, reason, reauthenticated)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run((0, crypto_1.randomUUID)(), id, name, admin, action, reason, reauthenticated ? 1 : 0);
}
// Resolve ownership before any DELETE. An unexpected cross-clinic reference aborts
// the transaction instead of allowing SQLite CASCADE / SET NULL to affect it.
function preparePurge(id, admin, reason, options) {
    const tenantExists = database_1.db.prepare('SELECT id FROM tenants WHERE id = ?').get(id);
    // Se o tenant já foi apagado do banco de dados (ex: retry de job anterior com falha de storage remoto)
    if (!tenantExists) {
        return;
    }
    // Remove qualquer job abortado prévio dessa clínica para permitir nova tentativa limpa e atômica
    database_1.db.prepare('DELETE FROM clinic_deletion_jobs WHERE clinic_id = ?').run(id);
    try {
        database_1.db.transaction(() => {
            const tenant = database_1.db.prepare('SELECT * FROM tenants WHERE id = ?').get(id);
            if (!tenant)
                throw new Error('Clínica não encontrada.');
            const tables = database_1.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all()
                .map((t) => t.name).filter((n) => !['global_clinic_audit', 'clinic_deletion_jobs'].includes(n));
            const data = new Map();
            const owned = new Map();
            const cols = new Map();
            const fks = new Map();
            for (const table of tables) {
                cols.set(table, database_1.db.prepare(`PRAGMA table_info(${q(table)})`).all().map((c) => c.name));
                fks.set(table, database_1.db.prepare(`PRAGMA foreign_key_list(${q(table)})`).all());
                const relevant = cols.get(table).filter(c => ['id', 'tenant_id', 'clinic_id', 'organization_id', 'role', 'user_id', 'entity', 'entity_id', 'ticket_id',
                    'object_key', 'sandbox_tenant_id', 'file_url', 'pdf_url', 'photo_url', 'avatar_url', 'logo_url', 'file_path', 'storage_path'].includes(c) || fks.get(table).some(f => f.from === c));
                data.set(table, database_1.db.prepare(`SELECT rowid AS __rowid${relevant.length ? ', ' + relevant.map(q).join(', ') : ''} FROM ${q(table)}`).all());
                const scope = cols.get(table).filter(c => ['tenant_id', 'clinic_id', 'organization_id', 'sandbox_tenant_id'].includes(c));
                owned.set(table, new Set(data.get(table).filter(r => table === 'tenants' ? r.id === id : table !== 'users' && scope.some(c => r[c] === id))));
            }
            for (const user of data.get('users') || []) {
                const links = (data.get('clinic_users') || []).filter(r => r.user_id === user.id);
                if (user.tenant_id !== id && !links.some(r => r.tenant_id === id))
                    continue;
                const other = links.find(r => r.tenant_id !== id);
                if (user.role === 'superadmin' || other || (user.tenant_id && user.tenant_id !== id)) {
                    if (user.tenant_id === id)
                        database_1.db.prepare('UPDATE users SET tenant_id = ? WHERE id = ?').run(other?.tenant_id || null, user.id);
                }
                else
                    owned.get('users').add(user);
            }
            for (const row of data.get('audit_logs') || []) {
                if (!row.tenant_id && [...owned.get('users')].some(user => row.user_id === user.id || row.entity === 'users' && row.entity_id === user.id))
                    owned.get('audit_logs').add(row);
            }
            // Tables without a tenant column inherit ownership through their foreign keys.
            let changed = true;
            while (changed) {
                changed = false;
                for (const table of tables) {
                    if (['users', 'tenants'].includes(table))
                        continue;
                    const scope = cols.get(table).filter(c => ['tenant_id', 'clinic_id', 'organization_id', 'sandbox_tenant_id'].includes(c));
                    for (const row of data.get(table)) {
                        if (owned.get(table).has(row))
                            continue;
                        for (const fk of fks.get(table)) {
                            if (row[fk.from] == null || ![...(owned.get(fk.table) || [])].some(p => p[fk.to || 'id'] === row[fk.from]))
                                continue;
                            if (scope.length || table === 'support_ticket_messages' && !owned.get('support_tickets').has(data.get('support_tickets').find(t => t.id === row.ticket_id))) {
                                throw new Error(`Referência externa em ${table}; exclusão cancelada para preservar outras clínicas.`);
                            }
                            owned.get(table).add(row);
                            changed = true;
                            break;
                        }
                    }
                }
            }
            // Automatic registration expiry must recheck eligibility under this write lock.
            options?.guard?.(owned);
            const files = new Set();
            const remoteKeys = new Set();
            const uploadRoot = path_1.default.resolve(process.env.CLINIC_UPLOAD_ROOT || path_1.default.resolve(__dirname, '../../uploads'));
            const resolveFile = (value) => {
                if (!value || value.startsWith('data:'))
                    return null;
                // Public catalog assets and external links are not clinic-owned storage.
                if (/^https?:/i.test(value) || /^\/exercise-/.test(value))
                    return null;
                const relative = value.replace(/^\/?uploads\//, '');
                const target = path_1.default.resolve(uploadRoot, relative);
                if (!target.startsWith(uploadRoot + path_1.default.sep))
                    throw new Error('Caminho de arquivo fora da área de uploads.');
                return target;
            };
            const fileColumns = ['file_url', 'pdf_url', 'photo_url', 'avatar_url', 'logo_url', 'file_path', 'storage_path'];
            const keptFiles = new Set();
            for (const row of owned.get('file_attachments') || []) {
                if (row.object_key)
                    remoteKeys.add(row.object_key);
            }
            for (const table of tables)
                for (const row of data.get(table))
                    for (const col of fileColumns) {
                        if (!row[col] || typeof row[col] !== 'string')
                            continue;
                        if (owned.get(table).has(row)) {
                            const file = resolveFile(row[col]);
                            if (file)
                                files.add(file);
                        }
                        else if (!/^https?:|^data:/i.test(row[col])) {
                            const file = resolveFile(row[col]);
                            if (file)
                                keptFiles.add(file);
                        }
                    }
            for (const file of keptFiles)
                files.delete(file);
            // Include unreferenced files only in a verified directory named by this tenant.
            if (!/^[a-zA-Z0-9_-]+$/.test(id))
                throw new Error('Identificador de clínica inválido.');
            const walk = (dir) => {
                if (!fs_1.default.existsSync(dir))
                    return;
                if (fs_1.default.lstatSync(dir).isSymbolicLink())
                    throw new Error('Link simbólico em uploads; exclusão interrompida.');
                for (const entry of fs_1.default.readdirSync(dir, { withFileTypes: true })) {
                    const file = path_1.default.join(dir, entry.name);
                    if (entry.isSymbolicLink())
                        throw new Error('Link simbólico em uploads; exclusão interrompida.');
                    if (entry.isDirectory())
                        walk(file);
                    else if (!keptFiles.has(file))
                        files.add(file);
                }
            };
            walk(path_1.default.join(uploadRoot, id));
            walk(path_1.default.join(uploadRoot, 'tenants', id));
            walk(path_1.default.join(uploadRoot, 'clinics', id));
            for (const file of files) {
                let current = file;
                while (current !== uploadRoot) {
                    if (fs_1.default.existsSync(current) && fs_1.default.lstatSync(current).isSymbolicLink())
                        throw new Error('Link simbólico em uploads.');
                    current = path_1.default.dirname(current);
                }
            }
            globalAudit(admin, id, tenant.name, 'DELETE_REQUESTED', reason, options?.reauthenticated ?? true);
            database_1.db.prepare('INSERT INTO clinic_deletion_jobs (clinic_id, files_json) VALUES (?, ?)').run(id, JSON.stringify({ files: [...files], remoteKeys: [...remoteKeys], prefixes: [`clinics/${id}/`, `tenants/${id}/`, `${id}/`] }));
            database_1.db.exec('PRAGMA defer_foreign_keys = ON');
            // Child-first ordering avoids CASCADE changing records before their explicit removal.
            const ordered = [];
            const visiting = new Set();
            const visit = (table) => {
                if (visiting.has(table))
                    return;
                visiting.add(table);
                for (const child of tables)
                    if (fks.get(child).some(f => f.table === table))
                        visit(child);
                ordered.push(table);
            };
            tables.forEach(visit);
            // Identificar e preservar os triggers de imutabilidade de consentimentos para suspensão temporária e restrita
            const consentTriggers = database_1.db.prepare(`
        SELECT name, sql FROM sqlite_master
        WHERE type = 'trigger' AND (
          name LIKE 'immutable_consent_%'
          OR name LIKE 'consent_document_frozen_%'
        )
      `).all();
            for (const trigger of consentTriggers) {
                database_1.db.exec(`DROP TRIGGER IF EXISTS ${q(trigger.name)}`);
            }
            try {
                for (const table of ordered)
                    for (const row of owned.get(table))
                        database_1.db.prepare(`DELETE FROM ${q(table)} WHERE rowid = ?`).run(row.__rowid);
                for (const table of tables) {
                    const scope = cols.get(table).filter(c => ['tenant_id', 'clinic_id', 'organization_id', 'sandbox_tenant_id'].includes(c));
                    for (const col of scope)
                        if (database_1.db.prepare(`SELECT 1 FROM ${q(table)} WHERE ${q(col)} = ? LIMIT 1`).get(id))
                            throw new Error(`Dados restantes em ${table}.`);
                }
                if (database_1.db.prepare('PRAGMA foreign_key_check').all().length)
                    throw new Error('Falha na integridade referencial.');
            }
            finally {
                // Recriar exatamente os triggers preservados antes do commit da transação
                for (const trigger of consentTriggers) {
                    if (trigger.sql) {
                        database_1.db.exec(trigger.sql);
                    }
                }
                (0, consents_migration_1.ensureConsentTriggers)(database_1.db);
            }
        })();
    }
    finally {
        (0, consents_migration_1.ensureConsentTriggers)(database_1.db);
    }
}
function finishLocalFiles(id) {
    const job = database_1.db.prepare('SELECT files_json FROM clinic_deletion_jobs WHERE clinic_id = ?').get(id);
    if (!job)
        return;
    // Durable manifest supports retry after process failure; never reports premature success.
    const manifest = JSON.parse(job.files_json);
    for (const file of Array.isArray(manifest) ? manifest : manifest.files) {
        const root = path_1.default.resolve(process.env.CLINIC_UPLOAD_ROOT || path_1.default.resolve(__dirname, '../../uploads'));
        if (!path_1.default.resolve(file).startsWith(root + path_1.default.sep))
            throw new Error('Manifesto fora da área de uploads.');
        let current = path_1.default.dirname(file);
        while (current !== root) {
            if (fs_1.default.existsSync(current) && fs_1.default.lstatSync(current).isSymbolicLink())
                throw new Error('Link simbólico na limpeza de arquivos.');
            current = path_1.default.dirname(current);
        }
        if (fs_1.default.existsSync(file))
            fs_1.default.unlinkSync(file);
    }
}
function completePurge(id) {
    database_1.db.transaction(() => {
        database_1.db.prepare("UPDATE global_clinic_audit SET action = 'DELETE_COMPLETED' WHERE clinic_id = ? AND action = 'DELETE_REQUESTED'").run(id);
        database_1.db.prepare('DELETE FROM clinic_deletion_jobs WHERE clinic_id = ?').run(id);
    })();
}
/** Local-only compatibility entry point. Remote cleanup always uses the async worker. */
function purgeClinic(id, admin, reason, options) {
    preparePurge(id, admin, reason, options);
    finishLocalFiles(id);
    const job = database_1.db.prepare('SELECT files_json FROM clinic_deletion_jobs WHERE clinic_id=?').get(id);
    if (job && JSON.parse(job.files_json).remoteKeys?.length)
        throw new Error('Limpeza remota pendente.');
    completePurge(id);
}
async function purgeTenantCompletely(id, admin, reason, options) {
    preparePurge(id, admin, reason, options);
    finishLocalFiles(id);
    const job = database_1.db.prepare('SELECT files_json FROM clinic_deletion_jobs WHERE clinic_id=?').get(id);
    if (job) {
        try {
            const manifest = JSON.parse(job.files_json);
            for (const key of manifest.remoteKeys || []) {
                try {
                    await r2_storage_service_1.r2StorageService.deleteFile(key);
                }
                catch (fileErr) {
                    console.warn(`[clinic-control] Aviso durante exclusão de arquivo remoto ${key}:`, fileErr?.message || fileErr);
                }
            }
            for (const prefix of manifest.prefixes || []) {
                try {
                    await r2_storage_service_1.r2StorageService.deletePrefix(prefix);
                }
                catch (prefixErr) {
                    console.warn(`[clinic-control] Aviso durante exclusão de prefixo remoto ${prefix}:`, prefixErr?.message || prefixErr);
                }
            }
        }
        catch (manifestErr) {
            console.warn(`[clinic-control] Aviso ao processar manifesto de exclusão:`, manifestErr?.message || manifestErr);
        }
    }
    completePurge(id);
}
