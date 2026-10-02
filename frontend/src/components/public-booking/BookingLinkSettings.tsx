import React, { useEffect, useId, useRef, useState } from 'react';
import { Copy, ExternalLink, Calendar, ChevronDown, UserRound, Check } from 'lucide-react';
import { ApiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { clinicBookingPath } from '../../utils/publicBooking';

interface LinkProps { title: string; description?: string; enabled: boolean; url?: string | null; disabled?: boolean; saving?: boolean; onToggle?: (value: boolean) => void; accordion?: { expanded: boolean; onExpand: () => void; subtitle?: string } }
export function BookingLinkCard({ title, description, enabled, url, disabled, saving, onToggle, accordion }: LinkProps) {
  const id = useId(); const { showToast } = useToast();
  return <div className="min-w-0 rounded-2xl border border-slate-200 bg-white shadow-sm">
    {accordion && <h3><button type="button" id={`${id}-heading`} aria-expanded={accordion.expanded} aria-controls={`${id}-panel`} onClick={accordion.onExpand} className="flex w-full items-center gap-3 rounded-2xl p-4 text-left hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">
      <span className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700 sm:flex"><UserRound aria-hidden="true" className="h-5 w-5" /></span>
      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-slate-900">{title}</span>{accordion.subtitle && <span className="block truncate text-xs text-slate-500">{accordion.subtitle}</span>}<span className="block text-xs text-slate-500">{enabled?'Página ativa':'Página desativada'}</span></span>
      <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${enabled?'bg-teal-50 text-teal-700':'bg-slate-100 text-slate-600'}`}>{enabled && <Check aria-hidden="true" className="h-3 w-3" />}{enabled?'Ativo':'Desativado'}</span>
      <ChevronDown aria-hidden="true" className={`h-4 w-4 shrink-0 text-slate-500 transition-transform duration-200 motion-reduce:transition-none ${accordion.expanded?'rotate-180':''}`} />
    </button></h3>}
    <div id={`${id}-panel`} role={accordion?'region':undefined} aria-labelledby={accordion?`${id}-heading`:undefined} className={accordion?`grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none ${accordion.expanded?'grid-rows-[1fr]':'grid-rows-[0fr]'}`:undefined}>
    <div className={`min-h-0 min-w-0 ${accordion?'overflow-hidden':''} ${accordion&&!accordion.expanded?'invisible':''}`}>
    <div className={`space-y-3 p-5 ${accordion?'border-t border-slate-100':''}`}>
    {!accordion && <h3 className="flex items-center gap-2 text-base font-bold text-slate-900"><Calendar aria-hidden="true" className="h-5 w-5 text-teal-700" />{title}</h3>}
    {description && <p className="text-sm text-slate-600">{description}</p>}
    <label htmlFor={`${id}-enabled`} className="flex items-center gap-3 text-sm font-semibold text-slate-700"><input id={`${id}-enabled`} type="checkbox" checked={enabled} disabled={disabled || !onToggle} onChange={e=>onToggle?.(e.target.checked)} className="h-4 w-4 accent-teal-700"/>Ativar página pública de agendamento{title.includes('clínica')?' da clínica':' deste profissional'}</label>
    {saving && <p role="status" className="text-xs text-slate-500">Salvando…</p>}
    {enabled && url ? <><label htmlFor={`${id}-url`} className="block text-xs font-semibold text-slate-600">Link de agendamento</label><input id={`${id}-url`} readOnly value={url} className="w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700"/><div className="flex flex-wrap gap-2"><button type="button" onClick={async()=>{try{await navigator.clipboard.writeText(url);showToast('Link copiado.','success');}catch{showToast('Não foi possível copiar. Selecione e copie o link.','error');}}} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 focus-visible:ring-2 focus-visible:ring-teal-600"><Copy aria-hidden="true" className="h-4 w-4"/>Copiar link</button><a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 focus-visible:ring-2 focus-visible:ring-teal-600"><ExternalLink aria-hidden="true" className="h-4 w-4"/>Visualizar página</a></div></> : <p className="text-xs text-slate-500">{enabled?'O link estará disponível após salvar as alterações.':accordion?'Página pública desativada.':'Página desativada. Novos agendamentos por este link estão indisponíveis.'}</p>}
    </div></div></div>
  </div>;
}
export function ClinicBookingSettings() {
  const { isClinicAdmin, currentTenant, refreshTenant } = useAuth(); const {showToast}=useToast();
  const [tenant,setTenant]=useState<any>(null);const [saving,setSaving]=useState(false);const [error,setError]=useState('');
  useEffect(()=>{let active=true;setTenant(null);if(isClinicAdmin)ApiClient.get('/v1/tenants/current').then(data=>{if(active)setTenant(data);}).catch(()=>{if(active)setError('Não foi possível carregar o agendamento online.');});return()=>{active=false;};},[currentTenant?.id,isClinicAdmin]);
  const toggle=async(value:boolean)=>{setSaving(true);try{await ApiClient.put('/v1/tenants/current',{publicBookingEnabled:value});const fresh=await ApiClient.get('/v1/tenants/current');setTenant(fresh);await refreshTenant();showToast(value?'Agendamento da clínica ativado.':'Agendamento da clínica desativado.','success');}catch(e:any){showToast(e.message||'Não foi possível salvar.','error');}finally{setSaving(false);}};
  if(!isClinicAdmin)return null;
  if(!tenant)return <div role="status" className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500">{error||'Carregando agendamento online…'}</div>;
  const path=clinicBookingPath(tenant);
  return <BookingLinkCard title="Agendamento Online — página da clínica" description="Permita que pacientes encontrem a especialidade desejada, escolham um profissional disponível e agendem um horário." enabled={tenant.public_booking_enabled===1} url={path?window.location.origin+path:null} disabled={saving} onToggle={toggle}/>;
}
export function ProfessionalBookingSettings() {
  const [expandedId,setExpandedId]=useState<string|null>(null);
  const {currentUser,currentTenant,isClinicAdmin,isProfessional}=useAuth();const {showToast}=useToast();const[professionals,setProfessionals]=useState<any[]>([]);const[loading,setLoading]=useState(true);const[saving,setSaving]=useState('');const savingRef=useRef(false);const[error,setError]=useState('');
  useEffect(()=>{let active=true;setLoading(true);if(!isClinicAdmin&&!isProfessional){setLoading(false);return;}const load=currentUser?.professionalId&&!isClinicAdmin?ApiClient.get<any>(`/v1/professionals/${currentUser.professionalId}`).then(data=>[data.professional]):ApiClient.get<any[]>('/v1/professionals');load.then(data=>{if(active)setProfessionals(isClinicAdmin?data:data.filter(p=>p.user_id===currentUser?.id));}).catch(()=>{if(active)setError('Não foi possível carregar os links dos profissionais.');}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[currentTenant?.id,currentUser?.id,isClinicAdmin,isProfessional]);
  const toggle=async(p:any,value:boolean)=>{if(savingRef.current)return;savingRef.current=true;setSaving(p.id);try{await ApiClient.put(`/v1/professionals/${p.id}`,{publicBookingEnabled:value});setProfessionals(items=>items.map(item=>item.id===p.id?{...item,public_booking_enabled:value?1:0}:item));showToast(value?'Página pública de agendamento ativada.':'Página pública de agendamento desativada.','success');}catch(e:any){showToast(e.message||'Não foi possível salvar.','error');}finally{savingRef.current=false;setSaving('');}};
  if(!isClinicAdmin&&!isProfessional)return null;
  if(loading)return <p role="status" className="text-sm text-slate-500">Carregando links…</p>;
  return <section className="min-w-0 space-y-3"><div><h2 className="text-base font-bold text-slate-900">Links individuais dos profissionais</h2><p className="mt-1 text-sm text-slate-600">Gerencie quais profissionais possuem uma página pública de agendamento.</p></div>{error&&<p role="alert" className="text-sm text-red-700">{error}</p>}{!professionals.length&&!error&&<p className="text-sm text-slate-500">Nenhum perfil profissional disponível para compartilhar.</p>}{professionals.map(p=><BookingLinkCard key={p.id} title={p.name} accordion={{expanded:expandedId===p.id,onExpand:()=>setExpandedId(current=>current===p.id?null:p.id),subtitle:[p.profession_name,p.specialty_custom||p.specialty_name].filter(Boolean).join(' · ')}} enabled={p.public_booking_enabled===1} url={p.slug&&currentTenant?.slug?`${window.location.origin}/agendar/${currentTenant.slug}/${p.slug}`:null} disabled={Boolean(saving)} saving={saving===p.id} onToggle={(isClinicAdmin||(isProfessional&&p.user_id===currentUser?.id))?value=>toggle(p,value):undefined}/>)}</section>;
}
