import { individualStudioMeetings } from '../services/studio-individual-meetings.service';
import { BillingCycleService } from '../services/billing-cycle.service';
import { quoteFrequencyPlan } from '../services/frequency-pricing.service';
import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../config/database';
import { logAudit } from '../middlewares/audit.middleware';
import { PackageService } from '../services/package.service';
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
import { calculateAvailableSlots } from '../utils/slot-calculator';
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

      const contracts = PackageService.listContracts(tenantId, {
        studentId,
        status,
        professionalId: professionalFilter
      });

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

      const contracts = PackageService.listContracts(tenantId, { studentId });
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

      const contract = PackageService.getContractById(tenantId, contractId);
      if (!contract) {
        res.status(404).json({ error: 'Contratação de pacote não encontrada.' });
        return;
      }

      if (req.user.role === 'professional' && !canAccessPatient(req.user.userId, tenantId, contract.student_id, 'appointments')) {
        res.status(403).json({ error: 'Sem permissão para visualizar este contrato.' });
        return;
      }

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
      const { tenantSlug, bookingSequence, serviceId, date, professionalId, includeUpcoming, startDate } = req.query;
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
        SELECT id, name, COALESCE(service_kind, 'individual') as service_kind, default_capacity,
               duration_minutes, price, COALESCE(allow_recurrence, 1) as allow_recurrence,
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

      const recCfg = parseServiceRecurrenceConfig(srv);

      const reqProfId = typeof professionalId === 'string' && professionalId.trim() ? professionalId.trim() : 'any';
      const professionals = getLinkedPublicProfessionals(tenant.id, srv.id, reqProfId);
      const allLinkedProfs = getLinkedPublicProfessionals(tenant.id, srv.id, 'any');
      const allowedModalities = getAllowedConcreteModalities(srv.modality, true);
      const wantDate = typeof date === 'string' && date.trim() ? date.trim() : null;
      const wantUpcoming = !wantDate || includeUpcoming === '1' || includeUpcoming === 'true';

      if (srv.service_kind === 'group') {
        const weeklySchedules = ClassScheduleService.listForService(tenant.id, srv.id, {
          includeInactive: false,
          publicOnly: true
        });
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

        if (wantDate) {
          dayResult = ClassScheduleService.getScheduledSlotsForDate({
            tenantId: tenant.id,
            serviceRow: srv,
            dateStr: wantDate,
            professionalId: reqProfId,
            externalBusyByProf: targetDateBusyByProf,
            publicOnly: true
          });
        }

        const upcomingStart =
          typeof startDate === 'string' && validBookingDate(startDate) ? startDate : todayBrazilYmd();
        const upcomingSlots = wantUpcoming
          ? ClassScheduleService.getUpcomingOccurrencesForService({
              tenantId: tenant.id,
              serviceRow: srv,
              professionalId: reqProfId,
              startDate: upcomingStart,
              daysAhead: 21,
              limit: 24,
              externalBusyByProfAndDate: extBusyByProfDate,
              publicOnly: true
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
          defaultCapacity: srv.default_capacity || 1,
          allowRecurrence: recCfg.allowRecurrence,
          allowedRecurrenceFrequencies: recCfg.allowedFrequencies,
          allowedRecurrenceWeekdays: recCfg.allowedWeekdays,
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
          emptyReason: ClassScheduleService.explainEmptyPublicAvailability({
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

      const restrictWeekdays = recCfg.allowedFrequencies.includes('custom_weekdays') && recCfg.allowedWeekdays.length > 0
        ? new Set(recCfg.allowedWeekdays)
        : null;
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
            externalBusy
          );

          for (const s of profSlots) {
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
              serviceKind: 'individual',
              capacity: 1,
              enrolledCount: 0,
              remainingSpots: 1,
              isFull: false,
              statusLabel: 'Disponível'
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
        typeof startDate === 'string' && validBookingDate(startDate) ? startDate : todayBrazilYmd();
      const rawUpcomingSlots = wantUpcoming
        ? ClassScheduleService.getUpcomingOccurrencesForService({
            tenantId: tenant.id,
            serviceRow: srv,
            professionalId: reqProfId,
            startDate: upcomingStart,
            daysAhead: 14,
            limit: 30,
            publicOnly: true
          })
        : [];
      const upcomingSlots = restrictWeekdays
        ? rawUpcomingSlots.filter((u: any) => restrictWeekdays.has(Number(u.dayOfWeek)))
        : rawUpcomingSlots;

      res.json({
        date: wantDate,
        serviceId: srv.id,
        serviceKind: srv.service_kind,
        serviceModality: srv.modality || 'presential',
        availabilityMode: (srv as any).availability_mode || 'professional_schedule',
        allowedModalities,
        defaultCapacity: srv.default_capacity || 1,
        allowRecurrence: recCfg.allowRecurrence,
        allowedRecurrenceFrequencies: recCfg.allowedFrequencies,
        allowedRecurrenceWeekdays: recCfg.allowedWeekdays,
        defaultRecurrenceFrequency: recCfg.defaultFrequency,
        allowedPlanDurations: recCfg.allowedPlanDurations,
        defaultPlanDuration: recCfg.defaultPlanDuration,
        customRecurrenceIntervals: recCfg.customIntervals,
        defaultRecurrenceInterval: recCfg.defaultCustomInterval,
        professionals: allLinkedProfs,
        weeklyMeetings: req.query.includeWeekly === '1' ? individualStudioMeetings({ tenantId: tenant.id, serviceId: srv.id, professionalIds: reqProfId && reqProfId !== 'any' ? [reqProfId] : undefined, startDate: wantDate || upcomingStart, publicOnly: true }) : [],
        weeklySchedules: [],
        weeklySummary: [],
        totalAvailable: mergedSlots.length,
        slots: mergedSlots,
        upcomingSlots,
        ...(wantDate && !wantDateAllowed
          ? { emptyReason: 'Esta aula é oferecida apenas nos dias da semana configurados pelo instrutor. Escolha outro dia.' }
          : wantDate && mergedSlots.length === 0
          ? { emptyReason: 'Não há horários ou vagas disponíveis para esta data. Experimente outro dia.' }
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
        recurrence
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
        durationCode: recurrence?.durationCode ?? recurrence?.planDurationCode ?? null,
        seriesMode: recurrence?.seriesMode ?? null,
        scheduleEntries: Array.isArray(recurrence?.scheduleEntries) ? recurrence.scheduleEntries : undefined,
        weekdays: Array.isArray(recurrence?.weekdays) ? recurrence.weekdays : undefined,
        endDate: recurrence?.endDate ? String(recurrence.endDate).slice(0, 10) : undefined,
        maxOccurrences: recurrence?.maxOccurrences !== undefined ? Number(recurrence.maxOccurrences) : undefined,
        publicOnly: true,
        isCustomTime: false,
        ignoreFirstLeadTime: false
      });

      let pricing = null;
      if (preview.valid && req.body.bookingIntent === 'recurring') {
        const service = db.prepare('SELECT billing_mode, pricing_rule, frequency_pricing_json FROM services WHERE id = ? AND tenant_id = ?').get(String(serviceId), tenant.id) as any;
        const quote = quoteFrequencyPlan({ tenantId: tenant.id, serviceId: String(serviceId), billingFrequency: service?.billing_mode,
          startDate: resolvedDate, endDate: resolvePlanDurationEndDate(resolvedDate, recurrence?.durationCode) || recurrence?.endDate || preview.occurrences.at(-1)?.date,
          slots: preview.occurrences, cadence: preview.frequency, publicOnly: true, includeStandardPricing: true });
        if (quote) pricing = {
          amount: quote.calculation.effectivePrice,
          averagePricePerSession: quote.calculation.averagePricePerSession,
          weeklyCount: quote.weeklyCount,
          billingFrequency: quote.billingFrequency,
          cycleMonths: quote.calculation.cycleMonths,
          pricingRule: quote.pricingRule,
          referenceSessionsCount: quote.calculation.referenceSessionsCount
        };
      }
      res.json({ ...preview, ...(req.body.bookingIntent === 'recurring' ? { pricing } : {}) });
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
