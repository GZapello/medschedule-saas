import React, { useEffect, useState, useRef, useMemo } from 'react';
import { ApiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { ClinicalAssessmentEditor, ClinicalAssessmentComparison, ClinicalAssessmentReport, ReportTrend, evolutionMetrics, visceralEvolutionSeries } from './index';
import { fieldCapability, assessmentCapabilities } from './policy';

/** One patient history, editor, comparison, graphs and printable report for every workspace. */
export function ClinicalAssessmentsPanel({patientId,patient,appointmentId,sourceModule}: {patientId:string,patient:any,appointmentId?:string,sourceModule:string}) {
  const { capabilities, currentUser, currentTenant } = useAuth();
  const [caps,setCaps]=useState<string[]>([]);
  const [history,setHistory]=useState<any[]>([]);
  const [error,setError]=useState('');
  const [editor,setEditor]=useState<any>(undefined);
  const [comparing,setComparing]=useState(false);
  const [report,setReport]=useState<any>(null);
  const [showGraphs,setShowGraphs]=useState(false);
  const [busy,setBusy]=useState(false);
  const version=useRef(0);
  useEffect(()=>{
    let active=true;
    setCaps([]);
    ApiClient.get<any>('/v1/capabilities/my-resources').then(data=>{if(active)setCaps(data.activeCapabilities || []);}).catch(()=>{});
    return ()=>{active=false;};
  },[currentUser?.id,currentTenant?.id,capabilities.join(',')]);
  const capKey=caps.join(',');
  const enabled=caps.some(cap=>assessmentCapabilities.includes(cap));
  const load=async()=>{
    const request=++version.current;
    setError('');setBusy(true);
    try {
      const data=await ApiClient.get<any>(`/v1/clinical-assessments/patients/${patientId}/evolution`);
      if(request===version.current)setHistory(data.history || []);
    } catch {if(request===version.current){setHistory([]);setError('Não foi possível acessar as avaliações deste paciente.');}}
    finally {if(request===version.current)setBusy(false);}
  };
  useEffect(()=>{
    version.current++;setHistory([]);setEditor(undefined);setComparing(false);setReport(null);setError('');
    if(patientId && enabled)void load();
    return ()=>{version.current++;};
  },[patientId,capKey]);
  const subject=useMemo(()=>({...patient,id:patientId,name:patient?.full_name || patient?.name || 'Paciente'}),[patient,patientId]);
  if(!patientId || !enabled)return null;
  const open=async(id:string,kind:'edit'|'report')=>{
    const request=version.current;setBusy(true);setError('');
    try {
      const data=await ApiClient.get<any>(`/v1/clinical-assessments/${id}${kind==='report'?'/report-data':''}`);
      if(request!==version.current)return;
      if(kind==='report')setReport(data);else setEditor({...data.assessment,photos:data.photos});
    }catch {if(request===version.current)setError('Não foi possível carregar esta avaliação.');}
    finally {if(request===version.current)setBusy(false);}
  };
  return <section className="m-4 p-4 rounded-2xl border border-slate-200 bg-white" aria-label="Avaliações clínicas compartilhadas">
    <div className="flex flex-wrap items-center gap-3"><h3 className="font-semibold mr-auto">Avaliações</h3>
      <button type="button" disabled={busy || !!error} onClick={()=>setEditor(null)} className="px-3 py-2 rounded-xl bg-teal-600 text-white text-sm">Nova avaliação</button>
      {history.length>1 && <button type="button" onClick={()=>setComparing(true)} className="text-sm text-teal-700">Comparar avaliações</button>}
      {history.length>0 && <button type="button" onClick={()=>setShowGraphs(!showGraphs)} className="text-sm text-teal-700">Gráficos de evolução</button>}
    </div>
    {error && <p role="alert" className="text-sm text-red-700 my-3">{error} <button type="button" onClick={()=>void load()}>Tentar novamente</button></p>}
    {busy && <p className="text-sm text-slate-500">Carregando avaliações…</p>}
    {!busy && !error && !history.length && <p className="text-sm text-slate-500 mt-3">Nenhuma avaliação registrada.</p>}
    <div className="space-y-2 mt-3">{[...history].reverse().map(row=><div key={row.id} className="flex gap-4 items-center border-t pt-2 text-sm">
      <span className="mr-auto">{row.assessment_date} · {row.source_module || sourceModule}</span>
      <button type="button" disabled={busy} onClick={()=>void open(row.id,'edit')}>Visualizar / editar</button>
      <button type="button" disabled={busy} onClick={()=>void open(row.id,'report')}>Relatório / PDF</button>
    </div>)}</div>
    {showGraphs && <div className="grid md:grid-cols-2 gap-3 mt-4">
      {evolutionMetrics.filter(([key])=>caps.includes(fieldCapability(key) || '') && history.some(row=>row[key]!=null)).map(([key,label,unit])=><ReportTrend key={key} history={history} metric={key} title={label} unit={unit}/>)}
      {caps.includes('BODY_COMPOSITION') && visceralEvolutionSeries(history).map(group=><ReportTrend key={group.key} history={group.history} metric={group.metric} title={group.title} unit={group.unit}/>)}
    </div>}
    {editor!==undefined && <ClinicalAssessmentEditor key={patientId+':'+(editor?.id || 'new')} isOpen patientId={patientId} student={subject} appointmentId={appointmentId} sourceModule={sourceModule} allowedCapabilities={caps} assessmentToEdit={editor} onClose={()=>setEditor(undefined)} onSaved={()=>{setEditor(undefined);void load();}}/>}
    {comparing && <ClinicalAssessmentComparison isOpen student={subject} assessmentsList={history} allowedCapabilities={caps} onClose={()=>setComparing(false)}/>}
    {report && <div className="fixed inset-0 z-50 bg-white overflow-y-auto p-6 clinical-assessment-print-root">
      <style>{`@media print { body * { visibility:hidden; } .clinical-assessment-print-root,.clinical-assessment-print-root * { visibility:visible; } .clinical-assessment-print-root { position:absolute; inset:0; overflow:visible; } .clinical-assessment-print-actions { display:none; } }`}</style>
      <div className="clinical-assessment-print-actions flex gap-4 mb-4"><button type="button" onClick={()=>window.print()}>Imprimir / Salvar PDF</button><button type="button" onClick={()=>setReport(null)}>Fechar</button></div>
      <ClinicalAssessmentReport data={report} clinic={report.clinic} allowedCapabilities={caps}/>
      <ClinicalAssessmentReport data={report} clinic={report.clinic} allowedCapabilities={caps} evolution/>
    </div>}
  </section>;
}
