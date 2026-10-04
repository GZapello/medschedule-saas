import React,{useEffect,useState} from 'react';
import { ApiClient } from '../../api/client';
import './consents.css';

export function ConsentPendingAlert({patientId,serviceId,onOpen}:{patientId:string;serviceId?:string;onOpen:()=>void}) {
  const [count,setCount]=useState(0);
  useEffect(()=>{
    let live=true;
    const load=()=>ApiClient.get<any>(`/v1/consents/patients/${patientId}/pending${serviceId?`?serviceId=${encodeURIComponent(serviceId)}`:''}`).then(r=>{if(live)setCount(r.count);}).catch(()=>{if(live)setCount(0);});
    const changed=(e:Event)=>{if((e as CustomEvent).detail?.patientId===patientId)void load();};
    void load();window.addEventListener('zemda-consents-changed',changed);window.addEventListener('focus',load);
    return()=>{live=false;window.removeEventListener('zemda-consents-changed',changed);window.removeEventListener('focus',load);};
  },[patientId,serviceId]);
  if(!count)return null;
  return <div role="status" className="m-3 sm:m-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"><p>⚠ Paciente possui termo obrigatório pendente. <span className="text-xs">({count})</span></p><button type="button" onClick={onOpen} className="consent-secondary">Abrir termos</button></div>;
}
