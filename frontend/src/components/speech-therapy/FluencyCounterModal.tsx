import React, { useState, useEffect, useRef } from 'react';
import { X, Play, Pause, RotateCcw, Plus, Minus, Activity, Save, History, CheckCircle2, Clock, Volume2 } from 'lucide-react';
import { ApiClient } from '../../api/client';
import { useToast } from '../../context/ToastContext';

export interface FluencyCounterModalProps {
  isOpen: boolean;
  onClose: () => void;
  patientId: string;
  patientName?: string;
}

export const FluencyCounterModal: React.FC<FluencyCounterModalProps> = ({
  isOpen,
  onClose,
  patientId,
  patientName
}) => {
  const { showToast } = useToast();

  // Timer states
  const [seconds, setSeconds] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Counters
  const [wordsCount, setWordsCount] = useState(100);
  const [syllablesCount, setSyllablesCount] = useState(150);

  // Típicas
  const [hesitations, setHesitations] = useState(0);
  const [interjections, setInterjections] = useState(0);
  const [revisions, setRevisions] = useState(0);
  const [wordRepetitions, setWordRepetitions] = useState(0);

  // Gagas (SLD)
  const [soundRepetitions, setSoundRepetitions] = useState(0);
  const [syllableRepetitions, setSyllableRepetitions] = useState(0);
  const [prolongations, setProlongations] = useState(0);
  const [blocks, setBlocks] = useState(0);
  const [tensePauses, setTensePauses] = useState(0);

  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'counter' | 'history'>('counter');
  const [history, setHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Timer logic
  useEffect(() => {
    if (isRunning) {
      timerRef.current = setInterval(() => {
        setSeconds(prev => prev + 1);
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRunning]);

  useEffect(() => {
    if (isOpen && patientId) {
      loadHistory();
    }
  }, [isOpen, patientId]);

  const loadHistory = async () => {
    try {
      setLoadingHistory(true);
      const res = await ApiClient.get<any[]>(`/v1/speech-therapy/fluency-samples/${patientId}`);
      if (Array.isArray(res)) setHistory(res);
    } catch (err) {
      console.warn('Erro ao carregar histórico de fluência:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  if (!isOpen) return null;

  const handleResetTimer = () => {
    setIsRunning(false);
    setSeconds(0);
  };

  const formatTimer = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Cálculos Automáticos
  const totalTypical = hesitations + interjections + revisions + wordRepetitions;
  const totalStuttered = soundRepetitions + syllableRepetitions + prolongations + blocks + tensePauses;
  const totalDisfluencies = totalTypical + totalStuttered;

  const denom = wordsCount > 0 ? wordsCount : 100;
  const pctDisfluency = Number(((totalDisfluencies / denom) * 100).toFixed(1));
  const pctStuttering = Number(((totalStuttered / denom) * 100).toFixed(1));

  const minutes = seconds > 0 ? seconds / 60 : 1;
  const wpm = Math.round(wordsCount / minutes);
  const spm = Math.round(syllablesCount / minutes);

  const handleSave = async () => {
    try {
      setSaving(true);
      await ApiClient.post('/v1/speech-therapy/fluency-samples', {
        patientId,
        durationSeconds: seconds,
        wordsCount,
        syllablesCount,
        repetitions: soundRepetitions + syllableRepetitions + wordRepetitions,
        prolongations,
        blocks,
        interjections,
        revisions,
        pauses: tensePauses,
        disfluencyPercentage: pctDisfluency,
        stutteringPercentage: pctStuttering,
        speakingRateWpm: wpm,
        speakingRateSpm: spm,
        notes: `Típicas: ${totalTypical}, Gagas: ${totalStuttered}. ${notes}`
      });
      showToast('Amostra de fluência registrada com sucesso!', 'success');
      loadHistory();
      setActiveTab('history');
    } catch (err: any) {
      showToast(err.message || 'Erro ao salvar amostra de fluência', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 w-full max-w-4xl max-h-[90vh] rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-teal-50 dark:bg-teal-900/40 text-teal-600 dark:text-teal-400 flex items-center justify-center">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                Contador de Fluência e Taxa de Descontinuidade de Fala
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Cronômetro em tempo real, contagem de disfluências típicas e gagas, % de rupturas e PPM {patientName ? `• ${patientName}` : ''}
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

        {/* Tabs */}
        <div className="px-6 pt-3 border-b border-slate-200 dark:border-slate-800 flex gap-4">
          <button
            onClick={() => setActiveTab('counter')}
            className={`pb-3 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
              activeTab === 'counter'
                ? 'border-teal-600 text-teal-600 dark:text-teal-400'
                : 'border-transparent text-slate-400 hover:text-slate-700'
            }`}
          >
            Contador em Tempo Real
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`pb-3 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'history'
                ? 'border-teal-600 text-teal-600 dark:text-teal-400'
                : 'border-transparent text-slate-400 hover:text-slate-700'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            Amostras Anteriores ({history.length})
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === 'counter' ? (
            <>
              {/* Cronômetro e Painel de Métricas */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
                {/* Timer Box */}
                <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex flex-col items-center justify-center space-y-2">
                  <span className="text-[10px] font-extrabold uppercase text-slate-400">Tempo de Amostra</span>
                  <span className="text-3xl font-black font-mono text-slate-900 dark:text-white">
                    {formatTimer(seconds)}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsRunning(!isRunning)}
                      className={`p-2 rounded-xl font-bold text-white transition-all cursor-pointer ${
                        isRunning ? 'bg-amber-500 hover:bg-amber-600' : 'bg-teal-600 hover:bg-teal-700'
                      }`}
                    >
                      {isRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    </button>
                    <button
                      type="button"
                      onClick={handleResetTimer}
                      className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Card % Descontinuidade Total */}
                <div className="p-4 rounded-2xl border border-teal-200 bg-teal-50/50 dark:bg-teal-950/20 space-y-1">
                  <span className="text-[10px] font-extrabold uppercase text-teal-700 dark:text-teal-400">
                    % Descontinuidade Total
                  </span>
                  <div className="text-2xl font-black text-teal-800 dark:text-teal-300">
                    {pctDisfluency}%
                  </div>
                  <p className="text-[11px] text-slate-500">
                    {totalDisfluencies} disfluências em {wordsCount} palavras
                  </p>
                </div>

                {/* Card % Rupturas Gagas (SLD) */}
                <div className="p-4 rounded-2xl border border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 space-y-1">
                  <span className="text-[10px] font-extrabold uppercase text-amber-700 dark:text-amber-400">
                    % Rupturas Gagas (SLD)
                  </span>
                  <div className="text-2xl font-black text-amber-800 dark:text-amber-300">
                    {pctStuttering}%
                  </div>
                  <p className="text-[11px] text-slate-500">
                    {pctStuttering >= 3 ? 'Indicativo de gagueira (>= 3%)' : 'Dentro do padrão de referência'}
                  </p>
                </div>

                {/* Card Velocidade de Fala */}
                <div className="p-4 rounded-2xl border border-indigo-200 bg-indigo-50/50 dark:bg-indigo-950/20 space-y-1">
                  <span className="text-[10px] font-extrabold uppercase text-indigo-700 dark:text-indigo-400">
                    Velocidade de Fala
                  </span>
                  <div className="text-2xl font-black text-indigo-800 dark:text-indigo-300">
                    {wpm} <span className="text-xs font-semibold text-slate-400">PPM</span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    {spm} sílabas/minuto (SPM)
                  </p>
                </div>
              </div>

              {/* Ajuste de Palavras e Sílabas da Amostra */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Total de Palavras na Amostra:
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setWordsCount(Math.max(10, wordsCount - 10))}
                      className="p-1 rounded-lg border border-slate-300 hover:bg-slate-100 cursor-pointer"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <input
                      type="number"
                      value={wordsCount}
                      onChange={e => setWordsCount(Number(e.target.value))}
                      className="w-16 px-2 py-1 text-center font-bold text-xs rounded-lg border border-slate-300"
                    />
                    <button
                      type="button"
                      onClick={() => setWordsCount(wordsCount + 10)}
                      className="p-1 rounded-lg border border-slate-300 hover:bg-slate-100 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Total de Sílabas na Amostra:
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSyllablesCount(Math.max(10, syllablesCount - 10))}
                      className="p-1 rounded-lg border border-slate-300 hover:bg-slate-100 cursor-pointer"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <input
                      type="number"
                      value={syllablesCount}
                      onChange={e => setSyllablesCount(Number(e.target.value))}
                      className="w-16 px-2 py-1 text-center font-bold text-xs rounded-lg border border-slate-300"
                    />
                    <button
                      type="button"
                      onClick={() => setSyllablesCount(syllablesCount + 10)}
                      className="p-1 rounded-lg border border-slate-300 hover:bg-slate-100 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Contadores Detalhados de Rupturas */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Coluna 1: Disfluências Típicas (Comuns) */}
                <div className="space-y-3 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xs">
                  <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center justify-between">
                    <span>Disfluências Comuns / Típicas</span>
                    <span className="text-xs font-black text-teal-600 bg-teal-50 px-2 py-0.5 rounded-full">
                      Total: {totalTypical}
                    </span>
                  </h4>

                  {[
                    { label: 'Hesitações', val: hesitations, set: setHesitations },
                    { label: 'Interjeições (ééé, humm)', val: interjections, set: setInterjections },
                    { label: 'Revisões de Frase', val: revisions, set: setRevisions },
                    { label: 'Repetições de Palavras Inteiras', val: wordRepetitions, set: setWordRepetitions }
                  ].map(item => (
                    <div key={item.label} className="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-slate-800/40 text-xs">
                      <span className="font-semibold text-slate-700 dark:text-slate-300">{item.label}</span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => item.set(Math.max(0, item.val - 1))}
                          className="w-7 h-7 rounded-lg border border-slate-200 bg-white dark:bg-slate-800 flex items-center justify-center hover:bg-slate-100 cursor-pointer"
                        >
                          -
                        </button>
                        <span className="w-6 text-center font-black">{item.val}</span>
                        <button
                          type="button"
                          onClick={() => item.set(item.val + 1)}
                          className="w-7 h-7 rounded-lg bg-teal-600 text-white flex items-center justify-center hover:bg-teal-700 cursor-pointer shadow-xs"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Coluna 2: Disfluências Gagas (SLD) */}
                <div className="space-y-3 p-4 rounded-2xl border border-amber-200 dark:border-amber-900/50 bg-white dark:bg-slate-900 shadow-xs">
                  <h4 className="text-xs font-bold text-amber-900 dark:text-amber-300 flex items-center justify-between">
                    <span>Disfluências Gagas (SLD)</span>
                    <span className="text-xs font-black text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                      Total: {totalStuttered}
                    </span>
                  </h4>

                  {[
                    { label: 'Repetição de Sons (p-p-pato)', val: soundRepetitions, set: setSoundRepetitions },
                    { label: 'Repetição de Sílabas (bo-bo-bola)', val: syllableRepetitions, set: setSyllableRepetitions },
                    { label: 'Prolongamentos (ssssapo)', val: prolongations, set: setProlongations },
                    { label: 'Bloqueios / Travamentos', val: blocks, set: setBlocks },
                    { label: 'Pausas Tensas / Esforço Físico', val: tensePauses, set: setTensePauses }
                  ].map(item => (
                    <div key={item.label} className="flex items-center justify-between p-2 rounded-xl bg-amber-50/40 dark:bg-amber-950/20 text-xs">
                      <span className="font-semibold text-slate-800 dark:text-slate-200">{item.label}</span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => item.set(Math.max(0, item.val - 1))}
                          className="w-7 h-7 rounded-lg border border-amber-200 bg-white dark:bg-slate-800 flex items-center justify-center hover:bg-amber-50 cursor-pointer"
                        >
                          -
                        </button>
                        <span className="w-6 text-center font-black text-amber-900 dark:text-amber-300">{item.val}</span>
                        <button
                          type="button"
                          onClick={() => item.set(item.val + 1)}
                          className="w-7 h-7 rounded-lg bg-amber-600 text-white flex items-center justify-center hover:bg-amber-700 cursor-pointer shadow-xs"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Observações */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Observações Qualitativas da Fala (Tensão Facial, Movimentos Associados, Atitude Comunicativa)
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Ex: Tensão perioral observada em fonemas plosivos, ausência de evitação de palavras..."
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                />
              </div>
            </>
          ) : (
            <div className="space-y-3">
              {loadingHistory ? (
                <div className="p-8 text-center text-xs text-slate-400">Carregando histórico de fluência...</div>
              ) : history.length === 0 ? (
                <div className="p-12 text-center text-xs text-slate-400 bg-slate-50 dark:bg-slate-800/20 rounded-2xl">
                  Nenhuma amostra de fluência registrada para este paciente ainda.
                </div>
              ) : (
                history.map(item => (
                  <div
                    key={item.id}
                    className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2 shadow-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-teal-700 dark:text-teal-400">
                        Amostra de {item.duration_seconds ? `${item.duration_seconds} segundos` : 'Fala'}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {new Date(item.created_at).toLocaleDateString('pt-BR')}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                        <span className="text-[10px] text-slate-400 block">% Descontinuidade</span>
                        <strong className="text-teal-700">{item.disfluency_percentage}%</strong>
                      </div>
                      <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/20">
                        <span className="text-[10px] text-slate-400 block">% Rupturas Gagas</span>
                        <strong className="text-amber-700">{item.stuttering_percentage}%</strong>
                      </div>
                      <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                        <span className="text-[10px] text-slate-400 block">Velocidade (PPM)</span>
                        <strong>{item.speaking_rate_wpm || '-'} PPM</strong>
                      </div>
                      <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                        <span className="text-[10px] text-slate-400 block">Palavras / Sílabas</span>
                        <strong>{item.words_count} p / {item.syllables_count} s</strong>
                      </div>
                    </div>
                    {item.notes && <p className="text-[11px] text-slate-600 dark:text-slate-400 pt-1">{item.notes}</p>}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {activeTab === 'counter' && (
          <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex justify-end gap-3">
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
              className="inline-flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl shadow-md transition-colors cursor-pointer disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Salvando...' : 'Salvar Amostra de Fluência'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
