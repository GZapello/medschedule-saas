import React, { useState } from 'react';
import { X, Sparkles, CheckCircle2, Copy, Download, Edit3, ArrowRight, ShieldCheck, FileText, AlertCircle } from 'lucide-react';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';

export interface FonoEvolutionReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  patientId: string;
  patientName?: string;
  onInsertIntoConsultation?: (reportText: string) => void;
}

export const FonoEvolutionReportModal: React.FC<FonoEvolutionReportModalProps> = ({
  isOpen,
  onClose,
  patientId,
  patientName,
  onInsertIntoConsultation
}) => {
  const { showToast } = useToast();

  const [step, setStep] = useState<'generate' | 'review' | 'confirmed'>('generate');
  const [period, setPeriod] = useState('Últimos 3 meses');
  const [sessionNotes, setSessionNotes] = useState('');
  const [focusAreas, setFocusAreas] = useState('Aquisição Fonológica, Fluência da Fala e Comunicação Funcional');

  const [generating, setGenerating] = useState(false);
  const [generatedReport, setGeneratedReport] = useState('');
  const [humanConfirmed, setHumanConfirmed] = useState(false);

  if (!isOpen) return null;

  const handleGenerate = async () => {
    try {
      setGenerating(true);
      const res = await ApiClient.post<any>('/v1/ai/fono/generate-evolution-report', {
        patientId,
        period,
        sessionEvolutionNotes: sessionNotes,
        focusAreas
      });

      if (res && res.report) {
        setGeneratedReport(res.report);
        setStep('review');
        showToast('Relatório preliminar de fonoaudiologia gerado com sucesso!', 'success');
      } else {
        throw new Error('Nenhum texto retornado pela IA');
      }
    } catch (err: any) {
      showToast(err.message || 'Erro ao gerar relatório de fonoaudiologia com IA', 'error');
    } finally {
      setGenerating(false);
    }
  };

  const handleConfirmAndApprove = () => {
    if (!humanConfirmed) {
      showToast('É obrigatório confirmar a revisão técnica antes de prosseguir', 'info');
      return;
    }
    setStep('confirmed');
    showToast('Relatório fonoaudiológico aprovado!', 'success');
  };

  const handleCopyToClipboard = () => {
    navigator.clipboard.writeText(generatedReport);
    showToast('Relatório copiado para a área de transferência!', 'success');
  };

  const handleInsert = () => {
    if (onInsertIntoConsultation) {
      onInsertIntoConsultation(generatedReport);
      showToast('Relatório inserido na evolução do atendimento!', 'success');
      onClose();
    }
  };

  const handleDownload = () => {
    const blob = new Blob([generatedReport], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `relatorio-evolucao-fono-${patientName ? patientName.toLowerCase().replace(/\s+/g, '-') : 'paciente'}.txt`;
    link.click();
    URL.revokeObjectURL(url);
    showToast('Download iniciado!', 'success');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 w-full max-w-4xl max-h-[90vh] rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-teal-500 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-teal-500/20">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                Assistente de Relatório Fonoaudiológico com IA
                <span className="text-[10px] uppercase font-black px-2 py-0.5 rounded-full bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300 border border-teal-200">
                  ZemdaFono
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Consolidação longitudinal: Fonologia, Fluência, Linguagem, Deglutição e Metas {patientName ? `• ${patientName}` : ''}
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

        {/* Step Indicator */}
        <div className="px-6 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20 flex items-center justify-between text-xs font-bold">
          <div className="flex items-center gap-2">
            <span
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                step === 'generate' ? 'bg-teal-600 text-white' : 'bg-emerald-500 text-white'
              }`}
            >
              1
            </span>
            <span className={step === 'generate' ? 'text-teal-600' : 'text-slate-500'}>Gerar Síntese</span>
          </div>

          <ArrowRight className="w-4 h-4 text-slate-300" />

          <div className="flex items-center gap-2">
            <span
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                step === 'review'
                  ? 'bg-teal-600 text-white'
                  : step === 'confirmed'
                  ? 'bg-emerald-500 text-white'
                  : 'bg-slate-200 text-slate-600'
              }`}
            >
              2
            </span>
            <span className={step === 'review' ? 'text-teal-600' : 'text-slate-500'}>Revisão Fonoaudiológica</span>
          </div>

          <ArrowRight className="w-4 h-4 text-slate-300" />

          <div className="flex items-center gap-2">
            <span
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                step === 'confirmed' ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'
              }`}
            >
              3
            </span>
            <span className={step === 'confirmed' ? 'text-emerald-600' : 'text-slate-500'}>Validação & Prontuário</span>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {step === 'generate' && (
            <div className="space-y-5 max-w-2xl mx-auto">
              <div className="p-4 bg-teal-50/50 dark:bg-teal-950/20 border border-teal-100 dark:border-teal-900/40 rounded-2xl flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-teal-600 mt-0.5 shrink-0" />
                <div className="text-xs text-teal-900 dark:text-teal-300 leading-relaxed">
                  A IA estruturará os dados de inventário fonético, processos fonológicos, métricas de fluência (% descontinuidade), deglutição funcional e metas terapêuticas em um relatório padronizado.
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Período de Referência da Evolução
                </label>
                <select
                  value={period}
                  onChange={e => setPeriod(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-semibold"
                >
                  <option value="Último mês">Último mês (Mensal)</option>
                  <option value="Últimos 3 meses">Últimos 3 meses (Trimestral)</option>
                  <option value="Últimos 6 meses">Últimos 6 meses (Semestral)</option>
                  <option value="Último ano">Último ano (Anual)</option>
                  <option value="Desde o início do tratamento">Desde a Avaliação Diagnóstica Inicial</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Foco Fonoaudiológico Principal
                </label>
                <input
                  type="text"
                  value={focusAreas}
                  onChange={e => setFocusAreas(e.target.value)}
                  placeholder="Ex: Aquisição do arquifonema {R}, automatização do {S}, redução de bloqueios..."
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-semibold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Observações de Desempenho e Intercorrências
                </label>
                <textarea
                  rows={4}
                  value={sessionNotes}
                  onChange={e => setSessionNotes(e.target.value)}
                  placeholder="Ex: Paciente automatizou o fonema /r/ brando em palavras isoladas e está em fase de generalização para sentenças; boa resposta a pistas proprioceptivas..."
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                />
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  disabled={generating}
                  onClick={handleGenerate}
                  className="inline-flex items-center gap-2 px-6 py-2.5 text-xs font-bold text-white bg-gradient-to-r from-teal-600 to-indigo-600 hover:from-teal-700 hover:to-indigo-700 rounded-xl shadow-md shadow-teal-500/20 transition-all cursor-pointer disabled:opacity-50"
                >
                  <Sparkles className="w-4 h-4" />
                  {generating ? 'Compilando Dados e Gerando Relatório...' : 'Gerar Relatório de Evolução com IA'}
                </button>
              </div>
            </div>
          )}

          {step === 'review' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Edit3 className="w-4 h-4 text-teal-600" />
                    Revisão Fonoaudiológica Obrigatória
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    O texto abaixo pode ser editado pelo profissional para atender plenamente às particularidades clínicas.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setStep('generate')}
                  className="text-xs text-teal-600 hover:underline cursor-pointer"
                >
                  Regerar
                </button>
              </div>

              <textarea
                rows={16}
                value={generatedReport}
                onChange={e => setGeneratedReport(e.target.value)}
                className="w-full p-4 text-xs font-mono rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 leading-relaxed focus:outline-none focus:border-teal-500"
              />

              {/* Termo de Confirmação Humana */}
              <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 flex items-start gap-3">
                <input
                  id="confirm-fono-report"
                  type="checkbox"
                  checked={humanConfirmed}
                  onChange={e => setHumanConfirmed(e.target.checked)}
                  className="mt-0.5 w-4 h-4 text-teal-600 rounded cursor-pointer"
                />
                <label
                  htmlFor="confirm-fono-report"
                  className="text-xs text-amber-900 dark:text-amber-200 cursor-pointer select-none font-medium"
                >
                  <strong>Declaração de Responsabilidade Profissional:</strong> Confirmo que revisei integralmente este relatório fonoaudiológico, validei as avaliações de fala, linguagem, motricidade ou audição e atesto a precisão técnica das condutas.
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={!humanConfirmed}
                  onClick={handleConfirmAndApprove}
                  className="inline-flex items-center gap-2 px-6 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-md transition-all cursor-pointer disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Confirmar e Validar Relatório
                </button>
              </div>
            </div>
          )}

          {step === 'confirmed' && (
            <div className="space-y-6 max-w-xl mx-auto text-center py-6">
              <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
                <ShieldCheck className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Relatório Validado com Sucesso!
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  O documento fonoaudiológico foi aprovado e está pronto para uso.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                {onInsertIntoConsultation && (
                  <button
                    type="button"
                    onClick={handleInsert}
                    className="p-4 rounded-2xl border border-teal-200 bg-teal-50/50 hover:bg-teal-100 text-teal-900 flex flex-col items-center gap-2 transition-all cursor-pointer"
                  >
                    <FileText className="w-5 h-5 text-teal-600" />
                    <span className="text-xs font-bold">Inserir na Consulta</span>
                    <span className="text-[10px] text-slate-500">Adicionar à evolução</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleCopyToClipboard}
                  className="p-4 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 flex flex-col items-center gap-2 transition-all cursor-pointer"
                >
                  <Copy className="w-5 h-5 text-slate-600" />
                  <span className="text-xs font-bold">Copiar Texto</span>
                  <span className="text-[10px] text-slate-500">Área de transferência</span>
                </button>

                <button
                  type="button"
                  onClick={handleDownload}
                  className="p-4 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 flex flex-col items-center gap-2 transition-all cursor-pointer"
                >
                  <Download className="w-5 h-5 text-slate-600" />
                  <span className="text-xs font-bold">Baixar Arquivo</span>
                  <span className="text-[10px] text-slate-500">Documento .txt</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
