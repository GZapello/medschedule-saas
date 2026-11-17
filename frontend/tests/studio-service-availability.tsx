import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ServiceRecurrenceConfigPanel } from '../src/components/services/ServiceRecurrenceConfigPanel';
import { ServiceAvailabilitySection } from '../src/components/services/ServiceAvailabilitySection';
import { ServiceAvailabilityMode, ServiceAvailabilityWindow } from '../src/types';
import { ALL_PLAN_DURATIONS, PlanDurationCode, RecurrenceFrequency, RecurrenceIntervalSpec } from '../src/utils/establishmentContext';
import { ProfessionalScheduleRow } from '../src/components/services/useProfessionalSchedules';

const SCHEDULES: ProfessionalScheduleRow[] = [
  { id: 's1', professionalId: 'prof-1', day_of_week: 1, start_time: '08:00', end_time: '18:00', break_start: null, break_end: null, is_active: true },
  { id: 's3', professionalId: 'prof-1', day_of_week: 3, start_time: '08:00', end_time: '18:00', break_start: '12:00', break_end: '14:00', is_active: true },
  { id: 's5', professionalId: 'prof-1', day_of_week: 5, start_time: '08:00', end_time: '12:00', break_start: null, break_end: null, is_active: true }
];

function AvailabilityHarness() {
  const [serviceKind, setServiceKind] = useState<'individual' | 'group'>('individual');
  const [allowRecurrence, setAllowRecurrence] = useState(true);
  const [allowedFrequencies, setAllowedFrequencies] = useState<RecurrenceFrequency[]>(['weekly']);
  const [allowedWeekdays, setAllowedWeekdays] = useState<number[]>([]);
  const [defaultFrequency, setDefaultFrequency] = useState<RecurrenceFrequency>('weekly');
  const [customIntervals, setCustomIntervals] = useState<RecurrenceIntervalSpec[]>([]);
  const [defaultCustomInterval, setDefaultCustomInterval] = useState<RecurrenceIntervalSpec | null>(null);
  const [allowedPlanDurations, setAllowedPlanDurations] = useState<Exclude<PlanDurationCode, 'legacy_frequency'>[]>([...ALL_PLAN_DURATIONS]);
  const [defaultPlanDuration, setDefaultPlanDuration] = useState<Exclude<PlanDurationCode, 'legacy_frequency'>>('1_month');
  const [availMode, setAvailMode] = useState<ServiceAvailabilityMode>('professional_schedule');
  const [availWindows, setAvailWindows] = useState<ServiceAvailabilityWindow[]>([]);

  const state = window as any;
  state.availState = { availMode, availWindows, serviceKind };

  return (
    <main className="max-w-2xl mx-auto p-3 space-y-3">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setServiceKind('individual')}
          className="px-3 py-1.5 rounded-lg border text-xs font-bold"
        >
          Tipo Individual
        </button>
        <button
          type="button"
          onClick={() => setServiceKind('group')}
          className="px-3 py-1.5 rounded-lg border text-xs font-bold"
        >
          Tipo Coletiva
        </button>
      </div>

      <ServiceRecurrenceConfigPanel
        allowRecurrence={allowRecurrence}
        allowedFrequencies={allowedFrequencies}
        allowedWeekdays={allowedWeekdays}
        defaultFrequency={defaultFrequency}
        customIntervals={customIntervals}
        defaultCustomInterval={defaultCustomInterval}
        allowedPlanDurations={allowedPlanDurations}
        defaultPlanDuration={defaultPlanDuration}
        serviceKind={serviceKind}
        scheduledWeekdays={[1, 3, 5]}
        individualAvailabilitySlot={
          serviceKind === 'individual' ? (
            <ServiceAvailabilitySection
              mode={availMode}
              windows={availWindows}
              schedules={SCHEDULES}
              schedulesLoading={false}
              allowedWeekdays={allowedWeekdays}
              restrictWeekdays={allowRecurrence && allowedFrequencies.includes('custom_weekdays') && allowedWeekdays.length > 0}
              defaultProfessionalId="prof-1"
              onModeChange={setAvailMode}
              onWindowsChange={setAvailWindows}
              testIdPrefix="harness-avail"
            />
          ) : null
        }
        onChange={next => {
          setAllowRecurrence(next.allowRecurrence);
          setAllowedFrequencies(next.allowedFrequencies);
          setAllowedWeekdays(next.allowedWeekdays);
          setDefaultFrequency(next.defaultFrequency);
          setCustomIntervals(next.customIntervals);
          setDefaultCustomInterval(next.defaultCustomInterval);
          setAllowedPlanDurations(next.allowedPlanDurations);
          setDefaultPlanDuration(next.defaultPlanDuration);
        }}
      />
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<AvailabilityHarness />);
