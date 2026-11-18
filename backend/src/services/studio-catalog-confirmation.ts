import { randomUUID } from 'node:crypto';
import { Request } from 'express';
import { db } from '../config/database';
import { ServiceController, ServiceSaveResponse } from '../controllers/service.controller';
import { getTenantEstablishmentProfile, PLAN_DURATION_MONTHS, resolveServiceDomain } from '../utils/establishment-context';
import { isWindowCoveredByAnyProfessional, parseClockMinutes } from '../utils/service-availability';
import { getPaymentPeriodicityCycleMonths, normalizeCommercialPriceOptions, normalizeStudioPriceAdjustments, normalizeStudioServiceType } from '../utils/studio-access-and-commercial';
import { PackageService } from './package.service';
import { catalogError } from './studio-catalog-files';
import { nameKey, priceConditionKey, ProposedPrice, ProposedService, StudioProposal } from './studio-catalog-proposal';

type CatalogService = {
  id: string; name: string; price: number; professional_id: string | null; default_capacity: number | null;
  duration_minutes: number; service_domain: string | null; service_kind: string; studio_service_type: string;
  clinical_module: string | null; active: number; commercial_price_options_json: string | null;
  pricing_adjustments_json: string | null; access_config_json: string | null; availability_mode: string | null;
};

export function readStudioImportCatalog(tenantId: string) {
  const profile = getTenantEstablishmentProfile(tenantId);
  const services = (db.prepare('SELECT * FROM services WHERE tenant_id = ? ORDER BY name').all(tenantId) as CatalogService[])
    .filter(s => resolveServiceDomain({
      establishmentProfile: profile, serviceDomain: s.service_domain, serviceKind: s.service_kind, clinicalModule: s.clinical_module
    }) === 'studio');
  const packages = db.prepare('SELECT id, name, active FROM service_packages WHERE tenant_id = ? ORDER BY name').all(tenantId) as
    { id: string; name: string; active: number }[];
  const professionals = db.prepare('SELECT id, name FROM professionals WHERE tenant_id = ? AND active = 1 ORDER BY name').all(tenantId) as
    { id: string; name: string }[];
  return { services, packages, professionals };
}

export function similarCatalogName(a: string, b: string) {
  const left = nameKey(a);
  const right = nameKey(b);
  if (!left || !right) return false;
  if (left === right) return true;
  const tokens = new Set(left.split(' '));
  const other = new Set(right.split(' '));
  const shared = [...tokens].filter(t => other.has(t)).length;
  return shared / Math.max(tokens.size, other.size) >= 0.5;
}

function serviceType(type: ProposedService['type']) {
  if (type === 'access_limited' || type === 'access_unlimited') return 'facility_access';
  if (type === 'group' || type === 'duo') return 'group';
  return type === 'deliverable' ? 'non_scheduled' : 'individual';
}

function nonempty(value: string, message: string) {
  if (!nameKey(value)) throw catalogError(message);
}

function saveService(req: Request, body: Record<string, unknown>, id?: string): string {
  // Both entry points use the ordinary synchronous catalog validation and nested transactions.
  // Propagate errors out of the enclosing import transaction before replying to the client.
  const call = Object.assign(Object.create(req), { body, params: id ? { id } : {} }) as Request;
  let code = 200;
  let payload: { id?: string; error?: string; schedule_warnings?: string[] } | undefined;
  const capture: ServiceSaveResponse = {
    status(status) { code = status; return capture; },
    json(data) { payload = data; }
  };
  if (id) ServiceController.updateService(call, capture, true);
  else ServiceController.createService(call, capture, true);
  if (code >= 400 || !payload || (!id && !payload.id)) {
    throw catalogError(code >= 500 ? 'Falha ao gravar o serviço no catálogo.' : payload?.error || 'Falha ao gravar o serviço.', code >= 500 ? 500 : 400);
  }
  if (payload.schedule_warnings?.length) throw catalogError(payload.schedule_warnings.join(' '));
  return id || payload.id!;
}

const asDescription = ({ description, notes }: { description: string; notes: string }) =>
  [description, notes].filter(Boolean).join('\n\n');

function commercialOptions(row: ProposedService, type: string) {
  const conditions = new Set<string>();
  const proposals = row.prices.filter(price => {
    const key = priceConditionKey(price);
    if (!price.unit || !price.amountCents || conditions.has(key)) {
      throw catalogError('Confirme a unidade e o valor de cada preço, e remova condições duplicadas ou conflitantes.');
    }
    conditions.add(key);
    return true;
  });
  const isStandalone = (p: ProposedPrice) => p.unit === 'per_session' && !p.duration && !p.frequencyType && (!p.paymentPeriod || p.paymentPeriod === 'one_time');
  const standalone = proposals.filter(isStandalone);
  if (standalone.length > 1) throw catalogError('Deixe apenas um valor avulso por aula.');
  const options = proposals.filter(p => !isStandalone(p)).map(p => {
    const limitedAccess = row.type === 'access_limited' || p.frequencyType === 'weekly' || p.frequencyType === 'monthly';
    const accessType = type === 'facility_access' ? (limitedAccess ? 'limited' : 'unlimited') : 'scheduled';
    const frequencyType = p.frequencyType || (accessType === 'unlimited' ? 'unlimited' : null);
    if (!p.duration || !p.paymentPeriod || !frequencyType ||
        (frequencyType !== 'unlimited' && p.frequencyCount === null) ||
        (p.paymentPeriod === 'installments' && (!p.installments || p.unit !== 'contract_total')) ||
        (p.unit === 'per_participant' && !p.participants && row.type !== 'duo')) {
      throw catalogError('Confirme duração, cobrança e frequência do plano. Parcelamentos exigem o total do contrato e a quantidade de parcelas.');
    }
    if (p.unit === 'per_month' && p.paymentPeriod !== 'monthly') {
      throw catalogError('Valor mensal precisa de cobrança mensal. Confirme a condição comercial antes de importar.');
    }
    if (p.unit === 'contract_total' && !['one_time', 'installments'].includes(p.paymentPeriod)) {
      throw catalogError('Confirme se o preço é o total ou o valor cobrado em cada ciclo.');
    }
    if ((PLAN_DURATION_MONTHS[p.duration] || 0) % getPaymentPeriodicityCycleMonths(p.paymentPeriod) !== 0) {
      throw catalogError('A duração precisa corresponder a ciclos completos de cobrança.');
    }
    if (type === 'facility_access' && frequencyType === 'fixed_count') {
      throw catalogError('Para acesso limitado, escolha a frequência semanal ou mensal que será aplicada na entrada.');
    }
    if (accessType === 'limited' && (frequencyType === 'unlimited' || (frequencyType === 'weekly' && (p.frequencyCount || 0) > 50))) {
      throw catalogError('Confirme a frequência do acesso limitado. O cadastro aceita até 50 entradas por semana.');
    }
    return {
      id: randomUUID(), label: p.label || null, accessType, frequencyType, frequencyCount: p.frequencyCount,
      contractDurationCode: p.duration, paymentPeriodicity: p.paymentPeriod, commercialUnit: p.unit,
      amountCents: p.amountCents, installmentsCount: p.installments || 1, participantsCount: p.participants || (row.type === 'duo' ? 2 : 1)
    };
  });
  if (standalone.length && (type === 'facility_access' || type === 'non_scheduled')) {
    throw catalogError('Este serviço não tem aulas avulsas. Cadastre o valor como opção comercial.');
  }
  return { basePrice: standalone[0]?.amountCents ? standalone[0].amountCents / 100 : undefined, options: normalizeCommercialPriceOptions(options) };
}

function mergeCommercialOptions(existing: CatalogService, additions: ReturnType<typeof commercialOptions>) {
  const current = normalizeCommercialPriceOptions(existing.commercial_price_options_json);
  const signature = (p: typeof current[number]) => JSON.stringify([
    p.accessType, p.frequencyType, p.frequencyCount, p.contractDurationCode, p.paymentPeriodicity, p.commercialUnit, p.participantsCount, p.installmentsCount, p.modality
  ]);
  for (const option of additions.options) {
    const matches = current.filter(old => signature(old) === signature(option));
    if (matches.some(old => old.amountCents !== option.amountCents)) {
      throw catalogError('Já existe um preço para a mesma condição comercial. Remova essa opção da importação para preservar o preço cadastrado.');
    }
    if (!matches.length) current.push(option);
  }
  return current;
}

function scheduleInput(row: ProposedService, type: string, primary: string, capacity: number | null,
  duration: number, tenantId: string, existing?: CatalogService) {
  if (!row.schedules.length) return {};
  if (type !== 'group' && type !== 'individual') throw catalogError('Serviços sem agendamento não podem receber horários de aula.');
  const known = existing && type === 'group'
    ? db.prepare('SELECT day_of_week, start_time, end_time, professional_id FROM class_schedules WHERE tenant_id = ? AND service_id = ? AND active = 1 AND (effective_end_date IS NULL OR effective_end_date >= date(\'now\'))')
      .all(tenantId, existing.id) : [];
  const windows = existing && type === 'individual' && existing.availability_mode === 'custom_windows'
    ? db.prepare('SELECT day_of_week, start_time, end_time, professional_id FROM service_availability_windows WHERE tenant_id = ? AND service_id = ? AND active = 1')
      .all(tenantId, existing.id).map(w => ({ dayOfWeek: w.day_of_week, startTime: w.start_time, endTime: w.end_time, professionalId: w.professional_id })) : [];
  const schedules = new Map<string, { dayOfWeek: number; startTime: string; endTime: string; professionalId: string; capacity: number | null }>();
  for (const item of row.schedules) {
    const start = parseClockMinutes(item.startTime);
    const end = parseClockMinutes(item.endTime);
    if (item.dayOfWeek === null || start === null || end === null || end - start < duration) {
      throw catalogError('Confirme o dia e a faixa de cada horário. A faixa precisa comportar a duração da aula.');
    }
    const professionalId = item.professionalId || (!item.professionalName ? primary : '');
    if (!professionalId || !isWindowCoveredByAnyProfessional(tenantId, [professionalId], {
      dayOfWeek: item.dayOfWeek, startMin: start, endMin: end
    }) || !db.prepare('SELECT id FROM professionals WHERE id = ? AND tenant_id = ? AND active = 1').get(professionalId, tenantId)) {
      throw catalogError('Selecione um profissional ativo cuja escala cubra todo o horário proposto.');
    }
    const entry = { dayOfWeek: item.dayOfWeek, startTime: item.startTime, endTime: item.endTime, professionalId, capacity: item.capacity ?? capacity };
    const key = [entry.dayOfWeek, entry.startTime, entry.endTime, entry.professionalId].join('|');
    if (schedules.has(key) && schedules.get(key)?.capacity !== entry.capacity) {
      throw catalogError('Há capacidades conflitantes para o mesmo horário.');
    }
    if (!known.some(s => s.day_of_week === entry.dayOfWeek && s.start_time === entry.startTime &&
        s.end_time === entry.endTime && s.professional_id === entry.professionalId)) schedules.set(key, entry);
  }
  const rows = [...schedules.values()];
  if (type === 'group') return { classSchedules: rows };
  const all = [...new Map([...windows, ...rows].map(w => [[w.dayOfWeek, w.startTime, w.endTime, w.professionalId].join('|'), w])).values()];
  const linked = existing ? db.prepare('SELECT professional_id FROM professional_services WHERE service_id = ?').all(existing.id).map(r => String(r.professional_id)) : [];
  return {
    availabilityMode: 'custom_windows', availabilityWindows: all,
    linkedProfessionalIds: [...new Set([...linked, ...rows.map(w => w.professionalId)].filter(Boolean))]
  };
}

function adjustmentOptions(row: ProposedService) {
  return row.adjustments.map(adjustment => {
    if (!adjustment.label || !adjustment.adjustmentType || !adjustment.valueType || !adjustment.incidence ||
        !adjustment.amount || (adjustment.valueType === 'percentage' && adjustment.amount > 100) ||
        ((!adjustment.startTime || !adjustment.endTime) && !adjustment.weekdays.length) ||
        (Boolean(adjustment.startTime) !== Boolean(adjustment.endTime)) ||
        (adjustment.startTime && adjustment.startTime >= adjustment.endTime)) {
      throw catalogError('Confirme o tipo, valor, incidência e dia ou faixa horária de cada ajuste.');
    }
    return { ...adjustment, id: randomUUID(), active: true };
  });
}

function packagePrice(price: ProposedPrice | null) {
  const periods = ['monthly', 'bimonthly', 'quarterly', 'semiannual', 'annual'] as const;
  if (!price?.amountCents || !price.duration || !price.unit || !price.paymentPeriod) {
    throw catalogError('Confirme o preço, a duração do contrato e a forma de pagamento do pacote.');
  }
  const months = PLAN_DURATION_MONTHS[price.duration];
  if (!months) throw catalogError('Selecione uma duração em meses para o pacote.');
  const oneTime = price.paymentPeriod === 'one_time' || price.paymentPeriod === 'installments';
  const cycle = periods.find(p => p === price.paymentPeriod);
  const compatibleUnit = oneTime ? price.unit === 'contract_total'
    : (price.unit === 'per_cycle' || (price.unit === 'per_month' && cycle === 'monthly'));
  if ((!oneTime && !cycle) || !compatibleUnit || (price.paymentPeriod === 'installments' && !price.installments)) {
    throw catalogError('Para pagamento único ou parcelado, informe o total. Para cobrança recorrente, informe o valor por ciclo.');
  }
  if (months % getPaymentPeriodicityCycleMonths(price.paymentPeriod) !== 0) {
    throw catalogError('A duração do pacote precisa corresponder a ciclos completos de cobrança.');
  }
  return {
    price: price.amountCents / 100, contractDurationCode: price.duration, paymentPeriodicity: price.paymentPeriod,
    billingType: oneTime ? 'one_time' as const : 'recurring_monthly' as const,
    billingFrequency: cycle, installmentsCount: price.installments || 1, validityDays: months * 30
  };
}

export function applyStudioCatalog(req: Request, proposal: StudioProposal) {
  const tenantId = req.tenantId!;
  const catalog = readStudioImportCatalog(tenantId);
  const services: { key: string; id: string; name: string; action: string }[] = [];
  const packages: typeof services = [];
  const references = new Map(catalog.services.filter(s => s.active).map(s => ['existing:' + s.id, s.id]));
  for (const row of proposal.services) {
    if (row.action === 'ignore') continue;
    try {
      if (!row.reviewed) throw catalogError('Marque a revisão como concluída.');
      const target = catalog.services.find(s => s.active && s.id === row.existingId);
      const isCreate = row.action === 'create';
      if (!isCreate && !target) throw catalogError('Selecione um serviço ativo do catálogo de Studio.');
      if (row.action === 'link') {
        references.set(row.key, target!.id);
        services.push({ key: row.key, id: target!.id, name: target!.name, action: row.action });
        continue;
      }
      const current = isCreate ? undefined : target;
      const type = current ? normalizeStudioServiceType(current.studio_service_type, current.service_kind) : serviceType(row.type);
      const identity = isCreate || row.apply.includes('identity');
      if (identity) {
        nonempty(row.name, 'Informe o nome do serviço.');
        const duplicates = catalog.services.some(s => s.id !== current?.id && nameKey(s.name) === nameKey(row.name) &&
          normalizeStudioServiceType(s.studio_service_type, s.service_kind) === type &&
          (type !== 'group' || (s.default_capacity === 2) === (current ? current.default_capacity === 2 : row.type === 'duo')));
        if (duplicates) throw catalogError('Já existe um serviço com esse nome e tipo. Vincule-o ou diferencie o nome.');
      }
      const scheduled = type === 'group' || type === 'individual';
      const capacity = current ? current.default_capacity : row.type === 'duo' ? 2 : row.capacity;
      const duration = current ? current.duration_minutes : row.durationMinutes;
      const professional = current ? current.professional_id : row.professionalId;
      if (isCreate && (!row.type || (scheduled && (!duration || !row.modality ||
        !catalog.professionals.some(p => p.id === professional) || (type === 'group' && !capacity))))) {
        throw catalogError('Confirme o tipo e, para serviços agendáveis, o profissional, a modalidade, a duração e as vagas da turma.');
      }
      if (isCreate && row.type === 'access_limited' && ((!row.weeklyLimit && !row.monthlyLimit) || (row.weeklyLimit || 0) > 50)) {
        throw catalogError('Informe o limite semanal (até 50) ou mensal do acesso.');
      }
      if (current && row.apply.length === 0) throw catalogError('Selecione os campos que deseja atualizar.');
      const prices = isCreate || row.apply.includes('prices') ? commercialOptions({
        ...row, type: current ? currentServiceType(current) : row.type
      }, type) : null;
      if (current && prices?.basePrice !== undefined && prices.basePrice !== current.price) {
        throw catalogError('A importação preserva o preço avulso cadastrado. Remova essa opção para adicionar os planos.');
      }
      const adjustments = isCreate || row.apply.includes('adjustments') ? adjustmentOptions(row) : null;
      const body: Record<string, unknown> = { serviceDomain: 'studio' };
      if (identity) Object.assign(body, { name: row.name, description: asDescription(row), modalityCategory: row.activity || null });
      if (isCreate) Object.assign(body, {
        studioServiceType: type, serviceKind: type === 'group' ? 'group' : 'individual',
        defaultCapacity: capacity, durationMinutes: scheduled ? duration : undefined,
        requiresActiveContract: type === 'facility_access' || (scheduled && Boolean(prices?.options.length) && prices?.basePrice === undefined),
        professionalId: professional || undefined, modality: row.modality || undefined, allowPublicBooking: false,
        allowRecurrence: scheduled && row.prices.some(p => p.frequencyType === 'weekly' || p.frequencyType === 'monthly'),
        allowedPlanDurations: [...new Set(row.prices.map(p => p.duration).filter(Boolean))],
        accessConfig: type === 'facility_access' ? {
          accessMode: row.type === 'access_limited' ? 'limited' : 'unlimited',
          maxEntriesPerWeek: row.weeklyLimit, maxEntriesPerMonth: row.monthlyLimit,
          countPeriod: row.monthlyLimit && !row.weeklyLimit ? 'monthly' : 'weekly'
        } : undefined,
        price: prices?.basePrice ?? 0
      });
      if (prices) body.commercialPriceOptions = current ? mergeCommercialOptions(current, prices) : prices.options;
      if (adjustments?.length) {
        const previous = normalizeStudioPriceAdjustments(current?.pricing_adjustments_json);
        const signature = (a: typeof previous[number]) => JSON.stringify([a.adjustmentType, a.valueType, a.amount, a.incidence, a.weekdays || [], a.startTime || '', a.endTime || '']);
        const known = new Set(previous.map(signature));
        for (const adjustment of normalizeStudioPriceAdjustments(adjustments)) {
          const key = signature(adjustment);
          if (!known.has(key)) { previous.push(adjustment); known.add(key); }
        }
        body.pricingAdjustments = previous;
      }
      if (isCreate || row.apply.includes('schedules')) {
        Object.assign(body, scheduleInput(row, type, professional || '', capacity, duration || 0, tenantId, current));
      }
      const id = saveService(req, body, current?.id);
      references.set(row.key, id);
      services.push({ key: row.key, id, name: identity ? row.name : current!.name, action: row.action });
      const saved = db.prepare('SELECT * FROM services WHERE tenant_id = ? AND id = ?').get(tenantId, id) as CatalogService;
      if (current) Object.assign(current, saved);
      else catalog.services.push(saved);
    } catch (error) {
      throw catalogError((row.name || 'Serviço sem nome') + ' — ' + (error as Error).message, (error as { status?: number }).status || 500);
    }
  }
  for (const row of proposal.packages) {
    if (row.action === 'ignore') continue;
    try {
      if (!row.reviewed) throw catalogError('Marque a revisão como concluída.');
      if (row.action === 'link') {
        const target = catalog.packages.find(p => p.active && p.id === row.existingId);
        if (!target) throw catalogError('Selecione um pacote ativo deste estabelecimento.');
        packages.push({ key: row.key, id: target.id, name: target.name, action: row.action });
        continue;
      }
      nonempty(row.name, 'Informe o nome do pacote.');
      if (catalog.packages.some(p => nameKey(p.name) === nameKey(row.name))) throw catalogError('Já existe um pacote com esse nome.');
      const itemIds = new Set<string>();
      const items = row.items.map(item => {
        const id = references.get(item.serviceRef);
        if (!id || itemIds.has(id)) throw catalogError('Vincule cada componente a um serviço distinto, existente ou selecionado nesta importação.');
        itemIds.add(id);
        const service = catalog.services.find(s => s.id === id)!;
        const type = currentServiceType(service);
        if (['individual', 'duo', 'group', 'deliverable'].includes(type) && !item.includedCredits) {
          throw catalogError('Informe as unidades ou aulas incluídas de ' + service.name + '.');
        }
        return {
          serviceId: id, includedCredits: item.includedCredits, weeklyFrequency: item.weeklyFrequency,
          monthlyLimit: item.monthlyLimit, isMandatory: item.mandatory
        };
      });
      const created = PackageService.createPackage(tenantId, {
        name: row.name, description: asDescription(row), ...packagePrice(row.price), items, allowPublicBooking: false
      }, req.user!.userId);
      if (!created?.id) throw catalogError('Falha ao gravar o pacote.', 500);
      packages.push({ key: row.key, id: created.id, name: row.name, action: row.action });
      catalog.packages.push(created);
    } catch (error) {
      throw catalogError((row.name || 'Pacote sem nome') + ' — ' + (error as Error).message, (error as { status?: number }).status || 500);
    }
  }
  if (!services.length && !packages.length) throw catalogError('Selecione ao menos um registro para importar.');
  return { services, packages };
}

function currentServiceType(service: CatalogService) {
  const type = normalizeStudioServiceType(service.studio_service_type, service.service_kind);
  if (type === 'group') return service.default_capacity === 2 ? 'duo' : 'group';
  if (type === 'non_scheduled') return 'deliverable';
  if (type === 'facility_access') {
    try { if (JSON.parse(service.access_config_json || '{}').accessMode === 'limited') return 'access_limited'; } catch { /* legacy row */ }
    return 'access_unlimited';
  }
  return 'individual';
}
