import React, { useState, useEffect } from 'react';
import { X, Clock, FileText, Camera, Activity, Scissors, Package, AlertCircle, Plus, Calendar, CheckCircle2 } from 'lucide-react';
import { ApiClient } from '../../api/client';
import { DENTAL_CONDITIONS } from './OdontogramCanvas';

export interface ToothDossierDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  patientId: string;
  toothNumber: number | null;
}

export const ToothDossierDrawer: React.FC<ToothDossierDrawerProps> = ({
  isOpen,
  onClose,
  patientId,
  toothNumber
}) => {
  const [loading, setLoading] = useState(false);
  const [dossier, setDossier] = useState<any>(null);

  useEffect(() => {
    if (isOpen && patientId && toothNumber) {
      loadDossier();
    } else {
      setDossier(null);
    }
  }, [isOpen, patientId, toothNumber]);

  const loadDossier = async () => {
    if (!patientId || !toothNumber) return;
    try {
      setLoading(true);
      const res = await ApiClient.get(`/v1/dentistry/teeth/${patientId}/${toothNumber}/dossier`);
      setDossier(res);
    } catch (err) {
      console.error('[ToothDossierDrawer] Erro ao carregar dossiê:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !toothNumber) return null;

  const getToothName = (num: number) => {
    const isDeciduous = num >= 51 && num <= 85;
    const digit = num % 10;
    let name = '';
    if (digit === 1) name = 'Incisivo Central';
    else if (digit === 2) name = 'Incisivo Lateral';
    else if (digit === 3) name = 'Canino';
    else if (digit === 4) name = isDeciduous ? 'Primeiro Molar Decíduo' : 'Primeiro Pré-Molar';
    else if (digit === 5) name = isDeciduous ? 'Segundo Molar Decíduo' : 'Segundo Pré-Molar';
    else if (digit === 6) name = 'Primeiro Molar';
    else if (digit === 7) name = 'Segundo Molar';
    else if (digit === 8) name = 'Terceiro Molar (Siso)';

    const quadrant = Math.floor(num / 10);
    let quadName = '';
    if (quadrant === 1 || quadrant === 5) quadName = 'Superior Direito';
    else if (quadrant === 2 || quadrant === 6) quadName = 'Superior Esquerdo';
    else if (quadrant === 3 || quadrant === 7) quadName = 'Inferior Esquerdo';
    else if (quadrant === 4 || quadrant === 8) quadName = 'Inferior Direito';

    return `${name} ${quadName} (${isDeciduous ? 'Decíduo' : 'Permanente'})`;
  };

  const currentStatus = dossier?.currentStatus;
  const initialStatus = dossier?.initialStatus;
  const timeline = dossier?.timeline || [];

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-xl bg-white dark:bg-slate-900 shadow-2xl border-l border-slate-200 dark:border-slate-800 flex flex-col">
          {/* Header */}
          <div className="p-6 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-10 h-10 rounded-2xl bg-cyan-600 text-white font-black text-lg flex items-center justify-center shadow-md">
                  {toothNumber}
                </span>
                <div>
                  <h2 className="text-base font-black text-slate-900 dark:text-white">
                    Dossiê do Dente {toothNumber}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {getToothName(toothNumber)}
                  </p>
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Status comparison bar */}
          <div className="px-6 py-3 bg-cyan-50/50 dark:bg-cyan-950/20 border-b border-cyan-100 dark:border-cyan-900/30 flex items-center justify-between text-xs">
            <div className="space-y-0.5">
              <span className="text-[10px] text-slate-400 font-bold uppercase">Estado Inicial</span>
              <div className="font-semibold text-slate-700 dark:text-slate-300">
                {initialStatus?.whole || 'Hígido / Não registrado'}
              </div>
            </div>
            <div className="h-6 w-px bg-slate-200 dark:bg-slate-700" />
            <div className="space-y-0.5 text-right">
              <span className="text-[10px] text-cyan-600 dark:text-cyan-400 font-bold uppercase">Estado Atual</span>
              <div className="font-bold text-cyan-700 dark:text-cyan-300">
                {currentStatus?.whole || 'Hígido'}
              </div>
            </div>
          </div>

          {/* Faces status */}
          {currentStatus && (
            <div className="px-6 py-2 bg-slate-100 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800 text-xs flex items-center gap-2 flex-wrap font-mono">
              <span className="text-slate-400 font-sans font-medium text-[11px]">Faces:</span>
              {['vestibular', 'lingual', 'palatina', 'mesial', 'distal', 'oclusal'].map(face => (
                <span
                  key={face}
                  className={`px-2 py-0.5 rounded text-[10px] ${
                    currentStatus[face]
                      ? 'bg-cyan-100 dark:bg-cyan-900 text-cyan-800 dark:text-cyan-200 font-bold'
                      : 'bg-white dark:bg-slate-800 text-slate-400'
                  }`}
                >
                  {face.slice(0, 1).toUpperCase()}: {currentStatus[face] || 'OK'}
                </span>
              ))}
            </div>
          )}

          {/* Timeline Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              Linha do Tempo Cronológica do Elemento
            </h3>

            {loading ? (
              <div className="text-center py-12 text-slate-400 text-xs">
                Carregando histórico do dente {toothNumber}...
              </div>
            ) : timeline.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-6 text-slate-400 text-xs">
                Nenhum procedimento ou intervenção prévia registrada para o dente {toothNumber}.
              </div>
            ) : (
              <div className="relative border-l-2 border-slate-200 dark:border-slate-800 ml-4 space-y-6">
                {timeline.map((item: any, idx: number) => (
                  <div key={idx} className="relative pl-6">
                    {/* Circle marker */}
                    <span className="absolute -left-2.5 top-0 w-5 h-5 rounded-full bg-cyan-600 text-white flex items-center justify-center text-[10px] shadow">
                      {idx + 1}
                    </span>
                    <div className="p-3.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-xl space-y-1 hover:border-cyan-300 transition">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                          {item.type === 'procedure' && <FileText className="w-3.5 h-3.5 text-cyan-600" />}
                          {item.type === 'endo' && <Scissors className="w-3.5 h-3.5 text-amber-600" />}
                          {item.type === 'perio' && <Activity className="w-3.5 h-3.5 text-rose-600" />}
                          {item.type === 'prosthetics' && <Package className="w-3.5 h-3.5 text-purple-600" />}
                          {item.type === 'implant' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
                          {item.type === 'photo' && <Camera className="w-3.5 h-3.5 text-indigo-600" />}
                          {item.type === 'exam' && <Calendar className="w-3.5 h-3.5 text-blue-600" />}
                          {item.title || item.type}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {item.date ? new Date(item.date).toLocaleDateString('pt-BR') : '-'}
                        </span>
                      </div>
                      {item.description && (
                        <p className="text-xs text-slate-600 dark:text-slate-300">
                          {item.description}
                        </p>
                      )}
                      {item.professional && (
                        <div className="text-[10px] text-slate-400 font-medium">
                          Profissional: {item.professional}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 flex justify-end">
            <button
              onClick={onClose}
              className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-semibold transition"
            >
              Fechar Dossiê
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
