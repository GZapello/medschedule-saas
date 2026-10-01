import React from 'react';

/** A missing observation is distinct from a documented negative finding. */
export const ClinicalBooleanSelect: React.FC<{
  value?: boolean | null;
  onChange: (value: boolean | undefined) => void;
}> = ({ value, onChange }) => (
  <select className="p-2 text-xs rounded-lg border border-slate-200 bg-white"
    value={value == null ? '' : String(value)}
    onChange={event => onChange(event.target.value === '' ? undefined : event.target.value === 'true')}>
    <option value="">Não avaliado</option>
    <option value="true">Sim / presente</option>
    <option value="false">Não / ausente</option>
  </select>
);
