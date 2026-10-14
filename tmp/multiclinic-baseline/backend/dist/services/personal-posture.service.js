"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.POSTURE_VIEWS = exports.POSTURE_REGIONS = void 0;
exports.validatePosture = validatePosture;
exports.parsePosture = parsePosture;
exports.postureSummary = postureSummary;
exports.validatePosturePhotoAccess = validatePosturePhotoAccess;
exports.POSTURE_REGIONS = ['head', 'shoulders', 'scapulae', 'spine', 'trunk', 'pelvis', 'knees', 'legs', 'feet'];
exports.POSTURE_VIEWS = ['front', 'back', 'right', 'left'];
function validatePosture(input) {
    if (input === null)
        return null;
    const invalid = () => { throw new Error('Dados posturais inválidos'); };
    if (!input || input.version !== 1 || !Array.isArray(input.observations) || input.observations.length > 180 || !input.views || typeof input.views !== 'object')
        return invalid();
    if (Buffer.byteLength(JSON.stringify(input)) > 250000)
        return invalid();
    const observations = input.observations.map((o) => {
        if (!o || !exports.POSTURE_REGIONS.includes(o.region) || !exports.POSTURE_VIEWS.includes(o.view) || typeof o.id !== 'string' || o.id.length > 80 || typeof o.text !== 'string' || o.text.length > 1200 || !['unrated', 'improved', 'stable', 'worse'].includes(o.evolution) || !['manual', 'ai'].includes(o.source) || typeof o.reviewed !== 'boolean')
            return invalid();
        return { id: o.id, region: o.region, view: o.view, text: o.text.trim(), evolution: o.evolution, source: o.source, reviewed: o.source === 'manual' || o.reviewed };
    });
    if (new Set(observations.map((o) => o.id)).size !== observations.length)
        return invalid();
    const views = {};
    for (const view of exports.POSTURE_VIEWS) {
        const v = input.views[view];
        if (!v)
            continue;
        if (typeof v.fileId !== 'string' || v.fileId.length > 150 || typeof v.guides !== 'boolean' || !Array.isArray(v.strokes) || v.strokes.length > 100)
            return invalid();
        const strokes = v.strokes.map((s) => {
            if (!s || !['pen', 'line'].includes(s.tool) || !Array.isArray(s.points) || s.points.length < 2 || s.points.length > 300)
                return invalid();
            const points = s.points.map((p) => {
                if (!Array.isArray(p) || p.length !== 2 || p.some(n => typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 1))
                    return invalid();
                return p.map(n => Math.round(n * 10000) / 10000);
            });
            return { tool: s.tool, points };
        });
        views[view] = { fileId: v.fileId, guides: v.guides, strokes };
    }
    return JSON.stringify({ version: 1, views, observations });
}
function parsePosture(value) {
    try {
        return value ? JSON.parse(value) : null;
    }
    catch {
        return null;
    }
}
function postureSummary(row) {
    const p = parsePosture(row.posture_json);
    const observations = (p?.observations || []).filter((o) => o.reviewed && o.text?.trim());
    return { id: row.id, assessment_date: row.assessment_date, regions: [...new Set(observations.map((o) => o.region))], count: observations.length,
        pending: (p?.observations || []).filter((o) => !o.reviewed).length,
        evolution: Object.fromEntries(['improved', 'stable', 'worse', 'unrated'].map(status => [status, observations.filter((o) => o.evolution === status).length])) };
}
function validatePosturePhotoAccess(db, tenant, patient, postureJson, photos) {
    if (!postureJson)
        return;
    const p = JSON.parse(postureJson);
    const ids = [...Object.values(p.views).map((v) => v.fileId), ...(Array.isArray(photos) ? photos.map((photo) => photo.file_id || photo.fileId) : [])].filter(Boolean);
    for (const id of new Set(ids)) {
        if (typeof id !== 'string' || !db.prepare("SELECT id FROM file_attachments WHERE id=? AND clinic_id=? AND patient_id=? AND mime_type IN ('image/jpeg','image/png','image/webp')").get(id, tenant, patient))
            throw new Error('Dados posturais inválidos');
    }
}
