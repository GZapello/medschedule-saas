import React from 'react';
import { X, ArrowRight, TrendingUp, Minus, TrendingDown, HelpCircle, CheckCircle2, Calendar } from 'lucide-react';

export interface ComparisonItem {
  id: string;
  category?: string;
  name: string;
  initialValue?: any;
  previousValue?: any;
  currentValue?: any;
  status: 'improved' | 'maintained' | 'worsened' | 'not_evaluated';
  notes?: string;
}

export interface EvolutionComparisonModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  initialDate?: string;
  previousDate?: string;
  currentDate?: string;
  items: ComparisonItem[];
}

export const EvolutionComparisonModal: React.FC<EvolutionComparisonModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  initialDate,
  previousDate,
  currentDate,
  items
}) => {
  if (!isOpen) return null;

  const getStatusBadge = (status: ComparisonItem['status']) => {
    switch (status) {
      case 'improved':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
            Melhorou
          </span>
        );
      case 'maintained':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
            <Minus className="w-3.5 h-3.5 text-amber-600" />
            Manteve
          </span>
        );
      case 'worsened':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300">
            <TrendingDown className="w-3.5 h-3.5 text-rose-600" />
            Piorou
          </span>
        );
      case 'not_evaluated':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400">
            <HelpCircle className="w-3.5 h-3.5 text-slate-500" />
            Não avaliado
          </span>
        );
    }
  };

  const formatValue = (val: any) => {
    if (val === undefined || val === null || val === '') return '-';
    if (typeof val === 'boolean') return val ? 'Sim / Presente' : 'Não / Ausente';
    if (typeof val === 'number') return String(val);
    if (typeof val === 'object') return JSON.stringify(val);
    return String(val);
  };

  // Group items by category if available
  const categories = Array.from(new Set(items.map(i => i.category || 'Geral')));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 w-full max-w-5xl max-h-[90vh] rounded-2xl shadow-2xl flex flex-col border border-slate-200 dark:border-slate-800 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              {title}
            </h2>
            {subtitle && <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Timeline Summary Bar */}
        <div className="px-6 py-3 bg-indigo-50/50 dark:bg-indigo-950/20 border-b border-indigo-100 dark:border-indigo-900/30 flex flex-wrap items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300">
            <Calendar className="w-4 h-4 text-indigo-500" />
            <span>Marcos Avaliativos:</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-slate-700 dark:text-slate-300">
              <strong>Inicial:</strong> {initialDate || 'N/D'}
            </span>
            <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
            <span className="px-2 py-0.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-slate-700 dark:text-slate-300">
              <strong>Anterior:</strong> {previousDate || 'N/D'}
            </span>
            <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
            <span className="px-2 py-0.5 bg-indigo-100 dark:bg-indigo-900/50 border border-indigo-200 dark:border-indigo-800 rounded font-bold text-indigo-700 dark:text-indigo-300">
              <strong>Atual:</strong> {currentDate || 'Hoje'}
            </span>
          </div>
        </div>

        {/* Comparison Content Table */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {items.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <HelpCircle className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p>Nenhum dado avaliativo longitudinal encontrado para comparação.</p>
            </div>
          ) : (
            categories.map(category => {
              const catItems = items.filter(i => (i.category || 'Geral') === category);
              return (
                <div key={category} className="space-y-2">
                  <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                    {category}
                  </h3>
                  <div className="overflow-hidden border border-slate-200 dark:border-slate-800 rounded-xl">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-100 dark:bg-slate-800/80 text-xs font-semibold text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                        <tr>
                          <th className="py-3 px-4">Item Avaliado</th>
                          <th className="py-3 px-4 text-center">Inicial ({initialDate || '-'})</th>
                          <th className="py-3 px-4 text-center">Anterior ({previousDate || '-'})</th>
                          <th className="py-3 px-4 text-center bg-indigo-50/50 dark:bg-indigo-950/20">Atual ({currentDate || 'Hoje'})</th>
                          <th className="py-3 px-4 text-center">Evolução</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                        {catItems.map(item => (
                          <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                            <td className="py-3 px-4 font-medium">
                              <div>{item.name}</div>
                              {item.notes && <div className="text-xs text-slate-400 font-normal mt-0.5">{item.notes}</div>}
                            </td>
                            <td className="py-3 px-4 text-center text-slate-500 dark:text-slate-400 font-mono text-xs">
                              {formatValue(item.initialValue)}
                            </td>
                            <td className="py-3 px-4 text-center text-slate-500 dark:text-slate-400 font-mono text-xs">
                              {formatValue(item.previousValue)}
                            </td>
                            <td className="py-3 px-4 text-center font-mono text-xs font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50/30 dark:bg-indigo-950/10">
                              {formatValue(item.currentValue)}
                            </td>
                            <td className="py-3 px-4 text-center">
                              {getStatusBadge(item.status)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-sm font-medium transition-colors"
          >
            Fechar Comparação
          </button>
        </div>
      </div>
    </div>
  );
};
