import { Request, Response } from 'express';
import { db } from '../config/database';
import { logAudit } from '../middlewares/audit.middleware';
import { getUserPermissions } from '../middlewares/rbac.middleware';
import { StudioAccessService } from '../services/studio-access.service';
import { PackageService } from '../services/package.service';
import { PublicBookingRequestService } from '../services/public-booking-request.service';

export interface EnrollmentViewerPermissions {
  canViewEnrollments: boolean;
  canViewFinancial: boolean;
  canReceivePayment: boolean;
  canManageContracts: boolean;
  canDeliverEntitlement: boolean;
}

export function resolveEnrollmentViewerPermissions(
  req: Request,
  tenantId: string
): EnrollmentViewerPermissions {
  const user = req.user!;
  const role = String(user.role || '').toLowerCase();
  const isAdmin = role === 'clinic_admin' || role === 'superadmin';
  if (isAdmin) {
    return {
      canViewEnrollments: true,
      canViewFinancial: true,
      canReceivePayment: true,
      canManageContracts: true,
      canDeliverEntitlement: true
    };
  }

  let explicitCustomPerms: string[] | null = null;
  try {
    const cu = db
      .prepare('SELECT permissions_json, status, deactivated_at FROM clinic_users WHERE user_id = ? AND tenant_id = ? LIMIT 1')
      .get(user.userId, tenantId) as any;
    if (cu && (cu.deactivated_at || (cu.status && cu.status !== 'active'))) {
      return {
        canViewEnrollments: false,
        canViewFinancial: false,
        canReceivePayment: false,
        canManageContracts: false,
        canDeliverEntitlement: false
      };
    }
    if (cu?.permissions_json) {
      const parsed = JSON.parse(cu.permissions_json);
      if (Array.isArray(parsed)) explicitCustomPerms = parsed;
    }
  } catch (_) {}

  if (role === 'professional') {
    try {
      const profRows = db
        .prepare('SELECT active FROM professionals WHERE user_id = ? AND tenant_id = ?')
        .all(user.userId, tenantId) as Array<{ active: number }>;
      if (profRows.length > 0 && profRows.every(p => Number(p.active) !== 1)) {
        return {
          canViewEnrollments: false,
          canViewFinancial: false,
        canReceivePayment: false,
          canManageContracts: false,
          canDeliverEntitlement: false
        };
      }
    } catch (_) {}
  }

  const mergedPerms = getUserPermissions(user.userId, tenantId, role);
  const financialSource = explicitCustomPerms !== null ? explicitCustomPerms : mergedPerms;

  const canViewFinancial =
    financialSource.includes('view_financial') || financialSource.includes('manage_financial');
  const canManageContracts =
    role === 'receptionist' ||
    mergedPerms.includes('manage_contracts') ||
    financialSource.includes('manage_financial');
  const canViewEnrollments =
    role === 'professional' ||
    role === 'receptionist' ||
    mergedPerms.includes('view_enrollments') ||
    canManageContracts;
  const canDeliverEntitlement =
    canManageContracts ||
    role === 'professional' ||
    mergedPerms.includes('view_attendance');

  return {
    canViewEnrollments,
    canViewFinancial,
    canReceivePayment: financialSource.includes('manage_financial'),
    canManageContracts,
    canDeliverEntitlement
  };
}

export class StudioAccessController {
  // =========================================================================
  // MATRÍCULAS E CONTRATOS (UNIFICADO: PLANOS DE ACESSO + RECORRENTES + PACOTES)
  // =========================================================================

  static listEnrollments(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!tenantId || !req.user) {
        res.status(401).json({ error: 'Autenticação necessária.' });
        return;
      }

      const viewerPerms = resolveEnrollmentViewerPermissions(req, tenantId);
      if (!viewerPerms.canViewEnrollments) {
        res.status(403).json({ error: 'Sem permissão para consultar matrículas neste estabelecimento.' });
        return;
      }

      const studentId = req.query.studentId ? String(req.query.studentId) : undefined;
      const status = req.query.status ? String(req.query.status) : undefined;
      const kind = req.query.kind ? String(req.query.kind) : undefined;
      const serviceId = req.query.serviceId ? String(req.query.serviceId) : undefined;
      const period = req.query.period ? String(req.query.period) : undefined;
      const search = req.query.search ? String(req.query.search) : undefined;

      const result = StudioAccessService.listEnrollments(tenantId, {
        studentId,
        status,
        kind,
        serviceId,
        period,
        search
      });

      const sanitizedEnrollments = result.enrollments.map((e: any) =>
        StudioAccessService.sanitizeEnrollmentForViewer(e, viewerPerms.canViewFinancial)
      );
      const pendingRequests = viewerPerms.canManageContracts
        ? (result.pendingRequests || []).map((r: any) =>
            viewerPerms.canViewFinancial ? r : { ...r, amount: null }
          )
        : [];

      res.json({
        ...result,
        enrollments: sanitizedEnrollments,
        pendingRequests,
        permissions: viewerPerms
      });
    } catch (err: any) {
      console.error('[StudioAccessController.listEnrollments] Erro:', err);
      res.status(err?.status || 500).json({ error: err?.message || 'Erro ao listar matrículas e contratos.' });
    }
  }

  static getEnrollmentDetail(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const contractId = String(req.params.id || '');
      if (!tenantId || !req.user || !contractId) {
        res.status(400).json({ error: 'Informe a matrícula ou contrato.' });
        return;
      }

      const viewerPerms = resolveEnrollmentViewerPermissions(req, tenantId);
      if (!viewerPerms.canViewEnrollments) {
        res.status(403).json({ error: 'Sem permissão para consultar detalhes desta matrícula.' });
        return;
      }

      const detail = StudioAccessService.getEnrollmentDetail(tenantId, contractId);
      if (!detail) {
        res.status(404).json({ error: 'Matrícula ou contrato não encontrado neste estabelecimento.' });
        return;
      }

      const sanitized = StudioAccessService.sanitizeEnrollmentDetailForViewer(
        detail,
        viewerPerms.canViewFinancial
      );

      res.json({
        ...sanitized,
        permissions: viewerPerms
      });
    } catch (err: any) {
      console.error('[StudioAccessController.getEnrollmentDetail] Erro:', err);
      res.status(err?.status || 500).json({ error: err?.message || 'Erro ao carregar detalhes da matrícula.' });
    }
  }

  static editEnrollment(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const contractId = String(req.params.id || '');
      if (!tenantId || !req.user || !contractId) {
        res.status(400).json({ error: 'Parâmetros obrigatórios ausentes.' });
        return;
      }

      const {
        title,
        dueDay,
        endDate,
        autoRenew,
        notes,
        accessMode,
        maxEntriesPerWeek,
        maxEntriesPerMonth
      } = req.body || {};

      const updated = db.transaction(() =>
        StudioAccessService.editEnrollmentTx({
          tenantId,
          contractId,
          title,
          dueDay: dueDay !== undefined ? Number(dueDay) : undefined,
          endDate: endDate !== undefined ? (endDate ? String(endDate).slice(0, 10) : null) : undefined,
          autoRenew: autoRenew !== undefined ? Boolean(autoRenew) : undefined,
          notes: notes !== undefined ? (notes ? String(notes) : null) : undefined,
          accessMode,
          maxEntriesPerWeek: maxEntriesPerWeek !== undefined ? (maxEntriesPerWeek ? Number(maxEntriesPerWeek) : null) : undefined,
          maxEntriesPerMonth: maxEntriesPerMonth !== undefined ? (maxEntriesPerMonth ? Number(maxEntriesPerMonth) : null) : undefined,
          actorId: req.user!.userId
        })
      )();

      logAudit(req, 'UPDATE_STUDIO_ENROLLMENT', 'recurring_billing_plans', contractId, {
        title,
        dueDay,
        endDate,
        autoRenew
      });

      res.json({
        message: 'Contrato atualizado com sucesso!',
        contract: updated
      });
    } catch (err: any) {
      console.error('[StudioAccessController.editEnrollment] Erro:', err);
      res.status(err?.status || 500).json({ error: err?.message || 'Erro ao atualizar dados do contrato.' });
    }
  }

  static async approvePublicRequest(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId;
      const requestId = String(req.params.requestId || '').trim();
      if (!tenantId || !req.user || !requestId) {
        res.status(400).json({ error: 'Identificador da solicitação é obrigatório.' });
        return;
      }

      const viewerPerms = resolveEnrollmentViewerPermissions(req, tenantId);
      if (!viewerPerms.canManageContracts) {
        res.status(403).json({ error: 'Sem permissão para aprovar solicitações de matrícula.' });
        return;
      }

      const result = await PublicBookingRequestService.confirmNotificationRequest({
        tenantId,
        notificationOrRequestId: requestId,
        userId: req.user.userId,
        role: String(req.user.role || ''),
        isSandboxSession: Boolean((req as any).isSandboxSession)
      });

      logAudit(req, 'APPROVE_PUBLIC_ENROLLMENT_REQUEST', 'public_booking_requests', requestId, {});

      res.json({
        message: 'Solicitação online confirmada e matrícula criada!',
        ...result
      });
    } catch (err: any) {
      console.error('[StudioAccessController.approvePublicRequest] Erro:', err);
      res.status(err?.status || 500).json({
        error: err?.message || 'Erro ao aprovar solicitação online.',
        ...(err?.code ? { code: err.code } : {})
      });
    }
  }

  static createEnrollment(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!tenantId || !req.user) {
        res.status(401).json({ error: 'Autenticação necessária.' });
        return;
      }

      const viewerPerms = resolveEnrollmentViewerPermissions(req, tenantId);
      if (!viewerPerms.canManageContracts) {
        res.status(403).json({ error: 'Sem permissão para criar matrículas ou contratos neste estabelecimento.' });
        return;
      }

      const {
        studentId,
        serviceId,
        packageId,
        professionalId,
        commercialOptionId,
        title,
        contractKind,
        contractDurationCode,
        paymentPeriodicity,
        billingFrequency,
        startDate,
        endDate,
        dueDay,
        paymentMethod,
        paymentStatus,
        initialPaymentStatus,
        contractStatus,
        amount,
        totalContractAmount,
        installmentsCount,
        fidelityMonths,
        gracePeriodDays,
        autoRenew,
        weeklyLimit,
        maxEntriesPerWeek,
        monthlyLimit,
        maxEntriesPerMonth,
        maxEntriesPerDay,
        allowSameDayReentry,
        allowedWeekdays,
        allowedTimeWindows,
        blockOnOverdue,
        overdueGraceDays,
        accessMode,
        allowDuplicateAccessBenefit,
        notes,
        generateInitialCharge,
        selectedAddons,
        selectedAddonOptionIds,
        addons
      } = req.body || {};

      if (!studentId) {
        res.status(400).json({ error: 'Selecione o aluno para realizar a matrícula.' });
        return;
      }

      const resolvedWeekly = maxEntriesPerWeek !== undefined ? maxEntriesPerWeek : weeklyLimit;
      const resolvedMonthly = maxEntriesPerMonth !== undefined ? maxEntriesPerMonth : monthlyLimit;
      const resolvedPayStatus = initialPaymentStatus || paymentStatus;

      const created = db.transaction(() =>
        StudioAccessService.createEnrollmentTx({
          tenantId,
          studentId: String(studentId),
          serviceId: serviceId ? String(serviceId) : null,
          packageId: packageId ? String(packageId) : null,
          professionalId: professionalId ? String(professionalId) : null,
          commercialOptionId: commercialOptionId ? String(commercialOptionId) : null,
          title: title ? String(title) : null,
          contractKind: contractKind || (packageId ? 'combined_package' : commercialOptionId ? undefined : 'access_plan'),
          contractDurationCode: contractDurationCode || (commercialOptionId ? undefined : '1_month'),
          paymentPeriodicity: paymentPeriodicity || (commercialOptionId ? undefined : 'monthly'),
          billingFrequency: billingFrequency || undefined,
          startDate: startDate ? String(startDate).slice(0, 10) : undefined,
          endDate: endDate ? String(endDate).slice(0, 10) : (commercialOptionId || packageId ? undefined : null),
          dueDay: dueDay ? Number(dueDay) : undefined,
          paymentMethod: paymentMethod ? String(paymentMethod) : 'pix',
          initialPaymentStatus: resolvedPayStatus === 'paid' ? 'paid' : (resolvedPayStatus === 'exempt' ? 'exempt' : 'pending'),
          contractStatus: contractStatus || 'active',
          amount: amount !== undefined ? Number(amount) : undefined,
          totalContractAmount: totalContractAmount !== undefined ? Number(totalContractAmount) : undefined,
          installmentsCount: installmentsCount !== undefined ? Number(installmentsCount) : undefined,
          fidelityMonths: fidelityMonths !== undefined ? Number(fidelityMonths) : undefined,
          gracePeriodDays: gracePeriodDays !== undefined ? Number(gracePeriodDays) : undefined,
          autoRenew: Boolean(autoRenew),
          maxEntriesPerWeek: resolvedWeekly !== undefined && resolvedWeekly !== null ? Number(resolvedWeekly) : null,
          maxEntriesPerMonth: resolvedMonthly !== undefined && resolvedMonthly !== null ? Number(resolvedMonthly) : null,
          maxEntriesPerDay: maxEntriesPerDay !== undefined && maxEntriesPerDay !== null ? Number(maxEntriesPerDay) : null,
          allowSameDayReentry: allowSameDayReentry !== undefined ? Boolean(allowSameDayReentry) : undefined,
          allowedWeekdays: Array.isArray(allowedWeekdays) ? allowedWeekdays : undefined,
          allowedTimeWindows: Array.isArray(allowedTimeWindows) ? allowedTimeWindows : undefined,
          blockOnOverdue: blockOnOverdue !== undefined ? Boolean(blockOnOverdue) : undefined,
          overdueGraceDays: overdueGraceDays !== undefined ? Number(overdueGraceDays) : undefined,
          accessMode: accessMode === 'limited' ? 'limited' : (accessMode === 'unlimited' ? 'unlimited' : undefined),
          allowDuplicateAccessBenefit: Boolean(allowDuplicateAccessBenefit),
          origin: 'admin',
          notes: notes ? String(notes) : null,
          generateInitialCharge: generateInitialCharge !== false,
          selectedAddons: Array.isArray(selectedAddonOptionIds)
            ? selectedAddonOptionIds
            : (Array.isArray(selectedAddons) ? selectedAddons : (Array.isArray(addons) ? addons : undefined)),
          createdBy: req.user!.userId
        })
      )();

      logAudit(
        req,
        'CREATE_STUDIO_ENROLLMENT',
        created.contractSource === 'package_contract' ? 'student_package_contracts' : 'recurring_billing_plans',
        created.contractId,
        {
          studentId,
          serviceId: serviceId || null,
          packageId: packageId || null,
          contractSource: created.contractSource
        }
      );

      res.status(201).json({
        message: 'Matrícula registrada com sucesso!',
        ...created
      });
    } catch (err: any) {
      console.error('[StudioAccessController.createEnrollment] Erro:', err);
      res.status(err?.status || 500).json({
        error: err?.message || 'Erro ao registrar matrícula.',
        ...(err?.code ? { code: err.code } : {})
      });
    }
  }

  static updateEnrollmentLifecycle(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const contractId = String(req.params.id || '');
      if (!tenantId || !req.user || !contractId) {
        res.status(400).json({ error: 'Parâmetros obrigatórios ausentes.' });
        return;
      }

      const {
        action,
        reason,
        frozenFromDate,
        frozenUntilDate,
        extendEndDateOnFreeze,
        cancelFuturePendingPayments,
        cancelFutureScheduledAppointments,
        newEndDate,
        newServiceId,
        newCommercialOptionId,
        newAmount,
        newDurationCode,
        generateRenewalCharge,
        markFirstPaymentPaid,
        paymentMethod
      } = req.body || {};

      const viewerPerms = resolveEnrollmentViewerPermissions(req, tenantId);
      if (!viewerPerms.canManageContracts) {
        res.status(403).json({ error: 'Sem permissão para alterar contratos neste estabelecimento.' });
        return;
      }

      const validActions = ['approve', 'suspend', 'freeze', 'reactivate', 'cancel', 'renew', 'change_plan'];
      if (!validActions.includes(String(action))) {
        res.status(400).json({ error: 'Ação de ciclo contratual inválida.' });
        return;
      }

      const result = db.transaction(() =>
        StudioAccessService.updateEnrollmentLifecycleTx({
          tenantId,
          contractId,
          action,
          reason: reason ? String(reason) : null,
          frozenFromDate: frozenFromDate ? String(frozenFromDate).slice(0, 10) : null,
          frozenUntilDate: frozenUntilDate ? String(frozenUntilDate).slice(0, 10) : null,
          extendEndDateOnFreeze: extendEndDateOnFreeze !== false,
          cancelFuturePendingPayments: cancelFuturePendingPayments !== false,
          cancelFutureScheduledAppointments: Boolean(cancelFutureScheduledAppointments),
          newEndDate: newEndDate ? String(newEndDate).slice(0, 10) : undefined,
          newServiceId: newServiceId ? String(newServiceId) : undefined,
          newCommercialOptionId: newCommercialOptionId ? String(newCommercialOptionId) : undefined,
          newAmount: newAmount !== undefined && newAmount !== null ? Number(newAmount) : undefined,
          newDurationCode: newDurationCode ? String(newDurationCode) : undefined,
          generateRenewalCharge: Boolean(generateRenewalCharge),
          markFirstPaymentPaid: Boolean(markFirstPaymentPaid),
          paymentMethod: paymentMethod ? String(paymentMethod) : 'pix',
          actorId: req.user!.userId
        })
      )();

      logAudit(
        req,
        `ENROLLMENT_LIFECYCLE_${String(action).toUpperCase()}`,
        result.contractSource === 'package_contract' ? 'student_package_contracts' : 'recurring_billing_plans',
        contractId,
        {
          action,
          reason: reason || null
        }
      );

      res.json({
        message: 'Contrato atualizado com sucesso!',
        ...result
      });
    } catch (err: any) {
      console.error('[StudioAccessController.updateEnrollmentLifecycle] Erro:', err);
      res.status(err?.status || 500).json({
        error: err?.message || 'Erro ao atualizar ciclo de vida do contrato.',
        ...(err?.code ? { code: err.code } : {})
      });
    }
  }

  static deliverEntitlement(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const contractId = String(req.params.contractId || '');
      const entitlementId = String(req.params.entitlementId || '');
      if (!tenantId || !req.user || !contractId || !entitlementId) {
        res.status(400).json({ error: 'Informe o contrato e o benefício entregável.' });
        return;
      }

      const viewerPerms = resolveEnrollmentViewerPermissions(req, tenantId);
      if (!viewerPerms.canDeliverEntitlement) {
        res.status(403).json({ error: 'Sem permissão para registrar entrega deste benefício.' });
        return;
      }

      const { notes } = req.body || {};
      const updatedContract = db.transaction(() =>
        PackageService.deliverPackageEntitlementTx({
          tenantId,
          contractId,
          entitlementId,
          notes: notes ? String(notes) : undefined,
          deliveredBy: req.user!.userId
        })
      )();

      logAudit(req, 'DELIVER_PACKAGE_ENTITLEMENT', 'student_package_entitlements', entitlementId, {
        contractId
      });

      const safeContract = viewerPerms.canViewFinancial || !updatedContract
        ? updatedContract
        : {
            ...updatedContract,
            contracted_price: null,
            total_contract_amount: null,
            payment_status: null,
            due_day_snapshot: null,
            billing_frequency_snapshot: null,
            payment_periodicity_snapshot: null,
            payments: []
          };

      res.json({
        message: 'Entrega do serviço/benefício registrada com sucesso!',
        contract: safeContract
      });
    } catch (err: any) {
      console.error('[StudioAccessController.deliverEntitlement] Erro:', err);
      res.status(err?.status || 500).json({
        error: err?.message || 'Erro ao registrar entrega de benefício do pacote.',
        ...(err?.code ? { code: err.code } : {})
      });
    }
  }

  static cancelAddonFromEnrollment(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const contractId = String(req.params.contractId || '');
      const entitlementId = String(req.params.entitlementId || '');
      if (!tenantId || !req.user || !contractId || !entitlementId) {
        res.status(400).json({ error: 'Informe a matrícula e o complemento a cancelar.' });
        return;
      }

      const viewerPerms = resolveEnrollmentViewerPermissions(req, tenantId);
      if (!viewerPerms.canManageContracts) {
        res.status(403).json({ error: 'Sem permissão para cancelar complementos de matrícula.' });
        return;
      }

      const { reason, cancelFuturePendingPayments, cancelFutureScheduledAppointments } = req.body || {};
      const result = db.transaction(() =>
        StudioAccessService.cancelAddonFromEnrollmentTx({
          tenantId,
          contractId,
          entitlementId,
          reason: reason ? String(reason) : undefined,
          cancelFuturePendingPayments,
          cancelFutureScheduledAppointments,
          actorId: req.user!.userId
        })
      )();

      logAudit(req, 'CANCEL_ENROLLMENT_ADDON', 'student_package_entitlements', entitlementId, {
        contractId
      });

      const detail = StudioAccessService.getEnrollmentDetail(tenantId, result.contractId);
      const safeDetail = detail
        ? StudioAccessService.sanitizeEnrollmentDetailForViewer(detail, viewerPerms.canViewFinancial)
        : null;

      res.json({
        message: 'Complemento cancelado com sucesso; o plano-base permanece ativo!',
        result: {
          contractSource: result.contractSource,
          contractId: result.contractId,
          cancelledEntitlementId: result.cancelledEntitlementId
        },
        detail: safeDetail
      });
    } catch (err: any) {
      console.error('[StudioAccessController.cancelAddonFromEnrollment] Erro:', err);
      res.status(err?.status || 500).json({
        error: err?.message || 'Erro ao cancelar complemento da matrícula.',
        ...(err?.code ? { code: err.code } : {})
      });
    }
  }

  static addAddonToEnrollment(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const contractId = String(req.params.contractId || '');
      const { addonOptionId, startDate, dueDay, paymentMethod, initialPaymentStatus, generateInitialCharge, scheduleEntries } = req.body || {};
      if (!tenantId || !req.user || !contractId || !addonOptionId) {
        res.status(400).json({ error: 'Informe a matrícula e a opção de complemento a incluir.' });
        return;
      }

      const viewerPerms = resolveEnrollmentViewerPermissions(req, tenantId);
      if (!viewerPerms.canManageContracts) {
        res.status(403).json({ error: 'Sem permissão para incluir complementos em matrículas.' });
        return;
      }

      const result = db.transaction(() =>
        StudioAccessService.addAddonToEnrollmentTx({
          tenantId,
          contractId,
          addonOptionId: String(addonOptionId),
          startDate: startDate ? String(startDate) : undefined,
          dueDay: dueDay !== undefined ? Number(dueDay) : undefined,
          paymentMethod: paymentMethod ? String(paymentMethod) : undefined,
          initialPaymentStatus,
          generateInitialCharge,
          scheduleEntries: Array.isArray(scheduleEntries) ? scheduleEntries : undefined,
          actorId: req.user!.userId
        })
      )();

      logAudit(req, 'ADD_ENROLLMENT_ADDON', 'student_package_entitlements', result.addedEntitlementId, {
        contractId: result.contractId,
        addonOptionId
      });

      const detail = StudioAccessService.getEnrollmentDetail(tenantId, result.contractId);
      const safeDetail = detail
        ? StudioAccessService.sanitizeEnrollmentDetailForViewer(detail, viewerPerms.canViewFinancial)
        : null;

      res.status(201).json({
        message: 'Complemento opcional incluído na matrícula com sucesso!',
        contractId: result.contractId,
        addedEntitlementId: result.addedEntitlementId,
        detail: safeDetail
      });
    } catch (err: any) {
      console.error('[StudioAccessController.addAddonToEnrollment] Erro:', err);
      res.status(err?.status || 500).json({
        error: err?.message || 'Erro ao incluir complemento na matrícula.',
        ...(err?.code ? { code: err.code } : {})
      });
    }
  }

  static getContractHistory(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const contractId = String(req.params.id || '');
      if (!tenantId || !req.user || !contractId) {
        res.status(400).json({ error: 'Informe o contrato.' });
        return;
      }

      const viewerPerms = resolveEnrollmentViewerPermissions(req, tenantId);
      if (!viewerPerms.canViewEnrollments) {
        res.status(403).json({ error: 'Sem permissão para consultar o histórico deste contrato.' });
        return;
      }

      const rawHistory = db.prepare(`
        SELECT h.*, u.name as performed_by_name
        FROM student_contract_history h
        LEFT JOIN users u ON u.id = h.created_by
        WHERE h.tenant_id = ? AND (h.recurring_plan_id = ? OR h.package_contract_id = ?)
        ORDER BY h.created_at DESC
        LIMIT 100
      `).all(tenantId, contractId, contractId) as any[];

      const history = StudioAccessService.sanitizeContractHistoryForViewer(
        rawHistory,
        viewerPerms.canViewFinancial
      );

      res.json({ history, permissions: viewerPerms });
    } catch (err: any) {
      console.error('[StudioAccessController.getContractHistory] Erro:', err);
      res.status(500).json({ error: 'Erro ao consultar histórico do contrato.' });
    }
  }

}
