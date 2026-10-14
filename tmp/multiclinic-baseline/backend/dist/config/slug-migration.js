"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.migrateProfessionalSlugs = migrateProfessionalSlugs;
exports.migrateClinicBooking = migrateClinicBooking;
const clinic_booking_identity_1 = require("../utils/clinic-booking-identity");
// Keep the professional normalization pure during bootstrap.
function slugify(text) {
    return (text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/^(?:dr|dra|doutor|doutora|fgo|fga|ft|nutri|psi)\b[\s.-]*/i, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'profissional';
}
function migrateProfessionalSlugs(db) {
    try {
        const profs = db.prepare(`
      SELECT id, tenant_id, name, slug 
      FROM professionals 
      ORDER BY created_at ASC, id ASC
    `).all();
        const updateStmt = db.prepare('UPDATE professionals SET slug = ? WHERE id = ?');
        // Mapeamento por tenant para garantir slugs únicos sequenciais
        const tenantSlugs = new Map();
        // Reserve existing links first: never rewrite shared professional slugs.
        for (const p of profs) {
            if (!tenantSlugs.has(p.tenant_id))
                tenantSlugs.set(p.tenant_id, new Set());
            if (p.slug)
                tenantSlugs.get(p.tenant_id).add(p.slug);
        }
        for (const p of profs) {
            if (p.slug)
                continue;
            if (!p.tenant_id || !p.name)
                continue;
            if (!tenantSlugs.has(p.tenant_id)) {
                tenantSlugs.set(p.tenant_id, new Set());
            }
            const existingInTenant = tenantSlugs.get(p.tenant_id);
            const base = slugify(p.name);
            let candidate = base;
            let counter = 1;
            while (existingInTenant.has(candidate)) {
                counter++;
                candidate = `${base}-${counter}`;
            }
            existingInTenant.add(candidate);
            if (p.slug !== candidate) {
                updateStmt.run(candidate, p.id);
            }
        }
    }
    catch (err) {
        console.error('[migrateProfessionalSlugs] Erro na migração de slugs:', err);
    }
}
/** Idempotent and bootstrap-safe: uses only the supplied SQLite connection. */
function migrateClinicBooking(database) {
    try {
        const columns = database.prepare('PRAGMA table_info(tenants)').all().map((column) => column.name);
        if (!columns.length)
            return;
        for (const [name, definition] of [
            ['public_booking_enabled', 'INTEGER NOT NULL DEFAULT 0'],
            ['public_booking_slug', 'TEXT'],
            ['public_booking_sequence', 'INTEGER']
        ])
            if (!columns.includes(name))
                database.exec(`ALTER TABLE tenants ADD COLUMN ${name} ${definition}`);
        const tenants = database.prepare(`SELECT id, name, ${columns.includes('trade_name') ? 'trade_name' : 'NULL AS trade_name'}, public_booking_slug, public_booking_sequence FROM tenants ORDER BY ${columns.includes('created_at') ? 'created_at ASC, ' : ''}id ASC`).all();
        const reserved = new Map();
        const owners = new Map();
        // Reserve all valid existing identities before allocating missing entries.
        for (const tenant of tenants) {
            if (!(0, clinic_booking_identity_1.validClinicBookingSlug)(tenant.public_booking_slug) || !(0, clinic_booking_identity_1.validClinicBookingSequence)(tenant.public_booking_sequence))
                continue;
            const key = `${tenant.public_booking_slug}/${tenant.public_booking_sequence}`;
            if (!owners.has(key))
                owners.set(key, tenant.id);
            if (!reserved.has(tenant.public_booking_slug))
                reserved.set(tenant.public_booking_slug, new Set());
            reserved.get(tenant.public_booking_slug).add(tenant.public_booking_sequence);
        }
        for (const tenant of tenants) {
            const valid = (0, clinic_booking_identity_1.validClinicBookingSlug)(tenant.public_booking_slug) && (0, clinic_booking_identity_1.validClinicBookingSequence)(tenant.public_booking_sequence);
            if (valid && owners.get(`${tenant.public_booking_slug}/${tenant.public_booking_sequence}`) === tenant.id)
                continue;
            try {
                const slug = (0, clinic_booking_identity_1.validClinicBookingSlug)(tenant.public_booking_slug) ? tenant.public_booking_slug : (0, clinic_booking_identity_1.clinicBookingSlug)(tenant.trade_name || tenant.name);
                const used = reserved.get(slug) || new Set();
                let sequence = 1;
                for (const previous of used)
                    sequence = Math.max(sequence, previous + 1);
                if (!Number.isSafeInteger(sequence))
                    throw new Error('BOOKING_SEQUENCE_EXHAUSTED');
                database.prepare('UPDATE tenants SET public_booking_slug = ?, public_booking_sequence = ? WHERE id = ?').run(slug, sequence, tenant.id);
                used.add(sequence);
                reserved.set(slug, used);
            }
            catch {
                // Do not include tenant names, IDs, SQL parameters or exception payloads.
                console.warn('[ClinicBookingMigration] Identidade não atualizada; uma clínica será tentada novamente no próximo startup.');
            }
        }
        try {
            database.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_clinic_booking_identity ON tenants(public_booking_slug, public_booking_sequence)');
        }
        catch {
            console.warn('[ClinicBookingMigration] Índice único não criado; reparo será tentado novamente no próximo startup.');
        }
    }
    catch {
        console.warn('[ClinicBookingMigration] Migração indisponível; startup preservado.');
    }
}
