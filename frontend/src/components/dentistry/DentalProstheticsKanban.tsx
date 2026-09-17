import React, { useState, useEffect } from 'react';
import { Package, Clock, CheckCircle2, AlertTriangle, ArrowRight, Calendar, User, Truck } from 'lucide-react';
import { ApiClient } from '../../api/client';

export interface ProstheticWork {
  id: string;
  patient_id: string;
  patient_name?: string;
  lab_name: string;
  work_type: string;
  tooth_number?: string;
  vita_shade?: string;
  sent_date?: string;
  delivery_date?: string;
  trial_date?: string;
  cost?: number;
  status: 'sent_to_lab' | 'in_production' | 'delivered_to_clinic' | 'tested_adjusted' | 'installed';
  notes?: string;
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
  { id: 'installed', label: 'Instalado em Boca', color: 'border-emerald-500 text-emerald-700 bg-emerald-50/50' }
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
        const res = await ApiClient.get(`/v1/dentistry/prosthetics/${patientId}`);
        if (Array.isArray(res)) setItems(res);
      } else {
        const res = await ApiClient.get('/v1/dentistry/prosthetics-lab/pending');
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
  }, [patientId]);

  const handleAdvance = async (work: ProstheticWork) => {
    const currentIdx = COLUMNS.findIndex(c => c.id === work.status);
    if (currentIdx < COLUMNS.length - 1) {
      const nextStatus = COLUMNS[currentIdx + 1].id;
      try {
        await ApiClient.put(`/v1/dentistry/prosthetics/${work.id}`, { status: nextStatus });
        setItems(items.map(i => i.id === work.id ? { ...i, status: nextStatus as any } : i));
        if (onUpdateStatus) onUpdateStatus(work.id, nextStatus);
      } catch (err) {
        console.error('[DentalProstheticsKanban] Erro ao avançar status:', err);
      }
    }
  };

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
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-3 overflow-x-auto min-h-[300px]">
        {COLUMNS.map(col => {
          const colItems = items.filter(i => (i.status || 'sent_to_lab') === col.id);
          return (
            <div
              key={col.id}
              className="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-2xl p-3 flex flex-col space-y-2 min-w-[200px]"
            >
              <div className={`p-2 rounded-xl border text-xs font-black uppercase flex items-center justify-between ${col.color}`}>
                <span>{col.label}</span>
                <span className="w-5 h-5 rounded-full bg-white/80 dark:bg-slate-900/80 flex items-center justify-center text-[10px]">
                  {colItems.length}
                </span>
              </div>

              <div className="flex-1 space-y-2.5 overflow-y-auto">
                {colItems.map(item => (
                  <div
                    key={item.id}
                    className="p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl space-y-2 shadow-sm hover:border-indigo-400 transition"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-900 dark:text-white truncate">
                        {item.work_type}
                      </span>
                      {item.tooth_number && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700">
                          D: {item.tooth_number}
                        </span>
                      )}
                    </div>

                    <div className="text-[11px] text-slate-500 space-y-0.5">
                      <div>Lab: <strong>{item.lab_name}</strong></div>
                      {item.vita_shade && <div>Cor: {item.vita_shade}</div>}
                      {item.delivery_date && (
                        <div className="flex items-center gap-1 text-indigo-600 font-semibold">
                          <Calendar className="w-3 h-3" />
                          Previsão: {new Date(item.delivery_date).toLocaleDateString('pt-BR')}
                        </div>
                      )}
                    </div>

                    {col.id !== 'installed' && (
                      <button
                        type="button"
                        onClick={() => handleAdvance(item)}
                        className="w-full mt-1 px-2 py-1 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-600 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1 transition"
                      >
                        Avançar etapa
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
