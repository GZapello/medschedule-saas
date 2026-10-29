/** API accepts clinic-local timestamps or an explicit offset; storage is São Paulo local time. */
export function bookingTime(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim().replace(' ', 'T');
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(Z|[+-]\d{2}:\d{2})?$/.exec(text);
  if (!match) return null;
  const [, y, m, d, h, minute, second = '00', offset] = match;
  const calendarDate = new Date(Date.UTC(+y, +m - 1, +d));
  if (calendarDate.getUTCFullYear() !== +y || calendarDate.getUTCMonth() !== +m - 1 || calendarDate.getUTCDate() !== +d || +h > 23 || +minute > 59 || +second > 59) return null;
  if (!offset) return `${y}-${m}-${d}T${h}:${minute}:${second}`;
  const instant = new Date(`${y}-${m}-${d}T${h}:${minute}:${second}${offset}`);
  if (!Number.isFinite(instant.getTime())) return null;
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(instant).map(part => [part.type, part.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
}
