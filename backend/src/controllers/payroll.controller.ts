import { Request, Response } from 'express';
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { logAudit } from '../middlewares/audit.middleware';

export class PayrollController {
  // Lista pagamentos / folha do mês para a equipe
  static list(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: 'Tenant não informado' });
        return;
      }

      const { periodMonth, professionalId, status } = req.query;

      let query = `
        SELECT 
          py.id, py.tenant_id, py.professional_id, py.period_month, py.remuneration_type,
          py.appointments_count, py.produced_amount, py.commission_percentage, py.commission_amount,
          py.fixed_salary, py.adjustments, py.adjustment_notes, py.total_payable,
          py.due_date, py.paid_date, py.status, py.notes, py.commission_breakdown_json,
          py.warnings_json, py.created_at, py.updated_at,
          p.name as professional_name, p.photo_url as professional_photo,
          COALESCE(p.specialty_custom, spec.name, '') as specialty_name
        FROM professional_payrolls py
        JOIN professionals p ON p.id = py.professional_id
        LEFT JOIN specialties spec ON spec.id = p.specialty_id
        WHERE py.tenant_id = ?
      `;
      const params: any[] = [tenantId];

      const user = req.user;
      if (user?.role === 'professional') {
        const prof = db.prepare('SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ?').get(user.userId, tenantId) as any;
        if (prof) {
          query += ' AND py.professional_id = ?';
          params.push(prof.id);
        } else {
          res.json([]);
          return;
        }
      } else if (user?.role !== 'clinic_admin' && user?.role !== 'superadmin') {
        res.status(403).json({ success: false, error: 'Você não possui permissão para acessar esta área.' });
        return;
      }

      if (periodMonth) {
        query += ' AND py.period_month = ?';
        params.push(periodMonth);
      }
      if (professionalId) {
        query += ' AND py.professional_id = ?';
        params.push(professionalId);
      }
      if (status) {
        query += ' AND py.status = ?';
        params.push(status);
      }

      query += ' ORDER BY p.name ASC';

      const payrolls = db.prepare(query).all(...params) as any[];
      const payrollIds = payrolls.map(r => r.id).filter(Boolean);
      const itemsByPayroll = new Map<string, any[]>();
      if (payrollIds.length > 0) {
        const ph = payrollIds.map(() => '?').join(', ');
        const itemRows = db.prepare(`
          SELECT * FROM payroll_items
          WHERE tenant_id = ? AND payroll_id IN (${ph})
          ORDER BY created_at ASC, id ASC
        `).all(tenantId, ...payrollIds) as any[];
        for (const ir of itemRows) {
          const list = itemsByPayroll.get(ir.payroll_id) || [];
          list.push(ir);
          itemsByPayroll.set(ir.payroll_id, list);
        }
      }

      const enrichedPayrolls = payrolls.map(r => {
        let parsedBreakdown: any[] = [];
        let parsedWarnings: any[] = [];
        try {
          if (r.commission_breakdown_json) parsedBreakdown = JSON.parse(r.commission_breakdown_json);
        } catch (_) {}
        try {
          if (r.warnings_json) parsedWarnings = JSON.parse(r.warnings_json);
        } catch (_) {}
        return {
          ...r,
          commission_breakdown: parsedBreakdown,
          warnings: parsedWarnings,
          items: itemsByPayroll.get(r.id) || []
        };
      });

      res.json(enrichedPayrolls);
    } catch (err: any) {
      console.error('[PayrollController.list] Erro:', err);
      res.status(500).json({ success: false, error: 'Erro ao listar pagamentos e comissões' });
    }
  }

  // Apuração automática do mês para todos os profissionais ou um específico
  static calculate(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(400).json({ success: false, error: 'Tenant não informado' });
        return;
      }

      const { periodMonth, professionalId } = req.body;
      if (!periodMonth) {
        res.status(400).json({ success: false, error: 'Mês de apuração (YYYY-MM) é obrigatório' });
        return;
      }

      let profQuery = `
        SELECT id, name, remuneration_type, commission_percentage, fixed_salary, payment_day
        FROM professionals
        WHERE tenant_id = ? AND active = 1
      `;
      const profParams: any[] = [tenantId];
      if (professionalId) {
        profQuery += ' AND id = ?';
        profParams.push(professionalId);
      }

      const professionals = db.prepare(profQuery).all(...profParams) as any[];
      const results: any[] = [];
      const contractUnitCache = new Map<string, { unitValue: number; note: string; isExemptOrCancelled: boolean }>();

      const getPackageUnitBasis = (row: any) => {
        const contractId = String(row.package_contract_id || '');
        if (!contractId) {
          return {
            unitValue: 0,
            note: 'Sessão coberta por pacote sem contrato vinculado (base R$ 0,00)',
            isExemptOrCancelled: false
          };
        }
        const cacheKey = `${contractId}:${periodMonth}`;
        const cached = contractUnitCache.get(cacheKey);
        if (cached) return cached;

        const contractPrice = Number(row.pkg_contracted_price || 0);
        const totalCredSnap = Number(row.pkg_total_credits || 0);
        const entSumRow = db.prepare(`
          SELECT COALESCE(SUM(credits_total), 0) as total
          FROM student_package_entitlements
          WHERE contract_id = ? AND tenant_id = ?
        `).get(contractId, tenantId) as { total: number } | undefined;
        const entTotal = Number(entSumRow?.total || 0);
        const creditDenom = totalCredSnap > 0 ? totalCredSnap : entTotal;

        let out: { unitValue: number; note: string; isExemptOrCancelled: boolean };
        if (row.pkg_contract_status === 'cancelled' || row.pkg_payment_status === 'exempt') {
          out = {
            unitValue: 0,
            note: 'Pacote isento/cancelado (base R$ 0,00)',
            isExemptOrCancelled: true
          };
        } else if (creditDenom > 0) {
          const unitValue = Math.max(0, Math.round((contractPrice / creditDenom) * 100) / 100);
          out = {
            unitValue,
            note: `Pacote "${row.pkg_name || 'Contratado'}" (rateio ${creditDenom} créditos)`,
            isExemptOrCancelled: false
          };
        } else {
          const periodCountRow = db.prepare(`
            SELECT COUNT(*) as cnt
            FROM appointments
            WHERE tenant_id = ? AND package_contract_id = ?
              AND status NOT IN ('cancelled', 'no_show')
              AND substr(start_time, 1, 7) = ?
          `).get(tenantId, contractId, periodMonth) as { cnt: number } | undefined;
          const periodDenom = Math.max(1, Number(periodCountRow?.cnt || 1));
          const unitValue = Math.max(0, Math.round((contractPrice / periodDenom) * 100) / 100);
          out = {
            unitValue,
            note: `Plano/Pacote "${row.pkg_name || 'Mensal'}" (rateio ${periodDenom} aula(s) no mês)`,
            isExemptOrCancelled: false
          };
        }
        contractUnitCache.set(cacheKey, out);
        return out;
      };

      const resolveRuleForProf = (profRow: any, srvId: string | null, serviceRuleMap: Map<string, any>) => {
        const remType = profRow.remuneration_type || 'commission';
        const generalCommPct = Number(profRow.commission_percentage || 0);
        const allowGeneralCommission = remType === 'commission' || remType === 'both';

        const specific = srvId ? serviceRuleMap.get(srvId) : undefined;
        if (specific) {
          return {
            source: 'service' as const,
            type: specific.commission_type as 'percentage' | 'fixed',
            value: Number(specific.commission_value || 0),
            groupBasis: (specific.group_payout_basis || 'per_present_student') as 'per_class' | 'per_present_student'
          };
        }
        if (allowGeneralCommission && generalCommPct > 0) {
          return {
            source: 'general' as const,
            type: 'percentage' as const,
            value: generalCommPct,
            groupBasis: 'per_present_student' as const
          };
        }
        return {
          source: 'none' as const,
          type: 'percentage' as const,
          value: 0,
          groupBasis: 'per_present_student' as const
        };
      };

      // Cache de ocorrências já analisadas para detectar excesso de comissão > receita e unicidade de faturamento
      const uniqueOccBasisMap = new Map<string, { grossBasisAmount: number; serviceName: string; startTime: string }>();
      const occCommAccumulator = new Map<string, Array<{
        professionalId: string;
        professionalName: string;
        role: 'primary' | 'co_instructor';
        commissionAmount: number;
      }>>();

      for (const p of professionals) {
        // Verifica se já existe registro para preservar histórico pago e ajustes existentes
        const existing = db.prepare(`
          SELECT *
          FROM professional_payrolls
          WHERE tenant_id = ? AND professional_id = ? AND period_month = ?
        `).get(tenantId, p.id, periodMonth) as any;

        // Regra mandatória: folha já paga/fechada permanece imutável
        if (existing && existing.status === 'paid') {
          let parsedBreakdown: any[] = [];
          let parsedWarnings: any[] = [];
          try {
            if (existing.commission_breakdown_json) parsedBreakdown = JSON.parse(existing.commission_breakdown_json);
          } catch (_) {}
          try {
            if (existing.warnings_json) parsedWarnings = JSON.parse(existing.warnings_json);
          } catch (_) {}
          results.push({
            id: existing.id,
            professionalId: p.id,
            professionalName: p.name,
            periodMonth,
            remunerationType: existing.remuneration_type || p.remuneration_type || 'commission',
            appointmentsCount: Number(existing.appointments_count || 0),
            producedAmount: Number(existing.produced_amount || 0),
            commissionPercentage: Number(existing.commission_percentage || 0),
            commissionAmount: Number(existing.commission_amount || 0),
            fixedSalary: Number(existing.fixed_salary || 0),
            adjustments: Number(existing.adjustments || 0),
            adjustmentNotes: existing.adjustment_notes || null,
            totalPayable: Number(existing.total_payable || 0),
            dueDate: existing.due_date,
            paidDate: existing.paid_date,
            status: 'paid',
            isLocked: true,
            commissionBreakdown: parsedBreakdown,
            warnings: parsedWarnings
          });
          continue;
        }

        // Carrega regras específicas por serviço do profissional neste estabelecimento
        const serviceRulesRows = db.prepare(`
          SELECT service_id, commission_type, commission_value, group_payout_basis, active
          FROM professional_service_commissions
          WHERE tenant_id = ? AND professional_id = ? AND active = 1
        `).all(tenantId, p.id) as Array<{
          service_id: string;
          commission_type: 'percentage' | 'fixed';
          commission_value: number;
          group_payout_basis: 'per_class' | 'per_present_student';
          active: number;
        }>;
        const serviceRuleMap = new Map(serviceRulesRows.map(r => [r.service_id, r]));

        // Busca atendimentos/aulas do mês em que o profissional atuou como titular OU co-instrutor (excluindo ausências confirmadas)
        const apptRows = db.prepare(`
          SELECT DISTINCT
            a.id, a.service_id, a.occurrence_id, a.patient_id, a.professional_id as primary_professional_id,
            a.start_time, a.status,
            COALESCE(a.is_package_covered, 0) as is_package_covered,
            a.package_contract_id,
            a.package_entitlement_id,
            CASE WHEN a.occurrence_id IS NOT NULL OR COALESCE(s.service_kind, a.service_kind) = 'group' THEN 'group' ELSE 'individual' END as service_kind,
            COALESCE(a.attendance_status, 'pending') as attendance_status,
            COALESCE(s.name, 'Serviço') as service_name,
            COALESCE(ps.custom_price, s.price, 0) as list_price,
            spc.contracted_price as pkg_contracted_price,
            spc.total_credits_snapshot as pkg_total_credits,
            spc.billing_type_snapshot as pkg_billing_type,
            spc.contract_status as pkg_contract_status,
            spc.payment_status as pkg_payment_status,
            spc.package_name_snapshot as pkg_name,
            pay.payment_id as payment_id,
            CASE
              WHEN COALESCE(pay.paid_count, 0) > 0 THEN 'paid'
              WHEN COALESCE(pay.open_count, 0) > 0 THEN 'pending'
              WHEN COALESCE(pay.exempt_count, 0) > 0 THEN 'exempt'
              WHEN COALESCE(pay.total_count, 0) > 0 THEN 'cancelled'
              ELSE NULL
            END as payment_status,
            CASE
              WHEN COALESCE(pay.paid_count, 0) > 0 THEN pay.paid_amount
              WHEN COALESCE(pay.open_count, 0) > 0 THEN pay.open_amount
              ELSE 0
            END as payment_amount
          FROM appointments a
          LEFT JOIN services s ON s.id = a.service_id AND s.tenant_id = a.tenant_id
          LEFT JOIN professional_services ps ON ps.service_id = a.service_id AND ps.professional_id = a.professional_id
          LEFT JOIN student_package_contracts spc ON spc.id = a.package_contract_id AND spc.tenant_id = a.tenant_id
          LEFT JOIN (
            SELECT
              appointment_id,
              tenant_id,
              MAX(id) as payment_id,
              SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) as paid_count,
              SUM(CASE WHEN status = 'paid' THEN COALESCE(amount, 0) ELSE 0 END) as paid_amount,
              SUM(CASE WHEN status IN ('pending', 'partial') THEN COALESCE(amount, 0) ELSE 0 END) as open_amount,
              SUM(CASE WHEN status IN ('pending', 'partial') THEN 1 ELSE 0 END) as open_count,
              SUM(CASE WHEN status = 'exempt' THEN 1 ELSE 0 END) as exempt_count,
              COUNT(*) as total_count
            FROM payments
            WHERE appointment_id IS NOT NULL
            GROUP BY tenant_id, appointment_id
          ) pay ON pay.appointment_id = a.id AND pay.tenant_id = a.tenant_id
          WHERE a.tenant_id = ?
            AND a.status NOT IN ('cancelled', 'no_show')
            AND substr(a.start_time, 1, 7) = ?
            AND (
              (
                a.professional_id = ?
                AND NOT EXISTS (
                  SELECT 1 FROM session_instructor_participants sip_abs
                  WHERE sip_abs.tenant_id = a.tenant_id
                    AND sip_abs.professional_id = ?
                    AND sip_abs.attendance_status = 'absent'
                    AND (
                      (a.occurrence_id IS NOT NULL AND sip_abs.occurrence_id = a.occurrence_id)
                      OR (a.occurrence_id IS NULL AND sip_abs.appointment_id = a.id)
                    )
                )
              )
              OR EXISTS (
                SELECT 1 FROM session_instructor_participants sip_inc
                WHERE sip_inc.tenant_id = a.tenant_id
                  AND sip_inc.professional_id = ?
                  AND sip_inc.attendance_status != 'absent'
                  AND (
                    (a.occurrence_id IS NOT NULL AND sip_inc.occurrence_id = a.occurrence_id)
                    OR (a.occurrence_id IS NULL AND sip_inc.appointment_id = a.id)
                  )
              )
            )
          ORDER BY a.start_time ASC
        `).all(tenantId, periodMonth, p.id, p.id, p.id) as any[];

        // Mapeia todos participantes não ausentes das ocorrências/sessões encontradas para evitar duplicidade de faturamento
        const occIds = Array.from(new Set(apptRows.map(r => r.occurrence_id).filter(Boolean))) as string[];
        const aptIdsNoOcc = Array.from(new Set(apptRows.filter(r => !r.occurrence_id).map(r => r.id))) as string[];

        const activePartsByOcc = new Map<string, Array<{ professional_id: string; role: 'primary' | 'co_instructor' }>>();
        if (occIds.length > 0) {
          const ph = occIds.map(() => '?').join(', ');
          const sipRows = db.prepare(`
            SELECT occurrence_id, professional_id, role
            FROM session_instructor_participants
            WHERE tenant_id = ? AND occurrence_id IN (${ph}) AND attendance_status != 'absent'
            ORDER BY CASE WHEN role = 'primary' THEN 0 ELSE 1 END, id ASC
          `).all(tenantId, ...occIds) as any[];
          for (const sr of sipRows) {
            const list = activePartsByOcc.get(sr.occurrence_id) || [];
            list.push({ professional_id: sr.professional_id, role: sr.role === 'primary' ? 'primary' : 'co_instructor' });
            activePartsByOcc.set(sr.occurrence_id, list);
          }
        }

        const activePartsByApt = new Map<string, Array<{ professional_id: string; role: 'primary' | 'co_instructor' }>>();
        if (aptIdsNoOcc.length > 0) {
          const ph = aptIdsNoOcc.map(() => '?').join(', ');
          const sipRows = db.prepare(`
            SELECT appointment_id, professional_id, role
            FROM session_instructor_participants
            WHERE tenant_id = ? AND appointment_id IN (${ph}) AND occurrence_id IS NULL AND attendance_status != 'absent'
            ORDER BY CASE WHEN role = 'primary' THEN 0 ELSE 1 END, id ASC
          `).all(tenantId, ...aptIdsNoOcc) as any[];
          for (const sr of sipRows) {
            const list = activePartsByApt.get(sr.appointment_id) || [];
            list.push({ professional_id: sr.professional_id, role: sr.role === 'primary' ? 'primary' : 'co_instructor' });
            activePartsByApt.set(sr.appointment_id, list);
          }
        }

        const resolveParticipantMeta = (
          keyType: 'occ' | 'apt',
          refId: string,
          fallbackPrimaryId: string
        ): { role: 'primary' | 'co_instructor'; ownsRevenue: boolean } => {
          const parts = keyType === 'occ' ? activePartsByOcc.get(refId) : activePartsByApt.get(refId);
          if (!parts || parts.length === 0) {
            return {
              role: p.id === fallbackPrimaryId ? 'primary' : 'co_instructor',
              ownsRevenue: p.id === fallbackPrimaryId
            };
          }
          const mine = parts.find(x => x.professional_id === p.id);
          const role: 'primary' | 'co_instructor' = mine ? mine.role : (p.id === fallbackPrimaryId ? 'primary' : 'co_instructor');
          const primaryPart = parts.find(x => x.role === 'primary') || parts[0];
          return {
            role,
            ownsRevenue: primaryPart.professional_id === p.id
          };
        };

        const remType = p.remuneration_type || 'commission';
        const generalCommPct = Number(p.commission_percentage || 0);

        const computeFinancialRow = (row: any): { netAmount: number; isPackageCovered: boolean; isExempt: boolean; basisNote: string } => {
          const isPkg = Boolean(Number(row.is_package_covered || 0) === 1 || row.package_contract_id);
          if (isPkg) {
            if (row.payment_id && (row.payment_status === 'cancelled' || row.payment_status === 'refunded' || row.payment_status === 'exempt')) {
              return { netAmount: 0, isPackageCovered: true, isExempt: true, basisNote: 'Sessão isenta/cancelada em pacote' };
            }
            const pkgInfo = getPackageUnitBasis(row);
            return {
              netAmount: pkgInfo.unitValue,
              isPackageCovered: true,
              isExempt: pkgInfo.isExemptOrCancelled,
              basisNote: pkgInfo.note
            };
          }

          if (row.payment_id) {
            if (row.payment_status === 'cancelled' || row.payment_status === 'refunded' || row.payment_status === 'exempt') {
              return { netAmount: 0, isPackageCovered: false, isExempt: true, basisNote: 'Atendimento isento' };
            }
            return {
              netAmount: Math.max(0, Math.round(Number(row.payment_amount || 0) * 100) / 100),
              isPackageCovered: false,
              isExempt: false,
              basisNote: row.payment_status === 'paid' ? 'Pagamento liquidado' : 'Cobrança avulsa em aberto'
            };
          }

          return {
            netAmount: Math.max(0, Math.round(Number(row.list_price || 0) * 100) / 100),
            isPackageCovered: false,
            isExempt: false,
            basisNote: 'Tabela padrão do serviço'
          };
        };

        const resolveRule = (srvId: string | null) => resolveRuleForProf(p, srvId, serviceRuleMap);

        let apptCount = 0;
        let produced = 0;
        let commAmount = 0;
        const breakdownItems: any[] = [];
        const seenItemKeys = new Set<string>();

        // Separa individuais x turmas (agrupadas por occurrence_id)
        const individualRows: any[] = [];
        const groupBuckets = new Map<string, any[]>();

        for (const row of apptRows) {
          if (row.payment_status === 'cancelled' || row.payment_status === 'refunded') continue;
          if (row.service_kind === 'group') {
            const key = row.occurrence_id || `apt:${row.id}`;
            if (!groupBuckets.has(key)) groupBuckets.set(key, []);
            groupBuckets.get(key)!.push(row);
          } else {
            individualRows.push(row);
          }
        }

        // Processa atendimentos individuais elegíveis (realizados ou com presença confirmada ou já pagos)
        for (const row of individualRows) {
          const itemKey = `apt:${row.id}`;
          if (seenItemKeys.has(itemKey)) continue;

          const isRealizedOrAttended =
            row.status === 'completed' ||
            row.attendance_status === 'present' ||
            row.payment_status === 'paid';
          if (!isRealizedOrAttended) continue;

          seenItemKeys.add(itemKey);
          const fin = computeFinancialRow(row);
          const rule = resolveRule(row.service_id);
          const meta = resolveParticipantMeta('apt', row.id, row.primary_professional_id);

          let itemComm = 0;
          if (rule.source !== 'none') {
            if (rule.type === 'fixed') {
              itemComm = fin.isExempt ? 0 : rule.value;
            } else {
              itemComm = Math.round(((fin.netAmount * rule.value) / 100) * 100) / 100;
            }
          }

          const finalBasisNote = meta.ownsRevenue
            ? fin.basisNote
            : `${fin.basisNote} • Base compartilhada (faturamento atribuído ao titular)`;

          apptCount += 1;
          if (meta.ownsRevenue) {
            produced = Math.round((produced + fin.netAmount) * 100) / 100;
          }
          commAmount = Math.round((commAmount + itemComm) * 100) / 100;

          uniqueOccBasisMap.set(itemKey, {
            grossBasisAmount: fin.netAmount,
            serviceName: row.service_name,
            startTime: row.start_time
          });
          const accList = occCommAccumulator.get(itemKey) || [];
          accList.push({
            professionalId: p.id,
            professionalName: p.name,
            role: meta.role,
            commissionAmount: itemComm
          });
          occCommAccumulator.set(itemKey, accList);

          breakdownItems.push({
            appointmentId: row.id,
            occurrenceId: null,
            serviceId: row.service_id,
            serviceName: row.service_name,
            serviceKind: 'individual',
            startTime: row.start_time,
            eligibleStudentsCount: 1,
            grossBasisAmount: fin.netAmount,
            ruleSource: rule.source,
            commissionType: rule.type,
            commissionRate: rule.value,
            groupPayoutBasis: null,
            commissionAmount: itemComm,
            participantRole: meta.role,
            isPackageCovered: fin.isPackageCovered,
            packageContractId: row.package_contract_id || null,
            financialBasisNote: finalBasisNote
          });
        }

        // Processa aulas coletivas / turmas por ocorrência
        for (const [bucketKey, members] of groupBuckets.entries()) {
          const itemKey = members[0].occurrence_id ? `occ:${members[0].occurrence_id}` : bucketKey;
          if (seenItemKeys.has(itemKey)) continue;

          // Considera elegível apenas aluno presente (ou aula finalizada sem falta)
          const presentMembers = members.filter(m =>
            m.attendance_status === 'present' ||
            (m.status === 'completed' && m.attendance_status !== 'absent' && m.attendance_status !== 'cancelled')
          );
          if (presentMembers.length === 0) continue;

          seenItemKeys.add(itemKey);
          const sample = presentMembers[0];
          const rule = resolveRule(sample.service_id);
          const finEntries = presentMembers.map(m => computeFinancialRow(m));
          const totalNetBasis = finEntries.reduce((sum, f) => Math.round((sum + f.netAmount) * 100) / 100, 0);
          const anyPackage = finEntries.some(f => f.isPackageCovered);
          const anyPkgContract = presentMembers.find(m => m.package_contract_id)?.package_contract_id || null;
          const allExempt = finEntries.every(f => f.isExempt);

          const meta = sample.occurrence_id
            ? resolveParticipantMeta('occ', sample.occurrence_id, sample.primary_professional_id)
            : resolveParticipantMeta('apt', sample.id, sample.primary_professional_id);

          let occComm = 0;
          if (rule.source !== 'none') {
            if (rule.type === 'fixed') {
              if (allExempt) {
                occComm = 0;
              } else {
                occComm = rule.groupBasis === 'per_class'
                  ? rule.value
                  : Math.round((rule.value * presentMembers.length) * 100) / 100;
              }
            } else {
              // Para percentual, ambos consideram o valor líquido faturado/rateado dos alunos elegíveis presentes
              occComm = Math.round(((totalNetBasis * rule.value) / 100) * 100) / 100;
            }
          }

          const uniqueNotes = Array.from(new Set(finEntries.map(f => f.basisNote)));
          const baseNote = uniqueNotes.join(' + ');
          const finalBasisNote = meta.ownsRevenue
            ? baseNote
            : `${baseNote} • Cobertura em equipe (faturamento único atribuído ao titular)`;

          apptCount += 1; // 1 ocorrência de aula/turma
          if (meta.ownsRevenue) {
            produced = Math.round((produced + totalNetBasis) * 100) / 100;
          }
          commAmount = Math.round((commAmount + occComm) * 100) / 100;

          uniqueOccBasisMap.set(itemKey, {
            grossBasisAmount: totalNetBasis,
            serviceName: sample.service_name,
            startTime: sample.start_time
          });
          const accList = occCommAccumulator.get(itemKey) || [];
          accList.push({
            professionalId: p.id,
            professionalName: p.name,
            role: meta.role,
            commissionAmount: occComm
          });
          occCommAccumulator.set(itemKey, accList);

          breakdownItems.push({
            appointmentId: sample.id,
            occurrenceId: sample.occurrence_id || bucketKey,
            serviceId: sample.service_id,
            serviceName: sample.service_name,
            serviceKind: 'group',
            startTime: sample.start_time,
            eligibleStudentsCount: presentMembers.length,
            grossBasisAmount: totalNetBasis,
            ruleSource: rule.source,
            commissionType: rule.type,
            commissionRate: rule.value,
            groupPayoutBasis: rule.groupBasis,
            commissionAmount: occComm,
            participantRole: meta.role,
            isPackageCovered: anyPackage,
            packageContractId: anyPkgContract,
            financialBasisNote: finalBasisNote
          });
        }

        const fixedSal = (remType === 'salary' || remType === 'both') ? Number(p.fixed_salary || 0) : 0;

        const currentAdjustments = existing ? Number(existing.adjustments || 0) : 0;
        const currentAdjNotes = existing ? existing.adjustment_notes : null;
        const currentStatus = existing && existing.status === 'paid' ? 'paid' : 'pending';
        const currentPaidDate = existing ? existing.paid_date : null;

        const totalPayable = Math.max(0, Math.round((commAmount + fixedSal + currentAdjustments) * 100) / 100);

        // Vencimento previsto baseado no payment_day
        const payDay = p.payment_day || 5;
        const dueDate = `${periodMonth}-${String(payDay).padStart(2, '0')}`;

        results.push({
          id: existing?.id || undefined,
          professionalId: p.id,
          professionalName: p.name,
          periodMonth,
          remunerationType: remType,
          appointmentsCount: apptCount,
          producedAmount: produced,
          commissionPercentage: generalCommPct,
          commissionAmount: commAmount,
          fixedSalary: fixedSal,
          adjustments: currentAdjustments,
          adjustmentNotes: currentAdjNotes,
          totalPayable,
          dueDate,
          paidDate: currentPaidDate,
          status: currentStatus,
          isLocked: false,
          commissionBreakdown: breakdownItems,
          warnings: [] as any[]
        });
      }

      // Auditoria de margem/excesso: verifica ocorrências/sessões onde soma de comissões supera a base financeira
      const allWarnings: any[] = [];
      for (const [itemKey, metaInfo] of uniqueOccBasisMap.entries()) {
        const comms = occCommAccumulator.get(itemKey) || [];
        if (comms.length === 0) continue;
        const totalItemComm = Math.round(comms.reduce((s, c) => s + Number(c.commissionAmount || 0), 0) * 100) / 100;
        if (totalItemComm > Number(metaInfo.grossBasisAmount || 0) + 0.01) {
          const warn = {
            code: 'COMMISSION_EXCEEDS_BASIS',
            itemKey,
            serviceName: metaInfo.serviceName,
            startTime: metaInfo.startTime,
            grossBasisAmount: Number(metaInfo.grossBasisAmount || 0),
            totalCommissionAmount: totalItemComm,
            excessAmount: Math.round((totalItemComm - Number(metaInfo.grossBasisAmount || 0)) * 100) / 100,
            message: `Soma das comissões (R$ ${totalItemComm.toFixed(2)}) supera a base financeira da aula (R$ ${Number(metaInfo.grossBasisAmount || 0).toFixed(2)}) em "${metaInfo.serviceName}".`,
            professionalIds: comms.map(c => c.professionalId)
          };
          allWarnings.push(warn);
          for (const resItem of results) {
            if (warn.professionalIds.includes(resItem.professionalId)) {
              if (!Array.isArray(resItem.warnings)) resItem.warnings = [];
              resItem.warnings.push(warn);
            }
          }
        }
      }

      const uniqueProducedAmount = Math.round(
        Array.from(uniqueOccBasisMap.values()).reduce((sum, v) => sum + Number(v.grossBasisAmount || 0), 0) * 100
      ) / 100;
      const totalCommissionAmount = Math.round(
        results.reduce((sum, r) => sum + Number(r.commissionAmount || 0), 0) * 100
      ) / 100;
      const totalPayableAmount = Math.round(
        results.reduce((sum, r) => sum + Number(r.totalPayable || 0), 0) * 100
      ) / 100;

      res.json({
        success: true,
        periodMonth,
        calculatedCount: results.length,
        summary: {
          uniqueItemsCount: uniqueOccBasisMap.size,
          uniqueProducedAmount,
          totalCommissionAmount,
          totalPayableAmount,
          warningsCount: allWarnings.length
        },
        warnings: allWarnings,
        results
      });
    } catch (err: any) {
      console.error('[PayrollController.calculate] Erro:', err);
      res.status(500).json({ success: false, error: 'Erro ao calcular folha de pagamento' });
    }
  }

  // Salvar ou atualizar lançamento de pagamento/comissão
  static save(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: 'Tenant não informado' });
        return;
      }

      const {
        id, professionalId, periodMonth, remunerationType, appointmentsCount,
        producedAmount, commissionPercentage, commissionAmount, fixedSalary,
        adjustments, adjustmentNotes, totalPayable, dueDate, paidDate, status, notes,
        commissionBreakdown, warnings
      } = req.body;

      if (!professionalId || !periodMonth) {
        res.status(400).json({ error: 'Profissional e período (YYYY-MM) são obrigatórios' });
        return;
      }

      const profOwner = db.prepare(`
        SELECT id FROM professionals WHERE id = ? AND tenant_id = ?
      `).get(professionalId, tenantId) as { id: string } | undefined;
      if (!profOwner) {
        res.status(404).json({ error: 'Profissional não encontrado neste estabelecimento.' });
        return;
      }

      const recordId = id || ('pay-' + uuidv4().slice(0, 8));

      // Verifica se já existe registro para esse profissional no mês
      const existing = db.prepare(`
        SELECT id, status FROM professional_payrolls
        WHERE tenant_id = ? AND professional_id = ? AND period_month = ?
      `).get(tenantId, professionalId, periodMonth) as { id: string; status: string } | undefined;

      if (existing && existing.status === 'paid') {
        res.status(409).json({
          code: 'PAYROLL_ALREADY_PAID',
          error: 'Esta folha já foi quitada e seu histórico congelado não pode ser sobrescrito.'
        });
        return;
      }

      const dedupedBreakdown: any[] = [];
      if (Array.isArray(commissionBreakdown)) {
        const seen = new Set<string>();
        for (const item of commissionBreakdown) {
          const k = item?.occurrenceId ? `occ:${item.occurrenceId}` : (item?.appointmentId ? `apt:${item.appointmentId}` : `row:${dedupedBreakdown.length}`);
          if (seen.has(k)) continue;
          seen.add(k);
          dedupedBreakdown.push(item);
        }
      }

      const targetId = existing ? existing.id : recordId;
      const breakdownJson = Array.isArray(commissionBreakdown) ? JSON.stringify(dedupedBreakdown) : null;
      const warningsJson = Array.isArray(warnings) ? JSON.stringify(warnings) : null;

      const saveTx = db.transaction(() => {
        if (existing) {
          db.prepare(`
            UPDATE professional_payrolls SET
              remuneration_type = ?,
              appointments_count = ?,
              produced_amount = ?,
              commission_percentage = ?,
              commission_amount = ?,
              fixed_salary = ?,
              adjustments = ?,
              adjustment_notes = ?,
              total_payable = ?,
              due_date = ?,
              paid_date = ?,
              status = ?,
              notes = ?,
              commission_breakdown_json = COALESCE(?, commission_breakdown_json),
              warnings_json = COALESCE(?, warnings_json),
              updated_at = datetime('now')
            WHERE id = ? AND tenant_id = ?
          `).run(
            remunerationType || 'commission',
            Number(appointmentsCount) || 0,
            Number(producedAmount) || 0,
            Number(commissionPercentage) || 0,
            Number(commissionAmount) || 0,
            Number(fixedSalary) || 0,
            Number(adjustments) || 0,
            adjustmentNotes || null,
            Number(totalPayable) || 0,
            dueDate || null,
            paidDate || null,
            status || 'pending',
            notes || null,
            breakdownJson,
            warningsJson,
            targetId,
            tenantId
          );
        } else {
          db.prepare(`
            INSERT INTO professional_payrolls (
              id, tenant_id, professional_id, period_month, remuneration_type,
              appointments_count, produced_amount, commission_percentage, commission_amount,
              fixed_salary, adjustments, adjustment_notes, total_payable,
              due_date, paid_date, status, notes, commission_breakdown_json, warnings_json, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
          `).run(
            targetId,
            tenantId,
            professionalId,
            periodMonth,
            remunerationType || 'commission',
            Number(appointmentsCount) || 0,
            Number(producedAmount) || 0,
            Number(commissionPercentage) || 0,
            Number(commissionAmount) || 0,
            Number(fixedSalary) || 0,
            Number(adjustments) || 0,
            adjustmentNotes || null,
            Number(totalPayable) || 0,
            dueDate || null,
            paidDate || null,
            status || 'pending',
            notes || null,
            breakdownJson,
            warningsJson
          );
        }

        if (Array.isArray(commissionBreakdown)) {
          db.prepare('DELETE FROM payroll_items WHERE payroll_id = ? AND tenant_id = ?').run(targetId, tenantId);
          const insItem = db.prepare(`
            INSERT INTO payroll_items (
              id, tenant_id, payroll_id, professional_id, service_id, appointment_id,
              occurrence_id, service_name_snapshot, service_kind_snapshot, eligible_students_count,
              gross_basis_amount, rule_source, commission_type, commission_rate, group_payout_basis, commission_amount,
              participant_role, is_package_covered, package_contract_id, financial_basis_note
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);
          for (const item of dedupedBreakdown) {
            insItem.run(
              'pi-' + uuidv4().slice(0, 8),
              tenantId,
              targetId,
              professionalId,
              item.serviceId || null,
              item.appointmentId || null,
              item.occurrenceId || null,
              item.serviceName || 'Serviço',
              item.serviceKind || 'individual',
              Number(item.eligibleStudentsCount || 1),
              Number(item.grossBasisAmount || 0),
              item.ruleSource || 'none',
              item.commissionType || 'percentage',
              Number(item.commissionRate || 0),
              item.groupPayoutBasis || null,
              Number(item.commissionAmount || 0),
              item.participantRole === 'co_instructor' ? 'co_instructor' : 'primary',
              item.isPackageCovered ? 1 : 0,
              item.packageContractId || null,
              item.financialBasisNote || null
            );
          }
        }
      });

      saveTx();

      logAudit(req, 'SAVE_PAYROLL', 'professional_payrolls', targetId, { professionalId, periodMonth, totalPayable, status });
      const updated = db.prepare('SELECT * FROM professional_payrolls WHERE id = ? AND tenant_id = ?').get(targetId, tenantId);
      res.json({ success: true, id: targetId, message: 'Lançamento de pagamento salvo com sucesso', payroll: updated });
    } catch (err: any) {
      console.error('[PayrollController.save] Erro:', err);
      res.status(500).json({ success: false, error: 'Erro ao salvar pagamento' });
    }
  }

  /**
   * Lista itens detalhados e avisos de uma folha salva
   * GET /v1/payroll/:id/items
   */
  static getItems(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const { id } = req.params;
      if (!tenantId || !id) {
        res.status(400).json({ error: 'Estabelecimento e folha são obrigatórios.' });
        return;
      }

      const payroll = db.prepare(`
        SELECT py.*, p.name as professional_name
        FROM professional_payrolls py
        JOIN professionals p ON p.id = py.professional_id
        WHERE py.id = ? AND py.tenant_id = ?
      `).get(id, tenantId) as any;

      if (!payroll) {
        res.status(404).json({ error: 'Folha de pagamento não encontrada.' });
        return;
      }

      if (req.user?.role === 'professional') {
        const ownProf = db.prepare(`
          SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ?
        `).get(req.user.userId, tenantId) as { id: string } | undefined;
        if (!ownProf || ownProf.id !== payroll.professional_id) {
          res.status(403).json({ error: 'Sem permissão para visualizar detalhes de outro profissional.' });
          return;
        }
      } else if (req.user?.role !== 'clinic_admin' && req.user?.role !== 'superadmin') {
        res.status(403).json({ error: 'Você não possui permissão para acessar esta área.' });
        return;
      }

      const items = db.prepare(`
        SELECT * FROM payroll_items
        WHERE tenant_id = ? AND payroll_id = ?
        ORDER BY created_at ASC, id ASC
      `).all(tenantId, id) as any[];

      let parsedBreakdown: any[] = [];
      let parsedWarnings: any[] = [];
      try {
        if (payroll.commission_breakdown_json) parsedBreakdown = JSON.parse(payroll.commission_breakdown_json);
      } catch (_) {}
      try {
        if (payroll.warnings_json) parsedWarnings = JSON.parse(payroll.warnings_json);
      } catch (_) {}

      res.json({
        payrollId: payroll.id,
        professionalId: payroll.professional_id,
        professionalName: payroll.professional_name,
        periodMonth: payroll.period_month,
        status: payroll.status,
        warnings: parsedWarnings,
        items,
        commissionBreakdown: parsedBreakdown
      });
    } catch (err: any) {
      console.error('[PayrollController.getItems] Erro:', err);
      res.status(500).json({ error: 'Erro ao carregar detalhes da folha.' });
    }
  }

  // Baixa / Alteração de status (Pendente / Pago / Atrasado)
  static updateStatus(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;
      const { status, paidDate } = req.body;

      const allowed = ['pending', 'paid', 'delayed'];
      if (!allowed.includes(status)) {
        res.status(400).json({ success: false, error: `Status inválido. Permitidos: ${allowed.join(', ')}` });
        return;
      }

      const finalPaidDate = status === 'paid' ? (paidDate || new Date().toISOString().split('T')[0]) : null;

      db.prepare(`
        UPDATE professional_payrolls SET
          status = ?,
          paid_date = ?,
          updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ?
      `).run(status, finalPaidDate, id, tenantId);

      logAudit(req, 'UPDATE_PAYROLL_STATUS', 'professional_payrolls', id, { status, paidDate: finalPaidDate });
      const updated = db.prepare('SELECT * FROM professional_payrolls WHERE id = ? AND tenant_id = ?').get(id, tenantId);
      res.json({ success: true, message: 'Status de pagamento atualizado com sucesso', status, paidDate: finalPaidDate, payroll: updated });
    } catch (err: any) {
      console.error('[PayrollController.updateStatus] Erro:', err);
      res.status(500).json({ success: false, error: 'Erro ao atualizar status de pagamento' });
    }
  }

  // Baixa direta / Registro de quitação com data e notas
  static markPaid(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;
      const { paidDate, notes } = req.body;

      const finalPaidDate = paidDate || new Date().toISOString().split('T')[0];

      db.prepare(`
        UPDATE professional_payrolls SET
          status = 'paid',
          paid_date = ?,
          notes = COALESCE(?, notes),
          updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ?
      `).run(finalPaidDate, notes || null, id, tenantId);

      logAudit(req, 'MARK_PAYROLL_PAID', 'professional_payrolls', id, { paidDate: finalPaidDate });
      const updated = db.prepare('SELECT * FROM professional_payrolls WHERE id = ? AND tenant_id = ?').get(id, tenantId);
      res.json({ success: true, message: 'Pagamento registrado com sucesso!', status: 'paid', paidDate: finalPaidDate, payroll: updated });
    } catch (err: any) {
      console.error('[PayrollController.markPaid] Erro:', err);
      res.status(500).json({ success: false, error: 'Erro ao registrar pagamento' });
    }
  }

  // Excluir lançamento de folha/pagamento
  static delete(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;

      db.prepare('DELETE FROM professional_payrolls WHERE id = ? AND tenant_id = ?').run(id, tenantId);
      logAudit(req, 'DELETE_PAYROLL', 'professional_payrolls', id);
      res.json({ success: true, message: 'Lançamento de pagamento excluído com sucesso' });
    } catch (err: any) {
      console.error('[PayrollController.delete] Erro:', err);
      res.status(500).json({ success: false, error: 'Erro ao excluir lançamento' });
    }
  }

  /**
   * Lista serviços do profissional + regras de comissão específicas configuradas
   * GET /v1/professionals/:id/service-commissions
   */
  static getServiceCommissions(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const professionalId = String(req.params.id || '');
      if (!tenantId || !professionalId) {
        res.status(400).json({ error: 'Estabelecimento e profissional são obrigatórios.' });
        return;
      }

      const prof = db.prepare(`
        SELECT id, user_id, name, commission_percentage, remuneration_type
        FROM professionals
        WHERE id = ? AND tenant_id = ? AND active = 1
      `).get(professionalId, tenantId) as any;

      if (!prof) {
        res.status(404).json({ error: 'Profissional não encontrado neste estabelecimento.' });
        return;
      }

      if (req.user?.role === 'professional' && prof.user_id !== req.user.userId) {
        res.status(403).json({ error: 'Sem permissão para visualizar comissões de outro profissional.' });
        return;
      }

      const services = db.prepare(`
        SELECT DISTINCT
          s.id as service_id,
          s.name as service_name,
          COALESCE(ps.custom_price, s.price, 0) as price,
          COALESCE(s.service_kind, 'individual') as service_kind,
          s.default_capacity,
          psc.id as rule_id,
          psc.commission_type,
          psc.commission_value,
          COALESCE(psc.group_payout_basis, 'per_present_student') as group_payout_basis,
          COALESCE(psc.active, 0) as rule_active
        FROM services s
        LEFT JOIN professional_services ps ON ps.service_id = s.id AND ps.professional_id = ?
        LEFT JOIN professional_service_commissions psc ON psc.service_id = s.id AND psc.professional_id = ? AND psc.tenant_id = s.tenant_id
        WHERE s.tenant_id = ?
          AND s.active = 1
          AND (
            s.professional_id = ?
            OR s.professional_id IS NULL
            OR ps.professional_id = ?
            OR psc.id IS NOT NULL
          )
        ORDER BY s.name ASC
      `).all(professionalId, professionalId, tenantId, professionalId, professionalId) as any[];

      res.json({
        professionalId: prof.id,
        professionalName: prof.name,
        generalCommissionPercentage: Number(prof.commission_percentage || 0),
        remunerationType: prof.remuneration_type || 'commission',
        services
      });
    } catch (err: any) {
      console.error('[PayrollController.getServiceCommissions] Erro:', err);
      res.status(500).json({ error: 'Erro ao carregar comissões por serviço.' });
    }
  }

  /**
   * Salva em lote regras específicas de comissão por serviço para um profissional
   * PUT /v1/professionals/:id/service-commissions
   */
  static upsertServiceCommissions(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const professionalId = String(req.params.id || '');
      const { rules } = req.body || {};

      if (!tenantId || !professionalId) {
        res.status(400).json({ error: 'Estabelecimento e profissional são obrigatórios.' });
        return;
      }
      if (!Array.isArray(rules)) {
        res.status(400).json({ error: 'Envie uma lista de regras em rules.' });
        return;
      }

      const prof = db.prepare(`
        SELECT id FROM professionals WHERE id = ? AND tenant_id = ? AND active = 1
      `).get(professionalId, tenantId);
      if (!prof) {
        res.status(404).json({ error: 'Profissional não encontrado neste estabelecimento.' });
        return;
      }

      const tx = db.transaction(() => {
        for (const r of rules) {
          const serviceId = String(r?.serviceId || '').trim();
          if (!serviceId) continue;

          const srv = db.prepare('SELECT id FROM services WHERE id = ? AND tenant_id = ?').get(serviceId, tenantId);
          if (!srv) continue;

          const active = r.active !== undefined ? (r.active ? 1 : 0) : 1;
          const commissionType = r.commissionType === 'fixed' ? 'fixed' : 'percentage';
          const rawVal = Number(r.commissionValue ?? 0);
          if (!Number.isFinite(rawVal) || rawVal < 0) {
            throw { status: 400, error: 'O valor da comissão deve ser maior ou igual a zero.' };
          }
          if (commissionType === 'percentage' && rawVal > 100) {
            throw { status: 400, error: 'O percentual de comissão não pode ultrapassar 100%.' };
          }
          const commissionValue = Math.round(rawVal * 100) / 100;
          const groupPayoutBasis = r.groupPayoutBasis === 'per_class' ? 'per_class' : 'per_present_student';

          if (!active) {
            db.prepare(`
              DELETE FROM professional_service_commissions
              WHERE tenant_id = ? AND professional_id = ? AND service_id = ?
            `).run(tenantId, professionalId, serviceId);
            continue;
          }

          db.prepare(`
            INSERT INTO professional_service_commissions (
              id, tenant_id, professional_id, service_id, commission_type, commission_value, group_payout_basis, active, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
            ON CONFLICT(tenant_id, professional_id, service_id) DO UPDATE SET
              commission_type = excluded.commission_type,
              commission_value = excluded.commission_value,
              group_payout_basis = excluded.group_payout_basis,
              active = 1,
              updated_at = datetime('now')
          `).run(
            'psc-' + uuidv4().slice(0, 8),
            tenantId,
            professionalId,
            serviceId,
            commissionType,
            commissionValue,
            groupPayoutBasis
          );
        }
      });

      try {
        tx();
      } catch (txErr: any) {
        if (txErr?.status === 400) {
          res.status(400).json({ error: txErr.error });
          return;
        }
        throw txErr;
      }

      logAudit(req, 'UPSERT_SERVICE_COMMISSIONS', 'professionals', professionalId, { rulesCount: rules.length });
      res.json({ success: true, message: 'Comissões por serviço salvas com sucesso.' });
    } catch (err: any) {
      console.error('[PayrollController.upsertServiceCommissions] Erro:', err);
      res.status(500).json({ error: 'Erro ao salvar comissões por serviço.' });
    }
  }

  /**
   * Remove regra específica de comissão por serviço
   * DELETE /v1/professionals/:id/service-commissions/:serviceId
   */
  static deleteServiceCommission(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const professionalId = String(req.params.id || '');
      const serviceId = String(req.params.serviceId || '');

      if (!tenantId || !professionalId || !serviceId) {
        res.status(400).json({ error: 'Parâmetros obrigatórios ausentes.' });
        return;
      }

      db.prepare(`
        DELETE FROM professional_service_commissions
        WHERE tenant_id = ? AND professional_id = ? AND service_id = ?
      `).run(tenantId, professionalId, serviceId);

      logAudit(req, 'DELETE_SERVICE_COMMISSION', 'professionals', professionalId, { serviceId });
      res.json({ success: true, message: 'Regra de comissão removida.' });
    } catch (err: any) {
      console.error('[PayrollController.deleteServiceCommission] Erro:', err);
      res.status(500).json({ error: 'Erro ao remover regra de comissão.' });
    }
  }
}
