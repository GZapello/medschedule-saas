import React from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider } from '../src/context/AuthContext';
import { ToastProvider } from '../src/context/ToastContext';
import { ApiClient } from '../src/api/client';
import { ServicesView } from '../src/components/services/ServicesView';

const profile = new URLSearchParams(location.search).get('profile') || 'studio';
const tenant = { id: 'fixture-studio', name: 'Studio de teste', establishment_profile: profile };
const user = { id: 'fixture-admin', name: 'Gestor', role: 'clinic_admin' };
const professionals = ['Ana', 'Bruno'].map((name, index) => ({
  id: `prof-${index + 1}`, name, active: 1, profession_id: 'personal', profession_name: 'Personal Trainer',
  available_modules: [{ code: 'ZemdaPersonal', label: 'Personal Trainer (ZemdaPersonal)' }]
}));
const existing = {
  id: 'service-existing', name: 'Pilates existente', price: 80, duration_minutes: 50, buffer_minutes: 10,
  professional_id: 'prof-1', professional_name: 'Ana', clinical_module: 'ZemdaPersonal', active: 1,
  service_domain: profile === 'studio' ? 'studio' : 'clinical', service_kind: 'individual', modality: 'both',
  allow_recurrence: 1, billing_mode: 'monthly', periodic_price: 320, default_billing_due_day: 10,
  linked_professional_ids: ['prof-1'], linked_template_ids: ['template-1'], default_template_id: 'template-1',
  description: 'Descrição existente', reminder_enabled: 1, reminder_value: 30, reminder_unit: 'DAYS'
};
localStorage.setItem('auth_token', 'fixture-token');
const state = window as any;
state.__writes = [];
state.__reads = [];
ApiClient.get = async (path: string): Promise<any> => {
  state.__reads.push(path);
  if (path === '/v1/auth/me') return { user, tenant };
  if (path === '/v1/clinics/current') return tenant;
  if (path === '/v1/services') return [existing];
  if (path === '/v1/professionals') return professionals;
  if (path === '/v1/rooms') return [];
  if (path === '/v1/taxonomy/specialties') return [];
  if (path.startsWith('/v1/packages')) return { isStudioCompatible: true, packages: [{ id: 'pkg-1', name: 'Pacote de Pilates', total_price: 500 }] };
  if (path === '/v1/personal/templates') return { templates: [
    { id: 'template-1', title: 'Mobilidade', structure_type: 'full_body', exercises_count: 3 },
    { id: 'template-2', title: 'Fortalecimento', structure_type: 'full_body', exercises_count: 5 }
  ] };
  if (path.includes('/class-schedules')) return { schedules: [], weeklySummary: [] };
  return {};
};
ApiClient.post = async (path: string, payload: any): Promise<any> => {
  state.__writes.push({ method: 'POST', path, payload: JSON.parse(JSON.stringify(payload)) });
  return { service: { id: 'saved-service', ...payload } };
};
ApiClient.put = async (path: string, payload: any): Promise<any> => {
  state.__writes.push({ method: 'PUT', path, payload: JSON.parse(JSON.stringify(payload)) });
  return { service: { id: 'service-existing', ...payload } };
};
createRoot(document.getElementById('root')!).render(<AuthProvider><ToastProvider><ServicesView /></ToastProvider></AuthProvider>);
