export interface BookingRoute { kind: 'clinic' | 'professional'; clinicSlug?: string; professionalSlug?: string; sequence?: number }
export function parseBookingRoute(path: string): BookingRoute | null {
  const clinic = path.match(/^\/agendar\/clinica\/([^/]+)(?:\/([1-9]\d*))?\/?$/);
  if (clinic) return { kind: 'clinic', clinicSlug: clinic[1], sequence: Number(clinic[2] || 1) };
  const oldClinic = path.match(/^\/c\/([^/]+)\/?$/);
  if (oldClinic) return { kind: 'clinic', clinicSlug: oldClinic[1] };
  const professional = path.match(/^\/agendar\/([^/]+)\/([^/]+)\/?$/);
  if (professional) return { kind: 'professional', clinicSlug: professional[1], professionalSlug: professional[2] };
  const legacy = path.match(/^\/agendar\/([^/]+)\/?$/);
  return legacy ? { kind: 'professional', professionalSlug: legacy[1] } : null;
}
export function clinicBookingPath(tenant: { public_booking_slug?: string; public_booking_sequence?: number }): string | null {
  if (!tenant.public_booking_slug || !tenant.public_booking_sequence) return null;
  return `/agendar/clinica/${tenant.public_booking_slug}${tenant.public_booking_sequence > 1 ? `/${tenant.public_booking_sequence}` : ''}`;
}
export function bookingAreas(professionals: any[], services: any[]): Array<{ name: string; professionalIds: string[] }> {
  const areas = new Map<string, { name: string; professionalIds: string[] }>();
  for (const p of professionals) {
    const linked = services.filter(s => p.services?.some((link: any) => link.id === s.id));
    if (!linked.length) continue;
    let practice: string[] = [];
    try { const parsed = JSON.parse(p.practice_areas || '[]'); if (Array.isArray(parsed)) practice = parsed.filter(x => typeof x === 'string'); } catch { practice = String(p.practice_areas || '').split(/[,;|]/); }
    const labels = [p.profession_name, p.specialty_name, ...practice, ...linked.map(s => s.specialty_name)].filter(x => typeof x === 'string' && x.trim());
    if (!labels.length) labels.push(...linked.map(s => s.name));
    for (const name of labels) { const key = name.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); const area = areas.get(key) || { name: name.trim(), professionalIds: [] as string[] }; if (!area.professionalIds.includes(p.id)) area.professionalIds.push(p.id); areas.set(key, area); }
  }
  return [...areas.values()].sort((a,b) => a.name.localeCompare(b.name, 'pt-BR'));
}
export function calendarBooking(booking: { startTime: string; endTime: string; title: string; clinic: string }): string {
  const escape = (value: string) => value.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
  const timestamp = (value: string) => value.replace(/[-:]/g, '');
  return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Zemda//Agendamento//PT-BR','BEGIN:VEVENT',`UID:${crypto.randomUUID()}@zemda.com.br`,`DTSTAMP:${new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d+Z$/,'Z')}`,`DTSTART;TZID=America/Sao_Paulo:${timestamp(booking.startTime)}`,`DTEND;TZID=America/Sao_Paulo:${timestamp(booking.endTime)}`,`SUMMARY:${escape(booking.title)}`,`LOCATION:${escape(booking.clinic)}`,'END:VEVENT','END:VCALENDAR'].join('\r\n');
}
