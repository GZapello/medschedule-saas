import React, {useEffect,useRef,useState} from 'react';
import {ApiClient} from '../../api/client';
import {PosturePhotoCanvas} from './PosturePhotoCanvas';
import {Posture,PosturePhoto,View,Region,Stroke,Observation,views,regions,evolutionLabels} from './posture';
interface Props {value:Posture;onChange:(value:Posture)=>void;photos:PosturePhoto[];patientId:string;onBusy?:(busy:boolean)=>void}
export default function PersonalPostureEditor({value,onChange,photos,patientId,onBusy}:Props) {
  const [view,setView]=useState<View>('front');
  const [tool,setTool]=useState<'select'|'pen'|'line'|'eraser'>('select');
  const [region,setRegion]=useState<Region>('head');
  const [undo,setUndo]=useState<Stroke[][]>([]);
  const [ai,setAi]=useState<{available:boolean;reason?:string}>({available:false});
  const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const generation=useRef(0);
  const photo=photos.find(p=>p.view===view)!;
  const current=value.views[view];
  const mismatch=Boolean(current && current.fileId!==photo.fileId);
  const strokes=mismatch?[]:current?.strokes||[];
  useEffect(()=>{let active=true;ApiClient.get<any>('/v1/personal/posture-ai/status').then(r=>{if(active)setAi(r);}).catch(()=>{if(active)setAi({available:false,reason:'IA indisponível neste ambiente.'});});return()=>{active=false;generation.current++;onBusy?.(false);};},[]);
  useEffect(()=>{setUndo([]);},[view,photo.fileId]);
  const updateStrokes=(next:Stroke[])=>{setUndo(old=>[...old.slice(-19),strokes]);onChange({...value,views:{...value.views,[view]:{fileId:photo.fileId,guides:current?.guides||false,strokes:next}}});};
  const add=(r:Region)=>{if(value.observations.length>=180)return;setRegion(r);onChange({...value,observations:[...value.observations,{id:crypto.randomUUID(),region:r,view,text:'',evolution:'unrated',source:'manual',reviewed:true}]});};
  const edit=(id:string,patch:Partial<Observation>)=>onChange({...value,observations:value.observations.map(o=>o.id===id?{...o,...patch}:o)});
  const analyze=async()=>{if(busy)return;setBusy(true);onBusy?.(true);setMessage('');const request=++generation.current;
    try {const result=await ApiClient.post<{suggestions:Observation[]}>('/v1/personal/posture-ai/analyze',{patient_id:patientId,photos:photos.filter(p=>p.fileId).map(p=>({view:p.view,file_id:p.fileId}))});if(request===generation.current){onChange({...value,observations:[...value.observations,...result.suggestions].slice(0,180)});setMessage('Sugestões adicionadas. Revise cada uma antes de incluí-la na evolução.');}}
    catch(e:any){if(request===generation.current)setMessage(e.message||'Não foi possível analisar as fotos.');}
    finally {if(request===generation.current){setBusy(false);onBusy?.(false);}}
  };
  return <section className="rounded-2xl border border-indigo-100 bg-indigo-50/30 p-4 space-y-4" aria-label="Avaliação Postural">
    <div><h3 className="font-bold text-slate-800">Avaliação Postural</h3><p className="text-xs text-slate-500">Marcações manuais sobre as fotos originais. Salve a avaliação para preservar as marcações e observações. Guias visuais não representam medidas clínicas.</p></div>
    <div className="flex flex-wrap gap-2">{views.map(([id,label])=><button disabled={busy} type="button" key={id} onClick={()=>setView(id)} className={`px-3 py-2 rounded-xl text-xs ${view===id?'bg-indigo-600 text-white':'bg-white border'}`}>{label}</button>)}</div>
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(250px,320px)] gap-4">
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">{([['select','Navegar'],['pen','Caneta'],['line','Linha'],['eraser','Borracha']] as const).map(([id,label])=><button disabled={busy||!photo.fileId||mismatch} type="button" key={id} onClick={()=>setTool(id)} className={`px-3 py-1.5 rounded-lg text-xs border disabled:opacity-40 ${tool===id?'bg-indigo-600 text-white':'bg-white'}`}>{label}</button>)}
          <button disabled={!undo.length||busy} type="button" onClick={()=>{const previous=undo[undo.length-1];setUndo(undo.slice(0,-1));onChange({...value,views:{...value.views,[view]:{fileId:photo.fileId,guides:current?.guides||false,strokes:previous}}});}} className="text-xs border rounded-lg px-2 disabled:opacity-40">Desfazer</button>
          <label className="text-xs flex items-center gap-1"><input type="checkbox" checked={!mismatch&&Boolean(current?.guides)} disabled={!photo.fileId||mismatch||busy} onChange={e=>onChange({...value,views:{...value.views,[view]:{fileId:photo.fileId,guides:e.target.checked,strokes}}})} />Guias</label>
        </div>
        {mismatch&&<div className="text-xs text-amber-800 bg-amber-50 p-3 rounded-xl">Esta vista tem marcações de outra foto. <button type="button" disabled={busy} className="underline" onClick={()=>updateStrokes([])}>Descartar traços anteriores e usar a foto atual</button>. Revise também as observações desta vista.</div>}
        <div className="max-w-md mx-auto"><PosturePhotoCanvas key={`${view}:${photo.fileId}`} attentionRegions={value.observations.filter(o=>o.view===view&&!o.reviewed).map(o=>o.region)} photo={photo} strokes={strokes} guides={!mismatch&&current?.guides} tool={busy||mismatch?'select':tool} onStrokes={busy||mismatch?undefined:updateStrokes} onRegion={busy?undefined:add} /></div>
        <p className="text-[11px] text-slate-500">Use “+” para abrir uma região. Os botões são atalhos, não pontos anatômicos detectados. Até 100 traços por foto.</p>
      </div>
      <aside className="bg-white rounded-xl border p-3 space-y-3 min-w-0">
        <label className="block text-xs font-semibold">Região<select aria-label="Região postural" value={region} disabled={busy} onChange={e=>setRegion(e.target.value as Region)} className="block w-full border rounded-lg p-2 mt-1">{regions.map(([id,label])=><option key={id} value={id}>{label} ({value.observations.filter(o=>o.region===id&&o.view===view).length})</option>)}</select></label>
        <button type="button" disabled={busy||value.observations.length>=180} onClick={()=>add(region)} className="text-xs text-indigo-700 font-semibold">+ Observação nesta região</button>
        <div className="max-h-[520px] overflow-y-auto space-y-3">{value.observations.filter(o=>o.view===view&&o.region===region).map(o=><div className="rounded-xl border p-2 space-y-2" key={o.id}>
          {o.source==='ai'&&<span className="text-[10px] text-amber-700">Sugestão de IA • {o.reviewed?'revisada':'aguarda revisão'}</span>}
          <textarea aria-label="Observação postural" value={o.text} maxLength={1200} disabled={busy} onChange={e=>edit(o.id,{text:e.target.value})} rows={3} className="w-full border rounded-lg p-2 text-xs" placeholder="Registre o achado visual e o contexto da avaliação" />
          <label className="block text-[11px]">Em relação à avaliação inicial<select aria-label="Evolução em relação à inicial" value={o.evolution} disabled={busy||!o.reviewed} onChange={e=>edit(o.id,{evolution:e.target.value as Observation['evolution']})} className="w-full border rounded-lg p-1 text-xs">{Object.entries(evolutionLabels).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
          {o.source==='ai'&&!o.reviewed&&<button type="button" disabled={busy||!o.text.trim()} onClick={()=>edit(o.id,{reviewed:true})} className="text-xs text-emerald-700">Confirmar revisão</button>}
          <button type="button" disabled={busy} onClick={()=>onChange({...value,observations:value.observations.filter(item=>item.id!==o.id)})} className="text-xs text-rose-700 ml-2">Excluir observação</button>
        </div>)}</div>
        <p className="text-[11px] text-slate-500">{value.observations.filter(o=>o.reviewed&&o.text.trim()).length} observações revisadas • {value.observations.filter(o=>!o.reviewed).length} pendentes. Classificação definida pelo profissional.</p>
      </aside>
    </div>
    <div className="border-t pt-3 space-y-2"><button type="button" disabled={busy||!ai.available||!photos.some(p=>p.fileId)||value.observations.length>=180} onClick={analyze} className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold disabled:opacity-40">{busy?'Analisando…':'Analisar postura com IA'}</button>
      <p className="text-[11px] text-slate-500">{ai.available?'Ao solicitar, as fotos serão enviadas à IA configurada. Sugestões visuais para revisão profissional; não constituem diagnóstico. Nenhuma análise é automática.':ai.reason||'Verificando disponibilidade da IA…'}</p>
      {message&&<p role="status" className="text-xs text-indigo-800">{message}</p>}
    </div>
  </section>;
}
