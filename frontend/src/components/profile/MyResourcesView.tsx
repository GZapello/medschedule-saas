import React, { useState, useEffect } from 'react';
import { ApiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  Sparkles,
  CheckCircle2,
  Sliders,
  Shield,
  Layers,
  ArrowRight,
  RefreshCw,
  Info,
  Check,
  Plus,
  HelpCircle,
  Stethoscope,
  ChevronDown,
  ChevronRight
} from 'lucide-react';
import { PracticeArea, Capability, ComputedUserCapabilities, MedicalTreeResponse, MedicalSpecialtyItem } from '../../types/capabilities';

export const MyResourcesView: React.FC = () => {
  const { currentUser, reloadSession } = useAuth();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<{
    professionId: string;
    commercialModule: string;
    practiceAreaIds: string[];
    activeCapabilities: string[];
    defaultCapabilities: string[];
    availableOptionalCapabilities: string[];
    selectedOptionalCapabilities: string[];
    hiddenCapabilities: string[];
    availableAreas: PracticeArea[];
    catalog: Capability[];
    medicalTree?: MedicalTreeResponse | null;
    medicalHierarchy?: { specialtyIds?: string[]; practiceAreaIds?: string[]; specialties?: string[]; practiceAreas?: string[] } | null;
  } | null>(null);

  const [selectedOptionals, setSelectedOptionals] = useState<string[]>([]);
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);
  const [selectedMedicalSpecialties, setSelectedMedicalSpecialties] = useState<string[]>([]);
  const [selectedMedicalPracticeAreas, setSelectedMedicalPracticeAreas] = useState<string[]>([]);
  const [expandedMedicalSpecialties, setExpandedMedicalSpecialties] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'resources' | 'areas'>('resources');

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await ApiClient.get<any>('/v1/capabilities/my-resources');
      setData(res);
      setSelectedOptionals(res.selectedOptionalCapabilities || []);
      setSelectedAreas(res.practiceAreaIds || []);
      if (res.medicalHierarchy) {
        const specs = res.medicalHierarchy.specialtyIds || res.medicalHierarchy.specialties || [];
        const pas = res.medicalHierarchy.practiceAreaIds || res.medicalHierarchy.practiceAreas || [];
        setSelectedMedicalSpecialties(specs);
        setSelectedMedicalPracticeAreas(pas);
        setExpandedMedicalSpecialties(specs.length > 0 ? specs : ['med-spec-clinica']);
      }
    } catch (err: any) {
      console.error('Erro ao carregar recursos:', err);
      showToast(err.message || 'Erro ao carregar seus recursos profissionais', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleToggleOptional = (capId: string) => {
    setSelectedOptionals(prev =>
      prev.includes(capId) ? prev.filter(id => id !== capId) : [...prev, capId]
    );
  };

  const handleToggleArea = (areaId: string) => {
    setSelectedAreas(prev =>
      prev.includes(areaId) ? prev.filter(id => id !== areaId) : [...prev, areaId]
    );
  };

  const handleSaveOptionals = async () => {
    try {
      setSaving(true);
      const res = await ApiClient.put<ComputedUserCapabilities>('/v1/capabilities/my-resources', {
        optionalCapabilities: selectedOptionals
      });
      setSelectedOptionals(res.selectedOptionalCapabilities);
      await reloadSession();
      showToast('Recursos profissionais atualizados com sucesso!', 'success');
      await loadData();
    } catch (err: any) {
      console.error('Erro ao salvar recursos:', err);
      showToast(err.message || 'Erro ao atualizar recursos', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAreas = async () => {
    try {
      setSaving(true);
      const res = await ApiClient.put<ComputedUserCapabilities>('/v1/capabilities/my-practice-areas', {
        practiceAreaIds: selectedAreas
      });
      setSelectedAreas(res.practiceAreaIds);
      await reloadSession();
      showToast('Áreas de atuação e abordagens atualizadas com sucesso!', 'success');
      await loadData();
    } catch (err: any) {
      console.error('Erro ao salvar áreas:', err);
      showToast(err.message || 'Erro ao atualizar áreas de atuação', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveMedicalHierarchy = async () => {
    try {
      if (selectedMedicalSpecialties.length === 0) {
        showToast('Selecione pelo menos uma especialidade médica.', 'error');
        return;
      }
      setSaving(true);
      await ApiClient.put('/v1/capabilities/my-medical-hierarchy', {
        specialtyIds: selectedMedicalSpecialties,
        practiceAreaIds: selectedMedicalPracticeAreas
      });
      await reloadSession();
      showToast('Especialidades e áreas médicas atualizadas com sucesso!', 'success');
      await loadData();
    } catch (err: any) {
      console.error('Erro ao salvar hierarquia médica:', err);
      showToast(err.message || 'Erro ao atualizar especialidades e áreas médicas', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-slate-500">
        <RefreshCw className="w-8 h-8 animate-spin text-teal-600 mb-3" />
        <p className="text-sm font-medium">Carregando seu catálogo clínico e recursos...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-8 text-center text-slate-500 bg-white rounded-2xl border border-slate-200">
        <Info className="w-8 h-8 text-slate-400 mx-auto mb-2" />
        <p>Não foi possível carregar as informações de recursos profissionais.</p>
        <button
          onClick={loadData}
          className="mt-4 px-4 py-2 bg-teal-600 text-white font-bold text-xs rounded-xl"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  const categoryLabels: Record<string, string> = {
    clinical_core: 'Prontuário & Atendimento Clínico',
    assessment: 'Avaliação, Escalas & Testes',
    planning: 'Planejamento Terapêutico & Metas',
    body_evolution: 'Evolução Corporal & Registro Fotográfico',
    records_documents: 'Atestados, Relatórios & Documentos',
    communication: 'Comunicação & Mensagens',
    business: 'Gestão, Financeiro & Agendamentos',
    specialty: 'Recursos Especializados de Nicho'
  };

  const availableOptionalCaps = data.catalog.filter(c =>
    data.availableOptionalCapabilities.includes(c.id)
  );

  const defaultCaps = data.catalog.filter(c =>
    data.defaultCapabilities.includes(c.id)
  );

  // Agrupamento por categoria dos opcionais
  const groupedOptionals: Record<string, Capability[]> = {};
  for (const cap of availableOptionalCaps) {
    const cat = cap.category || 'specialty';
    if (!groupedOptionals[cat]) groupedOptionals[cat] = [];
    groupedOptionals[cat].push(cap);
  }

  const isMedicalUser = data.commercialModule === 'ZemdaMed' || data.professionId === 'prof-medico';

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header com identidade da profissão e módulo */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-teal-950 p-6 sm:p-8 rounded-3xl text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 w-80 h-80 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-teal-500/20 text-teal-300 border border-teal-500/30">
                <Sparkles className="w-3.5 h-3.5" />
                Autonomia Clínica Individual
              </span>
              <span className="text-xs px-2.5 py-1 rounded-full bg-white/10 text-white font-bold border border-white/10">
                {data.commercialModule}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
              Meus Recursos Profissionais
            </h1>
            <p className="text-slate-300 text-sm mt-1 max-w-2xl font-medium">
              Você tem total liberdade para ativar ou desativar ferramentas clínicas compatíveis com sua atuação profissional, sem necessitar de aprovação da clínica.
            </p>
          </div>

          <div className="flex items-center gap-2 bg-white/10 backdrop-blur-md p-1.5 rounded-2xl border border-white/10 shrink-0">
            <button
              onClick={() => setActiveTab('resources')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'resources'
                  ? 'bg-white text-slate-900 shadow-md'
                  : 'text-slate-200 hover:text-white'
              }`}
            >
              Ferramentas & Recursos
            </button>
            <button
              onClick={() => setActiveTab('areas')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'areas'
                  ? 'bg-white text-slate-900 shadow-md'
                  : 'text-slate-200 hover:text-white'
              }`}
            >
              {isMedicalUser
                ? `Especialidades & Subáreas (${selectedMedicalSpecialties.length})`
                : `Áreas de Atuação (${selectedAreas.length})`}
            </button>
          </div>
        </div>
      </div>

      {activeTab === 'resources' ? (
        <div className="space-y-6">
          {/* Seção 1: Recursos Opcionais Compatíveis (Ativáveis pelo profissional) */}
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-xs space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div>
                <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                  <Sliders className="w-5 h-5 text-teal-600" />
                  Recursos Opcionais Compatíveis
                </h2>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  Ative ferramentas complementares para enriquecer seu prontuário e rotina de atendimento.
                </p>
              </div>

              <button
                onClick={handleSaveOptionals}
                disabled={saving}
                className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs sm:text-sm rounded-2xl shadow-md shadow-teal-700/20 transition-all cursor-pointer flex items-center justify-center gap-2 shrink-0 disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Salvando...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 stroke-[3]" />
                    <span>Salvar Minhas Preferências</span>
                  </>
                )}
              </button>
            </div>

            {Object.keys(groupedOptionals).length === 0 ? (
              <div className="p-6 text-center text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                <Info className="w-6 h-6 mx-auto mb-2 text-slate-300" />
                <p className="text-xs">Todos os recursos recomendados para sua profissão já vêm inclusos por padrão!</p>
              </div>
            ) : (
              <div className="space-y-6">
                {Object.entries(groupedOptionals).map(([cat, caps]) => (
                  <div key={cat} className="space-y-3">
                    <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />
                      {categoryLabels[cat] || cat}
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {caps.map(cap => {
                        const isEnabled = selectedOptionals.includes(cap.id);
                        return (
                          <div
                            key={cap.id}
                            onClick={() => handleToggleOptional(cap.id)}
                            className={`p-4 rounded-2xl border transition-all cursor-pointer select-none flex flex-col justify-between ${
                              isEnabled
                                ? 'border-teal-500 bg-teal-50/70 shadow-xs ring-1 ring-teal-500'
                                : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <span className={`text-xs font-black ${isEnabled ? 'text-teal-950' : 'text-slate-800'}`}>
                                {cap.name}
                              </span>
                              <div
                                className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 border transition-all ${
                                  isEnabled
                                    ? 'bg-teal-600 border-teal-600 text-white'
                                    : 'border-slate-300 bg-white'
                                }`}
                              >
                                {isEnabled && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                              </div>
                            </div>
                            <p className="text-[11px] text-slate-600 mt-2 font-medium leading-relaxed">
                              {cap.description}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Seção 2: Recursos Base Já Inclusos por Padrão */}
          <div className="bg-slate-50 rounded-3xl p-6 sm:p-8 border border-slate-200/80 space-y-4">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-emerald-600" />
              <h2 className="text-base font-black text-slate-800">
                Recursos Fundamentais Inclusos por Padrão ({defaultCaps.length})
              </h2>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              Estes recursos foram pré-configurados para a sua profissão e compõem o núcleo essencial do seu prontuário e atendimento.
            </p>

            <div className="flex flex-wrap gap-2 pt-2">
              {defaultCaps.map(cap => (
                <div
                  key={cap.id}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-700 text-xs font-bold shadow-2xs"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>{cap.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* Aba Áreas de Atuação e Abordagens / Especialidades Médicas */
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                {isMedicalUser ? (
                  <>
                    <Stethoscope className="w-5 h-5 text-teal-600" />
                    <span>Minhas Especialidades Médicas & Subáreas (ZemdaMed)</span>
                  </>
                ) : (
                  <>
                    <Layers className="w-5 h-5 text-teal-600" />
                    <span>Minhas Áreas de Atuação & Abordagens Clínicas</span>
                  </>
                )}
              </h2>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                {isMedicalUser
                  ? 'Selecione suas especialidades médicas e subáreas clínicas. O sistema recalcula automaticamente as anamneses, escalas e presets no ZemdaMed.'
                  : 'Ao selecionar suas áreas, o sistema recalcula automaticamente os recursos compatíveis.'}
              </p>
            </div>

            <button
              onClick={isMedicalUser ? handleSaveMedicalHierarchy : handleSaveAreas}
              disabled={saving}
              className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs sm:text-sm rounded-2xl shadow-md shadow-teal-700/20 transition-all cursor-pointer flex items-center justify-center gap-2 shrink-0 disabled:opacity-50"
            >
              {saving ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Salvando...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 stroke-[3]" />
                  <span>{isMedicalUser ? 'Salvar Especialidades Médicas' : 'Salvar Áreas de Atuação'}</span>
                </>
              )}
            </button>
          </div>

          {isMedicalUser ? (
            /* VISÃO MÉDICA HIERÁRQUICA DO ZEMDAMED */
            <div className="space-y-3">
              {(!data.medicalTree?.specialties || data.medicalTree.specialties.length === 0) ? (
                <div className="p-8 text-center text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  <Info className="w-6 h-6 mx-auto mb-2 text-slate-300" />
                  <p className="text-xs">Catálogo médico não disponível no momento.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {data.medicalTree.specialties.map(spec => {
                    const isSpecSelected = selectedMedicalSpecialties.includes(spec.id);
                    const isExpanded = expandedMedicalSpecialties.includes(spec.id);
                    const specSubareas = spec.practiceAreas || [];
                    const selectedSubCount = specSubareas.filter(pa => selectedMedicalPracticeAreas.includes(pa.id)).length;

                    return (
                      <div
                        key={spec.id}
                        className={`rounded-2xl border transition-all overflow-hidden ${
                          isSpecSelected
                            ? 'border-teal-500 bg-teal-50/40 shadow-xs'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        {/* Header da Especialidade */}
                        <div className="p-4 sm:p-5 flex items-center justify-between gap-3">
                          <div
                            onClick={() => {
                              if (isSpecSelected) {
                                setSelectedMedicalSpecialties(prev => prev.filter(id => id !== spec.id));
                                const childIds = new Set(specSubareas.map(pa => pa.id));
                                setSelectedMedicalPracticeAreas(prev => prev.filter(id => !childIds.has(id)));
                              } else {
                                setSelectedMedicalSpecialties(prev => [...prev, spec.id]);
                                if (!isExpanded) {
                                  setExpandedMedicalSpecialties(prev => [...prev, spec.id]);
                                }
                              }
                            }}
                            className="flex items-center gap-3.5 min-w-0 flex-1 cursor-pointer select-none"
                          >
                            <div
                              className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 border transition-all ${
                                isSpecSelected
                                  ? 'bg-teal-600 border-teal-600 text-white shadow-xs'
                                  : 'border-slate-300 bg-white'
                              }`}
                            >
                              {isSpecSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`text-sm sm:text-base font-black ${isSpecSelected ? 'text-teal-950' : 'text-slate-800'}`}>
                                  {spec.name}
                                </span>
                                {selectedSubCount > 0 && (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-600 text-white">
                                    {selectedSubCount} subárea(s)
                                  </span>
                                )}
                              </div>
                              {spec.description && (
                                <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">
                                  {spec.description}
                                </p>
                              )}
                            </div>
                          </div>

                          {specSubareas.length > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                setExpandedMedicalSpecialties(prev =>
                                  isExpanded ? prev.filter(id => id !== spec.id) : [...prev, spec.id]
                                );
                              }}
                              className="p-2 rounded-xl hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors shrink-0 cursor-pointer"
                              title={isExpanded ? 'Recolher subáreas' : 'Expandir subáreas'}
                            >
                              {isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                            </button>
                          )}
                        </div>

                        {/* Subáreas da Especialidade */}
                        {isExpanded && specSubareas.length > 0 && (
                          <div className="px-4 pb-4 pt-2 border-t border-teal-100/70 bg-white/70">
                            <p className="text-xs font-extrabold text-slate-600 mb-2.5">
                              Áreas de Atuação / Subáreas de {spec.name}:
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                              {specSubareas.map(sub => {
                                const isSubSelected = selectedMedicalPracticeAreas.includes(sub.id);
                                return (
                                  <div
                                    key={sub.id}
                                    onClick={() => {
                                      if (isSubSelected) {
                                        setSelectedMedicalPracticeAreas(prev => prev.filter(id => id !== sub.id));
                                      } else {
                                        setSelectedMedicalPracticeAreas(prev => [...prev, sub.id]);
                                        if (!isSpecSelected) {
                                          setSelectedMedicalSpecialties(prev => [...prev, spec.id]);
                                        }
                                      }
                                    }}
                                    className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all flex items-start gap-2.5 select-none ${
                                      isSubSelected
                                        ? 'border-teal-500 bg-teal-50/90 text-teal-950 font-bold shadow-2xs'
                                        : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs'
                                    }`}
                                  >
                                    <div
                                      className={`w-4 h-4 mt-0.5 rounded flex items-center justify-center shrink-0 border ${
                                        isSubSelected ? 'bg-teal-600 border-teal-600 text-white' : 'border-slate-300'
                                      }`}
                                    >
                                      {isSubSelected && <Check className="w-3 h-3 stroke-[3]" />}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <span className="text-xs block leading-tight">{sub.name}</span>
                                      {sub.description && (
                                        <span className="text-[10px] text-slate-400 block truncate mt-0.5">{sub.description}</span>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            /* VISÃO PADRÃO PARA DEMAIS PROFISSÕES */
            data.availableAreas.length === 0 ? (
              <div className="p-8 text-center text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                <Info className="w-6 h-6 mx-auto mb-2 text-slate-300" />
                <p className="text-xs">Não há áreas especializadas específicas cadastradas para sua profissão.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {data.availableAreas.map(area => {
                  const isSelected = selectedAreas.includes(area.id);
                  return (
                    <div
                      key={area.id}
                      onClick={() => handleToggleArea(area.id)}
                      className={`p-4 rounded-2xl border transition-all cursor-pointer select-none flex flex-col justify-between ${
                        isSelected
                          ? 'border-teal-500 bg-teal-50/70 shadow-xs ring-1 ring-teal-500'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <span className={`text-xs font-black ${isSelected ? 'text-teal-950' : 'text-slate-800'}`}>
                            {area.name}
                          </span>
                          <span
                            className={`text-[9px] px-2 py-0.5 rounded-md font-bold uppercase shrink-0 ${
                              area.type === 'approach'
                                ? 'bg-purple-100 text-purple-700'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {area.type === 'approach' ? 'Abordagem' : 'Especialidade'}
                          </span>
                        </div>
                        {area.description && (
                          <p className="text-[11px] text-slate-600 mt-2 font-medium leading-relaxed">
                            {area.description}
                          </p>
                        )}
                      </div>

                      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                        <span className="text-[11px] text-slate-400">
                          {isSelected ? 'Ativo no perfil' : 'Clique para ativar'}
                        </span>
                        <div
                          className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 border transition-all ${
                            isSelected
                              ? 'bg-teal-600 border-teal-600 text-white'
                              : 'border-slate-300 bg-white'
                          }`}
                        >
                          {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
};
