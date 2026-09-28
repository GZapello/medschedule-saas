import type { BodyStroke } from './Zemda360Canvas';
import { LEGACY_TO_CANONICAL } from './anatomicalRegions';
export type MapType = 'BODY' | 'FACE';
export type SexVariant = 'female' | 'male';
export type AnatomicalView = 'all' | 'front' | 'back' | 'left' | 'right' | '3q_left' | '3q_right';
export const MARK_TYPES = { observation:'Observação', pain:'Dor', lesion:'Lesão', edema:'Edema', scar:'Cicatriz', procedure:'Procedimento', aesthetic:'Estética', other:'Outro' };
export interface AnatomicalMark {
  id: string; regionId: string; view: AnatomicalView; note: string;
  type?: keyof typeof MARK_TYPES; createdAt: string; createdBy?: string;
}
export interface AnatomicalLayer {
  mapType: MapType; sexVariant: SexVariant; view: AnatomicalView;
  selectedRegions: string[]; selectionViews: Record<string, AnatomicalView>;
  drawings: BodyStroke[]; clinicalNotes: string; marks: AnatomicalMark[];
}
export interface AnatomicalDocument {
  schemaVersion: 2; mapType: MapType; activeLayerKey: string;
  layers: Record<string, AnatomicalLayer>; legacyNotes?: unknown;
}
export const layerKey = (type: MapType, sex: SexVariant, view: AnatomicalView) => `${type}:${sex}:${type === 'BODY' ? 'all' : view}`;
export function emptyLayer(mapType: MapType, sexVariant: SexVariant, view: AnatomicalView = 'front'): AnatomicalLayer {
  return {mapType,sexVariant,view,selectedRegions:[],selectionViews:{},drawings:[],clinicalNotes:'',marks:[]};
}
export function readAnatomicalDocument(response: any, fallback: SexVariant = 'female', initialMapType: MapType = 'BODY'): AnatomicalDocument {
  const assessment=response?.assessment || {};
  const sex: SexVariant=assessment.body_model === 'male' ? 'male' : assessment.body_model === 'female' ? 'female' : fallback;
  let parsed: any=assessment.notes;
  try { parsed=JSON.parse(assessment.notes); } catch { /* Plain text is a valid legacy note. */ }
  if(parsed?.schemaVersion === 2 && parsed.layers && parsed.layers[parsed.activeLayerKey]) return parsed;
  const mapType: MapType = initialMapType || 'BODY';
  const defaultView: AnatomicalView = mapType === 'FACE' ? 'front' : 'all';
  const layer=emptyLayer(mapType,sex,defaultView);
  const explicitSelection=Array.isArray(parsed) || Array.isArray(parsed?.selectedRegions);
  layer.selectedRegions=Array.isArray(parsed) ? parsed.filter(x=>typeof x==='string') : Array.isArray(parsed?.selectedRegions) ? parsed.selectedRegions : [];
  if(!explicitSelection) layer.selectedRegions=(response?.markers || []).map((m:any)=>m.body_region).filter(Boolean);
  if(Array.isArray(parsed?.drawings)) layer.drawings=parsed.drawings;
  else if(response?.drawings?.all)layer.drawings=response.drawings.all;
  else {
    layer.drawings=[...(response?.drawings?.front || [])];
    for(const [view,offset]of [['back',.25],['left',.5],['right',.75]] as const){
      for(const stroke of response?.drawings?.[view] || [])layer.drawings.push({...stroke,points:stroke.points.map((p:any)=>({...p,x:offset+p.x*.25}))});
    }
  }
  layer.clinicalNotes=typeof parsed==='string' ? parsed : parsed?.clinicalNotes || parsed?.clinicalNote || parsed?.observation || '';
  layer.marks=(response?.markers || []).filter((m:any)=>m.marker_type!=='selected_region').map((m:any)=>({id:m.id,regionId:m.body_region,view:m.view || defaultView,note:m.notes || m.value || '',type:m.marker_type,createdAt:m.created_at}));
  const key=layerKey(mapType,sex,defaultView);
  return {schemaVersion:2,mapType,activeLayerKey:key,layers:{[key]:layer},legacyNotes:parsed ?? null};
}
// Compatibility projection for old BODY-only integrations. Face data never
// appears as a bodily symptom in those consumers.
export function serializeAnatomicalDocument(doc: AnatomicalDocument): string {
  const active=doc.layers[doc.activeLayerKey];
  const body=doc.layers[layerKey('BODY',active.sexVariant,'all')] || Object.values(doc.layers).find(l=>l.mapType==='BODY');
  const legacyIds=Object.fromEntries(Object.entries(LEGACY_TO_CANONICAL).map(([old,id])=>[id,old]));
  return JSON.stringify({...doc, selectedRegions:(body?.selectedRegions || []).map(id=>legacyIds[id] || id),drawings:body?.drawings || [],clinicalNotes:body?.clinicalNotes || ''});
}
