"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.slugify = slugify;
exports.generateProfessionalSlug = generateProfessionalSlug;
const database_1 = require("../config/database");
/**
 * Converte um nome/título em um slug limpo para URLs públicas:
 * - minúsculas
 * - sem acentos (NFD)
 * - remoção de prefixos de tratamento comuns (Dr., Dra., etc.)
 * - caracteres especiais substituídos por hífen
 * - sem hifens duplicados ou nas extremidades
 */
function slugify(text) {
    return (text || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/^(?:dr|dra|doutor|doutora|fgo|fga|ft|nutri|psi)\b[\s.-]*/i, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'profissional';
}
/**
 * Gera um slug único para um profissional dentro de uma clínica específica (tenantId),
 * evitando links duplicados caso dois profissionais tenham o mesmo nome.
 * Exemplo: 'ana-souza', 'ana-souza-2', etc.
 */
function generateProfessionalSlug(name, tenantId, currentProfessionalId) {
    const baseSlug = slugify(name);
    let candidate = baseSlug;
    let counter = 1;
    while (true) {
        const query = currentProfessionalId
            ? 'SELECT id FROM professionals WHERE tenant_id = ? AND slug = ? AND id != ?'
            : 'SELECT id FROM professionals WHERE tenant_id = ? AND slug = ?';
        const params = currentProfessionalId
            ? [tenantId, candidate, currentProfessionalId]
            : [tenantId, candidate];
        const existing = database_1.db.prepare(query).get(...params);
        if (!existing) {
            return candidate;
        }
        counter++;
        candidate = `${baseSlug}-${counter}`;
    }
}
