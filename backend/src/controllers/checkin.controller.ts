import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../config/database';

export type ReceptionStatus =
  | 'waiting_arrival'
  | 'waiting_attendance'
  | 'called'
  | 'in_attendance'
  | 'checked_out';

export const RECEPTION_STATUS_LABELS: Record<ReceptionStatus, string> = {
  waiting_arrival: 'Aguardando chegada',
  waiting_attendance: 'Aguardando atendimento',
  called: 'Chamado para atendimento',
  in_attendance: 'Em atendimento',
  checked_out: 'Saída registrada / atendimento encerrado'
};

const VALID_RECEPTION_STATUSES: ReceptionStatus[] = [
  'waiting_arrival',
  'waiting_attendance',
  'called',
  'in_attendance',
  'checked_out'
];

function nowBrazilIso(): string {
  const now = new Date();
  const datePart = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(now);
  const timePart = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).format(now);
  return `${datePart}T${timePart}`;
}

function formatHourBr(startTime?: string | null): string {
  if (!startTime) return '';
  const clean = String(startTime).trim().replace(' ', 'T');
  const timePart = clean.includes('T') ? clean.split('T')[1]?.slice(0, 5) : clean.slice(0, 5);
  if (!timePart || !timePart.includes(':')) return timePart || '';
  const [hh, mm] = timePart.split(':');
  return `${hh}h${mm}`;
}

function computeWaitMinutes(arrivedAt?: string | null, endRef?: string | null): number | null {
  if (!arrivedAt) return null;
  const startMs = Date.parse(`${String(arrivedAt).trim().replace(' ', 'T')}-03:00`);
  const endIso = endRef ? String(endRef).trim().replace(' ', 'T') : nowBrazilIso();
  const endMs = Date.parse(`${endIso}-03:00`);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return 0;
  return Math.round((endMs - startMs) / 60000);
}

/**
 * Helper chamado quando o profissional inicia ou finaliza clinicamente um atendimento,
 * mantendo a situação administrativa da recepção sincronizada.
 */
export function syncReceptionStatusFromClinical(
  tenantId: string,
  appointmentId: string,
  clinicalStatus: string
): void {
  try {
    const nowIso = nowBrazilIso();
    if (clinicalStatus === 'in_progress') {
      db.prepare(`
        UPDATE appointments
        SET reception_status = 'in_attendance',
            called_at = COALESCE(called_at, ?),
            arrived_at = COALESCE(arrived_at, ?),
            updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ?
      `).run(nowIso, nowIso, appointmentId, tenantId);
    } else if (clinicalStatus === 'completed') {
      db.prepare(`
        UPDATE appointments
        SET reception_status = 'checked_out',
            checked_out_at = COALESCE(checked_out_at, ?),
            updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ?
      `).run(nowIso, appointmentId, tenantId);
    }
  } catch (err) {
    console.warn('[CheckIn.syncReceptionStatusFromClinical] Aviso:', err);
  }
}

export class CheckInController {
  /**
   * Retorna a configuração de Check-In da clínica e do profissional/usuário logado,
   * além de informar se há equipe de recepção cadastrada na clínica.
   */
  static getSettings(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId as string;
      const userId = req.user?.userId;
      if (!tenantId || !userId) {
        res.status(401).json({ error: 'Não autenticado' });
        return;
      }

      const tenantRow = db.prepare('SELECT checkin_enabled FROM tenants WHERE id = ?').get(tenantId) as { checkin_enabled?: number } | undefined;
      const clinicCheckinEnabled = tenantRow?.checkin_enabled !== 0;

      // Verifica se há recepção cadastrada (em users ou clinic_users)
      const receptionCountRow = db.prepare(`
        SELECT COUNT(*) as c FROM (
          SELECT id FROM users WHERE tenant_id = ? AND role IN ('receptionist', 'secretary', 'assistant') AND status = 'active'
          UNION
          SELECT user_id as id FROM clinic_users WHERE tenant_id = ? AND role IN ('receptionist', 'secretary', 'assistant') AND status = 'active'
        )
      `).get(tenantId, tenantId) as { c: number } | undefined;
      const receptionStaffCount = receptionCountRow?.c || 0;
      const hasReceptionTeam = receptionStaffCount > 0;

      const profRow = db.prepare(`
        SELECT id, name, checkin_alerts_enabled, checkin_sound_enabled
        FROM professionals
        WHERE user_id = ? AND tenant_id = ? AND active = 1
        LIMIT 1
      `).get(userId, tenantId) as any;

      const prefRow = db.prepare(`
        SELECT alerts_enabled, sound_enabled
        FROM checkin_preferences
        WHERE tenant_id = ? AND user_id = ?
      `).get(tenantId, userId) as { alerts_enabled?: number; sound_enabled?: number } | undefined;

      const alertsEnabled = prefRow
        ? prefRow.alerts_enabled === 1
        : Boolean(profRow?.checkin_alerts_enabled === 1);
      const soundEnabled = prefRow
        ? prefRow.sound_enabled === 1
        : Boolean(profRow?.checkin_sound_enabled === 1);

      res.json({
        clinicCheckinEnabled,
        hasReceptionTeam,
        receptionStaffCount,
        professionalId: profRow?.id || null,
        alertsEnabled: hasReceptionTeam ? alertsEnabled : false,
        configuredAlertsPreference: alertsEnabled,
        soundEnabled: false && soundEnabled, // Sem som por padrão a menos que explicitamente ativado
        soundPreference: soundEnabled,
        explanation: !hasReceptionTeam
          ? 'Sua clínica ainda não possui recepcionista cadastrado(a). O aviso automático de chegada funciona quando a recepção registra o check-in do paciente na agenda ou painel.'
          : null
      });
    } catch (err: any) {
      console.error('[CheckInController.getSettings] Erro:', err);
      res.status(500).json({ error: 'Erro ao consultar configurações de Check-In' });
    }
  }

  /**
   * Salva a preferência de Check-In do profissional e (se clinic_admin) a disponibilidade na clínica.
   */
  static updateSettings(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId as string;
      const userId = req.user?.userId;
      if (!tenantId || !userId) {
        res.status(401).json({ error: 'Não autenticado' });
        return;
      }

      const { alertsEnabled, soundEnabled, clinicCheckinEnabled } = req.body;

      // Verifica se existe recepção ativa na clínica
      const receptionCountRow = db.prepare(`
        SELECT COUNT(*) as c FROM (
          SELECT id FROM users WHERE tenant_id = ? AND role IN ('receptionist', 'secretary', 'assistant') AND status = 'active'
          UNION
          SELECT user_id as id FROM clinic_users WHERE tenant_id = ? AND role IN ('receptionist', 'secretary', 'assistant') AND status = 'active'
        )
      `).get(tenantId, tenantId) as { c: number } | undefined;
      const hasReceptionTeam = (receptionCountRow?.c || 0) > 0;

      if (alertsEnabled === true && !hasReceptionTeam && req.body.allowWithoutReception !== true) {
        res.status(400).json({
          code: 'NO_RECEPTION_TEAM',
          hasReceptionTeam: false,
          error: 'Não há recepção cadastrada nesta clínica. Cadastre um perfil de recepção em Equipe para utilizar o fluxo de chegada com avisos em tempo real.'
        });
        return;
      }

      if (clinicCheckinEnabled !== undefined && (req.user?.role === 'clinic_admin' || req.user?.role === 'superadmin')) {
        db.prepare('UPDATE tenants SET checkin_enabled = ? WHERE id = ?').run(clinicCheckinEnabled ? 1 : 0, tenantId);
      }

      const profRow = db.prepare('SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ? AND active = 1 LIMIT 1').get(userId, tenantId) as { id: string } | undefined;
      const nextAlerts = alertsEnabled !== undefined ? (alertsEnabled ? 1 : 0) : 0;
      const nextSound = soundEnabled !== undefined ? (soundEnabled ? 1 : 0) : 0;

      db.prepare(`
        INSERT INTO checkin_preferences (id, tenant_id, user_id, professional_id, alerts_enabled, sound_enabled, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(tenant_id, user_id) DO UPDATE SET
          professional_id = excluded.professional_id,
          alerts_enabled = excluded.alerts_enabled,
          sound_enabled = excluded.sound_enabled,
          updated_at = datetime('now')
      `).run('ckp-' + uuidv4().slice(0, 8), tenantId, userId, profRow?.id || null, nextAlerts, nextSound);

      if (profRow?.id) {
        db.prepare(`
          UPDATE professionals
          SET checkin_alerts_enabled = ?, checkin_sound_enabled = ?, updated_at = datetime('now')
          WHERE id = ? AND tenant_id = ?
        `).run(nextAlerts, nextSound, profRow.id, tenantId);
      }

      db.prepare(`
        UPDATE users
        SET checkin_alerts_enabled = ?, checkin_sound_enabled = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(nextAlerts, nextSound, userId);

      res.json({
        success: true,
        alertsEnabled: Boolean(nextAlerts),
        soundEnabled: Boolean(nextSound),
        clinicCheckinEnabled: clinicCheckinEnabled !== undefined ? Boolean(clinicCheckinEnabled) : true,
        hasReceptionTeam,
        message: nextAlerts
          ? 'Avisos de Check-In ativados com sucesso!'
          : 'Preferências de Check-In atualizadas.'
      });
    } catch (err: any) {
      console.error('[CheckInController.updateSettings] Erro:', err);
      res.status(500).json({ error: 'Erro ao salvar configurações de Check-In' });
    }
  }

  /**
   * Atualiza o status administrativo de recepção de um agendamento:
   * - waiting_arrival: Aguardando chegada
   * - waiting_attendance: Aguardando atendimento (gera aviso flutuante sem duplicação ao profissional responsável)
   * - called: Chamado para atendimento
   * - in_attendance: Em atendimento
   * - checked_out: Saída registrada / atendimento encerrado (NÃO conclui clinicamente o agendamento!)
   */
  static updateReceptionStatus(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId as string;
      const { id } = req.params;
      const { receptionStatus } = req.body;

      if (!tenantId) {
        res.status(400).json({ error: 'Clínica não identificada' });
        return;
      }

      if (!receptionStatus || !VALID_RECEPTION_STATUSES.includes(receptionStatus as ReceptionStatus)) {
        res.status(400).json({
          error: 'Status de recepção inválido. Valores permitidos: waiting_arrival, waiting_attendance, called, in_attendance, checked_out.'
        });
        return;
      }

      const appt = db.prepare(`
        SELECT
          a.id, a.tenant_id, a.patient_id, a.professional_id, a.start_time, a.status,
          a.reception_status, a.arrived_at, a.called_at, a.checked_out_at,
          pat.full_name as patient_name
        FROM appointments a
        JOIN patients pat ON pat.id = a.patient_id
        WHERE a.id = ? AND a.tenant_id = ?
      `).get(id, tenantId) as any;

      if (!appt) {
        res.status(404).json({ error: 'Agendamento não encontrado nesta clínica' });
        return;
      }

      const nowIso = nowBrazilIso();
      let nextArrivedAt = appt.arrived_at || null;
      let nextCalledAt = appt.called_at || null;
      let nextCheckedOutAt = appt.checked_out_at || null;

      if (receptionStatus === 'waiting_arrival') {
        nextArrivedAt = null;
        nextCalledAt = null;
        nextCheckedOutAt = null;
      } else if (receptionStatus === 'waiting_attendance') {
        nextArrivedAt = nextArrivedAt || nowIso;
      } else if (receptionStatus === 'called') {
        nextArrivedAt = nextArrivedAt || nowIso;
        nextCalledAt = nextCalledAt || nowIso;
      } else if (receptionStatus === 'in_attendance') {
        nextArrivedAt = nextArrivedAt || nowIso;
        nextCalledAt = nextCalledAt || nowIso;
      } else if (receptionStatus === 'checked_out') {
        nextCheckedOutAt = nextCheckedOutAt || nowIso;
      }

      // Importante (Requisito 2.2): registrar chegada ou saída na recepção NÃO altera a conclusão clínica (a.status)
      db.prepare(`
        UPDATE appointments
        SET reception_status = ?,
            arrived_at = ?,
            called_at = ?,
            checked_out_at = ?,
            checked_in_by = COALESCE(checked_in_by, ?),
            updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ?
      `).run(
        receptionStatus,
        nextArrivedAt,
        nextCalledAt,
        nextCheckedOutAt,
        req.user?.userId || null,
        id,
        tenantId
      );

      // Se a recepção registrou a chegada (waiting_attendance), gera aviso único ao profissional responsável
      let createdAlert: any = null;
      if (receptionStatus === 'waiting_attendance') {
        const firstName = String(appt.patient_name || 'Paciente').trim().split(/\s+/)[0];
        const formattedHour = formatHourBr(appt.start_time);
        const alertMessage = `Paciente chegou — ${firstName}, atendimento às ${formattedHour}. Aguardando na recepção.`;

        const existingAlert = db.prepare(`
          SELECT id, message, created_at, read_at, dismissed_at
          FROM checkin_alerts
          WHERE tenant_id = ? AND appointment_id = ? AND reception_status = 'waiting_attendance'
        `).get(tenantId, id) as any;

        if (!existingAlert) {
          const alertId = 'cka-' + uuidv4().slice(0, 8);
          db.prepare(`
            INSERT INTO checkin_alerts (
              id, tenant_id, appointment_id, professional_id, patient_id,
              patient_name, appointment_time, reception_status, message, created_by_user_id, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'waiting_attendance', ?, ?, ?)
          `).run(
            alertId,
            tenantId,
            id,
            appt.professional_id,
            appt.patient_id,
            appt.patient_name,
            appt.start_time,
            alertMessage,
            req.user?.userId || null,
            nowIso
          );
          createdAlert = {
            id: alertId,
            appointmentId: id,
            professionalId: appt.professional_id,
            patientId: appt.patient_id,
            patientName: appt.patient_name,
            appointmentTime: appt.start_time,
            message: alertMessage,
            createdAt: nowIso
          };
        } else {
          createdAlert = existingAlert;
        }
      }

      res.json({
        success: true,
        appointmentId: id,
        clinicalStatus: appt.status, // preservado intacto!
        receptionStatus,
        receptionStatusLabel: RECEPTION_STATUS_LABELS[receptionStatus as ReceptionStatus],
        arrivedAt: nextArrivedAt,
        calledAt: nextCalledAt,
        checkedOutAt: nextCheckedOutAt,
        waitMinutes: computeWaitMinutes(nextArrivedAt, nextCalledAt || nextCheckedOutAt),
        alert: createdAlert
      });
    } catch (err: any) {
      console.error('[CheckInController.updateReceptionStatus] Erro:', err);
      res.status(500).json({ error: 'Erro ao atualizar status da recepção' });
    }
  }

  /**
   * Consulta a fila de espera e os avisos de chegada do profissional logado (ou da clínica, se recepção/admin).
   * Isola estritamente por clínica e profissional responsável para os avisos flutuantes.
   */
  static getQueueAndAlerts(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId as string;
      const userId = req.user?.userId;
      if (!tenantId || !userId) {
        res.status(401).json({ error: 'Não autenticado' });
        return;
      }

      const todayStr = req.query.date
        ? String(req.query.date).slice(0, 10)
        : new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

      // Identifica o profissional vinculado ao usuário logado
      const myProf = db.prepare(`
        SELECT id, name, checkin_alerts_enabled, checkin_sound_enabled
        FROM professionals
        WHERE user_id = ? AND tenant_id = ? AND active = 1
        LIMIT 1
      `).get(userId, tenantId) as { id: string; name: string; checkin_alerts_enabled?: number; checkin_sound_enabled?: number } | undefined;

      const requestedProfId = req.query.professionalId ? String(req.query.professionalId) : null;
      // Para avisos flutuantes e indicador "Pacientes aguardando: X" do profissional, usa estritamente o profissional logado
      const targetProfId = myProf?.id || (req.user?.role === 'clinic_admin' && requestedProfId ? requestedProfId : null);

      const prefRow = db.prepare(`
        SELECT alerts_enabled, sound_enabled FROM checkin_preferences WHERE tenant_id = ? AND user_id = ?
      `).get(tenantId, userId) as { alerts_enabled?: number; sound_enabled?: number } | undefined;

      const alertsEnabled = prefRow
        ? prefRow.alerts_enabled === 1
        : Boolean(myProf?.checkin_alerts_enabled === 1);

      let waitingPatients: any[] = [];
      let activeAlerts: any[] = [];
      let previousAlerts: any[] = [];

      if (targetProfId) {
        const waitingRows = db.prepare(`
          SELECT
            a.id,
            a.patient_id,
            a.professional_id,
            a.service_id,
            a.start_time,
            a.end_time,
            a.status,
            COALESCE(a.reception_status, 'waiting_arrival') as reception_status,
            a.arrived_at,
            a.called_at,
            a.attendance_start_at,
            a.checked_out_at,
            a.clinical_module,
            pat.full_name as patient_name,
            pat.phone as patient_phone,
            p.name as professional_name,
            s.name as service_name,
            s.clinical_module as service_clinical_module
          FROM appointments a
          JOIN patients pat ON pat.id = a.patient_id
          JOIN professionals p ON p.id = a.professional_id
          LEFT JOIN services s ON s.id = a.service_id
          WHERE a.tenant_id = ?
            AND a.professional_id = ?
            AND REPLACE(a.start_time, ' ', 'T') LIKE ?
            AND a.status NOT IN ('cancelled', 'completed', 'no_show')
            AND COALESCE(a.reception_status, 'waiting_arrival') IN ('waiting_attendance', 'called')
          ORDER BY COALESCE(a.arrived_at, a.start_time) ASC
        `).all(tenantId, targetProfId, `${todayStr}%`) as any[];

        waitingPatients = waitingRows.map(r => ({
          ...r,
          reception_status_label: RECEPTION_STATUS_LABELS[(r.reception_status as ReceptionStatus) || 'waiting_arrival'],
          wait_minutes: computeWaitMinutes(r.arrived_at, r.attendance_start_at)
        }));

        const allDayAlerts = db.prepare(`
          SELECT
            al.id,
            al.appointment_id,
            al.professional_id,
            al.patient_id,
            al.patient_name,
            al.appointment_time,
            al.reception_status,
            al.message,
            al.read_at,
            al.dismissed_at,
            al.created_at,
            a.status as clinical_status,
            a.reception_status as current_reception_status,
            a.arrived_at,
            a.called_at
          FROM checkin_alerts al
          JOIN appointments a ON a.id = al.appointment_id AND a.tenant_id = al.tenant_id
          WHERE al.tenant_id = ?
            AND al.professional_id = ?
            AND REPLACE(al.appointment_time, ' ', 'T') LIKE ?
          ORDER BY al.created_at DESC
        `).all(tenantId, targetProfId, `${todayStr}%`) as any[];

        activeAlerts = alertsEnabled
          ? allDayAlerts.filter(
              al =>
                !al.dismissed_at &&
                al.current_reception_status === 'waiting_attendance' &&
                al.clinical_status !== 'completed' &&
                al.clinical_status !== 'cancelled'
            )
          : [];

        previousAlerts = allDayAlerts;
      }

      res.json({
        date: todayStr,
        professionalId: targetProfId,
        alertsEnabled,
        waitingCount: waitingPatients.length,
        waitingPatients,
        activeAlerts,
        previousAlerts
      });
    } catch (err: any) {
      console.error('[CheckInController.getQueueAndAlerts] Erro:', err);
      res.status(500).json({ error: 'Erro ao consultar fila de espera e avisos de Check-In' });
    }
  }

  /**
   * Fecha (dismiss) ou marca como lido um aviso flutuante de chegada.
   */
  static dismissAlert(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId as string;
      const { alertId } = req.params;
      if (!tenantId) {
        res.status(400).json({ error: 'Clínica não identificada' });
        return;
      }

      const nowIso = nowBrazilIso();
      db.prepare(`
        UPDATE checkin_alerts
        SET dismissed_at = COALESCE(dismissed_at, ?),
            read_at = COALESCE(read_at, ?)
        WHERE id = ? AND tenant_id = ?
      `).run(nowIso, nowIso, alertId, tenantId);

      res.json({ success: true, alertId, dismissedAt: nowIso });
    } catch (err: any) {
      console.error('[CheckInController.dismissAlert] Erro:', err);
      res.status(500).json({ error: 'Erro ao fechar aviso de Check-In' });
    }
  }
}
