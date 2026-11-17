import { individualStudioMeetings } from './studio-individual-meetings.service';
import { calculateAvailableSlots } from '../utils/slot-calculator';
import { db } from '../config/database';
import { getTenantEstablishmentProfile, supportsStudioFeatures, resolveServiceDomain } from '../utils/establishment-context';
import { offeredWeeklyMeetings, readFrequencyPricing, supportsFrequencyPricing, countMeetingOccurrences } from '../utils/studio-frequency-pricing';
import { calculateStudioRecurringPrice, getCycleMonthsForBillingMode } from '../utils/studio-pricing';

export interface PricedSessionSlot {
  startTime: string;
  endTime?: string;
  professionalId?: string;
  classScheduleId?: string | null;
}

/** Authoritative quote for NEW contracts only. Existing plans keep their snapshots. */
export function quoteFrequencyPlan(params: {
  tenantId: string; serviceId: string; billingFrequency: string; slots: PricedSessionSlot[];
  startDate: string; endDate?: string | null; publicOnly?: boolean; cadence?: string; includeStandardPricing?: boolean;
}) {
  if (params.cadence && !['weekly', 'custom_weekdays'].includes(params.cadence)) return null;
  const profile = getTenantEstablishmentProfile(params.tenantId);
  if (!supportsStudioFeatures(profile)) return null;
  const service = db.prepare('SELECT * FROM services WHERE id = ? AND tenant_id = ? AND active = 1').get(params.serviceId, params.tenantId) as any;
  const config = readFrequencyPricing(service?.frequency_pricing_json);
  if (!service || resolveServiceDomain({ establishmentProfile: profile, serviceDomain: service.service_domain, serviceKind: service.service_kind, clinicalModule: service.clinical_module }) !== 'studio' || (!config?.enabled && !params.includeStandardPricing) || !supportsFrequencyPricing(service.billing_mode) || !supportsFrequencyPricing(params.billingFrequency)) return null;
  const fail = (message: string): never => { throw Object.assign(new Error(message), { status: 400, code: 'INVALID_FREQUENCY_PLAN' }); };
  const rows = db.prepare(`
    SELECT cs.*, p.active AS professional_active FROM class_schedules cs
    JOIN professionals p ON p.id = cs.professional_id AND p.tenant_id = cs.tenant_id
    WHERE cs.tenant_id = ? AND cs.service_id = ? AND cs.active = 1 AND p.active = 1
      ${params.publicOnly ? 'AND p.public_booking_enabled = 1' : ''}
  `).all(params.tenantId, params.serviceId) as any[];
  const individual = service.service_kind !== 'group';
  const available = individual ? individualStudioMeetings({ tenantId: params.tenantId, serviceId: params.serviceId, startDate: params.startDate, publicOnly: params.publicOnly }) : offeredWeeklyMeetings(rows);
  const contractableLimit = individual
    ? new Set(available.map(m => m.weekday)).size
    : Math.min(7, available.length);
  const eligibleRows = individual ? available : rows.flatMap(row => offeredWeeklyMeetings([row]));
  const selected = new Map<string, typeof available[number]>();
  if (!params.slots.length) fail('Selecione os dias e horários da grade para contratar o plano por frequência.');
  for (const slot of params.slots) {
    const date = slot.startTime.slice(0, 10);
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    const individualSlot = individual && slot.professionalId ? calculateAvailableSlots(params.tenantId, slot.professionalId, params.serviceId, date, undefined, undefined, undefined, undefined, { ignoreAdvanceCap: true, ignoreLeadTime: true }).find(s => s.startTime.slice(11, 16) === slot.startTime.slice(11, 16) && (!slot.endTime || s.endTime.slice(11, 16) === slot.endTime.slice(11, 16))) : null;
    const match = individual && individualSlot ? eligibleRows.find(m => m.weekday === weekday && m.startTime === individualSlot.time && m.professionalId === slot.professionalId) : !individual ? eligibleRows.find(meeting =>
      (!slot.classScheduleId || meeting.id === slot.classScheduleId) &&
      meeting.weekday === weekday && meeting.startTime === slot.startTime.slice(11, 16) &&
      (!slot.endTime || meeting.endTime === slot.endTime.slice(11, 16)) &&
      (!slot.professionalId || meeting.professionalId === slot.professionalId) &&
      (!meeting.effectiveStartDate || meeting.effectiveStartDate <= date) &&
      (!meeting.effectiveEndDate || meeting.effectiveEndDate >= date)) : undefined;
    if (!match) fail('Um horário selecionado não está mais disponível na grade deste serviço. Atualize os dias e horários.');
    selected.set(`${match!.weekday}|${match!.startTime}|${match!.professionalId}`, match!);
  }
  const weeklyCount = selected.size;
  if (!weeklyCount || weeklyCount > contractableLimit) fail('A frequência contratada excede os encontros ofertados na grade.');
  const months = getCycleMonthsForBillingMode(params.billingFrequency) || 1;
  const [y, m, d] = params.startDate.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1 + months, 1, 12));
  next.setUTCDate(Math.min(d, new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate()));
  next.setUTCDate(next.getUTCDate() - 1);
  const cycleEnd = next.toISOString().slice(0, 10);
  const end = params.endDate && params.endDate < cycleEnd ? params.endDate : cycleEnd;
  const calculation = calculateStudioRecurringPrice({
    serviceName: service.name, sessionPrice: Number(service.price), weeklySessionsCount: weeklyCount,
    billingMode: params.billingFrequency, pricingRule: service.pricing_rule,
    frequencyPricing: contractableLimit >= 2 ? config : null,
    customPrice: Number(service.periodic_price) || undefined,
    isPriceCustomized: Boolean(service.is_price_customized),
    scheduledSessionsCount: countMeetingOccurrences(Array.from(selected.values()), params.startDate, end)
  });
  if (!Number.isSafeInteger(Math.round(calculation.effectivePrice * 100)) || calculation.effectivePrice <= 0) fail('Informe um preço válido para esta frequência semanal.');
  return { calculation, weeklyCount, billingFrequency: params.billingFrequency, meetings: Array.from(selected.values()), pricingRule: calculation.pricingRule };
}
