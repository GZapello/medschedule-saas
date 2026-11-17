import type { Request } from 'express';
import { db } from '../config/database';
import { validateModuleAccess } from '../controllers/clinical-draft.controller';
import { CapabilityService } from './capability.service';
import {
  isPrimaryClinicalModule,
  resolveClinicalModule,
  resolveProfessionalCanonicalModule
} from '../utils/clinical-module';
import { shouldUseStudioPersonalWorkflow } from '../utils/establishment-context';

export const WORKLIST_VISIBILITY_HOURS = 48;
export const WORKLIST_VISIBILITY_MS = WORKLIST_VISIBILITY_HOURS * 60 * 60 * 1000;

const CLINIC_TIMEZONE = 'America/Sao_Paulo';

function getTimezoneOffsetMs(timeZone: string, utcDate: Date): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(utcDate);
  const get = (type: string) => Number(parts.find(p => p.type === type)?.value || '0');
  const h = get('hour') === 24 ? 0 : get('hour');
  const wallAsUtc = Date.UTC(get('year'), get('month') - 1, get('day'), h, get('minute'), get('second'));
  return wallAsUtc - utcDate.getTime();
}

export function parseWorklistTimestampMs(raw: unknown, assumedZone: 'utc' | 'clinic' = 'utc'): number | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (/(Z|[+-]\d{2}:?\d{2})$/i.test(trimmed)) {
    const parsed = Date.parse(trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T'));
    return Number.isFinite(parsed) ? parsed : null;
  }

  const m = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?$/);
  if (!m) {
    const fallback = Date.parse(trimmed);
    return Number.isFinite(fallback) ? fallback : null;
  }

  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const hh = Number(m[4] || '0');
  const mm = Number(m[5] || '0');
  const ss = Number(m[6] || '0');

  if (assumedZone === 'utc') {
    return Date.UTC(y, mo - 1, d, hh, mm, ss);
  }

  const approxUtc = Date.UTC(y, mo - 1, d, hh, mm, ss);
  const offset1 = getTimezoneOffsetMs(CLINIC_TIMEZONE, new Date(approxUtc));
  const candidate = approxUtc - offset1;
  const offset2 = getTimezoneOffsetMs(CLINIC_TIMEZONE, new Date(candidate));
  return approxUtc - offset2;
}

export function formatWorklistElapsedLabel(elapsedMs: number): string {
  const totalMinutes = Math.max(0, Math.floor(elapsedMs / 60000));
  if (totalMinutes < 1) return 'Agora mesmo';
  if (totalMinutes < 60) return `há ${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hours < 24) {
    return mins > 0 ? `há ${hours}h ${mins}min` : `há ${hours}h`;
  }
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  const dayUnit = days === 1 ? 'dia' : 'dias';
  return remHours > 0 ? `há ${days} ${dayUnit} e ${remHours}h` : `há ${days} ${dayUnit}`;
}

function normalizeWorklistModule(raw?: unknown): { canonical: string; subType: 'assessment' | 'workout' | null } {
  const original = String(raw || '').trim();
  const lower = original.toLowerCase();
  if (!lower || lower === 'general' || lower === 'geral') {
    return { canonical: 'general', subType: null };
  }
  if (lower.includes('personal_assessment') || lower === 'assessment') {
    return { canonical: 'ZemdaPersonal', subType: 'assessment' };
  }
  if (lower.includes('personal_workout') || lower === 'workout') {
    return { canonical: 'ZemdaPersonal', subType: 'workout' };
  }
  const stripped = lower.replace(/^zemda[-_]?/, '');
  if (stripped === 'med' || stripped === 'medical' || stripped === 'medicina') return { canonical: 'ZemdaMed', subType: null };
  if (stripped === 'fisio' || stripped === 'physiotherapy' || stripped === 'physio') return { canonical: 'ZemdaFisio', subType: null };
  if (stripped === 'odonto' || stripped === 'dentistry' || stripped === 'dental') return { canonical: 'ZemdaOdonto', subType: null };
  if (stripped === 'nutri' || stripped === 'nutrition') return { canonical: 'ZemdaNutri', subType: null };
  if (stripped === 'to' || stripped === 'occupational_therapy' || stripped === 'occupationaltherapy') return { canonical: 'ZemdaTO', subType: null };
  if (stripped === 'fono' || stripped === 'speech' || stripped === 'speechtherapy' || stripped === 'speech_therapy') return { canonical: 'ZemdaFono', subType: null };
  if (stripped === 'psico' || stripped === 'psychology') return { canonical: 'ZemdaPsico', subType: null };
  if (stripped === 'pp' || stripped === 'psychopedagogy') return { canonical: 'ZemdaPP', subType: null };
  if (stripped === 'estetic' || stripped === 'estetica') return { canonical: 'ZemdaEstetic', subType: null };
  if (stripped === 'personal' || stripped === 'fitness') return { canonical: 'ZemdaPersonal', subType: null };
  if (isPrimaryClinicalModule(original)) return { canonical: original, subType: null };
  return { canonical: 'general', subType: null };
}

function getWorklistModuleLabel(canonical: string, subType?: 'assessment' | 'workout' | null): string {
  if (canonical === 'ZemdaPersonal') {
    if (subType === 'assessment') return 'ZemdaPersonal • Avaliação';
    if (subType === 'workout') return 'ZemdaPersonal • Treino';
    return 'ZemdaPersonal';
  }
  if (isPrimaryClinicalModule(canonical)) return canonical;
  return 'Prontuário Clínico';
}

export function dashboardWorklist(req: Request, today: string, nowOverride?: Date) {
  const tenant = req.tenantId!;
  const role = req.user?.role;
  const own = role === 'professional';
  const clinical = role === 'professional' || role === 'clinic_admin';
  const filter = own ? ' AND a.professional_id IN (SELECT id FROM professionals WHERE tenant_id = ? AND user_id = ? AND active = 1)' : '';
  const params = own ? [tenant, tenant, req.user!.userId] : [tenant];
  const serverNow = nowOverride || new Date();
  const serverNowMs = serverNow.getTime();
  const serverNowIso = serverNow.toISOString();

  const rawUnfinished = clinical ? (db.prepare(`
    SELECT
      a.id, a.patient_id, a.professional_id, a.service_id, a.room_id,
      a.start_time, a.end_time, a.attendance_start_at, a.attendance_expected_end_at, a.attendance_end_at,
      a.updated_at, a.created_at,
      a.status, a.modality, a.meeting_url, a.google_drive_url, a.clinical_module,
      a.occurrence_id, a.series_id,
      COALESCE(a.service_kind, COALESCE(s.service_kind, 'individual')) AS service_kind,
      s.service_kind AS service_catalog_kind,
      s.service_domain,
      s.clinical_module AS service_clinical_module,
      s.name AS service_name,
      s.duration_minutes,
      s.price AS service_price,
      p.full_name AS patient_name,
      p.phone AS patient_phone,
      prof.name AS professional_name,
      COALESCE(t.establishment_profile, 'clinic') AS establishment_profile
    FROM appointments a
    JOIN patients p ON p.id = a.patient_id AND p.tenant_id = a.tenant_id
    LEFT JOIN professionals prof ON prof.id = a.professional_id AND prof.tenant_id = a.tenant_id
    LEFT JOIN services s ON s.id = a.service_id AND s.tenant_id = a.tenant_id
    LEFT JOIN tenants t ON t.id = a.tenant_id
    WHERE a.tenant_id = ? ${filter} AND a.status = 'in_progress'
    ORDER BY COALESCE(a.attendance_start_at, a.start_time, a.updated_at) DESC
    LIMIT 60
  `).all(...params) as any[]) : [];

  const profModuleCache = new Map<string, string | null>();
  const getProfModule = (pid?: string | null): string | null => {
    if (!pid) return null;
    if (profModuleCache.has(pid)) return profModuleCache.get(pid) || null;
    const mod = resolveProfessionalCanonicalModule(pid, tenant);
    profModuleCache.set(pid, mod);
    return mod;
  };

  const unfinishedCandidates: any[] = [];
  for (const row of rawUnfinished) {
    const effectiveStartMs =
      parseWorklistTimestampMs(row.attendance_start_at, 'clinic') ??
      parseWorklistTimestampMs(row.start_time, 'clinic') ??
      parseWorklistTimestampMs(row.updated_at, 'utc') ??
      parseWorklistTimestampMs(row.created_at, 'utc');

    if (effectiveStartMs === null) continue;
    const ageMs = serverNowMs - effectiveStartMs;
    if (ageMs > WORKLIST_VISIBILITY_MS) {
      // Visual expiration only: never mutate, archive or delete clinical/appointment records
      continue;
    }

    const professionalModule = getProfModule(row.professional_id);
    const isStudioSession = shouldUseStudioPersonalWorkflow({
      establishmentProfile: row.establishment_profile,
      serviceDomain: row.service_domain,
      serviceKind: row.service_catalog_kind,
      appointmentServiceKind: row.service_kind,
      occurrenceId: row.occurrence_id,
      appointmentClinicalModule: row.clinical_module,
      serviceClinicalModule: row.service_clinical_module,
      professionalClinicalModule: professionalModule
    });

    let resolvedCanonical = 'general';
    if (isStudioSession) {
      resolvedCanonical = 'ZemdaPersonal';
    } else {
      const candidateMod =
        resolveClinicalModule(
          {
            id: row.id,
            service_id: row.service_id,
            professional_id: row.professional_id,
            clinical_module: row.clinical_module
          },
          tenant
        ) ||
        row.service_clinical_module ||
        row.clinical_module ||
        professionalModule ||
        'general';
      resolvedCanonical = normalizeWorklistModule(candidateMod).canonical;
    }

    const elapsedMs = Math.max(0, ageMs);
    const elapsedMinutes = Math.floor(elapsedMs / 60000);
    unfinishedCandidates.push({
      ...row,
      professional_clinical_module: professionalModule,
      is_studio_session: isStudioSession,
      resolved_module: resolvedCanonical,
      module_label: getWorklistModuleLabel(resolvedCanonical),
      item_type: 'attendance',
      status_label: 'Em andamento',
      reference_at: new Date(effectiveStartMs).toISOString(),
      elapsed_minutes: elapsedMinutes,
      elapsed_label: formatWorklistElapsedLabel(elapsedMs),
      has_draft: false,
      draft_module_type: null,
      draft_updated_at: null
    });
  }

  unfinishedCandidates.sort((a, b) => Date.parse(b.reference_at) - Date.parse(a.reference_at));
  const unfinished = unfinishedCandidates.slice(0, 20);
  const activeInProgressById = new Map<string, any>(unfinished.map(item => [String(item.id), item]));

  let drafts: any[] = [];
  if (clinical) {
    const draftFilter = own
      ? ' AND COALESCE(d.professional_id, ap.professional_id) IN (SELECT id FROM professionals WHERE tenant_id = ? AND user_id = ? AND active = 1)'
      : '';
    const draftParams = own ? [tenant, tenant, req.user!.userId] : [tenant];

    const clinicalDraftRows = db.prepare(`
      SELECT
        d.id, d.patient_id, d.professional_id, d.appointment_id, d.module_type,
        d.updated_at, d.created_at,
        p.full_name AS patient_name,
        ap.status AS appointment_status,
        ap.start_time AS appointment_start_time,
        ap.occurrence_id AS appointment_occurrence_id,
        ap.service_id AS appointment_service_id,
        COALESCE(s.name, pw.title) AS service_name,
        s.service_domain AS service_domain,
        COALESCE(ap.service_kind, s.service_kind) AS service_kind,
        s.clinical_module AS service_clinical_module,
        prof.name AS professional_name,
        COALESCE(d.professional_id, ap.professional_id) AS resolved_professional_id,
        COALESCE(t.establishment_profile, 'clinic') AS establishment_profile
      FROM clinical_drafts d
      JOIN patients p ON p.id = d.patient_id AND p.tenant_id = d.tenant_id
      LEFT JOIN tenants t ON t.id = d.tenant_id
      LEFT JOIN appointments ap ON ap.id = d.appointment_id AND ap.tenant_id = d.tenant_id
      LEFT JOIN personal_workouts pw ON pw.id = d.appointment_id AND pw.tenant_id = d.tenant_id
      LEFT JOIN services s ON s.id = ap.service_id AND s.tenant_id = d.tenant_id
      LEFT JOIN professionals prof ON prof.id = COALESCE(d.professional_id, ap.professional_id) AND prof.tenant_id = d.tenant_id
      WHERE d.tenant_id = ? ${draftFilter}
      ORDER BY d.updated_at DESC
      LIMIT 80
    `).all(...draftParams) as any[];

    let psicoDraftRows: any[] = [];
    try {
      psicoDraftRows = db.prepare(`
        SELECT
          d.id, d.patient_id, d.professional_id, d.appointment_id, 'ZemdaPsico' AS module_type,
          d.updated_at, d.created_at,
          p.full_name AS patient_name,
          ap.status AS appointment_status,
          ap.start_time AS appointment_start_time,
          ap.occurrence_id AS appointment_occurrence_id,
          ap.service_id AS appointment_service_id,
          s.name AS service_name,
          s.service_domain AS service_domain,
          COALESCE(ap.service_kind, s.service_kind) AS service_kind,
          s.clinical_module AS service_clinical_module,
          prof.name AS professional_name,
          COALESCE(d.professional_id, ap.professional_id) AS resolved_professional_id,
          COALESCE(t.establishment_profile, 'clinic') AS establishment_profile
        FROM psychology_drafts d
        JOIN patients p ON p.id = d.patient_id AND p.tenant_id = d.tenant_id
        LEFT JOIN tenants t ON t.id = d.tenant_id
        LEFT JOIN appointments ap ON ap.id = d.appointment_id AND ap.tenant_id = d.tenant_id
        LEFT JOIN services s ON s.id = ap.service_id AND s.tenant_id = d.tenant_id
        LEFT JOIN professionals prof ON prof.id = COALESCE(d.professional_id, ap.professional_id) AND prof.tenant_id = d.tenant_id
        WHERE d.tenant_id = ? ${draftFilter}
        ORDER BY d.updated_at DESC
        LIMIT 40
      `).all(...draftParams) as any[];
    } catch {
      psicoDraftRows = [];
    }

    const seenDraftKeys = new Set<string>();
    const combinedDraftRows = [...clinicalDraftRows, ...psicoDraftRows];
    const validDrafts: any[] = [];

    for (const row of combinedDraftRows) {
      if (row.appointment_status && ['completed', 'cancelled', 'no_show'].includes(String(row.appointment_status))) {
        continue;
      }

      const { canonical, subType } = normalizeWorklistModule(row.module_type);
      const dedupeKey = `${row.patient_id}:${canonical}:${subType || 'main'}:${row.appointment_id || 'none'}`;
      if (seenDraftKeys.has(dedupeKey)) continue;
      seenDraftKeys.add(dedupeKey);

      if (!validateModuleAccess(req, row.module_type, row.patient_id)) {
        continue;
      }

      const draftUpdatedMs =
        parseWorklistTimestampMs(row.updated_at, 'utc') ??
        parseWorklistTimestampMs(row.created_at, 'utc');
      if (draftUpdatedMs === null) continue;

      const ageMs = serverNowMs - draftUpdatedMs;
      if (ageMs > WORKLIST_VISIBILITY_MS) {
        // Visual expiration only: never mutate or delete saved draft data
        continue;
      }

      const refIso = new Date(draftUpdatedMs).toISOString();

      // If linked to an already-visible in_progress appointment, enrich it instead of showing a duplicate card
      if (row.appointment_id && subType !== 'workout' && activeInProgressById.has(String(row.appointment_id))) {
        const linkedAppt = activeInProgressById.get(String(row.appointment_id));
        linkedAppt.has_draft = true;
        linkedAppt.draft_module_type = canonical;
        linkedAppt.draft_updated_at = refIso;
        continue;
      }

      const isStudioDraft =
        canonical === 'ZemdaPersonal' ||
        (row.appointment_id &&
          subType !== 'workout' &&
          shouldUseStudioPersonalWorkflow({
            establishmentProfile: row.establishment_profile,
            serviceDomain: row.service_domain,
            serviceKind: row.service_kind,
            occurrenceId: row.appointment_occurrence_id,
            appointmentClinicalModule: canonical,
            serviceClinicalModule: row.service_clinical_module,
            professionalClinicalModule: getProfModule(row.resolved_professional_id)
          }));

      const elapsedMs = Math.max(0, ageMs);
      validDrafts.push({
        id: row.id,
        patient_id: row.patient_id,
        patient_name: row.patient_name,
        appointment_id: row.appointment_id || null,
        appointment_status: row.appointment_status || null,
        module_type: row.module_type,
        resolved_module: canonical,
        module_label: getWorklistModuleLabel(canonical, subType),
        draft_subtype: subType,
        service_name: row.service_name || null,
        professional_id: row.resolved_professional_id || null,
        professional_name: row.professional_name || null,
        is_studio_session: Boolean(isStudioDraft),
        item_type: 'draft',
        status_label: 'Rascunho',
        updated_at: row.updated_at,
        reference_at: refIso,
        elapsed_minutes: Math.floor(elapsedMs / 60000),
        elapsed_label: formatWorklistElapsedLabel(elapsedMs)
      });
    }

    validDrafts.sort((a, b) => Date.parse(b.reference_at) - Date.parse(a.reference_at));
    drafts = validDrafts.slice(0, 20);
  }

  let canViewExams = role === 'clinic_admin';
  if (!canViewExams && req.user?.userId && tenant) {
    const hasExamCap = CapabilityService.hasCapability(req.user.userId, tenant, 'CORE_EXAMS_RECEIVED') ||
                       CapabilityService.hasCapability(req.user.userId, tenant, 'CORE_EXAM_REQUEST');
    if (hasExamCap) {
      canViewExams = true;
    } else {
      const cu = db.prepare('SELECT permissions_json FROM clinic_users WHERE user_id = ? AND tenant_id = ?').get(req.user.userId, tenant) as any;
      if (cu?.permissions_json) {
        try {
          const perms = JSON.parse(cu.permissions_json);
          if (Array.isArray(perms) && perms.includes('view_exams')) {
            canViewExams = true;
          }
        } catch {}
      }
    }
  }

  const examWhere = `a.tenant_id = ? ${filter} AND a.status IN ('waiting', 'delayed')`;
  const exams = canViewExams ? db.prepare(`SELECT a.id, a.patient_id, p.full_name AS patient_name, a.exam_name, a.expected_date, a.status
    FROM pending_exams a JOIN patients p ON p.id = a.patient_id AND p.tenant_id = a.tenant_id
    WHERE ${examWhere} ORDER BY a.expected_date IS NULL, a.expected_date LIMIT 10`).all(...params) : [];
  const examCount = canViewExams ? (db.prepare(`SELECT COUNT(*) AS count FROM pending_exams a WHERE ${examWhere}`).get(...params) as any).count : 0;
  const appointmentReturns = db.prepare(`SELECT 
      a.id, 
      a.patient_id, 
      p.full_name AS patient_name, 
      p.phone AS patient_phone,
      p.whatsapp AS patient_whatsapp,
      a.start_time, 
      a.status,
      'appointment' AS source_type,
      NULL AS area,
      NULL AS origin_procedure_name,
      'Consulta de Retorno' AS return_type,
      prof.name AS professional_name,
      a.professional_id
    FROM appointments a 
    JOIN patients p ON p.id = a.patient_id AND p.tenant_id = a.tenant_id
    LEFT JOIN professionals prof ON prof.id = a.professional_id AND prof.tenant_id = a.tenant_id
    WHERE a.tenant_id = ? ${filter} 
      AND a.patient_notes = 'Consulta de Retorno' 
      AND a.status IN ('scheduled', 'confirmed')
    ORDER BY a.start_time
  `).all(...params) as any[];

  const esteticReturns = db.prepare(`SELECT 
      r.id, 
      r.patient_id, 
      p.full_name AS patient_name, 
      p.phone AS patient_phone,
      p.whatsapp AS patient_whatsapp,
      COALESCE(r.scheduled_date, r.next_return_date) AS start_time, 
      r.scheduled_date,
      r.status,
      'estetic_return' AS source_type,
      r.area,
      COALESCE(ep.procedure_name, 'Procedimento Estético') AS origin_procedure_name,
      CASE 
        WHEN r.touchup_required = 1 THEN 'Retoque'
        ELSE 'Avaliação pós-procedimento'
      END AS return_type,
      prof.name AS professional_name,
      r.professional_id,
      r.procedure_record_id,
      r.return_assessment,
      r.touchup_required,
      r.touchup_description
    FROM estetic_returns r 
    JOIN patients p ON p.id = r.patient_id AND p.tenant_id = r.tenant_id
    LEFT JOIN estetic_procedures ep ON ep.id = r.procedure_record_id AND ep.tenant_id = r.tenant_id
    LEFT JOIN professionals prof ON prof.id = r.professional_id AND prof.tenant_id = r.tenant_id
    WHERE r.tenant_id = ? ${own ? ' AND r.professional_id IN (SELECT id FROM professionals WHERE tenant_id = ? AND user_id = ? AND active = 1)' : ''}
      AND r.status = 'AGENDADO'
      AND COALESCE(r.scheduled_date, r.next_return_date) IS NOT NULL
    ORDER BY COALESCE(r.scheduled_date, r.next_return_date) ASC
  `).all(...params) as any[];

  const returns = [...appointmentReturns, ...esteticReturns].sort((a, b) => {
    const dateA = String(a.start_time || '');
    const dateB = String(b.start_time || '');
    return dateA.localeCompare(dateB);
  });
  const alerts = clinical ? db.prepare(`SELECT DISTINCT p.id AS patient_id, p.full_name AS patient_name, al.agent, al.reaction
    FROM patient_allergies al JOIN patients p ON p.id = al.patient_id AND p.tenant_id = al.tenant_id
    JOIN appointments a ON a.patient_id = p.id AND a.tenant_id = p.tenant_id
    WHERE a.tenant_id = ? ${filter} AND date(a.start_time) = ? AND al.status = 'active' AND al.is_no_known_allergies = 0
    ORDER BY p.full_name LIMIT 20`).all(...params, today) : [];
  const finance = role === 'clinic_admin' ? db.prepare(`SELECT
    COALESCE(SUM(CASE WHEN pay.status = 'paid' THEN pay.amount ELSE 0 END), 0) AS received,
    COALESCE(SUM(CASE WHEN pay.status IN ('pending','partial') THEN pay.amount ELSE 0 END), 0) AS pending
    FROM payments pay LEFT JOIN appointments a ON a.id = pay.appointment_id AND a.tenant_id = pay.tenant_id
    WHERE pay.tenant_id = ? AND (date(a.start_time) = ? OR date(pay.payment_date) = ?)`).get(tenant, today, today) : undefined;

  // Lembretes de contato/retorno por serviço (escopo restrito ao profissional logado)
  let serviceReminders: any[] = [];
  let serviceRemindersCount = 0;

  let profIdForReminders: string | null = null;
  const userProf = db.prepare(`
    SELECT id FROM professionals
    WHERE user_id = ? AND tenant_id = ? AND active = 1
  `).get(req.user?.userId, tenant) as any;

  if (userProf?.id) {
    profIdForReminders = userProf.id;
  } else if (role === 'clinic_admin') {
    const clinicProfs = db.prepare(`
      SELECT id FROM professionals
      WHERE tenant_id = ? AND active = 1
    `).all(tenant) as any[];
    if (clinicProfs.length === 1) {
      profIdForReminders = clinicProfs[0].id;
    }
  }

  if (profIdForReminders) {
    const sremWhere = `sr.clinic_id = ? AND sr.professional_id = ? AND sr.status IN ('PENDENTE', 'ADIADO')`;
    serviceReminders = db.prepare(`
      SELECT 
        sr.id,
        sr.clinic_id,
        sr.professional_id,
        sr.patient_id,
        sr.service_id,
        sr.appointment_id,
        sr.due_at,
        sr.status,
        sr.completed_at,
        sr.postponed_to,
        sr.notes,
        sr.created_at,
        p.full_name AS patient_name,
        p.phone AS patient_phone,
        p.whatsapp AS patient_whatsapp,
        s.name AS service_name
      FROM service_reminders sr
      JOIN patients p ON p.id = sr.patient_id AND p.tenant_id = sr.clinic_id
      JOIN services s ON s.id = sr.service_id AND s.tenant_id = sr.clinic_id
      WHERE ${sremWhere}
      ORDER BY sr.due_at ASC, sr.created_at ASC
      LIMIT 20
    `).all(tenant, profIdForReminders) as any[];

    serviceRemindersCount = (db.prepare(`
      SELECT COUNT(*) AS count
      FROM service_reminders sr
      WHERE ${sremWhere}
    `).get(tenant, profIdForReminders) as any)?.count || serviceReminders.length;
  }

  return {
    unfinished,
    drafts,
    worklistMeta: {
      serverNow: serverNowIso,
      visibilityHours: WORKLIST_VISIBILITY_HOURS
    },
    exams,
    examCount,
    returns,
    alerts,
    finance,
    serviceReminders,
    serviceRemindersCount
  };
}
