import React, { useState } from 'react';
import { Mic, Sparkles, CheckCircle2, ArrowRight, Save, X, Edit3, AlertCircle, RefreshCw } from 'lucide-react';
import { ApiClient } from '../../api/client';

export interface DentalParsedData {
  procedure: string;
  tooth: string;
  surfaces: string[];
  materials: string[];
  observations: string;
  nextSteps: string;
  freeEvolution: string;
}

export interface DentalAIDictationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (data: {
    parsed: DentalParsedData;
    target: 'structured' | 'evolution' | 'both';
  }) => void;
}

export const DentalAIDictationModal: React.FC<DentalAIDictationModalProps> = ({
  isOpen,
  onClose,
  onApply
}) => {
  // 4 Etapas Obrigatórias: 1. GERAR -> 2. REVISAR -> 3. CONFIRMAR -> 4. SALVAR
  const [step, setStep] = useState<'gerar' | 'revisar' | 'confirmar' | 'salvar'>('gerar');
  const [dictationText, setDictationText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [parsedData, setParsedData] = useState<DentalParsedData>({
    procedure: '',
    tooth: '',
    surfaces: [],
    materials: [],
    observations: '',
    nextSteps: '',
    freeEvolution: ''
  });
  const [destination, setDestination] = useState<'both' | 'structured' | 'evolution'>('both');
  const [isConfirmed, setIsConfirmed] = useState(false);

  if (!isOpen) return null;

  const handleGenerate = async () => {
    if (!dictationText.trim()) {
      alert('Digite ou dite o relato do procedimento realizado.');
      return;
    }

    try {
      setIsProcessing(true);
      const res = await ApiClient.post<any>('/v1/ai/dental/parse-dictation', { dictationText });
      if (res && res.data) {
        setParsedData({
          procedure: res.data.procedure || '',
          tooth: res.data.tooth || '',
          surfaces: res.data.surfaces || [],
          materials: res.data.materials || [],
          observations: res.data.observations || '',
          nextSteps: res.data.nextSteps || '',
          freeEvolution: res.data.freeEvolution || ''
        });
        setStep('revisar');
      }
    } catch (err: any) {
      console.error('[DentalAIDictationModal] Erro ao estruturar:', err);
      alert('Erro ao processar ditado odontológico.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmHumanReview = () => {
    setIsConfirmed(true);
    setStep('confirmar');
  };

  const handleApplyFinal = () => {
    onApply({
      parsed: parsedData,
      target: destination
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col space-y-5 max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <span className="p-2 bg-cyan-100 dark:bg-cyan-950/60 rounded-xl text-cyan-700 dark:text-cyan-300">
              <Sparkles className="w-5 h-5" />
            </span>
            <div>
              <h3 className="text-base font-black text-slate-900 dark:text-white">
                Estruturação de Ditado Odontológico por IA
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Fluxo em 4 etapas: GERAR → REVISAR → CONFIRMAR → SALVAR
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center justify-between px-2 py-1.5 bg-slate-50 dark:bg-slate-800/40 rounded-xl text-xs font-bold">
          <div className={`flex items-center gap-1.5 ${step === 'gerar' ? 'text-cyan-600 dark:text-cyan-400' : 'text-slate-400'}`}>
            <span className="w-5 h-5 rounded-full border border-current flex items-center justify-center text-[11px]">1</span>
            GERAR
          </div>
          <ArrowRight className="w-3 h-3 text-slate-300" />
          <div className={`flex items-center gap-1.5 ${step === 'revisar' ? 'text-cyan-600 dark:text-cyan-400' : 'text-slate-400'}`}>
            <span className="w-5 h-5 rounded-full border border-current flex items-center justify-center text-[11px]">2</span>
            REVISAR
          </div>
          <ArrowRight className="w-3 h-3 text-slate-300" />
          <div className={`flex items-center gap-1.5 ${step === 'confirmar' ? 'text-cyan-600 dark:text-cyan-400' : 'text-slate-400'}`}>
            <span className="w-5 h-5 rounded-full border border-current flex items-center justify-center text-[11px]">3</span>
            CONFIRMAR
          </div>
          <ArrowRight className="w-3 h-3 text-slate-300" />
          <div className={`flex items-center gap-1.5 ${step === 'salvar' ? 'text-cyan-600 dark:text-cyan-400' : 'text-slate-400'}`}>
            <span className="w-5 h-5 rounded-full border border-current flex items-center justify-center text-[11px]">4</span>
            SALVAR
          </div>
        </div>

        {/* Content per step */}
        <div className="flex-1 overflow-y-auto space-y-4">
          {/* ETAPA 1: GERAR */}
          {step === 'gerar' && (
            <div className="space-y-3">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                Texto Ditado / Relato Clínico Oral do Cirurgião-Dentista:
              </label>
              <textarea
                rows={5}
                value={dictationText}
                onChange={(e) => setDictationText(e.target.value)}
                placeholder="Ex: Realizamos hoje restauração em resina composta cor A2 no dente 16 faces oclusal e mesial, com anestesia infiltrativa de lidocaína. Paciente tolerou bem sem intercorrências."
                className="w-full text-xs p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-slate-900 dark:text-white resize-none focus:ring-2 focus:ring-cyan-500"
              />
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>Dica: Mencione o dente (ex: 16, 21), as faces (O, M, D, V) e os materiais utilizados.</span>
              </div>
            </div>
          )}

          {/* ETAPA 2: REVISAR */}
          {step === 'revisar' && (
            <div className="space-y-3">
              <div className="p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 rounded-xl text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  <strong>Revisão Humana Obrigatória:</strong> Verifique e edite qualquer dado antes de confirmar. Nenhuma evolução é gravada sem o seu aval.
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">Procedimento</label>
                  <input
                    type="text"
                    value={parsedData.procedure}
                    onChange={(e) => setParsedData({ ...parsedData, procedure: e.target.value })}
                    className="w-full text-xs p-2 bg-white dark:bg-slate-800 border rounded-xl"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 block mb-1">Dente (FDI)</label>
                    <input
                      type="text"
                      value={parsedData.tooth}
                      onChange={(e) => setParsedData({ ...parsedData, tooth: e.target.value })}
                      placeholder="Ex: 16"
                      className="w-full text-xs p-2 bg-white dark:bg-slate-800 border rounded-xl font-bold"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 block mb-1">Faces</label>
                    <input
                      type="text"
                      value={parsedData.surfaces.join(', ')}
                      onChange={(e) => setParsedData({ ...parsedData, surfaces: e.target.value.split(',').map(s => s.trim().toUpperCase()).filter(Boolean) })}
                      placeholder="O, M, D"
                      className="w-full text-xs p-2 bg-white dark:bg-slate-800 border rounded-xl font-bold"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">Materiais Utilizados</label>
                <input
                  type="text"
                  value={parsedData.materials.join(', ')}
                  onChange={(e) => setParsedData({ ...parsedData, materials: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                  className="w-full text-xs p-2 bg-white dark:bg-slate-800 border rounded-xl"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">Evolução Clínica Completa Gerada</label>
                <textarea
                  rows={3}
                  value={parsedData.freeEvolution}
                  onChange={(e) => setParsedData({ ...parsedData, freeEvolution: e.target.value })}
                  className="w-full text-xs p-2.5 bg-white dark:bg-slate-800 border rounded-xl resize-none"
                />
              </div>
            </div>
          )}

          {/* ETAPA 3 & 4: CONFIRMAR E SALVAR */}
          {(step === 'confirmar' || step === 'salvar') && (
            <div className="space-y-4">
              <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40 rounded-xl text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2 font-semibold">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <span>Dados clínicos validados e confirmados pelo Cirurgião-Dentista.</span>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl space-y-3">
                <label className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                  Escolha onde deseja aplicar estas informações:
                </label>
                <div className="space-y-2 text-xs">
                  <label className="flex items-center gap-2 p-2.5 bg-white dark:bg-slate-800 border rounded-xl cursor-pointer">
                    <input
                      type="radio"
                      name="destination"
                      value="both"
                      checked={destination === 'both'}
                      onChange={() => setDestination('both')}
                      className="text-cyan-600 focus:ring-cyan-500"
                    />
                    <div>
                      <span className="font-bold text-slate-900 dark:text-white block">Ambos (Recomendado)</span>
                      <span className="text-[11px] text-slate-500">Aplica campos estruturados (dente/procedimento) e o texto da evolução clínica.</span>
                    </div>
                  </label>

                  <label className="flex items-center gap-2 p-2.5 bg-white dark:bg-slate-800 border rounded-xl cursor-pointer">
                    <input
                      type="radio"
                      name="destination"
                      value="evolution"
                      checked={destination === 'evolution'}
                      onChange={() => setDestination('evolution')}
                      className="text-cyan-600 focus:ring-cyan-500"
                    />
                    <div>
                      <span className="font-bold text-slate-900 dark:text-white block">Apenas Evolução Livre</span>
                      <span className="text-[11px] text-slate-500">Insere o texto formal no campo de evolução da consulta.</span>
                    </div>
                  </label>

                  <label className="flex items-center gap-2 p-2.5 bg-white dark:bg-slate-800 border rounded-xl cursor-pointer">
                    <input
                      type="radio"
                      name="destination"
                      value="structured"
                      checked={destination === 'structured'}
                      onChange={() => setDestination('structured')}
                      className="text-cyan-600 focus:ring-cyan-500"
                    />
                    <div>
                      <span className="font-bold text-slate-900 dark:text-white block">Apenas Campos Estruturados</span>
                      <span className="text-[11px] text-slate-500">Atualiza o dente no odontograma e procedimentos realizados.</span>
                    </div>
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-800 pt-3">
          {step !== 'gerar' && (
            <button
              type="button"
              onClick={() => setStep(step === 'salvar' ? 'confirmar' : step === 'confirmar' ? 'revisar' : 'gerar')}
              className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-800"
            >
              Voltar
            </button>
          )}

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700"
            >
              Cancelar
            </button>

            {step === 'gerar' && (
              <button
                type="button"
                disabled={isProcessing}
                onClick={handleGenerate}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
              >
                {isProcessing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                {isProcessing ? 'Estruturando...' : 'GERAR Estruturação'}
              </button>
            )}

            {step === 'revisar' && (
              <button
                type="button"
                onClick={handleConfirmHumanReview}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                CONFIRMAR Revisão
              </button>
            )}

            {(step === 'confirmar' || step === 'salvar') && (
              <button
                type="button"
                onClick={handleApplyFinal}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm"
              >
                <Save className="w-3.5 h-3.5" />
                SALVAR no Prontuário
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
