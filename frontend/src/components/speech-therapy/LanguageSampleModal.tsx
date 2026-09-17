import React, { useState, useMemo } from 'react';
import { X, Sparkles, MessageSquare, CheckCircle2, Copy, BarChart2, BookOpen, AlertCircle } from 'lucide-react';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';

export interface LanguageSampleModalProps {
  isOpen: boolean;
  onClose: () => void;
  patientId: string;
  patientName?: string;
  onInsertAnalysis?: (analysisText: string) => void;
}

export const LanguageSampleModal: React.FC<LanguageSampleModalProps> = ({
  isOpen,
  onClose,
  patientId,
  patientName,
  onInsertAnalysis
}) => {
  const { showToast } = useToast();
  const [transcription, setTranscription] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [aiInsights, setAiInsights] = useState<string | null>(null);

  // Análise Quantitativa em Tempo Real no Cliente (TTR e MLU)
  const metrics = useMemo(() => {
    if (!transcription.trim()) {
      return {
        totalWords: 0,
        uniqueWords: 0,
        ttr: 0,
        totalUtterances: 0,
        mluWords: 0
      };
    }

    // Separação em enunciados por quebras de linha ou pontuação forte (. ! ?)
    const rawUtterances = transcription
      .split(/[\n.!?]+/)
      .map(u => u.trim())
      .filter(u => u.length > 0);

    const totalUtterances = rawUtterances.length || 1;

    // Tokenização simples de palavras limpando pontuações
    const tokens = transcription
      .toLowerCase()
      .replace(/[,;:"'()–—-]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 0);

    const totalWords = tokens.length;
    const uniqueTokens = new Set(tokens);
    const uniqueWords = uniqueTokens.size;

    const ttr = totalWords > 0 ? Number((uniqueWords / totalWords).toFixed(2)) : 0;
    const mluWords = totalWords > 0 ? Number((totalWords / totalUtterances).toFixed(1)) : 0;

    return {
      totalWords,
      uniqueWords,
      ttr,
      totalUtterances,
      mluWords
    };
  }, [transcription]);

  if (!isOpen) return null;

  const handleRunAiAnalysis = async () => {
    if (!transcription.trim() || metrics.totalWords < 10) {
      showToast('Digite uma amostra de fala com ao menos 10 palavras para análise linguística', 'info');
      return;
    }

    try {
      setAnalyzing(true);
      const res = await ApiClient.post<any>('/v1/speech-therapy/analyze-language', {
        patientId,
        sampleText: transcription,
        metrics
      });

      if (res && res.analysis) {
        setAiInsights(res.analysis);
        showToast('Análise morfossintática e semântica processada!', 'success');
      } else {
        // Fallback estruturado caso a rota retorne objeto genérico
        const fallbackText = `Análise da Amostra de Linguagem:\n- Tokens: ${metrics.totalWords} palavras\n- Types: ${metrics.uniqueWords} palavras distintas\n- TTR (Type-Token Ratio): ${metrics.ttr} (${metrics.ttr >= 0.45 ? 'Vocabulário rico e diversificado' : 'Vocabulário restrito/repetitivo'})\n- Extensão Média do Enunciado (MLU): ${metrics.mluWords} palavras por turno.`;
        setAiInsights(fallbackText);
      }
    } catch (err: any) {
      showToast(err.message || 'Erro ao processar análise de linguagem com IA', 'error');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleApplyToLanguageEvaluation = () => {
    const textToInsert = `[AMOSTRA DE LINGUAGEM]\nTotal de Palavras: ${metrics.totalWords} | Vocábulos Distintos: ${metrics.uniqueWords}\nTTR: ${metrics.ttr} | Enunciados: ${metrics.totalUtterances} | MLU: ${metrics.mluWords} palavras/enunciado.\n\n${aiInsights ? `Interpretação Clínica:\n${aiInsights}` : ''}`;

    if (onInsertAnalysis) {
      onInsertAnalysis(textToInsert);
      showToast('Métricas inseridas na aba de Avaliação de Linguagem!', 'success');
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 w-full max-w-4xl max-h-[90vh] rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                Análise de Amostra de Linguagem Espontânea
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Cálculo instantâneo de TTR (Type-Token Ratio) e MLU (Extensão Média do Enunciado) {patientName ? `• ${patientName}` : ''}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Métricas Quantitativas em Tempo Real */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-900/40">
              <span className="text-[10px] font-extrabold uppercase text-indigo-700 dark:text-indigo-400 block">
                Total de Palavras (Tokens)
              </span>
              <span className="text-2xl font-black text-indigo-900 dark:text-indigo-200">
                {metrics.totalWords}
              </span>
              <span className="text-[10px] text-slate-400 block">{metrics.uniqueWords} vocábulos distintos</span>
            </div>

            <div className="p-3.5 rounded-2xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40">
              <span className="text-[10px] font-extrabold uppercase text-emerald-700 dark:text-emerald-400 block">
                TTR (Riqueza Vocabular)
              </span>
              <span className="text-2xl font-black text-emerald-900 dark:text-emerald-200">
                {metrics.ttr}
              </span>
              <span className="text-[10px] text-slate-500 block">
                {metrics.ttr >= 0.5 ? 'Vocabulário diversificado' : metrics.ttr >= 0.4 ? 'Típico' : 'Vocabulário restrito'}
              </span>
            </div>

            <div className="p-3.5 rounded-2xl bg-purple-50/50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-900/40">
              <span className="text-[10px] font-extrabold uppercase text-purple-700 dark:text-purple-400 block">
                Total de Enunciados
              </span>
              <span className="text-2xl font-black text-purple-900 dark:text-purple-200">
                {metrics.totalUtterances}
              </span>
              <span className="text-[10px] text-slate-400 block">Turnos de fala identificados</span>
            </div>

            <div className="p-3.5 rounded-2xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40">
              <span className="text-[10px] font-extrabold uppercase text-amber-700 dark:text-amber-400 block">
                MLU (Extensão Média)
              </span>
              <span className="text-2xl font-black text-amber-900 dark:text-amber-200">
                {metrics.mluWords}
              </span>
              <span className="text-[10px] text-slate-400 block">Palavras por enunciado</span>
            </div>
          </div>

          {/* Caixa de Transcrição da Amostra */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Transcrição da Amostra de Fala ou Linguagem Espontânea
              </label>
              <span className="text-[11px] text-slate-400">
                Dica: Digite ou cole a transcrição da interação lúdica ou narrativa
              </span>
            </div>
            <textarea
              rows={8}
              value={transcription}
              onChange={e => setTranscription(e.target.value)}
              placeholder="Ex: O menino foi no parque com a mãe dele. Ele viu um cachorro bem grande e ficou com medo. Depois ele brincou no escorregador e tomou sorvete de chocolate..."
              className="w-full p-3.5 text-xs rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 leading-relaxed focus:outline-none focus:border-indigo-500 font-sans"
            />
          </div>

          {/* Botão para Acionar Análise Linguística com IA */}
          <div className="flex justify-between items-center">
            <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 text-indigo-600" />
              <span>A análise por IA avalia coerência, concordância morfossintática e pragmática.</span>
            </div>
            <button
              type="button"
              disabled={analyzing || metrics.totalWords < 10}
              onClick={handleRunAiAnalysis}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 rounded-xl shadow-md transition-all cursor-pointer disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4" />
              {analyzing ? 'Analisando Morfossintaxe...' : 'Analisar Linguagem com IA'}
            </button>
          </div>

          {/* Resultados da IA */}
          {aiInsights && (
            <div className="p-4 rounded-2xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/40 dark:bg-indigo-950/20 space-y-2">
              <h4 className="text-xs font-bold text-indigo-900 dark:text-indigo-300 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-600" />
                Parecer Morfossintático & Semântico Gerado
              </h4>
              <p className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-line leading-relaxed">
                {aiInsights}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
          >
            Fechar
          </button>
          {onInsertAnalysis && (
            <button
              type="button"
              onClick={handleApplyToLanguageEvaluation}
              className="inline-flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md transition-colors cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              Inserir Métricas na Avaliação de Linguagem
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
