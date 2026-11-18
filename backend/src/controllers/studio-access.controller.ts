import { Request, Response } from 'express';
import { db } from '../config/database';
import { logAudit } from '../middlewares/audit.middleware';
import { getUserPermissions } from '../middlewares/rbac.middleware';
import { StudioAccessService } from '../services/studio-access.service';
import { PackageService } from '../services/package.service';

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

      const studentId = req.query.studentId ? String(req.query.studentId) : undefined;
      const status = req.query.status ? String(req.query.status) : undefined;
      const kind = req.query.kind ? String(req.query.kind) : undefined;
      const search = req.query.search ? String(req.query.search) : undefined;

      const result = StudioAccessService.listEnrollments(tenantId, {
        studentId,
        status,
        search
      });

      const filteredEnrollments = kind && kind !== 'all'
        ? result.enrollments.filter((e: any) => e.contractKind === kind || e.contractSource === kind)
        : result.enrollments;

      res.json({
        ...result,
        enrollments: filteredEnrollments
      });
    } catch (err: any) {
      console.error('[StudioAccessController.listEnrollments] Erro:', err);
      res.status(err?.status || 500).json({ error: err?.message || 'Erro ao listar matrículas e contratos.' });
    }
  }

  static createEnrollment(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!tenantId || !req.user) {
        res.status(401).json({ error: 'Autenticação necessária.' });
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
        generateInitialCharge
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
        newAmount,
        markFirstPaymentPaid,
        paymentMethod
      } = req.body || {};

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
          newAmount: newAmount !== undefined && newAmount !== null ? Number(newAmount) : undefined,
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

      res.json({
        message: 'Entrega do serviço/benefício registrada com sucesso!',
        contract: updatedContract
      });
    } catch (err: any) {
      console.error('[StudioAccessController.deliverEntitlement] Erro:', err);
      res.status(err?.status || 500).json({
        error: err?.message || 'Erro ao registrar entrega de benefício do pacote.',
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

      const history = db.prepare(`
        SELECT h.*, u.name as performed_by_name
        FROM student_contract_history h
        LEFT JOIN users u ON u.id = h.created_by
        WHERE h.tenant_id = ? AND (h.recurring_plan_id = ? OR h.package_contract_id = ?)
        ORDER BY h.created_at DESC
        LIMIT 100
      `).all(tenantId, contractId, contractId);

      res.json({ history });
    } catch (err: any) {
      console.error('[StudioAccessController.getContractHistory] Erro:', err);
      res.status(500).json({ error: 'Erro ao consultar histórico do contrato.' });
    }
  }

}
