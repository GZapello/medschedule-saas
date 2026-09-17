import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, X, ArrowRight, Smile } from 'lucide-react';

export interface ProcedureSuggestionItem {
  toothNumber: number;
  face?: string;
  suggestedCondition: string;
  procedureText: string;
}

export interface ProcedureSuggestionModalProps {
  isOpen: boolean;
  onClose: () => void;
  suggestions: ProcedureSuggestionItem[];
  onConfirm: (accepted: ProcedureSuggestionItem[]) => void;
}

export const ProcedureSuggestionModal: React.FC<ProcedureSuggestionModalProps> = ({
  isOpen,
  onClose,
  suggestions,
  onConfirm
}) => {
  const [selectedIndices, setSelectedIndices] = useState<number[]>(
    suggestions.map((_, i) => i)
  );

  if (!isOpen || suggestions.length === 0) return null;

  const toggleSelect = (index: number) => {
    setSelectedIndices(prev =>
      prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]
    );
  };

  const handleApply = () => {
    const accepted = suggestions.filter((_, i) => selectedIndices.includes(i));
    onConfirm(accepted);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <span className="p-2 bg-cyan-100 dark:bg-cyan-950/60 rounded-xl text-cyan-700 dark:text-cyan-300">
              <Smile className="w-5 h-5" />
            </span>
            <div>
              <h3 className="text-base font-black text-slate-900 dark:text-white">
                Atualização do Odontograma Sugerida
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Confirmar procedimentos realizados para atualizar o mapa dental
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-3 bg-cyan-50/70 dark:bg-cyan-950/30 border border-cyan-200 dark:border-cyan-900/40 rounded-xl text-xs text-cyan-900 dark:text-cyan-200 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-cyan-600 shrink-0 mt-0.5" />
          <span>
            Identificamos procedimentos clínicos realizados nesta sessão. Confirme se deseja atualizar o status dos elementos no Odontograma:
          </span>
        </div>

        {/* Suggestions list */}
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {suggestions.map((item, idx) => (
            <label
              key={idx}
              className={`flex items-start gap-3 p-3 rounded-2xl border cursor-pointer transition ${
                selectedIndices.includes(idx)
                  ? 'bg-cyan-50/50 border-cyan-300 dark:bg-cyan-950/20 dark:border-cyan-800'
                  : 'bg-white border-slate-200 dark:bg-slate-800 dark:border-slate-700 opacity-60'
              }`}
            >
              <input
                type="checkbox"
                checked={selectedIndices.includes(idx)}
                onChange={() => toggleSelect(idx)}
                className="mt-1 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500 w-4 h-4"
              />
              <div className="space-y-0.5 text-xs">
                <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <span className="w-6 h-6 rounded-lg bg-cyan-600 text-white font-black text-xs flex items-center justify-center">
                    {item.toothNumber}
                  </span>
                  <span>{item.procedureText}</span>
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Condição sugerida: <strong>{item.suggestedCondition}</strong>
                  {item.face && <span> • Face: {item.face.toUpperCase()}</span>}
                </div>
              </div>
            </label>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-800 pt-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs text-slate-600 hover:text-slate-800"
          >
            Não atualizar agora
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="px-5 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl text-xs font-bold shadow-sm flex items-center gap-1.5"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            Confirmar e Atualizar Odontograma
          </button>
        </div>
      </div>
    </div>
  );
};
