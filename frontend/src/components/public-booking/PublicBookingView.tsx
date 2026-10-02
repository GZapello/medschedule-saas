import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, CheckCircle2, UserRound, ArrowRight, Stethoscope } from 'lucide-react';
import { ApiClient } from '../../api/client';
import { AvailableSlot } from '../../types';
import { bookingAreas, calendarBooking } from '../../utils/publicBooking';
import { PublicBookingShell, BookingStepIndicator, BookingEmptyState, BookingSkeleton, BookingBackButton, bookingButton, bookingSecondary, bookingInput } from './PublicBookingShell';

interface Props { tenantSlug?: string; bookingSequence?: number; professionalSlug?: string; onBackToApp?: () => void }
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const modalityLabel = (value: string) => ({ online: 'Online', presential: 'Presencial', home: 'Domiciliar', both: 'Presencial ou online' }[value] || value);

export const PublicBookingView: React.FC<Props> = ({ tenantSlug, bookingSequence, professionalSlug, onBackToApp }) => {
  const individual = !!professionalSlug;
  const [step, setStep] = useState(individual ? 3 : 1);
  const [loading, setLoading] = useState(true);
  const [clinic, setClinic] = useState<any>(null);
  const [professionals, setProfessionals] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [area, setArea] = useState('');
  const [professional, setProfessional] = useState<any>(null);
  const [serviceId, setServiceId] = useState('');
  const [date, setDate] = useState(today);
  const [slots, setSlots] = useState<AvailableSlot[]>([]);
  const [slot, setSlot] = useState<AvailableSlot | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [reloadSlots, setReloadSlots] = useState(0);
  const [error, setError] = useState('');
  const [profileError, setProfileError] = useState('');
  const [retry, setRetry] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [form, setForm] = useState({ fullName: '', phone: '', email: '', isChild: false, guardianName: '', notes: '' });
  const dateInput = useRef<HTMLInputElement>(null);
  const contextVersion = useRef(0);
  const slotVersion = useRef(0);
  const submittingRef = useRef(false);
  const areas = useMemo(() => bookingAreas(professionals, services), [professionals, services]);
  const compatible = professionals.filter(p => areas.find(a => a.name === area)?.professionalIds.includes(p.id));
  const linkedServices = services.filter(s => professional?.services?.some((link: any) => link.id === s.id));
  const service = linkedServices.find(s => s.id === serviceId);
  const modality = service?.modality === 'both' ? 'presential' : service?.modality;
  const [selectedModality, setSelectedModality] = useState('presential');
  const bookingModality = service?.modality === 'both' ? selectedModality : modality;
  const professionalEndpoint = `/v1/public/professionals/${tenantSlug ? `${encodeURIComponent(tenantSlug)}/` : ''}${encodeURIComponent(professionalSlug || '')}`;

  useEffect(() => {
    let active = true; contextVersion.current++; submittingRef.current = false; setSubmitting(false);
    setLoading(true); setClinic(null); setProfileError(''); setError(''); setResult(null); setArea(''); setProfessional(null); setServiceId(''); setSlots([]); setSlot(null); setDate(today()); setForm({fullName:'',phone:'',email:'',isChild:false,guardianName:'',notes:''}); setStep(individual ? 3 : 1);
    const endpoint = individual ? professionalEndpoint : `/v1/public/tenants/${encodeURIComponent(tenantSlug || '')}${bookingSequence ? `?bookingSequence=${bookingSequence}` : ''}`;
    ApiClient.get<any>(endpoint).then(data => {
      if (!active) return;
      setClinic(data.tenant); setServices(data.services || []);
      if (individual) { const p = {...data.professional, services: (data.services || []).map((s: any) => ({id:s.id, duration_minutes:s.duration_minutes, modality:s.modality}))}; setProfessionals([p]); setProfessional(p); setServiceId(data.services?.length === 1 ? data.services[0].id : ''); }
      else setProfessionals((data.professionals || []).filter((p: any) => p.services?.length));
    }).catch((e: any) => { if (active) setProfileError(e.status === 404 ? 'O agendamento online está indisponível no momento.' : 'Não foi possível carregar o agendamento. Tente novamente.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; contextVersion.current++; };
  }, [tenantSlug, bookingSequence, professionalSlug, retry]);

  useEffect(() => {
    let active = true; const version = ++slotVersion.current;
    setSlot(null); setSlots([]);
    if (!professional || !service || !date) { setLoadingSlots(false); return; }
    setLoadingSlots(true);
    const query = new URLSearchParams({date,serviceId:service.id});
    if (!individual) { query.set('tenantSlug', tenantSlug || ''); query.set('professionalId',professional.id); if (bookingSequence) query.set('bookingSequence',String(bookingSequence)); }
    const endpoint = individual ? `${professionalEndpoint}/slots?${query}` : `/v1/public/slots/available?${query}`;
    ApiClient.get<any>(endpoint).then(data => { if (active && version === slotVersion.current) setSlots(data.slots || []); }).catch(() => { if (active) setError('Não foi possível consultar os horários. Tente novamente.'); }).finally(() => { if (active) setLoadingSlots(false); });
    return () => { active = false; };
  }, [professional, serviceId, date, tenantSlug, bookingSequence, professionalSlug, reloadSlots]);

  const chooseProfessional = (p: any) => { setProfessional(p); setServiceId(p.services.length === 1 ? p.services[0].id : ''); setSlot(null); setSlots([]); setError(''); };
  const chooseArea = (name: string) => {
    setArea(name); setProfessional(null); setServiceId(''); setSlot(null); setError('');
    const matches = professionals.filter(p => areas.find(a => a.name === name)?.professionalIds.includes(p.id));
    if (matches.length === 1) { chooseProfessional(matches[0]); setStep(matches[0].services.length === 1 ? 3 : 2); } else setStep(2);
  };
  const back = () => { setStep(s => Math.max(individual ? 3 : 1, s - 1)); setError(''); };
  const go = (next: number) => { setStep(next); setError(''); };
  const reset = () => { setResult(null); setSlot(null); setForm({fullName:'',phone:'',email:'',isChild:false,guardianName:'',notes:''}); setError(''); setDate(today()); setReloadSlots(n=>n+1); if (!individual) { setArea(''); setProfessional(null); setServiceId(''); } setStep(individual ? 3 : 1); };
  const confirm = async (e: React.FormEvent) => {
    e.preventDefault(); if (submittingRef.current || !slot || !service || !professional) return;
    const version = contextVersion.current; submittingRef.current = true; setSubmitting(true); setError('');
    try {
      const data = await ApiClient.post<any>('/v1/public/appointments', {
        tenantSlug: individual ? clinic.slug : tenantSlug, ...(individual ? {professionalSlug: professional.slug || professional.id} : {bookingSequence}), professionalId:professional.id, serviceId:service.id,
        startTime:slot.startTime,endTime:slot.endTime,modality:bookingModality,patientNotes:form.notes.trim() || null,
        newPatientData:{fullName:form.fullName.trim(),phone:form.phone.trim(),email:form.email.trim() || null,isChild:form.isChild,guardianName:form.isChild?form.guardianName.trim():null,notes:form.notes.trim() || null}
      });
      if (version !== contextVersion.current) return; setResult(data); setStep(6);
    } catch (e: any) {
      if (version !== contextVersion.current) return;
      setError(e.status === 409 ? 'Este horário não está mais disponível. Escolha outro horário.' : e.status === 404 ? 'O agendamento online está indisponível no momento.' : e.message || 'Não foi possível concluir o agendamento.');
      if (e.status === 409) { setSlot(null); setStep(4); setReloadSlots(n=>n+1); }
    } finally { if (version === contextVersion.current) {setSubmitting(false); submittingRef.current=false;} }
  };
  const downloadCalendar = () => {
    if (!slot) return;
    const blob = new Blob([calendarBooking({startTime:slot.startTime,endTime:slot.endTime,title:`${service?.name} — ${professional?.name}`,clinic:clinic.trade_name || clinic.name})], {type:'text/calendar;charset=utf-8'});
    const url = URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url;a.download='agendamento-zemda.ics';a.click();URL.revokeObjectURL(url);
  };
  const servicePicker = <>{linkedServices.length > 1 && <div><label htmlFor="booking-service" className="mb-1 block text-sm font-semibold">Atendimento</label><select id="booking-service" className={bookingInput} value={serviceId} onChange={e => {setServiceId(e.target.value);setSlot(null);setSlots([]);}}><option value="">Escolha o atendimento</option>{linkedServices.map(s=><option key={s.id} value={s.id}>{s.name} · {professional.services.find((link:any)=>link.id===s.id)?.duration_minutes || s.duration_minutes} min</option>)}</select></div>}{service?.modality==='both' && <div><label htmlFor="booking-modality" className="mb-1 block text-sm font-semibold">Modalidade</label><select id="booking-modality" className={bookingInput} value={selectedModality} onChange={e=>setSelectedModality(e.target.value)}><option value="presential">Presencial</option><option value="online">Online</option></select></div>}</>;
  const summary = <dl className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm sm:grid-cols-2">{[['Especialidade',area || professional?.specialty_name || professional?.profession_name],['Profissional',professional?.name],['Atendimento',service?.name],['Data',date ? new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR'): ''],['Horário',slot?.time],['Modalidade',modalityLabel(bookingModality || '')],['Clínica',clinic?.trade_name || clinic?.name]].map(([label,value])=><div key={label}><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-0.5 font-semibold text-slate-900">{value}</dd></div>)}</dl>;

  return <PublicBookingShell clinic={clinic}>
    {onBackToApp && <div className="mb-4"><button type="button" className={bookingSecondary} onClick={onBackToApp}>Voltar ao painel</button></div>}
    {loading ? <BookingSkeleton /> : profileError ? <BookingEmptyState title="Agendamento indisponível" description={profileError}><button className={bookingSecondary} onClick={()=>setRetry(n=>n+1)}>Tentar novamente</button></BookingEmptyState> : <>
      <BookingStepIndicator step={step} individual={individual} />
      {professional && step>=3 && step<6 && <div className="mb-5 flex items-center gap-3 rounded-xl bg-teal-50 p-3 text-sm"><UserRound aria-hidden="true" className="h-5 w-5 shrink-0 text-teal-700" /><div><span className="font-semibold">{professional.name}</span><p className="text-xs text-slate-600">{professional.specialty_name || professional.profession_name}</p></div></div>}
      {error && <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {step===1 && <section><h2 className="text-xl font-bold text-slate-900">O que você procura?</h2><p className="mt-1 text-sm text-slate-500">Escolha uma especialidade ou área de atendimento.</p><div className="mt-5 grid gap-3 sm:grid-cols-2">{areas.map(a=><button key={a.name} type="button" onClick={()=>chooseArea(a.name)} className={`${bookingSecondary} justify-start p-4 text-left`}><Stethoscope aria-hidden="true" className="h-5 w-5 shrink-0 text-teal-700"/><div><span className="block">{a.name}</span><span className="text-xs font-normal text-slate-500">{a.professionalIds.length} profissional(is)</span></div><ArrowRight aria-hidden="true" className="ml-auto h-4 w-4 shrink-0"/></button>)}</div>{!areas.length && <BookingEmptyState title="Nenhuma especialidade disponível" description="Não há atendimentos disponíveis para agendamento online no momento."><button className={bookingSecondary} onClick={()=>setRetry(n=>n+1)}>Atualizar disponibilidade</button></BookingEmptyState>}</section>}
      {step===2 && <section className="space-y-4"><div><h2 className="text-xl font-bold text-slate-900">Escolha o profissional</h2><p className="text-sm text-slate-500">{area}</p></div><div className="grid gap-3">{compatible.map(p=><button key={p.id} type="button" aria-pressed={professional?.id===p.id} onClick={()=>chooseProfessional(p)} className={`flex min-h-20 items-center gap-3 rounded-xl border p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 ${professional?.id===p.id?'border-teal-600 bg-teal-50':'border-slate-200 hover:bg-slate-50'}`}>
        {p.photo_url?<img alt={`Foto de ${p.name}`} src={p.photo_url} className="h-12 w-12 shrink-0 rounded-xl object-cover"/>:<span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-800"><UserRound aria-hidden="true"/></span>}<div className="min-w-0"><h3 className="font-semibold text-slate-900">{p.name}</h3><p className="text-sm text-slate-600">{[p.profession_name,p.specialty_name].filter(Boolean).join(' · ')}</p>{p.registration_number&&<p className="text-xs text-slate-500">{p.registration_type} {p.registration_number}</p>}<p className="mt-1 text-xs text-teal-700">{[...new Set(p.services.map((s:any)=>modalityLabel(s.modality)))].join(' · ')}</p></div>{professional?.id===p.id&&<CheckCircle2 aria-hidden="true" className="ml-auto h-5 w-5 shrink-0 text-teal-700"/>}</button>)}</div>{professional&&servicePicker}{!compatible.length&&<BookingEmptyState title="Não encontramos horários disponíveis para esta especialidade no momento."><button className={bookingSecondary} onClick={()=>go(1)}>Escolher outra especialidade</button></BookingEmptyState>}<div className="flex justify-between gap-2"><BookingBackButton onClick={back}/><button className={bookingButton} disabled={!service} onClick={()=>go(3)}>Continuar<ArrowRight aria-hidden="true" className="h-4 w-4"/></button></div></section>}
      {step===3 && <section className="space-y-5"><h2 className="text-xl font-bold text-slate-900">Escolha a data</h2>{servicePicker}{!linkedServices.length ? <BookingEmptyState title="Nenhum atendimento disponível" description="O profissional não possui serviços disponíveis para agendamento online."><button className={bookingSecondary} onClick={()=>setRetry(n=>n+1)}>Atualizar disponibilidade</button></BookingEmptyState> : <><div><label htmlFor="booking-date" className="mb-1 block text-sm font-semibold">Data do atendimento</label><input ref={dateInput} id="booking-date" aria-label="Data do atendimento" className={bookingInput} type="date" min={today()} value={date} onChange={e=>{setDate(e.target.value);setSlot(null);setSlots([]);}}/></div><div className="flex justify-between gap-2">{!individual?<BookingBackButton onClick={back}/>:<span/>}<button className={bookingButton} disabled={!service||!date||date<today()} onClick={()=>go(4)}>Ver horários<Calendar aria-hidden="true" className="h-4 w-4"/></button></div></>}</section>}
      {step===4 && <section className="space-y-5"><div><h2 className="text-xl font-bold text-slate-900">Escolha o horário</h2><p className="text-sm text-slate-500">{new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR')} · {service?.name}</p></div>{loadingSlots?<BookingSkeleton/>:slots.length?<div className="grid grid-cols-3 gap-2 sm:grid-cols-4">{slots.map(s=><button key={s.startTime} type="button" aria-pressed={slot?.startTime===s.startTime} onClick={()=>setSlot(s)} className={`min-h-12 rounded-xl border text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 ${slot?.startTime===s.startTime?'border-teal-700 bg-teal-700 text-white':'border-slate-200 bg-white text-slate-700 hover:border-teal-600'}`}>{s.time}</button>)}</div>:<BookingEmptyState title="Nenhum horário disponível nesta data."><button className={bookingSecondary} onClick={()=>{go(3);setTimeout(()=>dateInput.current?.focus(),0);}}>Escolher outra data</button>{!individual&&<><button className={bookingSecondary} onClick={()=>go(2)}>Escolher outro profissional</button><button className={bookingSecondary} onClick={()=>go(1)}>Voltar para especialidades</button></>}<button className={bookingSecondary} onClick={()=>setReloadSlots(n=>n+1)}>Atualizar horários</button></BookingEmptyState>}<div className="flex justify-between gap-2"><BookingBackButton onClick={back}/><button className={bookingButton} disabled={!slot||loadingSlots} onClick={()=>go(5)}>Continuar<ArrowRight aria-hidden="true" className="h-4 w-4"/></button></div></section>}
      {step===5 && <form onSubmit={confirm} className="space-y-5"><h2 className="text-xl font-bold text-slate-900">Seus dados</h2>{summary}<div className="grid gap-4 sm:grid-cols-2"><div><label htmlFor="booking-name" className="mb-1 block text-sm font-semibold">Nome completo</label><input id="booking-name" autoComplete="name" required minLength={2} maxLength={150} className={bookingInput} value={form.fullName} onChange={e=>setForm({...form,fullName:e.target.value})}/></div><div><label htmlFor="booking-phone" className="mb-1 block text-sm font-semibold">Telefone / WhatsApp</label><input id="booking-phone" type="tel" autoComplete="tel" required maxLength={25} className={bookingInput} value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/></div><div className="sm:col-span-2"><label htmlFor="booking-email" className="mb-1 block text-sm font-semibold">E-mail (opcional)</label><input id="booking-email" type="email" autoComplete="email" maxLength={254} className={bookingInput} value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></div></div><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isChild} onChange={e=>setForm({...form,isChild:e.target.checked})}/> Atendimento de criança ou adolescente</label>{form.isChild&&<div><label htmlFor="booking-guardian" className="mb-1 block text-sm font-semibold">Nome do responsável legal</label><input id="booking-guardian" required maxLength={150} className={bookingInput} value={form.guardianName} onChange={e=>setForm({...form,guardianName:e.target.value})}/></div>}<div><label htmlFor="booking-notes" className="mb-1 block text-sm font-semibold">Observação (opcional)</label><textarea id="booking-notes" rows={2} maxLength={1000} className={bookingInput} placeholder="Evite incluir informações clínicas ou sensíveis." value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></div><div className="flex flex-wrap justify-between gap-2"><button type="button" className={bookingSecondary} disabled={submitting} onClick={back}>Voltar</button><button type="submit" disabled={submitting||!slot} className={bookingButton}>{submitting?'Confirmando…':'Confirmar agendamento'}<CheckCircle2 aria-hidden="true" className="h-4 w-4"/></button></div></form>}
      {step===6&&result&&<section className="space-y-5"><div className="text-center"><CheckCircle2 aria-hidden="true" className="mx-auto mb-3 h-12 w-12 text-teal-700"/><h2 className="text-xl font-bold text-slate-900">Agendamento realizado</h2><p className="mt-1 text-sm text-slate-500">{result.appointmentNumber}</p></div>{summary}<div className="flex flex-wrap justify-center gap-3"><button type="button" className={bookingSecondary} onClick={downloadCalendar}><Calendar aria-hidden="true" className="h-4 w-4"/>Adicionar ao calendário</button><button type="button" className={bookingButton} onClick={reset}>Novo agendamento</button></div></section>}
    </>}
  </PublicBookingShell>;
};
