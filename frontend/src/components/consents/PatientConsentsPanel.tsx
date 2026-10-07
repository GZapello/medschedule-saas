import { createPortal } from 'react-dom';
import React,{useEffect,useState} from 'react';
import { ApiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { FileText,Plus,Copy,ShieldCheck,ExternalLink,Download } from 'lucide-react';
import { consentDate,downloadConsentPdf } from './consent-api';
import './consents.css';
import { PublicConsentPage } from './PublicConsentPage';
import { UniversalWhatsAppModal } from '../common/UniversalWhatsAppModal';
import { WhatsAppIcon } from '../common/WhatsAppReminderModal';
import { buildConsentWhatsAppMessage, isValidPhoneNumber } from '../../utils/phone.utils';

const emptyTemplate={title:'',content:'',module:'general',professionId:'',serviceId:'',procedureName:'',required:false};
const emptyGuardian={name:'',cpf:'',relationship:'',phone:'',email:''};
export function PatientConsentsPanel({patientId,patient,guardians=[]}:{patientId:string;patient?:any;guardians?:any[]}) {
  const {currentUser, currentTenant}=useAuth(),{showToast}=useToast();
  const [view,setView]=useState<'documents'|'library'>('documents');
  const [rows,setRows]=useState<any[]>([]),[templates,setTemplates]=useState<any[]>([]),[services,setServices]=useState<any[]>([]);
  const [settings,setSettings]=useState({auth_level:'recommended',link_hours:168,photo_requested:0,profession_id:'',profession_name:''}),[loading,setLoading]=useState(true),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [moduleFilter,setModuleFilter]=useState(''),[editor,setEditor]=useState<typeof emptyTemplate|null>(null),[editingId,setEditingId]=useState<string|null>(null);
  const [requesting,setRequesting]=useState(false),[selectedTemplate,setSelectedTemplate]=useState(''),[guardian,setGuardian]=useState(emptyGuardian),[useGuardian,setUseGuardian]=useState(false);
  const [mode,setMode]=useState('device'),[channel]=useState('email'),[link,setLink]=useState<any>(null);
  const [activeToken,setActiveToken]=useState<string|null>(null);
  const [photoRequested,setPhotoRequested]=useState(false),[evidence,setEvidence]=useState<any>(null);
  const [signerEmail,setSignerEmail]=useState(''),[addingEmail,setAddingEmail]=useState(false);
  const [cancelId,setCancelId]=useState<string|null>(null),[reason,setReason]=useState(''),[legacy,setLegacy]=useState<any>(null);
  const [whatsappData, setWhatsappData] = useState<{ isOpen: boolean; recipientName: string; phone?: string; templateTitle: string; expiresAt?: string; defaultMessage: string } | null>(null);
  const notify=()=>window.dispatchEvent(new CustomEvent('zemda-consents-changed',{detail:{patientId}}));
  const openWhatsAppModal = (linkData: any, templateId?: string, row?: any) => {
    const tmpl = templates.find(t => t.id === templateId) || preview || (row ? { title: row.title } : null);
    const isGuard = useGuardian || Boolean(row?.signer?.kind === 'guardian');
    const recipient = isGuard
      ? (guardian.name || row?.signer?.name || 'Responsável legal')
      : (patient?.full_name || patient?.name || 'Paciente');
    const targetPhone = isGuard
      ? (guardian.phone || row?.signer?.phone)
      : (patient?.whatsapp || patient?.phone);
    const clinic = currentTenant?.trade_name || currentTenant?.name || 'Clínica';

    const msg = buildConsentWhatsAppMessage({
      patientName: patient?.full_name || patient?.name || 'Paciente',
      clinicName: clinic,
      linkUrl: linkData.url,
      isGuardian: isGuard,
      guardianName: recipient
    });

    setWhatsappData({
      isOpen: true,
      recipientName: recipient,
      phone: targetPhone,
      templateTitle: tmpl?.title || 'Termo de Consentimento',
      expiresAt: linkData.expiresAt,
      defaultMessage: msg
    });
  };
  const load=async()=>{
    const [r,t,s]=await Promise.all([ApiClient.get<any[]>(`/v1/consents/patients/${patientId}`),ApiClient.get<any[]>('/v1/consents/templates'),ApiClient.get<any>('/v1/consents/settings')]);
    setRows(r);setTemplates(t);setSettings(s);
  };
  useEffect(()=>{
    setLoading(true);setError('');setLink(null);setLegacy(null);
    load().catch(e=>setError(e.message)).finally(()=>setLoading(false));
    ApiClient.get<any[]>('/v1/services').then(s=>setServices(Array.isArray(s)?s:[])).catch(()=>setServices([]));
  },[patientId]);
  useEffect(()=>{
    let live=true;
    const refresh=()=>ApiClient.get<any[]>(`/v1/consents/patients/${patientId}`).then(r=>{if(live){setRows(r);notify();}}).catch(()=>{});
    window.addEventListener('focus',refresh);
    return()=>{live=false;window.removeEventListener('focus',refresh);};
  },[patientId]);
  const run=async(fn:()=>Promise<void>)=>{setBusy(true);setError('');try{await fn();}catch(e:any){setError(e.message||'Não foi possível processar a solicitação.');}finally{setBusy(false);}};
  const edit=(t:any,duplicate=false)=>{
    setEditingId(!duplicate&&t.tenant_id?t.id:null);
    setEditor({title:duplicate?`Cópia de ${t.title}`:t.title,content:t.content,module:t.module,professionId:t.profession_id||'',serviceId:t.service_id||'',procedureName:t.procedure_name||'',required:!!t.required});
  };
  const save=()=>run(async()=>{
    if(editingId) await ApiClient.put(`/v1/consents/templates/${editingId}`,editor);
    else await ApiClient.post('/v1/consents/templates',editor);
    setEditor(null);await load();notify();showToast('Modelo salvo em uma nova versão.','success');
  });
  const request=(action='device')=>run(async()=>{
    setMode(action);
    if(!useGuardian&&!patient?.email&&!signerEmail&&(action==='send'||settings.auth_level!=='basic')){setAddingEmail(true);setError('Paciente sem e-mail cadastrado. Adicione o e-mail para continuar esta solicitação.');return;}
    let r=await ApiClient.post<any>(`/v1/consents/patients/${patientId}/request`,{templateId:selectedTemplate,photoRequested,guardian:useGuardian?guardian:undefined,signerEmail:!useGuardian&&signerEmail?signerEmail:undefined});
    setLink(r);await load();notify();setRequesting(false);
    if(action==='device') setActiveToken(r.url.split('/').pop());
    if(action==='copy') {await navigator.clipboard.writeText(r.url);showToast('Link copiado.','success');}
    if(action==='send') {r=await ApiClient.post<any>(`/v1/consents/${r.id}/send`,{channel});setLink(r);await load();showToast('Link enviado ao contato do assinante.','success');}
    if(action==='whatsapp') { openWhatsAppModal(r, selectedTemplate); }
  });
  const renew=(row:any,action='qr')=>run(async()=>{const next=await ApiClient.post<any>(`/v1/consents/${row.id}/link`);setLink(next);setMode(action);if(action==='copy')await navigator.clipboard.writeText(next.url);if(action==='device')setActiveToken(next.url.split('/').pop());if(action==='whatsapp')openWhatsAppModal(next, row.template_id || row.templateId, row);notify();});
  const resend=(row:any)=>run(async()=>{setLink(await ApiClient.post(`/v1/consents/${row.id}/send`,{channel}));await load();notify();showToast('Link reenviado.','success');});
  const cancel=()=>run(async()=>{
    const row=rows.find(r=>r.id===cancelId);
    if(row.legacy) await ApiClient.post(`/v1/patients/${patientId}/consents/${cancelId}/revoke`);
    else await ApiClient.post(`/v1/consents/${cancelId}/cancel`,{reason});
    setCancelId(null);setReason('');setLink(null);setRows(current=>current.map(r=>r.id===row.id?{...r,status:'cancelled',reason}:r));notify();try{setRows(await ApiClient.get<any[]>(`/v1/consents/patients/${patientId}`));}catch{setError('Cancelamento registrado. Não foi possível atualizar os demais documentos; use Atualizar.');}
  });
  const isMinor=!!patient?.is_child || (()=>{if(!patient?.birth_date)return false;const d=new Date(`${patient.birth_date.slice(0,10)}T12:00:00Z`);d.setFullYear(d.getFullYear()+18);return d.getTime()>Date.now();})();
  const startRequest=(templateId='')=>{
    const g=guardians.find(g=>g.is_primary)||guardians[0];
    const relationships:Record<string,string>={mother:'Mãe',father:'Pai',legal_guardian:'Responsável legal',tutor:'Tutor',other:'Outro'};
    setSelectedTemplate(templateId);setUseGuardian(isMinor);
    setSignerEmail('');setAddingEmail(false);setPhotoRequested(!!settings.photo_requested);
    setGuardian(g?{name:g.full_name||'',cpf:g.cpf||'',relationship:relationships[g.relationship]||g.relationship||'',phone:g.phone||'',email:g.email||''}:emptyGuardian);
    setRequesting(true);setLink(null);setError('');setView('documents');
  };
  const visible=templates.filter(t=>!moduleFilter||t.module===moduleFilter);
  const preview=templates.find(t=>t.id===selectedTemplate);
  const openLegacy=(id:string)=>run(async()=>{const r=await ApiClient.get<any[]>(`/v1/patients/${patientId}/consents`);setLegacy(r.find(x=>x.id===id));});
  const statuses:Record<string,{label:string;style:string}>={signed:{label:'✓ Assinado',style:'text-teal-800 bg-teal-50'},pending:{label:'⏳ Aguardando assinatura',style:'text-amber-800 bg-amber-50'},needs_signature:{label:'⚠ Nova assinatura necessária',style:'text-orange-800 bg-orange-50'},cancelled:{label:'✕ Cancelado/invalidado',style:'text-slate-600 bg-slate-100'}};
  if(loading)return <p role="status" className="p-4 text-sm text-slate-500">Carregando termos...</p>;
  return <section className="space-y-5">
    {whatsappData?.isOpen && (
      <UniversalWhatsAppModal
        isOpen={whatsappData.isOpen}
        onClose={() => setWhatsappData(null)}
        title="Solicitar Assinatura por WhatsApp"
        subtitle="Confirmação e abertura manual via WhatsApp Web/App."
        recipientName={whatsappData.recipientName}
        phone={whatsappData.phone}
        phoneErrorMessage="Paciente sem telefone/WhatsApp cadastrado."
        contextItems={[
          { label: 'Documento', value: whatsappData.templateTitle },
          { label: 'Destinatário', value: whatsappData.recipientName },
          { label: 'Validade', value: whatsappData.expiresAt ? consentDate(whatsappData.expiresAt) : '7 dias' }
        ]}
        defaultMessage={whatsappData.defaultMessage}
        confirmButtonText="Abrir no WhatsApp Web/App"
        noticeText="O link é seguro e de uso individual. O documento permanecerá aguardando assinatura até que o destinatário conclua."
      />
    )}
    {activeToken&&<div role="dialog" aria-modal="true" aria-label="Assinar termo" className="fixed inset-0 z-[10001] overflow-y-auto bg-slate-50"><div className="sticky top-0 z-10 bg-white border-b p-3"><button type="button" className="consent-secondary" onClick={()=>{setActiveToken(null);void run(load);notify();}}>Voltar aos termos</button></div><PublicConsentPage token={activeToken}/></div>}
    {evidence&&<aside className="border rounded-xl p-4 space-y-3"><h3 className="font-bold">Evidências da assinatura</h3><p>Assinante: {evidence.evidence.signer.name} · {consentDate(evidence.evidence.signedAt)}</p><img src={evidence.signature} alt="Assinatura registrada" className="max-w-xs"/>{evidence.photo&&<><p>Registro fotográfico realizado no momento da assinatura</p><img src={evidence.photo} alt="Foto da assinatura" className="max-w-xs rounded-lg"/></>}<button className="consent-secondary" onClick={()=>setEvidence(null)}>Fechar evidências</button></aside>}<header className="flex flex-wrap justify-between gap-3"><div><h2 className="text-xl font-bold text-slate-900 flex gap-2 items-center"><ShieldCheck className="w-5 h-5 text-teal-700"/>Termos &amp; Consentimentos</h2><p className="text-sm text-slate-500 mt-1">Biblioteca compartilhada por todas as áreas da clínica.</p></div><button className="consent-primary" disabled={busy} onClick={()=>startRequest()}><Plus className="w-4 h-4"/>Solicitar assinatura</button></header>
    <nav aria-label="Termos e modelos" className="flex flex-wrap gap-2"><button className={`consent-secondary ${view==='documents'?'!border-teal-600 !text-teal-800':''}`} onClick={()=>setView('documents')}>Termos do paciente</button><button className={`consent-secondary ${view==='library'?'!border-teal-600 !text-teal-800':''}`} onClick={()=>setView('library')}>Biblioteca de termos</button><button className="consent-secondary" disabled={busy} onClick={()=>run(load)}>Atualizar</button></nav>
    {error&&<p role="alert" className="rounded-xl p-3 bg-red-50 text-red-700 text-sm">{error}</p>}
    {link&&<aside className="bg-teal-50 border border-teal-200 p-4 rounded-xl space-y-3">
      <div className="flex justify-between gap-3"><h3 className="font-semibold text-teal-900">Link seguro de assinatura</h3><button onClick={()=>setLink(null)} className="consent-secondary">Fechar</button></div>
      <p className="text-xs text-slate-600">Válido até {consentDate(link.expiresAt)}. O link encerra após a assinatura. Um reenvio substitui o link anterior.</p>
      <div className="flex flex-wrap gap-2"><a href={link.url} target="_blank" rel="noreferrer" className="consent-primary"><ExternalLink className="w-4 h-4"/>Assinar neste dispositivo</a><button className="consent-secondary" onClick={()=>run(async()=>{await navigator.clipboard.writeText(link.url);showToast('Link copiado.','success');})}><Copy className="w-4 h-4"/>Copiar link</button><button type="button" className="consent-secondary flex items-center gap-1.5" onClick={()=>openWhatsAppModal(link, selectedTemplate)}><WhatsAppIcon className="w-3.5 h-3.5 fill-emerald-600" />WhatsApp</button></div>
      <details open={mode==='qr'}><summary className="cursor-pointer text-sm font-semibold text-teal-800">Mostrar QR Code</summary><img src={link.qrCode} alt="QR Code para assinar este termo" className="w-48 mt-3"/></details>
      <div className="flex flex-wrap gap-2"><button disabled={busy} className="consent-secondary" onClick={()=>resend({id:link.id})}>Enviar por e-mail</button></div>
    </aside>}
    {requesting&&<form onSubmit={e=>{e.preventDefault();void request(((e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement)?.value||'device');}} className="space-y-4 p-4 sm:p-5 border border-slate-200 rounded-2xl bg-white">
      <h3 className="font-bold">Solicitar assinatura</h3><label className="block text-sm font-medium">Modelo<select aria-label="Modelo" required className="consent-field mt-1" value={selectedTemplate} onChange={e=>setSelectedTemplate(e.target.value)}><option value="">Selecione um termo</option>{templates.map(t=><option key={t.id} value={t.id}>{t.title} · v{t.current_version}{t.required?' · obrigatório':''}</option>)}</select></label>
      {preview&&<details><summary className="cursor-pointer text-sm text-teal-700">Ler conteúdo antes de enviar</summary><p className="whitespace-pre-wrap text-sm leading-6 mt-3">{preview.content}</p></details>}
      <p className="text-sm text-slate-600">Confirmação: {settings.auth_level==='basic'?'Básico — assinatura manuscrita':settings.auth_level==='recommended'?'Recomendado — assinatura e OTP':'Reforçado — assinatura, OTP e foto opcional'}</p>
      <label className="flex gap-2 text-sm"><input type="checkbox" className="accent-teal-700" checked={useGuardian} disabled={isMinor} onChange={e=>setUseGuardian(e.target.checked)}/>{isMinor?'Paciente menor: assinatura obrigatória pelo responsável legal':'Assinatura por responsável legal'}</label>
      {!useGuardian&&!patient?.email&&<div className="space-y-2"><p className="text-sm text-amber-800">Paciente sem e-mail cadastrado.</p>{addingEmail?<label className="block text-sm">E-mail do paciente<input type="email" required maxLength={254} className="consent-field" value={signerEmail} onChange={e=>setSignerEmail(e.target.value)}/><span className="text-xs text-slate-500">O e-mail será salvo ao continuar a solicitação.</span></label>:<button type="button" className="consent-secondary" onClick={()=>setAddingEmail(true)}>Adicionar e-mail</button>}</div>}
      {useGuardian&&!guardian.email&&<p className="text-sm text-amber-800">Responsável legal sem e-mail cadastrado. Adicione o e-mail no campo abaixo para continuar. <button type="button" className="consent-secondary" onClick={()=>document.getElementById('consent-guardian-email')?.focus()}>Adicionar e-mail</button></p>}
      {useGuardian&&<fieldset className="grid sm:grid-cols-2 gap-3"><legend className="text-sm font-semibold mb-2">Responsável legal</legend>{([{key:'name',label:'Nome do responsável',type:'text'},{key:'cpf',label:'CPF',type:'text'},{key:'relationship',label:'Parentesco',type:'text'},{key:'phone',label:'Telefone',type:'tel'},{key:'email',label:'E-mail',type:'email'}] as const).map(f=><label key={f.key} className="text-sm">{f.label}<input required id={f.key==='email'?'consent-guardian-email':undefined} className="consent-field mt-1" type={f.type} maxLength={f.key==='email'?254:180} value={guardian[f.key]} onChange={e=>setGuardian(g=>({...g,[f.key]:e.target.value}))}/></label>)}</fieldset>}
      <label className="flex gap-2 text-sm"><input type="checkbox" checked={photoRequested} onChange={e=>setPhotoRequested(e.target.checked)}/>Solicitar foto no momento da assinatura</label><p className="text-xs text-slate-500">Opcional para o assinante. Esta escolha vale para esta nova solicitação.</p>
      <div className="flex flex-wrap gap-2">{(()=>{
        const targetPhone = useGuardian ? (guardian.phone) : (patient?.whatsapp || patient?.phone);
        const hasPhone = isValidPhoneNumber(targetPhone);
        return (<>
          {[['device','Assinar agora'],['copy','Copiar link'],['send','Enviar por e-mail'],['qr','QR Code']].map(([value,label])=><button key={value} value={value} type="submit" className={value==='device'?'consent-primary':'consent-secondary'} disabled={busy||!selectedTemplate}>{label}</button>)}
          <button key="whatsapp" value="whatsapp" type="submit" className="consent-secondary flex items-center gap-1.5" disabled={busy||!selectedTemplate||!hasPhone} title={!hasPhone ? 'Paciente sem telefone/WhatsApp cadastrado.' : 'Enviar pelo WhatsApp'}>
            <WhatsAppIcon className="w-3.5 h-3.5 fill-emerald-600" />
            <span>WhatsApp</span>
          </button>
          {!hasPhone && <span className="text-[11px] text-amber-700 self-center">Paciente sem telefone/WhatsApp cadastrado.</span>}
        </>);
      })()}<button type="button" className="consent-secondary" disabled={busy} onClick={()=>setRequesting(false)}>Voltar</button></div>{busy&&<p role="status">Preparando solicitação...</p>}
    </form>}
    {view==='library'?<div className="space-y-4">
      <div className="flex flex-wrap gap-3"><select className="consent-field !w-auto" aria-label="Filtrar módulo" value={moduleFilter} onChange={e=>setModuleFilter(e.target.value)}><option value="">Todas as áreas</option>{Array.from(new Set(templates.map(t=>t.module))).map(m=><option key={m} value={m}>{m==='general'?'Multidisciplinar':m}</option>)}</select>{currentUser?.role!=='receptionist'&&<button className="consent-secondary" disabled={busy} onClick={()=>{setEditingId(null);setEditor({...emptyTemplate});}}>Criar termo próprio</button>}</div>
      {currentUser?.role==='clinic_admin'&&<details className="bg-slate-50 border border-slate-200 rounded-xl p-4"><summary className="font-semibold text-sm cursor-pointer">Configuração da clínica</summary><div className="mt-3 space-y-3"><label className="block text-sm">Nível de confirmação<select className="consent-field mt-1" value={settings.auth_level} onChange={e=>setSettings(s=>({...s,auth_level:e.target.value}))}><option value="basic">Básico — assinatura e registros técnicos</option><option value="recommended">Recomendado — assinatura e OTP</option><option value="reinforced">Reforçado — assinatura, OTP e foto opcional</option></select></label><label className="block text-sm">Validade do link (horas)<input className="consent-field mt-1" type="number" min={1} max={720} value={settings.link_hours} onChange={e=>setSettings(s=>({...s,link_hours:Number(e.target.value)}))}/></label><label className="flex gap-2 text-sm"><input type="checkbox" checked={!!settings.photo_requested} onChange={e=>setSettings(s=>({...s,photo_requested:e.target.checked?1:0}))}/>Solicitar foto no momento da assinatura</label><button className="consent-secondary" disabled={busy} onClick={()=>run(async()=>{await ApiClient.put('/v1/consents/settings',{authLevel:settings.auth_level,linkHours:settings.link_hours,photoRequested:!!settings.photo_requested});showToast('Configuração salva para novas solicitações.','success');})}>Salvar configuração</button></div></details>}
      {editor&&<form className="space-y-3 p-4 border border-teal-200 rounded-xl" onSubmit={e=>{e.preventDefault();void save();}}><h3 className="font-bold">{editingId?'Editar modelo — criar nova versão':'Novo modelo da clínica'}</h3><label className="block text-sm">Título<input required minLength={3} maxLength={180} className="consent-field mt-1" value={editor.title} onChange={e=>setEditor({...editor,title:e.target.value})}/></label><label className="block text-sm">Área / módulo<input list="consent-modules" required maxLength={100} className="consent-field mt-1" value={editor.module} onChange={e=>setEditor({...editor,module:e.target.value})}/><datalist id="consent-modules">{Array.from(new Set(templates.map(t=>t.module))).map(m=><option key={m} value={m}/>)}</datalist></label><label className="block text-sm">Profissão<select className="consent-field mt-1" value={editor.professionId} onChange={e=>setEditor({...editor,professionId:e.target.value})}><option value="">Multidisciplinar dentro da área selecionada</option><option value={settings.profession_id}>{settings.profession_name}</option></select></label><label className="block text-sm">Serviço relacionado<select className="consent-field mt-1" value={editor.serviceId} onChange={e=>setEditor({...editor,serviceId:e.target.value})}><option value="">Nenhum serviço específico</option>{services.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label className="block text-sm">Procedimento relacionado<input maxLength={180} className="consent-field mt-1" value={editor.procedureName} onChange={e=>setEditor({...editor,procedureName:e.target.value})}/></label><label className="block text-sm">Conteúdo completo<textarea rows={12} required minLength={20} maxLength={60000} className="consent-field mt-1" value={editor.content} onChange={e=>setEditor({...editor,content:e.target.value})}/></label><label className="flex gap-2 text-sm"><input type="checkbox" className="accent-teal-700" checked={editor.required} onChange={e=>setEditor({...editor,required:e.target.checked})}/>Termo obrigatório nesta área/serviço</label><p className="text-xs text-slate-500">Alterações geram uma nova versão. Documentos emitidos e assinados preservam seu conteúdo original.</p><div className="flex gap-2"><button disabled={busy} className="consent-primary" type="submit">Salvar modelo</button><button className="consent-secondary" type="button" onClick={()=>setEditor(null)}>Voltar</button></div></form>}
      <div className="grid sm:grid-cols-2 gap-3">{visible.map(t=><article key={t.id} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3"><h3 className="font-semibold text-sm">{t.title}</h3><p className="text-xs text-slate-500">{t.module} · v{t.current_version} · {t.tenant_id?'Modelo da clínica':'Modelo padrão Zemda'}{t.required?' · obrigatório':''}{t.procedure_name?` · ${t.procedure_name}`:''}</p><details><summary className="text-sm text-teal-700 cursor-pointer">Visualizar conteúdo</summary><p className="whitespace-pre-wrap text-sm leading-6 mt-2">{t.content}</p></details><div className="flex flex-wrap gap-2"><button className="consent-secondary" disabled={busy} onClick={()=>startRequest(t.id)}>Usar modelo</button>{currentUser?.role!=='receptionist'&&<button className="consent-secondary" disabled={busy} onClick={()=>edit(t,true)}>Duplicar</button>}{currentUser?.role!=='receptionist'&&t.tenant_id&&<button className="consent-secondary" disabled={busy} onClick={()=>edit(t)}>Editar</button>}</div></article>)}</div>
    </div>:<div className="space-y-3">
      {!rows.length&&<p className="p-6 text-sm text-slate-500 bg-slate-50 rounded-xl">Nenhum termo registrado para este paciente.</p>}
      {rows.map(row=><article key={row.id} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3"><div className="flex flex-wrap items-start justify-between gap-2"><h3 className="font-semibold text-sm flex gap-2"><FileText className="w-4 h-4 text-teal-700 shrink-0"/>{row.title}</h3><span className={`text-xs px-2 py-1 rounded-lg font-semibold ${statuses[row.status].style}`}>{row.status==='cancelled'?(row.signedAt?'✕ Invalidado':'✕ Cancelado'):statuses[row.status].label}</span></div><dl className="grid sm:grid-cols-2 gap-2 text-xs text-slate-600"><div><dt className="font-medium">Paciente</dt><dd>{row.patient||patient?.full_name||'—'}</dd></div><div><dt className="font-medium">Área / profissão</dt><dd>{row.module||'Multidisciplinar'} · {row.profession||'—'}</dd></div><div><dt className="font-medium">Solicitação</dt><dd>{consentDate(row.createdAt)}</dd></div><div><dt className="font-medium">Versão</dt><dd>{row.version}{row.legacy?' · Registro anterior':''}</dd></div><div><dt className="font-medium">Envio</dt><dd>{consentDate(row.sentAt)}</dd></div><div><dt className="font-medium">Assinatura</dt><dd>{consentDate(row.signedAt)}</dd></div><div><dt className="font-medium">Assinante</dt><dd>{row.signer?.name||'—'}{row.signer?.kind==='guardian'?' (responsável legal)':''}</dd></div><div><dt className="font-medium">Profissional solicitante</dt><dd>{row.professional||'—'}</dd></div><div><dt className="font-medium">Autenticação</dt><dd>{row.authLabel||'—'}</dd></div></dl>
      {!row.signedAt&&row.expiresAt&&Date.parse(row.expiresAt)<Date.now()&&<p className="text-xs text-amber-800">Link expirado. Gere outro link para este documento.</p>}
      {row.reason&&<p className="text-xs text-slate-500">Motivo do cancelamento: {row.reason}</p>}
      <div className="flex flex-wrap gap-2">{row.signatureId&&<button className="consent-secondary" disabled={busy} onClick={()=>run(async()=>{setEvidence(await ApiClient.get(`/v1/consents/${row.id}/document`));})}>Ver evidências</button>}{row.signatureId&&<button className="consent-secondary" disabled={busy} onClick={()=>run(()=>downloadConsentPdf(row.id,true))}>Visualizar / imprimir</button>}{row.signatureId&&<button className="consent-secondary" disabled={busy} onClick={()=>run(()=>downloadConsentPdf(row.id))}><Download className="w-4 h-4"/>PDF / imprimir</button>}{row.legacy&&<button className="consent-secondary" disabled={busy} onClick={()=>openLegacy(row.id)}>Visualizar registro anterior</button>}{!row.legacy&&row.status!=='cancelled'&&<>{!row.signedAt&&row.status==='pending'&&<><button className="consent-secondary" disabled={busy} onClick={()=>renew(row,'device')}>Abrir</button><button className="consent-secondary" disabled={busy} onClick={()=>renew(row,'copy')}>Copiar link</button><button className="consent-secondary" disabled={busy} onClick={()=>renew(row,'qr')}>QR Code</button><button className="consent-secondary flex items-center gap-1" disabled={busy} onClick={()=>renew(row,'whatsapp')}><WhatsAppIcon className="w-3 h-3 fill-emerald-600" />WhatsApp</button><button className="consent-secondary" disabled={busy} onClick={()=>resend(row)}>Reenviar e-mail</button></>}{row.status==='needs_signature'&&<button className="consent-secondary" disabled={busy} onClick={()=>startRequest(row.templateId)}>Solicitar versão atual</button>}</>}{row.status!=='cancelled'&&(row.signedAt?currentUser?.role!=='receptionist':true)&&<button className="consent-secondary" disabled={busy} onClick={()=>{setCancelId(row.id);setReason('');}}>{row.signedAt?'Invalidar termo':'Cancelar solicitação'}</button>}</div>
      {cancelId===row.id&&<div className="space-y-2"><label className="block text-sm">Motivo *<input className="consent-field mt-1" maxLength={1000} value={reason} onChange={e=>setReason(e.target.value)}/></label><p className="text-xs text-slate-500">O documento e suas evidências permanecem no histórico.</p><div className="flex gap-2"><button className="consent-secondary" disabled={busy||reason.trim().length<5} onClick={cancel}>{row.signedAt?'Confirmar invalidação':'Confirmar cancelamento'}</button><button className="consent-secondary" onClick={()=>setCancelId(null)}>Voltar</button></div></div>}
      </article>)}
      {legacy&&<aside className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3"><h3 className="font-bold">{legacy.title}</h3><p className="text-sm whitespace-pre-wrap leading-6">{legacy.content}</p>{legacy.signature_data_url&&<img src={legacy.signature_data_url} alt="Assinatura do registro anterior" className="max-w-xs"/>}<button className="consent-secondary" onClick={()=>setLegacy(null)}>Fechar registro</button></aside>}
    </div>}
  </section>;
}

export function PatientConsentsDialog({patientId,onClose}:{patientId:string;onClose:()=>void}) {
  const [data,setData]=useState<any>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  useEffect(()=>{let live=true;setData(null);setError('');ApiClient.get<any>(`/v1/patients/${patientId}`).then(d=>{if(live)setData(d);}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[patientId,retry]);
  return createPortal(<div className="fixed inset-0 z-[10000] bg-slate-900/30 p-3 sm:p-6 overflow-y-auto" role="dialog" aria-modal="true" aria-label="Termos & Consentimentos"><div className="max-w-4xl mx-auto bg-white rounded-2xl p-4 sm:p-6 space-y-4"><div className="flex justify-between gap-3"><div><h2 className="font-bold">Termos &amp; Consentimentos</h2>{data&&<p>Paciente: {data.patient.full_name}</p>}</div><button className="consent-secondary" onClick={onClose}>Voltar à agenda</button></div>{error?<div role="alert">{error}<button className="consent-secondary" onClick={()=>setRetry(v=>v+1)}>Tentar novamente</button></div>:!data?<p role="status">Carregando paciente...</p>:<PatientConsentsPanel patientId={patientId} patient={data.patient} guardians={data.guardians||[]}/>}</div></div>,document.body);
}
