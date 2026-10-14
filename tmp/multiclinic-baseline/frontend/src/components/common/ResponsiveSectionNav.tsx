import React from 'react';

export function ResponsiveSectionNav<T extends string>({ value, onChange, options, label = 'Seção atual', children }: {
  value: T; onChange: (value: T) => void; options: { value: T; label: string }[]; label?: string; children: React.ReactNode;
}) {
  return <>
    <label className="zemda-tab-mobile"><span className="sr-only">{label}</span>
      <select aria-label={label} value={value} onChange={event => onChange(event.target.value as T)}>
        {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
    <div className="zemda-tab-desktop">{children}</div>
  </>;
}
