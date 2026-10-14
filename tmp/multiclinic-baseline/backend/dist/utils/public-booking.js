"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveBookingTenant = resolveBookingTenant;
exports.publicBookingProfessional = publicBookingProfessional;
exports.professionalBookingService = professionalBookingService;
exports.validBookingDate = validBookingDate;
const database_1 = require("../config/database");
function resolveBookingTenant(slug, sequence) {
    if (typeof slug !== 'string' || !slug.trim())
        return undefined;
    if (sequence !== undefined && sequence !== null && sequence !== '') {
        if (!/^\d+$/.test(String(sequence)) || Number(sequence) < 1)
            return undefined;
        return database_1.db.prepare("SELECT id, slug, public_booking_enabled FROM tenants WHERE public_booking_slug = ? AND public_booking_sequence = ? AND status = 'active'").get(slug, Number(sequence));
    }
    return database_1.db.prepare("SELECT id, slug, public_booking_enabled FROM tenants WHERE slug = ? AND status = 'active'").get(slug);
}
function publicBookingProfessional(tenantId, professionalId, slug) {
    return database_1.db.prepare(`SELECT id, slug, tenant_id FROM professionals WHERE tenant_id = ? AND id = ? AND active = 1 AND public_booking_enabled = 1 AND (? IS NULL OR slug = ? OR id = ?)`)
        .get(tenantId, professionalId, slug || null, slug || null, slug || null);
}
function professionalBookingService(tenantId, professionalId, serviceId) {
    return database_1.db.prepare(`SELECT s.id, COALESCE(ps.custom_duration, s.duration_minutes) AS duration_minutes, s.modality
    FROM services s LEFT JOIN professional_services ps ON ps.service_id = s.id AND ps.professional_id = ?
    WHERE s.tenant_id = ? AND s.id = ? AND s.active = 1 AND (s.professional_id = ? OR ps.professional_id = ?)`)
        .get(professionalId, tenantId, serviceId, professionalId, professionalId);
}
function validBookingDate(date) {
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date))
        return false;
    const parsed = new Date(date + 'T12:00:00Z');
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}
