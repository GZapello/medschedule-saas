import { Request, Response } from 'express';
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { logAudit } from '../middlewares/audit.middleware';

export class ReferralController {
  // 1. Criar novo encaminhamento interno na clínica (Item 6)
  static create(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const {
        patientId,
        fromProfessionalId,
        toProfessionalId,
        serviceId,
        originAppointmentId,
        reason,
        notes,
        priority = 'normal',
        scheduleNow = false,
        startTime,
        endTime
      } = req.body;

      if (!patientId || !toProfessionalId || !reason) {
        res.status(400).json({ error: 'Paciente, profissional de destino e motivo são obrigatórios' });
        return;
      }

      // Resolve profissional emissor a partir do usuário autenticado se não informado
      let resolvedFromProfId = fromProfessionalId;
      if (!resolvedFromProfId && req.user) {
        const prof = db.prepare('SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ?').get(req.user.userId, tenantId) as any;
        if (prof) resolvedFromProfId = prof.id;
      }

      if (!resolvedFromProfId) {
        // Fallback para primeiro profissional da clínica
        const anyProf = db.prepare('SELECT id FROM professionals WHERE tenant_id = ? AND active = 1 LIMIT 1').get(tenantId) as any;
        resolvedFromProfId = anyProf?.id || 'prof-unknown';
      }

      const referralId = 'ref-' + uuidv4().slice(0, 8);
      let targetAppointmentId: string | null = null;

      // Se optou por "Agendar agora"
      if (scheduleNow && startTime && endTime) {
        targetAppointmentId = 'apt-' + uuidv4().slice(0, 8);
        const apptNumber = 'AG-' + new Date().getFullYear() + '-' + Math.floor(1000 + Math.random() * 9000);

        db.prepare(`
          INSERT INTO appointments (
            id, tenant_id, appointment_number, patient_id, professional_id,
            service_id, start_time, end_time, status, modality,
            patient_notes, referred_from_appointment_id, referred_by_professional_id,
            referral_reason, created_by
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', 'presential', ?, ?, ?, ?, ?)
        `).run(
          targetAppointmentId,
          tenantId,
          apptNumber,
          patientId,
          toProfessionalId,
          serviceId || 'srv-default',
          startTime,
          endTime,
          notes ? `Encaminhamento: ${notes}` : null,
          originAppointmentId || null,
          resolvedFromProfId,
          reason,
          req.user?.userId || 'sistema'
        );
      }

      // Insere o registro de encaminhamento
      db.prepare(`
        INSERT INTO patient_referrals (
          id, tenant_id, patient_id, from_professional_id, to_professional_id,
          service_id, origin_appointment_id, target_appointment_id, reason,
          notes, priority, status, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).run(
        referralId,
        tenantId,
        patientId,
        resolvedFromProfId,
        toProfessionalId,
        serviceId || null,
        originAppointmentId || null,
        targetAppointmentId,
        reason,
        notes || null,
        priority,
        targetAppointmentId ? 'scheduled' : 'pending'
      );

      logAudit(req, 'CREATE_PATIENT_REFERRAL', 'patient_referrals', referralId, {
        patientId,
        from: resolvedFromProfId,
        to: toProfessionalId,
        reason
      });

      res.status(201).json({
        id: referralId,
        message: targetAppointmentId
          ? 'Encaminhamento registrado e consulta agendada com sucesso!'
          : 'Encaminhamento registrado com sucesso no histórico do paciente!',
        targetAppointmentId
      });
    } catch (err: any) {
      console.error('[ReferralController.create] Erro:', err);
      res.status(500).json({ error: 'Erro ao registrar encaminhamento: ' + (err.message || '') });
    }
  }

  // 2. Listar encaminhamentos de um paciente
  static listByPatient(req: Request, res: Response): void {
    try {
      const { id: patientId } = req.params;
      const tenantId = req.tenantId;

      const referrals = db.prepare(`
        SELECT 
          r.*,
          pf.name as from_professional_name,
          pt.name as to_professional_name,
          s.name as service_name
        FROM patient_referrals r
        LEFT JOIN professionals pf ON pf.id = r.from_professional_id
        LEFT JOIN professionals pt ON pt.id = r.to_professional_id
        LEFT JOIN services s ON s.id = r.service_id
        WHERE r.patient_id = ? AND r.tenant_id = ?
        ORDER BY r.created_at DESC
      `).all(patientId, tenantId);

      res.json(referrals);
    } catch (err: any) {
      console.error('[ReferralController.listByPatient] Erro:', err);
      res.status(500).json({ error: 'Erro ao listar encaminhamentos do paciente' });
    }
  }

  // 3. Listar encaminhamentos recebidos pelo profissional logado
  static listReceived(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      let profId: string | undefined;

      if (req.user) {
        const prof = db.prepare('SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ?').get(req.user.userId, tenantId) as any;
        profId = prof?.id;
      }

      let query = `
        SELECT 
          r.*,
          pat.full_name as patient_name, pat.phone as patient_phone, pat.email as patient_email,
          pf.name as from_professional_name,
          pt.name as to_professional_name,
          s.name as service_name
        FROM patient_referrals r
        JOIN patients pat ON pat.id = r.patient_id
        LEFT JOIN professionals pf ON pf.id = r.from_professional_id
        LEFT JOIN professionals pt ON pt.id = r.to_professional_id
        LEFT JOIN services s ON s.id = r.service_id
        WHERE r.tenant_id = ?
      `;

      const params: any[] = [tenantId];

      if (profId && req.user?.role === 'professional') {
        query += ' AND r.to_professional_id = ?';
        params.push(profId);
      }

      query += ' ORDER BY r.created_at DESC';

      const referrals = db.prepare(query).all(...params);
      res.json(referrals);
    } catch (err: any) {
      console.error('[ReferralController.listReceived] Erro:', err);
      res.status(500).json({ error: 'Erro ao listar encaminhamentos recebidos' });
    }
  }
}
