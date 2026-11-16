import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ServiceBillingConfigPanel } from '../src/components/services/ServiceBillingConfigPanel';
import { emptyFrequencyPricing, offeredWeeklyMeetings } from '../src/utils/studioFrequencyPricing';
import { calculateStudioRecurringPrice } from '../src/utils/studioPricing';
import { StudioPublicBookingFlow } from '../src/components/public-booking/StudioPublicBookingFlow';
import { ApiClient } from '../src/api/client';

const state = window as any;
state.calculatePrice = calculateStudioRecurringPrice;
const schedules = [8, 10, 14].map((hour, i) => ({ id: `cs-${i}`, day_of_week: 1, start_time: `${hour.toString().padStart(2, '0')}:00`, end_time: `${(hour + 1).toString().padStart(2, '0')}:00`, professional_id: 'prof-1', active: 1, modality: 'presential', capacity: 20 }));
const config = { version: 1 as const, enabled: true, unit: 'per_period' as const, tables: { monthly: { 1: 18000, 2: 32000, 3: 45000 } } };
const service = { id: 'service-1', name: 'Pilates', service_kind: 'group', price: 80, billing_mode: 'monthly', pricing_rule: 'four_weeks', frequency_pricing: config, class_schedules: schedules, weekly_schedule_summary: [{ weekdaysLabel: 'Segunda', timeRange: '08:00–09:00', professionalName: 'Ana' }], allow_recurrence: 1, allowed_recurrence_frequencies: ['weekly', 'custom_weekdays'], default_recurrence_frequency: 'weekly', allowed_plan_durations: ['1_month'], default_plan_duration: '1_month', linked_professionals: [{ id: 'prof-1', name: 'Ana' }], modality: 'presential' };
const start = '2027-01-04';
const slot = { startTime: `${start}T08:00:00`, endTime: `${start}T09:00:00`, time: '08:00', date: start, endTimeClock: '09:00', professionalId: 'prof-1', professionalName: 'Ana', classScheduleId: 'cs-0', allowedModalities: ['presential'], remainingSpots: 20 };
state.posts = [];
ApiClient.get = async (): Promise<any> => ({ slots: [slot], upcomingSlots: [slot], linkedProfessionals: [{ id: 'prof-1', name: 'Ana' }], allowRecurrence: true, allowedRecurrenceFrequencies: ['weekly', 'custom_weekdays'], defaultRecurrenceFrequency: 'weekly', allowedPlanDurations: ['1_month'], defaultPlanDuration: '1_month', allowedModalities: ['presential'] });
ApiClient.post = async (path: string, body: any): Promise<any> => {
  state.posts.push({ path, body });
  return { valid: true, frequency: 'weekly', totalCount: 8, availableCount: 8, conflictCount: 0, description: 'Plano semanal', occurrences: [], appointments: [], paymentPending: true };
};
function Panel() {
  const [count, setCount] = useState(1);
  const [allowed, setAllowed] = useState(true);
  const [open, setOpen] = useState(true);
  const [frequency, setFrequency] = useState(emptyFrequencyPricing);
  const [billing, setBilling] = useState<any>({ billingMode: 'monthly', periodicPrice: '320', pricingRule: 'four_weeks', isPriceCustomized: false, weeklySessionsCount: 1, defaultPackageId: '', defaultBillingDueDay: '' });
  state.config = frequency;
  state.billing = billing;
  state.meetingsCount = offeredWeeklyMeetings(schedules).length;
  return <main className="max-w-2xl mx-auto p-3">
    <label>Encontros<input aria-label="Encontros" type="number" value={count} onChange={e => setCount(Number(e.target.value))} /></label>
    <button onClick={() => setAllowed(!allowed)}>Alternar perfil</button>
    <button onClick={() => setOpen(!open)}>Recolher cobrança</button>
    <div hidden={!open}><ServiceBillingConfigPanel {...billing} serviceName="Pilates" sessionPrice={80} onChange={setBilling} frequencyPricing={frequency} onFrequencyPricingChange={setFrequency} allowFrequencyPricing={allowed} offeredWeeklySessions={count} /></div>
  </main>;
}
createRoot(document.getElementById('root')!).render(new URLSearchParams(location.search).get('view') === 'public'
  ? <StudioPublicBookingFlow clinic={{ slug: 'studio-test', establishment_profile: 'studio' }} services={[service]} professionals={[{ id: 'prof-1', name: 'Ana' }]} packages={[]} /> : <Panel />);
