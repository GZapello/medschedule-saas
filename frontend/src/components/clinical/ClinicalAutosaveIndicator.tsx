import React from 'react';
import { Check, CloudOff, AlertTriangle, Loader2 } from 'lucide-react';
import { AutosaveStatus } from '../../hooks/useClinicalAutosave';

interface ClinicalAutosaveIndicatorProps {
  status: AutosaveStatus;
  lastSavedTime?: string | null;
  className?: string;
}

export const ClinicalAutosaveIndicator: React.FC<ClinicalAutosaveIndicatorProps> = ({
  status,
  lastSavedTime,
  className = ''
}) => {
  return (
    <div className={`flex items-center gap-1.5 text-[11px] font-semibold select-none ${className}`}>
      {status === 'saving' && (
        <span className="flex items-center gap-1.5 text-amber-600 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200 animate-pulse">
          <Loader2 className="w-3 h-3 animate-spin text-amber-500" />
          <span>Salvando...</span>
        </span>
      )}

      {status === 'saved' && (
        <span className="flex items-center gap-1.5 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200">
          <Check className="w-3 h-3 text-emerald-600" />
          <span>{lastSavedTime ? `Salvo automaticamente às ${lastSavedTime}` : 'Salvo automaticamente'}</span>
        </span>
      )}

      {status === 'offline' && (
        <span className="flex items-center gap-1.5 text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-lg border border-indigo-200" title="Suas alterações estão protegidas na memória local e serão sincronizadas assim que a conexão retornar.">
          <CloudOff className="w-3 h-3 text-indigo-600" />
          <span>Offline — salvo localmente</span>
        </span>
      )}

      {status === 'error' && (
        <span className="flex items-center gap-1.5 text-rose-700 bg-rose-50 px-2 py-0.5 rounded-lg border border-rose-200" title="Houve um problema ao conectar com o servidor. A cópia local está segura.">
          <AlertTriangle className="w-3 h-3 text-rose-600" />
          <span>Erro ao sincronizar</span>
        </span>
      )}

      {status === 'idle' && (
        <span className="flex items-center gap-1.5 text-slate-500 bg-slate-50 px-2 py-0.5 rounded-lg border border-slate-200">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
          <span>Autosave ativo</span>
        </span>
      )}
    </div>
  );
};
