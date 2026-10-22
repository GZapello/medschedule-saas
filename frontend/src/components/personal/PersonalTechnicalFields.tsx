import { ResponsiveTable } from '../common/ResponsiveTable';
import {PersonalAssessmentIndicator} from './PersonalAssessmentIndicator';
import React from 'react';
export const foldLabels: Record<string,string> = {triceps:'Tríceps',subscapular:'Subescapular',biceps:'Bíceps',chest:'Peitoral',axillary:'Axilar média',suprailiac:'Suprailíaca',iliac_crest:'Crista ilíaca',supraspinale:'Supraespinale',abdominal:'Abdominal',thigh:'Coxa',calf:'Panturrilha'};
export const AnthropometricSexField = ({value,onChange}: {value:string,onChange:(v:string)=>void}) => <div>
  <label className="block text-xs font-medium text-slate-700 mb-1.5">Gênero</label>
  <select className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs bg-white text-slate-800" value={value} onChange={e=>onChange(e.target.value)}>
    <option value="">Não informado</option><option value="male">Homem</option><option value="female">Mulher</option><option value="not_informed">Prefere não informar</option>
  </select>
</div>;
export function PersonalTechnicalFields({value,onChange,tab,preview,allowedCapabilities}: {value:any,onChange:(v:any)=>void,tab:string,preview:any,allowedCapabilities?:string[]}) {
  const can=(cap:string)=>allowedCapabilities===undefined || allowedCapabilities.includes(cap);
  if(tab==='cardio_tests' && !can('BODY_COMPOSITION'))return null;
  const change=(k:string,v:any)=>onChange({...value,[k]:v});
  const input=(key:string,label:string,type='number')=><div key={key}><label className="block text-xs font-medium text-slate-700 mb-1.5">{label}</label><input type={type} min={type==='number'?0:undefined} step="any" value={value[key] ?? ''} onChange={e=>change(key,type==='number'?(e.target.value===''?null:Number(e.target.value)):e.target.value)} className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl outline-none font-medium text-slate-800" /></div>;
  return <div className="bg-slate-50/80 rounded-2xl border border-slate-200 p-4 space-y-4 mt-4">
    {tab==='skinfolds' && <>
      <div className="grid grid-cols-2 gap-3">{input('fold_iliac_crest','Crista ilíaca (mm)')}{input('fold_supraspinale','Supraespinale (mm)')}</div>
      <label className="flex items-center gap-2 text-xs font-semibold text-slate-700"><input type="checkbox" checked={!!value.technical_mode} onChange={e=>change('technical_mode',e.target.checked)} />Modo técnico / dupla aferição</label>
      {value.technical_mode && <div className="overflow-x-auto mobile-table-container"><ResponsiveTable className="w-full text-xs"><thead><tr><th className="text-left font-semibold text-slate-700">Dobra</th><th className="font-semibold text-slate-700">Medida 1</th><th className="font-semibold text-slate-700">Medida 2</th><th className="font-semibold text-slate-700">Medida 3</th><th className="font-semibold text-slate-700">Final (mm)</th></tr></thead><tbody>{Object.entries(foldLabels).map(([key,label])=>{
        const site='fold_'+key, raw=value.skinfold_measurements?.[site] || ['', '', ''], q=preview?.quality?.[site];
        return <tr key={key}><td className="py-2 font-medium text-slate-800">{label}</td>{[0,1,2].map(i=><td key={i}><input aria-label={`${label} medida ${i+1}`} type="number" min="0" step="0.1" value={raw[i] ?? ''} onChange={e=>{const next=[...raw];next[i]=e.target.value===''?null:Number(e.target.value);change('skinfold_measurements',{...value.skinfold_measurements,[site]:next});}} className="w-20 px-2 py-1 border border-slate-200 rounded-lg text-slate-800 font-medium" /></td>)}<td className="font-semibold text-slate-800">{q?.final ?? '—'}{q?.needsThird && <span className="block text-amber-700">Diferença &gt;5%: realizar 3ª medida</span>}</td></tr>;
      })}</tbody></ResponsiveTable></div>}
      <div className="grid grid-cols-2 gap-3">{input('humerus_breadth_cm','Largura do úmero (cm)')}{input('femur_breadth_cm','Largura do fêmur (cm)')}</div>
    </>}
    {tab==='cardio_tests' && <><h4 className="text-sm font-bold text-slate-800 mb-2">Dados bioquímicos opcionais</h4><div className="grid grid-cols-2 gap-3">{input('glucose_mg_dl','Glicose (mg/dL)')}{input('triglycerides_mg_dl','Triglicerídeos (mg/dL)')}{input('ldl_mg_dl','LDL-C (mg/dL)')}{input('hdl_mg_dl','HDL-C (mg/dL)')}{input('biochemical_exam_date','Data do exame','date')}{input('biochemical_source','Origem do resultado','text')}</div><PersonalAssessmentIndicator item={preview?.classifications?.vai}/></>}
    {tab==='composition' && <>
      <label className="block text-xs font-medium text-slate-700 mb-1.5">Origem da massa muscular</label><select value={value.muscle_mass_method || 'manual'} onChange={e=>change('muscle_mass_method',e.target.value)} className="border border-slate-200 rounded-xl px-3 py-2 text-xs bg-white text-slate-800"><option value="manual">Manual documentada</option><option value="bioimpedance">Bioimpedância</option><option value="dxa">DXA</option><option value="other">Outro método</option></select>{input('muscle_mass_notes','Documentação / equipamento','text')}<p className="text-xs text-slate-600 mt-1">TMB: {preview?.values?.bmr_kcal ?? 'Não calculado'} kcal/dia · {preview?.values?.bmr_method || 'Mifflin-St Jeor'}</p></>}
    {preview?.unavailable?.length>0 && <details className="text-xs text-slate-600"><summary className="cursor-pointer font-medium hover:text-slate-800">Métricas não calculadas e dados necessários</summary><ul className="mt-1 space-y-0.5">{preview.unavailable.filter((u:any)=>u.metric!=='tav_estimated_value').map((u:any)=><li key={u.metric}>• {u.metric}: Não calculado — {u.reason}</li>)}</ul></details>}
  </div>;
}
