import React, { useState } from 'react';
import { readAnatomicalDocument } from './anatomicalDocument';
import { AnatomicalMapCanvas } from './AnatomicalMapCanvas';
import { anatomicalLabel } from './anatomicalRegions';
export function AnatomicalRecordPreview({response}:{response:any}){
  const doc=readAnatomicalDocument(response);
  const [key,setKey]=useState(doc.activeLayerKey);
  const layer=doc.layers[key] || doc.layers[doc.activeLayerKey];
  return <div className="w-full space-y-3">
    <select aria-label="Mapa no histórico" value={key} onChange={e=>setKey(e.target.value)} className="w-full border border-slate-200 rounded-xl p-2 text-sm">
      {Object.entries(doc.layers).map(([id,l])=><option key={id} value={id}>{l.mapType==='FACE'?'Face':'Corpo'} · {l.sexVariant==='female'?'Feminino':'Masculino'} · {l.view}</option>)}
    </select>
    <AnatomicalMapCanvas mapType={layer.mapType} view={layer.view} bodyModel={layer.sexVariant} selectedRegions={layer.selectedRegions} drawings={layer.drawings} readOnly/>
    <p className="text-sm whitespace-pre-wrap">{layer.clinicalNotes}</p>
    <ul className="text-xs space-y-2">{layer.marks.map(m=><li key={m.id}><strong>{anatomicalLabel(m.regionId,layer.sexVariant)}:</strong> {m.note}</li>)}</ul>
  </div>;
}
