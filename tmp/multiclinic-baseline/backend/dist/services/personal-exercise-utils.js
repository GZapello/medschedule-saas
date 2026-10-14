"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeExerciseText = void 0;
exports.exerciseFilterKey = exerciseFilterKey;
exports.matchesExercise = matchesExercise;
exports.stableExercisePhoto = stableExercisePhoto;
exports.imageAttribution = imageAttribution;
exports.insertWorkoutExercise = insertWorkoutExercise;
const exercise_library_media_json_1 = __importDefault(require("../config/exercise-library.media.json"));
const exercise_media_1 = require("./exercise-media");
const exercise_library_photos_json_1 = __importDefault(require("../config/exercise-library.photos.json"));
const normalizeExerciseText = (value) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[_/]/g, ' ').replace(/\s+/g, ' ').trim();
exports.normalizeExerciseText = normalizeExerciseText;
const aliases = {
    antebraco: 'antebracos', abdomen: 'abdomen core', core: 'abdomen core',
    posterior: 'posteriores de coxa', posteriores: 'posteriores de coxa', panturrilha: 'panturrilhas',
    cardio: 'cardiorrespiratorio', cardiorrespiratorios: 'cardiorrespiratorio', alongamentos: 'alongamento',
    cabos: 'cabo polia', cabo: 'cabo polia', polia: 'cabo polia', maquinas: 'maquina', 'smith machine': 'smith', hipertrofia: 'musculacao',
    'fita de suspensao': 'fita de suspensao', trx: 'fita de suspensao', suspensao: 'fita de suspensao',
    'medicine ball': 'medicine ball', medicine_ball: 'medicine ball',
    'caixa step': 'caixa step', caixa: 'caixa step', step: 'caixa step',
    adutor: 'adutores', abdutor: 'abdutores', gluteo: 'gluteos', ombro: 'ombros', costa: 'costas'
};
function exerciseFilterKey(value) {
    const normalized = (0, exports.normalizeExerciseText)(value);
    return aliases[normalized] || normalized;
}
function matchesExercise(ex, filters) {
    for (const [key, field] of Object.entries({ muscle: 'muscle_group', region: 'body_region', equipment: 'equipment', category: 'category', level: 'level' })) {
        if (filters[key] && exerciseFilterKey(ex[field]) !== exerciseFilterKey(filters[key])) {
            if (!(key === 'muscle' && ['alongamento', 'mobilidade', 'cardiorrespiratorio'].includes(exerciseFilterKey(filters[key])) && exerciseFilterKey(ex.category) === exerciseFilterKey(filters[key])))
                return false;
        }
    }
    return !filters.q || (0, exports.normalizeExerciseText)([ex.name, ex.muscle_group, ex.equipment, ex.category, ex.instructions, ex.technical_notes].join(' ')).includes((0, exports.normalizeExerciseText)(filters.q));
}
// Persist only application-owned, stable paths. Signed URLs are resolved from file IDs at display time.
function stableExercisePhoto(value) {
    return typeof value === 'string' && (exercise_library_media_json_1.default.some(item => item.photo_url === value) || /^\/exercise-(?:fallbacks|photos)\/[a-z0-9-]+\.webp$/.test(value)) ? value : null;
}
function imageAttribution(db, fileId, photoUrl) {
    if (!fileId) {
        const photo = exercise_library_photos_json_1.default.find(item => item.photo_url === photoUrl);
        const credit = photo ? { author: photo.author, source: photo.source, license: photo.license } : (0, exercise_media_1.datasetImageCredit)(photoUrl);
        return credit ? JSON.stringify(credit) : null;
    }
    const record = db.prepare('SELECT author, source, license FROM exercise_image_provenance WHERE file_id = ?').get(fileId);
    return record ? JSON.stringify(record) : null;
}
function insertWorkoutExercise(db, id, tenantId, workoutId, ex, order, copy = false) {
    const source = ex.exercise_id ? db.prepare("SELECT * FROM personal_exercises WHERE id = ? AND (tenant_id = ? OR tenant_id = 'global')").get(ex.exercise_id, tenantId) : null;
    if (ex.exercise_id && !source && !copy)
        throw new Error('Exercício não disponível nesta clínica');
    const fileId = Object.prototype.hasOwnProperty.call(ex, 'exercise_file_id') ? ex.exercise_file_id : copy ? null : source?.exercise_file_id;
    // Internal duplication preserves legacy snapshots, including unavailable historical media.
    if (fileId && !copy && !db.prepare("SELECT id FROM file_attachments WHERE id = ? AND (clinic_id = ? OR clinic_id = 'global') AND category = 'exercises' AND mime_type IN ('image/jpeg','image/png','image/webp')").get(fileId, tenantId))
        throw new Error('Anexo de exercício inválido');
    const category = ex.category ?? (copy ? null : source?.category) ?? null;
    const stretch = exerciseFilterKey(category || ex.muscle_group) === 'alongamento';
    const number = (value, fallback) => value === '' || value === undefined || value === null ? fallback : Number.isFinite(Number(value)) ? Number(value) : fallback;
    const duration = number(ex.duration_seconds, null);
    if (duration !== null && duration < 0)
        throw new Error('Duração inválida');
    if (ex.side && !['direito', 'esquerdo', 'ambos', 'alternado'].includes(ex.side))
        throw new Error('Lado inválido');
    db.prepare(`INSERT INTO personal_workout_exercises (
    id, tenant_id, workout_id, exercise_id, order_index, name, muscle_group, sets, reps, load_kg, tempo, rest_seconds,
    cadence, rpe, rir, technique, technique_custom, notes, photo_url, exercise_file_id, instructions, category, duration_seconds, side, snapshot_version, image_attribution_json
  ) VALUES (${Array(26).fill('?').join(',')})`).run(id, tenantId, workoutId, ex.exercise_id || null, order, ex.name || source?.name || 'Exercício', ex.muscle_group || source?.muscle_group || 'Geral', number(ex.sets, 3), String(ex.reps ?? (stretch ? '' : '10-12')), number(ex.load_kg, null), ex.tempo || null, number(ex.rest_seconds, stretch ? 0 : 60), ex.cadence || null, number(ex.rpe, null), number(ex.rir, null), ex.technique || 'Direta', ex.technique_custom || null, ex.notes || null, stableExercisePhoto(ex.photo_url) || (copy ? ex.photo_url || null : stableExercisePhoto(source?.photo_url)), fileId || null, ex.instructions ?? (copy ? null : source?.instructions) ?? null, category, duration, ex.side || null, 1, copy ? ex.image_attribution_json || null : imageAttribution(db, fileId, stableExercisePhoto(ex.photo_url) || source?.photo_url));
}
