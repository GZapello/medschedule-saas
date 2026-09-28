import React, { useState, useEffect } from 'react';
import {
  X,
  TrendingDown,
  TrendingUp,
  Activity,
  Award,
  Dumbbell,
  AlertCircle,
  Calendar,
  Printer,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  Clock
} from 'lucide-react';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import {
  RegionalComparisonResult,
  PhysioRegionalEvaluation,
  PhysioPainAssessment,
  PhysioAdmItem,
  PhysioStrengthItem,
  PhysioSpecialTestItem,
  formatLaterality
} from './regionalData';

interface RegionalLongitudinalComparisonModalProps {
  isOpen: boolean;
  onClose: () => void;
  patientId: string;
  patientName: string;
  regionId: string;
  regionLabel: string;
  side?: string;
  onNewAssessmentRequested?: () => void;
}

export const RegionalLongitudinalComparisonModal: React.FC<RegionalLongitudinalComparisonModalProps> = ({
  isOpen,
  onClose,
  patientId,
  patientName,
  regionId,
  regionLabel,
  side = 'midline',
  onNewAssessmentRequested
}) => {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<RegionalComparisonResult | null>(null);

  useEffect(() => {
    if (isOpen && patientId && regionId) {
      loadComparison();
    }
  }, [isOpen, patientId, regionId]);

  const loadComparison = async () => {
    try {
      setLoading(true);
      const res = await ApiClient.get<any>(
        `/v1/physiotherapy/regional-evaluations/compare/${patientId}/${regionId}`
      );
      setData(res.data || res);
    } catch (err: any) {
      console.error('Erro ao carregar comparação longitudinal:', err);
      showToast(err.message || 'Erro ao carregar dados comparativos da região', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (!isOpen) return null;

  const baseline = data?.baseline;
  const current = data?.current;

  const parsePain = (e?: PhysioRegionalEvaluation | null): PhysioPainAssessment | null => {
    if (!e?.pain_json) return null;
    return typeof e.pain_json === 'string' ? JSON.parse(e.pain_json) : e.pain_json;
  };

  const parseAdm = (e?: PhysioRegionalEvaluation | null): PhysioAdmItem[] => {
    if (!e?.adm_json) return [];
    return typeof e.adm_json === 'string' ? JSON.parse(e.adm_json) : e.adm_json;
  };

  const parseStrength = (e?: PhysioRegionalEvaluation | null): PhysioStrengthItem[] => {
    if (!e?.strength_json) return [];
    return typeof e.strength_json === 'string' ? JSON.parse(e.strength_json) : e.strength_json;
  };

  const parseTests = (e?: PhysioRegionalEvaluation | null): PhysioSpecialTestItem[] => {
    if (!e?.tests_json) return [];
    return typeof e.tests_json === 'string' ? JSON.parse(e.tests_json) : e.tests_json;
  };

  const baselinePain = parsePain(baseline);
  const currentPain = parsePain(current);
  const baselineAdm = parseAdm(baseline);
  const currentAdm = parseAdm(current);
  const baselineStrength = parseStrength(baseline);
  const currentStrength = parseStrength(current);
  const baselineTests = parseTests(baseline);
  const currentTests = parseTests(current);

  const painDiff = data?.variations?.painDiff;
  const isPainImproved = (painDiff ?? 0) < 0; // EVA menor = melhora

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto print:p-0 print:bg-white">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden print:max-h-none print:shadow-none print:border-none">
        
        {/* Cabeçalho */}
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between print:bg-white print:border-b-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-teal-100 text-teal-700 print:hidden">
                <Activity className="w-5 h-5" />
              </span>
              <h2 className="text-base font-extrabold text-slate-800">
                Comparação Longitudinal da Região
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-teal-50 text-teal-800 border border-teal-200">
                {regionLabel}
              </span>
              <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-200 text-slate-700">
                {formatLaterality(side)}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1 flex items-center gap-4">
              <span>Paciente: <strong className="text-slate-700">{patientName}</strong></span>
              {baseline && current && (
                <span>
                  Período: <strong className="text-slate-700">{baseline.evaluation_date}</strong> até{' '}
                  <strong className="text-slate-700">{current.evaluation_date}</strong>
                </span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2 print:hidden">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl"
            >
              <Printer className="w-4 h-4 text-slate-500" /> Imprimir Resumo
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Conteúdo */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <Activity className="w-8 h-8 animate-spin text-teal-600 mb-2" />
              <p className="text-xs font-semibold">Calculando evolução comparativa...</p>
            </div>
          ) : !baseline || !current ? (
            <div className="text-center py-12 px-4 space-y-3">
              <AlertCircle className="w-10 h-10 text-amber-500 mx-auto" />
              <h3 className="text-sm font-bold text-slate-800">
                Histórico Insuficiente para Comparação
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Para comparar a evolução longitudinal, são necessárias pelo menos 2 avaliações da região de{' '}
                <strong>{regionLabel}</strong> (Primeira Avaliação × Reavaliação Atual).
              </p>
              {onNewAssessmentRequested && (
                <button
                  onClick={() => {
                    onClose();
                    onNewAssessmentRequested();
                  }}
                  className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-teal-600 rounded-xl hover:bg-teal-700"
                >
                  Registrar Nova Avaliação Desta Região
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-6">

              {/* CARDS DE GANHOS E DELTAS CHAVE */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                
                {/* 1. Delta Dor EVA */}
                <div className={`p-4 rounded-xl border ${
                  isPainImproved
                    ? 'bg-emerald-50/60 border-emerald-200'
                    : 'bg-rose-50/60 border-rose-200'
                }`}>
                  <div className="flex items-center justify-between text-xs font-bold mb-2">
                    <span className="flex items-center gap-1.5 text-slate-700">
                      <AlertCircle className="w-4 h-4 text-rose-500" /> Evolução da Dor (EVA):
                    </span>
                    {isPainImproved ? (
                      <span className="flex items-center gap-0.5 text-emerald-700 font-extrabold text-[11px] bg-emerald-100 px-2 py-0.5 rounded-full">
                        <TrendingDown className="w-3.5 h-3.5" /> Melhora
                      </span>
                    ) : (
                      <span className="flex items-center gap-0.5 text-rose-700 font-extrabold text-[11px] bg-rose-100 px-2 py-0.5 rounded-full">
                        <TrendingUp className="w-3.5 h-3.5" /> Piora / Sem alteração
                      </span>
                    )}
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-lg font-bold text-slate-500 line-through">
                      {baselinePain?.score ?? '—'}/10
                    </span>
                    <ArrowRight className="w-4 h-4 text-slate-400" />
                    <span className="text-2xl font-black text-slate-800">
                      {currentPain?.score ?? '—'}/10
                    </span>
                  </div>
                  <p className="text-[11px] font-bold text-emerald-800 mt-2">
                    Variação: {painDiff !== null && painDiff !== undefined ? (painDiff > 0 ? `+${painDiff}` : `${painDiff}`) : 0} pontos na escala analógica de dor
                  </p>
                </div>

                {/* 2. Ganhos de ADM */}
                <div className="p-4 rounded-xl border bg-teal-50/50 border-teal-200">
                  <div className="flex items-center justify-between text-xs font-bold mb-2 text-teal-900">
                    <span className="flex items-center gap-1.5">
                      <Activity className="w-4 h-4 text-teal-600" /> Mobilidade / ADM:
                    </span>
                    <span className="text-[10px] font-bold text-teal-700 bg-teal-100 px-2 py-0.5 rounded-full">
                      {data.variations.admDiffs.length} Movimentos
                    </span>
                  </div>
                  <div className="space-y-1 max-h-20 overflow-y-auto pr-1">
                    {data.variations.admDiffs.map((m, idx) => (
                      <div key={idx} className="flex justify-between text-[11px]">
                        <span className="text-slate-600 font-medium truncate max-w-[120px]">{m.movement}:</span>
                        <span className="font-mono font-bold text-slate-800">
                          {m.baselineRom ?? '—'}° → {m.currentRom ?? '—'}°{' '}
                          {m.gain !== null && m.gain > 0 && (
                            <span className="text-emerald-600">(+{m.gain}°)</span>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 3. Força Muscular */}
                <div className="p-4 rounded-xl border bg-indigo-50/50 border-indigo-200">
                  <div className="flex items-center justify-between text-xs font-bold mb-2 text-indigo-900">
                    <span className="flex items-center gap-1.5">
                      <Dumbbell className="w-4 h-4 text-indigo-600" /> Força (MRC):
                    </span>
                    <span className="text-[10px] font-bold text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded-full">
                      {data.variations.strengthDiffs.length} Grupos
                    </span>
                  </div>
                  <div className="space-y-1 max-h-20 overflow-y-auto pr-1">
                    {data.variations.strengthDiffs.map((s, idx) => (
                      <div key={idx} className="flex justify-between text-[11px]">
                        <span className="text-slate-600 font-medium truncate max-w-[120px]">{s.movement}:</span>
                        <span className="font-bold text-slate-800">
                          G{s.baselineGrade ?? '—'} → G{s.currentGrade ?? '—'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

              </div>

              {/* TIMELINE / HISTÓRICO DE TENDÊNCIA DE DOR */}
              {data.timeline && data.timeline.length > 0 && (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-slate-500" /> Linha do Tempo e Tendência de Dor (EVA)
                    </span>
                    <span className="text-[11px] text-slate-400 font-medium">
                      {data.timeline.length} registro(s) no total
                    </span>
                  </div>

                  <div className="flex items-center gap-2 overflow-x-auto py-2">
                    {data.timeline.map((point, idx) => (
                      <div
                        key={idx}
                        className="flex-1 min-w-[90px] bg-white p-2.5 rounded-lg border border-slate-200 text-center relative"
                      >
                        <div className="text-[10px] text-slate-400 font-semibold mb-1">
                          {point.date}
                        </div>
                        <div className="text-base font-black text-rose-600">
                          {point.pain_score} / 10
                        </div>
                        <div className="text-[9px] text-slate-500 uppercase tracking-wider font-bold">
                          {idx === 0 ? 'Baseline' : idx === data.timeline.length - 1 ? 'Atual' : `Sessão ${idx + 1}`}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TABELA COMPARATIVA LADO A LADO: BASELINE × ATUAL */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="grid grid-cols-2 bg-slate-100/80 border-b border-slate-200 text-xs font-extrabold text-slate-700">
                  <div className="p-3 border-r border-slate-200 flex items-center justify-between">
                    <span>1ª AVALIAÇÃO (BASELINE)</span>
                    <span className="text-[11px] font-normal text-slate-500">{baseline.evaluation_date}</span>
                  </div>
                  <div className="p-3 flex items-center justify-between bg-teal-50/60 text-teal-900">
                    <span>AVALIAÇÃO ATUAL (REAVALIAÇÃO)</span>
                    <span className="text-[11px] font-normal text-teal-700">{current.evaluation_date}</span>
                  </div>
                </div>

                {/* Linha 1: Dor */}
                <div className="grid grid-cols-2 divide-x divide-slate-200 p-3 bg-white text-xs border-b border-slate-100">
                  <div className="space-y-1 pr-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Dor EVA Inicial:</span>
                    <p className="font-extrabold text-slate-800 text-sm">
                      {baselinePain?.score ?? '—'} / 10
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Repouso: {baselinePain?.restScore ?? '—'} | Movimento: {baselinePain?.movementScore ?? '—'} | Palpação: {baselinePain?.palpationScore ?? '—'}
                    </p>
                    {baselinePain?.characteristics && (
                      <p className="text-[11px] text-slate-600 italic">"{baselinePain.characteristics}"</p>
                    )}
                  </div>

                  <div className="space-y-1 pl-2 bg-teal-50/10">
                    <span className="text-[10px] font-bold text-teal-600 uppercase">Dor EVA Atual:</span>
                    <p className="font-extrabold text-teal-700 text-sm">
                      {currentPain?.score ?? '—'} / 10
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Repouso: {currentPain?.restScore ?? '—'} | Movimento: {currentPain?.movementScore ?? '—'} | Palpação: {currentPain?.palpationScore ?? '—'}
                    </p>
                    {currentPain?.characteristics && (
                      <p className="text-[11px] text-slate-600 italic">"{currentPain.characteristics}"</p>
                    )}
                  </div>
                </div>

                {/* Linha 2: ADM Goniométrica */}
                <div className="grid grid-cols-2 divide-x divide-slate-200 p-3 bg-slate-50/40 text-xs border-b border-slate-100">
                  <div className="space-y-1 pr-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">ADM Inicial:</span>
                    {baselineAdm.length === 0 ? (
                      <p className="text-slate-400 text-[11px]">Não registrado</p>
                    ) : (
                      baselineAdm.map((m, i) => (
                        <div key={i} className="flex justify-between text-[11px]">
                          <span className="text-slate-600">{m.movement}:</span>
                          <span className="font-mono font-bold text-slate-700">{m.activeRom ? `${m.activeRom}°` : '—'}</span>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="space-y-1 pl-2 bg-teal-50/10">
                    <span className="text-[10px] font-bold text-teal-600 uppercase">ADM Atual:</span>
                    {currentAdm.length === 0 ? (
                      <p className="text-slate-400 text-[11px]">Não registrado</p>
                    ) : (
                      currentAdm.map((m, i) => (
                        <div key={i} className="flex justify-between text-[11px]">
                          <span className="text-slate-600">{m.movement}:</span>
                          <span className="font-mono font-bold text-teal-700">{m.activeRom ? `${m.activeRom}°` : '—'}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Linha 3: Testes Especiais */}
                <div className="grid grid-cols-2 divide-x divide-slate-200 p-3 bg-white text-xs border-b border-slate-100">
                  <div className="space-y-1 pr-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Testes Clínicos Iniciais:</span>
                    {baselineTests.filter(t => t.result !== 'not_tested').length === 0 ? (
                      <p className="text-slate-400 text-[11px]">Nenhum teste positivo/negativo</p>
                    ) : (
                      baselineTests.filter(t => t.result !== 'not_tested').map((t, i) => (
                        <div key={i} className="flex justify-between text-[11px]">
                          <span className="text-slate-600">{t.testName}:</span>
                          <span className={`font-bold ${t.result === 'positive' ? 'text-rose-600' : 'text-emerald-600'}`}>
                            {t.result === 'positive' ? 'Positivo (+)' : 'Negativo (-)'}
                          </span>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="space-y-1 pl-2 bg-teal-50/10">
                    <span className="text-[10px] font-bold text-teal-600 uppercase">Testes Clínicos Atuais:</span>
                    {currentTests.filter(t => t.result !== 'not_tested').length === 0 ? (
                      <p className="text-slate-400 text-[11px]">Nenhum teste positivo/negativo</p>
                    ) : (
                      currentTests.filter(t => t.result !== 'not_tested').map((t, i) => (
                        <div key={i} className="flex justify-between text-[11px]">
                          <span className="text-slate-600">{t.testName}:</span>
                          <span className={`font-bold ${t.result === 'positive' ? 'text-rose-600' : 'text-emerald-600'}`}>
                            {t.result === 'positive' ? 'Positivo (+)' : 'Negativo (-)'}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

              </div>

            </div>
          )}
        </div>

        {/* Rodapé */}
        <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between print:hidden">
          <span className="text-xs text-slate-500">
            {regionLabel} ({formatLaterality(side)}) • Evolução Fisioterapêutica Baseada em Evidências
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-200 rounded-xl"
          >
            Fechar
          </button>
        </div>

      </div>
    </div>
  );
};
