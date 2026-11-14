import React from 'react';
import { AlertTriangle, Calendar, CheckCircle2, Clock, Loader2 } from 'lucide-react';

export interface RecurrenceAlternativeItem {
  startTime: string;
  endTime: string;
  timeLabel: string;
  professionalId: string;
  professionalName: string;
  classScheduleId?: string | null;
  roomId?: string | null;
  remainingSpots?: number | null;
}

export interface RecurrenceOccurrencePreviewItem {
  index: number;
  date: string;
  dayOfWeek: number;
  dayLabel: string;
  startTime: string;
  endTime: string;
  available: boolean;
  reasonCode?: string;
  reasonMessage?: string;
  professionalId?: string;
  professionalName?: string;
  classScheduleId?: string | null;
  roomId?: string | null;
  roomName?: string | null;
  capacity?: number;
  remainingSpots?: number | null;
  alternatives?: RecurrenceAlternativeItem[];
}

export interface RecurrencePreviewData {
  valid: boolean;
  frequency: string;
  intervalValue: number | null;
  intervalUnit: string | null;
  description: string;
  totalCount: number;
  availableCount: number;
  conflictCount: number;
  occurrences: RecurrenceOccurrencePreviewItem[];
}

interface RecurrencePreviewBoxProps {
  preview: RecurrencePreviewData | null;
  loading: boolean;
  error: string | null;
  accent?: 'indigo' | 'teal';
}

function formatBrDate(ymd: string): string {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}/.test(ymd)) return ymd;
  const [y, m, d] = ymd.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

export const RecurrencePreviewBox: React.FC<RecurrencePreviewBoxProps> = ({
  preview,
  loading,
  error,
  accent = 'indigo'
}) => {
  const borderCls = accent === 'teal' ? 'border-teal-200 bg-teal-50/30' : 'border-slate-200 bg-white';

  return (
    <div className={`rounded-xl border ${borderCls} p-2.5 space-y-2`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-800">
          <Calendar className="w-3.5 h-3.5 text-indigo-600" />
          <span>Datas previstas da recorrência</span>
        </div>
        <div className="flex items-center gap-1.5">
          {loading && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500">
              <Loader2 className="w-3 h-3 animate-spin" />
              Validando...
            </span>
          )}
          {!loading && preview && (
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                preview.valid
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-rose-50 text-rose-700 border border-rose-200'
              }`}
            >
              {preview.availableCount}/{preview.totalCount} disponíveis
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-1.5 p-2 rounded-lg bg-rose-50 border border-rose-200 text-[11px] text-rose-800 font-medium">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-rose-600" />
          <span>{error}</span>
        </div>
      )}

      {preview && preview.occurrences.length > 0 && (
        <>
          <div className="text-[10px] text-slate-500 font-medium">
            Regra ativa: <strong className="text-slate-700">{preview.description}</strong> ({preview.totalCount} {preview.totalCount === 1 ? 'data' : 'datas'})
          </div>
          <div className="max-h-44 overflow-y-auto space-y-1 pr-0.5">
            {preview.occurrences.map(occ => (
              <div
                key={`${occ.index}-${occ.date}`}
                className={`rounded-lg border px-2 py-1.5 text-[11px] flex flex-col gap-1 ${
                  occ.available
                    ? 'bg-emerald-50/40 border-emerald-200/80 text-slate-800'
                    : 'bg-rose-50/70 border-rose-200 text-rose-900'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {occ.available ? (
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
                    ) : (
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-rose-600" />
                    )}
                    <span className="font-bold whitespace-nowrap">
                      {occ.dayLabel}, {formatBrDate(occ.date)}
                    </span>
                    <span className="inline-flex items-center gap-0.5 text-[10px] text-slate-600 font-semibold whitespace-nowrap">
                      <Clock className="w-2.5 h-2.5" />
                      {occ.startTime.slice(11, 16)}–{occ.endTime.slice(11, 16)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {occ.available && occ.professionalName && (
                      <span className="text-[10px] text-slate-500 truncate max-w-[110px]">
                        {occ.professionalName}
                      </span>
                    )}
                    {occ.available && typeof occ.remainingSpots === 'number' && (occ.capacity || 1) > 1 && (
                      <span className="px-1.5 py-0.5 rounded bg-teal-50 text-teal-800 border border-teal-200 text-[9px] font-bold">
                        {occ.remainingSpots} vaga{occ.remainingSpots === 1 ? '' : 's'}
                      </span>
                    )}
                    <span
                      className={`text-[10px] font-bold ${
                        occ.available ? 'text-emerald-700' : 'text-rose-700'
                      }`}
                    >
                      {occ.available ? 'Disponível' : 'Indisponível'}
                    </span>
                  </div>
                </div>
                {!occ.available && occ.reasonMessage && (
                  <div className="text-[10px] text-rose-800 pl-5">
                    {occ.reasonMessage}
                  </div>
                )}
                {!occ.available && occ.alternatives && occ.alternatives.length > 0 && (
                  <div className="text-[10px] text-slate-700 pl-5">
                    Horários autorizados nesta data:{' '}
                    <span className="font-semibold text-indigo-700">
                      {occ.alternatives.slice(0, 3).map(a => `${a.timeLabel} (${a.professionalName})`).join(' • ')}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
          {preview.conflictCount > 0 && (
            <div className="p-2 rounded-lg bg-amber-50 border border-amber-200 text-[10px] text-amber-900 font-semibold">
              Ajuste a frequência, intervalo, data inicial ou quantidade para eliminar os conflitos antes de confirmar.
            </div>
          )}
        </>
      )}
    </div>
  );
};
