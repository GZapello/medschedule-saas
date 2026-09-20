import React, { useState, useEffect } from 'react';
import { Home, School, BookOpen, Plus, X, Trash2, CheckCircle2, Clock, Copy, Printer } from 'lucide-react';
import { ApiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

export interface HomeProgramItem {
  id: string;
  patient_id?: string;
  specialty?: string;
  setting: 'home' | 'school' | 'community' | 'other';
  title: string;
  instructions: string;
  materials_needed?: string;
  frequency?: string;
  status: 'active' | 'completed' | 'paused' | 'revised';
  created_at?: string;
}

export interface HomeSchoolProgramManagerProps {
  patientId: string;
  specialty: 'to' | 'fono';
  readOnly?: boolean;
}

export const HomeSchoolProgramManager: React.FC<HomeSchoolProgramManagerProps> = ({
  patientId,
  specialty,
  readOnly = false
}) => {
  const { currentTenant } = useAuth();
  const [programs, setPrograms] = useState<HomeProgramItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isAdding, setIsAdding] = useState(false);

  // Form states
  const [title, setTitle] = useState('');
  const [setting, setSetting] = useState<HomeProgramItem['setting']>('home');
  const [instructions, setInstructions] = useState('');
  const [materialsNeeded, setMaterialsNeeded] = useState('');
  const [frequency, setFrequency] = useState('Diário (15 minutos)');

  const loadPrograms = async () => {
    if (!patientId) return;
    try {
      setIsLoading(true);
      const res = await ApiClient.get(`/v1/occupational-therapy/home-programs/${patientId}`);
      if (Array.isArray(res)) {
        setPrograms(res.filter((p: any) => !p.specialty || p.specialty === specialty));
      }
    } catch (err) {
      console.error('[HomeSchoolProgramManager] Erro ao carregar programas:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadPrograms();
  }, [patientId, specialty]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !instructions.trim() || !patientId) return;

    try {
      await ApiClient.post('/v1/occupational-therapy/home-programs', {
        patientId,
        specialty,
        setting,
        title: title.trim(),
        instructions: instructions.trim(),
        materialsNeeded: materialsNeeded.trim() || null,
        frequency: frequency.trim() || null
      });

      setTitle('');
      setInstructions('');
      setMaterialsNeeded('');
      setIsAdding(false);
      await loadPrograms();
    } catch (err) {
      console.error('[HomeSchoolProgramManager] Erro ao salvar programa:', err);
      alert('Erro ao cadastrar programa de orientações.');
    }
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      await ApiClient.put(`/v1/occupational-therapy/home-programs/${id}/status`, { status: newStatus });
      setPrograms(programs.map(p => p.id === id ? { ...p, status: newStatus as any } : p));
    } catch (err) {
      console.error('[HomeSchoolProgramManager] Erro ao atualizar status:', err);
    }
  };

  const copyToClipboard = (prog: HomeProgramItem) => {
    const clinicName = currentTenant?.trade_name || currentTenant?.name;
    const text = `*PROGRAMA DE ORIENTAÇÕES (${prog.setting === 'home' ? 'CASA / DOMICÍLIO' : 'ESCOLA / EDUCADORES'})*
${clinicName ? `Instituição: ${clinicName}\n` : ''}Título: ${prog.title}
Frequência recomendada: ${prog.frequency || 'Conforme rotina'}
${prog.materials_needed ? `Materiais sugeridos: ${prog.materials_needed}\n` : ''}
Orientações:
${prog.instructions}

(Documento emitido eletronicamente pelo Sistema Zemda)`;

    navigator.clipboard.writeText(text);
    alert('Orientações copiadas para a área de transferência!');
  };

  const getSettingIcon = (st: HomeProgramItem['setting']) => {
    switch (st) {
      case 'school':
        return <School className="w-4 h-4 text-emerald-600" />;
      case 'community':
        return <BookOpen className="w-4 h-4 text-amber-600" />;
      case 'home':
      default:
        return <Home className="w-4 h-4 text-teal-600" />;
    }
  };

  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-teal-600" />
            Programa de Atividades e Orientações (Casa / Escola)
          </h3>
          <p className="text-xs text-slate-500">
            Orientações estruturadas para continuidade do tratamento na rotina diária
          </p>
        </div>
        {!readOnly && (
          <button
            type="button"
            onClick={() => setIsAdding(!isAdding)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer"
          >
            {isAdding ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            {isAdding ? 'Cancelar' : '+ Nova Orientação'}
          </button>
        )}
      </div>

      {isAdding && (
        <form onSubmit={handleCreate} className="p-4 bg-teal-50/50 border border-teal-100 rounded-2xl space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Título da Orientação / Atividade *
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Treino de abotoamento na rotina matinal"
                className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all shadow-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Ambiente de Aplicação
              </label>
              <select
                value={setting}
                onChange={(e) => setSetting(e.target.value as any)}
                className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all shadow-xs cursor-pointer"
              >
                <option value="home">Casa / Família</option>
                <option value="school">Escola / Educadores</option>
                <option value="community">Comunidade</option>
                <option value="other">Outro Ambiente</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Frequência Sugerida
              </label>
              <input
                type="text"
                value={frequency}
                onChange={(e) => setFrequency(e.target.value)}
                placeholder="Ex: Diário ao acordar, 2x por semana"
                className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all shadow-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Materiais ou Adaptações Necessárias
              </label>
              <input
                type="text"
                value={materialsNeeded}
                onChange={(e) => setMaterialsNeeded(e.target.value)}
                placeholder="Ex: Quadro de rotina visual, adaptador de lápis"
                className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all shadow-xs"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Instruções Detalhadas para Pais ou Educadores *
            </label>
            <textarea
              rows={3}
              required
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Descreva passo a passo como realizar o estímulo, quando intervir e como incentivar a autonomia..."
              className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all shadow-xs resize-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-800 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer"
            >
              Salvar Orientação
            </button>
          </div>
        </form>
      )}

      <div className="space-y-3">
        {isLoading ? (
          <div className="text-center py-6 text-xs text-slate-400">Carregando orientações...</div>
        ) : programs.length === 0 ? (
          <div className="text-center py-6 border border-dashed border-slate-200 rounded-xl text-slate-400 text-xs">
            Nenhuma orientação para casa ou escola registrada ainda.
          </div>
        ) : (
          programs.map(prog => (
            <div
              key={prog.id}
              className="p-3.5 bg-white border border-slate-200/80 rounded-2xl space-y-2 hover:border-slate-300 transition-colors shadow-xs"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 bg-slate-50 rounded-lg border border-slate-200">
                    {getSettingIcon(prog.setting)}
                  </span>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">
                      {prog.title}
                    </h4>
                    <span className="text-[10px] text-slate-500 font-medium">
                      Ambiente: {prog.setting === 'home' ? 'Casa / Família' : prog.setting === 'school' ? 'Escola / Educadores' : 'Geral'} • {prog.frequency || 'Sob demanda'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => copyToClipboard(prog)}
                    className="p-1.5 text-slate-400 hover:text-teal-600 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
                    title="Copiar texto formatado para enviar pelo WhatsApp ou e-mail"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <select
                    value={prog.status}
                    onChange={(e) => handleStatusChange(prog.id, e.target.value)}
                    disabled={readOnly}
                    className="text-[11px] font-semibold bg-white border border-slate-200 rounded-lg px-2 py-1 outline-none cursor-pointer focus:border-teal-500"
                  >
                    <option value="active">Ativo</option>
                    <option value="completed">Concluído</option>
                    <option value="paused">Pausado</option>
                    <option value="revised">Revisado</option>
                  </select>
                </div>
              </div>

              <div className="text-xs text-slate-700 whitespace-pre-line bg-slate-50/70 p-3 rounded-xl border border-slate-100 leading-relaxed">
                {prog.instructions}
              </div>

              {prog.materials_needed && (
                <div className="text-[11px] text-slate-500 flex items-center gap-1">
                  <strong>Materiais sugeridos:</strong> {prog.materials_needed}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
