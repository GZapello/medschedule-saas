import { createContext } from 'react';

// Portal targets owned by the appointment; controls keep their workspace state.
export const ClinicalHeaderSlots = createContext<{
  filters: HTMLDivElement | null;
  actions: HTMLDivElement | null;
} | null>(null);
