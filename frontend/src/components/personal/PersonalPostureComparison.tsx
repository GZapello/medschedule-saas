import React,{useState} from 'react';
import {PosturePhotoCanvas} from './PosturePhotoCanvas';
import {readPosture,views,View,regions,evolutionLabels,dateLabel} from './posture';
export default function PersonalPostureComparison({comparison}:{comparison:any}) {
  const [view,setView]=useState<View>('front'),[overlay,setOverlay]=useState(false),[opacity,setOpacity]=useState(50);
  const current=readPosture(comparison.current_assessment.posture_json),baseline=readPosture(comparison.previous_assessment.posture_json);
  const history=comparison.posture_history||[];
  const same=comparison.current_assessment.id===comparison.previous_assessment.id;
  const observations=(current?.observations||[]).filter(o=>o.reviewed&&o.text.trim());
  const initial=(baseline?.observations||[]).filter(o=>o.reviewed&&o.text.trim());
  const picture=(photos:any[],posture:typeof current)=>{const p=photos.find(p=>p.photo_type===view);const data=posture?.views[view];return <PosturePhotoCanvas photo={{view,fileId:p?.file_id||'',url:p?.photo_url}} strokes={data?.fileId===p?.file_id?data?.strokes||[]:[]} guides={data?.fileId===p?.file_id&&data?.guides} />;};
  const max=Math.max(1,...history.map((h:any)=>h.count));
  return <section aria-label="Evolução postural" className="space-y-4">
    <div className="bg-indigo-50 rounded-xl p-3 text-xs text-indigo-900"><strong>Referência: primeira avaliação postural — {dateLabel(comparison.previous_assessment.assessment_date)}</strong><p>Atual: {dateLabel(comparison.current_assessment.assessment_date)}. {same?'Esta é a avaliação inicial.':!current?'A avaliação selecionada ainda não contém análise postural.':'Evolução classificada pelo profissional em relação à referência.'}</p></div>
    <div className="flex flex-wrap items-center gap-2">{views.map(([id,label])=><button type="button" key={id} onClick={()=>setView(id)} className={`text-xs px-3 py-2 rounded-lg border ${id===view?'bg-indigo-600 text-white':'bg-white'}`}>{label}</button>)}<label className="text-xs ml-2"><input type="checkbox" checked={overlay} onChange={e=>setOverlay(e.target.checked)} /> Sobreposição</label></div>
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_300px] gap-4">
      <div className="min-w-0">
        {overlay?<><label className="block text-xs mb-3">Transparência da avaliação atual: {opacity}%<input aria-label="Transparência da avaliação atual" type="range" min={0} max={100} value={opacity} onChange={e=>setOpacity(Number(e.target.value))} className="w-full" /></label><div className="relative max-w-md mx-auto">{picture(comparison.previous_photos,baseline)}<div className="absolute inset-0" style={{opacity:opacity/100}}>{picture(comparison.current_photos,current)}</div></div><p className="text-xs text-slate-500 mt-2">Sobreposição visual sem alinhamento automático. Use fotos com posição, distância e enquadramento semelhantes.</p></>:<div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><div><h4 className="text-xs font-bold mb-2">Inicial • {dateLabel(comparison.previous_assessment.assessment_date)}</h4>{picture(comparison.previous_photos,baseline)}</div><div><h4 className="text-xs font-bold mb-2">Selecionada • {dateLabel(comparison.current_assessment.assessment_date)}</h4>{picture(comparison.current_photos,current)}</div></div>}
      </div>
      <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-4 min-w-0">
        <h3 className="font-bold text-sm text-slate-800">Evolução postural</h3>
        <p className="text-xs text-slate-500">{new Set(observations.map(o=>o.region)).size} / 9 regiões registradas • {observations.length} observações revisadas</p>
        <div className="grid grid-cols-3 gap-1">{(['improved','stable','worse'] as const).map(status=><div key={status} className={`rounded-lg p-2 text-center ${status==='improved'?'bg-emerald-50':status==='worse'?'bg-rose-50':'bg-slate-50'}`}><strong className="block text-lg">{same?'—':observations.filter(o=>o.evolution===status).length}</strong><span className="text-[10px]">{evolutionLabels[status]}</span></div>)}</div>
        <p className="text-[10px] text-slate-500">Contagem de observações, não de diagnósticos. Pendências de IA não entram nas estatísticas. Ausência de observação não significa melhora.</p>
        <table className="w-full text-[11px]"><thead><tr className="text-left text-slate-500"><th>Região</th><th>Inicial</th><th>Atual</th></tr></thead><tbody>{regions.map(([id,label])=><tr key={id} className="border-t"><td className="py-1.5">{label}</td><td>{initial.filter(o=>o.region===id).length}</td><td>{observations.filter(o=>o.region===id).length}</td></tr>)}</tbody></table>
        <div className="space-y-2 max-h-64 overflow-y-auto"><h4 className="text-xs font-semibold">Alterações e observações</h4>{observations.length===0&&<p className="text-xs text-slate-500">Nenhuma observação revisada nesta avaliação.</p>}{observations.map(o=><div key={o.id} className="border-l-2 border-indigo-200 pl-2 text-xs"><strong>{regions.find(r=>r[0]===o.region)?.[1]}</strong><span className="text-slate-400"> • {views.find(v=>v[0]===o.view)?.[1]}</span><p className="whitespace-pre-wrap break-words">{o.text}</p><small>{same?'Referência inicial':evolutionLabels[o.evolution]}</small></div>)}</div>
        <div className="space-y-2 max-h-60 overflow-y-auto"><h4 className="text-xs font-semibold">Histórico por data</h4><p className="text-[10px] text-slate-500">Barras: quantidade de observações revisadas.</p>{history.map((h:any,i:number)=><div key={h.id} className="text-[10px]"><div className="flex justify-between"><span>{dateLabel(h.assessment_date)} {i===0?'• inicial':''}</span><span>{h.count}</span></div><div className="h-1.5 bg-slate-100 rounded overflow-hidden"><div className="h-full bg-indigo-400" style={{width:`${h.count/max*100}%`}} /></div>{i>0&&<p>Melhorou {h.evolution.improved} · Manteve {h.evolution.stable} · Piorou {h.evolution.worse}</p>}{h.pending>0&&<p>{h.pending} sugestões pendentes</p>}</div>)}</div>
      </aside>
    </div>
  </section>;
}
