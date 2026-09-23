import React, { useState, useEffect } from 'react';
import { ApiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  FlaskConical,
  Sparkles,
  ShieldAlert,
  Play,
  RotateCcw,
  CheckCircle2,
  Lock,
  Layers,
  Sliders,
  Eye,
  Info,
  ChevronRight,
  RefreshCw,
  LogOut,
  X
} from 'lucide-react';
import { PracticeArea, Capability, ComputedUserCapabilities, SandboxSession } from '../../types/capabilities';
import { REGISTRATION_PROFESSIONS } from '../../types/professions';

export const SuperAdminLaboratoryView: React.FC = () => {
  const { isSuperAdmin, startSandboxSession, isSandboxSession, exitSandboxSession } = useAuth();
  const { showToast } = useToast();

  const [professions, setProfessions] = useState<any[]>(REGISTRATION_PROFESSIONS);
  const [selectedProfId, setSelectedProfId] = useState<string>('prof-medico');
  const [practiceAreas, setPracticeAreas] = useState<PracticeArea[]>([]);
  const [selectedAreaIds, setSelectedAreaIds] = useState<string[]>(['pa-med-clinica']);
  const [selectedPlanCode, setSelectedPlanCode] = useState<string>('ALL');

  const [loadingAreas, setLoadingAreas] = useState(false);
  const [isStartingSession, setIsStartingSession] = useState(false);

  // Simulação de capabilities em tempo real
  const [computedPreview, setComputedPreview] = useState<{
    defaultCount: number;
    optionalCount: number;
    hiddenCount: number;
  }>({ defaultCount: 0, optionalCount: 0, hiddenCount: 0 });

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

  const handleToggleArea = (areaId: string) => {
    setSelectedAreaIds(prev =>
      prev.includes(areaId) ? prev.filter(id => id !== areaId) : [...prev, areaId]
    );
  };

  const handleStartSession = async () => {
    try {
      setIsStartingSession(true);
      const res = await ApiClient.post<SandboxSession>('/v1/sandbox/create-session', {
        professionId: selectedProfId,
        practiceAreaIds: selectedAreaIds,
        planCode: selectedPlanCode
      });

      startSandboxSession({
        token: res.token,
        user: (res as any).user,
        tenant: (res as any).tenant,
        capabilities: res.capabilities
      });

      showToast(`Ambiente de Teste ativado com sucesso! Você está simulando: ${(res as any).user?.name}`, 'success');
      window.history.pushState(null, '', '/');
      window.dispatchEvent(new PopStateEvent('popstate'));
    } catch (err: any) {
      console.error('Erro ao iniciar sessão do Laboratório:', err);
      showToast(err.message || 'Erro ao inicializar sessão de teste no Laboratório Zemda', 'error');
    } finally {
      setIsStartingSession(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Top Banner Laboratório */}
      <div className="bg-gradient-to-r from-purple-950 via-slate-900 to-indigo-950 text-white p-6 sm:p-8 rounded-3xl shadow-xl relative overflow-hidden">
        <div className="absolute -right-10 -bottom-10 w-80 h-80 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                <FlaskConical className="w-3.5 h-3.5" />
                Laboratório SuperAdmin Zemda
              </span>
              <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                Ambiente 100% Mockado
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
              Simulador Clínico & Sandbox
            </h1>
            <p className="text-slate-300 text-sm mt-1 max-w-2xl font-medium">
              Simule a experiência de qualquer profissional da saúde instantaneamente no seu navegador, sem criar contas falsas e com isolamento total contra envio de mensagens ou cobranças reais.
            </p>
          </div>

          {isSandboxSession ? (
            <button
              onClick={exitSandboxSession}
              className="px-5 py-3 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs sm:text-sm rounded-2xl shadow-lg shadow-rose-700/30 transition-all cursor-pointer flex items-center justify-center gap-2 shrink-0"
            >
              <LogOut className="w-4 h-4" />
              <span>Encerrar Sessão de Teste</span>
            </button>
          ) : (
            <button
              onClick={handleStartSession}
              disabled={isStartingSession}
              className="px-6 py-3.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-black text-sm rounded-2xl shadow-lg shadow-purple-700/30 transition-all cursor-pointer flex items-center justify-center gap-2 shrink-0 disabled:opacity-50"
            >
              {isStartingSession ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Inicializando Ambiente...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>Iniciar Simulação no Navegador</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Garantias de Isolamento Estrito */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 bg-white rounded-2xl border border-slate-200 flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-bold text-slate-900 truncate">WhatsApp Cloud</div>
            <div className="text-[10px] text-slate-500 font-medium">100% Interceptado</div>
          </div>
        </div>

        <div className="p-3.5 bg-white rounded-2xl border border-slate-200 flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-bold text-slate-900 truncate">E-mails (Resend)</div>
            <div className="text-[10px] text-slate-500 font-medium">Envios Bloqueados</div>
          </div>
        </div>

        <div className="p-3.5 bg-white rounded-2xl border border-slate-200 flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-bold text-slate-900 truncate">Cobrança Asaas</div>
            <div className="text-[10px] text-slate-500 font-medium">Faturas Simuladas</div>
          </div>
        </div>

        <div className="p-3.5 bg-white rounded-2xl border border-slate-200 flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-bold text-slate-900 truncate">Banco Isolado</div>
            <div className="text-[10px] text-slate-500 font-medium">Tenant sbx-tenant</div>
          </div>
        </div>
      </div>

      {/* Configuração do Perfil de Simulação */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-xs space-y-6">
        <h2 className="text-base font-black text-slate-900 flex items-center gap-2 pb-3 border-b border-slate-100">
          <Sliders className="w-5 h-5 text-purple-600" />
          1. Selecionar Profissão & Especialidade para Simulação
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
                  {prof.label}
                </div>
                <div className="text-[10px] text-slate-500 font-medium truncate mt-0.5">
                  {prof.boardLabel || 'Profissional'}
                </div>
              </button>
            );
          })}
        </div>

        {/* Áreas de Atuação */}
        <div className="pt-4 border-t border-slate-100 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-600">
              2. Áreas de Atuação & Abordagens Clínicas
            </h3>
            <span className="text-[11px] font-medium text-slate-500">
              {selectedAreaIds.length} selecionada(s)
            </span>
          </div>

          {loadingAreas ? (
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
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-600">
            3. Simular Limites de Plano Comercial
          </h3>
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
    </div>
  );
};
