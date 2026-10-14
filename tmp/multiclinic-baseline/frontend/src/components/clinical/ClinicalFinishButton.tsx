import React from 'react';
import { CheckCircle2 } from 'lucide-react';

export function ClinicalFinishButton({ onClick, disabled = false, label = 'Finalizar atendimento' }: { onClick: () => void; disabled?: boolean; label?: string }) {
  return <button type="button" data-tour="clinical-finish" disabled={disabled} onClick={onClick}
    className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-extrabold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-md shadow-emerald-500/20 transition-all cursor-pointer whitespace-nowrap disabled:opacity-50"
    title="Finalizar atendimento, gravar evolução oficial e arquivar prontuário">
    <CheckCircle2 className="w-4 h-4" /><span>{label}</span>
  </button>;
}
