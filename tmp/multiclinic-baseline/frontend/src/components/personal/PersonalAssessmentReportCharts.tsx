import React from 'react';
export const reportNumber=(v:any,digits=2):string=>v===null || v===undefined || v==='' || !Number.isFinite(Number(v)) ? '—' : Number(v).toLocaleString('pt-BR',{maximumFractionDigits:digits});
export const evolutionMetrics: [string,string,string][]=[['weight','Peso','kg'],['body_fat_percentage','Gordura','%'],['fat_mass_kg','Massa adiposa','kg'],['lean_mass_kg','Massa livre de gordura','kg'],['muscle_mass_kg','Massa muscular','kg'],['waist_cm','Cintura','cm'],['abdomen_cm','Abdômen','cm'],['hip_cm','Quadril','cm'],['whr','RCQ',''],['whtr','RCE',''],['vai_value','VAI (adimensional)',''],['skinfold_sum','Somatório de dobras','mm']];
// Series remain separate by origin, protocol, unit and measurement method.
export function visceralSeriesKey(a:any,kind:'measured'|'predicted') {
  const parts=kind==='predicted' ? [a.tav_estimation_protocol,a.tav_estimated_unit] : [a.tav_measured_method || a.tav_method,a.tav_measured_equipment || a.tav_equipment,a.tav_protocol_id,a.tav_measured_unit || a.tav_unit];
  const unit=parts[parts.length-1];
  return JSON.stringify([kind,...parts.map(v=>v || null),!unit || kind==='predicted' && !parts[0] ? a.id : null]);
}
export function visceralEvolutionSeries(history:any[]) {
  const groups=new Map<string,{key:string,metric:string,title:string,unit:string,indicator:string,history:any[]}>();
  for(const kind of ['predicted','measured'] as const) for(const a of history) {
    const metric=kind==='predicted'?'tav_estimated_value':'tav_value';
    if(a[metric]==null || !Number.isFinite(Number(a[metric])))continue;
    const key=visceralSeriesKey(a,kind);
    if(groups.has(key))continue;
    const isLevel = kind==='measured' && (a.tav_unit==='nível' || a.tav_measured_unit==='nível');
    const title=kind==='predicted'
      ? 'Área visceral estimada (eVAT — Bonora)'
      : (isLevel ? 'Nível visceral (BIA)' : 'Área visceral medida')+' · '+(a.tav_method || a.tav_measured_method || 'Método não informado')+' · '+(a.tav_equipment || a.tav_measured_equipment || 'Equipamento não informado');
    groups.set(key,{key,metric,title,unit:(kind==='predicted'?(a.tav_estimated_unit || 'cm²'):a.tav_unit) || 'Unidade não informada',indicator:kind==='predicted'?'predictedTav':'tav',history:history.map(r=>({...r,[metric]:visceralSeriesKey(r,kind)===key?r[metric]:null}))});
  }
  return [...groups.values()];
}
export function ReportTrend({history,metric,title,unit}: {history:any[],metric:string,title:string,unit:string}) {
  const rows=history.map((a,i)=>({a,i,v:a[metric]})).filter(p=>p.v!==null && p.v!==undefined && p.v!=='' && Number.isFinite(Number(p.v)));
  if(!rows.length)return null;
  const vals=rows.map(p=>Number(p.v)), min=Math.min(...vals),max=Math.max(...vals),span=max-min || Math.max(max*.1,1);
  const coords=rows.map(p=>({x:40+(history.length>1?p.i/(history.length-1):.5)*300,y:115-(Number(p.v)-min)/span*75,p}));
  return <div className="border border-slate-200 rounded-xl p-3 break-inside-avoid"><h4 className="text-xs font-semibold text-slate-700">{title} ({unit || 'índice'})</h4><svg role="img" aria-label={`Evolução de ${title}`} viewBox="0 0 390 165" className="w-full"><path d="M40 25 V125 H355" fill="none" stroke="#cbd5e1"/><polyline fill="none" stroke="#0d9488" strokeWidth="2" points={coords.map(c=>`${c.x},${c.y}`).join(' ')}/>{coords.map(c=><g key={c.p.a.id}><circle cx={c.x} cy={c.y} r="3" fill="#0d9488"/><text x={c.x} y={c.y-7} textAnchor="middle" fontSize="10" fill="#334155">{reportNumber(c.p.v)}</text><text x={c.x} y="145" textAnchor="middle" fontSize="8" fill="#64748b">{String(c.p.a.assessment_date).slice(0,10)}</text></g>)}</svg></div>;
}
export function Somatochart({a}: {a:any}) {
  if(a.somatochart_x==null || a.somatochart_y==null)return null;
  const x=Number(a.somatochart_x),y=Number(a.somatochart_y),extent=Math.max(10,Math.abs(x)+2,Math.abs(y)+2),scale=100/extent;
  return <svg role="img" aria-label="Somatocarta Heath-Carter" viewBox="0 0 300 270" className="w-72 max-w-full mx-auto"><path d="M30 140 H270 M150 20 V250 M45 220 L150 35 L255 220 Z" stroke="#cbd5e1" fill="none"/><text x="150" y="18" textAnchor="middle" fontSize="10" fill="#64748b">Mesomorfia</text><text x="8" y="245" fontSize="10" fill="#64748b">Endomorfia</text><text x="225" y="245" fontSize="10" fill="#64748b">Ectomorfia</text><circle cx={150+x*scale} cy={140-y*scale} r="5" fill="#0d9488"/><text x="150" y="263" textAnchor="middle" fontSize="10">X: {reportNumber(x)} · Y: {reportNumber(y)}</text></svg>;
}
