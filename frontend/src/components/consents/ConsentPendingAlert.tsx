import React, { useEffect, useState } from 'react';
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
  compact = false
}: {
  patientId: string;
  serviceId?: string;
  onOpen: () => void;
  compact?: boolean;
}) {
  const [data, setData] = useState<ConsentPendingResponse | null>(null);

  useEffect(() => {
    let live = true;
    const load = () =>
      ApiClient.get<ConsentPendingResponse>(
        `/v1/consents/patients/${patientId}/pending${serviceId ? `?serviceId=${encodeURIComponent(serviceId)}` : ''}`
      )
        .then(r => {
          if (live) setData(r);
        })
        .catch(() => {
          if (live) setData(null);
        });

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
  }, [patientId, serviceId]);

  if (compact) {
    if (!data) {
      return (
        <button
          type="button"
          onClick={onOpen}
          className="text-xs px-2.5 py-1 rounded-lg bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200 transition-all cursor-pointer font-medium shadow-2xs"
          title="Termos & Consentimentos do paciente"
        >
          Termos
        </button>
      );
    }

    let style = 'bg-slate-50 text-slate-700 hover:bg-slate-100 border-slate-200 font-medium';
    if (data.status === 'missing_terms') {
      style = 'bg-amber-50 text-amber-800 hover:bg-amber-100 border-amber-300 font-semibold';
    } else if (data.status === 'waiting_signature') {
      style = 'bg-sky-50 text-sky-800 hover:bg-sky-100 border-sky-300 font-semibold';
    } else if (data.status === 'invalid_term') {
      style = 'bg-rose-50 text-rose-800 hover:bg-rose-100 border-rose-300 font-semibold';
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
        {data.label || 'Termos'}
      </button>
    );
  }

  // Visualização não-compacta (alert banner para prontuário/perfil)
  if (!data || data.status === 'ok' || data.status === 'default') return null;

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
