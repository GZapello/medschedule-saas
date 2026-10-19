import { DENTAL_CONDITIONS, OdontogramData, ToothFace, ToothStatus } from './odontogramModel';

export interface ToothChange {
  toothNumber: number;
  face: ToothFace;
  condition: string;
  previousCondition?: string;
}
export const isUpperTooth = (n: number) => [1, 2, 5, 6].includes(Math.floor(n / 10));
export const toothFaces = (n: number): ToothFace[] => ['vestibular', isUpperTooth(n) ? 'palatina' : 'lingual', 'mesial', 'distal', 'oclusal'];
export const conditionLabel = (id?: string) => !id ? 'Hígido' : DENTAL_CONDITIONS.find(c => c.id === id)?.label || 'Condição registrada';
export const faceLabel = (face: ToothFace, tooth: number) => ({ whole: 'Dente inteiro', vestibular: 'Vestibular', palatina: 'Palatina', lingual: 'Lingual', mesial: 'Mesial', distal: 'Distal', oclusal: tooth % 10 <= 3 ? 'Incisal' : 'Oclusal' })[face];
export const toothName = (n: number) => {
  const names = ['Incisivo central', 'Incisivo lateral', 'Canino', 'Primeiro pré-molar', 'Segundo pré-molar', 'Primeiro molar', 'Segundo molar', 'Terceiro molar'];
  return `${names[n % 10 - 1]} ${isUpperTooth(n) ? 'superior' : 'inferior'} ${[1, 4].includes(Math.floor(n / 10)) ? 'direito' : 'esquerdo'}`;
};
export function describeToothStatus(status: ToothStatus = {}, n: number) {
  return (['whole', ...toothFaces(n)] as ToothFace[]).filter(f => status[f] && status[f] !== 'healthy')
    .map(f => `${faceLabel(f, n)}: ${conditionLabel(status[f])}`).join(' · ') || 'Hígido';
}

/** Shared 2D/3D mutation and audit format. 'whole' with a face condition is the legacy 2D all-faces gesture. */
export function updateToothCondition(data: OdontogramData, n: number, face: ToothFace, condition: string, toggle = true) {
  const definition = DENTAL_CONDITIONS.find(c => c.id === condition);
  if (!definition) return { data, changes: [] as ToothChange[] };
  const previous = data[n] || {};
  const next = { ...previous };
  const changes: ToothChange[] = [];
  const targets: ToothFace[] = definition.affectsWholeTooth ? ['whole'] : face === 'whole' && condition !== 'healthy' ? toothFaces(n) : [face];
  const remove = condition === 'healthy' || (toggle && targets.every(f => previous[f] === condition));
  for (const target of targets) {
    if (remove) delete next[target];
    else next[target] = condition;
    if (previous[target] !== next[target]) changes.push({ toothNumber: n, face: target, condition: next[target] || 'healthy', previousCondition: previous[target] });
  }
  if (!definition.affectsWholeTooth && condition !== 'healthy' && next.whole === condition) {
    delete next.whole;
    changes.push({ toothNumber: n, face: 'whole', condition: 'healthy', previousCondition: previous.whole });
  }
  return { data: changes.length ? { ...data, [n]: next } : data, changes };
}
