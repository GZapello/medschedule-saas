export function parseBookingCancellationPolicy(raw: unknown, currentText: string | null) {
  const value = raw as any;
  if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.enabled !== 'boolean' ||
      (value.text !== undefined && (typeof value.text !== 'string' || value.text.length > 10000))) {
    throw Object.assign(new Error('Informe a ativação e um texto de até 10.000 caracteres para a política de cancelamento.'), { status: 400 });
  }
  const text = value.text === undefined ? (currentText || '') : value.text.trim();
  if (value.enabled && !text) throw Object.assign(new Error('Escreva a política de cancelamento antes de ativá-la.'), { status: 400 });
  return { enabled: value.enabled ? 1 : 0, text };
}
