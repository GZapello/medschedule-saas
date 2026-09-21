import React, { useState, useEffect, useMemo } from 'react';
import { Volume2, History, AlertCircle, Save, TrendingDown, TrendingUp, CheckCircle2 } from 'lucide-react';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';

export interface Idv10Record {
  id?: string;
  patientId: string;
  appointmentId?: string | null;
  professionalName?: string;
  assessmentDate: string;
  answers: number[];
  totalScore: number;
  notes?: string;
}

interface Idv10AssessmentSectionProps {
  patientId: string;
  appointmentId?: string | null;
  onScoreCalculated?: (totalScore: number) => void;
}

// 10 itens estruturados e padronizados do Índice de Desvantagem Vocal 10 (IDV-10)
// Baseado na adaptação e validação clínica de Costa et al. (2013) / Behlau et al.
export const IDV10_QUESTIONS = [
  { id: 1, text: 'Minha voz faz com que seja difícil as pessoas me ouvirem.', domain: 'Funcional' },
  { id: 2, text: 'As pessoas têm dificuldade de me entender em um lugar barulhento.', domain: 'Funcional' },
  { id: 3, text: 'Minhas dificuldades na voz limitam minha vida pessoal e social.', domain: 'Funcional' },
  { id: 4, text: 'Sinto-me deixado(a) de fora das conversas por causa da minha voz.', domain: 'Emocional' },
  { id: 5, text: 'Meu problema de voz afeta meu rendimento no trabalho ou nas minhas tarefas.', domain: 'Funcional' },
  { id: 6, text: 'Sinto que preciso fazer esforço para falar.', domain: 'Físico' },
  { id: 7, text: 'A clareza da minha voz é imprevisível (ora boa, ora ruim).', domain: 'Físico' },
  { id: 8, text: 'Minha voz me deixa chateado(a) ou constrangido(a).', domain: 'Emocional' },
  { id: 9, text: 'Minha voz faz com que eu me sinta em desvantagem perante os outros.', domain: 'Emocional' },
  { id: 10, text: 'As pessoas me perguntam "O que aconteceu com a sua voz?".', domain: 'Funcional' }
];

export const LIKERT_OPTIONS = [
  { value: 0, label: '0 - Nunca' },
  { value: 1, label: '1 - Quase nunca' },
  { value: 2, label: '2 - Às vezes' },
  { value: 3, label: '3 - Quase sempre' },
  { value: 4, label: '4 - Sempre' }
];

export const Idv10AssessmentSection: React.FC<Idv10AssessmentSectionProps> = ({
  patientId,
  appointmentId,
  onScoreCalculated
}) => {
  const { showToast } = useToast();
  const [answers, setAnswers] = useState<number[]>(Array(10).fill(0));
  const [notes, setNotes] = useState<string>('');
  const [assessmentDate, setAssessmentDate] = useState<string>(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
  );
  const [history, setHistory] = useState<Idv10Record[]>([]);
  const [saving, setSaving] = useState<boolean>(false);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);

  // Escore Total (0 a 40)
  const totalScore = useMemo(() => {
    return answers.reduce((acc, curr) => acc + (Number(curr) || 0), 0);
  }, [answers]);

  useEffect(() => {
    onScoreCalculated?.(totalScore);
  }, [totalScore, onScoreCalculated]);

  // Carrega histórico
  useEffect(() => {
    if (!patientId) return;
    setLoadingHistory(true);
    ApiClient.get<Idv10Record[]>(`/v1/speech-therapy/idv10/${patientId}`)
      .then(res => {
        if (Array.isArray(res)) setHistory(res);
      })
      .catch(err => console.warn('Erro ao carregar histórico IDV-10:', err))
      .finally(() => setLoadingHistory(false));
  }, [patientId]);

  const handleAnswerChange = (index: number, val: number) => {
    const updated = [...answers];
    updated[index] = val;
    setAnswers(updated);
  };

  const handleSaveIdv10 = async () => {
    if (!patientId) {
      showToast('Selecione um paciente', 'info');
      return;
    }
    try {
      setSaving(true);
      await ApiClient.post('/v1/speech-therapy/idv10', {
        patientId,
        appointmentId,
        assessmentDate,
        answers,
        totalScore,
        notes
      });
      showToast(`Protocolo IDV-10 salvo com sucesso! Escore: ${totalScore}/40`, 'success');

      // Recarrega histórico
      const res = await ApiClient.get<Idv10Record[]>(`/v1/speech-therapy/idv10/${patientId}`);
      if (Array.isArray(res)) setHistory(res);
    } catch (err: any) {
      showToast(err.message || 'Erro ao salvar IDV-10', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-5 bg-white border border-slate-200 rounded-2xl shadow-xs space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
              <Volume2 className="w-4 h-4 text-purple-600" />
              IDV-10 — Índice de Desvantagem Vocal (Voice Handicap Index - 10)
            </h3>
            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200">
              Autoavaliação do Paciente
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Mapeamento da percepção do paciente quanto ao impacto de sua queixa vocal (Escore de 0 a 40).
          </p>
        </div>

        {/* Escore Atual em Destaque */}
        <div className="flex items-center gap-2 px-4 py-2 rounded-2xl border bg-slate-50 border-slate-200 shrink-0">
          <div className="text-right">
            <span className="text-[10px] font-bold text-slate-400 uppercase block">Escore Atual:</span>
            <span className={`text-base font-black ${totalScore > 7 ? 'text-rose-600' : 'text-emerald-700'}`}>
              {totalScore} / 40
            </span>
          </div>
          <div className={`w-3 h-3 rounded-full ${totalScore > 7 ? 'bg-rose-500 animate-pulse' : 'bg-emerald-500'}`} />
        </div>
      </div>

      {/* Nota de Corte Clínica */}
      <div className="flex items-start gap-2.5 p-3 rounded-xl bg-purple-50/60 border border-purple-100 text-purple-900 text-xs">
        <AlertCircle className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
        <div>
          <span className="font-bold">Referência Clínica da Literatura:</span> Na validação brasileira do IDV-10 (Costa et al.), uma pontuação <strong>&gt; 7 pontos</strong> indica percepção clinicamente significativa de desvantagem vocal decorrente do distúrbio da voz.
        </div>
      </div>

      {/* 10 Itens com Escala Likert de 0 a 4 */}
      <div className="space-y-3">
        {IDV10_QUESTIONS.map((q, idx) => (
          <div
            key={q.id}
            className="p-3.5 bg-slate-50/60 hover:bg-slate-50 border border-slate-200 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs"
          >
            <div className="flex items-start gap-2 max-w-xl">
              <span className="w-5 h-5 rounded-full bg-purple-100 text-purple-800 font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                {q.id}
              </span>
              <div>
                <span className="font-bold text-slate-800">{q.text}</span>
                <span className="text-[10px] text-slate-400 font-normal ml-2">({q.domain})</span>
              </div>
            </div>

            {/* Opções Likert */}
            <div className="flex items-center gap-1.5 shrink-0 overflow-x-auto no-scrollbar">
              {LIKERT_OPTIONS.map(opt => {
                const isSelected = answers[idx] === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleAnswerChange(idx, opt.value)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      isSelected
                        ? 'bg-purple-600 text-white shadow-xs'
                        : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {opt.value}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Observações da Aplicação */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Data da Aplicação:</label>
          <input
            type="date"
            value={assessmentDate}
            onChange={e => setAssessmentDate(e.target.value)}
            className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-bold text-slate-700 mb-1">Observações do Profissional:</label>
          <input
            type="text"
            placeholder="Ex: Aplicação pré-intervenção; paciente refere maior impacto no turno da tarde..."
            value={notes}
            onChange={e => setNotes(e.target.value)}
            className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white"
          />
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <button
          type="button"
          disabled={saving}
          onClick={handleSaveIdv10}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
        >
          <Save className="w-3.5 h-3.5" />
          <span>{saving ? 'Registrando...' : 'Salvar Avaliação IDV-10'}</span>
        </button>
      </div>

      {/* Gráfico de Evolução e Histórico Longitudinal */}
      {history.length > 0 && (
        <div className="pt-4 border-t border-slate-100 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <History className="w-3.5 h-3.5 text-purple-600" />
              Evolução Longitudinal do Escore IDV-10 ({history.length} aplicações)
            </h4>
          </div>

          {/* Mini Gráfico Visual SVG de Evolução do Escore */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl">
            <div className="text-[11px] font-bold text-slate-600 mb-2 flex items-center justify-between">
              <span>Gráfico de Redução/Evolução do Escore (Meta: diminuir desvantagem para &le; 7)</span>
              <span className="text-[10px] text-slate-400">Pontuação máxima: 40</span>
            </div>

            <div className="h-32 flex items-end gap-3 pt-6 pb-2 px-2 overflow-x-auto no-scrollbar border-b border-slate-200">
              {history.map((h, i) => {
                const heightPct = Math.max(8, Math.min(100, (h.totalScore / 40) * 100));
                const isOverCutoff = h.totalScore > 7;
                return (
                  <div key={h.id || i} className="flex-1 min-w-[50px] flex flex-col items-center gap-1.5">
                    <span className="text-[10px] font-extrabold text-slate-700">{h.totalScore}</span>
                    <div
                      style={{ height: `${heightPct}%` }}
                      className={`w-full max-w-[32px] rounded-t-lg transition-all ${
                        isOverCutoff ? 'bg-rose-500' : 'bg-emerald-500'
                      }`}
                      title={`${new Date(h.assessmentDate).toLocaleDateString('pt-BR')}: ${h.totalScore} pontos`}
                    />
                    <span className="text-[9px] text-slate-500 truncate max-w-[50px]">
                      {new Date(h.assessmentDate).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
