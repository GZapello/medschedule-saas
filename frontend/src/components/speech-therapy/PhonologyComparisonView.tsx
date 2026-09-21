import React, { useState, useEffect, useMemo } from 'react';
import { MessageSquare, GitCompare, History, TrendingUp, CheckCircle2, AlertCircle } from 'lucide-react';
import { ApiClient } from '../../api/client';

export interface PhonologyHistoryItem {
  id: string;
  patientId: string;
  professionalName?: string;
  createdAt: string;
  phonemes: Array<{
    phoneme: string;
    example?: string;
    initial: string;
    medial: string;
    final: string;
    target?: string;
  }>;
  phonologicalProcesses?: string;
  intelligibility?: string;
  articulationNotes?: string;
  spontaneousSpeech?: string;
  repetition?: string;
  referredBy?: string;
  coarticulationBreakdown?: string;
}

interface PhonologyComparisonViewProps {
  patientId: string;
  currentPhonemes: any[];
}

interface PhonologyMetrics {
  totalTested: number;
  correct: number;
  omissions: number;
  substitutions: number;
  distortions: number;
  correctPct: number;
}

function calculateMetrics(phonemes: any[]): PhonologyMetrics {
  let total = 0;
  let correct = 0;
  let omissions = 0;
  let substitutions = 0;
  let distortions = 0;

  if (!Array.isArray(phonemes)) {
    return { totalTested: 0, correct: 0, omissions: 0, substitutions: 0, distortions: 0, correctPct: 0 };
  }

  phonemes.forEach(p => {
    ['initial', 'medial', 'final'].forEach(pos => {
      const status = p[pos];
      if (status && status !== 'not_applicable') {
        total++;
        if (status === 'correct') correct++;
        else if (status === 'omission') omissions++;
        else if (status === 'substitution') substitutions++;
        else if (status === 'distortion') distortions++;
      }
    });
  });

  const correctPct = total > 0 ? Math.round((correct / total) * 100) : 0;
  return { totalTested: total, correct, omissions, substitutions, distortions, correctPct };
}

export const PhonologyComparisonView: React.FC<PhonologyComparisonViewProps> = ({
  patientId,
  currentPhonemes
}) => {
  const [history, setHistory] = useState<PhonologyHistoryItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [selectedPhonemeFilter, setSelectedPhonemeFilter] = useState<string>('all');

  useEffect(() => {
    if (!patientId) return;
    setLoading(true);
    ApiClient.get<PhonologyHistoryItem[]>(`/v1/speech-therapy/phonemes/history/${patientId}`)
      .then(res => {
        if (Array.isArray(res)) setHistory(res);
      })
      .catch(err => console.warn('Erro ao carregar histórico de fonologia:', err))
      .finally(() => setLoading(false));
  }, [patientId]);

  // Identificação das 3 Avaliações Clínicas Principais:
  // Inicial (primeira gravada), Reavaliação (penúltima ou intermediária), e Última / Atual
  const initialRecord = history[0];
  const reevaluationRecord = history.length > 2 ? history[history.length - 2] : history.length > 1 ? history[1] : null;
  const currentMetrics = useMemo(() => calculateMetrics(currentPhonemes), [currentPhonemes]);
  const initialMetrics = useMemo(() => initialRecord ? calculateMetrics(initialRecord.phonemes) : null, [initialRecord]);
  const reevalMetrics = useMemo(() => reevaluationRecord ? calculateMetrics(reevaluationRecord.phonemes) : null, [reevaluationRecord]);

  // Lista de fonemas únicos disponíveis para inspeção detalhada
  const availablePhonemes = useMemo(() => {
    const set = new Set<string>();
    currentPhonemes.forEach(p => set.add(p.phoneme));
    history.forEach(h => h.phonemes?.forEach(p => set.add(p.phoneme)));
    return Array.from(set);
  }, [currentPhonemes, history]);

  if (history.length === 0) {
    return (
      <div className="p-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 text-center text-xs text-slate-500">
        Nenhum histórico anterior de mapeamento fonético gravado para comparação. Os dados da sessão atual servirão como avaliação basal de referência.
      </div>
    );
  }

  return (
    <div className="space-y-4 pt-2">
      {/* CABEÇALHO DO COMPARATIVO LONGITUDINAL */}
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
          <GitCompare className="w-4 h-4 text-sky-600" />
          Visão Comparativa: Avaliação Inicial × Reavaliação × Última Avaliação
        </h4>
        <span className="text-[11px] font-bold text-slate-500">{history.length} registro(s) históricos</span>
      </div>

      {/* CARDS COMPARATIVOS DAS 3 ETAPAS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* 1. Avaliação Inicial */}
        <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/60 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold text-slate-500 uppercase">1. Avaliação Inicial</span>
            <span className="text-[10px] text-slate-400">
              {initialRecord ? new Date(initialRecord.createdAt).toLocaleDateString('pt-BR') : '-'}
            </span>
          </div>
          {initialMetrics ? (
            <>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-slate-800">{initialMetrics.correctPct}%</span>
                <span className="text-[11px] text-slate-500">produções adequadas</span>
              </div>
              <div className="grid grid-cols-3 gap-1 pt-1 text-[10px] font-semibold text-center">
                <div className="p-1 rounded bg-red-50 text-red-700">
                  {initialMetrics.omissions} omissões
                </div>
                <div className="p-1 rounded bg-amber-50 text-amber-700">
                  {initialMetrics.substitutions} trocas
                </div>
                <div className="p-1 rounded bg-purple-50 text-purple-700">
                  {initialMetrics.distortions} distorções
                </div>
              </div>
            </>
          ) : (
            <div className="text-xs text-slate-400 italic">Sem dados basais</div>
          )}
        </div>

        {/* 2. Reavaliação Intermediária */}
        <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/60 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold text-slate-500 uppercase">2. Reavaliação</span>
            <span className="text-[10px] text-slate-400">
              {reevaluationRecord ? new Date(reevaluationRecord.createdAt).toLocaleDateString('pt-BR') : '-'}
            </span>
          </div>
          {reevalMetrics ? (
            <>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-slate-800">{reevalMetrics.correctPct}%</span>
                <span className="text-[11px] text-slate-500">produções adequadas</span>
              </div>
              <div className="grid grid-cols-3 gap-1 pt-1 text-[10px] font-semibold text-center">
                <div className="p-1 rounded bg-red-50 text-red-700">
                  {reevalMetrics.omissions} omissões
                </div>
                <div className="p-1 rounded bg-amber-50 text-amber-700">
                  {reevalMetrics.substitutions} trocas
                </div>
                <div className="p-1 rounded bg-purple-50 text-purple-700">
                  {reevalMetrics.distortions} distorções
                </div>
              </div>
            </>
          ) : (
            <div className="text-xs text-slate-400 italic">Reavaliação ainda não realizada</div>
          )}
        </div>

        {/* 3. Última / Atual */}
        <div className="p-4 rounded-2xl border-2 border-emerald-500 bg-emerald-50/30 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold text-emerald-800 uppercase">3. Avaliação Atual</span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">Em curso</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-emerald-900">{currentMetrics.correctPct}%</span>
            <span className="text-[11px] text-emerald-700">produções adequadas</span>
          </div>
          <div className="grid grid-cols-3 gap-1 pt-1 text-[10px] font-semibold text-center">
            <div className="p-1 rounded bg-red-100/70 text-red-800">
              {currentMetrics.omissions} omissões
            </div>
            <div className="p-1 rounded bg-amber-100/70 text-amber-800">
              {currentMetrics.substitutions} trocas
            </div>
            <div className="p-1 rounded bg-purple-100/70 text-purple-800">
              {currentMetrics.distortions} distorções
            </div>
          </div>
        </div>
      </div>

      {/* GANHO LONGITUDINAL GERAL */}
      {initialMetrics && (
        <div className="p-3 bg-white border border-slate-200 rounded-xl flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-600" />
            <span className="font-bold text-slate-700">
              Evolução Global de Produções Adequadas:
            </span>
            <span className={`font-black ${currentMetrics.correctPct >= initialMetrics.correctPct ? 'text-emerald-700' : 'text-rose-700'}`}>
              {currentMetrics.correctPct >= initialMetrics.correctPct ? `+${currentMetrics.correctPct - initialMetrics.correctPct}% de acerto` : `${currentMetrics.correctPct - initialMetrics.correctPct}%`}
            </span>
          </div>
          <span className="text-[11px] text-slate-500">
            De {initialMetrics.correctPct}% (Inicial) para {currentMetrics.correctPct}% (Atual)
          </span>
        </div>
      )}

      {/* FILTRO E HISTÓRICO POR FONEMA E POSIÇÃO (INICIAL, MEDIAL, FINAL) */}
      <div className="p-4 bg-slate-50/70 border border-slate-200 rounded-2xl space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <span className="text-xs font-bold text-slate-800">
            Histórico de Produção por Fonema nas 3 Posições Silábicas:
          </span>
          <select
            value={selectedPhonemeFilter}
            onChange={e => setSelectedPhonemeFilter(e.target.value)}
            className="px-2.5 py-1 text-xs rounded-lg border border-slate-200 bg-white font-bold text-sky-900"
          >
            <option value="all">Todos os fonemas com alteração</option>
            {availablePhonemes.map(ph => (
              <option key={ph} value={ph}>{ph}</option>
            ))}
          </select>
        </div>

        <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="py-2 px-3">Fonema</th>
                <th className="py-2 px-3">Posição Inicial (Inicial → Atual)</th>
                <th className="py-2 px-3">Posição Medial (Inicial → Atual)</th>
                <th className="py-2 px-3">Posição Final (Inicial → Atual)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {currentPhonemes
                .filter(item => {
                  if (selectedPhonemeFilter !== 'all') return item.phoneme === selectedPhonemeFilter;
                  // Se 'all', exibe fonemas que não são 100% corretos em alguma das etapas
                  return item.initial !== 'correct' || item.medial !== 'correct' || item.final !== 'correct';
                })
                .map((curItem, idx) => {
                  const initItem = initialRecord?.phonemes?.find(p => p.phoneme === curItem.phoneme);
                  const formatTransition = (initVal?: string, curVal?: string) => {
                    const label = (v?: string) => v === 'correct' ? 'Correto' : v === 'omission' ? 'Omissão' : v === 'substitution' ? 'Substituição' : v === 'distortion' ? 'Distorção' : '-';
                    if (!initVal || initVal === 'not_applicable') return label(curVal);
                    if (initVal === curVal) return label(curVal);
                    return `${label(initVal)} → ${label(curVal)}`;
                  };

                  return (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-extrabold text-sky-800">{curItem.phoneme}</td>
                      <td className="py-2.5 px-3">{formatTransition(initItem?.initial, curItem.initial)}</td>
                      <td className="py-2.5 px-3">{formatTransition(initItem?.medial, curItem.medial)}</td>
                      <td className="py-2.5 px-3">{formatTransition(initItem?.final, curItem.final)}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
