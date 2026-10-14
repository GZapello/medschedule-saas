"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.exerciseAnimation = exerciseAnimation;
exports.datasetImageCredit = datasetImageCredit;
exports.normalizeExerciseLookup = normalizeExerciseLookup;
exports.getExerciseMaxCompletedLoad = getExerciseMaxCompletedLoad;
exports.resolveExerciseMediaAndDetails = resolveExerciseMediaAndDetails;
const exercise_library_media_json_1 = __importDefault(require("../config/exercise-library.media.json"));
const byId = new Map(exercise_library_media_json_1.default.map(item => [item.exercise_id, item]));
// Only reviewed global IDs may receive dataset demonstrations. Tenant copies
// can describe a different movement even when they retain a source ID.
function exerciseAnimation(ex) {
    if (ex.tenant_id !== 'global' && !ex.source_exercise_id)
        return {};
    if (ex.is_custom && !ex.source_exercise_id)
        return {};
    const targetId = (ex.tenant_id !== 'global' && ex.source_exercise_id) ? ex.source_exercise_id : ex.id;
    const item = byId.get(targetId);
    return item ? { gif_url: item.gif_url, gif_attribution: item.attribution } : {};
}
function datasetImageCredit(photoUrl) {
    if (!photoUrl)
        return null;
    const item = exercise_library_media_json_1.default.find(item => item.photo_url === photoUrl);
    return item ? {
        author: item.attribution,
        source: item.source_repository === 'JahelCuadrado/ExerciseGymGifsDB'
            ? `https://github.com/${item.source_repository}/blob/${item.source_commit}/${item.image_path}`
            : 'https://gymvisual.com/',
        image_kind: 'demonstration'
    } : null;
}
/**
 * Normaliza string para buscas e comparações estáveis de exercícios
 */
function normalizeExerciseLookup(value) {
    return String(value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
/**
 * Função utilitária auditada para extrair carga máxima conquistada estritamente de séries concluídas
 */
function getExerciseMaxCompletedLoad(e) {
    if (!e || e.skipped)
        return 0;
    // Prioridade 1: sets_data se disponível (somente séries completadas com carga > 0)
    if (Array.isArray(e.sets_data) && e.sets_data.length > 0) {
        let max = 0;
        for (const s of e.sets_data) {
            if (s && s.completed === true) {
                const load = Number(s.load_kg || s.load || 0);
                if (Number.isFinite(load) && load > max) {
                    max = load;
                }
            }
        }
        return max;
    }
    // Prioridade 2: compatibilidade com logs legados sem sets_data
    const setsDone = Number(e.sets_completed ?? e.sets_done ?? 0);
    if (setsDone > 0 || e.sets_data === undefined) {
        const load = Number(e.load_kg || e.load || 0);
        return Number.isFinite(load) && load > 0 ? load : 0;
    }
    return 0;
}
/**
 * Resolve mídia, animação (GIF), instruções e detalhes de um exercício a partir do banco e da biblioteca central
 */
function resolveExerciseMediaAndDetails(db, ex) {
    let pe = null;
    // 1. Tenta buscar pelo exercise_id direto se fornecido
    if (ex.exercise_id) {
        try {
            pe = db.prepare('SELECT * FROM personal_exercises WHERE id = ?').get(ex.exercise_id);
        }
        catch { }
    }
    // 2. Se não encontrou pelo ID, busca por correspondência de nome
    if (!pe && ex.name) {
        try {
            pe = db.prepare('SELECT * FROM personal_exercises WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))').get(ex.name);
        }
        catch { }
        if (!pe) {
            try {
                const normName = normalizeExerciseLookup(ex.name);
                const words = normName.split(' ').filter(w => w.length > 2 && !['com', 'para', 'nao', 'dos', 'das', 'pela', 'pelo'].includes(w));
                if (words.length > 0) {
                    const allExercises = db.prepare('SELECT * FROM personal_exercises').all();
                    pe = allExercises.find((candidate) => {
                        const candNorm = normalizeExerciseLookup(candidate.name);
                        return words.every(w => candNorm.includes(w));
                    });
                }
            }
            catch { }
        }
    }
    // 3. Resolve mídia a partir do ID localizado ou do exercise_id original
    const targetId = pe?.id || ex.exercise_id;
    const mediaItem = targetId ? byId.get(targetId) : null;
    const resolvedPhoto = ex.photo_url || pe?.photo_url || mediaItem?.photo_url || (targetId ? `/exercise-fallbacks/${targetId}.webp` : null);
    // Se for exercício customizado de clínica, não utiliza dataset de animação de terceiro a menos que mapeado
    const gifUrl = (pe && pe.tenant_id !== 'global' && pe.is_custom) ? null : (mediaItem?.gif_url || null);
    const gifAttribution = gifUrl ? (mediaItem?.attribution || '© Gym visual') : null;
    return {
        exercise_id: targetId || null,
        photo_url: resolvedPhoto,
        gif_url: gifUrl,
        gif_attribution: gifAttribution,
        instructions: ex.instructions || pe?.instructions || null,
        technical_notes: ex.technical_notes || pe?.technical_notes || null,
        equipment: ex.equipment || pe?.equipment || null,
        category: ex.category || pe?.category || null
    };
}
