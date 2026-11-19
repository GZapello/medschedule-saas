import { individualStudioMeetings } from '../services/studio-individual-meetings.service';
import { BillingCycleService } from '../services/billing-cycle.service';
import { quoteFrequencyPlan } from '../services/frequency-pricing.service';
import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../config/database';
import { logAudit } from '../middlewares/audit.middleware';
import { PackageService } from '../services/package.service';
import { resolveEnrollmentViewerPermissions } from './studio-access.controller';
import { canAccessPatient } from '../services/patient-sharing.service';
import { canOperate } from '../services/billing.service';
import { NotificationService } from '../services/notification.service';
import { InternalNotificationService } from '../services/internal-notification.service';
import { PublicBookingRequestService } from '../services/public-booking-request.service';
import { GoogleCalendarService } from '../services/google-calendar.service';
import {
  generateRecurrenceDates,
  generateSchedulePlanOccurrences,
  resolveOrCreateGroupOccurrenceTx,
  SchedulePlanEntryInput
} from '../services/class-group.service';
import { ClassScheduleService, buildWeeklyScheduleSummary, todayBrazilYmd, addDaysYmd } from '../services/class-schedule.service';
import { evaluateRecurrenceSeriesWithExternalBusy } from '../services/recurrence.service';
import {
  getAllowedConcreteModalities,
  resolveConcreteModality,
  sanitizeBookingErrorMessage
} from '../utils/modality-resolver';
import { resolveBookingTenant, publicBookingProfessional, professionalBookingService, validBookingDate } from '../utils/public-booking';
import { calculateAvailableSlots, explainEmptySlots } from '../utils/slot-calculator';
import { bookingTime } from '../utils/booking-time';
import { validateBrazilianPhone, normalizePhoneWithDDI } from '../utils/phone.utils';
import { isPrimaryClinicalModule, resolveClinicalModule } from '../utils/clinical-module';
import {
  MAX_PUBLIC_RECURRENCE_OCCURRENCES,
  parseServiceRecurrenceConfig,
  PlanDurationCode,
  RecurrenceFrequency,
  RecurrenceIntervalUnit,
  validateServiceRecurrenceFrequency, resolvePlanDurationEndDate
} from '../utils/establishment-context';
import {
  addonAppliesToBaseOption,
  calculateCommercialOptionBreakdown,
  normalizeCommercialPriceOptions,
  normalizeOptionalAddonsConfig,
  resolveOptionCreditPlan,
  StudioOptionalAddonOption
} from '../utils/studio-access-and-commercial';
import { calculateStudioRecurringPrice } from '../utils/studio-pricing';
import { readFrequencyPricing } from '../utils/studio-frequency-pricing';

function getOwnProfessionalIds(userId: string, tenantId: string): string[] {
  const rows = db.prepare(`
    SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ? AND active = 1
  `).all(userId, tenantId) as { id: string }[];
  return rows.map(r => r.id);
}

function getLinkedPublicProfessionals(tenantId: string, serviceId: string, preferredProfId?: string): Array<{
  id: string;
  name: string;
  photo_url: string | null;
  profession_name: string | null;
  profession_id: string | null;
}> {
  let extraFilter = '';
  if (preferredProfId && preferredProfId !== 'any') {
    extraFilter = ' AND p.id = ?';
  }
  return db.prepare(`
    SELECT DISTINCT p.id, p.name, p.photo_url, COALESCE(pr.name, '') as profession_name, p.profession_id
    FROM professionals p
    LEFT JOIN professions pr ON pr.id = p.profession_id
    LEFT JOIN professional_services ps ON ps.professional_id = p.id AND ps.service_id = ?
    JOIN services s ON s.id = ? AND s.tenant_id = p.tenant_id
    WHERE p.tenant_id = ?
      AND p.active = 1
      AND p.public_booking_enabled = 1
      AND s.active = 1
      AND (
        s.professional_id = p.id
        OR ps.professional_id = p.id
        OR EXISTS (
          SELECT 1 FROM class_schedules cs
          WHERE cs.service_id = s.id AND cs.tenant_id = p.tenant_id AND cs.professional_id = p.id AND cs.active = 1
        )
      )
      ${extraFilter}
    ORDER BY p.name ASC
  `).all(serviceId, serviceId, tenantId, ...(preferredProfId && preferredProfId !== 'any' ? [preferredProfId] : [])) as any[];
}

function computeClockOffsetEnd(startClock: string, durationMinutes: number): string {
  const [sh, sm] = startClock.slice(0, 5).split(':').map(Number);
  const total = (sh * 60 + sm) + Math.max(5, durationMinutes || 50);
  const eh = Math.floor(total / 60) % 24;
  const em = total % 60;
  return `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}:00`;
}

export class PackageController {
  // =========================================================================
  // CATÁLOGO DE PACOTES (STUDIO / ESTABELECIMENTO MISTO)
  // =========================================================================

  static listCatalog(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(401).json({ error: 'Estabelecimento não identificado.' });
        return;
      }

      const profile = PackageService.getTenantProfile(tenantId);
      const compatible = profile === 'studio' || profile === 'mixed';
      const includeInactive = req.query.includeInactive === '1' || req.query.includeInactive === 'true';

      if (!compatible) {
        res.json({
          establishmentProfile: profile,
          isStudioCompatible: false,
          packages: []
        });
        return;
      }

      const packages = PackageService.listCatalogPackages(tenantId, { includeInactive });
      res.json({
        establishmentProfile: profile,
        isStudioCompatible: true,
        packages
      });
    } catch (err: any) {
      console.error('[PackageController.listCatalog] Erro:', err);
      res.status(err?.status || 500).json({ error: err?.message || 'Erro ao listar pacotes do catálogo.' });
    }
  }

  static createPackage(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!tenantId || !req.user) {
        res.status(401).json({ error: 'Autenticação necessária.' });
        return;
      }

      const created = PackageService.createPackage(tenantId, req.body || {}, req.user.userId);
      logAudit(req, 'CREATE_SERVICE_PACKAGE', 'service_packages', created?.id || null, {
        name: created?.name,
        billingType: created?.billing_type,
        creditMode: created?.credit_mode,
        price: created?.price
      });

      res.status(201).json({
        message: 'Pacote de serviços criado com sucesso!',
        package: created
      });
    } catch (err: any) {
      console.error('[PackageController.createPackage] Erro:', err);
      res.status(err?.status || 500).json({ error: err?.message || 'Erro ao criar pacote de serviços.' });
    }
  }

  static updatePackage(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const packageId = String(req.params.id || '');
      if (!tenantId || !req.user || !packageId) {
        res.status(400).json({ error: 'Parâmetros obrigatórios ausentes.' });
        return;
      }

      const updated = PackageService.updatePackage(tenantId, packageId, req.body || {});
      logAudit(req, 'UPDATE_SERVICE_PACKAGE', 'service_packages', packageId, {
        name: updated?.name,
        price: updated?.price,
        active: updated?.active
      });

      res.json({
        message: 'Pacote atualizado com sucesso! Contratações anteriores foram preservadas.',
        package: updated
      });
    } catch (err: any) {
      console.error('[PackageController.updatePackage] Erro:', err);
      res.status(err?.status || 500).json({ error: err?.message || 'Erro ao atualizar pacote.' });
    }
  }

  static deactivatePackage(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const packageId = String(req.params.id || '');
      if (!tenantId || !req.user || !packageId) {
        res.status(400).json({ error: 'Parâmetros obrigatórios ausentes.' });
        return;
      }

      const updated = PackageService.updatePackage(tenantId, packageId, { active: false });
      logAudit(req, 'DEACTIVATE_SERVICE_PACKAGE', 'service_packages', packageId, { active: 0 });
      res.json({
        message: 'Pacote inativado no catálogo. Matrículas já contratadas permanecem preservadas.',
        package: updated
      });
    } catch (err: any) {
      console.error('[PackageController.deactivatePackage] Erro:', err);
      res.status(err?.status || 500).json({ error: err?.message || 'Erro ao inativar pacote.' });
    }
  }

  // =========================================================================
  // CONTRATAÇÕES / MATRÍCULAS DE PACOTES DOS ALUNOS
  // =========================================================================

  static listContracts(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!tenantId || !req.user) {
        res.status(401).json({ error: 'Autenticação necessária.' });
        return;
      }

      const studentId = req.query.studentId ? String(req.query.studentId) : undefined;
      const status = req.query.status ? String(req.query.status) : undefined;

      let professionalFilter: string | undefined;
      if (req.user.role === 'professional') {
        const ownIds = getOwnProfessionalIds(req.user.userId, tenantId);
        professionalFilter = ownIds[0] || '__none__';
      }

      const viewerPerms = resolveEnrollmentViewerPermissions(req, tenantId);
      const redactPkg = (c: any) =>
        viewerPerms.canViewFinancial
          ? c
          : {
              ...c,
              contracted_price: null,
              total_contract_amount: null,
              payment_status: null,
              due_day_snapshot: null,
              billing_frequency_snapshot: null,
              payment_periodicity_snapshot: null,
              payments: []
            };

      const contracts = PackageService.listContracts(tenantId, {
        studentId,
        status,
        professionalId: professionalFilter
      }).map(redactPkg);

      res.json({ contracts });
    } catch (err: any) {
      console.error('[PackageController.listContracts] Erro:', err);
      res.status(err?.status || 500).json({ error: err?.message || 'Erro ao listar pacotes contratados.' });
    }
  }

  static listStudentContracts(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const studentId = String(req.params.patientId || '');
      if (!tenantId || !req.user || !studentId) {
        res.status(400).json({ error: 'Aluno ou estabelecimento não informado.' });
        return;
      }

      const pat = db.prepare(`SELECT id FROM patients WHERE id = ? AND tenant_id = ?`).get(studentId, tenantId);
      if (!pat) {
        res.status(404).json({ error: 'Aluno/paciente não encontrado neste estabelecimento.' });
        return;
      }

      if (req.user.role === 'professional' && !canAccessPatient(req.user.userId, tenantId, studentId, 'appointments')) {
        res.status(403).json({ error: 'Sem permissão para visualizar os pacotes deste aluno.' });
        return;
      }

      const viewerPerms = resolveEnrollmentViewerPermissions(req, tenantId);
      const rawContracts = PackageService.listContracts(tenantId, { studentId });
      const contracts = viewerPerms.canViewFinancial
        ? rawContracts
        : rawContracts.map((c: any) => ({
            ...c,
            contracted_price: null,
            total_contract_amount: null,
            payment_status: null,
            due_day_snapshot: null,
            billing_frequency_snapshot: null,
            payment_periodicity_snapshot: null,
            payments: []
          }));
      res.json({ contracts });
    } catch (err: any) {
      console.error('[PackageController.listStudentContracts] Erro:', err);
      res.status(err?.status || 500).json({ error: err?.message || 'Erro ao listar pacotes do aluno.' });
    }
  }

  static getContract(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const contractId = String(req.params.id || '');
      if (!tenantId || !req.user || !contractId) {
        res.status(400).json({ error: 'Parâmetros obrigatórios ausentes.' });
        return;
      }

      const rawContract = PackageService.getContractById(tenantId, contractId);
      if (!rawContract) {
        res.status(404).json({ error: 'Contratação de pacote não encontrada.' });
        return;
      }

      if (req.user.role === 'professional' && !canAccessPatient(req.user.userId, tenantId, rawContract.student_id, 'appointments')) {
        res.status(403).json({ error: 'Sem permissão para visualizar este contrato.' });
        return;
      }

      const viewerPerms = resolveEnrollmentViewerPermissions(req, tenantId);
      const contract = viewerPerms.canViewFinancial
        ? rawContract
        : {
            ...rawContract,
            contracted_price: null,
            total_contract_amount: null,
            payment_status: null,
            due_day_snapshot: null,
            billing_frequency_snapshot: null,
            payment_periodicity_snapshot: null,
            payments: []
          };

      const ledger = db.prepare(`
        SELECT l.*, a.start_time as appointment_start_time, s.name as service_name
        FROM package_usage_ledger l
        LEFT JOIN appointments a ON a.id = l.appointment_id
        LEFT JOIN services s ON s.id = a.service_id
        WHERE l.contract_id = ? AND l.tenant_id = ?
        ORDER BY l.created_at DESC
        LIMIT 100
      `).all(contractId, tenantId);

      res.json({ contract, ledger });
    } catch (err: any) {
      console.error('[PackageController.getContract] Erro:', err);
      res.status(err?.status || 500).json({ error: err?.message || 'Erro ao buscar detalhes do contrato.' });
    }
  }

  static createContract(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!tenantId || !req.user) {
        res.status(401).json({ error: 'Autenticação necessária.' });
        return;
      }

      const {
        packageId,
        studentId,
        startDate,
        endDate,
        dueDay,
        paymentMethod,
        contractStatus,
        paymentStatus,
        installmentsCount,
        notes,
        generateInitialCharge
      } = req.body || {};

      if (!packageId || !studentId) {
        res.status(400).json({ error: 'Pacote e aluno são obrigatórios.' });
        return;
      }

      const contract = db.transaction(() => PackageService.createContractTx({
        tenantId,
        packageId: String(packageId),
        studentId: String(studentId),
        startDate: startDate ? String(startDate).slice(0, 10) : undefined,
        endDate: endDate ? String(endDate).slice(0, 10) : undefined,
        dueDay: dueDay ? Number(dueDay) : undefined,
        paymentMethod: paymentMethod ? String(paymentMethod) : 'pix',
        origin: 'admin',
        contractStatus: contractStatus || 'active',
        paymentStatus: paymentStatus || 'pending',
        installmentsCount: installmentsCount ? Number(installmentsCount) : undefined,
        notes: typeof notes === 'string' ? notes : null,
        generateInitialCharge: generateInitialCharge !== false,
        createdBy: req.user!.userId
      }))();

      logAudit(req, 'CREATE_PACKAGE_CONTRACT', 'student_package_contracts', contract?.id || null, {
        packageId,
        studentId,
        contractStatus: contract?.contract_status,
        paymentStatus: contract?.payment_status
      });

      res.status(201).json({
        message: 'Pacote contratado com sucesso para o aluno!',
        contract
      });
    } catch (err: any) {
      console.error('[PackageController.createContract] Erro:', err);
      res.status(err?.status || 500).json({ error: err?.message || 'Erro ao contratar pacote para o aluno.' });
    }
  }

  static updateContractStatus(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const contractId = String(req.params.id || '');
      const { contractStatus, markFirstPaymentPaid, paymentMethod } = req.body || {};

      if (!tenantId || !req.user || !contractId) {
        res.status(400).json({ error: 'Parâmetros obrigatórios ausentes.' });
        return;
      }

      const validStatuses = ['requested', 'confirmed', 'active', 'suspended', 'expired', 'cancelled'];
      if (!validStatuses.includes(String(contractStatus))) {
        res.status(400).json({ error: 'Status de contrato inválido.' });
        return;
      }

      const existing = db.prepare(`SELECT * FROM student_package_contracts WHERE id = ? AND tenant_id = ?`).get(contractId, tenantId) as any;
      if (!existing) {
        res.status(404).json({ error: 'Contrato de pacote não encontrado.' });
        return;
      }

      db.transaction(() => {
        db.prepare(`
          UPDATE student_package_contracts
          SET contract_status = ?,
              confirmed_by = CASE WHEN ? IN ('confirmed', 'active') AND confirmed_by IS NULL THEN ? ELSE confirmed_by END,
              confirmed_at = CASE WHEN ? IN ('confirmed', 'active') AND confirmed_at IS NULL THEN datetime('now') ELSE confirmed_at END,
              updated_at = datetime('now')
          WHERE id = ? AND tenant_id = ?
        `).run(contractStatus, contractStatus, req.user!.userId, contractStatus, req.user!.userId, contractId, tenantId);

        if (existing.recurring_plan_id) {
          const planStatus = contractStatus === 'active'
            ? 'active'
            : (contractStatus === 'suspended' ? 'paused' : (contractStatus === 'cancelled' || contractStatus === 'expired' ? 'cancelled' : null));
          if (planStatus) {
            db.prepare(`UPDATE recurring_billing_plans SET status = ?, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?`).run(
              planStatus,
              existing.recurring_plan_id,
              tenantId
            );
          }
        }

        if (markFirstPaymentPaid) {
          const openPay = db.prepare(`
            SELECT id FROM payments
            WHERE package_contract_id = ? AND tenant_id = ? AND status = 'pending'
            ORDER BY COALESCE(due_date, created_at) ASC LIMIT 1
          `).get(contractId, tenantId) as { id: string } | undefined;

          if (openPay) {
            db.prepare(`
              UPDATE payments
              SET status = 'paid',
                  payment_method = COALESCE(?, payment_method),
                  payment_date = COALESCE(payment_date, datetime('now'))
              WHERE id = ? AND tenant_id = ?
            `).run(paymentMethod || 'pix', openPay.id, tenantId);
            PackageService.activateContractOnPaymentSettled(tenantId, openPay.id, req.user!.userId);
          }
        }
      })();

      logAudit(req, 'UPDATE_PACKAGE_CONTRACT_STATUS', 'student_package_contracts', contractId, {
        from: existing.contract_status,
        to: contractStatus,
        markFirstPaymentPaid: Boolean(markFirstPaymentPaid)
      });

      const updated = PackageService.getContractById(tenantId, contractId);
      res.json({
        message: 'Status do pacote atualizado com sucesso.',
        contract: updated
      });
    } catch (err: any) {
      console.error('[PackageController.updateContractStatus] Erro:', err);
      res.status(err?.status || 500).json({ error: err?.message || 'Erro ao atualizar status do contrato.' });
    }
  }

  // =========================================================================
  // AGENDAMENTO PÚBLICO ESPECÍFICO PARA STUDIOS
  // =========================================================================

  static async getPublicStudioSlots(req: Request, res: Response): Promise<void> {
    try {
      const { tenantSlug, bookingSequence, serviceId, date, professionalId, includeUpcoming, startDate, baseServiceId, addonOptionId, baseCommercialOptionId } = req.query;
      const tenant = resolveBookingTenant(tenantSlug, bookingSequence);
      if (!tenant || tenant.public_booking_enabled !== 1) {
        res.status(404).json({ error: 'Agendamento online indisponível.' });
        return;
      }

      if (!PackageService.isStudioCompatible(tenant.id)) {
        res.status(404).json({ error: 'Este estabelecimento utiliza o fluxo padrão de agendamentos.' });
        return;
      }

      if (!serviceId) {
        res.status(400).json({ error: 'Informe um serviço válido.' });
        return;
      }

      if (date !== undefined && String(date).trim() !== '' && !validBookingDate(date)) {
        res.status(400).json({ error: 'Informe uma data válida no formato YYYY-MM-DD.' });
        return;
      }

      const srv = db.prepare(`
        SELECT id, name, COALESCE(service_kind, 'individual') as service_kind,
               COALESCE(studio_service_type, CASE WHEN COALESCE(service_kind, 'individual') = 'group' THEN 'group' ELSE 'individual' END) as studio_service_type,
               COALESCE(requires_appointment, 1) as requires_appointment,
               default_capacity,
               duration_minutes, buffer_minutes, min_lead_time_hours, max_advance_days,
               price, COALESCE(allow_recurrence, 1) as allow_recurrence,
               allowed_recurrence_frequencies_json, allowed_recurrence_weekdays_json, default_recurrence_frequency,
               custom_recurrence_intervals_json, default_recurrence_interval_json,
               modality, modality_category, allowed_plan_durations_json, default_plan_duration, service_domain,
               clinical_module, COALESCE(availability_mode, 'professional_schedule') as availability_mode
        FROM services
        WHERE id = ? AND tenant_id = ? AND active = 1
      `).get(String(serviceId), tenant.id) as any;

      if (!srv) {
        res.status(404).json({ error: 'Serviço ou aula não encontrada.' });
        return;
      }

      if (
        Number(srv.requires_appointment ?? 1) === 0 ||
        srv.studio_service_type === 'facility_access' ||
        srv.studio_service_type === 'non_scheduled'
      ) {
        res.json({
          date: typeof date === 'string' && date.trim() ? date.trim() : null,
          serviceId: srv.id,
          serviceKind: srv.service_kind,
          studioServiceType: srv.studio_service_type,
          requiresAppointment: false,
          serviceModality: srv.modality || 'presential',
          allowedModalities: getAllowedConcreteModalities(srv.modality, true),
          professionals: [],
          weeklySchedules: [],
          weeklySummary: [],
          totalAvailable: 0,
          slots: [],
          upcomingSlots: [],
          emptyReason: 'Este plano ou benefício não exige escolha de dia, horário ou instrutor.'
        });
        return;
      }

      let resolvedAddonOpt: StudioOptionalAddonOption | null = null;
      if (baseServiceId && addonOptionId) {
        const baseSrvRow = db
          .prepare(`SELECT id, studio_service_type, requires_appointment, commercial_price_options_json, optional_addons_json FROM services WHERE id = ? AND tenant_id = ? AND active = 1`)
          .get(String(baseServiceId), tenant.id) as {
            id: string;
            studio_service_type?: string | null;
            requires_appointment?: number | null;
            commercial_price_options_json?: string | null;
            optional_addons_json?: string | null;
          } | undefined;
        if (baseSrvRow?.optional_addons_json) {
          const addonsCfg = normalizeOptionalAddonsConfig(baseSrvRow.optional_addons_json);
          const candidateOpt = addonsCfg.options.find(
            o => o.id === String(addonOptionId) && o.active && o.allowPublicBooking !== false && o.addonServiceId === srv.id
          );
          if (candidateOpt) {
            if (baseCommercialOptionId && String(baseCommercialOptionId).trim()) {
              const baseCommOpts = normalizeCommercialPriceOptions(baseSrvRow.commercial_price_options_json, {
                studioServiceType: baseSrvRow.studio_service_type,
                requiresAppointment: baseSrvRow.requires_appointment
              });
              const matchedBaseOpt = baseCommOpts.find(o => o.id === String(baseCommercialOptionId).trim()) || null;
              if (matchedBaseOpt && !addonAppliesToBaseOption(candidateOpt, matchedBaseOpt)) {
                res.status(400).json({ error: `O complemento "${candidateOpt.label}" não está habilitado para a opção comercial selecionada.` });
                return;
              }
            }
            resolvedAddonOpt = candidateOpt;
          }
        }
      }

      const addonAllowedProIds =
        resolvedAddonOpt && Array.isArray(resolvedAddonOpt.enabledProfessionalIds) && resolvedAddonOpt.enabledProfessionalIds.length > 0
          ? resolvedAddonOpt.enabledProfessionalIds
          : null;
      const addonCapacityOverride = resolvedAddonOpt
        ? (resolvedAddonOpt.attendanceFormat === 'individual'
            ? 1
            : resolvedAddonOpt.attendanceFormat === 'duo'
              ? 2
              : resolvedAddonOpt.attendanceFormat === 'group' && resolvedAddonOpt.sessionCapacity && resolvedAddonOpt.sessionCapacity >= 2
                ? resolvedAddonOpt.sessionCapacity
                : null)
        : null;
      const addonAllowedWeekdays =
        resolvedAddonOpt && Array.isArray(resolvedAddonOpt.allowedWeekdays) && resolvedAddonOpt.allowedWeekdays.length > 0
          ? resolvedAddonOpt.allowedWeekdays
          : null;

      const recCfg = parseServiceRecurrenceConfig(srv);

      const reqProfId = typeof professionalId === 'string' && professionalId.trim() ? professionalId.trim() : 'any';
      const rawMatchedProfs = getLinkedPublicProfessionals(tenant.id, srv.id, reqProfId);
      const rawAllLinkedProfs = getLinkedPublicProfessionals(tenant.id, srv.id, 'any');
      const professionals = addonAllowedProIds
        ? rawMatchedProfs.filter(p => addonAllowedProIds.includes(p.id))
        : rawMatchedProfs;
      const allLinkedProfs = addonAllowedProIds
        ? rawAllLinkedProfs.filter(p => addonAllowedProIds.includes(p.id))
        : rawAllLinkedProfs;
      const allowedModalities = getAllowedConcreteModalities(srv.modality, true);
      const wantDate = typeof date === 'string' && date.trim() ? date.trim() : null;
      const wantUpcoming = !wantDate || includeUpcoming === '1' || includeUpcoming === 'true';

      if (srv.service_kind === 'group') {
        const rawWeeklySchedules = ClassScheduleService.listForService(tenant.id, srv.id, {
          includeInactive: false,
          publicOnly: true
        });
        const weeklySchedules = rawWeeklySchedules.filter(
          ws =>
            (!addonAllowedProIds || addonAllowedProIds.includes(ws.professional_id)) &&
            (!addonAllowedWeekdays || addonAllowedWeekdays.includes(Number(ws.day_of_week)))
        );
        const weeklySummary = buildWeeklyScheduleSummary(weeklySchedules);

        // Coleta instrutores envolvidos na grade + vinculados
        const profIdsSet = new Set<string>(professionals.map(p => p.id));
        for (const ws of weeklySchedules) {
          if (reqProfId === 'any' || ws.professional_id === reqProfId) {
            profIdsSet.add(ws.professional_id);
          }
        }
        const profIds = Array.from(profIdsSet);

        const extBusyByProfDate = new Map<string, Array<{ startMin: number; endMin: number }>>();
        const targetDateBusyByProf = new Map<string, Array<{ startMin: number; endMin: number }>>();
        if (wantDate && profIds.length > 0) {
          for (const pid of profIds) {
            try {
              const busy = await GoogleCalendarService.getBusyIntervals(tenant.id, pid, wantDate);
              const mapped = busy.map(b => ({ startMin: b.startMin, endMin: b.endMin }));
              targetDateBusyByProf.set(pid, mapped);
              extBusyByProfDate.set(`${pid}|${wantDate}`, mapped);
            } catch {
              // Falha externa nunca derruba a grade pública
            }
          }
        }

        let dayResult: {
          slots: any[];
          emptyReason: string | null;
          weeklySchedules: any[];
        } = {
          slots: [],
          emptyReason: null,
          weeklySchedules
        };

        const wantDow = wantDate
          ? new Date(Date.UTC(Number(wantDate.slice(0, 4)), Number(wantDate.slice(5, 7)) - 1, Number(wantDate.slice(8, 10)), 12, 0, 0)).getUTCDay()
          : null;
        const wantDateAllowedByAddon = !wantDate || !addonAllowedWeekdays || addonAllowedWeekdays.includes(wantDow!);

        if (wantDate && wantDateAllowedByAddon) {
          dayResult = ClassScheduleService.getScheduledSlotsForDate({
            tenantId: tenant.id,
            serviceRow: srv,
            dateStr: wantDate,
            professionalId: reqProfId,
            allowedProfessionalIds: addonAllowedProIds || undefined,
            externalBusyByProf: targetDateBusyByProf,
            publicOnly: true,
            includePendingHolds: true,
            capacityOverride: addonCapacityOverride
          });
        } else if (wantDate && !wantDateAllowedByAddon) {
          dayResult.emptyReason = 'Este complemento está disponível apenas nos dias permitidos configurados pela academia.';
        }

        const upcomingStart =
          typeof startDate === 'string' && validBookingDate(startDate) ? startDate : todayBrazilYmd(new Date(), tenant.id);
        const upcomingSlots = wantUpcoming
          ? ClassScheduleService.getUpcomingOccurrencesForService({
              tenantId: tenant.id,
              serviceRow: srv,
              professionalId: reqProfId,
              allowedProfessionalIds: addonAllowedProIds || undefined,
              allowedWeekdays: addonAllowedWeekdays || undefined,
              startDate: upcomingStart,
              daysAhead: 21,
              limit: 24,
              externalBusyByProfAndDate: extBusyByProfDate,
              publicOnly: true,
              includePendingHolds: true,
              capacityOverride: addonCapacityOverride
            })
          : [];

        const totalAvailable = dayResult.slots.filter(s => !s.isFull).length;
        const upcomingAvailable = upcomingSlots.filter(s => !s.isFull && Number(s.remainingSpots ?? 1) > 0).length;
        const fullDayReason = wantDate && dayResult.slots.length > 0 && totalAvailable === 0
          ? 'Sem vagas disponíveis nesta data. Escolha outro dia da grade semanal.'
          : null;
        const fullUpcomingReason = !wantDate && upcomingSlots.length > 0 && upcomingAvailable === 0
          ? 'Todas as turmas programadas nos próximos dias estão sem vagas no momento.'
          : null;

        res.json({
          date: wantDate,
          serviceId: srv.id,
          serviceKind: 'group',
          serviceModality: srv.modality || 'presential',
          allowedModalities,
          defaultCapacity: addonCapacityOverride || srv.default_capacity || 1,
          professionalSelectionMode: resolvedAddonOpt?.professionalSelectionMode || 'student_picks',
          attendanceFormat: resolvedAddonOpt?.attendanceFormat || 'match_service',
          allowRecurrence: recCfg.allowRecurrence,
          allowedRecurrenceFrequencies: recCfg.allowedFrequencies,
          allowedRecurrenceWeekdays: addonAllowedWeekdays || recCfg.allowedWeekdays,
          defaultRecurrenceFrequency: recCfg.defaultFrequency,
          allowedPlanDurations: recCfg.allowedPlanDurations,
          defaultPlanDuration: recCfg.defaultPlanDuration,
          customRecurrenceIntervals: recCfg.customIntervals,
          defaultRecurrenceInterval: recCfg.defaultCustomInterval,
          professionals: allLinkedProfs,
          weeklySchedules,
          weeklySummary,
          totalAvailable,
          slots: dayResult.slots,
          upcomingSlots,
          ...(wantDate && dayResult.slots.length === 0 ? { emptyReason: dayResult.emptyReason } : {}),
          ...(fullDayReason ? { emptyReason: fullDayReason } : {}),
          ...(fullUpcomingReason ? { emptyReason: fullUpcomingReason } : {}),
          ...(!wantDate && upcomingSlots.length === 0
            ? {
                emptyReason: ClassScheduleService.explainEmptyPublicAvailability({
                  tenantId: tenant.id,
                  serviceRow: srv,
                  professionalId: reqProfId,
                  startDate: upcomingStart,
                  daysAhead: 21
                })
              }
            : {})
        });
        return;
      }

      if (professionals.length === 0) {
        res.json({
          date: wantDate,
          serviceId: srv.id,
          serviceKind: srv.service_kind,
          serviceModality: srv.modality || 'presential',
          allowedModalities,
          professionals: allLinkedProfs,
          weeklySchedules: [],
          weeklySummary: [],
          totalAvailable: 0,
          slots: [],
          upcomingSlots: [],
          emptyReason: addonAllowedProIds
            ? 'Nenhum profissional habilitado para este complemento possui agenda pública ativa no momento.'
            : ClassScheduleService.explainEmptyPublicAvailability({
                tenantId: tenant.id,
                serviceRow: srv,
                professionalId: reqProfId
              })
        });
        return;
      }

      const defaultModality = allowedModalities.includes('presential')
        ? 'presential'
        : allowedModalities[0] || 'presential';

      const baseRestrictWeekdays = recCfg.allowedFrequencies.includes('custom_weekdays') && recCfg.allowedWeekdays.length > 0
        ? new Set(recCfg.allowedWeekdays)
        : null;
      const addonDaySet = addonAllowedWeekdays ? new Set(addonAllowedWeekdays) : null;
      const restrictWeekdays =
        baseRestrictWeekdays && addonDaySet
          ? new Set(Array.from(addonDaySet).filter(d => baseRestrictWeekdays.has(d)))
          : (addonDaySet || baseRestrictWeekdays);

      const wantDateAllowed = !wantDate || !restrictWeekdays || (() => {
        const [wy, wm, wd] = wantDate.split('-').map(Number);
        return restrictWeekdays.has(new Date(Date.UTC(wy, wm - 1, wd, 12, 0, 0)).getUTCDay());
      })();

      const mergedSlots: Array<any> = [];
      if (wantDate && wantDateAllowed) {
        for (const prof of professionals) {
          let externalBusy: Array<{ startMin: number; endMin: number }> = [];
          try {
            const busy = await GoogleCalendarService.getBusyIntervals(tenant.id, prof.id, wantDate);
            externalBusy = busy.map(b => ({ startMin: b.startMin, endMin: b.endMin }));
          } catch {
            externalBusy = [];
          }

          const profSlots = calculateAvailableSlots(
            tenant.id,
            prof.id,
            srv.id,
            wantDate,
            undefined,
            undefined,
            externalBusy,
            undefined,
            {
              includePendingHolds: true,
              capacityOverride: addonCapacityOverride
            }
          );

          for (const s of profSlots) {
            const effectiveCap = s.capacity ?? (addonCapacityOverride && addonCapacityOverride >= 1 ? addonCapacityOverride : 1);
            const enrolled = s.enrolledCount ?? 0;
            const remaining = s.remainingSpots ?? Math.max(0, effectiveCap - enrolled);
            if (remaining <= 0) continue;
            mergedSlots.push({
              ...s,
              date: wantDate,
              classScheduleId: null,
              endTimeClock: s.endTime.slice(11, 16),
              professionalId: prof.id,
              professionalName: prof.name,
              professionalAvatar: prof.photo_url || null,
              professionName: prof.profession_name || 'Instrutor',
              modality: defaultModality,
              serviceModality: srv.modality || 'presential',
              allowedModalities,
              serviceKind: effectiveCap >= 2 ? 'group' : 'individual',
              capacity: effectiveCap,
              enrolledCount: enrolled,
              remainingSpots: remaining,
              isFull: false,
              statusLabel: effectiveCap >= 2 ? `Disponível — ${remaining} vaga(s)` : 'Disponível'
            });
          }
        }

        mergedSlots.sort((a, b) => {
          if (a.time !== b.time) return a.time.localeCompare(b.time);
          const remA = a.remainingSpots ?? 1;
          const remB = b.remainingSpots ?? 1;
          if (remB !== remA) return remB - remA;
          return String(a.professionalName).localeCompare(String(b.professionalName));
        });
      }

      const upcomingStart =
        typeof startDate === 'string' && validBookingDate(startDate) ? startDate : todayBrazilYmd(new Date(), tenant.id);
      const rawUpcomingSlots = wantUpcoming
        ? ClassScheduleService.getUpcomingOccurrencesForService({
            tenantId: tenant.id,
            serviceRow: srv,
            professionalId: reqProfId,
            allowedProfessionalIds: addonAllowedProIds || undefined,
            allowedWeekdays: addonAllowedWeekdays || undefined,
            startDate: upcomingStart,
            daysAhead: 14,
            limit: 30,
            publicOnly: true,
            includePendingHolds: true,
            capacityOverride: addonCapacityOverride
          })
        : [];
      const upcomingSlots = restrictWeekdays
        ? rawUpcomingSlots.filter((u: any) => restrictWeekdays.has(Number(u.dayOfWeek)))
        : rawUpcomingSlots;

      res.json({
        date: wantDate,
        serviceId: srv.id,
        serviceKind: addonCapacityOverride && addonCapacityOverride >= 2 ? 'group' : srv.service_kind,
        serviceModality: srv.modality || 'presential',
        availabilityMode: (srv as any).availability_mode || 'professional_schedule',
        allowedModalities,
        defaultCapacity: addonCapacityOverride || srv.default_capacity || 1,
        professionalSelectionMode: resolvedAddonOpt?.professionalSelectionMode || 'student_picks',
        attendanceFormat: resolvedAddonOpt?.attendanceFormat || 'match_service',
        allowRecurrence: recCfg.allowRecurrence,
        allowedRecurrenceFrequencies: recCfg.allowedFrequencies,
        allowedRecurrenceWeekdays: addonAllowedWeekdays || recCfg.allowedWeekdays,
        defaultRecurrenceFrequency: recCfg.defaultFrequency,
        allowedPlanDurations: recCfg.allowedPlanDurations,
        defaultPlanDuration: recCfg.defaultPlanDuration,
        customRecurrenceIntervals: recCfg.customIntervals,
        defaultRecurrenceInterval: recCfg.defaultCustomInterval,
        professionals: allLinkedProfs,
        weeklyMeetings:
          req.query.includeWeekly === '1'
            ? individualStudioMeetings({
                tenantId: tenant.id,
                serviceId: srv.id,
                professionalIds:
                  reqProfId && reqProfId !== 'any'
                    ? [reqProfId]
                    : addonAllowedProIds || undefined,
                startDate: wantDate || upcomingStart,
                publicOnly: true,
                allowedWeekdays: addonAllowedWeekdays || undefined
              })
            : [],
        weeklySchedules: [],
        weeklySummary: [],
        totalAvailable: mergedSlots.length,
        slots: mergedSlots,
        upcomingSlots,
        ...(wantDate && !wantDateAllowed
          ? { emptyReason: 'Esta aula é oferecida apenas nos dias da semana configurados pelo instrutor. Escolha outro dia.' }
          : wantDate && mergedSlots.length === 0
          ? {
              emptyReason: (() => {
                const probeProfId = reqProfId !== 'any' ? reqProfId : (professionals[0]?.id || allLinkedProfs[0]?.id || '');
                if (probeProfId) {
                  const exp = explainEmptySlots(tenant.id, probeProfId, srv.id, wantDate);
                  if (exp?.message) return exp.message;
                }
                return 'Não há horários ou vagas disponíveis para esta data. Experimente outro dia.';
              })()
            }
          : {}),
        ...(!wantDate && upcomingSlots.length === 0
          ? {
              emptyReason: ClassScheduleService.explainEmptyPublicAvailability({
                tenantId: tenant.id,
                serviceRow: srv,
                professionalId: reqProfId,
                startDate: upcomingStart,
                daysAhead: 14
              })
            }
          : {})
      });
    } catch (err: any) {
      console.error('[PackageController.getPublicStudioSlots] Erro:', err);
      res.status(500).json({ error: 'Erro ao consultar horários e vagas do Studio.' });
    }
  }

  /**
   * POST /v1/public/studio/recurrence-preview
   * Prévia pública de datas de recorrência respeitando grade semanal, disponibilidade, bloqueios e feriados.
   */
  static async previewPublicStudioRecurrence(req: Request, res: Response): Promise<void> {
    try {
      const {
        tenantSlug,
        bookingSequence,
        serviceId,
        professionalId,
        classScheduleId,
        modality,
        startTime,
        endTime,
        startDate,
        startClock,
        endClock,
        recurrence,
        commercialOptionId,
        optionId,
        autoAdvanceFromLeadTime
      } = req.body || {};

      const tenant = resolveBookingTenant(tenantSlug, bookingSequence);
      if (!tenant || tenant.public_booking_enabled !== 1) {
        res.status(404).json({ error: 'Agendamento online indisponível neste estabelecimento.' });
        return;
      }

      if (!canOperate(tenant.id)) {
        res.status(404).json({ error: 'Agendamento online indisponível no momento.' });
        return;
      }

      if (!PackageService.isStudioCompatible(tenant.id)) {
        res.status(403).json({ error: 'Este estabelecimento não utiliza o agendamento público de Studios.' });
        return;
      }

      if (!serviceId) {
        res.status(400).json({ error: 'Informe um serviço válido.' });
        return;
      }

      let resolvedDate = startDate ? String(startDate).slice(0, 10) : '';
      let resolvedStartClock = startClock ? String(startClock).slice(0, 8) : '';
      let resolvedEndClock = endClock ? String(endClock).slice(0, 8) : undefined;

      if (startTime) {
        const normStart = bookingTime(String(startTime));
        if (!normStart || !validBookingDate(normStart.slice(0, 10))) {
          res.status(400).json({ code: 'INVALID_BOOKING_TIME', error: 'Horário inicial inválido.' });
          return;
        }
        resolvedDate = normStart.slice(0, 10);
        resolvedStartClock = normStart.slice(11, 19);
      }

      if (endTime) {
        const normEnd = bookingTime(String(endTime));
        if (normEnd) {
          resolvedEndClock = normEnd.slice(11, 19);
        }
      }

      if (!validBookingDate(resolvedDate) || !/^\d{2}:\d{2}/.test(resolvedStartClock)) {
        res.status(400).json({ code: 'INVALID_BOOKING_TIME', error: 'Informe data e horário válidos.' });
        return;
      }

      const serviceRow = db.prepare(`
        SELECT id, name, price, periodic_price, billing_mode, pricing_rule, is_price_customized,
               weekly_sessions_count, frequency_pricing_json, commercial_price_options_json,
               plan_credit_mode, plan_credits_per_cycle, default_plan_duration
        FROM services
        WHERE id = ? AND tenant_id = ? AND active = 1
      `).get(String(serviceId), tenant.id) as any;

      if (!serviceRow) {
        res.status(404).json({ error: 'Serviço não encontrado ou inativo neste estabelecimento.' });
        return;
      }

      const activeCommercialOpts = normalizeCommercialPriceOptions(serviceRow.commercial_price_options_json)
        .filter(o => o.active && o.allowPublicBooking !== false);
      const reqOptId = commercialOptionId || optionId ? String(commercialOptionId || optionId).trim() : null;
      const reqWeeklyEntriesCount = Array.isArray(recurrence?.scheduleEntries) && recurrence.scheduleEntries.length > 0
        ? recurrence.scheduleEntries.length
        : (Array.isArray(recurrence?.weekdays) && recurrence.weekdays.length > 0
            ? recurrence.weekdays.length
            : Number(serviceRow.weekly_sessions_count || 1));
      const reqDurationCode = recurrence?.durationCode ?? recurrence?.planDurationCode ?? serviceRow.default_plan_duration ?? null;

      let selectedOption = reqOptId ? activeCommercialOpts.find(o => o.id === reqOptId) || null : null;
      if (!selectedOption && req.body?.bookingIntent === 'recurring' && activeCommercialOpts.length > 0) {
        const matchDur = reqDurationCode
          ? activeCommercialOpts.filter(o => o.contractDurationCode === reqDurationCode)
          : activeCommercialOpts;
        selectedOption =
          matchDur.find(o => o.frequencyType === 'weekly' && o.frequencyCount === reqWeeklyEntriesCount) ||
          matchDur.find(o => o.frequencyCount === reqWeeklyEntriesCount) ||
          (matchDur.length === 1 ? matchDur[0] : null) ||
          (activeCommercialOpts.length === 1 ? activeCommercialOpts[0] : null);
      }

      const resolvedOptCredits = selectedOption
        ? resolveOptionCreditPlan(selectedOption, serviceRow.plan_credit_mode, serviceRow.plan_credits_per_cycle)
        : null;
      const effCreditMode = resolvedOptCredits?.creditMode ?? (serviceRow.plan_credit_mode || null);
      const effCreditsCap =
        resolvedOptCredits?.creditMode === 'fixed_credits'
          ? resolvedOptCredits.totalContractCredits
          : (effCreditMode === 'fixed_credits' && serviceRow.plan_credits_per_cycle
              ? Number(serviceRow.plan_credits_per_cycle)
              : null);

      const preview = await evaluateRecurrenceSeriesWithExternalBusy({
        tenantId: tenant.id,
        serviceId: String(serviceId),
        professionalId: professionalId ? String(professionalId) : 'any',
        classScheduleId: classScheduleId ? String(classScheduleId) : null,
        roomId: null,
        patientId: null,
        startDate: resolvedDate,
        startClock: resolvedStartClock,
        endClock: resolvedEndClock || null,
        modality: modality ?? null,
        frequency: recurrence?.frequency ?? null,
        intervalValue: recurrence?.intervalValue ?? recurrence?.interval_value ?? null,
        intervalUnit: recurrence?.intervalUnit ?? recurrence?.interval_unit ?? null,
        durationCode: reqDurationCode,
        seriesMode: recurrence?.seriesMode ?? null,
        scheduleEntries: Array.isArray(recurrence?.scheduleEntries) ? recurrence.scheduleEntries : undefined,
        weekdays: Array.isArray(recurrence?.weekdays) ? recurrence.weekdays : undefined,
        endDate: recurrence?.endDate ? String(recurrence.endDate).slice(0, 10) : undefined,
        maxOccurrences: recurrence?.maxOccurrences !== undefined ? Number(recurrence.maxOccurrences) : undefined,
        publicOnly: true,
        isCustomTime: false,
        ignoreFirstLeadTime: false,
        creditMode: effCreditMode,
        creditsPerCycle: effCreditsCap,
        autoAdvanceFromLeadTime: Boolean(autoAdvanceFromLeadTime)
      });

      let pricing: any = null;
      if (req.body?.bookingIntent === 'recurring') {
        if (selectedOption) {
          const breakdown = calculateCommercialOptionBreakdown(selectedOption, {
            sessionsInContract: preview.occurrences.length,
            servicePlanCreditMode: serviceRow.plan_credit_mode,
            servicePlanCreditsPerCycle: serviceRow.plan_credits_per_cycle
          });
          pricing = {
            source: 'commercial_option',
            commercialOptionId: selectedOption.id,
            label: selectedOption.label || serviceRow.name,
            amount: breakdown.cycleAmountReais,
            cycleAmount: breakdown.cycleAmountReais,
            contractTotal: breakdown.totalContractAmountReais,
            totalContractAmount: breakdown.totalContractAmountReais,
            monthlyEquivalent: breakdown.monthlyEquivalentReais,
            installmentAmount: breakdown.installmentAmountReais,
            installmentsCount: breakdown.installmentsCount,
            billingCyclesCount: breakdown.billingCyclesCount,
            cycleCount: breakdown.billingCyclesCount,
            paymentPeriodicity: breakdown.paymentPeriodicity,
            contractDurationCode: breakdown.contractDurationCode,
            contractMonths: breakdown.contractMonths,
            commercialUnit: breakdown.commercialUnit,
            creditMode: breakdown.creditMode,
            creditsPerCycle: breakdown.creditsPerCycle,
            totalContractCredits: breakdown.totalContractCredits,
            weeklyCap: breakdown.weeklyCap,
            averagePricePerSession:
              preview.totalCount > 0
                ? Math.round((breakdown.totalContractAmountReais / preview.totalCount) * 100) / 100
                : breakdown.unitAmountReais,
            weeklyCount: selectedOption.frequencyCount || reqWeeklyEntriesCount,
            billingFrequency:
              selectedOption.paymentPeriodicity === 'one_time' ? 'monthly' : selectedOption.paymentPeriodicity,
            cycleMonths: breakdown.paymentCycleMonths,
            pricingRule: serviceRow.pricing_rule || 'four_weeks',
            referenceSessionsCount: preview.totalCount
          };
        } else {
          const durationToBilling: Record<string, string> = {
            '1_month': 'monthly',
            '2_months': 'bimonthly',
            '3_months': 'quarterly',
            '6_months': 'semiannual',
            '12_months': 'annual',
            '24_months': 'biennial'
          };
          const effBillingFreq =
            serviceRow.billing_mode && serviceRow.billing_mode !== 'per_session'
              ? serviceRow.billing_mode
              : (reqDurationCode && durationToBilling[String(reqDurationCode)]) || 'monthly';
          let quoted: ReturnType<typeof quoteFrequencyPlan> = null;
          try {
            quoted = quoteFrequencyPlan({
              tenantId: tenant.id,
              serviceId: String(serviceId),
              billingFrequency: effBillingFreq,
              startDate: preview.startDate || resolvedDate,
              endDate: resolvePlanDurationEndDate(preview.startDate || resolvedDate, reqDurationCode) || recurrence?.endDate || preview.occurrences.at(-1)?.date,
              slots: preview.occurrences,
              cadence: preview.frequency,
              publicOnly: true,
              includeStandardPricing: true
            });
          } catch {
            quoted = null;
          }
          if (quoted) {
            pricing = {
              source: 'frequency_quote',
              amount: quoted.calculation.effectivePrice,
              cycleAmount: quoted.calculation.effectivePrice,
              monthlyEquivalent: quoted.calculation.cycleMonths
                ? Math.round((quoted.calculation.effectivePrice / quoted.calculation.cycleMonths) * 100) / 100
                : quoted.calculation.effectivePrice,
              averagePricePerSession: quoted.calculation.averagePricePerSession,
              weeklyCount: quoted.weeklyCount,
              billingFrequency: quoted.billingFrequency,
              cycleMonths: quoted.calculation.cycleMonths,
              pricingRule: quoted.pricingRule,
              referenceSessionsCount: quoted.calculation.referenceSessionsCount,
              creditMode: effCreditMode || 'fixed_credits',
              creditsPerCycle: effCreditsCap
            };
          } else {
            const calc = calculateStudioRecurringPrice({
              serviceName: serviceRow.name,
              sessionPrice: Number(serviceRow.price || 0),
              weeklySessionsCount: reqWeeklyEntriesCount,
              billingMode: effBillingFreq as any,
              pricingRule: serviceRow.pricing_rule || 'four_weeks',
              frequencyPricing: readFrequencyPricing(serviceRow.frequency_pricing_json),
              customPrice: Number(serviceRow.periodic_price) > 0 ? Number(serviceRow.periodic_price) : undefined,
              isPriceCustomized:
                serviceRow.is_price_customized !== undefined && serviceRow.is_price_customized !== null
                  ? Boolean(serviceRow.is_price_customized)
                  : undefined,
              scheduledSessionsCount: preview.occurrences.length
            });
            pricing = {
              source: 'service_billing',
              amount: calc.effectivePrice,
              cycleAmount: calc.effectivePrice,
              monthlyEquivalent: calc.cycleMonths
                ? Math.round((calc.effectivePrice / calc.cycleMonths) * 100) / 100
                : calc.effectivePrice,
              averagePricePerSession:
                preview.totalCount > 0 ? Math.round((calc.effectivePrice / preview.totalCount) * 100) / 100 : calc.averagePricePerSession,
              weeklyCount: calc.weeklySessionsCount,
              billingFrequency: effBillingFreq,
              cycleMonths: calc.cycleMonths,
              pricingRule: calc.pricingRule,
              referenceSessionsCount: calc.referenceSessionsCount,
              creditMode: effCreditMode || 'fixed_credits',
              creditsPerCycle: effCreditsCap
            };
          }
        }
      }
      res.json({ ...preview, ...(req.body?.bookingIntent === 'recurring' ? { pricing } : {}) });
    } catch (err: any) {
      console.error('[PackageController.previewPublicStudioRecurrence] Erro:', err);
      const safeMessage = sanitizeBookingErrorMessage(
        err,
        'Não foi possível calcular as datas da recorrência.'
      );
      res.status(err?.status || 500).json({
        error: safeMessage,
        ...(err?.code ? { code: err.code } : {})
      });
    }
  }

  static async createPublicStudioBooking(req: Request, res: Response): Promise<void> {
    try {
      const pending = await PublicBookingRequestService.createStudioPendingRequest(req.body);
      res.status(201).json(pending);
    } catch (err: any) {
      console.error('[PackageController.createPublicStudioBooking] Erro:', err);
      const safeMessage = sanitizeBookingErrorMessage(
        err,
        'Não foi possível concluir a reserva. Revise sua escolha e tente novamente.'
      );
      res.status(err?.status || 500).json({
        error: safeMessage,
        ...(err?.code ? { code: err.code } : {})
      });
    }
  }
}
