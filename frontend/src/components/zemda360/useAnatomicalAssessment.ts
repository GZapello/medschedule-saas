import { useEffect, useRef, useState } from 'react';
import { ApiClient } from '../../api/client';
import { AnatomicalDocument, AnatomicalLayer, AnatomicalView, MapType, SexVariant, emptyLayer, layerKey, readAnatomicalDocument, serializeAnatomicalDocument } from './anatomicalDocument';

export function useAnatomicalAssessment(options: {patientId:string;initialAssessmentId?:string;appointmentId?:string;professionalId?:string;module:string;initialBodyModel:SexVariant;initialMapType?:MapType;readOnly:boolean;notify:(message:string,type:any)=>void}) {
  const initial=()=>readAnatomicalDocument({},options.initialBodyModel,options.initialMapType);
  const [document,setDocument]=useState<AnatomicalDocument>(initial);
  const docRef=useRef(document), idRef=useRef(options.initialAssessmentId);
  const [loading,setLoading]=useState(true),[loadError,setLoadError]=useState(false);
  const [savingStatus,setStatus]=useState<'idle'|'saving'|'saved'|'error'>('idle');
  const timer=useRef<ReturnType<typeof setTimeout> | null>(null);
  const queue=useRef<Promise<void>>(Promise.resolve());
  const epoch=useRef(0),ready=useRef(false),dirty=useRef(false);
  const optionsRef=useRef(options);optionsRef.current=options;
  useEffect(()=>{
    const version=++epoch.current;
    ready.current=false;dirty.current=false;idRef.current=options.initialAssessmentId;
    setLoading(true);setLoadError(false);setStatus('idle');
    (async()=>{
      try{
        const data=options.initialAssessmentId ? await ApiClient.get<any>(`/v1/body-assessments/${options.initialAssessmentId}`) : options.appointmentId ? await ApiClient.get<any>(`/v1/body-assessments/appointment/${options.appointmentId}`) : {};
        if(version!==epoch.current)return;
        if(data.assessment?.patient_id && data.assessment.patient_id!==options.patientId)throw Error('A avaliação pertence a outro paciente.');
        idRef.current=data.assessment?.id || options.initialAssessmentId;
        const loaded=readAnatomicalDocument(data,options.initialBodyModel,options.initialMapType);
        docRef.current=loaded;setDocument(loaded);ready.current=true;
      }catch{if(version===epoch.current){setLoadError(true);options.notify('Não foi possível carregar o mapa. Reabra para tentar novamente.','error');}}
      finally{if(version===epoch.current)setLoading(false);}
    })();
    return ()=>{if(timer.current)clearTimeout(timer.current);epoch.current++;};
  },[options.patientId,options.initialAssessmentId,options.appointmentId]);

  const save=(manual=false)=>{
    if(options.readOnly)return Promise.resolve(true);
    if(!ready.current)return Promise.resolve(!dirty.current);
    if(!dirty.current && !manual)return Promise.resolve(true);
    if(timer.current)clearTimeout(timer.current);
    const snapshot=docRef.current,version=epoch.current,context={...options};
    setStatus('saving');
    const run=async()=>{
      if(version!==epoch.current)return false;
      try{
        const active=snapshot.layers[snapshot.activeLayerKey];
        const result=await ApiClient.post<any>('/v1/body-assessments',{
          id:idRef.current,patientId:context.patientId,appointmentId:context.appointmentId || null,
          professionalId:context.professionalId || null,module:context.module,bodyModel:(snapshot.layers[layerKey('BODY',active.sexVariant,'all')] || Object.values(snapshot.layers).find(l=>l.mapType==='BODY'))?.sexVariant || active.sexVariant,
          notes:serializeAnatomicalDocument(snapshot),assessmentDate:new Date().toISOString().slice(0,10)
        });
        if(version!==epoch.current)return false;
        idRef.current=result.assessmentId;
        if(docRef.current===snapshot){dirty.current=false;setStatus('saved');}
        if(manual)context.notify('Mapeamento e marcações salvos com sucesso!','success');
        return true;
      }catch{if(version===epoch.current){setStatus('error');context.notify('Falha ao salvar. As alterações continuam na tela; tente Salvar avaliação novamente.','error');}return false;}
    };
    const result=queue.current.then(run,run);
    queue.current=result.then(()=>{});
    return result;
  };
  const saveRef=useRef(save);saveRef.current=save;
  const commit=(next:AnatomicalDocument,persist=true)=>{
    docRef.current=next;setDocument(next);
    if(persist && !options.readOnly && ready.current){
      dirty.current=true;setStatus('idle');
      if(timer.current)clearTimeout(timer.current);
      timer.current=setTimeout(()=>saveRef.current(),600);
    }
  };
  const update=(patch:Partial<AnatomicalLayer>)=>{
    if(options.readOnly || !ready.current)return;
    const current=docRef.current,key=current.activeLayerKey;
    commit({...current,layers:{...current.layers,[key]:{...current.layers[key],...patch}}});
  };
  const navigate=(type:MapType,sex:SexVariant,view:AnatomicalView)=>{
    const current=docRef.current,key=layerKey(type,sex,view);
    const layer=current.layers[key] || emptyLayer(type,sex,view);
    commit({...current,mapType:type,activeLayerKey:key,layers:{...current.layers,[key]:{...layer,view}}},!options.readOnly);
  };
  useEffect(()=>{
    const warn=(event:BeforeUnloadEvent)=>{if(dirty.current){event.preventDefault();event.returnValue='';}};
    window.addEventListener('beforeunload',warn);
    return ()=>window.removeEventListener('beforeunload',warn);
  },[]);
  return {document,layer:document.layers[document.activeLayerKey],update,navigate,save,loading,loadError,savingStatus,idRef,dirty};
}
