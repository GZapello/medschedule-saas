import { useLayoutEffect, useRef } from 'react';

/** Reset unsaved form state when the patient/encounter changes, before draft recovery. */
export function useClinicalFormReset(context: string, fields: Array<[unknown, (value: any) => void]>) {
  const initial = useRef(fields.map(([value]) => structuredClone(value)));
  const previous = useRef(context);
  const activeContext = useRef(context);
  activeContext.current = context;
  useLayoutEffect(() => {
    if (previous.current === context) return;
    previous.current = context;
    fields.forEach(([, setValue], index) => setValue(structuredClone(initial.current[index])));
  }, [context]);
  return () => activeContext.current === context;
}
