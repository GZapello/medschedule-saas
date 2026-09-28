// Versioned JSON within the existing body_assessments.notes column. Legacy
// strings/arrays remain valid; no table, route or permission renaming.
export function parseAnatomicalDocument(notes: unknown): any | null {
  if(typeof notes!=='string')return null;
  try { const value=JSON.parse(notes);return value?.schemaVersion===2 ? value : null; } catch{return null;}
}
export function validateAnatomicalDocument(doc:any):string|null {
  if(!doc || !['BODY','FACE'].includes(doc.mapType) || !doc.layers || Array.isArray(doc.layers))return 'Documento anatômico inválido';
  const entries=Object.entries(doc.layers);
  if(entries.length>12 || !entries.length || !Object.hasOwn(doc.layers,doc.activeLayerKey))return 'Camadas anatômicas inválidas';
  for(const [key,value]of entries){
    const l=value as any;
    if(!l || !['BODY','FACE'].includes(l.mapType) || !['male','female'].includes(l.sexVariant))return 'Base anatômica inválida';
    const views=l.mapType==='BODY'?['all','front','back','left','right']:['front','left','right','3q_left','3q_right'];
    if(!views.includes(l.view) || key!==`${l.mapType}:${l.sexVariant}:${l.mapType==='BODY'?'all':l.view}`)return 'Vista anatômica inválida';
    if(!Array.isArray(l.selectedRegions) || l.selectedRegions.length>250 || l.selectedRegions.some((id:any)=>typeof id!=='string'||!/^[a-z0-9_]+$/.test(id)))return 'Seleção anatômica inválida';
    if(typeof l.clinicalNotes!=='string'||l.clinicalNotes.length>50000)return 'Observações inválidas';
    if(!Array.isArray(l.drawings)||l.drawings.length>2000)return 'Desenhos inválidos';
    for(const stroke of l.drawings){
      if(!stroke || !Array.isArray(stroke.points)||stroke.points.length>30000)return 'Traço inválido';
      if(stroke.points.some((p:any)=>!p||![p.x,p.y].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1)))return 'Coordenadas devem estar normalizadas entre 0 e 1';
      if(!Number.isFinite(stroke.strokeWidth)||stroke.strokeWidth<=0||stroke.strokeWidth>100)return 'Espessura inválida';
    }
    if(!Array.isArray(l.marks)||l.marks.length>2000)return 'Marcações inválidas';
    const ids=new Set();
    for(const m of l.marks){
      if(!m || typeof m.id!=='string'||ids.has(m.id)||typeof m.regionId!=='string'||typeof m.note!=='string'||m.note.length>10000||!views.includes(m.view))return 'Marcação inválida';
      ids.add(m.id);
      if(m.type && !['observation','pain','lesion','injury','edema','scar','procedure','aesthetic','other','limitation','sensitivity','functional','anthropometry','muscle_strength','rom'].includes(m.type))return 'Tipo de marcação inválido';
    }
  }
  return null;
}
export function stampAnatomicalDocument(doc:any,previous:any,userId:string){
  const now=new Date().toISOString();
  for(const [key,layer]of Object.entries(doc.layers))for(const mark of (layer as any).marks){
    const old=previous?.layers?.[key]?.marks?.find((m:any)=>m.id===mark.id);
    mark.createdBy=old?.createdBy || userId;
    mark.createdAt=old?.createdAt || now;
  }
  doc.updatedBy=userId;doc.updatedAt=now;
  doc.createdBy=previous?.createdBy || userId;doc.createdAt=previous?.createdAt || now;
  return JSON.stringify(doc);
}
