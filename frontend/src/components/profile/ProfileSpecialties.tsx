import React, { useEffect, useState } from 'react';
import { Edit3, X } from 'lucide-react';
import { ApiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { MyResourcesView } from './MyResourcesView';
import { PracticeArea, MedicalTreeResponse } from '../../types/capabilities';

interface Resources {
  professionId: string;
  commercialModule: string;
  availableAreas: PracticeArea[];
  practiceAreaIds: string[];
  medicalTree?: MedicalTreeResponse;
  medicalHierarchy?: { specialtyIds?: string[]; specialties?: string[]; practiceAreaIds?: string[]; practiceAreas?: string[] };
}

// All reads and writes target the authenticated user's existing resources endpoints.
export function ProfileSpecialties() {
  const { currentUser, currentTenant } = useAuth();
  const [data, setData] = useState<Resources | null>(null);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const load = async () => {
    const resources = await ApiClient.get<Resources>('/v1/capabilities/my-resources');
    setData(resources); setError(false);
  };
  useEffect(() => {
    let active = true;
    setData(null); setError(false); setOpen(false);
    ApiClient.get<Resources>('/v1/capabilities/my-resources').then(resources => {
      if (active) setData(resources);
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [currentUser?.id, currentTenant?.id]);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const close = document.getElementById('profile-specialties-close');
    close?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) setOpen(false);
      if (event.key === 'Tab') {
        const items = Array.from(document.querySelectorAll<HTMLElement>('#profile-specialties-dialog button:not(:disabled), #profile-specialties-dialog input:not(:disabled), #profile-specialties-dialog [tabindex="0"]'));
        const first = items[0], last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', keyboard);
    return () => { document.removeEventListener('keydown', keyboard); previous?.focus(); };
  }, [open, saving]);
  const medical = data?.commercialModule === 'ZemdaMed' || data?.professionId === 'prof-medico';
  const specialtyIds = data?.medicalHierarchy?.specialtyIds || data?.medicalHierarchy?.specialties || [];
  const areaIds = medical ? data?.medicalHierarchy?.practiceAreaIds || data?.medicalHierarchy?.practiceAreas || [] : data?.practiceAreaIds || [];
  const chips = medical
    ? (data?.medicalTree?.specialties || []).flatMap(spec => [
      ...(specialtyIds.includes(spec.id) ? [{ id: spec.id, name: spec.name }] : []),
      ...(spec.practiceAreas || []).filter(area => areaIds.includes(area.id))
    ])
    : (data?.availableAreas || []).filter(area => areaIds.includes(area.id));
  return <div className="sm:col-span-2">
    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
      <h4 className="font-semibold text-slate-700">ESPECIALIDADES / ÁREAS DE ATUAÇÃO</h4>
      <button type="button" onClick={() => setOpen(true)} className="text-xs font-semibold text-teal-700 hover:text-teal-900 hover:underline inline-flex items-center gap-1 cursor-pointer"><Edit3 className="w-3.5 h-3.5" /><span>Editar especialidades</span></button>
    </div>
    <div className="flex flex-wrap gap-2">
      {chips.map(chip => <span key={chip.id} className="rounded-full border border-teal-100 bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800">{chip.name}</span>)}
      {!chips.length && <p className="text-slate-500">{error ? 'Não foi possível carregar as especialidades.' : !data ? 'Carregando especialidades…' : 'Nenhuma especialidade selecionada.'}</p>}
    </div>
    {open && <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div id="profile-specialties-dialog" role="dialog" aria-modal="true" aria-labelledby="profile-specialties-title" className="w-full max-w-4xl max-h-[90dvh] overflow-y-auto rounded-3xl border border-slate-200 bg-white shadow-2xl p-4 sm:p-6">
        <div className="flex items-center justify-between gap-3 mb-4"><h3 id="profile-specialties-title" className="text-base font-bold text-slate-900">Editar especialidades</h3><button id="profile-specialties-close" type="button" disabled={saving} onClick={() => setOpen(false)} aria-label="Fechar" className="p-2 rounded-xl hover:bg-slate-100 disabled:opacity-50"><X className="w-5 h-5" /></button></div>
        <MyResourcesView areasOnly onSavingChange={setSaving} onAreasSaved={async () => { await load(); setSaving(false); setOpen(false); }} />
      </div>
    </div>}
  </div>;
}
