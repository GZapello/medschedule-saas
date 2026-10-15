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

export function ClinicSwitcher() {
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
      setBusy(false);
    } catch {
      setError('Não foi possível trocar de clínica.');
      setBusy(false);
    }
  };

  const active=clinics.find(c=>c.id===currentTenant?.id);
  const label=active ? `${active.name} (${getRoleLabel(active.role)})` : (currentTenant?.name || 'Selecionar clínica');
  return <div className="relative min-w-0 w-24 min-[400px]:w-28 sm:w-48 lg:w-60 max-w-full shrink">
    <div className="relative flex items-center h-11 bg-slate-100/90 hover:bg-slate-200/80 rounded-xl border border-slate-200/80 focus-within:ring-2 focus-within:ring-teal-500">
      <Building2 className="w-3.5 h-3.5 text-teal-700 absolute left-2 pointer-events-none" />
      <span aria-hidden="true" className="min-w-0 block truncate pl-7 pr-7 text-xs font-semibold text-slate-800" title={label}>{label}</span>
      <select aria-label="Trocar clínica ativa" title={label} disabled={busy} value={currentTenant?.id || ''}
        onChange={e=>void handleSelect(e.target.value)}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-wait">
        {clinics.map(c=><option key={c.id} value={c.id}>{c.name} ({getRoleLabel(c.role)})</option>)}
      </select>
      {busy ? <Loader2 className="w-3.5 h-3.5 text-teal-600 animate-spin absolute right-2 pointer-events-none" /> :
        <ChevronDown className="w-3.5 h-3.5 text-slate-500 absolute right-2 pointer-events-none" />}
    </div>
    {error && <p role="alert" className="absolute top-full right-0 mt-1 w-52 bg-white border border-rose-200 rounded-lg p-2 text-xs text-rose-700 shadow-lg">{error}</p>}
  </div>;
}
