import React, { useState, useEffect } from 'react';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import {
  ClipboardList,
  Plus,
  Trash2,
  Save,
  CheckCircle2,
  Calendar,
  History,
  FileText,
  Activity,
  User,
  ShieldCheck,
  Sparkles
} from 'lucide-react';

export interface TherapeuticPlanItem {
  id: string;
  region: string;
  evaluation: string;
  complaints: string;
  objective: string;
  planConduct: string;
  notes?: string;
}

export interface TherapeuticPlanRecord {
  id: string;
  tenant_id: string;
  patient_id: string;
  appointment_id?: string;
  professional_id: string;
  professional_name?: string;
  assessment_date: string;
  items?: TherapeuticPlanItem[];
  notes?: string | null;
  created_at: string;
}

interface TherapeuticPlanViewProps {
  patientId: string;
  appointmentId?: string;
  readOnly?: boolean;
}

const REGIONS_LIST = [
  'Cabeça / Pescoço',
  'Ombro direito',
  'Ombro esquerdo',
  'Braço direito',
  'Braço esquerdo',
  'Cotovelo direito',
  'Cotovelo esquerdo',
  'Antebraço direito',
  'Antebraço esquerdo',
  'Punho / Mão direita',
  'Punho / Mão esquerda',
  'Tórax',
  'Abdômen',
  'Coluna cervical',
  'Coluna torácica',
  'Coluna lombar',
  'Quadril',
  'Coxa direita',
  'Coxa esquerda',
  'Joelho direito',
  'Joelho esquerdo',
  'Perna direita',
  'Perna esquerda',
  'Tornozelo / Pé direito',
  'Tornozelo / Pé esquerdo'
];

export const TherapeuticPlanView: React.FC<TherapeuticPlanViewProps> = ({
  patientId,
  appointmentId,
  readOnly = false
}) => {
  const { showToast } = useToast();

  const [history, setHistory] = useState<TherapeuticPlanRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'form' | 'history'>('form');

  const [assessmentDate, setAssessmentDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [generalNotes, setGeneralNotes] = useState<string>('');

  // Itens em edição no plano atual
  const [items, setItems] = useState<TherapeuticPlanItem[]>(() => [
    {
      id: 'item-1',
      region: 'Coluna lombar',
      evaluation: 'Dor à flexão / Tensão muscular',
      complaints: 'Dor lombar há 2 semanas, piora ao sentar',
      objective: 'Alívio álgico e ganho de mobilidade',
      planConduct: 'Terapia manual, cinesioterapia e orientações ergonômicas',
      notes: ''
    }
  ]);

  const loadHistory = async () => {
    try {
      setLoading(true);
      const data = await ApiClient.get<TherapeuticPlanRecord[]>(
        `/v1/body-assessments/patient/${patientId}/therapeutic-plans`
      );
      setHistory(data || []);
    } catch (err: any) {
      console.error('Erro ao carregar histórico de planos terapêuticos:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, [patientId]);

  const handleAddItem = (regionName?: string) => {
    const newItem: TherapeuticPlanItem = {
      id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      region: regionName || 'Ombro direito',
      evaluation: '',
      complaints: '',
      objective: '',
      planConduct: '',
      notes: ''
    };
    setItems(prev => [...prev, newItem]);
  };

  const handleRemoveItem = (id: string) => {
    setItems(prev => prev.filter(item => item.id !== id));
  };

  const handleUpdateItem = (id: string, field: keyof TherapeuticPlanItem, value: string) => {
    setItems(prev =>
      prev.map(item => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (readOnly) return;

    if (items.length === 0) {
      showToast('Adicione ao menos uma região corporal ao plano terapêutico', 'error');
      return;
    }

    try {
      setSaving(true);
      await ApiClient.post('/v1/body-assessments/therapeutic-plans', {
        patientId,
        appointmentId,
        assessmentDate,
        items,
        notes: generalNotes.trim() || null
      });

      showToast('Avaliação corporal e plano terapêutico salvos com sucesso!', 'success');
      await loadHistory();
      setActiveTab('history');
    } catch (err: any) {
      showToast(err.message || 'Erro ao salvar plano terapêutico', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleNewPlan = () => {
    setAssessmentDate(new Date().toISOString().split('T')[0]);
    setGeneralNotes('');
    setItems([
      {
        id: `item-${Date.now()}`,
        region: 'Coluna cervical',
        evaluation: '',
        complaints: '',
        objective: '',
        planConduct: '',
        notes: ''
      }
    ]);
    setActiveTab('form');
  };

  const formatDate = (d: string) => {
    try {
      const [year, month, day] = d.split('-');
      return `${day}/${month}/${year}`;
    } catch {
      return d;
    }
  };

  return (
    <div className="mt-6 bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden transition-all">
      {/* Header da Seção */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-white/10">
        <div className="flex items-center gap-3.5">
          <div className="p-3 bg-indigo-500/20 rounded-2xl border border-indigo-500/30 text-indigo-400">
            <ClipboardList className="w-6 h-6" />
          </div>
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 text-[10px] font-black uppercase tracking-wider mb-1 border border-indigo-500/30">
              Módulo Clínico • Plano Terapêutico
            </div>
            <h3 className="text-lg font-black tracking-tight">Avaliação Corporal e Plano Terapêutico</h3>
            <p className="text-xs text-slate-300">
              Registro por região anatômica: alterações, queixas, objetivos e condutas terapêuticas.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 p-1 bg-white/10 rounded-2xl border border-white/10 text-xs font-bold self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setActiveTab('form')}
            className={`px-3.5 py-1.5 rounded-xl transition-all cursor-pointer ${
              activeTab === 'form' ? 'bg-white text-slate-900 shadow-sm font-black' : 'text-slate-300 hover:text-white'
            }`}
          >
            Novo Registro
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`px-3.5 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1 ${
              activeTab === 'history' ? 'bg-white text-slate-900 shadow-sm font-black' : 'text-slate-300 hover:text-white'
            }`}
          >
            Histórico ({history.length})
          </button>
        </div>
      </div>

      {/* Conteúdo */}
      <div className="p-5 sm:p-7">
        {/* ABA 1: FORMULÁRIO */}
        {activeTab === 'form' && (
          <form onSubmit={handleSave} className="space-y-6">
            {/* Contexto: Data e Botão de Adicionar Região */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Data da Avaliação
                  </label>
                  <input
                    type="date"
                    required
                    value={assessmentDate}
                    onChange={e => setAssessmentDate(e.target.value)}
                    className="px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-800"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleAddItem()}
                  className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" /> Adicionar Região Corporal
                </button>
              </div>
            </div>

            {/* Tabela Estruturada: Parte corporal | Avaliação | Alterações/Queixas | Objetivo | Plano/Conduta | Observações */}
            <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs min-w-[760px]">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px]">
                      <th className="py-3 px-3 w-40">Parte Corporal</th>
                      <th className="py-3 px-3 w-44">Avaliação</th>
                      <th className="py-3 px-3 w-52">Alterações / Queixas</th>
                      <th className="py-3 px-3 w-52">Objetivo</th>
                      <th className="py-3 px-3 w-56">Plano / Conduta</th>
                      <th className="py-3 px-3">Observações</th>
                      <th className="py-3 px-2 text-center w-12">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-400">
                          Nenhuma região corporal adicionada. Clique em "+ Adicionar Região Corporal" acima.
                        </td>
                      </tr>
                    ) : (
                      items.map(item => (
                        <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                          {/* Parte Corporal */}
                          <td className="py-2.5 px-3">
                            <select
                              value={item.region}
                              onChange={e => handleUpdateItem(item.id, 'region', e.target.value)}
                              className="w-full p-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            >
                              {REGIONS_LIST.map(r => (
                                <option key={r} value={r}>
                                  {r}
                                </option>
                              ))}
                            </select>
                          </td>

                          {/* Avaliação */}
                          <td className="py-2.5 px-3">
                            <input
                              type="text"
                              placeholder="Ex: Dor grau 6, espasmo..."
                              value={item.evaluation}
                              onChange={e => handleUpdateItem(item.id, 'evaluation', e.target.value)}
                              className="w-full p-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                          </td>

                          {/* Alterações/Queixas */}
                          <td className="py-2.5 px-3">
                            <input
                              type="text"
                              placeholder="Ex: Piora ao sentar, irradiação..."
                              value={item.complaints}
                              onChange={e => handleUpdateItem(item.id, 'complaints', e.target.value)}
                              className="w-full p-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                          </td>

                          {/* Objetivo */}
                          <td className="py-2.5 px-3">
                            <input
                              type="text"
                              placeholder="Ex: Alívio de dor, ganho de ADM..."
                              value={item.objective}
                              onChange={e => handleUpdateItem(item.id, 'objective', e.target.value)}
                              className="w-full p-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                          </td>

                          {/* Plano/Conduta */}
                          <td className="py-2.5 px-3">
                            <input
                              type="text"
                              placeholder="Ex: Terapia manual, exercícios..."
                              value={item.planConduct}
                              onChange={e => handleUpdateItem(item.id, 'planConduct', e.target.value)}
                              className="w-full p-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                          </td>

                          {/* Observações */}
                          <td className="py-2.5 px-3">
                            <input
                              type="text"
                              placeholder="Notas adicionais..."
                              value={item.notes || ''}
                              onChange={e => handleUpdateItem(item.id, 'notes', e.target.value)}
                              className="w-full p-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                          </td>

                          {/* Remover */}
                          <td className="py-2.5 px-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(item.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                              title="Remover linha"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Observações Gerais */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Considerações Clínicas Globais / Orientações para o Paciente
              </label>
              <textarea
                rows={2}
                placeholder="Ex: Paciente orientado a realizar pausas ativas a cada 50 minutos e aplicar compressa morna antes de dormir..."
                value={generalNotes}
                onChange={e => setGeneralNotes(e.target.value)}
                className="w-full p-3 border border-slate-300 rounded-2xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800"
              />
            </div>

            {/* Botão de Salvar */}
            {!readOnly && (
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-3 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white font-black rounded-2xl shadow-md transition-all flex items-center gap-2 cursor-pointer text-xs disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  {saving ? 'Gravando Plano...' : 'Salvar Plano Terapêutico'}
                </button>
              </div>
            )}
          </form>
        )}

        {/* ABA 2: HISTÓRICO */}
        {activeTab === 'history' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-600">
                Histórico de Planos Terapêuticos ({history.length})
              </h4>
              <button
                type="button"
                onClick={handleNewPlan}
                className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs transition-colors flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Novo Plano
              </button>
            </div>

            {history.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <History className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm font-semibold">Nenhum plano terapêutico registrado ainda.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {history.map((record, idx) => (
                  <div
                    key={record.id}
                    className="p-4 sm:p-5 bg-slate-50 hover:bg-slate-100/70 rounded-2xl border border-slate-200 transition-colors space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-black text-sm text-slate-900">
                          {formatDate(record.assessment_date)}
                        </span>
                        {idx === 0 && (
                          <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 text-[10px] font-black uppercase">
                            Mais Recente
                          </span>
                        )}
                      </div>
                      {record.professional_name && (
                        <span className="text-xs text-slate-500">
                          Profissional: {record.professional_name}
                        </span>
                      )}
                    </div>

                    {record.items && record.items.length > 0 && (
                      <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="bg-slate-100/70 text-slate-600 font-bold uppercase text-[9px] border-b border-slate-200">
                              <th className="py-2 px-3">Região</th>
                              <th className="py-2 px-3">Avaliação</th>
                              <th className="py-2 px-3">Queixas</th>
                              <th className="py-2 px-3">Objetivo</th>
                              <th className="py-2 px-3">Conduta</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {record.items.map(item => (
                              <tr key={item.id}>
                                <td className="py-2 px-3 font-bold text-slate-900">{item.region}</td>
                                <td className="py-2 px-3 text-slate-700">{item.evaluation || '—'}</td>
                                <td className="py-2 px-3 text-slate-700">{item.complaints || '—'}</td>
                                <td className="py-2 px-3 text-slate-700">{item.objective || '—'}</td>
                                <td className="py-2 px-3 text-slate-700">{item.planConduct || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {record.notes && (
                      <div className="text-xs text-slate-600 italic bg-white p-2.5 rounded-xl border border-slate-200/60">
                        {record.notes}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
