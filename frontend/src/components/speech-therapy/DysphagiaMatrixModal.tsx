import React, { useState, useEffect } from 'react';
import { X, AlertTriangle, ShieldCheck, CheckCircle2, Save, Activity, HeartCrack, ChevronRight } from 'lucide-react';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';

export interface ConsistencyTrial {
  levelId: string;
  levelName: string;
  tested: boolean;
  safe: 'safe' | 'safe_with_maneuvers' | 'unsafe' | 'not_tested';
  signs: {
    cough: boolean;
    choking: boolean;
    wetVoice: boolean;
    desaturation: boolean;
    oralResidue: boolean;
    multipleSwallows: boolean;
  };
  maneuversUsed?: string;
  notes?: string;
}

export interface DysphagiaMatrixModalProps {
  isOpen: boolean;
  onClose: () => void;
  patientId: string;
  patientName?: string;
  onInsertPrescription?: (prescriptionText: string) => void;
}

const DEFAULT_TRIALS: ConsistencyTrial[] = [
  {
    levelId: '0',
    levelName: 'IDDSI 0: Líquido Fino (Água, Chá, Sucos fluidos)',
    tested: true,
    safe: 'safe',
    signs: { cough: false, choking: false, wetVoice: false, desaturation: false, oralResidue: false, multipleSwallows: false },
    maneuversUsed: '',
    notes: ''
  },
  {
    levelId: '1',
    levelName: 'IDDSI 1: Levemente Espessado (Sucos espessados leves)',
    tested: false,
    safe: 'not_tested',
    signs: { cough: false, choking: false, wetVoice: false, desaturation: false, oralResidue: false, multipleSwallows: false },
    maneuversUsed: '',
    notes: ''
  },
  {
    levelId: '2',
    levelName: 'IDDSI 2: Suavemente Espessado (Consistência Néctar)',
    tested: true,
    safe: 'safe',
    signs: { cough: false, choking: false, wetVoice: false, desaturation: false, oralResidue: false, multipleSwallows: false },
    maneuversUsed: '',
    notes: ''
  },
  {
    levelId: '3',
    levelName: 'IDDSI 3: Moderadamente Espessado (Consistência Mel)',
    tested: false,
    safe: 'not_tested',
    signs: { cough: false, choking: false, wetVoice: false, desaturation: false, oralResidue: false, multipleSwallows: false },
    maneuversUsed: '',
    notes: ''
  },
  {
    levelId: '4',
    levelName: 'IDDSI 4: Extremamente Espessado / Purê (Pudim, Papinha)',
    tested: true,
    safe: 'safe',
    signs: { cough: false, choking: false, wetVoice: false, desaturation: false, oralResidue: false, multipleSwallows: false },
    maneuversUsed: '',
    notes: ''
  },
  {
    levelId: '5',
    levelName: 'IDDSI 5: Moído e Úmido (Carne moída com molho espesso)',
    tested: true,
    safe: 'safe',
    signs: { cough: false, choking: false, wetVoice: false, desaturation: false, oralResidue: false, multipleSwallows: false },
    maneuversUsed: '',
    notes: ''
  },
  {
    levelId: '6',
    levelName: 'IDDSI 6: Macio e Pedaços Pequenos (Legumes cozidos, picados)',
    tested: true,
    safe: 'safe_with_maneuvers',
    signs: { cough: false, choking: false, wetVoice: false, desaturation: false, oralResidue: true, multipleSwallows: true },
    maneuversUsed: 'Pausa entre bocados e deglutição múltipla',
    notes: 'Pequeno acúmulo em vestíbulo lateral'
  },
  {
    levelId: '7',
    levelName: 'IDDSI 7: Regular / Sólidos (Alimentação Geral Normal)',
    tested: true,
    safe: 'safe',
    signs: { cough: false, choking: false, wetVoice: false, desaturation: false, oralResidue: false, multipleSwallows: false },
    maneuversUsed: '',
    notes: ''
  }
];

export const DysphagiaMatrixModal: React.FC<DysphagiaMatrixModalProps> = ({
  isOpen,
  onClose,
  patientId,
  patientName,
  onInsertPrescription
}) => {
  const { showToast } = useToast();
  const [trials, setTrials] = useState<ConsistencyTrial[]>(DEFAULT_TRIALS);
  const [generalObservations, setGeneralObservations] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen && patientId) {
      loadMatrix();
    }
  }, [isOpen, patientId]);

  const loadMatrix = async () => {
    try {
      setLoading(true);
      const res = await ApiClient.get<any>(`/v1/speech-therapy/dysphagia-matrix/${patientId}`);
      if (res && res.trials_json) {
        const parsed = typeof res.trials_json === 'string' ? JSON.parse(res.trials_json) : res.trials_json;
        if (Array.isArray(parsed) && parsed.length > 0) {
          setTrials(parsed);
        }
        if (res.general_observations) {
          setGeneralObservations(res.general_observations);
        }
      }
    } catch (err) {
      console.warn('Erro ao carregar matriz de consistências:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const handleUpdateTrial = (idx: number, field: keyof ConsistencyTrial, value: any) => {
    const updated = [...trials];
    updated[idx] = { ...updated[idx], [field]: value };
    setTrials(updated);
  };

  const handleUpdateSign = (trialIdx: number, signKey: keyof ConsistencyTrial['signs'], val: boolean) => {
    const updated = [...trials];
    updated[trialIdx].signs = {
      ...updated[trialIdx].signs,
      [signKey]: val
    };
    setTrials(updated);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await ApiClient.post('/v1/speech-therapy/dysphagia-matrix', {
        patientId,
        trials,
        generalObservations
      });
      showToast('Matriz de consistências e deglutição salva!', 'success');
      onClose();
    } catch (err: any) {
      showToast(err.message || 'Erro ao salvar matriz de disfagia', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleApplyPrescription = () => {
    const safeItems = trials.filter(t => t.tested && (t.safe === 'safe' || t.safe === 'safe_with_maneuvers')).map(t => t.levelName);
    const unsafeItems = trials.filter(t => t.tested && t.safe === 'unsafe').map(t => t.levelName);

    const text = `[PARECER DE DEGLUTIÇÃO & CONDUTA NUTRICIONAL IDDSI]\nConsistências Seguras: ${safeItems.join(', ') || 'Nenhuma liberada sem assistência'}.\nConsistências Contraindicadas (Risco de Broncoaspiração): ${unsafeItems.join(', ') || 'Nenhuma'}.\nObservações e Manobras Protetoras: ${generalObservations || 'Manter postura ereta a 90 graus e higiene oral rigorosa pós-refeição.'}`;

    if (onInsertPrescription) {
      onInsertPrescription(text);
      showToast('Condutas inseridas no prontuário!', 'success');
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 w-full max-w-5xl max-h-[90vh] rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-50 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                Matriz Padronizada de Consistências e Disfagia (IDDSI)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Teste clínico de segurança de deglutição, sinais de broncoaspiração e manobras protetoras {patientName ? `• ${patientName}` : ''}
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

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="space-y-3">
            {trials.map((trial, idx) => (
              <div
                key={trial.levelId}
                className={`p-4 rounded-2xl border transition-all ${
                  trial.safe === 'unsafe'
                    ? 'border-red-300 bg-red-50/40 dark:bg-red-950/20'
                    : trial.safe === 'safe_with_maneuvers'
                    ? 'border-amber-200 bg-amber-50/40 dark:bg-amber-950/20'
                    : trial.safe === 'safe'
                    ? 'border-emerald-200 bg-emerald-50/30 dark:bg-emerald-950/10'
                    : 'border-slate-200 bg-slate-50/50 dark:bg-slate-800/20 opacity-75'
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id={`tested-${trial.levelId}`}
                      checked={trial.tested}
                      onChange={e => handleUpdateTrial(idx, 'tested', e.target.checked)}
                      className="w-4 h-4 rounded text-amber-600 cursor-pointer"
                    />
                    <label
                      htmlFor={`tested-${trial.levelId}`}
                      className="text-xs font-bold text-slate-900 dark:text-white cursor-pointer"
                    >
                      {trial.levelName}
                    </label>
                  </div>

                  {trial.tested && (
                    <div className="flex items-center gap-2">
                      <select
                        value={trial.safe}
                        onChange={e => handleUpdateTrial(idx, 'safe', e.target.value)}
                        className={`text-xs font-bold px-3 py-1 rounded-xl border ${
                          trial.safe === 'safe'
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                            : trial.safe === 'safe_with_maneuvers'
                            ? 'bg-amber-100 text-amber-800 border-amber-300'
                            : trial.safe === 'unsafe'
                            ? 'bg-red-100 text-red-800 border-red-300'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        <option value="safe">Segura (Sem Riscos)</option>
                        <option value="safe_with_maneuvers">Segura com Manobras</option>
                        <option value="unsafe">Contraindicada (Alto Risco)</option>
                        <option value="not_tested">Não Testada</option>
                      </select>
                    </div>
                  )}
                </div>

                {trial.tested && (
                  <div className="pt-3 space-y-3">
                    {/* Sinais Clínicos de Penetração / Broncoaspiração */}
                    <div>
                      <span className="text-[10px] font-extrabold uppercase text-slate-400 block mb-1.5">
                        Sinais Clínicos Observados:
                      </span>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 text-xs">
                        {[
                          { key: 'cough', label: 'Tosse' },
                          { key: 'choking', label: 'Engasgo / Pigarro' },
                          { key: 'wetVoice', label: 'Voz Molhada' },
                          { key: 'desaturation', label: 'Queda de Sat. O2' },
                          { key: 'oralResidue', label: 'Resíduo Oral' },
                          { key: 'multipleSwallows', label: 'Múltiplas Deglutições' }
                        ].map(sign => (
                          <label
                            key={sign.key}
                            className={`flex items-center gap-1.5 p-2 rounded-xl border text-[11px] font-semibold cursor-pointer transition-all ${
                              trial.signs[sign.key as keyof ConsistencyTrial['signs']]
                                ? 'bg-red-50 border-red-200 text-red-700 font-bold'
                                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={trial.signs[sign.key as keyof ConsistencyTrial['signs']]}
                              onChange={e => handleUpdateSign(idx, sign.key as any, e.target.checked)}
                              className="w-3.5 h-3.5 rounded text-red-600"
                            />
                            <span>{sign.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      <input
                        type="text"
                        placeholder="Manobras aplicadas (ex: queixo para baixo, esforço, deglutição múltipla)..."
                        value={trial.maneuversUsed || ''}
                        onChange={e => handleUpdateTrial(idx, 'maneuversUsed', e.target.value)}
                        className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                      />
                      <input
                        type="text"
                        placeholder="Observações da consistência..."
                        value={trial.notes || ''}
                        onChange={e => handleUpdateTrial(idx, 'notes', e.target.value)}
                        className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
              Parecer Fonoaudiológico Global sobre Deglutição e Segurança Alimentar
            </label>
            <textarea
              rows={3}
              value={generalObservations}
              onChange={e => setGeneralObservations(e.target.value)}
              placeholder="Descreva a via de alimentação recomendada (VO exclusiva, mista ou alternativa SNE/GTT), consistências liberadas e orientações para os cuidadores..."
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex justify-between items-center">
          {onInsertPrescription && (
            <button
              type="button"
              onClick={handleApplyPrescription}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-amber-800 bg-amber-100 hover:bg-amber-200 rounded-xl transition-colors cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              Inserir Parecer no Prontuário
            </button>
          )}

          <div className="flex items-center gap-3 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
            >
              Fechar
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={handleSave}
              className="inline-flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md transition-colors cursor-pointer disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Salvando...' : 'Salvar Matriz de Disfagia'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
