import { db } from '../config/database';
import { calculateAvailableSlots, CalculateSlotsOptions } from '../utils/slot-calculator';
import { WeeklyMeeting } from '../utils/studio-frequency-pricing';

export interface IndividualMeeting extends WeeklyMeeting { date: string; professionalName: string; }

/** Read-only projection of the existing availability engine, never a collective class schedule. */
export function individualStudioMeetings(params: {
  tenantId: string; serviceId?: string; professionalIds?: string[]; startDate: string;
  publicOnly?: boolean; draft?: CalculateSlotsOptions['serviceOverride'];
}): IndividualMeeting[] {
  const professionals = db.prepare(`SELECT DISTINCT p.id, p.name FROM professionals p
    WHERE p.tenant_id = ? AND p.active = 1 ${params.publicOnly ? 'AND p.public_booking_enabled = 1' : ''}
    AND (? IS NULL OR EXISTS (SELECT 1 FROM services s WHERE s.id = ? AND s.tenant_id = p.tenant_id AND s.active = 1
      AND (s.professional_id = p.id OR EXISTS (SELECT 1 FROM professional_services ps WHERE ps.service_id = s.id AND ps.professional_id = p.id))))
  `).all(params.tenantId, params.serviceId || null, params.serviceId || null) as any[];
  const meetings = new Map<string, IndividualMeeting>();
  for (let offset = 0; offset < 7; offset++) {
    const date = new Date(`${params.startDate}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + offset);
    const day = date.toISOString().slice(0, 10);
    for (const professional of professionals.filter(p => !params.professionalIds || params.professionalIds.includes(p.id))) {
      for (const slot of calculateAvailableSlots(params.tenantId, professional.id, params.serviceId || '', day, undefined, undefined, undefined, undefined,
        params.draft ? { serviceOverride: params.draft } : undefined)) {
        const startTime = slot.startTime.slice(11, 16), endTime = slot.endTime.slice(11, 16);
        const id = `individual:${date.getUTCDay()}:${startTime}:${endTime}:${professional.id}`;
        meetings.set(id, { id, weekday: date.getUTCDay(), startTime, endTime, professionalId: professional.id, professionalName: professional.name, date: day });
      }
    }
  }
  return Array.from(meetings.values()).sort((a, b) => `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`));
}
