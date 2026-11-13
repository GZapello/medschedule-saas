import { ConsentService } from '../services/consent.service';
import { Request, Response } from 'express';
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { logAudit } from '../middlewares/audit.middleware';
import { getAvailableModulesForProfessional, isPrimaryClinicalModule } from '../utils/clinical-module';
import { ClassScheduleService, buildWeeklyScheduleSummary } from '../services/class-schedule.service';
import { PackageService } from '../services/package.service';
import {
  getTenantEstablishmentProfile,
  normalizeRecurrenceConfigForSave,
  parseServiceRecurrenceConfig,
  resolveServiceDomain,
  ServiceDomain
} from '../utils/establishment-context';

export class ServiceController {
  static list(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: 'Tenant não informado' });
        return;
      }

      if (typeof req.query.consentModule === 'string') {
        res.json(ConsentService.compatibleServices(req, req.query.consentModule, typeof req.query.consentProfessionId === 'string' ? req.query.consentProfessionId : ''));
        return;
      }
      const { professionalId } = req.query;

      let query = `
        SELECT 
          s.id, s.tenant_id, s.professional_id, s.specialty_id, s.name, s.description,
          COALESCE(ps.custom_duration, s.duration_minutes) as duration_minutes,
          s.buffer_minutes,
          COALESCE(ps.custom_price, s.price) as price,
          s.modality, s.active,
          COALESCE(s.service_kind, 'individual') as service_kind,
          s.default_capacity,
          COALESCE(s.allow_recurrence, 1) as allow_recurrence,
          s.allowed_recurrence_frequencies_json,
          s.default_recurrence_frequency,
          s.service_domain,
          s.modality_category,
          s.min_lead_time_hours, s.max_advance_days, s.cancellation_policy,
          s.reminder_enabled, s.reminder_value, s.reminder_unit,
          s.clinical_module,
          p.name as professional_name,
          COALESCE(prof.name, p.profession_name) as profession_name,
          spec.name as specialty_name, spec.color as specialty_color
        FROM services s
        LEFT JOIN professionals p ON p.id = s.professional_id
        LEFT JOIN professions prof ON prof.id = p.profession_id
        LEFT JOIN specialties spec ON spec.id = s.specialty_id
        LEFT JOIN professional_services ps ON ps.service_id = s.id AND ps.professional_id = COALESCE(?, s.professional_id)
        WHERE s.tenant_id = ?
      `;

      const params: any[] = [professionalId || null, tenantId];
      if (professionalId) {
        query += ` AND (s.professional_id = ? OR s.professional_id IS NULL OR ps.professional_id = ?)`;
        params.push(professionalId, professionalId);
      }

      query += ` ORDER BY COALESCE(p.name, 'zzz') ASC, s.name ASC`;
      const stmt = db.prepare(query);
      const services = stmt.all(...params) as any[];
      const establishmentProfile = getTenantEstablishmentProfile(tenantId);
      const isStudioCompat = establishmentProfile === 'studio' || establishmentProfile === 'mixed';
      const schedulesByService = isStudioCompat
        ? ClassScheduleService.listByTenantGrouped(tenantId, { includeInactive: true })
        : new Map();
      const enriched = services.map(srv => {
        const resolvedDomain = resolveServiceDomain({
          establishmentProfile,
          serviceDomain: srv.service_domain,
          serviceKind: srv.service_kind,
          clinicalModule: srv.clinical_module
        });
        if (!isStudioCompat) {
          return {
            ...srv,
            service_kind: 'individual',
            default_capacity: null,
            service_domain: 'clinical',
            allowed_recurrence_frequencies: undefined,
            default_recurrence_frequency: null,
            class_schedules: [],
            weekly_schedule_summary: []
          };
        }
        const schedules = schedulesByService.get(srv.id) || [];
        const recConfig = parseServiceRecurrenceConfig(srv);
        return {
          ...srv,
          service_domain: resolvedDomain,
          allow_recurrence: recConfig.allowRecurrence ? 1 : 0,
          allowed_recurrence_frequencies: recConfig.allowedFrequencies,
          default_recurrence_frequency: recConfig.defaultFrequency,
          class_schedules: schedules,
          weekly_schedule_summary: buildWeeklyScheduleSummary(schedules)
        };
      });
      res.json(enriched);
    } catch (err: any) {
      console.error('[ServiceController.list] Erro:', err);
      res.status(err.status || 500).json({ error: err.status ? err.message : 'Erro ao listar serviços' });
    }
  }

  static create(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: 'Tenant não informado' });
        return;
      }

      const {
        professionalId, specialtyId, name, description, durationMinutes, bufferMinutes,
        price, modality, minLeadTimeHours, maxAdvanceDays, cancellationPolicy,
        reminderEnabled, reminderValue, reminderUnit, clinicalModule,
        serviceKind, service_kind, defaultCapacity, default_capacity, allowRecurrence, allow_recurrence,
        modalityCategory, modality_category,
        serviceDomain, service_domain,
        allowedRecurrenceFrequencies, allowed_recurrence_frequencies,
        defaultRecurrenceFrequency, default_recurrence_frequency
      } = req.body;

      const establishmentProfile = getTenantEstablishmentProfile(tenantId);
      const isStudioCompat = establishmentProfile === 'studio' || establishmentProfile === 'mixed';
      const rawClassSchedules = Array.isArray(req.body?.classSchedules) ? req.body.classSchedules : [];
      const rawKind = serviceKind ?? service_kind;
      const resolvedKind = (rawKind || 'individual') === 'group' ? 'group' : 'individual';
      const rawCapacity = defaultCapacity !== undefined ? defaultCapacity : default_capacity;
      const rawRequestedDomain = serviceDomain ?? service_domain;
      const rawAllowedFreqs = allowedRecurrenceFrequencies !== undefined ? allowedRecurrenceFrequencies : allowed_recurrence_frequencies;
      const rawDefaultFreq = defaultRecurrenceFrequency !== undefined ? defaultRecurrenceFrequency : default_recurrence_frequency;

      if (!isStudioCompat) {
        if (
          resolvedKind === 'group' ||
          (rawCapacity !== undefined && rawCapacity !== null && rawCapacity !== '') ||
          rawClassSchedules.length > 0 ||
          String(rawRequestedDomain || '').trim().toLowerCase() === 'studio' ||
          (Array.isArray(rawAllowedFreqs) && rawAllowedFreqs.length > 0) ||
          (rawDefaultFreq !== undefined && rawDefaultFreq !== null && String(rawDefaultFreq).trim() !== '')
        ) {
          res.status(400).json({
            error: 'Aulas coletivas, capacidade de turma e recorrência avançada de Studio não estão disponíveis para Clínicas / Consultórios tradicionais.'
          });
          return;
        }
      }

      if (establishmentProfile === 'studio' && String(rawRequestedDomain || '').trim().toLowerCase() === 'clinical') {
        res.status(400).json({
          error: 'Estabelecimentos configurados exclusivamente como Studio não criam serviços clínicos tradicionais.'
        });
        return;
      }

      let resolvedCapacity: number | null = null;
      if (resolvedKind === 'group') {
        const capNum = Number(rawCapacity);
        if (!Number.isInteger(capNum) || capNum < 1 || capNum > 500) {
          res.status(400).json({ error: 'Para aulas coletivas/turmas, informe um número inteiro positivo de vagas.' });
          return;
        }
        resolvedCapacity = capNum;
      }
      const resolvedModalityCategory = isStudioCompat && (modalityCategory ?? modality_category ?? null)
        ? String(modalityCategory ?? modality_category).trim()
        : null;

      if (!name || !name.trim()) {
        res.status(400).json({ error: 'Nome do serviço é obrigatório' });
        return;
      }

      if (!professionalId) {
        res.status(400).json({ error: 'A seleção do profissional é obrigatória para cadastrar o serviço.' });
        return;
      }

      const prof = db.prepare('SELECT id, name FROM professionals WHERE id = ? AND tenant_id = ?').get(professionalId, tenantId) as any;
      if (!prof) {
        res.status(400).json({ error: 'Profissional selecionado não encontrado na clínica' });
        return;
      }

      // Validação de segurança: módulo de atendimento permitido para o profissional
      const availableModules = getAvailableModulesForProfessional(professionalId, tenantId);
      let targetModule: string | null = null;

      if (clinicalModule) {
        const isAllowed = availableModules.some(m => m.code === clinicalModule);
        if (!isAllowed) {
          res.status(400).json({ error: `O módulo "${clinicalModule}" não é permitido para este profissional.` });
          return;
        }
        targetModule = clinicalModule;
      } else {
        // Se profissional possui apenas 1 módulo disponível, seleciona-o automaticamente
        targetModule = availableModules.length === 1 ? availableModules[0].code : (availableModules[0]?.code || null);
      }

      const resolvedDomain: ServiceDomain = resolveServiceDomain({
        establishmentProfile,
        serviceDomain: rawRequestedDomain,
        serviceKind: resolvedKind,
        clinicalModule: targetModule
      });

      if (establishmentProfile === 'mixed' && resolvedDomain === 'clinical' && resolvedKind === 'group') {
        res.status(400).json({ error: 'Serviços clínicos em estabelecimentos mistos devem ser individuais. Selecione o segmento Studio para criar aula coletiva / turma.' });
        return;
      }

      const recNorm = isStudioCompat && (resolvedDomain === 'studio' || rawAllowedFreqs !== undefined)
        ? normalizeRecurrenceConfigForSave({
            allowRecurrence: allowRecurrence ?? allow_recurrence,
            allowedRecurrenceFrequencies: rawAllowedFreqs,
            defaultRecurrenceFrequency: rawDefaultFreq
          })
        : {
            allowRecurrenceInt: ((allowRecurrence ?? allow_recurrence) === false || (allowRecurrence ?? allow_recurrence) === 0 ? 0 : 1) as 0 | 1,
            allowedJson: null,
            defaultFrequency: null
          };

      if ('error' in recNorm && recNorm.error) {
        res.status(400).json({ error: recNorm.error });
        return;
      }

      const resolvedMinLeadTimeHours = (minLeadTimeHours !== undefined && minLeadTimeHours !== null && minLeadTimeHours !== '' && !Number.isNaN(Number(minLeadTimeHours)))
        ? Math.max(0, Number(minLeadTimeHours))
        : 2;
      const resolvedMaxAdvanceDays = (maxAdvanceDays !== undefined && maxAdvanceDays !== null && maxAdvanceDays !== '' && !Number.isNaN(Number(maxAdvanceDays)))
        ? Math.max(1, Number(maxAdvanceDays))
        : 60;

      const id = 'srv-' + uuidv4().slice(0, 8);
      const scheduleWarnings: string[] = [];
      let createdSchedules: any[] = [];

      db.transaction(() => {
        const insertStmt = db.prepare(`
          INSERT INTO services (
            id, tenant_id, professional_id, specialty_id, name, description, duration_minutes,
            buffer_minutes, price, modality, active, min_lead_time_hours, max_advance_days, cancellation_policy,
            reminder_enabled, reminder_value, reminder_unit, clinical_module,
            service_kind, default_capacity, allow_recurrence, modality_category,
            service_domain, allowed_recurrence_frequencies_json, default_recurrence_frequency
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        insertStmt.run(
          id,
          tenantId,
          professionalId,
          specialtyId || null,
          name.trim(),
          description || null,
          durationMinutes !== undefined ? Number(durationMinutes) : 50,
          bufferMinutes !== undefined ? Number(bufferMinutes) : 10,
          price !== undefined ? Number(price) : 0.0,
          modality || 'both',
          resolvedMinLeadTimeHours,
          resolvedMaxAdvanceDays,
          cancellationPolicy || null,
          reminderEnabled ? 1 : 0,
          reminderEnabled && reminderValue ? Number(reminderValue) : null,
          reminderEnabled && reminderUnit ? String(reminderUnit).toUpperCase() : 'DAYS',
          targetModule,
          resolvedKind,
          resolvedCapacity,
          recNorm.allowRecurrenceInt,
          resolvedModalityCategory,
          resolvedDomain,
          recNorm.allowedJson,
          recNorm.defaultFrequency
        );

        try {
          const normalizedCustomPrice = price !== undefined && price !== null && price !== '' ? Number(price) : null;
          const normalizedCustomDuration = durationMinutes !== undefined && durationMinutes !== null && durationMinutes !== '' ? Number(durationMinutes) : null;
          db.prepare(`
            INSERT OR REPLACE INTO professional_services (id, professional_id, service_id, custom_price, custom_duration)
            VALUES (?, ?, ?, ?, ?)
          `).run('ps-' + uuidv4().slice(0, 8), professionalId, id, normalizedCustomPrice, normalizedCustomDuration);
        } catch (_) {}

        if (resolvedKind === 'group' && rawClassSchedules.length > 0 && PackageService.isStudioCompatible(tenantId)) {
          for (const item of rawClassSchedules) {
            const out = ClassScheduleService.createSchedules(tenantId, id, item, req.user?.userId || '');
            if (out.warnings?.length) scheduleWarnings.push(...out.warnings);
          }
          createdSchedules = ClassScheduleService.listForService(tenantId, id, { includeInactive: true });
        }
      })();

      logAudit(req, 'CREATE_SERVICE', 'services', id, { name, price, professionalId, professionalName: prof.name, clinicalModule: targetModule, serviceDomain: resolvedDomain });

      const parsedCreatedRec = isStudioCompat
        ? parseServiceRecurrenceConfig({
            allow_recurrence: recNorm.allowRecurrenceInt,
            allowed_recurrence_frequencies_json: recNorm.allowedJson,
            default_recurrence_frequency: recNorm.defaultFrequency
          })
        : null;

      res.status(201).json({
        id,
        tenant_id: tenantId,
        professional_id: professionalId,
        specialty_id: specialtyId || null,
        name: name.trim(),
        description: description || null,
        duration_minutes: durationMinutes !== undefined ? Number(durationMinutes) : 50,
        buffer_minutes: bufferMinutes !== undefined ? Number(bufferMinutes) : 10,
        min_lead_time_hours: resolvedMinLeadTimeHours,
        max_advance_days: resolvedMaxAdvanceDays,
        price: price !== undefined && price !== null && price !== '' ? Number(price) : 0,
        modality: modality || 'both',
        active: 1,
        clinical_module: targetModule,
        service_kind: resolvedKind,
        default_capacity: resolvedCapacity,
        service_domain: resolvedDomain,
        allow_recurrence: recNorm.allowRecurrenceInt,
        allowed_recurrence_frequencies: parsedCreatedRec ? parsedCreatedRec.allowedFrequencies : undefined,
        default_recurrence_frequency: parsedCreatedRec ? parsedCreatedRec.defaultFrequency : null,
        modality_category: resolvedModalityCategory,
        professional_name: prof.name,
        class_schedules: createdSchedules,
        weekly_schedule_summary: buildWeeklyScheduleSummary(createdSchedules),
        schedule_warnings: scheduleWarnings,
        message: 'Serviço criado com sucesso'
      });
    } catch (err: any) {
      console.error('[ServiceController.create] Erro:', err);
      res.status(err?.status || 500).json({ error: err?.message || 'Erro ao criar serviço', ...(err?.code ? { code: err.code } : {}) });
    }
  }

  static update(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: 'Tenant não informado' });
        return;
      }

      const existing = db.prepare(`
        SELECT id, name, professional_id, clinical_module, service_kind, default_capacity, allow_recurrence,
               modality_category, service_domain, allowed_recurrence_frequencies_json, default_recurrence_frequency
        FROM services WHERE id = ? AND tenant_id = ?
      `).get(id, tenantId) as any;
      if (!existing) {
        res.status(404).json({ error: 'Serviço não encontrado' });
        return;
      }

      const establishmentProfile = getTenantEstablishmentProfile(tenantId);
      const isStudioCompat = establishmentProfile === 'studio' || establishmentProfile === 'mixed';

      const {
        professionalId, specialtyId, name, description, durationMinutes, bufferMinutes,
        price, modality, active, minLeadTimeHours, maxAdvanceDays, cancellationPolicy,
        reminderEnabled, reminderValue, reminderUnit, clinicalModule,
        serviceKind, service_kind, defaultCapacity, default_capacity, allowRecurrence, allow_recurrence,
        modalityCategory, modality_category,
        serviceDomain, service_domain,
        allowedRecurrenceFrequencies, allowed_recurrence_frequencies,
        defaultRecurrenceFrequency, default_recurrence_frequency
      } = req.body;

      const rawKind = serviceKind !== undefined ? serviceKind : service_kind;
      const rawCapacity = defaultCapacity !== undefined ? defaultCapacity : default_capacity;
      const rawRequestedDomain = serviceDomain ?? service_domain;
      const rawAllowedFreqs = allowedRecurrenceFrequencies !== undefined ? allowedRecurrenceFrequencies : allowed_recurrence_frequencies;
      const rawDefaultFreq = defaultRecurrenceFrequency !== undefined ? defaultRecurrenceFrequency : default_recurrence_frequency;

      if (!isStudioCompat) {
        if (
          rawKind === 'group' ||
          (rawCapacity !== undefined && rawCapacity !== null && rawCapacity !== '') ||
          String(rawRequestedDomain || '').trim().toLowerCase() === 'studio' ||
          (Array.isArray(rawAllowedFreqs) && rawAllowedFreqs.length > 0) ||
          (rawDefaultFreq !== undefined && rawDefaultFreq !== null && String(rawDefaultFreq).trim() !== '')
        ) {
          res.status(400).json({
            error: 'Aulas coletivas, capacidade de turma e recorrência avançada de Studio não estão disponíveis para Clínicas / Consultórios tradicionais.'
          });
          return;
        }
      }

      if (establishmentProfile === 'studio' && String(rawRequestedDomain || '').trim().toLowerCase() === 'clinical') {
        res.status(400).json({
          error: 'Estabelecimentos configurados exclusivamente como Studio não criam serviços clínicos tradicionais.'
        });
        return;
      }

      const nextKind = !isStudioCompat
        ? 'individual'
        : (rawKind !== undefined ? (rawKind === 'group' ? 'group' : 'individual') : (existing.service_kind || 'individual'));
      let nextCapacity: number | null = !isStudioCompat ? null : (existing.default_capacity ?? null);
      if (isStudioCompat && (rawKind !== undefined || rawCapacity !== undefined)) {
        if (nextKind === 'group') {
          const capNum = Number(rawCapacity !== undefined ? rawCapacity : existing.default_capacity);
          if (!Number.isInteger(capNum) || capNum < 1 || capNum > 500) {
            res.status(400).json({ error: 'Para aulas coletivas/turmas, informe um número inteiro positivo de vagas.' });
            return;
          }
          nextCapacity = capNum;
        } else {
          nextCapacity = null;
        }
      }

      const nextModCat = !isStudioCompat
        ? existing.modality_category
        : (modalityCategory !== undefined || modality_category !== undefined
            ? ((modalityCategory ?? modality_category) ? String(modalityCategory ?? modality_category).trim() : null)
            : existing.modality_category);

      if (professionalId) {
        const prof = db.prepare('SELECT id FROM professionals WHERE id = ? AND tenant_id = ?').get(professionalId, tenantId);
        if (!prof) {
          res.status(400).json({ error: 'Profissional selecionado não encontrado na clínica' });
          return;
        }
      }

      // Validação de módulo clínico no update se fornecido
      const targetProfId = professionalId || existing.professional_id;
      if (clinicalModule !== undefined && clinicalModule !== null && clinicalModule !== '') {
        const availableModules = getAvailableModulesForProfessional(targetProfId, tenantId);
        const isAllowed = availableModules.some(m => m.code === clinicalModule);
        if (!isAllowed) {
          res.status(400).json({ error: `O módulo "${clinicalModule}" não é permitido para este profissional.` });
          return;
        }
      }

      const nextDomain: ServiceDomain = resolveServiceDomain({
        establishmentProfile,
        serviceDomain: rawRequestedDomain !== undefined ? rawRequestedDomain : existing.service_domain,
        serviceKind: nextKind,
        clinicalModule: clinicalModule !== undefined ? clinicalModule : existing.clinical_module
      });

      if (establishmentProfile === 'mixed' && nextDomain === 'clinical' && nextKind === 'group') {
        res.status(400).json({ error: 'Serviços clínicos em estabelecimentos mistos devem ser individuais. Selecione o segmento Studio para criar aula coletiva / turma.' });
        return;
      }

      const rawAllowRec = allowRecurrence !== undefined ? allowRecurrence : allow_recurrence;
      let nextAllowRec: 0 | 1 = rawAllowRec !== undefined ? (rawAllowRec === false || rawAllowRec === 0 ? 0 : 1) : ((existing.allow_recurrence ?? 1) === 0 ? 0 : 1);
      let nextAllowedJson: string | null = existing.allowed_recurrence_frequencies_json ?? null;
      let nextDefaultFreq: string | null = existing.default_recurrence_frequency ?? null;

      if (!isStudioCompat) {
        nextAllowedJson = null;
        nextDefaultFreq = null;
      } else if (rawAllowRec !== undefined || rawAllowedFreqs !== undefined || rawDefaultFreq !== undefined) {
        const recNorm = normalizeRecurrenceConfigForSave({
          allowRecurrence: rawAllowRec !== undefined ? rawAllowRec : existing.allow_recurrence,
          allowedRecurrenceFrequencies: rawAllowedFreqs !== undefined ? rawAllowedFreqs : (
            typeof existing.allowed_recurrence_frequencies_json === 'string' && existing.allowed_recurrence_frequencies_json.trim()
              ? (() => { try { return JSON.parse(existing.allowed_recurrence_frequencies_json); } catch { return undefined; } })()
              : undefined
          ),
          defaultRecurrenceFrequency: rawDefaultFreq !== undefined ? rawDefaultFreq : existing.default_recurrence_frequency
        });
        if (recNorm.error) {
          res.status(400).json({ error: recNorm.error });
          return;
        }
        nextAllowRec = recNorm.allowRecurrenceInt;
        nextAllowedJson = recNorm.allowedJson;
        nextDefaultFreq = recNorm.defaultFrequency;
      }

      const updateStmt = db.prepare(`
        UPDATE services SET
          professional_id = CASE WHEN ? = 1 THEN ? ELSE professional_id END,
          specialty_id = CASE WHEN ? = 1 THEN ? ELSE specialty_id END,
          name = CASE WHEN ? = 1 THEN ? ELSE name END,
          description = CASE WHEN ? = 1 THEN ? ELSE description END,
          duration_minutes = CASE WHEN ? = 1 THEN ? ELSE duration_minutes END,
          buffer_minutes = CASE WHEN ? = 1 THEN ? ELSE buffer_minutes END,
          price = CASE WHEN ? = 1 THEN ? ELSE price END,
          modality = CASE WHEN ? = 1 THEN ? ELSE modality END,
          active = CASE WHEN ? = 1 THEN ? ELSE active END,
          min_lead_time_hours = CASE WHEN ? = 1 THEN ? ELSE min_lead_time_hours END,
          max_advance_days = CASE WHEN ? = 1 THEN ? ELSE max_advance_days END,
          cancellation_policy = CASE WHEN ? = 1 THEN ? ELSE cancellation_policy END,
          reminder_enabled = CASE WHEN ? = 1 THEN ? ELSE reminder_enabled END,
          reminder_value = CASE WHEN ? = 1 THEN ? ELSE reminder_value END,
          reminder_unit = CASE WHEN ? = 1 THEN ? ELSE reminder_unit END,
          clinical_module = CASE WHEN ? = 1 THEN ? ELSE clinical_module END,
          service_kind = ?,
          default_capacity = ?,
          allow_recurrence = ?,
          modality_category = ?,
          service_domain = ?,
          allowed_recurrence_frequencies_json = ?,
          default_recurrence_frequency = ?,
          updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ?
      `);

      updateStmt.run(
        professionalId !== undefined ? 1 : 0, professionalId || null,
        specialtyId !== undefined ? 1 : 0, specialtyId || null,
        name !== undefined ? 1 : 0, name ? name.trim() : existing.name,
        description !== undefined ? 1 : 0, description !== null ? description : null,
        durationMinutes !== undefined ? 1 : 0, durationMinutes !== undefined ? Number(durationMinutes) : 50,
        bufferMinutes !== undefined ? 1 : 0, bufferMinutes !== undefined ? Number(bufferMinutes) : 10,
        price !== undefined ? 1 : 0, price !== undefined ? Number(price) : 0,
        modality !== undefined ? 1 : 0, modality || 'both',
        active !== undefined ? 1 : 0, active ? 1 : 0,
        (minLeadTimeHours !== undefined && minLeadTimeHours !== null && minLeadTimeHours !== '' && !Number.isNaN(Number(minLeadTimeHours))) ? 1 : 0,
        (minLeadTimeHours !== undefined && minLeadTimeHours !== null && minLeadTimeHours !== '' && !Number.isNaN(Number(minLeadTimeHours))) ? Math.max(0, Number(minLeadTimeHours)) : 2,
        (maxAdvanceDays !== undefined && maxAdvanceDays !== null && maxAdvanceDays !== '' && !Number.isNaN(Number(maxAdvanceDays))) ? 1 : 0,
        (maxAdvanceDays !== undefined && maxAdvanceDays !== null && maxAdvanceDays !== '' && !Number.isNaN(Number(maxAdvanceDays))) ? Math.max(1, Number(maxAdvanceDays)) : 60,
        cancellationPolicy !== undefined ? 1 : 0, cancellationPolicy || null,
        reminderEnabled !== undefined ? 1 : 0, reminderEnabled ? 1 : 0,
        reminderValue !== undefined ? 1 : 0, reminderEnabled && reminderValue ? Number(reminderValue) : null,
        reminderUnit !== undefined ? 1 : 0, reminderEnabled && reminderUnit ? String(reminderUnit).toUpperCase() : 'DAYS',
        clinicalModule !== undefined ? 1 : 0, clinicalModule || null,
        nextKind,
        nextCapacity,
        nextAllowRec,
        nextModCat,
        nextDomain,
        nextAllowedJson,
        nextDefaultFreq,
        id,
        tenantId
      );

      if (targetProfId) {
        try {
          const existingPs = db.prepare('SELECT id, custom_price, custom_duration FROM professional_services WHERE professional_id = ? AND service_id = ?').get(targetProfId, id) as { id: string; custom_price: number | null; custom_duration: number | null } | undefined;
          const nextCustomPrice = price !== undefined && price !== null && price !== '' ? Number(price) : (existingPs ? existingPs.custom_price : null);
          const nextCustomDuration = durationMinutes !== undefined && durationMinutes !== null && durationMinutes !== '' ? Number(durationMinutes) : (existingPs ? existingPs.custom_duration : null);
          if (existingPs) {
            db.prepare('UPDATE professional_services SET custom_price = ?, custom_duration = ? WHERE id = ?').run(nextCustomPrice, nextCustomDuration, existingPs.id);
          } else if (professionalId) {
            db.prepare(`
              INSERT INTO professional_services (id, professional_id, service_id, custom_price, custom_duration)
              VALUES (?, ?, ?, ?, ?)
            `).run('ps-' + uuidv4().slice(0, 8), professionalId, id, nextCustomPrice, nextCustomDuration);
          }
        } catch (_) {}
      }

      logAudit(req, 'UPDATE_SERVICE', 'services', id, { name: name || existing.name, professionalId });
      const updatedService = db.prepare(`
        SELECT s.*, COALESCE(s.service_kind, 'individual') as service_kind, COALESCE(s.allow_recurrence, 1) as allow_recurrence,
               p.name as professional_name
        FROM services s
        LEFT JOIN professionals p ON p.id = s.professional_id
        WHERE s.id = ? AND s.tenant_id = ?
      `).get(id, tenantId) as any;
      const updatedSchedules = isStudioCompat
        ? ClassScheduleService.listForService(tenantId, String(id), { includeInactive: true })
        : [];
      const parsedUpdRec = isStudioCompat && updatedService
        ? parseServiceRecurrenceConfig(updatedService)
        : null;
      const enrichedUpdated = updatedService
        ? {
            ...updatedService,
            service_kind: isStudioCompat ? (updatedService.service_kind || 'individual') : 'individual',
            default_capacity: isStudioCompat ? updatedService.default_capacity : null,
            service_domain: resolveServiceDomain({
              establishmentProfile,
              serviceDomain: updatedService.service_domain,
              serviceKind: updatedService.service_kind,
              clinicalModule: updatedService.clinical_module
            }),
            allow_recurrence: parsedUpdRec ? (parsedUpdRec.allowRecurrence ? 1 : 0) : (updatedService.allow_recurrence ?? 1),
            allowed_recurrence_frequencies: parsedUpdRec ? parsedUpdRec.allowedFrequencies : undefined,
            default_recurrence_frequency: parsedUpdRec ? parsedUpdRec.defaultFrequency : null,
            class_schedules: updatedSchedules,
            weekly_schedule_summary: buildWeeklyScheduleSummary(updatedSchedules)
          }
        : updatedService;
      res.json({ success: true, message: 'Serviço atualizado com sucesso', service: enrichedUpdated, ...(enrichedUpdated || {}) });
    } catch (err: any) {
      console.error('[ServiceController.update] Erro:', err);
      res.status(500).json({ error: 'Erro ao atualizar serviço' });
    }
  }

  static delete(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: 'Tenant não informado' });
        return;
      }

      const service = db.prepare('SELECT id, name, active FROM services WHERE id = ? AND tenant_id = ?').get(id, tenantId) as any;
      if (!service) {
        res.status(404).json({ error: 'Serviço não encontrado' });
        return;
      }

      // Verificação de vínculos históricos antes de excluir:
      // 1. Agendamentos
      const appointmentCount = (db.prepare('SELECT COUNT(*) as count FROM appointments WHERE service_id = ? AND tenant_id = ?').get(id, tenantId) as any)?.count || 0;

      // 2. Atendimentos (consultas realizadas/em andamento ou com prontuário clínico gerado)
      const consultationCount = (db.prepare(`
        SELECT COUNT(*) as count 
        FROM appointments a
        WHERE a.service_id = ? AND a.tenant_id = ? 
          AND (a.status IN ('completed', 'in_progress') OR EXISTS (SELECT 1 FROM records r WHERE r.appointment_id = a.id))
      `).get(id, tenantId) as any)?.count || 0;

      // 3. Financeiro (pagamentos ou recibos emitidos vinculados ao serviço)
      const financialCount = (db.prepare(`
        SELECT COUNT(*) as count 
        FROM appointments a
        WHERE a.service_id = ? AND a.tenant_id = ? 
          AND (
            EXISTS (SELECT 1 FROM payments p WHERE p.appointment_id = a.id) OR 
            EXISTS (SELECT 1 FROM receipts rec WHERE rec.appointment_id = a.id)
          )
      `).get(id, tenantId) as any)?.count || 0;

      // 4. Histórico (encaminhamentos ou outros registros vinculados)
      let referralCount = 0;
      const hasReferralsTable = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='patient_referrals'").get();
      if (hasReferralsTable) {
        referralCount = (db.prepare('SELECT COUNT(*) as count FROM patient_referrals WHERE service_id = ? AND tenant_id = ?').get(id, tenantId) as any)?.count || 0;
      }

      const hasHistoricalLinks = appointmentCount > 0 || consultationCount > 0 || financialCount > 0 || referralCount > 0;

      if (hasHistoricalLinks) {
        // Se houver vínculo histórico, evitar exclusão destrutiva e preferir desativação/inativação, preservando registros antigos
        db.prepare("UPDATE services SET active = 0, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?").run(id, tenantId);

        logAudit(req, 'INACTIVATE_SERVICE', 'services', id, {
          name: service.name,
          reason: 'historical_links',
          appointmentCount,
          consultationCount,
          financialCount,
          referralCount
        });

        res.json({
          success: true,
          action: 'inactivated',
          message: 'O serviço possui vínculos históricos (agendamentos, atendimentos ou registros financeiros) e foi inativado para preservar os dados.',
          service: { id: service.id, name: service.name, active: 0 }
        });
        return;
      }

      // Se NÃO houver vínculos históricos, executar exclusão segura
      db.prepare('DELETE FROM professional_services WHERE service_id = ?').run(id);
      db.prepare('DELETE FROM services WHERE id = ? AND tenant_id = ?').run(id, tenantId);

      logAudit(req, 'DELETE_SERVICE', 'services', id, { name: service.name });

      res.json({
        success: true,
        action: 'deleted',
        message: 'Serviço excluído com sucesso.'
      });
    } catch (err: any) {
      console.error('[ServiceController.delete] Erro:', err);
      res.status(500).json({ error: 'Erro ao processar exclusão do serviço' });
    }
  }

  // Salas
  static listRooms(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const stmt = db.prepare('SELECT id, name, description, active FROM rooms WHERE tenant_id = ? ORDER BY name ASC');
      const rooms = stmt.all(tenantId);
      res.json(rooms);
    } catch (err: any) {
      console.error('[ServiceController.listRooms] Erro:', err);
      res.status(500).json({ error: 'Erro ao listar salas' });
    }
  }

  static createRoom(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const { name, description } = req.body;
      if (!name) {
        res.status(400).json({ error: 'Nome da sala é obrigatório' });
        return;
      }

      const id = 'room-' + uuidv4().slice(0, 8);
      const insertStmt = db.prepare('INSERT INTO rooms (id, tenant_id, name, description, active) VALUES (?, ?, ?, ?, 1)');
      insertStmt.run(id, tenantId, name, description || null);

      res.status(201).json({ id, name, message: 'Sala cadastrada com sucesso' });
    } catch (err: any) {
      console.error('[ServiceController.createRoom] Erro:', err);
      res.status(500).json({ error: 'Erro ao cadastrar sala' });
    }
  }
}
