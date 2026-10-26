import {recordedAttendance,appointmentRecord,extractDatePart,extractTimePart,normalizeLocalDateTimeIso,getClinicLocalNowIso,addMinutesToLocalIso} from '../services/document-context.service';
import { canAccessPatient } from '../services/patient-sharing.service';
import { resolveBookingTenant, publicBookingProfessional, professionalBookingService, validBookingDate } from '../utils/public-booking';
import { calculateAvailableSlots } from '../utils/slot-calculator';
import { hasClinicalAccess } from './clinical.controller';
import { isPrimaryClinicalModule, resolveClinicalModule } from '../utils/clinical-module';
import { Request, Response } from 'express';
import { canOperate, BillingService } from '../services/billing.service';
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { logAudit } from '../middlewares/audit.middleware';
import { GoogleCalendarService } from '../services/google-calendar.service';
import { NotificationService } from '../services/notification.service';
import { WhatsAppService } from '../services/whatsapp.service';
import { isValidPhoneNumber, normalizePhoneWithDDI, buildWhatsAppReminderMessage } from '../utils/phone.utils';

function validMeetingUrl(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return true;
  if (typeof value !== 'string') return false;
  try { const url = new URL(value.trim()); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; }
}

export function validateClinicBusinessHours(tenantId: string, startTime: string, endTime: string): { valid: boolean; error?: string } {
  try {
    const tenantRow = db.prepare('SELECT business_hours_json FROM tenants WHERE id = ?').get(tenantId) as { business_hours_json?: string } | undefined;
    if (!tenantRow?.business_hours_json) return { valid: true };

    const bhList = JSON.parse(tenantRow.business_hours_json);
    if (!Array.isArray(bhList) || bhList.length === 0) return { valid: true };

    const normalizedStart = startTime.includes('T') ? startTime : startTime.replace(' ', 'T');
    const datePart = normalizedStart.slice(0, 10);
    const [y, m, d] = datePart.split('-').map(Number);
    const dayOfWeek = (!isNaN(y) && !isNaN(m) && !isNaN(d))
      ? new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay()
      : new Date(normalizedStart).getDay();
    const dayConfig = bhList.find((bh: any) => Number(bh.dayOfWeek) === dayOfWeek);

    if (!dayConfig) return { valid: true };

    if (dayConfig.isOpen === false || dayConfig.active === false) {
      return { valid: false, error: 'A clínica não realiza atendimentos neste dia da semana.' };
    }

    const timeOnly = (dStr: string) => {
      const parts = dStr.split('T');
      return parts[1]?.slice(0, 5) || '00:00';
    };
    const reqStartTime = timeOnly(startTime);
    const reqEndTime = timeOnly(endTime);

    if (dayConfig.startTime && reqStartTime < dayConfig.startTime) {
      return { valid: false, error: `O horário solicitado (${reqStartTime}) é anterior ao início do expediente da clínica (${dayConfig.startTime}).` };
    }
    if (dayConfig.endTime && reqEndTime > dayConfig.endTime) {
      return { valid: false, error: `O horário de término (${reqEndTime}) ultrapassa o expediente da clínica (${dayConfig.endTime}).` };
    }
    if (dayConfig.breakStart && dayConfig.breakEnd) {
      if (
        (reqStartTime >= dayConfig.breakStart && reqStartTime < dayConfig.breakEnd) ||
        (reqEndTime > dayConfig.breakStart && reqEndTime <= dayConfig.breakEnd) ||
        (reqStartTime <= dayConfig.breakStart && reqEndTime >= dayConfig.breakEnd)
      ) {
        return { valid: false, error: `O horário solicitado coincide com o intervalo da clínica (${dayConfig.breakStart} às ${dayConfig.breakEnd}).` };
      }
    }
    return { valid: true };
  } catch (e) {
    return { valid: true };
  }
}

export function validateProfessionalSchedule(tenantId: string, professionalId: string, startTime: string, endTime: string): { valid: boolean; error?: string } {
  try {
    const normalizedStart = startTime.includes('T') ? startTime : startTime.replace(' ', 'T');
    const normalizedEnd = endTime.includes('T') ? endTime : endTime.replace(' ', 'T');
    const datePart = normalizedStart.slice(0, 10);
    const [y, m, d] = datePart.split('-').map(Number);
    const dayOfWeek = (!isNaN(y) && !isNaN(m) && !isNaN(d))
      ? new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay()
      : new Date(normalizedStart).getDay();
    if (dayOfWeek === -1 || isNaN(dayOfWeek)) return { valid: false, error: 'Data de agendamento inválida.' };

    const timeOnly = (dStr: string) => {
      const parts = dStr.split('T');
      return parts[1]?.slice(0, 5) || '00:00';
    };
    const reqStartTime = timeOnly(normalizedStart);
    const reqEndTime = timeOnly(normalizedEnd);

    // 1. Busca os turnos de trabalho ativos do profissional para esse dia da semana
    const activeShifts = db.prepare(`
      SELECT start_time, end_time, break_start, break_end
      FROM schedules
      WHERE tenant_id = ? AND professional_id = ? AND day_of_week = ? AND is_active = 1
      ORDER BY start_time ASC
    `).all(tenantId, professionalId, dayOfWeek) as {
      start_time: string;
      end_time: string;
      break_start: string | null;
      break_end: string | null;
    }[];

    if (!activeShifts || activeShifts.length === 0) {
      return {
        valid: false,
        error: 'O profissional não possui escala de trabalho ativa neste dia da semana.'
      };
    }

    // 2. Verifica se o horário solicitado cabe integralmente em algum turno ativo sem coincidir com pausa
    let fitsInAnyShift = false;
    let breakConflict = false;

    for (const shift of activeShifts) {
      const shiftStart = shift.start_time || '08:00';
      const shiftEnd = shift.end_time || '18:00';
      const breakStart = shift.break_start;
      const breakEnd = shift.break_end;

      const insideShift = reqStartTime >= shiftStart && reqEndTime <= shiftEnd;
      let insideBreak = false;
      if (breakStart && breakEnd) {
        insideBreak = (reqStartTime >= breakStart && reqStartTime < breakEnd) ||
                      (reqEndTime > breakStart && reqEndTime <= breakEnd) ||
                      (reqStartTime <= breakStart && reqEndTime >= breakEnd);
      }

      if (insideBreak) {
        breakConflict = true;
      }

      if (insideShift && !insideBreak) {
        fitsInAnyShift = true;
        break;
      }
    }

    if (!fitsInAnyShift) {
      if (breakConflict) {
        return {
          valid: false,
          error: 'O horário solicitado coincide com o intervalo de descanso do profissional.'
        };
      }
      return {
        valid: false,
        error: 'O horário solicitado está fora da escala de trabalho ativa do profissional.'
      };
    }

    // 3. Verifica se não coincide com período de bloqueio / férias / ausência
    const block = db.prepare(`
      SELECT title FROM blocked_times
      WHERE tenant_id = ?
        AND (professional_id = ? OR professional_id IS NULL)
        AND REPLACE(start_datetime, ' ', 'T') < ?
        AND REPLACE(end_datetime, ' ', 'T') > ?
      LIMIT 1
    `).get(tenantId, professionalId, normalizedEnd, normalizedStart) as { title: string } | undefined;

    if (block) {
      return {
        valid: false,
        error: `O profissional possui um bloqueio de agenda neste horário: ${block.title || 'Ausência'}.`
      };
    }

    return { valid: true };
  } catch (e) {
    return { valid: true };
  }
}

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
          a.service_id, a.room_id, a.start_time, a.end_time, a.attendance_start_at, a.attendance_expected_end_at, a.attendance_end_at, a.status, a.modality, a.meeting_url, a.google_drive_url,
          a.patient_notes, a.internal_notes, a.cancellation_reason, a.created_at,
          a.clinical_module,
          s.clinical_module as service_clinical_module,
          pat.full_name as patient_name, pat.phone as patient_phone, pat.email as patient_email,
          pat.is_child as patient_is_child,
          p.name as professional_name, p.photo_url as professional_photo,
          s.name as service_name, s.duration_minutes, s.price as service_price,
          r.name as room_name,
          (SELECT gel.sync_status FROM google_calendar_event_links gel WHERE gel.appointment_id = a.id LIMIT 1) as google_sync_status,
          (SELECT gel.google_event_id FROM google_calendar_event_links gel WHERE gel.appointment_id = a.id LIMIT 1) as google_event_id,
          (SELECT pay.amount FROM payments pay WHERE pay.appointment_id = a.id AND pay.tenant_id = a.tenant_id ORDER BY pay.created_at ASC LIMIT 1) as payment_amount,
          (SELECT pay.status FROM payments pay WHERE pay.appointment_id = a.id AND pay.tenant_id = a.tenant_id ORDER BY pay.created_at ASC LIMIT 1) as payment_status,
          (SELECT pay.payment_method FROM payments pay WHERE pay.appointment_id = a.id AND pay.tenant_id = a.tenant_id ORDER BY pay.created_at ASC LIMIT 1) as payment_method
        FROM appointments a
        JOIN patients pat ON pat.id = a.patient_id
        JOIN professionals p ON p.id = a.professional_id
        JOIN services s ON s.id = a.service_id
        LEFT JOIN rooms r ON r.id = a.room_id
        WHERE a.tenant_id = ?
      `;
      const params: any[] = [tenantId];

      // Se for profissional logado (sem ser admin), filtra apenas seus atendimentos
      if (req.user && req.user.role === 'professional') {
        query += ' AND a.professional_id IN (SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ? AND active = 1)';
        params.push(req.user.userId, tenantId);
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
      const appointments = (stmt.all(...params) as any[]).map(row => ({
        ...row,
        display_amount: row.payment_amount !== null && row.payment_amount !== undefined
          ? row.payment_amount
          : (row.service_price !== null && row.service_price !== undefined ? row.service_price : null)
      }));
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
          s.clinical_module as service_clinical_module,
          pat.full_name as patient_name, pat.phone as patient_phone, pat.email as patient_email,
          pat.birth_date as patient_birth_date, pat.cpf as patient_cpf, pat.is_child as patient_is_child,
          p.name as professional_name, p.registration_number, p.registration_type,
          s.name as service_name, s.price as service_price, s.duration_minutes,
          r.name as room_name,
          (SELECT gel.sync_status FROM google_calendar_event_links gel WHERE gel.appointment_id = a.id LIMIT 1) as google_sync_status,
          (SELECT gel.google_event_id FROM google_calendar_event_links gel WHERE gel.appointment_id = a.id LIMIT 1) as google_event_id,
          (SELECT pay.id FROM payments pay WHERE pay.appointment_id = a.id AND pay.tenant_id = a.tenant_id ORDER BY pay.created_at ASC LIMIT 1) as payment_id,
          (SELECT pay.status FROM payments pay WHERE pay.appointment_id = a.id AND pay.tenant_id = a.tenant_id ORDER BY pay.created_at ASC LIMIT 1) as payment_status,
          (SELECT pay.amount FROM payments pay WHERE pay.appointment_id = a.id AND pay.tenant_id = a.tenant_id ORDER BY pay.created_at ASC LIMIT 1) as payment_amount,
          (SELECT pay.payment_method FROM payments pay WHERE pay.appointment_id = a.id AND pay.tenant_id = a.tenant_id ORDER BY pay.created_at ASC LIMIT 1) as payment_method
        FROM appointments a
        JOIN patients pat ON pat.id = a.patient_id AND pat.tenant_id=a.tenant_id
        JOIN professionals p ON p.id = a.professional_id AND p.tenant_id=a.tenant_id
        JOIN services s ON s.id = a.service_id AND s.tenant_id=a.tenant_id
        LEFT JOIN rooms r ON r.id = a.room_id
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

      const attendance=recordedAttendance(appointment,appointmentRecord(tenantId!,appointment.patient_id,appointment.id));
      const displayAmount = (appointment as any).payment_amount !== null && (appointment as any).payment_amount !== undefined
        ? (appointment as any).payment_amount
        : ((appointment as any).service_price !== null && (appointment as any).service_price !== undefined ? (appointment as any).service_price : null);
      res.json({ appointment:{...appointment,display_amount:displayAmount,attendance_date:attendance.sessionDate,attendance_time:attendance.sessionTime,attendance_end_time:attendance.sessionEndTime ?? null}, statusHistory });
    } catch (err: any) {
      console.error('[AppointmentController.getById] Erro:', err);
      res.status(500).json({ error: 'Erro ao buscar agendamento' });
    }
  }

  static create(req: Request, res: Response): void {
    if (!req.path.startsWith('/v1/public/')) { AppointmentController.createInternal(req, res); return; }
    // Send success only after the synchronous transaction has committed.
    let status = 200;
    let body: any;
    const pendingResponse = {
      status(code: number) { status = code; return pendingResponse; },
      json(value: any) { body = value; return pendingResponse; }
    } as unknown as Response;
    try {
      // Billing expiry opens its own transaction. Run it before the atomic booking
      // transaction; subscription eligibility is still checked inside createInternal.
      BillingService.expireGrace();
      db.transaction(() => AppointmentController.createInternal(req, pendingResponse))();
      res.status(status).json(body);
    } catch (err) {
      console.error('[AppointmentController.createPublic] Erro:', err);
      res.status(500).json({ error: 'Não foi possível concluir o agendamento. Tente novamente.' });
    }
  }

  private static createInternal(req: Request, res: Response): void {
    try {
      let tenantId = req.tenantId;
      const {
        tenantSlug, patientId, professionalId, serviceId, roomId,
        startTime, endTime, modality, meeting_url, patientNotes, internalNotes,
        insuranceId, referredFromAppointmentId, referredByProfessionalId, referralReason,
        // Dados se o paciente for novo (página de agendamento público)
        newPatientData
      } = req.body;

      const rawDriveUrl = req.body.google_drive_url !== undefined ? req.body.google_drive_url : req.body.googleDriveUrl;
      if (!validMeetingUrl(meeting_url) || !validMeetingUrl(rawDriveUrl)) {
        res.status(400).json({ error: 'Informe um link HTTPS válido para a teleconsulta ou Google Drive.' }); return;
      }

      const isPublic = req.path.startsWith('/v1/public/');
      if (isPublic) {
        const tenant = resolveBookingTenant(tenantSlug, req.body.bookingSequence);
        const individualSlug = typeof req.body.professionalSlug === 'string' ? req.body.professionalSlug : undefined;
        if (!tenant || (!individualSlug && tenant.public_booking_enabled !== 1)) {
          res.status(404).json({ error: 'Agendamento online indisponível.' }); return;
        }
        tenantId = tenant.id;
        if (!publicBookingProfessional(tenant.id, String(professionalId), individualSlug) || !professionalBookingService(tenant.id, String(professionalId), String(serviceId))) {
          res.status(404).json({ error: 'Atendimento indisponível.' }); return;
        }
        if (patientId || roomId || internalNotes || insuranceId || referredFromAppointmentId || referredByProfessionalId || referralReason || rawDriveUrl !== undefined) {
          res.status(400).json({ error: 'Dados de agendamento inválidos.' }); return;
        }
        if (!newPatientData || typeof newPatientData.fullName !== 'string' || newPatientData.fullName.trim().length < 2 || newPatientData.fullName.length > 150 || typeof newPatientData.phone !== 'string' || !/^\d{10,13}$/.test(newPatientData.phone.replace(/\D/g, '')) || (newPatientData.email && (typeof newPatientData.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newPatientData.email) || newPatientData.email.length > 254)) || (newPatientData.isChild && (typeof newPatientData.guardianName !== 'string' || !newPatientData.guardianName.trim())) || String(patientNotes || '').length > 1000 || String(newPatientData.notes || '').length > 1000) {
          res.status(400).json({ error: 'Revise o nome, telefone e demais dados informados.' }); return;
        }
        const service = professionalBookingService(tenant.id, String(professionalId), String(serviceId));
        if (!['presential', 'online', 'home'].includes(modality) || (service.modality !== 'both' && service.modality !== modality) || (service.modality === 'both' && modality === 'home')) {
          res.status(400).json({ error: 'Modalidade indisponível para este atendimento.' }); return;
        }
        const start = String(startTime || '').replace(' ', 'T');
        const end = String(endTime || '').replace(' ', 'T');
        if (!validBookingDate(start.slice(0, 10)) || !calculateAvailableSlots(tenant.id, String(professionalId), String(serviceId), start.slice(0, 10)).some(slot => slot.startTime === start && slot.endTime === end)) {
          res.status(409).json({ code: 'SLOT_UNAVAILABLE', error: 'Este horário não está mais disponível. Escolha outro horário.' }); return;
        }
      }
      if (!tenantId) {
        res.status(400).json({ error: 'Identificação da clínica obrigatória' });
        return;
      }

      if (!professionalId || !serviceId || !startTime || !endTime) {
        res.status(400).json({ error: 'Profissional, serviço, início e término são obrigatórios' });
        return;
      }

      if (!db.prepare("SELECT 1 FROM tenants WHERE id = ? AND status = 'active'").get(tenantId)) {
        res.status(403).json({ error: 'O acesso a esta clínica está bloqueado.' }); return;
      }
      if (!isPublic) BillingService.expireGrace();
      if (!canOperate(tenantId)) { res.status(isPublic ? 404 : 402).json(isPublic ? {error:'Agendamento online indisponível.'} : {code:'SUBSCRIPTION_REQUIRED',error:'Agendamento indisponível. A clínica precisa regularizar sua assinatura.'}); return; }
      const serviceRow = db.prepare('SELECT id, price, professional_id FROM services WHERE id = ? AND tenant_id = ?').get(serviceId, tenantId) as { id: string; price: number; professional_id: string | null } | undefined;
      if (!serviceRow) { res.status(400).json({ error: 'Serviço não pertence à clínica.' }); return; }
      // Only the existing authenticated scheduling flow can set a custom price.
      if (isPublic && req.body.appointmentPrice !== undefined) {
        res.status(400).json({ error: 'Dados de agendamento inválidos.' }); return;
      }
      const suppliedPrice = req.body.appointmentPrice;
      const appointmentPrice = suppliedPrice === undefined ? serviceRow.price : suppliedPrice;
      if (typeof appointmentPrice !== 'number' || !Number.isFinite(appointmentPrice) || appointmentPrice < 0 ||
          !Number.isSafeInteger(Math.round(appointmentPrice * 100)) || Math.abs(appointmentPrice * 100 - Math.round(appointmentPrice * 100)) > 0.000001) {
        res.status(400).json({ error: 'Valor da consulta inválido. Informe um número não negativo com até duas casas decimais.' }); return;
      }
      const agreedAmount = Math.round(appointmentPrice * 100) / 100;

      // Resolve ou cria o paciente
      let resolvedPatientId = patientId;
      if (!resolvedPatientId && newPatientData) {
        const { fullName, phone, email, isChild, guardianName, guardianPhone, notes } = newPatientData;
        if (!fullName || !phone) {
          res.status(400).json({ error: 'Nome e telefone do paciente são obrigatórios' });
          return;
        }

        const existingPatient = db.prepare(`
          SELECT id FROM patients WHERE tenant_id = ? AND (phone = ? OR (email IS NOT NULL AND email = ?))
        `).get(tenantId, phone, email || '') as { id: string } | undefined;

        if (existingPatient) {
          resolvedPatientId = existingPatient.id;
        } else {
          resolvedPatientId = 'pat-' + uuidv4().slice(0, 8);
          db.prepare(`
            INSERT INTO patients (id, tenant_id, full_name, phone, email, is_child, notes_admin, active)
          VALUES (?, ?, ?, ?, ?, ?, ?, 1)
          `).run(resolvedPatientId, tenantId, fullName, phone, email || null, isChild ? 1 : 0, notes || null);

          if (isChild && guardianName) {
            // O agendamento público não coleta a autorização do responsável: fica pendente para a clínica registrar.
            db.prepare(`
              INSERT INTO guardians (id, tenant_id, patient_id, full_name, phone, relationship, is_primary, authorization_signed)
              VALUES (?, ?, ?, ?, ?, 'legal_guardian', 1, 0)
            `).run('grd-' + uuidv4().slice(0, 8), tenantId, resolvedPatientId, guardianName, guardianPhone || phone);
          }
        }
      }

      if (!resolvedPatientId) {
        res.status(400).json({ error: 'Paciente não identificado' });
        return;
      }

      const ownsPatient = db.prepare('SELECT 1 FROM patients WHERE id=? AND tenant_id=?').get(resolvedPatientId,tenantId);
      if (!ownsPatient && (!req.user || !canAccessPatient(req.user.userId,tenantId,resolvedPatientId,'appointments'))) {
        res.status(403).json({error:'Paciente não autorizado para agendamento nesta clínica.'}); return;
      }

      const normalizedStartTime = String(startTime).trim().replace(' ', 'T');
      const normalizedEndTime = String(endTime).trim().replace(' ', 'T');

      const isRetroactive = !isPublic && Boolean(req.body.isRetroactive || req.body.is_retroactive);
      const isCustomTime = Boolean(req.body.isCustomTime || req.body.is_custom_time || isRetroactive);

      // 0. Validação dos horários de funcionamento da clínica (Item 3) e escala de trabalho (Item 1)
      // Agendamento em horário avulso (!isPublic && isCustomTime) é exceção pontual que permite horário fora da disponibilidade habitual
      if (!isCustomTime || isPublic) {
        const hoursCheck = validateClinicBusinessHours(tenantId, normalizedStartTime, normalizedEndTime);
        if (!hoursCheck.valid) {
          res.status(400).json({ error: hoursCheck.error });
          return;
        }

        // 0b. Validação da escala de trabalho ativa do profissional (Item 1)
        const scheduleCheck = validateProfessionalSchedule(tenantId, professionalId, normalizedStartTime, normalizedEndTime);
        if (!scheduleCheck.valid) {
          res.status(400).json({ error: scheduleCheck.error });
          return;
        }
      }

      // 1. Verifica concorrência do PROFISSIONAL (Item 7)
      const profConflict = db.prepare(`
        SELECT a.id, a.start_time, a.end_time, p.name as professional_name, s.name as service_name
        FROM appointments a
        JOIN professionals p ON p.id = a.professional_id
        JOIN services s ON s.id = a.service_id
        WHERE a.tenant_id = ?
          AND a.professional_id = ?
          AND a.status NOT IN ('cancelled')
          AND REPLACE(a.start_time, ' ', 'T') < ? AND REPLACE(a.end_time, ' ', 'T') > ?
      `).get(tenantId, professionalId, normalizedEndTime, normalizedStartTime) as any;

      if (profConflict) {
        res.status(409).json({
          error: 'Este horário não está mais disponível. Escolha outro horário.',
          code: 'PROFESSIONAL_SLOT_OCCUPIED',
          ...(isPublic ? {} : {
            conflict: {
              startTime: profConflict.start_time,
              endTime: profConflict.end_time,
              professionalName: profConflict.professional_name,
              serviceName: profConflict.service_name
            }
          })
        });
        return;
      }

      // 2. Verifica concorrência do PACIENTE em toda a clínica (Regra do Item 9)
      const patientConflict = db.prepare(`
        SELECT a.id, a.start_time, a.end_time, p.name as professional_name, s.name as service_name
        FROM appointments a
        JOIN professionals p ON p.id = a.professional_id
        JOIN services s ON s.id = a.service_id
        WHERE a.tenant_id = ?
          AND a.patient_id = ?
          AND a.status NOT IN ('cancelled')
          AND REPLACE(a.start_time, ' ', 'T') < ? AND REPLACE(a.end_time, ' ', 'T') > ?
      `).get(tenantId, resolvedPatientId, normalizedEndTime, normalizedStartTime) as any;

      if (patientConflict) {
        res.status(409).json({
          error: 'Este paciente já possui um atendimento neste horário.',
          code: 'PATIENT_APPOINTMENT_CONFLICT',
          ...(isPublic ? {} : { conflict: {
            startTime: patientConflict.start_time,
            endTime: patientConflict.end_time,
            professionalName: patientConflict.professional_name,
            serviceName: patientConflict.service_name
          } })
        });
        return;
      }

      // 3. Verifica concorrência da SALA física, se selecionada
      if (roomId) {
        const roomConflict = db.prepare(`
          SELECT a.id, a.start_time, a.end_time, r.name as room_name, p.name as professional_name
          FROM appointments a
          JOIN rooms r ON r.id = a.room_id
          JOIN professionals p ON p.id = a.professional_id
          WHERE a.tenant_id = ?
            AND a.room_id = ?
            AND a.status NOT IN ('cancelled')
            AND REPLACE(a.start_time, ' ', 'T') < ? AND REPLACE(a.end_time, ' ', 'T') > ?
        `).get(tenantId, roomId, normalizedEndTime, normalizedStartTime) as any;

        if (roomConflict) {
          res.status(409).json({
            error: `A sala ${roomConflict.room_name} já está ocupada neste horário por ${roomConflict.professional_name}.`,
            code: 'ROOM_CONFLICT',
            conflict: {
              roomName: roomConflict.room_name,
              professionalName: roomConflict.professional_name,
              startTime: roomConflict.start_time,
              endTime: roomConflict.end_time
            }
          });
          return;
        }
      }

      const appointmentId = 'apt-' + uuidv4().slice(0, 8);
      const year = new Date().getFullYear();
      const countStmt = db.prepare('SELECT COUNT(*) as c FROM appointments WHERE tenant_id = ?');
      const count = ((countStmt.get(tenantId) as { c: number }).c || 0) + 1;
      const appointmentNumber = `AG-${year}-${count.toString().padStart(4, '0')}`;

      // Resolução antecipada do módulo clínico e profissão do agendamento
      let initialClinicalModule: string | null = null;
      let resolvedProfessionId: string | null = null;
      if (serviceId) {
        const srv = db.prepare('SELECT clinical_module FROM services WHERE id = ? AND tenant_id = ?').get(serviceId, tenantId) as { clinical_module?: string } | undefined;
        if (srv?.clinical_module && isPrimaryClinicalModule(srv.clinical_module)) {
          initialClinicalModule = srv.clinical_module;
        }
      }
      if (!initialClinicalModule && professionalId) {
        const resolvedModule = resolveClinicalModule({ professional_id: professionalId, service_id: serviceId }, tenantId);
        if (isPrimaryClinicalModule(resolvedModule)) {
          initialClinicalModule = resolvedModule;
        }
      }
      if (professionalId) {
        const profRow = db.prepare('SELECT profession_id FROM professionals WHERE (id = ? OR user_id = ?) AND tenant_id = ?').get(professionalId, professionalId, tenantId) as { profession_id?: string } | undefined;
        if (profRow?.profession_id) {
          resolvedProfessionId = profRow.profession_id;
        }
      }

      const oldServicePrice = Math.round(Number(serviceRow.price ?? 0) * 100) / 100;
      const hasValidProfessionalServiceLink =
        !serviceRow.professional_id ||
        serviceRow.professional_id === professionalId ||
        Boolean(db.prepare('SELECT 1 FROM professional_services WHERE professional_id = ? AND service_id = ?').get(professionalId, serviceId));

      const shouldUpdateServicePrice =
        !isPublic &&
        Boolean(req.user) &&
        suppliedPrice !== undefined &&
        hasValidProfessionalServiceLink &&
        oldServicePrice !== agreedAmount;

      const initialStatus = isRetroactive ? 'in_progress' : 'scheduled';
      const initialAttendanceStartAt = isRetroactive
        ? (normalizeLocalDateTimeIso(req.body.attendanceStartAt || req.body.attendance_start_at || normalizedStartTime) || normalizedStartTime)
        : (normalizeLocalDateTimeIso(req.body.attendanceStartAt || req.body.attendance_start_at) || null);
      const initialAttendanceExpectedEndAt = isRetroactive
        ? (normalizeLocalDateTimeIso(req.body.attendanceExpectedEndAt || req.body.attendance_expected_end_at || normalizedEndTime) || normalizedEndTime)
        : (normalizeLocalDateTimeIso(req.body.attendanceExpectedEndAt || req.body.attendance_expected_end_at) || null);

      const persistAppointmentAndPrice = db.transaction(() => {
        // Insere agendamento com os novos campos de convênio e encaminhamento
        const insertAppt = db.prepare(`
          INSERT INTO appointments (
            id, tenant_id, appointment_number, patient_id, professional_id, service_id,
            room_id, start_time, end_time, attendance_start_at, attendance_expected_end_at, status, modality, meeting_url, google_drive_url, patient_notes, internal_notes,
            insurance_id, referred_from_appointment_id, referred_by_professional_id, referral_reason,
            clinical_module, profession_id,
            created_by
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        insertAppt.run(
          appointmentId,
          tenantId,
          appointmentNumber,
          resolvedPatientId,
          professionalId,
          serviceId,
          roomId || null,
          normalizedStartTime,
          normalizedEndTime,
          initialAttendanceStartAt,
          initialAttendanceExpectedEndAt,
          initialStatus,
          modality || 'presential',
          typeof meeting_url === 'string' ? meeting_url.trim() || null : null,
          typeof rawDriveUrl === 'string' ? rawDriveUrl.trim() || null : null,
          patientNotes || null,
          internalNotes || null,
          insuranceId || null,
          referredFromAppointmentId || null,
          referredByProfessionalId || null,
          referralReason || null,
          initialClinicalModule || (isRetroactive ? 'general' : null),
          resolvedProfessionId,
          req.user ? req.user.userId : 'online_booking'
        );

        // Insere histórico inicial
        db.prepare(`
          INSERT INTO appointment_status_history (id, appointment_id, previous_status, new_status, changed_by, reason)
          VALUES (?, ?, NULL, ?, ?, ?)
        `).run(uuidv4(), appointmentId, initialStatus, req.user ? req.user.name : 'Cliente Online', isRetroactive ? 'Registro de atendimento já realizado' : 'Agendamento criado com sucesso');
        if (false) db.prepare(`
        `).run(uuidv4(), appointmentId, req.user?.name || 'Cliente Online');

        // Snapshot: zero explicitamente combinado é isenção, nunca cobrança pendente.
        if (agreedAmount > 0 || suppliedPrice !== undefined) {
          db.prepare(`
            INSERT INTO payments (id, tenant_id, appointment_id, patient_id, amount, payment_method, status, notes)
            VALUES (?, ?, ?, ?, ?, 'pix', ?, 'Gerado automaticamente pelo agendamento')
          `).run('pay-' + uuidv4().slice(0, 8), tenantId, appointmentId, resolvedPatientId, agreedAmount, agreedAmount === 0 ? 'exempt' : 'pending');
        }

        if (shouldUpdateServicePrice) {
          if (!serviceRow.professional_id || serviceRow.professional_id === professionalId) {
            db.prepare(`
              UPDATE services
              SET price = ?, updated_at = datetime('now')
              WHERE id = ? AND tenant_id = ?
            `).run(agreedAmount, serviceId, tenantId);
          }

          db.prepare(`
            UPDATE professional_services
            SET custom_price = ?
            WHERE professional_id = ? AND service_id = ?
          `).run(agreedAmount, professionalId, serviceId);
        }
      });

      persistAppointmentAndPrice();

      if (shouldUpdateServicePrice) {
        logAudit(req, 'UPDATE_SERVICE_PRICE_FROM_APPOINTMENT', 'services', serviceId, {
          serviceId,
          professionalId,
          oldPrice: oldServicePrice,
          newPrice: agreedAmount,
          appointmentId,
          userId: req.user ? req.user.userId : null
        });
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

      // Agenda lembrete automático inteligente de 1 hora antes (Item 22)
      // Agenda lembrete automático inteligente de 1 hora antes (Item 22)
      if (!isRetroactive) {
        NotificationService.scheduleAppointmentReminder(appointmentId);
      }

      if (isRetroactive) {
        logAudit(req, 'CREATE_RETROACTIVE_ATTENDANCE', 'appointments', appointmentId, {
          appointmentId,
          appointmentNumber,
          attendanceDate: extractDatePart(initialAttendanceStartAt),
          attendanceStart: initialAttendanceStartAt,
          attendanceExpectedEnd: initialAttendanceExpectedEndAt,
          createdAt: new Date().toISOString(),
          createdBy: req.user ? req.user.userId : null
        });
      } else {
        logAudit(req, 'CREATE_APPOINTMENT', 'appointments', appointmentId, { appointmentNumber, startTime, endTime });
      }

      // Sincroniza de forma resiliente com o Google Calendar (sem travar a criação caso haja falha externa)
      GoogleCalendarService.syncAppointmentCreated(appointmentId, tenantId).catch(err => {
        console.warn('[AppointmentController] Falha assíncrona ao sincronizar criação com Google Calendar:', err?.message || err);
      });

      res.status(201).json({
        id: appointmentId,
        appointmentNumber,
        startTime: normalizedStartTime,
        endTime: normalizedEndTime,
        attendance_start_at: initialAttendanceStartAt,
        attendance_expected_end_at: initialAttendanceExpectedEndAt,
        status: initialStatus,
        clinical_module: initialClinicalModule || (isRetroactive ? 'general' : null),
        isRetroactive,
        message: isRetroactive ? 'Atendimento retroativo registrado com sucesso!' : 'Atendimento agendado com sucesso!'
      });
      return;

      logAudit(req, 'CREATE_APPOINTMENT', 'appointments', appointmentId, { appointmentNumber, startTime, endTime });

      res.status(201).json({
        id: appointmentId,
        appointmentNumber,
        startTime,
        endTime,
        message: 'Atendimento agendado com sucesso!'
      });
    } catch (err: any) {
      if (req.path.startsWith('/v1/public/')) throw err;
      console.error('[AppointmentController.create] Erro:', err);
      res.status(500).json({ error: 'Erro ao registrar agendamento' });
    }
  }

  static updateStatus(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;
      const { status, reason, cancellationReasonCategory, clinicalModule: requestedModule, professionId } = req.body;

      const allowedStatuses = ['scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show', 'rescheduled'];
      if (!allowedStatuses.includes(status)) {
        res.status(400).json({ error: 'Status de agendamento inválido' });
        return;
      }

      const current = db.prepare(`
        SELECT a.id, a.patient_id, a.status, a.clinical_module, a.professional_id, a.profession_id, a.service_id,
               a.start_time, a.end_time, a.attendance_start_at, a.attendance_expected_end_at, a.attendance_end_at,
               s.duration_minutes
        FROM appointments a
        LEFT JOIN services s ON s.id = a.service_id AND s.tenant_id = a.tenant_id
        WHERE a.id = ? AND a.tenant_id = ?
      `).get(id, tenantId) as {
        patient_id: string;
        status: string;
        clinical_module?: string;
        professional_id?: string;
        profession_id?: string;
        service_id?: string;
        start_time: string;
        end_time: string;
        attendance_start_at?: string | null;
        attendance_expected_end_at?: string | null;
        attendance_end_at?: string | null;
        duration_minutes?: number | null;
      } | undefined;
      if (!current) {
        res.status(404).json({ error: 'Agendamento não encontrado' });
        return;
      }

      if (status === 'in_progress') {
        const assignedProfessional = db.prepare('SELECT user_id, active FROM professionals WHERE id=? AND tenant_id=?')
          .get(current.professional_id, tenantId) as any;
        if (!req.user || !['professional', 'clinic_admin'].includes(req.user.role) ||
            !assignedProfessional || assignedProfessional.active !== 1 ||
            (req.user.role === 'professional' && assignedProfessional.user_id !== req.user.userId) ||
            !hasClinicalAccess(req, current.patient_id)) {
          res.status(403).json({ error: 'Sem permissão para iniciar o atendimento. Verifique o vínculo ativo do profissional com esta clínica.' });
          return;
        }
      }

      // Resolução antecipada do módulo atual e do módulo canônico da profissão
      const rawCurrentModule = current.clinical_module;
      const resolvedProfModule = resolveClinicalModule(current, tenantId) || undefined;

      // Determinação do módulo alvo:
      // Se requestedModule for módulo primário válido, prioriza-o
      // Caso contrário, se o profissional resolver para módulo primário, adota-o
      // Caso contrário, se o agendamento já tiver módulo não-nulo e diferente de 'ZemdaBody', mantém-no
      // Se for transição para 'in_progress', fallback para 'general' se nada específico foi resolvido
      let clinicalModule: string | undefined = undefined;
      if (isPrimaryClinicalModule(requestedModule)) {
        clinicalModule = requestedModule;
      } else if (isPrimaryClinicalModule(resolvedProfModule)) {
        clinicalModule = resolvedProfModule;
      } else if (rawCurrentModule && rawCurrentModule !== 'ZemdaBody' && rawCurrentModule !== 'Zemda360') {
        clinicalModule = rawCurrentModule;
      } else if (status === 'in_progress') {
        clinicalModule = resolvedProfModule || 'general';
      }

      // Regra de Imutabilidade Estrita:
      // Bloqueia troca APENAS quando for mudança REAL e conflitante entre módulos clínicos específicos diferentes
      // (ex.: ZemdaOdonto -> ZemdaFisio, ou ZemdaFono -> ZemdaPsico).
      // Se o módulo atual for 'general', nulo, 'Zemda360' ou 'ZemdaBody' e o alvo for módulo primário, é PROMOÇÃO SEGURA.
      if (
        isPrimaryClinicalModule(rawCurrentModule) &&
        isPrimaryClinicalModule(clinicalModule) &&
        rawCurrentModule !== clinicalModule
      ) {
        res.status(409).json({
          error: `O atendimento já foi iniciado com o módulo "${rawCurrentModule}". Não é permitido alterar o módulo clínico durante o atendimento.`
        });
        return;
      }

      // Verifica se já existe evolução salva em outro módulo para este agendamento
      if (clinicalModule) {
        const existingRec = db.prepare("SELECT id, module_type, clinical_evolution, module_data_json FROM records WHERE appointment_id = ? AND tenant_id = ? AND module_type IS NOT NULL AND module_type NOT IN ('ZemdaBody', 'Zemda360') LIMIT 1").get(id, tenantId) as any;
        if (existingRec && existingRec.module_type) {
          if (isPrimaryClinicalModule(existingRec.module_type) && existingRec.module_type !== clinicalModule) {
            res.status(409).json({
              error: `O prontuário deste atendimento já foi registrado no módulo "${existingRec.module_type}". Não é permitido salvar em módulos diferentes.`
            });
            return;
          }
          // Promoção segura de prontuário legado 'general' quando promovendo agendamento para módulo canônico
          if (existingRec.module_type === 'general' && isPrimaryClinicalModule(clinicalModule)) {
            db.prepare("UPDATE records SET module_type = ? WHERE id = ?").run(clinicalModule, existingRec.id);
          }
        }
      }

      // Resolução segura de profession_id
      let resolvedProfessionId = professionId || current.profession_id || null;
      if (!resolvedProfessionId && current.professional_id) {
        const profRow = db.prepare('SELECT profession_id FROM professionals WHERE (id = ? OR user_id = ?) AND tenant_id = ?').get(current.professional_id, current.professional_id, tenantId) as { profession_id?: string } | undefined;
        if (profRow?.profession_id) resolvedProfessionId = profRow.profession_id;
      }
      if (!resolvedProfessionId && (req.user as any)?.professionId) {
        resolvedProfessionId = (req.user as any).professionId;
      }

      const cancelledBy = req.user ? `${req.user.name} (${req.user.role})` : 'Usuário';
      if (status === 'completed' && current.status !== 'completed') {
        res.status(409).json({ error: 'Finalize pelo atendimento para salvar o prontuário e registrar o recebimento.' });
        return;
      }

      // Cálculo/preservação do horário real ao iniciar atendimento (Itens 7 e 8)
      let nextAttendanceStartAt: string | null = current.attendance_start_at || null;
      let nextAttendanceExpectedEndAt: string | null = current.attendance_expected_end_at || null;
      if (status === 'in_progress') {
        const requestedStart = normalizeLocalDateTimeIso(req.body.attendanceStartAt || req.body.attendance_start_at);
        const requestedExpectedEnd = normalizeLocalDateTimeIso(req.body.attendanceExpectedEndAt || req.body.attendance_expected_end_at);
        // Se o profissional já tiver ajustado attendance_start_at antes de clicar Iniciar, PRESERVAR esse valor.
        if (!nextAttendanceStartAt) {
          nextAttendanceStartAt = requestedStart || getClinicLocalNowIso();
        }
        const durationMin = Number(current.duration_minutes) > 0 ? Number(current.duration_minutes) : 50;
        if (!nextAttendanceExpectedEndAt) {
          nextAttendanceExpectedEndAt = requestedExpectedEnd || addMinutesToLocalIso(nextAttendanceStartAt, durationMin);
        }
      }
      if (status === 'completed' && current.status !== 'completed') {
        res.status(409).json({ error: 'Finalize pelo atendimento para salvar o prontuário e registrar o recebimento.' });
        return;
      }

      const updateStmt = db.prepare(`UPDATE appointments SET status = ?, cancellation_reason = CASE WHEN ? = 'cancelled' THEN ? ELSE cancellation_reason END, cancellation_reason_category = CASE WHEN ? = 'cancelled' THEN ? ELSE cancellation_reason_category END, cancelled_by = CASE WHEN ? = 'cancelled' THEN ? ELSE cancelled_by END, cancelled_at = CASE WHEN ? = 'cancelled' THEN datetime('now') ELSE cancelled_at END, clinical_module = COALESCE(?, NULLIF(NULLIF(clinical_module, 'ZemdaBody'), 'Zemda360')), profession_id = COALESCE(?, profession_id), attendance_start_at = COALESCE(?, attendance_start_at), attendance_expected_end_at = COALESCE(?, attendance_expected_end_at), updated_at = datetime('now') WHERE id = ? AND tenant_id = ?`);
      updateStmt.run(status, status, reason || null, status, cancellationReasonCategory || (status === 'cancelled' ? 'Outro' : null), status, status === 'cancelled' ? cancelledBy : null, status, clinicalModule || null, resolvedProfessionId || null, nextAttendanceStartAt, nextAttendanceExpectedEndAt, id, tenantId);
      // Registra histórico
      db.prepare(`
        INSERT INTO appointment_status_history (id, appointment_id, previous_status, new_status, changed_by, reason)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        uuidv4(),
        id,
        current.status,
        status,
        req.user ? req.user.name : 'Sistema',
        reason ? (cancellationReasonCategory ? `[${cancellationReasonCategory}] ${reason}` : reason) : null
      );

      logAudit(req, 'UPDATE_APPOINTMENT_STATUS', 'appointments', id, { from: current.status, to: status, reason, cancellationReasonCategory });

      if (status === 'cancelled') {
        NotificationService.cancelAppointmentReminders(id as string);
        if (tenantId) {
          GoogleCalendarService.syncAppointmentCancelled(id as string, tenantId).catch(err => {
            console.warn('[AppointmentController] Falha ao cancelar no Google Calendar:', err?.message || err);
          });
        }
      } else if (current.status === 'cancelled' && ['scheduled', 'confirmed'].includes(status)) {
        if (tenantId) {
          GoogleCalendarService.syncAppointmentCreated(id as string, tenantId).catch(err => {
            console.warn('[AppointmentController] Falha ao reativar no Google Calendar:', err?.message || err);
          });
        }
      }

      res.json({
        message: `Status alterado para ${status}`,
        status,
        clinicalModule: clinicalModule || current.clinical_module || null,
        attendance_start_at: nextAttendanceStartAt,
        attendance_expected_end_at: nextAttendanceExpectedEndAt,
        attendance_end_at: current.attendance_end_at || null
      });
    } catch (err: any) {
      console.error('[AppointmentController.updateStatus] Erro:', err);
      res.status(500).json({ error: 'Erro ao atualizar status do agendamento' });
    }
  }

  static updateAttendanceTime(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: 'Identificação da clínica obrigatória' });
        return;
      }

      const current = db.prepare(`
        SELECT a.id, a.patient_id, a.professional_id, a.service_id, a.status,
               a.start_time, a.end_time,
               a.attendance_start_at, a.attendance_expected_end_at, a.attendance_end_at,
               s.duration_minutes
        FROM appointments a
        LEFT JOIN services s ON s.id = a.service_id AND s.tenant_id = a.tenant_id
        WHERE a.id = ? AND a.tenant_id = ?
      `).get(id, tenantId) as any;

      if (!current) {
        res.status(404).json({ error: 'Agendamento não encontrado' });
        return;
      }

      const {
        attendanceDate,
        attendanceStartTime,
        attendanceExpectedEndTime,
        attendanceEndTime,
        attendanceStartAt,
        attendanceExpectedEndAt,
        attendanceEndAt
      } = req.body || {};

      const baseDate =
        extractDatePart(attendanceDate) ||
        extractDatePart(attendanceStartAt) ||
        extractDatePart(current.attendance_start_at) ||
        extractDatePart(current.start_time);

      if (!baseDate) {
        res.status(400).json({ error: 'Data do atendimento inválida' });
        return;
      }

      let newStartAt: string | null = null;
      if (attendanceStartAt) {
        newStartAt = normalizeLocalDateTimeIso(attendanceStartAt);
      } else if (attendanceStartTime) {
        const t = extractTimePart(attendanceStartTime);
        if (!t) {
          res.status(400).json({ error: 'Horário real de início inválido' });
          return;
        }
        newStartAt = `${baseDate}T${t}:00`;
      } else if (current.attendance_start_at) {
        const t = extractTimePart(current.attendance_start_at);
        newStartAt = t ? `${baseDate}T${t}:00` : current.attendance_start_at;
      } else {
        const t = extractTimePart(current.start_time);
        newStartAt = t ? `${baseDate}T${t}:00` : current.start_time;
      }

      if (!newStartAt) {
        res.status(400).json({ error: 'Horário real de início obrigatório' });
        return;
      }

      const durationMin = Number(current.duration_minutes) > 0 ? Number(current.duration_minutes) : 50;

      let newExpectedEndAt: string | null = null;
      if (attendanceExpectedEndAt) {
        newExpectedEndAt = normalizeLocalDateTimeIso(attendanceExpectedEndAt);
      } else if (attendanceExpectedEndTime) {
        const t = extractTimePart(attendanceExpectedEndTime);
        if (!t) {
          res.status(400).json({ error: 'Previsão de término inválida' });
          return;
        }
        newExpectedEndAt = `${baseDate}T${t}:00`;
      } else if (current.attendance_expected_end_at && newStartAt === current.attendance_start_at) {
        newExpectedEndAt = current.attendance_expected_end_at;
      } else {
        newExpectedEndAt = addMinutesToLocalIso(newStartAt, durationMin);
      }

      let newEndAt: string | null = current.attendance_end_at || null;
      if (attendanceEndAt === null || attendanceEndTime === null || attendanceEndTime === '') {
        newEndAt = null;
      } else if (attendanceEndAt) {
        newEndAt = normalizeLocalDateTimeIso(attendanceEndAt);
      } else if (attendanceEndTime) {
        const t = extractTimePart(attendanceEndTime);
        if (!t) {
          res.status(400).json({ error: 'Horário de término inválido' });
          return;
        }
        newEndAt = `${baseDate}T${t}:00`;
      }

      const editedBy = req.user ? `${req.user.name} (${req.user.role})` : 'Sistema';
      const nowIso = new Date().toISOString();

      db.transaction(() => {
        // Atualiza SOMENTE os horários reais; start_time e end_time agendados permanecem intactos
        db.prepare(`
          UPDATE appointments SET
            attendance_start_at = ?,
            attendance_expected_end_at = ?,
            attendance_end_at = ?,
            updated_at = datetime('now')
          WHERE id = ? AND tenant_id = ?
        `).run(newStartAt, newExpectedEndAt, newEndAt, id, tenantId);

        // Se já existir prontuário vinculado a este agendamento, sincroniza data/horário clínico real e registra trilha de auditoria (Item 25)
        const linkedRecords = db.prepare(`
          SELECT id, session_date, session_time, session_end_time, edit_history_json
          FROM records
          WHERE appointment_id = ? AND tenant_id = ?
        `).all(id, tenantId) as any[];

        const newSessionDate = extractDatePart(newStartAt);
        const newSessionTime = extractTimePart(newStartAt);
        const newSessionEndTime = newEndAt ? extractTimePart(newEndAt) : null;

        for (const rec of linkedRecords) {
          const prevDate = rec.session_date || null;
          const prevTime = rec.session_time || null;
          const prevEnd = rec.session_end_time || null;
          const targetEnd = newSessionEndTime !== null ? newSessionEndTime : prevEnd;

          if (prevDate !== newSessionDate || prevTime !== newSessionTime || prevEnd !== targetEnd) {
            let history: any[] = [];
            try {
              if (rec.edit_history_json) {
                history = JSON.parse(rec.edit_history_json);
              }
            } catch (_) {}

            history.push({
              previous_session_date: prevDate,
              previous_session_time: prevTime,
              previous_session_end_time: prevEnd,
              new_session_date: newSessionDate,
              new_session_time: newSessionTime,
              new_session_end_time: targetEnd,
              edited_by: req.user?.userId || editedBy,
              edited_at: nowIso,
              reason: 'Ajuste de horário real do atendimento'
            });

            db.prepare(`
              UPDATE records SET
                session_date = COALESCE(?, session_date),
                session_time = ?,
                session_end_time = ?,
                edit_history_json = ?,
                updated_by = ?,
                updated_at = datetime('now')
              WHERE id = ? AND tenant_id = ?
            `).run(
              newSessionDate,
              newSessionTime,
              targetEnd,
              JSON.stringify(history),
              req.user?.userId || editedBy,
              rec.id,
              tenantId
            );
          }
        }
      })();

      logAudit(req, 'UPDATE_ATTENDANCE_TIME', 'appointments', String(id), {
        appointmentId: id,
        previousStart: current.attendance_start_at || null,
        newStart: newStartAt,
        previousExpectedEnd: current.attendance_expected_end_at || null,
        newExpectedEnd: newExpectedEndAt,
        previousEnd: current.attendance_end_at || null,
        newEnd: newEndAt,
        changedBy: req.user ? req.user.userId : null
      });

      res.json({
        message: 'Horário real do atendimento atualizado com sucesso',
        appointmentId: id,
        start_time: current.start_time,
        end_time: current.end_time,
        attendance_start_at: newStartAt,
        attendance_expected_end_at: newExpectedEndAt,
        attendance_end_at: newEndAt
      });
    } catch (err: any) {
      console.error('[AppointmentController.updateAttendanceTime] Erro:', err);
      res.status(500).json({ error: 'Erro ao ajustar horário do atendimento' });
    }
  }

  static reschedule(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;
      const { startTime, endTime, reason } = req.body;

      if (!tenantId) {
        res.status(400).json({ error: 'Identificação da clínica obrigatória' });
        return;
      }

      if (!startTime || !endTime) {
        res.status(400).json({ error: 'Novo horário de início e fim são obrigatórios' });
        return;
      }

      const appt = db.prepare('SELECT patient_id, professional_id, room_id, status FROM appointments WHERE id = ? AND tenant_id = ?').get(id, tenantId) as any;
      if (!appt) {
        res.status(404).json({ error: 'Agendamento não encontrado' });
        return;
      }

      const normalizedStartTime = String(startTime).trim().replace(' ', 'T');
      const normalizedEndTime = String(endTime).trim().replace(' ', 'T');

      // 0. Validação dos horários de funcionamento da clínica (Item 3)
      const hoursCheck = validateClinicBusinessHours(tenantId, normalizedStartTime, normalizedEndTime);
      if (!hoursCheck.valid) {
        res.status(400).json({ error: hoursCheck.error });
        return;
      }

      // 0b. Validação da escala de trabalho ativa do profissional
      const scheduleCheck = validateProfessionalSchedule(tenantId, appt.professional_id, normalizedStartTime, normalizedEndTime);
      if (!scheduleCheck.valid) {
        res.status(400).json({ error: scheduleCheck.error });
        return;
      }

      // 1. Conflito de profissional (Item 7)
      const conflict = db.prepare(`
        SELECT id FROM appointments
        WHERE tenant_id = ?
          AND professional_id = ?
          AND id != ?
          AND status NOT IN ('cancelled')
          AND REPLACE(start_time, ' ', 'T') < ? AND REPLACE(end_time, ' ', 'T') > ?
      `).get(tenantId, appt.professional_id, id, normalizedEndTime, normalizedStartTime);

      if (conflict) {
        res.status(409).json({ error: 'Este horário não está mais disponível. Escolha outro horário.' });
        return;
      }

      // 2. Conflito do paciente
      if (appt.patient_id) {
        const patientConflict = db.prepare(`
          SELECT a.id, a.start_time, a.end_time, p.name as professional_name, s.name as service_name
          FROM appointments a
          JOIN professionals p ON p.id = a.professional_id
          JOIN services s ON s.id = a.service_id
          WHERE a.tenant_id = ?
            AND a.patient_id = ?
            AND a.id != ?
            AND a.status NOT IN ('cancelled')
            AND REPLACE(a.start_time, ' ', 'T') < ? AND REPLACE(a.end_time, ' ', 'T') > ?
        `).get(tenantId, appt.patient_id, id, normalizedEndTime, normalizedStartTime) as any;

        if (patientConflict) {
          res.status(409).json({
            error: 'Este paciente já possui outro atendimento neste horário.',
            code: 'PATIENT_APPOINTMENT_CONFLICT',
            conflict: {
              startTime: patientConflict.start_time,
              endTime: patientConflict.end_time,
              professionalName: patientConflict.professional_name,
              serviceName: patientConflict.service_name
            }
          });
          return;
        }
      }

      // 3. Conflito de sala
      if (appt.room_id) {
        const roomConflict = db.prepare(`
          SELECT a.id, a.start_time, a.end_time, r.name as room_name, p.name as professional_name
          FROM appointments a
          JOIN rooms r ON r.id = a.room_id
          JOIN professionals p ON p.id = a.professional_id
          WHERE a.tenant_id = ?
            AND a.room_id = ?
            AND a.id != ?
            AND a.status NOT IN ('cancelled')
            AND REPLACE(a.start_time, ' ', 'T') < ? AND REPLACE(a.end_time, ' ', 'T') > ?
        `).get(tenantId, appt.room_id, id, normalizedEndTime, normalizedStartTime) as any;

        if (roomConflict) {
          res.status(409).json({
            error: `A sala ${roomConflict.room_name} já está ocupada neste horário por ${roomConflict.professional_name}.`,
            code: 'ROOM_CONFLICT'
          });
          return;
        }
      }

      db.prepare(`
        UPDATE appointments SET
          start_time = ?,
          end_time = ?,
          status = 'rescheduled',
          updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ?
      `).run(normalizedStartTime, normalizedEndTime, id, tenantId);

      db.prepare(`
        INSERT INTO appointment_status_history (id, appointment_id, previous_status, new_status, changed_by, reason)
        VALUES (?, ?, ?, 'rescheduled', ?, ?)
      `).run(uuidv4(), id, appt.status, req.user ? req.user.name : 'Sistema', reason || 'Horário remarcado');

      // Atualiza os lembretes automáticos para o novo horário (Item 24)
      NotificationService.cancelAppointmentReminders(id as string);
      NotificationService.scheduleAppointmentReminder(id as string);

      logAudit(req, 'RESCHEDULE_APPOINTMENT', 'appointments', id, { newStart: normalizedStartTime, newEnd: normalizedEndTime });
      res.json({ message: 'Atendimento remarcado com sucesso' });
    } catch (err: any) {
      console.error('[AppointmentController.reschedule] Erro:', err);
      res.status(500).json({ error: 'Erro ao remarcar atendimento' });
    }
  }

  static update(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(401).json({ error: 'Tenant ID required' });
        return;
      }
      const {
        serviceId,
        professionalId,
        roomId,
        insuranceId,
        startTime,
        endTime,
        notes,
        internalNotes,
        modality,
        meeting_url,
        reason
      } = req.body;
      const isCustomTime = Boolean(req.body.isCustomTime || req.body.is_custom_time);
      const rawDriveUrl = req.body.google_drive_url !== undefined ? req.body.google_drive_url : req.body.googleDriveUrl;
      if (!validMeetingUrl(meeting_url) || !validMeetingUrl(rawDriveUrl) || (modality !== undefined && !['presential', 'online', 'home'].includes(modality))) {
        res.status(400).json({ error: 'Modalidade ou link HTTPS da teleconsulta inválido.' }); return;
      }

      const appt = db.prepare('SELECT * FROM appointments WHERE id = ? AND tenant_id = ?').get(id, tenantId) as any;
      if (!appt) {
        res.status(404).json({ error: 'Agendamento não encontrado' });
        return;
      }

      if (appt.status === 'completed' || appt.status === 'cancelled') {
        res.status(400).json({ error: 'Não é permitido editar ou remarcar um atendimento concluído ou cancelado.' });
        return;
      }

      const origStart = String(appt.start_time || '').trim().replace(' ', 'T');
      const origEnd = String(appt.end_time || '').trim().replace(' ', 'T');

      let newStart = origStart;
      let newEnd = origEnd;

      if (startTime) {
        newStart = String(startTime).trim().replace(' ', 'T');
      }
      if (endTime) {
        newEnd = String(endTime).trim().replace(' ', 'T');
      }

      const safeProfId = String(professionalId || appt.professional_id || '');
      const safeStart = String(newStart || '');
      const safeEnd = String(newEnd || '');
      const safeRoomId = roomId !== undefined ? (roomId || null) : (appt.room_id || null);

      const startChanged = safeStart.slice(0, 16) !== origStart.slice(0, 16);
      const endChanged = safeEnd.slice(0, 16) !== origEnd.slice(0, 16);
      const profChanged = Boolean(professionalId && String(professionalId) !== String(appt.professional_id));
      const serviceChanged = Boolean(serviceId && String(serviceId) !== String(appt.service_id));
      const roomChanged = roomId !== undefined && (roomId || null) !== (appt.room_id || null);

      if (appt.status === 'in_progress' && (startChanged || profChanged || serviceChanged)) {
        res.status(400).json({ error: 'Não é permitido alterar data, horário agendado, profissional ou serviço de um atendimento em andamento.' });
        return;
      }

      if (startChanged || endChanged || profChanged) {
        if (!isCustomTime) {
          const hoursCheck = validateClinicBusinessHours(tenantId, safeStart, safeEnd);
          if (!hoursCheck.valid) {
            res.status(400).json({ error: hoursCheck.error });
            return;
          }

          const scheduleCheck = validateProfessionalSchedule(tenantId, safeProfId, safeStart, safeEnd);
          if (!scheduleCheck.valid) {
            res.status(400).json({ error: scheduleCheck.error });
            return;
          }
        }

        const profConflict = db.prepare(`
          SELECT a.id, a.start_time, a.end_time, p.name as professional_name, s.name as service_name
          FROM appointments a
          JOIN professionals p ON p.id = a.professional_id
          JOIN services s ON s.id = a.service_id
          WHERE a.tenant_id = ?
            AND a.professional_id = ?
            AND a.id != ?
            AND a.status NOT IN ('cancelled')
            AND REPLACE(a.start_time, ' ', 'T') < ? AND REPLACE(a.end_time, ' ', 'T') > ?
        `).get(tenantId, safeProfId, id, safeEnd, safeStart) as any;

        if (profConflict) {
          res.status(409).json({
            error: 'Este horário não está mais disponível. Escolha outro horário.',
            code: 'PROFESSIONAL_SLOT_OCCUPIED',
            conflict: {
              startTime: profConflict.start_time,
              endTime: profConflict.end_time,
              professionalName: profConflict.professional_name,
              serviceName: profConflict.service_name
            }
          });
          return;
        }

        if (appt.patient_id) {
          const patientConflict = db.prepare(`
            SELECT a.id, a.start_time, a.end_time, p.name as professional_name, s.name as service_name
            FROM appointments a
            JOIN professionals p ON p.id = a.professional_id
            JOIN services s ON s.id = a.service_id
            WHERE a.tenant_id = ?
              AND a.patient_id = ?
              AND a.id != ?
              AND a.status NOT IN ('cancelled')
              AND REPLACE(a.start_time, ' ', 'T') < ? AND REPLACE(a.end_time, ' ', 'T') > ?
          `).get(tenantId, appt.patient_id, id, safeEnd, safeStart) as any;

          if (patientConflict) {
            res.status(409).json({
              error: 'Este paciente já possui outro atendimento neste horário.',
              code: 'PATIENT_APPOINTMENT_CONFLICT',
              conflict: {
                startTime: patientConflict.start_time,
                endTime: patientConflict.end_time,
                professionalName: patientConflict.professional_name,
                serviceName: patientConflict.service_name
              }
            });
            return;
          }
        }
      }

      if ((startChanged || endChanged || roomChanged) && safeRoomId) {
        const roomConflict = db.prepare(`
          SELECT a.id, a.start_time, a.end_time, r.name as room_name, p.name as professional_name
          FROM appointments a
          JOIN rooms r ON r.id = a.room_id
          JOIN professionals p ON p.id = a.professional_id
          WHERE a.tenant_id = ?
            AND a.room_id = ?
            AND a.id != ?
            AND a.status NOT IN ('cancelled')
            AND REPLACE(a.start_time, ' ', 'T') < ? AND REPLACE(a.end_time, ' ', 'T') > ?
        `).get(tenantId, safeRoomId, id, safeEnd, safeStart) as any;

        if (roomConflict) {
          res.status(409).json({
            error: `A sala ${roomConflict.room_name} já está ocupada neste horário por ${roomConflict.professional_name}.`,
            code: 'ROOM_CONFLICT'
          });
          return;
        }
      }

      const nextStatus = (startChanged && ['scheduled', 'confirmed', 'no_show', 'rescheduled'].includes(appt.status))
        ? 'rescheduled'
        : appt.status;

      db.prepare(`
        UPDATE appointments SET
          service_id = COALESCE(?, service_id),
          professional_id = COALESCE(?, professional_id),
          room_id = CASE WHEN ? THEN ? ELSE room_id END,
          insurance_id = CASE WHEN ? THEN ? ELSE insurance_id END,
          start_time = ?,
          end_time = ?,
          status = ?,
          patient_notes = COALESCE(?, patient_notes),
          internal_notes = CASE WHEN ? THEN ? ELSE internal_notes END,
          modality = COALESCE(?, modality),
          meeting_url = CASE WHEN ? THEN ? ELSE meeting_url END,
          google_drive_url = CASE WHEN ? THEN ? ELSE google_drive_url END,
          updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ?
      `).run(
        serviceId || null,
        professionalId || null,
        roomId !== undefined ? 1 : 0,
        roomId || null,
        insuranceId !== undefined ? 1 : 0,
        insuranceId || null,
        safeStart,
        safeEnd,
        nextStatus,
        notes !== undefined ? notes : null,
        internalNotes !== undefined ? 1 : 0,
        typeof internalNotes === 'string' ? internalNotes.trim() || null : null,
        modality || null,
        meeting_url !== undefined ? 1 : 0,
        typeof meeting_url === 'string' ? meeting_url.trim() || null : null,
        rawDriveUrl !== undefined ? 1 : 0,
        typeof rawDriveUrl === 'string' ? rawDriveUrl.trim() || null : null,
        id,
        tenantId
      );

      if (startChanged) {
        db.prepare(`
          INSERT INTO appointment_status_history (id, appointment_id, previous_status, new_status, changed_by, reason)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(uuidv4(), id, appt.status, nextStatus, req.user ? req.user.name : 'Sistema', reason || 'Horário remarcado');

        NotificationService.cancelAppointmentReminders(id as string);
        NotificationService.scheduleAppointmentReminder(id as string);
      }

      if (tenantId) {
        GoogleCalendarService.syncAppointmentUpdated(id as string, tenantId).catch(err => {
          console.warn('[AppointmentController] Falha ao atualizar no Google Calendar:', err?.message || err);
        });
      }
      logAudit(req, 'UPDATE_APPOINTMENT', 'appointments', id, { serviceId, professionalId, roomId, insuranceId, newStart: safeStart, newEnd: safeEnd });
      res.json({ message: startChanged ? 'Atendimento remarcado com sucesso' : 'Dados do atendimento atualizados com sucesso' });
    } catch (err: any) {
      console.error('[AppointmentController.update] Erro:', err);
      res.status(500).json({ error: 'Erro ao atualizar dados do atendimento' });
    }
  }

  /**
   * Envia ou registra lembrete manual de consulta via WhatsApp (Oficial ou Fallback Link)
   * POST /v1/appointments/:id/whatsapp-reminder
   */
  static async sendWhatsAppReminder(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;
      const { messageText, fallbackOpened } = req.body || {};

      if (!tenantId) {
        res.status(400).json({ error: 'Identificação da clínica obrigatória' });
        return;
      }

      // 1. Busca dados completos do agendamento, paciente e profissional
      const appt = db.prepare(`
        SELECT a.id, a.tenant_id, a.patient_id, a.professional_id, a.start_time, a.status,
               pat.full_name as patient_name, pat.phone as patient_phone,
               t.name as clinic_name, p.name as professional_name, s.name as service_name
        FROM appointments a
        JOIN patients pat ON pat.id = a.patient_id
        JOIN tenants t ON t.id = a.tenant_id
        JOIN professionals p ON p.id = a.professional_id
        JOIN services s ON s.id = a.service_id
        WHERE a.id = ? AND a.tenant_id = ?
      `).get(id, tenantId) as any;

      if (!appt) {
        res.status(404).json({ error: 'Agendamento não encontrado' });
        return;
      }

      const phone = appt.patient_phone;
      if (!phone || !isValidPhoneNumber(phone)) {
        res.status(400).json({ error: 'Paciente sem telefone válido cadastrado' });
        return;
      }

      const normalizedPhone = normalizePhoneWithDDI(phone);
      const user = (req as any).user;
      const userId = user?.userId || user?.id || null;
      let userName = user?.name || user?.fullName || '';

      if (!userName && userId) {
        const uRow = db.prepare('SELECT name FROM users WHERE id = ?').get(userId) as any;
        if (uRow?.name) userName = uRow.name;
      }
      userName = userName || 'Usuário';

      const finalMessage = (messageText && typeof messageText === 'string' && messageText.trim().length > 0)
        ? messageText.trim()
        : buildWhatsAppReminderMessage({
            patientName: appt.patient_name,
            professionalName: appt.professional_name,
            clinicName: appt.clinic_name,
            startTime: appt.start_time,
            serviceName: appt.service_name
          });

      // 2. Se for abertura direta pelo link manual (wa.me)
      if (fallbackOpened) {
        const notifId = 'not-' + uuidv4().slice(0, 8);
        db.prepare(`
          INSERT INTO notifications (
            id, tenant_id, patient_id, professional_id, appointment_id,
            type, channel, recipient, content, status, delivery_status,
            mode, sent_by_user_id, sent_by_name, scheduled_for, sent_at
          ) VALUES (?, ?, ?, ?, ?, 'reminder_manual', 'whatsapp', ?, ?, 'sent', 'manual_opened', 'manual', ?, ?, datetime('now'), datetime('now'))
        `).run(
          notifId,
          tenantId,
          appt.patient_id,
          appt.professional_id,
          appt.id,
          normalizedPhone,
          finalMessage,
          userId,
          userName
        );

        logAudit(req, 'WHATSAPP_MANUAL_OPENED', 'appointments', appt.id, {
          recipient: normalizedPhone,
          sent_by: userName,
          channel: 'whatsapp_manual_link',
          mode: 'fallback'
        });

        res.status(200).json({
          success: true,
          mode: 'manual_opened',
          message: 'Lembrete manual registrado com sucesso'
        });
        return;
      }

      // 3. Tentativa de envio oficial via Infobip WhatsApp
      const isOfficialConnected = WhatsAppService.isConnected();
      if (!isOfficialConnected) {
        res.status(400).json({
          success: false,
          error: 'A integração oficial com a API do WhatsApp (Infobip) não está conectada no sistema.',
          canFallback: true
        });
        return;
      }

      const sendResult = await WhatsAppService.sendTextMessage({
        recipientPhone: normalizedPhone,
        messageText: finalMessage
      });

      if (!sendResult.success) {
        const notifId = 'not-' + uuidv4().slice(0, 8);
        db.prepare(`
          INSERT INTO notifications (
            id, tenant_id, patient_id, professional_id, appointment_id,
            type, channel, recipient, content, status, delivery_status,
            mode, sent_by_user_id, sent_by_name, scheduled_for, last_error
          ) VALUES (?, ?, ?, ?, ?, 'reminder_manual', 'whatsapp', ?, ?, 'failed', 'failed', 'manual', ?, ?, datetime('now'), ?)
        `).run(
          notifId,
          tenantId,
          appt.patient_id,
          appt.professional_id,
          appt.id,
          normalizedPhone,
          finalMessage,
          userId,
          userName,
          sendResult.error || 'Erro no envio da API Infobip'
        );

        res.status(502).json({
          success: false,
          error: sendResult.error || 'Falha ao enviar mensagem pela API do WhatsApp',
          canFallback: true
        });
        return;
      }

      // 4. Sucesso no envio oficial
      const notifId = 'not-' + uuidv4().slice(0, 8);
      db.prepare(`
        INSERT INTO notifications (
          id, tenant_id, patient_id, professional_id, appointment_id,
          type, channel, recipient, content, status, delivery_status,
          mode, sent_by_user_id, sent_by_name, scheduled_for, sent_at, external_message_id
        ) VALUES (?, ?, ?, ?, ?, 'reminder_manual', 'whatsapp', ?, ?, 'sent', 'delivered', 'manual', ?, ?, datetime('now'), datetime('now'), ?)
      `).run(
        notifId,
        tenantId,
        appt.patient_id,
        appt.professional_id,
        appt.id,
        normalizedPhone,
        finalMessage,
        userId,
        userName,
        sendResult.messageId || null
      );

      logAudit(req, 'WHATSAPP_REMINDER_SENT', 'appointments', appt.id, {
        recipient: normalizedPhone,
        sent_by: userName,
        channel: 'whatsapp_infobip_official',
        message_id: sendResult.messageId
      });

      res.status(200).json({
        success: true,
        mode: 'official',
        messageId: sendResult.messageId,
        message: 'Lembrete enviado com sucesso via WhatsApp!'
      });
    } catch (err: any) {
      console.error('[AppointmentController.sendWhatsAppReminder] Erro:', err);
      res.status(500).json({ error: 'Erro ao processar envio de lembrete pelo WhatsApp' });
    }
  }

  /**
   * Consulta histórico de comunicações/lembretes de um agendamento
   * GET /v1/appointments/:id/communications
   */
  static getCommunications(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;

      if (!tenantId) {
        res.status(400).json({ error: 'Identificação da clínica obrigatória' });
        return;
      }

      const rows = db.prepare(`
        SELECT id, type, channel, recipient, content, status, delivery_status,
               mode, sent_by_name, sent_at, scheduled_for, last_error, created_at
        FROM notifications
        WHERE appointment_id = ? AND tenant_id = ?
        ORDER BY created_at DESC
      `).all(id, tenantId);

      res.json(rows);
    } catch (err: any) {
      console.error('[AppointmentController.getCommunications] Erro:', err);
      res.status(500).json({ error: 'Erro ao buscar comunicações do agendamento' });
    }
  }
}
