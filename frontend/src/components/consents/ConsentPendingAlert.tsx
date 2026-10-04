import React,{useEffect,useState} from 'react';
import { ApiClient } from '../../api/client';
import './consents.css';

export function ConsentPendingAlert({patientId,serviceId,onOpen,compact=false}:{patientId:string;serviceId?:string;onOpen:()=>void;compact?:boolean}) {
  const [count,setCount]=useState<number|null>(null);
  useEffect(()=>{
    let live=true;
    const load=()=>ApiClient.get<any>(`/v1/consents/patients/${patientId}/pending${serviceId?`?serviceId=${encodeURIComponent(serviceId)}`:''}`).then(r=>{if(live)setCount(r.count);}).catch(()=>{if(live)setCount(null);});
    const changed=(e:Event)=>{if((e as CustomEvent).detail?.patientId===patientId)void load();};
    void load();window.addEventListener('zemda-consents-changed',changed);window.addEventListener('focus',load);
    return()=>{live=false;window.removeEventListener('zemda-consents-changed',changed);window.removeEventListener('focus',load);};
  },[patientId,serviceId]);
  if(compact)return count===null?null:<button type="button" onClick={onOpen} className={`text-xs px-2 py-1 rounded-lg ${count?'text-amber-700 bg-amber-50':'text-teal-700 bg-teal-50'}`}>{count?'⚠ Termo pendente':'✓ Termos OK'}</button>;
  if(!count)return null;
  return <div role="status" className="m-3 sm:m-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"><p>⚠ Paciente possui termo obrigatório pendente. <span className="text-xs">({count})</span></p><button type="button" onClick={onOpen} className="consent-secondary">Abrir termos</button></div>;
}
