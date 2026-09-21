import licensedPhotos from '../config/exercise-library.photos.json';
export const normalizeExerciseText = (value: unknown): string => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[_/]/g, ' ').replace(/\s+/g, ' ').trim();
const aliases: Record<string, string> = {
  antebraco: 'antebracos', abdomen: 'abdomen core', core: 'abdomen core',
  posterior: 'posteriores de coxa', posteriores: 'posteriores de coxa', panturrilha: 'panturrilhas',
  cardio: 'cardiorrespiratorio', cardiorrespiratorios: 'cardiorrespiratorio', alongamentos: 'alongamento',
  cabos: 'cabo polia', cabo: 'cabo polia', polia: 'cabo polia', maquinas: 'maquina', 'smith machine': 'smith', hipertrofia: 'musculacao'
};
export function exerciseFilterKey(value: unknown): string {
  const normalized = normalizeExerciseText(value);
  return aliases[normalized] || normalized;
}
export function matchesExercise(ex: any, filters: Record<string, string>): boolean {
  for (const [key, field] of Object.entries({ muscle: 'muscle_group', region: 'body_region', equipment: 'equipment', category: 'category', level: 'level' })) {
    if (filters[key] && exerciseFilterKey(ex[field]) !== exerciseFilterKey(filters[key])) {
      if (!(key === 'muscle' && ['alongamento', 'mobilidade', 'cardiorrespiratorio'].includes(exerciseFilterKey(filters[key])) && exerciseFilterKey(ex.category) === exerciseFilterKey(filters[key]))) return false;
    }
  }
  return !filters.q || normalizeExerciseText([ex.name, ex.muscle_group, ex.equipment, ex.category, ex.instructions, ex.technical_notes].join(' ')).includes(normalizeExerciseText(filters.q));
}

// Persist only application-owned, stable paths. Signed URLs are resolved from file IDs at display time.
export function stableExercisePhoto(value: unknown): string | null {
  return typeof value === 'string' && /^\/exercise-(?:fallbacks|photos)\/[a-z0-9-]+\.webp$/.test(value) ? value : null;
}

export function imageAttribution(db: any, fileId: string | null, photoUrl?: string | null): string | null {
  if (!fileId) {
    const photo = licensedPhotos.find(item => item.photo_url === photoUrl);
    return photo ? JSON.stringify({ author: photo.author, source: photo.source, license: photo.license }) : null;
  }
  const record = db.prepare('SELECT author, source, license FROM exercise_image_provenance WHERE file_id = ?').get(fileId);
  return record ? JSON.stringify(record) : null;
}

export function insertWorkoutExercise(db: any, id: string, tenantId: string, workoutId: string, ex: any, order: number, copy = false): void {
  const source = ex.exercise_id ? db.prepare("SELECT * FROM personal_exercises WHERE id = ? AND (tenant_id = ? OR tenant_id = 'global')").get(ex.exercise_id, tenantId) : null;
  if (ex.exercise_id && !source && !copy) throw new Error('Exercício não disponível nesta clínica');
  const fileId = Object.prototype.hasOwnProperty.call(ex, 'exercise_file_id') ? ex.exercise_file_id : copy ? null : source?.exercise_file_id;
  // Internal duplication preserves legacy snapshots, including unavailable historical media.
  if (fileId && !copy && !db.prepare("SELECT id FROM file_attachments WHERE id = ? AND (clinic_id = ? OR clinic_id = 'global') AND category = 'exercises' AND mime_type IN ('image/jpeg','image/png','image/webp')").get(fileId, tenantId)) throw new Error('Anexo de exercício inválido');
  const category = ex.category ?? (copy ? null : source?.category) ?? null;
  const stretch = exerciseFilterKey(category || ex.muscle_group) === 'alongamento';
  const number = (value: any, fallback: number | null) => value === '' || value === undefined || value === null ? fallback : Number.isFinite(Number(value)) ? Number(value) : fallback;
  const duration = number(ex.duration_seconds, null);
  if (duration !== null && duration < 0) throw new Error('Duração inválida');
  if (ex.side && !['direito','esquerdo','ambos','alternado'].includes(ex.side)) throw new Error('Lado inválido');
  db.prepare(`INSERT INTO personal_workout_exercises (
    id, tenant_id, workout_id, exercise_id, order_index, name, muscle_group, sets, reps, load_kg, tempo, rest_seconds,
    cadence, rpe, rir, technique, technique_custom, notes, photo_url, exercise_file_id, instructions, category, duration_seconds, side, snapshot_version, image_attribution_json
  ) VALUES (${Array(26).fill('?').join(',')})`).run(
    id, tenantId, workoutId, ex.exercise_id || null, order, ex.name || source?.name || 'Exercício', ex.muscle_group || source?.muscle_group || 'Geral',
    number(ex.sets, 3), String(ex.reps ?? (stretch ? '' : '10-12')), number(ex.load_kg, null), ex.tempo || null, number(ex.rest_seconds, stretch ? 0 : 60),
    ex.cadence || null, number(ex.rpe, null), number(ex.rir, null), ex.technique || 'Direta', ex.technique_custom || null, ex.notes || null,
    stableExercisePhoto(ex.photo_url) || (copy ? ex.photo_url || null : stableExercisePhoto(source?.photo_url)), fileId || null,
    ex.instructions ?? (copy ? null : source?.instructions) ?? null, category, duration, ex.side || null, 1,
    copy ? ex.image_attribution_json || null : imageAttribution(db, fileId, stableExercisePhoto(ex.photo_url) || source?.photo_url)
  );
}
