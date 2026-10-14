import React, { useEffect, useState } from 'react';
import { ApiClient } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { Building2, ChevronDown, Loader2 } from 'lucide-react';

interface ClinicMembership {
  id: string;
  name: string;
  role: string;
  is_manager?: number;
}

export function ClinicSwitcher({ compact = false }: { compact?: boolean }) {
  const { currentTenant, switchTenant, isSuperAdmin } = useAuth();
  const [clinics, setClinics] = useState<ClinicMembership[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isSuperAdmin) {
      ApiClient.get<ClinicMembership[]>('/v1/auth/memberships')
        .then(setClinics)
        .catch(() => setClinics([]));
    }
  }, [currentTenant?.id, isSuperAdmin]);

  if (clinics.length < 2) return null;

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'clinic_admin': return 'Administrador';
      case 'professional': return 'Profissional';
      case 'receptionist': return 'Recepção';
      case 'secretary': return 'Secretaria';
      case 'financial': return 'Financeiro';
      default: return role;
    }
  };

  const handleSelect = async (tenantId: string) => {
    if (tenantId === currentTenant?.id) return;
    setBusy(true);
    setError('');
    try {
      await switchTenant(tenantId);
    } catch {
      setError('Não foi possível trocar de clínica.');
      setBusy(false);
    }
  };

  if (compact) {
    return (
      <div className="relative inline-flex items-center">
        <label className="sr-only">Trocar clínica ativa</label>
        <div className="relative flex items-center">
          <select
            aria-label="Trocar clínica ativa"
            disabled={busy}
            value={currentTenant?.id || ''}
            onChange={e => handleSelect(e.target.value)}
            className="appearance-none bg-slate-100/90 hover:bg-slate-200/80 text-slate-800 text-xs font-semibold py-1.5 pl-7 pr-7 rounded-xl border border-slate-200/80 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:opacity-50"
          >
            {clinics.map(c => (
              <option key={c.id} value={c.id}>
                {c.name} ({getRoleLabel(c.role)})
              </option>
            ))}
          </select>
          <Building2 className="w-3.5 h-3.5 text-teal-700 absolute left-2 pointer-events-none" />
          {busy ? (
            <Loader2 className="w-3.5 h-3.5 text-teal-600 animate-spin absolute right-2 pointer-events-none" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-slate-500 absolute right-2 pointer-events-none" />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 min-w-0 border-t border-slate-100 bg-slate-50/50">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
          <Building2 className="w-3.5 h-3.5 text-teal-600" />
          Clínica Ativa
        </span>
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200">
          Multi-clínica
        </span>
      </div>

      <div className="relative">
        <select
          aria-label="Clínica atual"
          disabled={busy}
          value={currentTenant?.id || ''}
          onChange={e => handleSelect(e.target.value)}
          className="appearance-none w-full min-w-0 rounded-xl border border-slate-200 bg-white py-2 pl-3 pr-8 text-xs font-semibold text-slate-800 shadow-xs hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer disabled:opacity-50 transition-colors"
        >
          {clinics.map(c => (
            <option key={c.id} value={c.id}>
              {c.name} • {getRoleLabel(c.role)}
            </option>
          ))}
        </select>
        <div className="absolute inset-y-0 right-0 flex items-center pr-2.5 pointer-events-none">
          {busy ? (
            <Loader2 className="w-4 h-4 text-teal-600 animate-spin" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-1 text-[11px] text-rose-600 font-medium">
          {error}
        </p>
      )}
    </div>
  );
}

