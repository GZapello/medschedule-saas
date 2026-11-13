import React from 'react';
import { useMobileLayout } from '../../hooks/useMobileLayout';

/** Same editable value; a multiline field gives long exercise names room on mobile. */
export function PersonalExerciseNameField({value, onChange, className, placeholder}: {
  value: string; onChange: (value: string) => void; className: string; placeholder?: string;
}) {
  const mobile = useMobileLayout();
  return mobile
    ? <textarea aria-label="Nome do exercício" rows={3} value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} className={`${className} personal-exercise-name`} />
    : <input type="text" value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} className={className} />;
}
