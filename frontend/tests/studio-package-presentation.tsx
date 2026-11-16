import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { ToastProvider } from '../src/context/ToastContext';
import { ApiClient } from '../src/api/client';
import { PackageModal } from '../src/components/services/PackageModal';

const query = new URLSearchParams(location.search);
const tenant = { id: 'fixture-studio', name: 'Studio de teste', establishment_profile: query.get('profile') || 'studio' };
const user = { id: 'fixture-admin', name: 'Gestor', role: 'clinic_admin' };
const professionals: any[] = [{ id: 'prof-1', name: 'Ana' }, { id: 'prof-2', name: 'Bruno' }];
const services: any[] = query.has('empty') ? [] : [
  { id: 'pilates', name: 'Pilates', professional_id: 'prof-1', duration_minutes: 50, service_kind: 'group', default_capacity: 10 },
  { id: 'danca', name: 'Dança', professional_id: 'prof-2', duration_minutes: 60, service_kind: 'group', default_capacity: 12 },
  { id: 'personal', name: 'Treinamento individual com acompanhamento profissional', professional_id: 'prof-1', duration_minutes: 50, service_kind: 'individual' }
];
const existing = {
  id: 'package-existing', name: 'Pacote existente', description: 'Descrição existente',
  billing_type: 'recurring_monthly', billing_frequency: 'quarterly', price: 590,
  credit_mode: 'per_service', total_credits: 10, validity_days: 90, due_day: 12,
  absent_consumption_policy: 'refund', cancellation_hours_limit: 24, allow_public_booking: 0, active: 1,
  items: [{ service_id: 'pilates', included_credits: 6, weekly_frequency: 2 }, { service_id: 'danca', included_credits: 4, weekly_frequency: 1 }]
};
const state = window as any;
state.__writes = [];
state.__reads = [];
state.__saved = 0;
state.__closed = 0;
localStorage.setItem('auth_token', 'fixture-token');
ApiClient.get = async (path: string): Promise<any> => {
  state.__reads.push(path);
  if (path === '/v1/auth/me') return { user, tenant };
  if (path === '/v1/tenants/current') return tenant;
  return {};
};
const write = async (method: string, path: string, payload: any): Promise<any> => {
  state.__writes.push({ method, path, payload: JSON.parse(JSON.stringify(payload)) });
  if (state.__rejectWrite) throw new Error('Não foi possível salvar o pacote de teste.');
  return { id: 'package-saved' };
};
ApiClient.post = (path: string, payload: any) => write('POST', path, payload);
ApiClient.put = (path: string, payload: any) => write('PUT', path, payload);

function Fixture() {
  const { loading } = useAuth();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  if (loading) return <p>Carregando...</p>;
  return <main className="p-6 bg-slate-50 min-h-screen">
    <h1 className="text-xl font-bold text-slate-900 mb-4">Pacotes de Serviços</h1>
    <div className="flex gap-3">
      <button onClick={() => { setEditing(false); setOpen(true); }}>Abrir criação</button>
      <button onClick={() => { setEditing(true); setOpen(true); }}>Abrir edição</button>
    </div>
    <PackageModal isOpen={open} services={services} professionals={professionals} editingPackage={editing ? existing : null}
      onClose={() => { state.__closed++; setOpen(false); }} onSuccess={() => { state.__saved++; }} />
  </main>;
}
createRoot(document.getElementById('root')!).render(<AuthProvider><ToastProvider><Fixture /></ToastProvider></AuthProvider>);
