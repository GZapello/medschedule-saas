import React, {useEffect,useState} from 'react';
import {ApiClient} from '../../api/client';

const labels: Record<string,string> = {
  anamnesis:'Anamnese',assessments:'Avaliações',assessment_date:'Data da avaliação',session_date:'Data da sessão',created_at:'Registrado em',updated_at:'Atualizado em',
  notes:'Observações',data:'Dados clínicos',content:'Conteúdo',chief_complaint:'Queixa principal',clinical_evolution:'Evolução clínica',conduct_plan:'Conduta',
  title:'Título',status:'Situação',weight:'Peso',height:'Altura',bmi:'IMC',goals:'Objetivos',sessions:'Sessões',profiles:'Perfil assistencial',
  treatment_plans:'Plano terapêutico',evolutions:'Evoluções',exams:'Exames',medications:'Medicamentos',allergies:'Alergias',
  clinical_certificates:'Atestado clínico',clinical_prescriptions:'Prescrição clínica',clinical_exam_requests:'Solicitação de exames',medical_consultations:'Consulta médica',
};
function label(key:string) { const cleaned=key.replace(/_json$/,''); return labels[cleaned] || cleaned.replace(/_/g,' '); }
function Values({value}:{value:any}) {
  if(value===null||value===undefined||value==='')return null;
  if(Array.isArray(value))return <ul className="space-y-2 list-disc pl-4">{value.map((v,i)=><li key={i}><Values value={v}/></li>)}</ul>;
  if(typeof value==='object')return <dl className="space-y-2">{Object.entries(value).filter(([,v])=>v!==null&&v!=='').map(([k,v])=><div key={k}><dt className="font-medium capitalize">{label(k)}</dt><dd className="whitespace-pre-wrap break-words"><Values value={v}/></dd></div>)}</dl>;
  return <>{typeof value==='boolean'?(value?'Sim':'Não'):String(value)}</>;
}
export function SharedClinicalHistory({patientId}:{patientId:string}) {
  const [data,setData]=useState<{history:any[];files:any[]}>({history:[],files:[]});
  const [error,setError]=useState('');
  const [busy,setBusy]=useState('');
  useEffect(()=>{let active=true;setData({history:[],files:[]});setError('');
    ApiClient.get<any>('/v1/shared-history/patient/'+encodeURIComponent(patientId)).then(d=>{if(active)setData(d);}).catch(e=>{if(active)setError(e.message);});
    return()=>{active=false};
  },[patientId]);
  const download=async(id:string)=>{setBusy(id);setError('');try{
    const result=await ApiClient.get<any>('/v1/shared-history/files/'+encodeURIComponent(id));
    const bytes=Uint8Array.from(atob(result.base64),(c:string)=>c.charCodeAt(0));
    const url=URL.createObjectURL(new Blob([bytes],{type:result.mimeType}));
    const link=document.createElement('a');link.href=url;link.download=result.name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(e:any){setError(e.message);}finally{setBusy('');}};
  if(!data.history.length&&!data.files.length&&!error)return null;
  return <section className="rounded-2xl border border-teal-100 bg-white p-4 sm:p-6 space-y-4 my-6">
    <h2 className="text-lg font-bold text-slate-800">Histórico compartilhado por outras clínicas</h2>
    <p className="text-sm text-slate-600">Consulta conforme o escopo autorizado. Cada registro permanece na clínica que o produziu.</p>
    {error&&<p role="alert" className="text-red-700">{error}</p>}
    {data.history.map(item=><details key={item.type+item.id} className="rounded-xl border p-3">
      <summary className="cursor-pointer min-h-12 break-words"><strong>{item.module==='general'?'Geral':item.module}</strong> · {label(item.type.replace(/^(fono|to|nutrition|physiotherapy|dental|psychology|psychopedagogy|personal|estetic|body|patient)_/,''))}<span className="block text-sm text-slate-500">Origem: {item.originName} · {item.date}</span></summary>
      <div className="mt-3 text-sm text-slate-700"><Values value={item.data}/></div>
    </details>)}
    {data.files.map(file=><div key={file.id} className="border rounded-xl p-3 flex flex-wrap items-center justify-between gap-3"><span className="min-w-0 break-words">{file.name}<small className="block">Origem: {file.originName}</small></span><button disabled={!!busy} className="min-h-12 px-4 rounded-xl bg-teal-700 text-white disabled:opacity-50" onClick={()=>download(file.id)}>{busy===file.id?'Carregando…':'Baixar arquivo'}</button></div>)}
  </section>;
}
