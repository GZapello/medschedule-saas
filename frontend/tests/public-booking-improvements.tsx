import React from 'react';
import { createRoot } from 'react-dom/client';
import { BookingLinksContent } from '../src/components/public-booking/BookingLinksContent';
import { PublicBookingView } from '../src/components/public-booking/PublicBookingView';
import { ApiClient } from '../src/api/client';
import { publicBookingOutcome } from '../src/utils/publicBookingOutcome';

const state = window as any;
const query = new URLSearchParams(location.search);
state.outcome = publicBookingOutcome; state.posts = []; state.writes = [];
const readPolicy = (id: string) => JSON.parse(localStorage.getItem(id) || '{"booking_cancellation_policy_enabled":0,"booking_cancellation_policy_text":""}');
const tenant = () => ({ id: 'tenant', slug: 'studio', name: 'Studio de teste', establishment_profile: 'studio', public_booking_enabled: 1, ...readPolicy('tenant') });
const prof = () => ({ id: 'prof', user_id: 'owner', name: 'Ana', slug: 'ana', active: 1, public_booking_enabled: 1, services: [{ id: 'service', duration_minutes: 60 }], ...readPolicy('prof') });
const schedules = [{ id: 'schedule', day_of_week: 1, start_time: '08:00', end_time: '09:00', professional_id: 'prof', active: 1 }];
const service = { id: 'service', name: 'Pilates', service_kind: 'group', duration_minutes: 60, price: 80, modality: 'presential', active: 1, class_schedules: schedules, weekly_schedule_summary: [{ weekdaysLabel: 'Segunda', timeRange: '08:00–09:00' }], linked_professionals: [{ id: 'prof', name: 'Ana' }], allow_recurrence: 0 };
const slot = { classScheduleId: 'schedule', startTime: '2027-01-04T08:00:00', endTime: '2027-01-04T09:00:00', time: '08:00', date: '2027-01-04', professionalId: 'prof', professionalName: 'Ana', remainingSpots: 10, allowedModalities: ['presential'] };
ApiClient.get = async (path: string): Promise<any> => {
  if (path === '/v1/tenants/current') return tenant();
  if (path === '/v1/professionals') return [prof()];
  if (path === '/v1/professionals/prof') return { professional: prof() };
  if (path.startsWith('/v1/public/professionals/')) return { tenant: tenant(), professional: prof(), services: [service] };
  if (path.startsWith('/v1/public/tenants/')) return { tenant: tenant(), professionals: [prof()], services: [service], packages: query.get('packages') === 'public' ? [{ id: 'pkg', name: 'Pacote público', active: 1, allow_public_booking: 1, price: 200, items: [] }] : [] };
  if (path.includes('/slots')) return { slots: [slot], upcomingSlots: [slot], linkedProfessionals: [prof()], allowedModalities: ['presential'] };
  return [];
};
ApiClient.put = async (path: string, body: any): Promise<any> => {
  state.writes.push({ path, body });
  const result = { booking_cancellation_policy_enabled: body.bookingCancellationPolicy.enabled ? 1 : 0, booking_cancellation_policy_text: body.bookingCancellationPolicy.text };
  localStorage.setItem(path.includes('/professionals/') ? 'prof' : 'tenant', JSON.stringify(result)); return result;
};
ApiClient.post = async (path: string, body: any): Promise<any> => {
  state.posts.push({ path, body });
  const status = query.get('status');
  return { mode: 'service', message: 'Horário reservado!', paymentPending: true, appointments: [{ id: 'appointment', serviceName: 'Pilates', professionalName: 'Ana', startTime: slot.startTime, endTime: slot.endTime, modality: 'presential', ...(status ? { status } : {}) }] };
};
createRoot(document.getElementById('root')!).render(query.get('view') === 'admin' ? <div className="p-4 max-w-2xl mx-auto"><BookingLinksContent /></div> : <PublicBookingView tenantSlug="studio" professionalSlug={query.get('individual') ? 'ana' : undefined} />);
