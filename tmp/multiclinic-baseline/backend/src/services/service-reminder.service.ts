import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';

export interface CreateReminderParams {
  clinicId: string;
  professionalId: string;
  patientId: string;
  serviceId: string;
  appointmentId?: string | null;
  baseDate?: Date | string;
}

export class ServiceReminderService {
  /**
   * Calcula a data de vencimento (due_at) somando quantidade e unidade à data-base de conclusão.
   * Exemplo: 07/10/2026 + 6 meses => 07/04/2027
   */
  static calculateDueDate(
    baseDate: Date | string,
    value: number,
    unit: 'DAYS' | 'MONTHS' | 'YEARS' | string
  ): string {
    const raw = typeof baseDate === 'string' ? new Date(baseDate.includes('T') ? baseDate : `${baseDate}T12:00:00`) : new Date(baseDate.getTime());
    const d = isNaN(raw.getTime()) ? new Date() : raw;

    const normalizedUnit = (unit || 'DAYS').toUpperCase();

    if (normalizedUnit === 'MONTHS') {
      const originalDay = d.getDate();
      const targetMonth = d.getMonth() + value;
      d.setMonth(targetMonth);
      // Se virou para o próximo mês devido a overflow de dias (ex: 31 de janeiro + 1 mês => 28/29 de fevereiro)
      if (d.getDate() !== originalDay) {
        d.setDate(0); // Último dia do mês anterior
      }
    } else if (normalizedUnit === 'YEARS') {
      const originalDay = d.getDate();
      const originalMonth = d.getMonth();
      d.setFullYear(d.getFullYear() + value);
      // Caso de ano bissexto (29 de fevereiro)
      if (d.getMonth() !== originalMonth) {
        d.setDate(0);
      }
    } else {
      // DAYS
      d.setDate(d.getDate() + value);
    }

    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Cria o lembrete de contato/retorno apenas se o serviço estiver com a opção ativada
   * e o atendimento tiver sido efetivamente finalizado/realizado.
   * Evita duplicidade para o mesmo atendimento/serviço.
   */
  static createReminderIfEnabled(params: CreateReminderParams) {
    try {
      const { clinicId, professionalId, patientId, serviceId, appointmentId, baseDate } = params;

      if (!clinicId || !professionalId || !patientId || !serviceId) {
        return null;
      }

      // 1. Busca configurações de lembrete do serviço
      const service = db.prepare(`
        SELECT id, name, reminder_enabled, reminder_value, reminder_unit
        FROM services
        WHERE id = ? AND tenant_id = ?
      `).get(serviceId, clinicId) as any;

      if (!service || !service.reminder_enabled || !service.reminder_value || service.reminder_value <= 0) {
        return null; // Serviço não tem lembrete ativo
      }

      // 2. Previne duplicidade se já houver lembrete para este mesmo atendimento e serviço
      if (appointmentId) {
        const existing = db.prepare(`
          SELECT id FROM service_reminders
          WHERE appointment_id = ? AND service_id = ?
        `).get(appointmentId, serviceId) as any;

        if (existing) {
          return existing;
        }
      }

      // 3. Calcula data de vencimento com base na data de conclusão
      const dueAt = this.calculateDueDate(
        baseDate || new Date(),
        Number(service.reminder_value),
        service.reminder_unit || 'DAYS'
      );

      const reminderId = 'srem-' + uuidv4().slice(0, 8);

      db.prepare(`
        INSERT INTO service_reminders (
          id, clinic_id, professional_id, patient_id, service_id, appointment_id,
          due_at, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDENTE', datetime('now'), datetime('now'))
      `).run(
        reminderId,
        clinicId,
        professionalId,
        patientId,
        serviceId,
        appointmentId || null,
        dueAt
      );

      return {
        id: reminderId,
        clinicId,
        professionalId,
        patientId,
        serviceId,
        appointmentId: appointmentId || null,
        dueAt,
        status: 'PENDENTE'
      };
    } catch (err: any) {
      console.error('[ServiceReminderService.createReminderIfEnabled] Erro ao criar lembrete:', err);
      return null;
    }
  }

  /**
   * Chamado quando um agendamento é finalizado/concluído.
   * Localiza o serviço e profissional do agendamento e gera o lembrete se habilitado.
   */
  static onAppointmentCompleted(
    appointmentId?: string | null,
    tenantId?: string | null,
    baseDate?: Date | string
  ) {
    try {
      if (!appointmentId || !tenantId) return null;

      const appt = db.prepare(`
        SELECT id, tenant_id, professional_id, patient_id, service_id, start_time
        FROM appointments
        WHERE id = ? AND tenant_id = ?
      `).get(appointmentId, tenantId) as any;

      if (!appt || !appt.service_id) return null;

      return this.createReminderIfEnabled({
        clinicId: appt.tenant_id,
        professionalId: appt.professional_id,
        patientId: appt.patient_id,
        serviceId: appt.service_id,
        appointmentId: appt.id,
        baseDate: baseDate || new Date()
      });
    } catch (err: any) {
      console.error('[ServiceReminderService.onAppointmentCompleted] Erro:', err);
      return null;
    }
  }

  /**
   * Marca o lembrete como concluído / resolvido
   */
  static completeReminder(reminderId: string, tenantId: string, professionalId?: string) {
    const existing = db.prepare(`
      SELECT id, professional_id, status FROM service_reminders
      WHERE id = ? AND clinic_id = ?
    `).get(reminderId, tenantId) as any;

    if (!existing) {
      throw new Error('Lembrete não encontrado');
    }

    if (professionalId && existing.professional_id !== professionalId) {
      throw new Error('Você não tem permissão para alterar este lembrete');
    }

    db.prepare(`
      UPDATE service_reminders
      SET status = 'CONCLUÍDO',
          completed_at = datetime('now'),
          updated_at = datetime('now')
      WHERE id = ? AND clinic_id = ?
    `).run(reminderId, tenantId);

    return { success: true };
  }

  /**
   * Adia o lembrete para uma nova data
   */
  static postponeReminder(
    reminderId: string,
    tenantId: string,
    newDueDate: string,
    notes?: string,
    professionalId?: string
  ) {
    const existing = db.prepare(`
      SELECT id, professional_id, status, due_at FROM service_reminders
      WHERE id = ? AND clinic_id = ?
    `).get(reminderId, tenantId) as any;

    if (!existing) {
      throw new Error('Lembrete não encontrado');
    }

    if (professionalId && existing.professional_id !== professionalId) {
      throw new Error('Você não tem permissão para alterar este lembrete');
    }

    if (!newDueDate || !/^\d{4}-\d{2}-\d{2}$/.test(newDueDate)) {
      throw new Error('Data de adiamento inválida (formato YYYY-MM-DD)');
    }

    db.prepare(`
      UPDATE service_reminders
      SET status = 'ADIADO',
          due_at = ?,
          postponed_to = ?,
          notes = COALESCE(?, notes),
          updated_at = datetime('now')
      WHERE id = ? AND clinic_id = ?
    `).run(newDueDate, newDueDate, notes || null, reminderId, tenantId);

    return { success: true, newDueDate };
  }

  /**
   * Lista lembretes com filtros
   */
  static listReminders(
    tenantId: string,
    professionalId?: string,
    options?: { status?: string; limit?: number; offset?: number }
  ) {
    let query = `
      SELECT 
        sr.id,
        sr.clinic_id,
        sr.professional_id,
        sr.patient_id,
        sr.service_id,
        sr.appointment_id,
        sr.due_at,
        sr.status,
        sr.completed_at,
        sr.postponed_to,
        sr.notes,
        sr.created_at,
        sr.updated_at,
        p.full_name AS patient_name,
        p.phone AS patient_phone,
        p.whatsapp AS patient_whatsapp,
        s.name AS service_name,
        prof.name AS professional_name
      FROM service_reminders sr
      JOIN patients p ON p.id = sr.patient_id AND p.tenant_id = sr.clinic_id
      JOIN services s ON s.id = sr.service_id AND s.tenant_id = sr.clinic_id
      LEFT JOIN professionals prof ON prof.id = sr.professional_id AND prof.tenant_id = sr.clinic_id
      WHERE sr.clinic_id = ?
    `;

    const params: any[] = [tenantId];

    if (professionalId) {
      query += ` AND sr.professional_id = ?`;
      params.push(professionalId);
    }

    if (options?.status && options.status !== 'all') {
      if (options.status === 'active') {
        query += ` AND sr.status IN ('PENDENTE', 'ADIADO')`;
      } else {
        query += ` AND sr.status = ?`;
        params.push(options.status.toUpperCase());
      }
    }

    // Ordenação: prioriza vencidos e de hoje, seguido dos próximos
    query += ` ORDER BY sr.due_at ASC, sr.created_at ASC`;

    if (options?.limit) {
      query += ` LIMIT ?`;
      params.push(options.limit);
      if (options.offset) {
        query += ` OFFSET ?`;
        params.push(options.offset);
      }
    }

    return db.prepare(query).all(...params) as any[];
  }
}
