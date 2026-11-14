import React, { useState, useEffect } from 'react';
import { ApiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  FlaskConical,
  Play,
  RotateCcw,
  CheckCircle2,
  Sliders,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  LogOut,
  Stethoscope,
  Building2,
  UserCheck,
  AlertTriangle,
  Database,
  ShieldCheck,
  X
} from 'lucide-react';
import {
  PracticeArea,
  SandboxSession,
  SandboxEnvironmentStatus,
  MedicalSpecialtyItem
} from '../../types/capabilities';
import { REGISTRATION_PROFESSIONS } from '../../types/professions';

const ESTABLISHMENT_PROFILES = [
  {
    id: 'clinic' as const,
    name: 'Clínica / Consultório',
    desc: 'Agenda de atendimentos clínicos, prontuários, convênios e documentos.'
  },
  {
    id: 'studio' as const,
    name: 'Studio / Academia',
    desc: 'Turmas coletivas, treinos, pacotes, recorrências e reservas de alunos.'
  },
  {
    id: 'mixed' as const,
    name: 'Estabelecimento Misto',
    desc: 'Combina atendimentos individuais e turmas/pacotes no mesmo espaço.'
  }
];

const SANDBOX_STATUS_BADGES: Record<string, { label: string; className: string }> = {
  ready: { label: 'Pronto', className: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/40' },
  in_use: { label: 'Em utilização', className: 'bg-sky-500/20 text-sky-200 border-sky-400/40' },
  resetting: { label: 'Restaurando...', className: 'bg-amber-500/20 text-amber-200 border-amber-400/40' },
  error: { label: 'Erro no Reset', className: 'bg-rose-500/20 text-rose-200 border-rose-400/40' },
  unprovisioned: { label: 'Não provisionado', className: 'bg-slate-500/20 text-slate-200 border-slate-400/40' }
};

export const SuperAdminLaboratoryView: React.FC = () => {
  const { startSandboxSession, isSandboxSession, exitSandboxSession } = useAuth();
  const { showToast } = useToast();

  const [professions, setProfessions] = useState<any[]>(REGISTRATION_PROFESSIONS);
  const [selectedProfId, setSelectedProfId] = useState<string>('prof-medico');
  const [practiceAreas, setPracticeAreas] = useState<PracticeArea[]>([]);
  const [selectedAreaIds, setSelectedAreaIds] = useState<string[]>(['med-spec-clinica']);
  const [medicalTree, setMedicalTree] = useState<MedicalSpecialtyItem[]>([]);
  const [expandedSpecs, setExpandedSpecs] = useState<string[]>(['med-spec-clinica']);
  const [selectedPlanCode, setSelectedPlanCode] = useState<string>('ALL');
  const [establishmentProfile, setEstablishmentProfile] = useState<'clinic' | 'studio' | 'mixed'>('clinic');

  const [envStatus, setEnvStatus] = useState<SandboxEnvironmentStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [legacyReport, setLegacyReport] = useState<any | null>(null);
  const [showLegacyPanel, setShowLegacyPanel] = useState(false);

  const [loadingAreas, setLoadingAreas] = useState(false);
  const [startingMode, setStartingMode] = useState<'manager' | 'professional' | null>(null);
  const [isResetting, setIsResetting] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);

  const loadSandboxStatus = async () => {
    try {
      setLoadingStatus(true);
      const status = await ApiClient.get<SandboxEnvironmentStatus>('/v1/sandbox/status');
      setEnvStatus(status);
      if (status?.environment?.establishmentProfile) {
        setEstablishmentProfile(status.environment.establishmentProfile);
      }
      if (status?.environment?.planCode) {
        setSelectedPlanCode(status.environment.planCode);
      }
    } catch (err) {
      console.warn('Erro ao consultar status do Ambiente de Teste:', err);
    } finally {
      setLoadingStatus(false);
    }
  };

  useEffect(() => {
    void loadSandboxStatus();
  }, []);

  const loadLegacyReport = async () => {
    if (legacyReport) {
      setShowLegacyPanel(prev => !prev);
      return;
    }
    try {
      const report = await ApiClient.get<any>('/v1/sandbox/legacy-report');
      setLegacyReport(report);
      setShowLegacyPanel(true);
    } catch (err: any) {
      showToast(err.message || 'Erro ao carregar diagnóstico de sandboxes legados', 'error');
    }
  };

  // Carrega catálogo dinâmico de profissões ativas do SuperAdmin
  useEffect(() => {
    ApiClient.get<any[]>('/v1/taxonomy/professions')
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setProfessions(data);
          if (!data.some(p => p.id === selectedProfId)) {
            setSelectedProfId(data[0].id);
          }
        }
      })
      .catch(err => {
        console.warn('Erro ao carregar catálogo dinâmico no Laboratório:', err);
      });
  }, []);

  // Carrega áreas de atuação quando troca de profissão
  useEffect(() => {
    let isCurrent = true;
    setLoadingAreas(true);
    ApiClient.get<PracticeArea[]>(`/v1/capabilities/practice-areas?professionId=${encodeURIComponent(selectedProfId)}`)
      .then(res => {
        if (isCurrent && Array.isArray(res)) {
          setPracticeAreas(res);
          if (res.length > 0) {
            const inferred = res.find(a => a.isInferredForAlias);
            setSelectedAreaIds([inferred ? inferred.id : res[0].id]);
          } else {
            setSelectedAreaIds([]);
          }
        }
      })
      .catch(() => {
        if (isCurrent) setPracticeAreas([]);
      })
      .finally(() => {
        if (isCurrent) setLoadingAreas(false);
      });

    return () => { isCurrent = false; };
  }, [selectedProfId]);

  // Carrega árvore médica completa se for Medicina genérica
  useEffect(() => {
    if (selectedProfId !== 'prof-medico') return;
    if (medicalTree.length > 0) return;

    ApiClient.get<any>('/v1/taxonomy/medical-tree')
      .then(res => {
        const list = Array.isArray(res) ? res : (res?.specialties || []);
        setMedicalTree(list);
      })
      .catch(err => {
        console.warn('Erro ao carregar árvore médica no laboratório:', err);
      });
  }, [selectedProfId, medicalTree.length]);

  const handleToggleArea = (areaId: string) => {
    setSelectedAreaIds(prev =>
      prev.includes(areaId) ? prev.filter(id => id !== areaId) : [...prev, areaId]
    );
  };

  const handleStartSession = async (mode: 'manager' | 'professional') => {
    try {
      setStartingMode(mode);
      const res = await ApiClient.post<SandboxSession>('/v1/sandbox/create-session', {
        mode,
        establishmentProfile,
        professionId: mode === 'professional' ? selectedProfId : undefined,
        practiceAreaIds: mode === 'professional' ? selectedAreaIds : [],
        planCode: selectedPlanCode
      });

      startSandboxSession({
        token: res.token,
        user: res.user,
        tenant: res.tenant,
        capabilities: res.capabilities
      });

      showToast(
        mode === 'manager'
          ? `Ambiente de Teste ativado como Gestor de Teste (${ESTABLISHMENT_PROFILES.find(p => p.id === establishmentProfile)?.name || establishmentProfile})`
          : `Ambiente de Teste ativado como Profissional: ${res.user?.professionName || selectedProfId}`,
        'success'
      );
      window.history.pushState(null, '', '/');
      window.dispatchEvent(new PopStateEvent('popstate'));
    } catch (err: any) {
      console.error('Erro ao iniciar sessão do Laboratório:', err);
      showToast(err.message || 'Erro ao inicializar sessão de teste no Laboratório Zemda', 'error');
    } finally {
      setStartingMode(null);
    }
  };

  const handleConfirmReset = async () => {
    try {
      setIsResetting(true);
      await ApiClient.post('/v1/sandbox/reset', {});
      setShowResetModal(false);
      showToast('Dados do Ambiente de Teste restaurados com sucesso! A conta do Gestor e Profissional foram preservadas.', 'success');
      await loadSandboxStatus();
    } catch (err: any) {
      console.error('Erro ao restaurar Ambiente de Teste:', err);
      showToast(err.message || 'Erro ao restaurar dados de teste do ambiente', 'error');
      await loadSandboxStatus();
    } finally {
      setIsResetting(false);
    }
  };

  const statusMeta = SANDBOX_STATUS_BADGES[envStatus?.status || 'unprovisioned'] || SANDBOX_STATUS_BADGES.unprovisioned;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Top Banner Laboratório */}
      <div className="bg-gradient-to-r from-purple-950 via-slate-900 to-indigo-950 text-white p-6 sm:p-8 rounded-3xl shadow-xl relative overflow-hidden">
        <div className="absolute -right-10 -bottom-10 w-80 h-80 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                <FlaskConical className="w-3.5 h-3.5" />
                Laboratório SuperAdmin Zemda
              </span>
              <span className={`text-xs px-2.5 py-1 rounded-full font-bold border ${statusMeta.className}`}>
                {loadingStatus ? 'Verificando ambiente...' : `Ambiente de Teste: ${statusMeta.label}`}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
              Ambiente de Teste Reutilizável & Sandbox
            </h1>
            <p className="text-slate-300 text-sm mt-1 max-w-2xl font-medium">
              Acesse o ambiente de testes persistente como Gestor de Teste ou Profissional sem criar clínicas ou contas comerciais a cada simulação.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {isSandboxSession ? (
              <button
                onClick={exitSandboxSession}
                className="px-5 py-3 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs sm:text-sm rounded-2xl shadow-lg shadow-rose-700/30 transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <LogOut className="w-4 h-4" />
                <span>Sair do Laboratório</span>
              </button>
            ) : (
              <>
                <button
                  onClick={() => handleStartSession('manager')}
                  disabled={startingMode !== null}
                  className="px-5 py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs sm:text-sm rounded-2xl shadow-lg shadow-emerald-900/30 transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {startingMode === 'manager' ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Building2 className="w-4 h-4" />
                  )}
                  <span>Entrar como Gestor de Teste</span>
                </button>
                <button
                  onClick={() => handleStartSession('professional')}
                  disabled={startingMode !== null}
                  className="px-5 py-3.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black text-xs sm:text-sm rounded-2xl shadow-lg shadow-purple-900/30 transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {startingMode === 'professional' ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4 fill-current" />
                  )}
                  <span>Entrar como Profissional</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Garantias de Isolamento Estrito */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 bg-white rounded-2xl border border-slate-200 flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-bold text-slate-900 truncate">WhatsApp & Agenda</div>
            <div className="text-[10px] text-slate-500 font-medium">Envio Externo Bloqueado</div>
          </div>
        </div>

        <div className="p-3.5 bg-white rounded-2xl border border-slate-200 flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-bold text-slate-900 truncate">E-mails (Resend)</div>
            <div className="text-[10px] text-slate-500 font-medium">Disparos Suprimidos</div>
          </div>
        </div>

        <div className="p-3.5 bg-white rounded-2xl border border-slate-200 flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-bold text-slate-900 truncate">Cobrança Asaas</div>
            <div className="text-[10px] text-slate-500 font-medium">Zero Faturas Reais</div>
          </div>
        </div>

        <div className="p-3.5 bg-white rounded-2xl border border-slate-200 flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-bold text-slate-900 truncate">Identidade Fixa</div>
            <div className="text-[10px] text-slate-500 font-medium">Fora das Métricas Reais</div>
          </div>
        </div>
      </div>

      {/* Painel do Ambiente Provisionado + Botão Restaurar */}
      <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-black text-slate-900">
                Ambiente de Teste Persistente
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {envStatus?.provisioned && envStatus.environment
                  ? `${envStatus.environment.name} · Contas reutilizadas entre todas as simulações (0 novas clínicas criadas).`
                  : 'Será provisionado automaticamente na primeira simulação com contas dedicadas de Gestor e Profissional.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void loadSandboxStatus()}
              disabled={loadingStatus}
              className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-bold text-slate-700 flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingStatus ? 'animate-spin' : ''}`} />
              <span>Atualizar</span>
            </button>
            <button
              type="button"
              onClick={() => setShowResetModal(true)}
              disabled={!envStatus?.provisioned || isResetting}
              className="px-4 py-2 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Restaurar Dados de Teste</span>
            </button>
          </div>
        </div>

        {envStatus?.lastError && (
          <div className="p-3.5 rounded-2xl border border-rose-200 bg-rose-50 text-xs text-rose-800 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Falha registrada no último reset:</span> {envStatus.lastError}
            </div>
          </div>
        )}

        {envStatus?.provisioned && envStatus.environment && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Gestor de Teste Reutilizável</div>
              <div className="font-bold text-slate-800 truncate">{envStatus.environment.managerEmail}</div>
              <div className="text-[11px] text-slate-500">Papel: clinic_admin (sem login público)</div>
            </div>
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Profissional de Teste</div>
              <div className="font-bold text-slate-800 truncate">{envStatus.environment.professionalEmail}</div>
              <div className="text-[11px] text-slate-500">Troca de profissão in-place preservando histórico</div>
            </div>
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Volume & Restauraçōes</div>
              <div className="font-bold text-slate-800">
                {envStatus.counts?.patients ?? 0} pacientes · {envStatus.counts?.appointments ?? 0} agendamentos · {envStatus.counts?.services ?? 0} serviços
              </div>
              <div className="text-[11px] text-slate-500">
                Resets executados: {envStatus.environment.resetCount} {envStatus.environment.lastResetAt ? `· Último: ${new Date(envStatus.environment.lastResetAt).toLocaleString('pt-BR')}` : ''}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Configuração do Perfil de Simulação */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-xs space-y-6">
        {/* Perfil do Estabelecimento */}
        <div className="space-y-3">
          <h2 className="text-base font-black text-slate-900 flex items-center gap-2 pb-3 border-b border-slate-100">
            <Building2 className="w-5 h-5 text-emerald-600" />
            1. Perfil do Estabelecimento Simulado (Gestor & Equipe)
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {ESTABLISHMENT_PROFILES.map(profile => {
              const isSelected = establishmentProfile === profile.id;
              return (
                <button
                  type="button"
                  key={profile.id}
                  onClick={() => setEstablishmentProfile(profile.id)}
                  className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
                    isSelected
                      ? 'border-emerald-600 bg-emerald-50/70 ring-2 ring-emerald-600 shadow-xs'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className={`text-xs font-black ${isSelected ? 'text-emerald-950' : 'text-slate-800'}`}>
                    {profile.name}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                    {profile.desc}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <h2 className="text-base font-black text-slate-900 flex items-center gap-2 pb-3 border-b border-slate-100 pt-2">
          <Sliders className="w-5 h-5 text-purple-600" />
          2. Profissão & Especialidade (para Simulação de Profissional)
        </h2>

        {/* Grade de Profissões */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
          {professions.map(prof => {
            const isSelected = selectedProfId === prof.id;
            return (
              <button
                type="button"
                key={prof.id}
                onClick={() => setSelectedProfId(prof.id)}
                className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                  isSelected
                    ? 'border-purple-600 bg-purple-50/80 shadow-xs ring-2 ring-purple-600'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <div className={`text-xs font-black truncate ${isSelected ? 'text-purple-950' : 'text-slate-800'}`}>
                  {prof.label || prof.name}
                </div>
                <div className="text-[10px] text-slate-500 font-medium truncate mt-0.5">
                  {prof.boardLabel || prof.registration_board_label || 'Profissional'}
                </div>
              </button>
            );
          })}
        </div>

        {/* Áreas de Atuação & Especialidades */}
        <div className="pt-4 border-t border-slate-100 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
              {selectedProfId === 'prof-medico' && <Stethoscope className="w-3.5 h-3.5 text-purple-600" />}
              <span>{selectedProfId === 'prof-medico' ? '2. Especialidades Médicas & Subáreas (ZemdaMed)' : '2. Áreas de Atuação & Abordagens Clínicas'}</span>
            </h3>
            <span className="text-[11px] font-medium text-slate-500">
              {selectedAreaIds.length} selecionada(s)
            </span>
          </div>

          {selectedProfId === 'prof-medico' && medicalTree.length > 0 ? (
            /* Visualização da Árvore Médica no Laboratório */
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {medicalTree.map(spec => {
                const isSpecSelected = selectedAreaIds.includes(spec.id);
                const isExpanded = expandedSpecs.includes(spec.id);
                const specSubareas = spec.practiceAreas || [];
                const activeSubs = specSubareas.filter(pa => selectedAreaIds.includes(pa.id)).length;

                return (
                  <div
                    key={spec.id}
                    className={`rounded-2xl border transition-all overflow-hidden ${
                      isSpecSelected
                        ? 'border-purple-500 bg-purple-50/40 shadow-xs'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="p-3 flex items-center justify-between gap-3">
                      <div
                        onClick={() => {
                          if (isSpecSelected) {
                            setSelectedAreaIds(prev => prev.filter(id => id !== spec.id));
                            const childIds = new Set(specSubareas.map(pa => pa.id));
                            setSelectedAreaIds(prev => prev.filter(id => !childIds.has(id)));
                          } else {
                            setSelectedAreaIds(prev => [...prev, spec.id]);
                            if (!isExpanded) {
                              setExpandedSpecs(prev => [...prev, spec.id]);
                            }
                          }
                        }}
                        className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer select-none"
                      >
                        <div
                          className={`w-4.5 h-4.5 rounded-md flex items-center justify-center shrink-0 border transition-all ${
                            isSpecSelected
                              ? 'bg-purple-600 border-purple-600 text-white shadow-xs'
                              : 'border-slate-300 bg-white'
                          }`}
                        >
                          {isSpecSelected && <span className="text-[10px] font-bold">✓</span>}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-black ${isSpecSelected ? 'text-purple-950' : 'text-slate-800'}`}>
                              {spec.name}
                            </span>
                            {activeSubs > 0 && (
                              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-purple-600 text-white">
                                {activeSubs} subárea(s)
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {specSubareas.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setExpandedSpecs(prev =>
                              isExpanded ? prev.filter(id => id !== spec.id) : [...prev, spec.id]
                            );
                          }}
                          className="p-1 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors shrink-0 cursor-pointer"
                        >
                          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </button>
                      )}
                    </div>

                    {isExpanded && specSubareas.length > 0 && (
                      <div className="px-3 pb-3 pt-1 border-t border-purple-100/70 bg-white/70">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                          {specSubareas.map(sub => {
                            const isSubSelected = selectedAreaIds.includes(sub.id);
                            return (
                              <div
                                key={sub.id}
                                onClick={() => {
                                  if (isSubSelected) {
                                    setSelectedAreaIds(prev => prev.filter(id => id !== sub.id));
                                  } else {
                                    setSelectedAreaIds(prev => [...prev, sub.id]);
                                    if (!isSpecSelected) {
                                      setSelectedAreaIds(prev => [...prev, spec.id]);
                                    }
                                  }
                                }}
                                className={`p-2 rounded-xl border text-left cursor-pointer transition-all flex items-center gap-2 select-none ${
                                  isSubSelected
                                    ? 'border-purple-500 bg-purple-50/90 text-purple-950 font-bold shadow-2xs'
                                    : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs'
                                }`}
                              >
                                <div
                                  className={`w-3.5 h-3.5 rounded flex items-center justify-center shrink-0 border ${
                                    isSubSelected ? 'bg-purple-600 border-purple-600 text-white' : 'border-slate-300'
                                  }`}
                                >
                                  {isSubSelected && <span className="text-[9px] font-bold">✓</span>}
                                </div>
                                <span className="text-[11px] truncate">{sub.name}</span>
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
          ) : loadingAreas ? (
            <div className="p-6 text-center text-xs text-slate-400">Carregando áreas...</div>
          ) : practiceAreas.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {practiceAreas.map(area => {
                const isSelected = selectedAreaIds.includes(area.id);
                return (
                  <button
                    type="button"
                    key={area.id}
                    onClick={() => handleToggleArea(area.id)}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between ${
                      isSelected
                        ? 'border-purple-500 bg-purple-50/80 ring-1 ring-purple-500'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div>
                      <div className={`text-xs font-bold ${isSelected ? 'text-purple-950' : 'text-slate-800'}`}>
                        {area.name}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {area.type === 'approach' ? 'Abordagem' : 'Especialidade'}
                      </div>
                    </div>
                    <div
                      className={`w-4 h-4 rounded-md flex items-center justify-center shrink-0 border ${
                        isSelected ? 'bg-purple-600 border-purple-600 text-white' : 'border-slate-300'
                      }`}
                    >
                      {isSelected && <span className="text-[10px] font-bold">✓</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-slate-400 italic">Nenhuma área específica configurada para esta profissão.</p>
          )}
        </div>

        {/* Escolha do Plano para Teste */}
        <div className="pt-4 border-t border-slate-100 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-600">
              3. Simular Limites de Plano Comercial
            </h3>
            <span className="text-[11px] font-medium text-slate-500">
              Somente simulação local no sandbox (sem Asaas, sem assinatura comercial e sem trial real)
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { code: 'ALL', name: 'Todos os Recursos', desc: 'Sem restrições comerciais' },
              { code: 'SOLO', name: 'Zemda Solo', desc: '1 profissional individual' },
              { code: 'TEAM', name: 'Zemda Team', desc: 'Até 3 profissionais' },
              { code: 'CLINIC', name: 'Zemda Clinic', desc: 'Clínica multiprofissional' }
            ].map(plan => {
              const isSelected = selectedPlanCode === plan.code;
              return (
                <button
                  type="button"
                  key={plan.code}
                  onClick={() => setSelectedPlanCode(plan.code)}
                  className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                    isSelected
                      ? 'border-purple-600 bg-purple-50/80 ring-2 ring-purple-600 shadow-xs'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className={`text-xs font-black ${isSelected ? 'text-purple-950' : 'text-slate-800'}`}>
                    {plan.name}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {plan.desc}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Diagnóstico Somente-Leitura de Sandboxes Legados */}
      <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
              <UserCheck className="w-4 h-4 text-slate-500" />
              Diagnóstico de Registros Sandbox Legados (Somente Leitura)
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Contas antigas marcadas automaticamente com <code className="bg-slate-100 px-1 rounded">is_sandbox = 1</code> e ocultas das listagens comerciais e métricas reais sem exclusão automática.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadLegacyReport()}
            className="px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-bold text-slate-700 cursor-pointer shrink-0"
          >
            {showLegacyPanel ? 'Ocultar Diagnóstico' : 'Inspecionar Legados'}
          </button>
        </div>

        {showLegacyPanel && legacyReport && (
          <div className="pt-3 border-t border-slate-100 space-y-2 text-xs">
            <div className="text-slate-600 font-semibold">
              Tenants legados fora do ambiente reutilizável: <span className="font-black text-slate-900">{legacyReport.totalLegacyTenants ?? 0}</span>
              {' · '}Usuários legados: <span className="font-black text-slate-900">{legacyReport.totalLegacyUsers ?? 0}</span>
            </div>
            {Array.isArray(legacyReport.legacyTenants) && legacyReport.legacyTenants.length > 0 ? (
              <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100">
                {legacyReport.legacyTenants.map((item: any) => (
                  <div key={item.id} className="px-3 py-2 flex items-center justify-between gap-2 bg-slate-50/50">
                    <div className="min-w-0">
                      <span className="font-bold text-slate-800">{item.name}</span>
                      <span className="text-slate-400 font-mono text-[10px] ml-2">{item.id}</span>
                    </div>
                    <span className="text-[10px] font-semibold text-slate-500 shrink-0">
                      {item.created_at ? new Date(item.created_at).toLocaleDateString('pt-BR') : 'Legado'}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 font-medium">
                Nenhum tenant sandbox legado pendente encontrado.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal de Confirmação de Restauração do Sandbox */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">Restaurar Dados de Teste</h3>
                  <p className="text-xs text-slate-500">Ação limitada exclusivamente ao Ambiente Sandbox</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !isResetting && setShowResetModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 text-xs text-slate-600 leading-relaxed bg-slate-50 border border-slate-200 rounded-2xl p-4">
              <p>
                Todos os dados mutáveis criados durante os testes (pacientes/alunos fictícios, agendamentos, atendimentos, prontuários, serviços, turmas, pacotes, estoque, cobranças simuladas e anexos temporários) serão apagados e restaurados ao estado inicial.
              </p>
              <p className="font-bold text-emerald-700">
                ✓ A conta do Gestor de Teste, a conta do Profissional de Teste, o acesso SuperAdmin e os clientes reais serão integralmente preservados.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowResetModal(false)}
                disabled={isResetting}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmReset()}
                disabled={isResetting}
                className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isResetting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                <span>{isResetting ? 'Restaurando...' : 'Confirmar Restauração'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
