import React from 'react';
import { Repeat } from 'lucide-react';
import {
  ALL_RECURRENCE_FREQUENCIES,
  RECURRENCE_FREQUENCY_LABELS,
  RecurrenceFrequency
} from '../../utils/establishmentContext';

interface ServiceRecurrenceConfigPanelProps {
  allowRecurrence: boolean;
  allowedFrequencies: RecurrenceFrequency[];
  defaultFrequency: RecurrenceFrequency;
  onChange: (next: {
    allowRecurrence: boolean;
    allowedFrequencies: RecurrenceFrequency[];
    defaultFrequency: RecurrenceFrequency;
  }) => void;
}

export const ServiceRecurrenceConfigPanel: React.FC<ServiceRecurrenceConfigPanelProps> = ({
  allowRecurrence,
  allowedFrequencies,
  defaultFrequency,
  onChange
}) => {
  const toggleFrequency = (freq: RecurrenceFrequency) => {
    const exists = allowedFrequencies.includes(freq);
    const nextAllowed = exists
      ? allowedFrequencies.filter(f => f !== freq)
      : ALL_RECURRENCE_FREQUENCIES.filter(f => allowedFrequencies.includes(f) || f === freq);

    if (nextAllowed.length === 0) {
      onChange({
        allowRecurrence: false,
        allowedFrequencies: [],
        defaultFrequency: 'weekly'
      });
      return;
    }

    const nextDefault = nextAllowed.includes(defaultFrequency) ? defaultFrequency : nextAllowed[0];
    onChange({
      allowRecurrence: true,
      allowedFrequencies: nextAllowed,
      defaultFrequency: nextDefault
    });
  };

  return (
    <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="font-bold text-slate-800 text-[11px] flex items-center gap-1.5">
          <Repeat className="w-3.5 h-3.5 text-teal-600" />
          Recorrência do Serviço
        </div>
        <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 cursor-pointer">
          <input
            type="checkbox"
            checked={!allowRecurrence}
            onChange={e => {
              const noRecurrence = e.target.checked;
              if (noRecurrence) {
                onChange({
                  allowRecurrence: false,
                  allowedFrequencies: [],
                  defaultFrequency: 'weekly'
                });
              } else {
                const seeded = allowedFrequencies.length > 0 ? allowedFrequencies : ['weekly' as RecurrenceFrequency];
                onChange({
                  allowRecurrence: true,
                  allowedFrequencies: seeded,
                  defaultFrequency: seeded.includes(defaultFrequency) ? defaultFrequency : seeded[0]
                });
              }
            }}
            className="w-3.5 h-3.5 rounded text-slate-600 border-slate-300"
          />
          <span>Sem recorrência</span>
        </label>
      </div>

      {allowRecurrence && (
        <div className="space-y-2">
          <div className="text-[11px] text-slate-500">Frequências autorizadas no agendamento:</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {ALL_RECURRENCE_FREQUENCIES.map(freq => {
              const checked = allowedFrequencies.includes(freq);
              return (
                <label
                  key={freq}
                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold cursor-pointer transition-colors ${
                    checked
                      ? 'border-teal-500 bg-teal-50/70 text-teal-900'
                      : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleFrequency(freq)}
                    className="w-3.5 h-3.5 rounded text-teal-600 border-slate-300"
                  />
                  <span>{RECURRENCE_FREQUENCY_LABELS[freq]}</span>
                </label>
              );
            })}
          </div>

          {allowedFrequencies.length > 0 && (
            <div>
              <label className="block font-semibold text-slate-700 mb-1 text-[11px]">
                Frequência padrão
              </label>
              <select
                value={allowedFrequencies.includes(defaultFrequency) ? defaultFrequency : allowedFrequencies[0]}
                onChange={e =>
                  onChange({
                    allowRecurrence: true,
                    allowedFrequencies,
                    defaultFrequency: e.target.value as RecurrenceFrequency
                  })
                }
                className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-slate-50 font-semibold text-slate-800"
              >
                {allowedFrequencies.map(freq => (
                  <option key={freq} value={freq}>
                    {RECURRENCE_FREQUENCY_LABELS[freq]}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
