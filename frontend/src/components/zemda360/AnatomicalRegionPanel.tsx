import React, { useState, useEffect } from 'react';
import { AnatomicalLayer, AnatomicalMark, MARK_TYPES } from './anatomicalDocument';
import { anatomicalLabel, REGION_TAXONOMY } from './anatomicalRegions';
export function AnatomicalRegionPanel({layer,regionId,available,onFocus,onAdd,onRemove,readOnly=false}:{
  layer:AnatomicalLayer;regionId:string;available:string[];onFocus:(id:string)=>void;
  onAdd:(mark:AnatomicalMark)=>void;onRemove:(id:string)=>void;readOnly?:boolean;
}){
  const [note,setNote]=useState(''),[type,setType]=useState<keyof typeof MARK_TYPES|''>('');
  useEffect(()=>{setNote('');setType('');},[regionId,layer.mapType,layer.sexVariant,layer.view]);
  const meta=REGION_TAXONOMY.find(r=>r.id===regionId);
  return <aside className="min-w-0 rounded-2xl bg-slate-50 border border-slate-200 p-4 space-y-4" aria-label="Regiões e marcações">
    <div><h4 className="text-xs font-bold uppercase tracking-wide text-teal-700">Região selecionada</h4>
      <select aria-label="Selecionar região anatômica" value={regionId} onChange={e=>{onFocus(e.target.value);setNote('');setType('');}} className="mt-2 w-full border border-slate-200 bg-white rounded-xl p-2 text-sm">
        <option value="">Escolha no mapa ou na lista</option>
        {Array.from(new Set([...available,...layer.selectedRegions])).map(id=><option key={id} value={id}>{anatomicalLabel(id,layer.sexVariant)}</option>)}
      </select>
      {regionId && <p className="mt-2 text-sm font-semibold text-slate-800">{anatomicalLabel(regionId,layer.sexVariant)}</p>}
      {meta?.kind==='joint' && <p className="text-xs text-teal-700 mt-1">Articulação</p>}
    </div>
    {regionId && !readOnly && <form className="space-y-3" onSubmit={e=>{e.preventDefault();if(!note.trim()&&!type)return;onAdd({id:crypto.randomUUID(),regionId,view:layer.view,note:note.trim(),...(type?{type}:{}),createdAt:new Date().toISOString()});setNote('');setType('');}}>
      <label className="block text-xs font-semibold text-slate-600">Tipo de marcação (opcional)
        <select aria-label="Tipo de marcação" className="mt-1 w-full border border-slate-200 bg-white rounded-xl p-2" value={type} onChange={e=>setType(e.target.value as any)}><option value="">Sem classificação</option>{Object.entries(MARK_TYPES).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select>
      </label>
      <label className="block text-xs font-semibold text-slate-600">Observação da região
        <textarea aria-label="Observação da região" rows={3} className="mt-1 w-full border border-slate-200 bg-white rounded-xl p-2 resize-y" value={note} onChange={e=>setNote(e.target.value)} maxLength={10000}/>
      </label>
      <button type="submit" disabled={!note.trim()&&!type} className="w-full rounded-xl bg-teal-700 text-white py-2 text-xs font-bold disabled:opacity-50">Adicionar marcação</button>
    </form>}
    <div><h4 className="text-xs font-bold uppercase text-slate-700">Marcações ({layer.marks.length})</h4>
      {!layer.marks.length && <p className="text-xs text-slate-500 mt-2">Nenhuma marcação nesta base e vista.</p>}
      <ul className="space-y-2 mt-2 max-h-72 overflow-y-auto">{layer.marks.map(mark=><li key={mark.id} className="rounded-xl border border-slate-200 bg-white p-3 text-xs">
        <button type="button" className="font-bold text-teal-800 text-left" onClick={()=>onFocus(mark.regionId)}>{anatomicalLabel(mark.regionId,layer.sexVariant)}</button>
        <p className="text-slate-500 mt-1">{mark.type ? MARK_TYPES[mark.type] || mark.type : 'Observação'} · {mark.view}</p>
        <p className="whitespace-pre-wrap break-words mt-1 text-slate-700">{mark.note}</p>
        {!readOnly && <button type="button" className="mt-2 text-rose-600" onClick={()=>onRemove(mark.id)}>Excluir marcação</button>}
      </li>)}</ul>
    </div>
  </aside>;
}
