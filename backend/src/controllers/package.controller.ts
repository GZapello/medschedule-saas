import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../config/database';
import { logAudit } from '../middlewares/audit.middleware';
import { PackageService } from '../services/package.service';
import { canAccessPatient } from '../services/patient-sharing.service';
import { canOperate } from '../services/billing.service';
import { NotificationService } from '../services/notification.service';
import { GoogleCalendarService } from '../services/google-calendar.service';
import { generateRecurrenceDates, resolveOrCreateGroupOccurrenceTx } from '../services/class-group.service';
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
  RecurrenceFrequency,
  RecurrenceIntervalUnit,
  validateServiceRecurrenceFrequency
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
               allowed_recurrence_frequencies_json, default_recurrence_frequency,
               custom_recurrence_intervals_json, default_recurrence_interval_json,
               modality, modality_category
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

        res.json({
          date: wantDate,
          serviceId: srv.id,
          serviceKind: 'group',
          serviceModality: srv.modality || 'presential',
          allowedModalities,
          defaultCapacity: srv.default_capacity || 1,
          allowRecurrence: recCfg.allowRecurrence,
          allowedRecurrenceFrequencies: recCfg.allowedFrequencies,
          defaultRecurrenceFrequency: recCfg.defaultFrequency,
          customRecurrenceIntervals: recCfg.customIntervals,
          defaultRecurrenceInterval: recCfg.defaultCustomInterval,
          professionals: allLinkedProfs,
          weeklySchedules,
          weeklySummary,
          totalAvailable,
          slots: dayResult.slots,
          upcomingSlots,
          ...(wantDate && dayResult.slots.length === 0 ? { emptyReason: dayResult.emptyReason } : {}),
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

      const mergedSlots: Array<any> = [];
      if (wantDate) {
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
      const upcomingSlots = wantUpcoming
        ? ClassScheduleService.getUpcomingOccurrencesForService({
            tenantId: tenant.id,
            serviceRow: srv,
            professionalId: reqProfId,
            startDate: upcomingStart,
            daysAhead: 14,
            limit: 20,
            publicOnly: true
          })
        : [];

      res.json({
        date: wantDate,
        serviceId: srv.id,
        serviceKind: srv.service_kind,
        serviceModality: srv.modality || 'presential',
        allowedModalities,
        defaultCapacity: srv.default_capacity || 1,
        allowRecurrence: recCfg.allowRecurrence,
        allowedRecurrenceFrequencies: recCfg.allowedFrequencies,
        defaultRecurrenceFrequency: recCfg.defaultFrequency,
        customRecurrenceIntervals: recCfg.customIntervals,
        defaultRecurrenceInterval: recCfg.defaultCustomInterval,
        professionals: allLinkedProfs,
        weeklySchedules: [],
        weeklySummary: [],
        totalAvailable: mergedSlots.length,
        slots: mergedSlots,
        upcomingSlots,
        ...(wantDate && mergedSlots.length === 0
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
        weekdays: Array.isArray(recurrence?.weekdays) ? recurrence.weekdays : undefined,
        endDate: recurrence?.endDate ? String(recurrence.endDate).slice(0, 10) : undefined,
        maxOccurrences: recurrence?.maxOccurrences !== undefined ? Number(recurrence.maxOccurrences) : undefined,
        publicOnly: true,
        isCustomTime: false,
        ignoreFirstLeadTime: false
      });

      res.json(preview);
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
      const {
        tenantSlug,
        bookingSequence,
        mode, // 'service' | 'package'
        serviceId,
        professionalId,
        classScheduleId,
        modality,
        startTime,
        endTime,
        recurrence,
        packageId,
        schedules,
        student
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

      // Validação estrita dos dados do aluno (nunca busca aberta)
      const fullName = String(student?.fullName || '').trim();
      const rawPhone = String(student?.phone || student?.whatsapp || '').trim();
      const rawWhatsapp = String(student?.whatsapp || student?.phone || '').trim();
      const email = student?.email ? String(student.email).trim() : null;
      const studentNotes = student?.notes ? String(student.notes).trim() : null;

      if (!fullName || fullName.length < 2) {
        res.status(400).json({ error: 'Informe seu nome completo.' });
        return;
      }
      const phoneValidation = validateBrazilianPhone(rawPhone);
      if (!phoneValidation.valid) {
        res.status(400).json({ error: phoneValidation.error || 'Telefone/WhatsApp inválido.' });
        return;
      }
      const normalizedPhone = normalizePhoneWithDDI(rawPhone);
      const normalizedWhatsapp = validateBrazilianPhone(rawWhatsapp).valid ? normalizePhoneWithDDI(rawWhatsapp) : normalizedPhone;

      const resolveOrCreatePublicStudentTx = (): string => {
        const existing = db.prepare(`
          SELECT id, whatsapp FROM patients
          WHERE tenant_id = ?
            AND (
              replace(replace(replace(phone, '+', ''), ' ', ''), '-', '') LIKE '%' || ?
              OR replace(replace(replace(COALESCE(whatsapp, ''), '+', ''), ' ', ''), '-', '') LIKE '%' || ?
            )
          LIMIT 1
        `).get(tenant.id, normalizedPhone.slice(-11), normalizedPhone.slice(-11)) as { id: string; whatsapp?: string | null } | undefined;

        if (existing) {
          if (!existing.whatsapp && normalizedWhatsapp) {
            db.prepare(`UPDATE patients SET whatsapp = ?, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?`)
              .run(normalizedWhatsapp, existing.id, tenant.id);
          }
          return existing.id;
        }

        const newId = 'pat-' + uuidv4().slice(0, 8);
        db.prepare(`
          INSERT INTO patients (id, tenant_id, full_name, phone, whatsapp, email, notes_admin, active)
          VALUES (?, ?, ?, ?, ?, ?, ?, 1)
        `).run(newId, tenant.id, fullName, normalizedPhone, normalizedWhatsapp, email, studentNotes);
        return newId;
      };

      type ExpandedBookingItem = {
        serviceRow: any;
        preferredProfId: string;
        classScheduleId: string | null;
        requestedModality: unknown;
        startIso: string;
        endIso: string;
        isRecurrenceFollowUp: boolean;
        recurrenceMeta?: {
          frequency: RecurrenceFrequency;
          intervalValue: number | null;
          intervalUnit: RecurrenceIntervalUnit | null;
          weekdays: number[];
        } | null;
      };

      const expandScheduleItem = (item: {
        serviceId: string;
        professionalId?: string;
        classScheduleId?: string | null;
        modality?: unknown;
        startTime: string;
        endTime?: string;
        recurrence?: {
          frequency?: string;
          intervalValue?: number;
          interval_value?: number;
          intervalUnit?: RecurrenceIntervalUnit;
          interval_unit?: RecurrenceIntervalUnit;
          weekdays?: number[];
          maxOccurrences?: number;
          endDate?: string;
        };
      }): ExpandedBookingItem[] => {
        const srv = db.prepare(`
          SELECT id, name, price, duration_minutes, professional_id, COALESCE(service_kind, 'individual') as service_kind,
                 default_capacity, COALESCE(allow_recurrence, 1) as allow_recurrence,
                 allowed_recurrence_frequencies_json, default_recurrence_frequency,
                 custom_recurrence_intervals_json, default_recurrence_interval_json,
                 service_domain, modality, clinical_module
          FROM services WHERE id = ? AND tenant_id = ? AND active = 1
        `).get(item.serviceId, tenant.id) as any;

        if (!srv) {
          throw Object.assign(new Error('Serviço selecionado não está ativo neste estabelecimento.'), { status: 400 });
        }

        // Valida preventivamente a escolha de modalidade se explícita no payload
        resolveConcreteModality({
          serviceModality: srv.modality,
          requestedModality: item.modality,
          allowHome: true
        });

        const normStart = bookingTime(item.startTime);
        if (!normStart || !validBookingDate(normStart.slice(0, 10))) {
          throw Object.assign(new Error('Horário inicial inválido para o agendamento.'), { status: 400 });
        }

        const startDate = normStart.slice(0, 10);
        const startClock = normStart.slice(11, 19);
        const computedEndClock = item.endTime && bookingTime(item.endTime)
          ? bookingTime(item.endTime)!.slice(11, 19)
          : computeClockOffsetEnd(startClock, Number(srv.duration_minutes || 50));

        const preferredProfId = item.professionalId && item.professionalId !== 'any' ? String(item.professionalId) : 'any';

        let dates: string[] = [startDate];
        let recMeta: ExpandedBookingItem['recurrenceMeta'] = null;
        if (item.recurrence && (item.recurrence.maxOccurrences || item.recurrence.endDate)) {
          const recValidation = validateServiceRecurrenceFrequency(
            srv,
            item.recurrence.frequency,
            item.recurrence.intervalValue ?? item.recurrence.interval_value,
            item.recurrence.intervalUnit ?? item.recurrence.interval_unit
          );
          if (!recValidation.valid) {
            throw Object.assign(new Error(recValidation.error), { status: 400, code: recValidation.code });
          }
          const rawMax = item.recurrence.maxOccurrences !== undefined && item.recurrence.maxOccurrences !== null
            ? Number(item.recurrence.maxOccurrences)
            : undefined;
          if (rawMax !== undefined && rawMax > MAX_PUBLIC_RECURRENCE_OCCURRENCES) {
            throw Object.assign(
              new Error(`No agendamento online, o limite máximo é de ${MAX_PUBLIC_RECURRENCE_OCCURRENCES} ocorrências por série.`),
              { status: 400, code: 'RECURRENCE_LIMIT_EXCEEDED' }
            );
          }
          const weekdaysList = Array.isArray(item.recurrence.weekdays) ? item.recurrence.weekdays : [];
          dates = generateRecurrenceDates({
            startDate,
            frequency: recValidation.frequency,
            intervalValue: recValidation.intervalValue,
            intervalUnit: recValidation.intervalUnit,
            weekdays: weekdaysList.length > 0 ? weekdaysList : undefined,
            endDate: item.recurrence.endDate || undefined,
            maxOccurrences: rawMax
          });
          if (dates.length > MAX_PUBLIC_RECURRENCE_OCCURRENCES) {
            throw Object.assign(
              new Error(`O período informado excede o limite de ${MAX_PUBLIC_RECURRENCE_OCCURRENCES} ocorrências no agendamento online.`),
              { status: 400, code: 'RECURRENCE_LIMIT_EXCEEDED' }
            );
          }
          recMeta = {
            frequency: recValidation.frequency,
            intervalValue: recValidation.intervalValue,
            intervalUnit: recValidation.intervalUnit,
            weekdays: weekdaysList
          };
        }

        return dates.map((d, idx) => ({
          serviceRow: srv,
          preferredProfId,
          classScheduleId: item.classScheduleId ? String(item.classScheduleId).trim() : null,
          requestedModality: item.modality,
          startIso: `${d}T${startClock}`,
          endIso: `${d}T${computedEndClock}`,
          isRecurrenceFollowUp: idx > 0,
          recurrenceMeta: recMeta
        }));
      };

      const prefetchExternalBusy = async (items: ExpandedBookingItem[]): Promise<Map<string, Array<{ startMin: number; endMin: number }>>> => {
        const busyMap = new Map<string, Array<{ startMin: number; endMin: number }>>();
        const seenPairs = new Set<string>();
        for (const item of items) {
          const dateStr = item.startIso.slice(0, 10);
          const profIds = new Set<string>();
          for (const p of getLinkedPublicProfessionals(tenant.id, item.serviceRow.id, item.preferredProfId)) {
            profIds.add(p.id);
          }
          if (item.serviceRow.service_kind === 'group') {
            const scheds = ClassScheduleService.listForService(tenant.id, item.serviceRow.id, {
              includeInactive: false,
              publicOnly: true
            });
            for (const s of scheds) {
              if (item.preferredProfId === 'any' || s.professional_id === item.preferredProfId) {
                profIds.add(s.professional_id);
              }
            }
          }
          for (const pid of profIds) {
            const key = `${pid}|${dateStr}`;
            if (seenPairs.has(key)) continue;
            seenPairs.add(key);
            try {
              const busy = await GoogleCalendarService.getBusyIntervals(tenant.id, pid, dateStr);
              busyMap.set(key, busy.map(b => ({ startMin: b.startMin, endMin: b.endMin })));
            } catch {
              busyMap.set(key, []);
            }
          }
        }
        return busyMap;
      };

      const resolvePublicSlotTx = (
        item: ExpandedBookingItem,
        studentId: string,
        extBusyMap: Map<string, Array<{ startMin: number; endMin: number }>>
      ): {
        professionalId: string;
        classScheduleId: string | null;
        roomId: string | null;
        capacity: number;
        modality: 'presential' | 'online' | 'home';
      } => {
        if (item.serviceRow.service_kind === 'group') {
          return ClassScheduleService.validatePublicGroupSlotTx({
            tenantId: tenant.id,
            serviceRow: item.serviceRow,
            preferredProfId: item.preferredProfId,
            classScheduleId: item.classScheduleId,
            startIso: item.startIso,
            endIso: item.endIso,
            requestedModality: item.requestedModality,
            externalBusyByProfAndDate: extBusyMap,
            patientId: studentId,
            ignoreLeadTime: item.isRecurrenceFollowUp,
            ignoreAdvanceCap: item.isRecurrenceFollowUp
          });
        }

        const concreteModality = resolveConcreteModality({
          serviceModality: item.serviceRow.modality,
          requestedModality: item.requestedModality,
          allowHome: true
        });
        const candidates = getLinkedPublicProfessionals(tenant.id, item.serviceRow.id, item.preferredProfId);
        const dateStr = item.startIso.slice(0, 10);
        for (const prof of candidates) {
          if (!publicBookingProfessional(tenant.id, prof.id) || !professionalBookingService(tenant.id, prof.id, item.serviceRow.id)) continue;
          const extBusy = extBusyMap.get(`${prof.id}|${dateStr}`);
          const slots = calculateAvailableSlots(
            tenant.id,
            prof.id,
            item.serviceRow.id,
            dateStr,
            undefined,
            undefined,
            extBusy,
            studentId,
            {
              ignoreLeadTime: item.isRecurrenceFollowUp,
              ignoreAdvanceCap: item.isRecurrenceFollowUp
            }
          );
          if (slots.some(s => s.startTime === item.startIso && s.endTime === item.endIso)) {
            return {
              professionalId: prof.id,
              classScheduleId: null,
              roomId: null,
              capacity: 1,
              modality: concreteModality
            };
          }
        }
        throw Object.assign(new Error(`Horário indisponível em ${dateStr} às ${item.startIso.slice(11, 16)}. Escolha outro horário ou data.`), {
          status: 409,
          code: 'SLOT_UNAVAILABLE'
        });
      };

      // ---------------------------------------------------------------------
      // FLUXO B: SOLICITAÇÃO DE PACOTE (único ou multissserviços) + HORÁRIOS
      // ---------------------------------------------------------------------
      if (mode === 'package') {
        if (!packageId) {
          res.status(400).json({ error: 'Selecione um pacote de serviços.' });
          return;
        }
        const pkg = PackageService.listCatalogPackages(tenant.id, { includeInactive: false, publicOnly: true }).find(p => p.id === packageId);
        if (!pkg) {
          res.status(404).json({ error: 'Pacote indisponível para solicitação online.' });
          return;
        }

        const rawSchedules = Array.isArray(schedules) ? schedules : [];
        const expandedSlots: ExpandedBookingItem[] = [];
        for (const sch of rawSchedules) {
          expandedSlots.push(...expandScheduleItem(sch));
        }

        const extBusyMap = await prefetchExternalBusy(expandedSlots);

        const result = db.transaction(() => {
          const resolvedStudentId = resolveOrCreatePublicStudentTx();
          const contract = PackageService.createContractTx({
            tenantId: tenant.id,
            packageId: pkg.id,
            studentId: resolvedStudentId,
            origin: 'public_booking',
            contractStatus: 'requested',
            paymentStatus: 'pending',
            generateInitialCharge: true,
            notes: studentNotes || 'Solicitação realizada via agendamento público do Studio',
            createdBy: 'online_booking'
          });

          const countRow = db.prepare('SELECT COUNT(*) as c FROM appointments WHERE tenant_id = ?').get(tenant.id) as { c: number };
          let seq = (countRow?.c || 0) + 1;
          const year = new Date().getFullYear();
          const bookedAppointments: any[] = [];

          for (const item of expandedSlots) {
            const studentOverlap = db.prepare(`
              SELECT id FROM appointments
              WHERE tenant_id = ? AND patient_id = ? AND status != 'cancelled'
                AND REPLACE(start_time, ' ', 'T') < ? AND REPLACE(end_time, ' ', 'T') > ?
            `).get(tenant.id, resolvedStudentId, item.endIso, item.startIso);
            if (studentOverlap) {
              throw Object.assign(new Error(`Você já possui um horário reservado em ${item.startIso.slice(0, 10)} às ${item.startIso.slice(11, 16)}.`), {
                status: 409,
                code: 'PATIENT_APPOINTMENT_CONFLICT'
              });
            }

            const resolvedSlot = resolvePublicSlotTx(item, resolvedStudentId, extBusyMap);
            const concreteProfId = resolvedSlot.professionalId;
            const concreteModality = resolvedSlot.modality;
            const profMeta = db.prepare(`SELECT name, profession_id FROM professionals WHERE id = ? AND tenant_id = ?`).get(concreteProfId, tenant.id) as any;

            const isGroup = item.serviceRow.service_kind === 'group';
            const capacity = isGroup ? resolvedSlot.capacity : 1;

            let occurrenceId: string | null = null;
            if (isGroup) {
              const occ = resolveOrCreateGroupOccurrenceTx({
                tenantId: tenant.id,
                serviceId: item.serviceRow.id,
                serviceName: item.serviceRow.name,
                professionalId: concreteProfId,
                roomId: resolvedSlot.roomId,
                classScheduleId: resolvedSlot.classScheduleId,
                startTime: item.startIso,
                endTime: item.endIso,
                defaultCapacity: capacity,
                modality: concreteModality,
                patientId: resolvedStudentId
              });
              occurrenceId = occ.occurrenceId;
            }

            let clinicalModule: string | null = null;
            if (item.serviceRow.clinical_module && isPrimaryClinicalModule(item.serviceRow.clinical_module)) {
              clinicalModule = item.serviceRow.clinical_module;
            } else {
              const mod = resolveClinicalModule({ professional_id: concreteProfId, service_id: item.serviceRow.id }, tenant.id);
              if (isPrimaryClinicalModule(mod)) clinicalModule = mod;
            }

            const apptId = 'apt-' + uuidv4().slice(0, 8);
            const apptNumber = `AG-${year}-${seq.toString().padStart(4, '0')}`;
            seq += 1;

            // Insere aula vinculada ao pacote, SEM cobrança por sessão individual
            db.prepare(`
              INSERT INTO appointments (
                id, tenant_id, appointment_number, patient_id, professional_id, service_id,
                start_time, end_time, status, modality, patient_notes, clinical_module, profession_id,
                occurrence_id, service_kind, attendance_status,
                package_contract_id, is_package_covered, created_by
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?, ?, ?, ?, ?, 'pending', ?, 1, 'online_booking')
            `).run(
              apptId,
              tenant.id,
              apptNumber,
              resolvedStudentId,
              concreteProfId,
              item.serviceRow.id,
              item.startIso,
              item.endIso,
              concreteModality,
              studentNotes,
              clinicalModule,
              profMeta?.profession_id || null,
              occurrenceId,
              isGroup ? 'group' : 'individual',
              contract.id
            );

            // Reserva o crédito no pacote ainda em status 'requested'
            const resv = PackageService.reservePackageRightTx({
              tenantId: tenant.id,
              contractId: contract.id,
              studentId: resolvedStudentId,
              serviceId: item.serviceRow.id,
              appointmentId: apptId,
              startTime: item.startIso,
              allowRequestedContract: true,
              createdBy: 'online_booking'
            });

            db.prepare(`
              UPDATE appointments SET package_entitlement_id = ? WHERE id = ? AND tenant_id = ?
            `).run(resv.entitlementId, apptId, tenant.id);

            db.prepare(`
              INSERT INTO appointment_status_history (id, appointment_id, previous_status, new_status, changed_by, reason)
              VALUES (?, ?, NULL, 'scheduled', 'Cliente Online', 'Pré-agendamento vinculado à solicitação de pacote')
            `).run(uuidv4(), apptId);

            bookedAppointments.push({
              id: apptId,
              appointmentNumber: apptNumber,
              serviceId: item.serviceRow.id,
              serviceName: item.serviceRow.name,
              professionalId: concreteProfId,
              professionalName: profMeta?.name || 'Instrutor',
              modality: concreteModality,
              startTime: item.startIso,
              endTime: item.endIso
            });
          }

          const finalContract = PackageService.getContractById(tenant.id, contract.id);
          return { contract: finalContract, bookedAppointments };
        })();

        for (const b of result.bookedAppointments) {
          NotificationService.scheduleAppointmentReminder(b.id);
        }

        res.status(201).json({
          mode: 'package',
          paymentPending: true,
          contractStatus: result.contract?.contract_status || 'requested',
          paymentStatus: result.contract?.payment_status || 'pending',
          contract: result.contract,
          appointments: result.bookedAppointments,
          message: 'Solicitação de pacote e horários registrados com sucesso! A ativação definitiva ocorre após confirmação/pagamento no Studio.'
        });
        return;
      }

      // ---------------------------------------------------------------------
      // FLUXO A: AGENDAMENTO DE SERVIÇO AVULSO / AULA COLETIVA (ou série finita)
      // ---------------------------------------------------------------------
      if (!serviceId || !startTime) {
        res.status(400).json({ error: 'Selecione a aula/serviço e o horário desejado.' });
        return;
      }

      const expandedServiceSlots = expandScheduleItem({
        serviceId: String(serviceId),
        professionalId: professionalId ? String(professionalId) : 'any',
        classScheduleId: classScheduleId ? String(classScheduleId) : null,
        modality,
        startTime: String(startTime),
        endTime: endTime ? String(endTime) : undefined,
        recurrence
      });

      const extBusyMap = await prefetchExternalBusy(expandedServiceSlots);

      const bookedResult = db.transaction(() => {
        const resolvedStudentId = resolveOrCreatePublicStudentTx();
        const countRow = db.prepare('SELECT COUNT(*) as c FROM appointments WHERE tenant_id = ?').get(tenant.id) as { c: number };
        let seq = (countRow?.c || 0) + 1;
        const year = new Date().getFullYear();

        const resolvedSlots = expandedServiceSlots.map(slotItem => {
          const patientConflict = db.prepare(`
            SELECT id FROM appointments
            WHERE tenant_id = ? AND patient_id = ? AND status != 'cancelled'
              AND REPLACE(start_time, ' ', 'T') < ? AND REPLACE(end_time, ' ', 'T') > ?
          `).get(tenant.id, resolvedStudentId, slotItem.endIso, slotItem.startIso);
          if (patientConflict) {
            throw Object.assign(new Error(`Você já possui um horário reservado em ${slotItem.startIso.slice(0, 10)} às ${slotItem.startIso.slice(11, 16)}.`), {
              status: 409,
              code: 'PATIENT_APPOINTMENT_CONFLICT'
            });
          }
          return {
            slotItem,
            resolvedSlot: resolvePublicSlotTx(slotItem, resolvedStudentId, extBusyMap)
          };
        });

        const seriesId = resolvedSlots.length > 1 ? 'ser-' + uuidv4().slice(0, 8) : null;
        if (seriesId && resolvedSlots.length > 1) {
          const first = resolvedSlots[0];
          const last = resolvedSlots[resolvedSlots.length - 1];
          const seriesRecMeta = first.slotItem.recurrenceMeta;
          db.prepare(`
            INSERT INTO class_series (
              id, tenant_id, service_id, professional_id, patient_id, service_kind, title,
              modality, frequency, weekdays_json, interval_value, interval_unit,
              start_time_hhmm, duration_minutes, start_date, end_date,
              max_occurrences, capacity, unit_price, status, created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 'online_booking')
          `).run(
            seriesId,
            tenant.id,
            first.slotItem.serviceRow.id,
            first.resolvedSlot.professionalId,
            resolvedStudentId,
            first.slotItem.serviceRow.service_kind === 'group' ? 'group' : 'individual',
            first.slotItem.serviceRow.name,
            first.resolvedSlot.modality,
            String(seriesRecMeta?.frequency || recurrence?.frequency || 'weekly'),
            JSON.stringify(Array.isArray(seriesRecMeta?.weekdays) ? seriesRecMeta.weekdays : (Array.isArray(recurrence?.weekdays) ? recurrence.weekdays : [])),
            seriesRecMeta?.intervalValue ?? null,
            seriesRecMeta?.intervalUnit ?? null,
            first.slotItem.startIso.slice(11, 16),
            Number(first.slotItem.serviceRow.duration_minutes || 50),
            first.slotItem.startIso.slice(0, 10),
            last.slotItem.startIso.slice(0, 10),
            resolvedSlots.length,
            first.slotItem.serviceRow.service_kind === 'group' ? first.resolvedSlot.capacity : 1,
            Number(first.slotItem.serviceRow.price || 0)
          );
        }

        const createdList: any[] = [];
        for (const { slotItem, resolvedSlot } of resolvedSlots) {
          const concreteProfId = resolvedSlot.professionalId;
          const concreteModality = resolvedSlot.modality;
          const profMeta = db.prepare(`SELECT name, profession_id FROM professionals WHERE id = ? AND tenant_id = ?`).get(concreteProfId, tenant.id) as any;

          const isGroup = slotItem.serviceRow.service_kind === 'group';
          const capacity = isGroup ? resolvedSlot.capacity : 1;
          let occurrenceId: string | null = null;
          if (isGroup) {
            const occ = resolveOrCreateGroupOccurrenceTx({
              tenantId: tenant.id,
              serviceId: slotItem.serviceRow.id,
              serviceName: slotItem.serviceRow.name,
              professionalId: concreteProfId,
              roomId: resolvedSlot.roomId,
              classScheduleId: resolvedSlot.classScheduleId,
              startTime: slotItem.startIso,
              endTime: slotItem.endIso,
              defaultCapacity: capacity,
              modality: concreteModality,
              seriesId,
              patientId: resolvedStudentId
            });
            occurrenceId = occ.occurrenceId;
          }

          let clinicalModule: string | null = null;
          if (slotItem.serviceRow.clinical_module && isPrimaryClinicalModule(slotItem.serviceRow.clinical_module)) {
            clinicalModule = slotItem.serviceRow.clinical_module;
          } else {
            const mod = resolveClinicalModule({ professional_id: concreteProfId, service_id: slotItem.serviceRow.id }, tenant.id);
            if (isPrimaryClinicalModule(mod)) clinicalModule = mod;
          }

          const apptId = 'apt-' + uuidv4().slice(0, 8);
          const apptNumber = `AG-${year}-${seq.toString().padStart(4, '0')}`;
          seq += 1;

          db.prepare(`
            INSERT INTO appointments (
              id, tenant_id, appointment_number, patient_id, professional_id, service_id,
              start_time, end_time, status, modality, patient_notes, clinical_module, profession_id,
              series_id, occurrence_id, service_kind, attendance_status, created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?, ?, ?, ?, ?, ?, 'pending', 'online_booking')
          `).run(
            apptId,
            tenant.id,
            apptNumber,
            resolvedStudentId,
            concreteProfId,
            slotItem.serviceRow.id,
            slotItem.startIso,
            slotItem.endIso,
            concreteModality,
            studentNotes,
            clinicalModule,
            profMeta?.profession_id || null,
            seriesId,
            occurrenceId,
            isGroup ? 'group' : 'individual'
          );

          db.prepare(`
            INSERT INTO appointment_status_history (id, appointment_id, previous_status, new_status, changed_by, reason)
            VALUES (?, ?, NULL, 'scheduled', 'Cliente Online', 'Agendamento público do Studio')
          `).run(uuidv4(), apptId);

          const unitPrice = Math.round(Number(slotItem.serviceRow.price || 0) * 100) / 100;
          if (unitPrice > 0) {
            db.prepare(`
              INSERT INTO payments (
                id, tenant_id, appointment_id, patient_id, amount, payment_method, status,
                due_date, notes, service_id, base_amount, professional_id
              ) VALUES (?, ?, ?, ?, ?, 'pix', 'pending', ?, 'Agendamento online — pagamento pendente no Studio', ?, ?, ?)
            `).run(
              'pay-' + uuidv4().slice(0, 8),
              tenant.id,
              apptId,
              resolvedStudentId,
              unitPrice,
              slotItem.startIso.slice(0, 10),
              slotItem.serviceRow.id,
              unitPrice,
              concreteProfId
            );
          }

          createdList.push({
            id: apptId,
            appointmentNumber: apptNumber,
            serviceId: slotItem.serviceRow.id,
            serviceName: slotItem.serviceRow.name,
            professionalId: concreteProfId,
            professionalName: profMeta?.name || 'Instrutor',
            modality: concreteModality,
            startTime: slotItem.startIso,
            endTime: slotItem.endIso,
            price: unitPrice
          });
        }

        return createdList;
      })();

      for (const b of bookedResult) {
        NotificationService.scheduleAppointmentReminder(b.id);
      }

      res.status(201).json({
        mode: 'service',
        paymentPending: bookedResult.some(b => Number(b.price) > 0),
        appointments: bookedResult,
        message: bookedResult.some(b => Number(b.price) > 0)
          ? 'Horário reservado com sucesso! O pagamento será acertado no Studio.'
          : 'Horário reservado com sucesso!'
      });
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
