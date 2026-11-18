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
          contractKind: contractKind || (packageId ? 'combined_package' : 'access_plan'),
          contractDurationCode: contractDurationCode || '1_month',
          paymentPeriodicity: paymentPeriodicity || 'monthly',
          billingFrequency: billingFrequency || undefined,
          startDate: startDate ? String(startDate).slice(0, 10) : undefined,
          endDate: endDate ? String(endDate).slice(0, 10) : null,
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

  // =========================================================================
  // CONTROLE DE ACESSO E PRESENÇA (CHECK-IN / CHECK-OUT / QR CODE / AUDITORIA)
  // =========================================================================

  static listAccessLogs(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!tenantId || !req.user) {
        res.status(401).json({ error: 'Autenticação necessária.' });
        return;
      }

      const date = req.query.date ? String(req.query.date).slice(0, 10) : undefined;
      const startDate = req.query.startDate ? String(req.query.startDate).slice(0, 10) : date;
      const endDate = req.query.endDate ? String(req.query.endDate).slice(0, 10) : date;
      const studentId = req.query.studentId ? String(req.query.studentId) : undefined;
      const status = req.query.status ? String(req.query.status) : undefined;
      const limit = req.query.limit ? Number(req.query.limit) : 150;

      const result = StudioAccessService.listAccessLogs(tenantId, {
        startDate,
        endDate,
        studentId,
        status,
        limit
      });

      res.json(result);
    } catch (err: any) {
      console.error('[StudioAccessController.listAccessLogs] Erro:', err);
      res.status(500).json({ error: 'Erro ao consultar registros de acesso.' });
    }
  }

  static checkIn(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!tenantId || !req.user) {
        res.status(401).json({ error: 'Autenticação necessária.' });
        return;
      }

      const {
        studentId,
        cpfOrCode,
        qrToken,
        contractId,
        recurringPlanId,
        packageContractId,
        entitlementId,
        serviceId,
        identificationMethod,
        checkInMethod,
        authorizeException,
        overrideException,
        exceptionReason,
        idempotencyKey,
        notes,
        mockNowIso
      } = req.body || {};

      let resolvedStudentId = studentId ? String(studentId).trim() : '';
      let resolvedMethod: 'manual' | 'qr_code' | 'cpf' | 'code' =
        (identificationMethod || checkInMethod) === 'qr_code' || (identificationMethod || checkInMethod) === 'qrcode'
          ? 'qr_code'
          : (identificationMethod || checkInMethod) === 'cpf'
            ? 'cpf'
            : (identificationMethod || checkInMethod) === 'code'
              ? 'code'
              : 'manual';

      if (!resolvedStudentId && qrToken) {
        const verified = StudioAccessService.verifyStudentQrToken(tenantId, String(qrToken));
        if (!verified.valid) {
          res.status(422).json({
            allowed: false,
            denialReasonCode: verified.code,
            denialReasonMessage: verified.error,
            error: verified.error
          });
          return;
        }
        resolvedStudentId = verified.studentId;
        resolvedMethod = 'qr_code';
      }

      if (!resolvedStudentId && cpfOrCode) {
        const cleanQuery = String(cpfOrCode).trim();
        const digitsOnly = cleanQuery.replace(/\D/g, '');
        const matchedStudent = db.prepare(`
          SELECT id FROM patients
          WHERE tenant_id = ? AND active = 1 AND (
            id = ?
            OR LOWER(full_name) = LOWER(?)
            OR (Length(?) >= 8 AND replace(replace(replace(COALESCE(cpf, ''), '.', ''), '-', ''), ' ', '') = ?)
            OR (Length(?) >= 8 AND replace(replace(replace(COALESCE(phone, ''), '+', ''), '-', ''), ' ', '') LIKE '%' || ?)
          )
          LIMIT 1
        `).get(tenantId, cleanQuery, cleanQuery, digitsOnly, digitsOnly, digitsOnly, digitsOnly) as { id: string } | undefined;

        if (!matchedStudent) {
          res.status(404).json({
            code: 'STUDENT_NOT_FOUND',
            error: 'Nenhum aluno encontrado com o CPF, telefone ou código informado.'
          });
          return;
        }
        resolvedStudentId = matchedStudent.id;
        resolvedMethod = digitsOnly.length === 11 ? 'cpf' : 'code';
      }

      if (!resolvedStudentId) {
        res.status(400).json({ error: 'Informe o aluno, CPF/código ou QR Code para registrar o acesso.' });
        return;
      }

      const wantException = Boolean(authorizeException ?? overrideException);
      let canAuthorizeException = false;
      if (wantException) {
        const isAdmin = req.user.role === 'clinic_admin' || req.user.role === 'superadmin';
        const perms = getUserPermissions(req.user.userId, tenantId, req.user.role);
        canAuthorizeException = isAdmin || perms.includes('authorize_access_exceptions') || perms.includes('manage_contracts');
        if (!canAuthorizeException) {
          res.status(403).json({
            code: 'FORBIDDEN_ACCESS_EXCEPTION',
            error: 'Você não possui permissão para autorizar entrada por exceção. Solicite a um gestor.'
          });
          return;
        }
      }

      const resolvedPlanId = recurringPlanId || (contractId && String(contractId).startsWith('rbp-') ? String(contractId) : null);
      const resolvedPkgId = packageContractId || (contractId && String(contractId).startsWith('spc-') ? String(contractId) : null);

      const result = db.transaction(() =>
        StudioAccessService.checkInStudentTx({
          tenantId,
          studentId: resolvedStudentId,
          serviceId: serviceId ? String(serviceId) : null,
          recurringPlanId: resolvedPlanId,
          packageContractId: resolvedPkgId,
          entitlementId: entitlementId ? String(entitlementId) : null,
          identificationMethod: resolvedMethod,
          authorizeException: wantException,
          exceptionReason: exceptionReason ? String(exceptionReason) : null,
          canAuthorizeException,
          operatorUserId: req.user!.userId,
          operatorName: req.user!.name || req.user!.email || 'Recepção',
          notes: notes ? String(notes) : null,
          idempotencyKey: idempotencyKey ? String(idempotencyKey) : null,
          mockNow: mockNowIso ? new Date(String(mockNowIso)) : undefined
        })
      )();

      logAudit(
        req,
        result.allowed ? 'STUDIO_ACCESS_CHECKIN_ALLOWED' : 'STUDIO_ACCESS_CHECKIN_DENIED',
        'studio_access_logs',
        result.accessLog?.id || null,
        {
          studentId: resolvedStudentId,
          allowed: result.allowed,
          isException: result.isException,
          denialReasonCode: result.denialReasonCode || null
        }
      );

      res.status(result.allowed ? 200 : 422).json(result);
    } catch (err: any) {
      console.error('[StudioAccessController.checkIn] Erro:', err);
      res.status(err?.status || 500).json({
        error: err?.message || 'Erro ao registrar entrada do aluno.',
        ...(err?.code ? { code: err.code } : {})
      });
    }
  }

  static checkOut(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const logId = String(req.params.logId || '');
      if (!tenantId || !req.user || !logId) {
        res.status(400).json({ error: 'Informe o registro de acesso para registrar a saída.' });
        return;
      }

      const { notes } = req.body || {};
      const updated = db.transaction(() =>
        StudioAccessService.checkOutStudentTx({
          tenantId,
          logId,
          operatorUserId: req.user!.userId,
          notes: notes ? String(notes) : null
        })
      )();

      logAudit(req, 'STUDIO_ACCESS_CHECKOUT', 'studio_access_logs', logId, {
        checkOutAt: updated?.check_out_at
      });

      res.json({
        message: 'Saída registrada com sucesso.',
        log: updated
      });
    } catch (err: any) {
      console.error('[StudioAccessController.checkOut] Erro:', err);
      res.status(err?.status || 500).json({ error: err?.message || 'Erro ao registrar saída.' });
    }
  }

  static correctAccessLog(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const logId = String(req.params.logId || '');
      if (!tenantId || !req.user || !logId) {
        res.status(400).json({ error: 'Informe o registro de acesso.' });
        return;
      }

      const { accessStatus, status, checkInAt, checkInTime, checkOutAt, checkOutTime, correctionReason } = req.body || {};
      const resolvedStatus = (accessStatus || status) as 'allowed' | 'denied' | undefined;
      const resolvedCheckIn = checkInAt ?? checkInTime;
      const resolvedCheckOut = checkOutAt !== undefined ? checkOutAt : checkOutTime;

      const updated = db.transaction(() =>
        StudioAccessService.correctAccessLogTx({
          tenantId,
          logId,
          accessStatus: resolvedStatus,
          checkInAt: resolvedCheckIn !== undefined ? String(resolvedCheckIn) : undefined,
          checkOutAt: resolvedCheckOut !== undefined ? (resolvedCheckOut === null ? null : String(resolvedCheckOut)) : undefined,
          correctionReason: String(correctionReason || ''),
          correctedByUserId: req.user!.userId
        })
      )();

      logAudit(req, 'CORRECT_STUDIO_ACCESS_LOG', 'studio_access_logs', logId, {
        accessStatus: resolvedStatus,
        correctionReason
      });

      res.json({
        message: 'Registro de acesso retificado com auditoria.',
        log: updated
      });
    } catch (err: any) {
      console.error('[StudioAccessController.correctAccessLog] Erro:', err);
      res.status(err?.status || 500).json({ error: err?.message || 'Erro ao corrigir registro de acesso.' });
    }
  }

  static getStudentQrToken(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const studentId = String(req.params.studentId || '');
      if (!tenantId || !req.user || !studentId) {
        res.status(400).json({ error: 'Informe o aluno.' });
        return;
      }

      const student = db.prepare(`SELECT id, full_name, phone, cpf FROM patients WHERE id = ? AND tenant_id = ?`).get(studentId, tenantId) as any;
      if (!student) {
        res.status(404).json({ error: 'Aluno não encontrado neste estabelecimento.' });
        return;
      }

      const ttlSeconds = req.query.ttl ? Number(req.query.ttl) : 600;
      const qr = StudioAccessService.generateStudentQrToken(tenantId, studentId, ttlSeconds);

      res.json({
        student: {
          id: student.id,
          name: student.full_name,
          phone: student.phone,
          cpf: student.cpf
        },
        ...qr
      });
    } catch (err: any) {
      console.error('[StudioAccessController.getStudentQrToken] Erro:', err);
      res.status(500).json({ error: 'Erro ao gerar QR Code de acesso do aluno.' });
    }
  }

  static verifyQrToken(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!tenantId || !req.user) {
        res.status(401).json({ error: 'Autenticação necessária.' });
        return;
      }

      const { qrToken } = req.body || {};
      const verification = StudioAccessService.verifyStudentQrToken(tenantId, String(qrToken || ''));
      if (!verification.valid) {
        res.status(422).json(verification);
        return;
      }

      const student = db.prepare(`SELECT id, full_name, phone, cpf FROM patients WHERE id = ? AND tenant_id = ?`)
        .get(verification.studentId, tenantId) as any;

      res.json({
        valid: true,
        student
      });
    } catch (err: any) {
      console.error('[StudioAccessController.verifyQrToken] Erro:', err);
      res.status(500).json({ error: 'Erro ao validar QR Code.' });
    }
  }
}
