import React, { useState } from 'react';
import { X, Sparkles, CheckCircle2, Copy, Download, Edit3, ArrowRight, ShieldCheck, FileText, AlertCircle } from 'lucide-react';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';

export interface TOEvolutionReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  patientId: string;
  patientName?: string;
  onInsertIntoConsultation?: (reportText: string) => void;
}

export const TOEvolutionReportModal: React.FC<TOEvolutionReportModalProps> = ({
  isOpen,
  onClose,
  patientId,
  patientName,
  onInsertIntoConsultation
}) => {
  const { showToast } = useToast();

  // Workflow steps: 1: GERAR, 2: REVISAR, 3: CONFIRMAR, 4: CONCLUÍDO/EXPORTAR
  const [step, setStep] = useState<'generate' | 'review' | 'confirmed'>('generate');

  const [period, setPeriod] = useState('Últimos 3 meses');
  const [sessionNotes, setSessionNotes] = useState('');
  const [focusAreas, setFocusAreas] = useState('Independência em AVD, Regulação Sensorial e Metas Funcionais');

  const [generating, setGenerating] = useState(false);
  const [generatedReport, setGeneratedReport] = useState('');
  const [humanConfirmed, setHumanConfirmed] = useState(false);

  if (!isOpen) return null;

  const handleGenerate = async () => {
    try {
      setGenerating(true);
      const res = await ApiClient.post<any>('/v1/ai/to/generate-evolution-report', {
        patientId,
        period,
        sessionEvolutionNotes: sessionNotes,
        focusAreas
      });

      if (res && res.report) {
        setGeneratedReport(res.report);
        setStep('review');
        showToast('Relatório de evolução preliminar gerado com sucesso!', 'success');
      } else {
        throw new Error('Nenhum texto retornado pela IA');
      }
    } catch (err: any) {
      showToast(err.message || 'Erro ao gerar relatório com IA', 'error');
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
    showToast('Relatório aprovado pelo profissional!', 'success');
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
    link.download = `relatorio-evolucao-to-${patientName ? patientName.toLowerCase().replace(/\s+/g, '-') : 'paciente'}.txt`;
    link.click();
    URL.revokeObjectURL(url);
    showToast('Download do relatório iniciado!', 'success');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white w-full max-w-4xl max-h-[90vh] rounded-3xl shadow-2xl border border-slate-100 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-teal-50 border border-teal-100 text-teal-600 flex items-center justify-center">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                Assistente de Relatório de Evolução com IA
                <span className="text-[10px] uppercase font-black px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200">
                  ZemdaTO
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                Consolidação longitudinal: AVDs, processamento sensorial e metas atingidas {patientName ? `• ${patientName}` : ''}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step Indicator */}
        <div className="px-6 py-3 border-b border-slate-100 bg-slate-50/40 flex items-center justify-between text-xs font-semibold">
          <div className="flex items-center gap-2">
            <span
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                step === 'generate' ? 'bg-teal-600 text-white' : 'bg-emerald-600 text-white'
              }`}
            >
              1
            </span>
            <span className={step === 'generate' ? 'text-teal-700 font-bold' : 'text-slate-600'}>Gerar Síntese</span>
          </div>

          <ArrowRight className="w-4 h-4 text-slate-300" />

          <div className="flex items-center gap-2">
            <span
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                step === 'review'
                  ? 'bg-teal-600 text-white'
                  : step === 'confirmed'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-200 text-slate-600'
              }`}
            >
              2
            </span>
            <span className={step === 'review' ? 'text-teal-700 font-bold' : 'text-slate-600'}>Revisão Profissional</span>
          </div>

          <ArrowRight className="w-4 h-4 text-slate-300" />

          <div className="flex items-center gap-2">
            <span
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                step === 'confirmed' ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'
              }`}
            >
              3
            </span>
            <span className={step === 'confirmed' ? 'text-emerald-700 font-bold' : 'text-slate-600'}>Validação & Prontuário</span>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 bg-[#fafbfc]">
          {step === 'generate' && (
            <div className="space-y-5 max-w-2xl mx-auto">
              <div className="p-4 bg-teal-50/60 border border-teal-100 rounded-2xl flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-teal-600 mt-0.5 shrink-0" />
                <div className="text-xs text-teal-900 leading-relaxed font-medium">
                  O assistente de IA compilará as pontuações da Escala de AVDs, respostas sensoriais e progresso das metas cadastradas, gerando um relatório formal estruturado pronto para revisão.
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Período de Referência da Evolução
                </label>
                <select
                  value={period}
                  onChange={e => setPeriod(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 bg-white text-slate-900 font-semibold focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none transition-all shadow-xs"
                >
                  <option value="Último mês">Último mês (Acompanhamento Mensal)</option>
                  <option value="Últimos 3 meses">Últimos 3 meses (Trimestral)</option>
                  <option value="Últimos 6 meses">Últimos 6 meses (Semestral)</option>
                  <option value="Último ano">Último ano (Anual)</option>
                  <option value="Desde o início do tratamento">Desde a Avaliação Inicial (Longitudinal Completo)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Foco Clínico Principal
                </label>
                <input
                  type="text"
                  value={focusAreas}
                  onChange={e => setFocusAreas(e.target.value)}
                  placeholder="Ex: Escrita manual, desfralde, independência alimentar..."
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 bg-white text-slate-900 font-medium focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none transition-all shadow-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Observações Adicionais ou Intercorrências Relevantes
                </label>
                <textarea
                  rows={4}
                  value={sessionNotes}
                  onChange={e => setSessionNotes(e.target.value)}
                  placeholder="Ex: Paciente apresentou melhora expressiva na tolerância tátil após introdução de escovação terapêutica e alcançou preensão trípode funcional..."
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none transition-all shadow-xs"
                />
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  disabled={generating}
                  onClick={handleGenerate}
                  className="inline-flex items-center gap-2 px-6 py-2.5 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50"
                >
                  <Sparkles className="w-4 h-4" />
                  {generating ? 'Compilando e Gerando Relatório...' : 'Gerar Relatório de Evolução com IA'}
                </button>
              </div>
            </div>
          )}

          {step === 'review' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-slate-900 flex items-center gap-2">
                    <Edit3 className="w-4 h-4 text-teal-600" />
                    Revisão Humana Obrigatória do Relatório
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Você pode editar livremente qualquer trecho do documento abaixo antes de confirmar sua validade.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setStep('generate')}
                  className="text-xs text-teal-600 hover:text-teal-700 font-semibold hover:underline cursor-pointer"
                >
                  Regerar com outros parâmetros
                </button>
              </div>

              <textarea
                rows={16}
                value={generatedReport}
                onChange={e => setGeneratedReport(e.target.value)}
                className="w-full p-4 text-xs font-mono rounded-2xl border border-slate-200 bg-white text-slate-800 leading-relaxed focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 shadow-xs"
              />

              {/* Termo de Validação Humana */}
              <div className="p-4 rounded-2xl bg-amber-50/80 border border-amber-200 flex items-start gap-3">
                <input
                  id="confirm-to-report"
                  type="checkbox"
                  checked={humanConfirmed}
                  onChange={e => setHumanConfirmed(e.target.checked)}
                  className="mt-0.5 w-4 h-4 text-teal-600 accent-teal-600 rounded cursor-pointer"
                />
                <label
                  htmlFor="confirm-to-report"
                  className="text-xs text-amber-900 cursor-pointer select-none font-medium leading-relaxed"
                >
                  <strong>Declaração de Responsabilidade Profissional:</strong> Confirmo que revisei minuciosamente todo o conteúdo deste relatório, alterei o que foi necessário e atesto a precisão técnica das conclusões e condutas expressas.
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 rounded-xl cursor-pointer transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={!humanConfirmed}
                  onClick={handleConfirmAndApprove}
                  className="inline-flex items-center gap-2 px-6 py-2.5 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Confirmar e Validar Relatório
                </button>
              </div>
            </div>
          )}

          {step === 'confirmed' && (
            <div className="space-y-6 max-w-xl mx-auto text-center py-6">
              <div className="w-16 h-16 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-xs">
                <ShieldCheck className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Relatório Validado com Sucesso!
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  O documento está aprovado. Escolha a ação desejada abaixo para utilizá-lo.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                {onInsertIntoConsultation && (
                  <button
                    type="button"
                    onClick={handleInsert}
                    className="p-4 rounded-2xl border border-teal-200 bg-teal-50/50 hover:bg-teal-100/60 text-teal-900 flex flex-col items-center gap-2 transition-all cursor-pointer shadow-xs"
                  >
                    <FileText className="w-5 h-5 text-teal-600" />
                    <span className="text-xs font-bold">Inserir na Consulta</span>
                    <span className="text-[10px] text-teal-700/80">Adicionar à evolução atual</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleCopyToClipboard}
                  className="p-4 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 flex flex-col items-center gap-2 transition-all cursor-pointer shadow-xs"
                >
                  <Copy className="w-5 h-5 text-slate-600" />
                  <span className="text-xs font-bold">Copiar Texto</span>
                  <span className="text-[10px] text-slate-500">Área de transferência</span>
                </button>

                <button
                  type="button"
                  onClick={handleDownload}
                  className="p-4 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 flex flex-col items-center gap-2 transition-all cursor-pointer shadow-xs"
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
