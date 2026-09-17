import React, { useState, useEffect } from 'react';
import { Home, School, BookOpen, Plus, X, Trash2, CheckCircle2, Clock, Copy, Printer } from 'lucide-react';
import { ApiClient } from '../../api/client';

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
    const text = `*PROGRAMA DE ORIENTAÇÕES (${prog.setting === 'home' ? 'CASA / DOMICÍLIO' : 'ESCOLA / EDUCADORES'})*
Título: ${prog.title}
Frequência recomendada: ${prog.frequency || 'Conforme rotina'}
${prog.materials_needed ? `Materiais sugeridos: ${prog.materials_needed}\n` : ''}
Orientações:
${prog.instructions}

(Emitido via Zemda Saúde)`;

    navigator.clipboard.writeText(text);
    alert('Orientações copiadas para a área de transferência!');
  };

  const getSettingIcon = (st: HomeProgramItem['setting']) => {
    switch (st) {
      case 'school':
        return <School className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />;
      case 'community':
        return <BookOpen className="w-4 h-4 text-amber-600 dark:text-amber-400" />;
      case 'home':
      default:
        return <Home className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />;
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            Programa de Atividades e Orientações (Casa / Escola)
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Orientações estruturadas para continuidade do tratamento na rotina diária
          </p>
        </div>
        {!readOnly && (
          <button
            type="button"
            onClick={() => setIsAdding(!isAdding)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-sm transition"
          >
            {isAdding ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            {isAdding ? 'Cancelar' : '+ Nova Orientação'}
          </button>
        )}
      </div>

      {isAdding && (
        <form onSubmit={handleCreate} className="p-3.5 bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40 rounded-xl space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Título da Orientação / Atividade *
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Treino de abotoamento na rotina matinal"
                className="w-full text-xs px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Ambiente de Aplicação
              </label>
              <select
                value={setting}
                onChange={(e) => setSetting(e.target.value as any)}
                className="w-full text-xs px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
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
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Frequência Sugerida
              </label>
              <input
                type="text"
                value={frequency}
                onChange={(e) => setFrequency(e.target.value)}
                placeholder="Ex: Diário ao acordar, 2x por semana"
                className="w-full text-xs px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Materiais ou Adaptações Necessárias
              </label>
              <input
                type="text"
                value={materialsNeeded}
                onChange={(e) => setMaterialsNeeded(e.target.value)}
                placeholder="Ex: Quadro de rotina visual, adaptador de lápis"
                className="w-full text-xs px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Instruções Detalhadas para Pais ou Educadores *
            </label>
            <textarea
              rows={3}
              required
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Descreva passo a passo como realizar o estímulo, quando intervir e como incentivar a autonomia..."
              className="w-full text-xs px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white resize-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-800"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold"
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
          <div className="text-center py-6 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl text-slate-400 text-xs">
            Nenhuma orientação para casa ou escola registrada ainda.
          </div>
        ) : (
          programs.map(prog => (
            <div
              key={prog.id}
              className="p-3.5 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 rounded-xl space-y-2 hover:border-slate-300 dark:hover:border-slate-700 transition"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                    {getSettingIcon(prog.setting)}
                  </span>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                      {prog.title}
                    </h4>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                      Ambiente: {prog.setting === 'home' ? 'Casa / Família' : prog.setting === 'school' ? 'Escola / Educadores' : 'Geral'} • {prog.frequency || 'Sob demanda'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => copyToClipboard(prog)}
                    className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-white dark:hover:bg-slate-800 rounded-lg transition"
                    title="Copiar texto formatado para enviar pelo WhatsApp ou e-mail"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <select
                    value={prog.status}
                    onChange={(e) => handleStatusChange(prog.id, e.target.value)}
                    disabled={readOnly}
                    className="text-[11px] font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1"
                  >
                    <option value="active">Ativo</option>
                    <option value="completed">Concluído</option>
                    <option value="paused">Pausado</option>
                    <option value="revised">Revisado</option>
                  </select>
                </div>
              </div>

              <div className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-line bg-white/70 dark:bg-slate-900/40 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800/80">
                {prog.instructions}
              </div>

              {prog.materials_needed && (
                <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
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
