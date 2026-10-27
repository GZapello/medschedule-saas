export const regions = [
  ['head','Cabeça / cervical',.08], ['shoulders','Ombros',.2], ['scapulae','Escápulas',.28],
  ['spine','Coluna',.37], ['trunk','Tronco',.46], ['pelvis','Pelve / quadril',.56],
  ['knees','Joelhos',.71], ['legs','Pernas',.82], ['feet','Tornozelos / pés',.94]
] as const;
export const views = [['front','Anterior'],['back','Posterior'],['right','Lateral direita'],['left','Lateral esquerda']] as const;
export type View = typeof views[number][0];
export type Region = typeof regions[number][0];
export type Point = [number,number];
export type StrokeSize = 'thin' | 'medium' | 'thick';
export interface Stroke { tool:'pen'|'line'; points:Point[]; color?:string; size?:StrokeSize; region?:Region }
export interface Observation { id:string; region:Region; view:View; text:string; evolution:'unrated'|'improved'|'stable'|'worse'; source:'manual'|'ai'; reviewed:boolean }
export interface Posture { version:1; views:Partial<Record<View,{fileId:string;guides:boolean;strokes:Stroke[]}>>; observations:Observation[] }
export interface PosturePhoto { view:View; fileId:string; url?:string }
export const strokeColors = [
  ['#f43f5e', 'Vermelho'],
  ['#eab308', 'Amarelo'],
  ['#3b82f6', 'Azul'],
  ['#22c55e', 'Verde'],
  ['#ffffff', 'Branco'],
  ['#0f172a', 'Preto']
] as const;
export const strokeSizes: Record<StrokeSize, { label: string; width: number; eraserLabel: string; eraserHit: number }> = {
  thin: { label: 'Fina', width: 2, eraserLabel: 'Pequena', eraserHit: 12 },
  medium: { label: 'Média', width: 3.5, eraserLabel: 'Média', eraserHit: 22 },
  thick: { label: 'Grossa', width: 6, eraserLabel: 'Grande', eraserHit: 36 }
};
export const emptyPosture = ():Posture => ({version:1,views:{},observations:[]});
export function readPosture(value?:string|null):Posture|null { try { const p=JSON.parse(value || 'null'); return p?.version===1 ? p:null; } catch { return null; } }
export const evolutionLabels = {unrated:'Não classificado',improved:'Melhorou',stable:'Manteve',worse:'Piorou'};
export const dateLabel = (date:string) => date?.slice(0,10).split('-').reverse().join('/');
