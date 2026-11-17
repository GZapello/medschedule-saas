import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ClassScheduleSection, DraftClassScheduleInput } from '../src/components/services/ClassScheduleSection';
import { ServiceBillingConfigPanel } from '../src/components/services/ServiceBillingConfigPanel';
import { StudioPublicBookingFlow } from '../src/components/public-booking/StudioPublicBookingFlow';
import { ToastProvider } from '../src/context/ToastContext';
import { ApiClient } from '../src/api/client';
import { emptyFrequencyPricing, offeredWeeklyMeetings } from '../src/utils/studioFrequencyPricing';

const PROFS: any[] = [
  { id: 'prof-1', name: 'Gabriel', public_booking_enabled: 1, schedules: [] },
  { id: 'prof-2', name: 'Ana', public_booking_enabled: 1, schedules: [] }
];
const ROOMS: any[] = [
  { id: 'room-1', name: 'Sala Zen', active: 1 },
  { id: 'room-2', name: 'Sala Fluxo', active: 1 }
];

const INITIAL_PERSISTED: any[] = [
  { id: 'cs-1', day_of_week: 1, start_time: '08:00', end_time: '08:50', professional_id: 'prof-1', professional_name: 'Gabriel', capacity: 10, modality: 'presential', effective_start_date: '2026-01-01', effective_end_date: null, active: 1, room_id: 'room-1', room_name: 'Sala Zen' },
  { id: 'cs-2', day_of_week: 1, start_time: '17:00', end_time: '17:50', professional_id: 'prof-1', professional_name: 'Gabriel', capacity: 12, modality: 'presential', effective_start_date: '2026-01-01', effective_end_date: null, active: 1, room_id: 'room-1', room_name: 'Sala Zen' },
  { id: 'cs-3', day_of_week: 3, start_time: '08:00', end_time: '08:50', professional_id: 'prof-1', professional_name: 'Gabriel', capacity: 10, modality: 'presential', effective_start_date: '2026-01-01', effective_end_date: null, active: 1, room_id: 'room-1', room_name: 'Sala Zen' },
  { id: 'cs-4', day_of_week: 3, start_time: '18:00', end_time: '18:50', professional_id: 'prof-2', professional_name: 'Ana', capacity: 15, modality: 'online', effective_start_date: '2026-01-01', effective_end_date: null, active: 1, room_id: null, room_name: null }
];

const BULK_30_SCHEDULES: any[] = [];
for (let dow = 1; dow <= 5; dow++) {
  for (let h = 8; h <= 13; h++) {
    BULK_30_SCHEDULES.push({
      id: `bulk-${dow}-${h}`,
      day_of_week: dow,
      start_time: `${String(h).padStart(2, '0')}:00`,
      end_time: `${String(h).padStart(2, '0')}:50`,
      professional_id: h % 2 === 0 ? 'prof-1' : 'prof-2',
      professional_name: h % 2 === 0 ? 'Gabriel' : 'Ana',
      capacity: 10,
      modality: 'presential',
      effective_start_date: '2026-01-01',
      effective_end_date: null,
      active: 1
    });
  }
}

let livePersisted = [...INITIAL_PERSISTED];
ApiClient.get = async (path: string): Promise<any> => {
  if (path.includes('/class-schedules')) {
    return { schedules: livePersisted, weeklySummary: [], diagnostics: { totalCount: livePersisted.length, activeCount: livePersisted.filter(s => s.active === 1).length, publishableCount: livePersisted.filter(s => s.active === 1).length, isPublicReady: true, blockers: [], items: [] } };
  }
  const slot1 = { classScheduleId: 'cs-1', date: '2027-01-04', dayOfWeek: 1, time: '08:00', endTimeClock: '08:50', startTime: '2027-01-04T08:00:00', endTime: '2027-01-04T08:50:00', professionalId: 'prof-1', professionalName: 'Gabriel', serviceKind: 'group', capacity: 10, enrolledCount: 7, remainingSpots: 3, modality: 'presential', allowedModalities: ['presential'], isFull: false };
  const slot2 = { classScheduleId: 'cs-2', date: '2027-01-04', dayOfWeek: 1, time: '17:00', endTimeClock: '17:50', startTime: '2027-01-04T17:00:00', endTime: '2027-01-04T17:50:00', professionalId: 'prof-1', professionalName: 'Gabriel', serviceKind: 'group', capacity: 12, enrolledCount: 4, remainingSpots: 8, modality: 'presential', allowedModalities: ['presential'], isFull: false };
  return {
    slots: [slot1, slot2],
    upcomingSlots: [slot1, slot2],
    weeklySchedules: INITIAL_PERSISTED,
    weeklySummary: [],
    professionals: PROFS,
    allowRecurrence: true,
    allowedRecurrenceFrequencies: ['weekly', 'custom_weekdays'],
    defaultRecurrenceFrequency: 'weekly',
    allowedPlanDurations: ['1_month'],
    defaultPlanDuration: '1_month',
    allowedModalities: ['presential']
  };
};
ApiClient.post = async (): Promise<any> => ({ valid: true, frequency: 'weekly', totalCount: 8, availableCount: 8, conflictCount: 0, description: 'Plano 2x', occurrences: [] });
ApiClient.put = async (path: string, body: any): Promise<any> => {
  const id = path.split('/').pop();
  livePersisted = livePersisted.map(s => (s.id === id ? { ...s, ...body } : s));
  return { schedule: livePersisted.find(s => s.id === id), schedules: livePersisted, weeklySummary: [], diagnostics: null };
};
ApiClient.patch = async (path: string, body: any): Promise<any> => {
  const parts = path.split('/');
  const id = parts[parts.length - 2];
  livePersisted = livePersisted.map(s => (s.id === id ? { ...s, active: body.active } : s));
  return { schedule: livePersisted.find(s => s.id === id), schedules: livePersisted, weeklySummary: [], diagnostics: null };
};

function DraftAndBillingHarness() {
  const [drafts, setDrafts] = useState<DraftClassScheduleInput[]>([]);
  const [mode, setMode] = useState<'draft' | 'persisted' | 'bulk30'>('draft');
  const [frequencyPricing, setFrequencyPricing] = useState(emptyFrequencyPricing());
  const [billing, setBilling] = useState<any>({
    billingMode: 'monthly',
    periodicPrice: '320.00',
    pricingRule: 'four_weeks',
    isPriceCustomized: false,
    suggestedPrice: 320,
    weeklySessionsCount: 2,
    defaultPackageId: '',
    defaultBillingDueDay: ''
  });

  const activeMeetings = mode === 'bulk30' ? offeredWeeklyMeetings(BULK_30_SCHEDULES) : offeredWeeklyMeetings(drafts);
  const distinctDays = Array.from(new Set(activeMeetings.map(m => m.weekday))).length;
  const contractable = Math.min(7, activeMeetings.length);

  return (
    <main className="max-w-2xl mx-auto p-3 space-y-4">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setMode('draft')} className="px-2.5 py-1 border rounded text-xs">Modo Criação</button>
        <button type="button" onClick={() => setMode('persisted')} className="px-2.5 py-1 border rounded text-xs">Modo Edição</button>
        <button type="button" onClick={() => setMode('bulk30')} className="px-2.5 py-1 border rounded text-xs">Modo 30 Turmas</button>
      </div>
      {mode === 'draft' && (
        <ClassScheduleSection
          serviceId={null}
          serviceModality="both"
          durationMinutes={50}
          defaultCapacity={10}
          defaultProfessionalId="prof-1"
          professionals={PROFS}
          rooms={ROOMS}
          draftSchedules={drafts}
          onDraftSchedulesChange={setDrafts}
        />
      )}
      {mode === 'persisted' && (
        <ClassScheduleSection
          serviceId="srv-yoga"
          serviceModality="both"
          durationMinutes={50}
          defaultCapacity={10}
          defaultProfessionalId="prof-1"
          professionals={PROFS}
          rooms={ROOMS}
        />
      )}
      <ServiceBillingConfigPanel
        {...billing}
        serviceName="Yoga"
        sessionPrice={80}
        onChange={setBilling}
        allowFrequencyPricing
        frequencyPricing={frequencyPricing}
        onFrequencyPricingChange={setFrequencyPricing}
        offeredWeeklySessions={contractable}
        scheduleWeekdaysCount={distinctDays}
      />
    </main>
  );
}

const PUB_SERVICE = {
  id: 'srv-yoga',
  name: 'Yoga Coletiva',
  service_kind: 'group',
  service_domain: 'studio',
  price: 80,
  default_capacity: 10,
  billing_mode: 'monthly',
  pricing_rule: 'four_weeks',
  frequency_pricing: { version: 1, enabled: true, unit: 'per_period', tables: { monthly: { 1: 18000, 2: 32000 } } },
  class_schedules: INITIAL_PERSISTED,
  weekly_schedule_summary: [
    { weekdaysLabel: 'Segundas e Quartas', timeRange: '08:00 às 08:50', professionalName: 'Gabriel' },
    { weekdaysLabel: 'Segundas', timeRange: '17:00 às 17:50', professionalName: 'Gabriel' }
  ],
  allow_recurrence: 1,
  allowed_recurrence_frequencies: ['weekly', 'custom_weekdays'],
  default_recurrence_frequency: 'weekly',
  allowed_plan_durations: ['1_month'],
  default_plan_duration: '1_month',
  linked_professionals: PROFS,
  modality: 'presential'
};

createRoot(document.getElementById('root')!).render(
  <ToastProvider>
    {new URLSearchParams(location.search).get('view') === 'public' ? (
      <StudioPublicBookingFlow clinic={{ slug: 'studio-yoga-multi', establishment_profile: 'studio' }} services={[PUB_SERVICE]} professionals={PROFS} packages={[]} />
    ) : (
      <DraftAndBillingHarness />
    )}
  </ToastProvider>
);
