import React, { useState, useEffect } from 'react';
import { Package, Clock, CheckCircle2, AlertTriangle, ArrowRight, Calendar, User, Truck, XCircle, RotateCcw } from 'lucide-react';
import { ApiClient } from '../../api/client';

export interface ProstheticWork {
  id: string;
  patient_id: string;
  patient_name?: string;
  professional_name?: string;
  lab_name: string;
  work_type: string;
  tooth_number?: string;
  shade_color?: string;
  vita_shade?: string;
  material?: string;
  sent_date?: string;
  expected_date?: string;
  delivery_date?: string;
  received_date?: string;
  trial_date?: string;
  cost_value?: number;
  cost?: number;
  status: 'sent_to_lab' | 'in_production' | 'delivered_to_clinic' | 'tested_adjusted' | 'installed' | 'canceled' | 'requested';
  notes?: string;
  isOverdue?: boolean;
}

export interface DentalProstheticsKanbanProps {
  patientId?: string;
  onUpdateStatus?: (id: string, newStatus: string) => void;
}

const COLUMNS = [
  { id: 'sent_to_lab', label: 'Enviado ao Lab', color: 'border-blue-500 text-blue-700 bg-blue-50/50' },
  { id: 'in_production', label: 'Em Confecção', color: 'border-amber-500 text-amber-700 bg-amber-50/50' },
  { id: 'delivered_to_clinic', label: 'Entregue na Clínica', color: 'border-indigo-500 text-indigo-700 bg-indigo-50/50' },
  { id: 'tested_adjusted', label: 'Provado / Ajuste', color: 'border-purple-500 text-purple-700 bg-purple-50/50' },
  { id: 'installed', label: 'Instalado em Boca', color: 'border-emerald-500 text-emerald-700 bg-emerald-50/50' },
  { id: 'canceled', label: 'Cancelado', color: 'border-rose-500 text-rose-700 bg-rose-50/50' }
];

export const DentalProstheticsKanban: React.FC<DentalProstheticsKanbanProps> = ({
  patientId,
  onUpdateStatus
}) => {
  const [items, setItems] = useState<ProstheticWork[]>([]);
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      if (patientId) {
        const res = await ApiClient.get<ProstheticWork[]>(`/v1/dentistry/prosthetics/${patientId}`);
        if (Array.isArray(res)) setItems(res);
      } else {
        const res = await ApiClient.get<ProstheticWork[]>('/v1/dentistry/prosthetics-lab/pending');
        if (Array.isArray(res)) setItems(res);
      }
    } catch (err) {
      console.error('[DentalProstheticsKanban] Erro:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    const handleCustomUpdate = () => {
      loadData();
    };
    window.addEventListener('zemda-prosthetics-updated', handleCustomUpdate);
    return () => {
      window.removeEventListener('zemda-prosthetics-updated', handleCustomUpdate);
    };
  }, [patientId]);

  const handleUpdateStatus = async (workId: string, newStatus: string) => {
    try {
      await ApiClient.put(`/v1/dentistry/prosthetics/${workId}`, { status: newStatus });
      setItems(prev => prev.map(i => i.id === workId ? { ...i, status: newStatus as any } : i));
      if (onUpdateStatus) onUpdateStatus(workId, newStatus);
      window.dispatchEvent(new CustomEvent('zemda-prosthetics-updated', { detail: { id: workId, status: newStatus } }));
    } catch (err) {
      console.error('[DentalProstheticsKanban] Erro ao atualizar status:', err);
    }
  };

  const handleAdvance = (work: ProstheticWork) => {
    const currentStatus = work.status === 'requested' ? 'sent_to_lab' : work.status;
    const currentIdx = COLUMNS.findIndex(c => c.id === currentStatus);
    // Avança dentro do fluxo padrão antes de 'installed'
    if (currentIdx >= 0 && currentIdx < 4) {
      const nextStatus = COLUMNS[currentIdx + 1].id;
      handleUpdateStatus(work.id, nextStatus);
    }
  };

  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Truck className="w-5 h-5 text-indigo-600" />
            Fluxo Kanban do Laboratório de Prótese
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Acompanhe cada etapa de confecção, provas intermediárias e data prevista de entrega
          </p>
        </div>
        {loading && (
          <span className="text-xs text-indigo-600 font-bold flex items-center gap-1.5 animate-pulse">
            <Clock className="w-3.5 h-3.5 animate-spin" /> Atualizando...
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-6 gap-3 overflow-x-auto min-h-[320px]">
        {COLUMNS.map(col => {
          const colItems = items.filter(i => {
            const st = i.status === 'requested' ? 'sent_to_lab' : (i.status || 'sent_to_lab');
            return st === col.id;
          });
          return (
            <div
              key={col.id}
              className="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-2xl p-3 flex flex-col space-y-2 min-w-[210px]"
            >
              <div className={`p-2 rounded-xl border text-xs font-black uppercase flex items-center justify-between ${col.color}`}>
                <span className="truncate">{col.label}</span>
                <span className="w-5 h-5 rounded-full bg-white/80 dark:bg-slate-900/80 flex items-center justify-center text-[10px]">
                  {colItems.length}
                </span>
              </div>

              <div className="flex-1 space-y-2.5 overflow-y-auto">
                {colItems.length === 0 ? (
                  <div className="h-24 flex items-center justify-center text-[11px] text-slate-400 dark:text-slate-500 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
                    Sem itens
                  </div>
                ) : (
                  colItems.map(item => {
                    const shade = item.shade_color || item.vita_shade;
                    const datePrev = item.expected_date || item.delivery_date;
                    const cost = item.cost_value !== undefined && item.cost_value !== null ? item.cost_value : item.cost;
                    const isDelayed = item.isOverdue || (datePrev && datePrev < today && item.status !== 'installed' && item.status !== 'canceled');

                    return (
                      <div
                        key={item.id}
                        className={`p-3 bg-white dark:bg-slate-800 border rounded-xl space-y-2 shadow-sm transition ${
                          isDelayed ? 'border-rose-400 dark:border-rose-600 bg-rose-50/20' : 'border-slate-200 dark:border-slate-700 hover:border-indigo-400'
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-slate-900 dark:text-white truncate" title={item.work_type}>
                            {item.work_type}
                          </span>
                          {item.tooth_number && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 shrink-0">
                              D: {item.tooth_number}
                            </span>
                          )}
                        </div>

                        {item.patient_name && !patientId && (
                          <div className="text-[11px] font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1 truncate">
                            <User className="w-3 h-3 text-slate-400" />
                            {item.patient_name}
                          </div>
                        )}

                        <div className="text-[11px] text-slate-500 space-y-0.5">
                          <div>Lab: <strong className="text-slate-700 dark:text-slate-300">{item.lab_name}</strong></div>
                          {shade && <div>Cor: <strong>{shade}</strong></div>}
                          {item.material && <div>Mat.: <strong>{item.material}</strong></div>}

                          {datePrev && (
                            <div className={`flex items-center gap-1 font-semibold ${isDelayed ? 'text-rose-600' : 'text-indigo-600'}`}>
                              <Calendar className="w-3 h-3" />
                              Prev.: {new Date(datePrev + 'T00:00:00').toLocaleDateString('pt-BR')}
                            </div>
                          )}

                          {isDelayed && (
                            <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-black bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">
                              <AlertTriangle className="w-2.5 h-2.5" /> Entrega em atraso
                            </div>
                          )}

                          {cost !== undefined && cost !== null && Number(cost) > 0 && (
                            <div className="text-slate-600 dark:text-slate-400 font-medium">
                              Custo: R$ {Number(cost).toFixed(2)}
                            </div>
                          )}
                        </div>

                        {/* Ações por etapa */}
                        <div className="pt-1 flex items-center gap-1.5">
                          {col.id !== 'installed' && col.id !== 'canceled' && (
                            <button
                              type="button"
                              onClick={() => handleAdvance(item)}
                              className="flex-1 px-2 py-1 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-700 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-indigo-900/50 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1 transition cursor-pointer"
                              title="Avançar para a próxima coluna do fluxo"
                            >
                              Avançar
                              <ArrowRight className="w-3 h-3" />
                            </button>
                          )}

                          {col.id !== 'canceled' && col.id !== 'installed' && (
                            <button
                              type="button"
                              onClick={() => handleUpdateStatus(item.id, 'canceled')}
                              className="px-2 py-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-lg text-[10px] font-bold transition cursor-pointer"
                              title="Cancelar este trabalho protético"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {col.id === 'canceled' && (
                            <button
                              type="button"
                              onClick={() => handleUpdateStatus(item.id, 'sent_to_lab')}
                              className="w-full px-2 py-1 bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-600 dark:bg-slate-700 dark:text-slate-300 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1 transition cursor-pointer"
                              title="Reabrir trabalho de prótese"
                            >
                              <RotateCcw className="w-3 h-3" />
                              Reativar
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
