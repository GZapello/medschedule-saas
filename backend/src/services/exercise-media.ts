import media from '../config/exercise-library.media.json';

const byId = new Map(media.map(item => [item.exercise_id, item]));

// Only reviewed global IDs may receive dataset demonstrations. Tenant copies
// can describe a different movement even when they retain a source ID.
export function exerciseAnimation(ex: { id: string; tenant_id?: string; is_custom?: number }) {
  if (ex.tenant_id !== 'global' || ex.is_custom) return {};
  const item = byId.get(ex.id);
  return item ? { gif_url: item.gif_url, gif_attribution: item.attribution } : {};
}

export function datasetImageCredit(photoUrl?: string | null) {
  if (!photoUrl) return null;
  const item = media.find(item => item.photo_url === photoUrl);
  return item ? {
    author: item.attribution,
    source: item.source_repository === 'JahelCuadrado/ExerciseGymGifsDB'
      ? `https://github.com/${item.source_repository}/blob/${item.source_commit}/${item.image_path}`
      : 'https://gymvisual.com/',
    image_kind: 'demonstration'
  } : null;
}
