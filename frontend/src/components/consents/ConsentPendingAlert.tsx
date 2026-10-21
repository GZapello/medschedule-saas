import React, { useEffect, useState } from 'react';
import { FileText, CheckCircle2, Clock, Plus } from 'lucide-react';
import { ApiClient } from '../../api/client';
import './consents.css';

export interface ConsentPendingResponse {
  status: 'missing_terms' | 'waiting_signature' | 'invalid_term' | 'ok' | 'default';
  label: string;
  count: number;
  missingCount?: number;
  waitingCount?: number;
  invalidCount?: number;
  signedCount?: number;
  requiredCount?: number;
  terms?: Array<{ id: string; title: string; version: number; module: string; serviceId?: string }>;
}

export function ConsentPendingAlert({
  patientId,
  serviceId,
  onOpen,
  compact = false,
  variant
}: {
  patientId: string;
  serviceId?: string;
  onOpen: () => void;
  compact?: boolean;
  variant?: 'optional-card' | 'compact' | 'banner';
}) {
  const [data, setData] = useState<ConsentPendingResponse | null>(null);
  const [rows, setRows] = useState<any[] | null>(null);

  const effectiveVariant = variant || (compact ? 'compact' : 'banner');

  useEffect(() => {
    let live = true;
    const load = () => {
      ApiClient.get<ConsentPendingResponse>(
        `/v1/consents/patients/${patientId}/pending${serviceId ? `?serviceId=${encodeURIComponent(serviceId)}` : ''}`
      )
        .then(r => {
          if (live) setData(r);
        })
        .catch(() => {
          if (live) setData(null);
        });

      if (effectiveVariant === 'optional-card') {
        ApiClient.get<any[]>(`/v1/consents/patients/${patientId}`)
          .then(r => {
            if (live) setRows(Array.isArray(r) ? r : []);
          })
          .catch(() => {
            if (live) setRows([]);
          });
      }
    };

    const changed = (e: Event) => {
      if ((e as CustomEvent).detail?.patientId === patientId) void load();
    };

    void load();
    window.addEventListener('zemda-consents-changed', changed);
    window.addEventListener('focus', load);
    return () => {
      live = false;
      window.removeEventListener('zemda-consents-changed', changed);
      window.removeEventListener('focus', load);
    };
  }, [patientId, serviceId, effectiveVariant]);

  if (effectiveVariant === 'optional-card') {
    const activeRows = (rows || []).filter(r => r && r.status !== 'cancelled');
    const signedRows = activeRows.filter(r => r.status === 'signed' || Boolean(r.signedAt));
    const pendingRows = activeRows.filter(r => !r.signedAt && r.status !== 'signed');

    const totalCount = activeRows.length;
    const signedCount = signedRows.length;
    const pendingCount = pendingRows.length;

    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-800">
              <FileText className="w-3.5 h-3.5 text-teal-600 shrink-0" />
              <span>Termos de consentimento</span>
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white text-slate-500 border border-slate-200">
              Opcional
            </span>
            {totalCount > 0 && pendingCount === 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                <span>{signedCount} de {totalCount} {totalCount === 1 ? 'assinado' : 'assinados'}</span>
              </span>
            )}
            {pendingCount > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                <Clock className="w-3 h-3 text-amber-600 shrink-0" />
                <span>
                  {pendingCount} {pendingCount === 1 ? 'termo pendente' : 'termos pendentes'}
                  {signedCount > 0 ? ` (${signedCount} de ${totalCount} assinados)` : ''}
                </span>
              </span>
            )}
          </div>
          {totalCount === 0 && (
            <p className="text-xs text-slate-500 mt-0.5">
              Nenhum termo solicitado para este atendimento.
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {totalCount === 0 ? (
            <button
              type="button"
              onClick={onOpen}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-teal-700 bg-white hover:bg-teal-50 border border-teal-200 transition-colors cursor-pointer shadow-2xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Solicitar termo</span>
            </button>
          ) : pendingCount > 0 ? (
            <>
              <button
                type="button"
                onClick={onOpen}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 transition-colors cursor-pointer"
              >
                <span>Solicitar assinatura</span>
              </button>
              <button
                type="button"
                onClick={onOpen}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 bg-white hover:bg-slate-100 border border-slate-200 transition-colors cursor-pointer"
              >
                <span>Visualizar</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onOpen}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 transition-colors cursor-pointer shadow-2xs"
            >
              <span>Visualizar</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  if (effectiveVariant === 'compact') {
    if (!data) {
      return (
        <button
          type="button"
          onClick={onOpen}
          className="text-xs px-2.5 py-1 rounded-lg bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200 transition-all cursor-pointer font-medium shadow-2xs"
          title="Termos & Consentimentos do paciente (opcional)"
        >
          Termos
        </button>
      );
    }

    let style = 'bg-slate-50 text-slate-700 hover:bg-slate-100 border-slate-200 font-medium';
    let labelText = data.label || 'Termos';
    if (data.status === 'missing_terms') {
      style = 'bg-slate-50 text-slate-600 hover:bg-slate-100 border-slate-200 font-medium';
      labelText = 'Termos (opcional)';
    } else if (data.status === 'waiting_signature') {
      style = 'bg-amber-50 text-amber-800 hover:bg-amber-100 border-amber-300 font-semibold';
    } else if (data.status === 'invalid_term') {
      style = 'bg-amber-50 text-amber-800 hover:bg-amber-100 border-amber-300 font-semibold';
    } else if (data.status === 'ok') {
      style = 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border-emerald-300 font-semibold';
    }

    return (
      <button
        type="button"
        onClick={onOpen}
        className={`text-xs px-2.5 py-1 rounded-lg transition-all cursor-pointer border shadow-2xs ${style}`}
        title="Abrir Termos & Consentimentos do paciente"
      >
        {labelText}
      </button>
    );
  }

  // Visualização não-compacta (alert banner para prontuário/perfil) — não alerta para missing_terms pois termos são opcionais
  if (!data || data.status === 'ok' || data.status === 'default' || data.status === 'missing_terms') return null;

  return (
    <div
      role="status"
      className="m-3 sm:m-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
    >
      <p>
        {data.label} <span className="text-xs">({data.count})</span>
      </p>
      <button type="button" onClick={onOpen} className="consent-secondary cursor-pointer">
        Abrir termos
      </button>
    </div>
  );
}
