import { Request, Response } from 'express';
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { logAudit } from '../middlewares/audit.middleware';

export class AppointmentController {
  static list(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: 'Tenant não informado' });
        return;
      }

      const { startDate, endDate, professionalId, status, patientId } = req.query;

      let query = `
        SELECT 
          a.id, a.tenant_id, a.appointment_number, a.patient_id, a.professional_id,
          a.service_id, a.room_id, a.start_time, a.end_time, a.status, a.modality,
          a.patient_notes, a.internal_notes, a.cancellation_reason, a.created_at,
          pat.full_name as patient_name, pat.phone as patient_phone, pat.email as patient_email,
          pat.is_child as patient_is_child,
          p.name as professional_name, p.photo_url as professional_photo,
          s.name as service_name, s.duration_minutes, s.price as service_price,
          r.name as room_name,
          pay.status as payment_status, pay.amount as payment_amount, pay.payment_method
        FROM appointments a
        JOIN patients pat ON pat.id = a.patient_id
        JOIN professionals p ON p.id = a.professional_id
        JOIN services s ON s.id = a.service_id
        LEFT JOIN rooms r ON r.id = a.room_id
        LEFT JOIN payments pay ON pay.appointment_id = a.id
        WHERE a.tenant_id = ?
      `;
      const params: any[] = [tenantId];

      // Se for profissional logado (sem ser admin), filtra apenas seus atendimentos
      if (req.user && req.user.role === 'professional') {
        const profUser = db.prepare('SELECT id FROM professionals WHERE user_id = ?').get(req.user.userId) as { id: string } | undefined;
        if (profUser) {
          query += ' AND a.professional_id = ?';
          params.push(profUser.id);
        }
      } else if (professionalId) {
        query += ' AND a.professional_id = ?';
        params.push(professionalId);
      }

      if (patientId) {
        query += ' AND a.patient_id = ?';
        params.push(patientId);
      }

      if (status) {
        query += ' AND a.status = ?';
        params.push(status);
      }

      if (startDate) {
        query += ' AND a.start_time >= ?';
        params.push(startDate);
      }

      if (endDate) {
        query += ' AND a.start_time <= ?';
        params.push(endDate);
      }

      query += ' ORDER BY a.start_time ASC';

      const stmt = db.prepare(query);
      const appointments = stmt.all(...params);
      res.json(appointments);
    } catch (err: any) {
      console.error('[AppointmentController.list] Erro:', err);
      res.status(500).json({ error: 'Erro ao listar agendamentos' });
    }
  }

  static getById(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;

      const stmt = db.prepare(`
        SELECT 
          a.*,
          pat.full_name as patient_name, pat.phone as patient_phone, pat.email as patient_email,
          pat.birth_date as patient_birth_date, pat.cpf as patient_cpf, pat.is_child as patient_is_child,
          p.name as professional_name, p.registration_number,
          s.name as service_name, s.price as service_price, s.duration_minutes,
          r.name as room_name,
          pay.id as payment_id, pay.status as payment_status, pay.amount as payment_amount, pay.payment_method
        FROM appointments a
        JOIN patients pat ON pat.id = a.patient_id
        JOIN professionals p ON p.id = a.professional_id
        JOIN services s ON s.id = a.service_id
        LEFT JOIN rooms r ON r.id = a.room_id
        LEFT JOIN payments pay ON pay.appointment_id = a.id
        WHERE a.id = ? AND a.tenant_id = ?
      `);
      const appointment = stmt.get(id, tenantId);

      if (!appointment) {
        const otherTenantCheck = db.prepare('SELECT tenant_id FROM appointments WHERE id = ?').get(id) as { tenant_id: string } | undefined;
        if (otherTenantCheck && otherTenantCheck.tenant_id !== tenantId) {
          res.status(403).json({ error: 'Acesso negado: este agendamento pertence a outra clínica' });
          return;
        }
        res.status(404).json({ error: 'Agendamento não encontrado' });
        return;
      }

      // Histórico de status
      const historyStmt = db.prepare(`
        SELECT previous_status, new_status, changed_by, reason, created_at
        FROM appointment_status_history
        WHERE appointment_id = ?
        ORDER BY created_at ASC
      `);
      const statusHistory = historyStmt.all(id);

      res.json({ appointment, statusHistory });
    } catch (err: any) {
      console.error('[AppointmentController.getById] Erro:', err);
      res.status(500).json({ error: 'Erro ao buscar agendamento' });
    }
  }

  static create(req: Request, res: Response): void {
    try {
      let tenantId = req.tenantId;
      const {
        tenantSlug, patientId, professionalId, serviceId, roomId,
        startTime, endTime, modality, patientNotes, internalNotes,
        // Dados se o paciente for novo (página de agendamento público)
        newPatientData
      } = req.body;

      if (!tenantId && tenantSlug) {
        const tenantRow = db.prepare("SELECT id FROM tenants WHERE slug = ? AND status = 'active'").get(tenantSlug) as { id: string } | undefined;
        if (tenantRow) tenantId = tenantRow.id;
      }

      if (!tenantId) {
        res.status(400).json({ error: 'Identificação da clínica obrigatória' });
        return;
      }

      if (!professionalId || !serviceId || !startTime || !endTime) {
        res.status(400).json({ error: 'Profissional, serviço, início e término são obrigatórios' });
        return;
      }

      // Resolve ou cria o paciente
      let resolvedPatientId = patientId;
      if (!resolvedPatientId && newPatientData) {
        const { fullName, phone, email, isChild, guardianName, guardianPhone, notes } = newPatientData;
        if (!fullName || !phone) {
          res.status(400).json({ error: 'Nome e telefone do paciente são obrigatórios' });
          return;
        }

        // Verifica se paciente com esse telefone já existe no tenant
        const existingPat = db.prepare('SELECT id FROM patients WHERE tenant_id = ? AND phone = ?').get(tenantId, phone) as { id: string } | undefined;
        if (existingPat) {
          resolvedPatientId = existingPat.id;
        } else {
          resolvedPatientId = 'pat-' + uuidv4().slice(0, 8);
          db.prepare(`
            INSERT INTO patients (id, tenant_id, full_name, phone, email, is_child, notes_admin, active)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1)
          `).run(resolvedPatientId, tenantId, fullName, phone, email || null, isChild ? 1 : 0, notes || null);

          // Se for criança e informou responsável
          if (isChild && guardianName) {
            db.prepare(`
              INSERT INTO guardians (id, tenant_id, patient_id, full_name, phone, relationship, is_primary)
              VALUES (?, ?, ?, ?, ?, 'legal_guardian', 1)
            `).run('grd-' + uuidv4().slice(0, 8), tenantId, resolvedPatientId, guardianName, guardianPhone || phone);
          }
        }
      }

      if (!resolvedPatientId) {
        res.status(400).json({ error: 'Paciente não identificado' });
        return;
      }

      // Verifica concorrência: assegura que o horário ainda está livre para este profissional
      const conflictStmt = db.prepare(`
        SELECT id FROM appointments
        WHERE tenant_id = ?
          AND professional_id = ?
          AND status NOT IN ('cancelled')
          AND start_time < ? AND end_time > ?
      `);
      const conflict = conflictStmt.get(tenantId, professionalId, endTime, startTime);
      if (conflict) {
        res.status(409).json({ error: 'Este horário acabou de ser reservado por outro cliente. Por favor, escolha outro slot.' });
        return;
      }

      const appointmentId = 'apt-' + uuidv4().slice(0, 8);
      const year = new Date().getFullYear();
      const countStmt = db.prepare('SELECT COUNT(*) as c FROM appointments WHERE tenant_id = ?');
      const count = ((countStmt.get(tenantId) as { c: number }).c || 0) + 1;
      const appointmentNumber = `AG-${year}-${count.toString().padStart(4, '0')}`;

      // Insere agendamento
      const insertAppt = db.prepare(`
        INSERT INTO appointments (
          id, tenant_id, appointment_number, patient_id, professional_id, service_id,
          room_id, start_time, end_time, status, modality, patient_notes, internal_notes, created_by
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?, ?, ?)
      `);

      insertAppt.run(
        appointmentId,
        tenantId,
        appointmentNumber,
        resolvedPatientId,
        professionalId,
        serviceId,
        roomId || null,
        startTime,
        endTime,
        modality || 'presential',
        patientNotes || null,
        internalNotes || null,
        req.user ? req.user.userId : 'online_booking'
      );

      // Insere histórico inicial
      db.prepare(`
        INSERT INTO appointment_status_history (id, appointment_id, previous_status, new_status, changed_by, reason)
        VALUES (?, ?, NULL, 'scheduled', ?, 'Agendamento criado com sucesso')
      `).run(uuidv4(), appointmentId, req.user ? req.user.name : 'Cliente Online');

      // Gera registro financeiro pendente baseado no valor do serviço
      const serviceRow = db.prepare('SELECT price FROM services WHERE id = ?').get(serviceId) as { price: number } | undefined;
      if (serviceRow && serviceRow.price > 0) {
        db.prepare(`
          INSERT INTO payments (id, tenant_id, appointment_id, patient_id, amount, payment_method, status, notes)
          VALUES (?, ?, ?, ?, ?, 'pix', 'pending', 'Gerado automaticamente pelo agendamento')
        `).run('pay-' + uuidv4().slice(0, 8), tenantId, appointmentId, resolvedPatientId, serviceRow.price);
      }

      // Enfileira notificação
      const patientData = db.prepare('SELECT full_name, phone, email FROM patients WHERE id = ?').get(resolvedPatientId) as any;
      if (patientData) {
        db.prepare(`
          INSERT INTO notifications (id, tenant_id, patient_id, professional_id, appointment_id, type, channel, recipient, content, status, scheduled_for)
          VALUES (?, ?, ?, ?, ?, 'confirmation', 'whatsapp', ?, ?, 'pending', datetime('now'))
        `).run(
          'notif-' + uuidv4().slice(0, 8),
          tenantId,
          resolvedPatientId,
          professionalId,
          appointmentId,
          patientData.phone,
          `Olá ${patientData.full_name}, seu atendimento foi agendado com sucesso para ${startTime}. Código: ${appointmentNumber}`
        );
      }

      logAudit(req, 'CREATE_APPOINTMENT', 'appointments', appointmentId, { appointmentNumber, startTime, endTime });

      res.status(201).json({
        id: appointmentId,
        appointmentNumber,
        startTime,
        endTime,
        message: 'Atendimento agendado com sucesso!'
      });
    } catch (err: any) {
      console.error('[AppointmentController.create] Erro:', err);
      res.status(500).json({ error: 'Erro ao registrar agendamento' });
    }
  }

  static updateStatus(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;
      const { status, reason } = req.body;

      const allowedStatuses = ['scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show', 'rescheduled'];
      if (!allowedStatuses.includes(status)) {
        res.status(400).json({ error: 'Status de agendamento inválido' });
        return;
      }

      const current = db.prepare('SELECT status FROM appointments WHERE id = ? AND tenant_id = ?').get(id, tenantId) as { status: string } | undefined;
      if (!current) {
        res.status(404).json({ error: 'Agendamento não encontrado' });
        return;
      }

      const updateStmt = db.prepare(`
        UPDATE appointments SET
          status = ?,
          cancellation_reason = CASE WHEN ? = 'cancelled' THEN ? ELSE cancellation_reason END,
          cancelled_at = CASE WHEN ? = 'cancelled' THEN datetime('now') ELSE cancelled_at END,
          updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ?
      `);
      updateStmt.run(status, status, reason || null, status, id, tenantId);

      // Registra histórico
      db.prepare(`
        INSERT INTO appointment_status_history (id, appointment_id, previous_status, new_status, changed_by, reason)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(uuidv4(), id, current.status, status, req.user ? req.user.name : 'Sistema', reason || null);

      logAudit(req, 'UPDATE_APPOINTMENT_STATUS', 'appointments', id, { from: current.status, to: status, reason });
      res.json({ message: `Status alterado para ${status}` });
    } catch (err: any) {
      console.error('[AppointmentController.updateStatus] Erro:', err);
      res.status(500).json({ error: 'Erro ao atualizar status do agendamento' });
    }
  }

  static reschedule(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;
      const { startTime, endTime, reason } = req.body;

      if (!startTime || !endTime) {
        res.status(400).json({ error: 'Novo horário de início e fim são obrigatórios' });
        return;
      }

      const appt = db.prepare('SELECT professional_id, status FROM appointments WHERE id = ? AND tenant_id = ?').get(id, tenantId) as { professional_id: string; status: string } | undefined;
      if (!appt) {
        res.status(404).json({ error: 'Agendamento não encontrado' });
        return;
      }

      // Verifica conflito no novo horário
      const conflict = db.prepare(`
        SELECT id FROM appointments
        WHERE tenant_id = ?
          AND professional_id = ?
          AND id != ?
          AND status NOT IN ('cancelled')
          AND start_time < ? AND end_time > ?
      `).get(tenantId, appt.professional_id, id, endTime, startTime);

      if (conflict) {
        res.status(409).json({ error: 'O novo horário escolhido já está ocupado' });
        return;
      }

      db.prepare(`
        UPDATE appointments SET
          start_time = ?,
          end_time = ?,
          status = 'rescheduled',
          updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ?
      `).run(startTime, endTime, id, tenantId);

      db.prepare(`
        INSERT INTO appointment_status_history (id, appointment_id, previous_status, new_status, changed_by, reason)
        VALUES (?, ?, ?, 'rescheduled', ?, ?)
      `).run(uuidv4(), id, appt.status, req.user ? req.user.name : 'Sistema', reason || 'Horário remarcado');

      logAudit(req, 'RESCHEDULE_APPOINTMENT', 'appointments', id, { newStart: startTime, newEnd: endTime });
      res.json({ message: 'Atendimento remarcado com sucesso' });
    } catch (err: any) {
      console.error('[AppointmentController.reschedule] Erro:', err);
      res.status(500).json({ error: 'Erro ao remarcar atendimento' });
    }
  }
}
