import { canAccessPatient } from '../services/patient-sharing.service';
import { resolveBookingTenant, publicBookingProfessional, professionalBookingService, validBookingDate } from '../utils/public-booking';
import { Request, Response } from 'express';
import { calculateAvailableSlots } from '../utils/slot-calculator';
import { GoogleCalendarService } from '../services/google-calendar.service';
import { db } from '../config/database';

export class SlotController {
  static async getAvailableSlots(req: Request, res: Response): Promise<void> {
    try {
      let tenantId = req.tenantId;
      const { tenantSlug, professionalId, serviceId, date, roomId, patientId } = req.query;

      const isPublic = req.path.startsWith('/v1/public/');
      if (isPublic) {
        const tenant = resolveBookingTenant(tenantSlug, req.query.bookingSequence);
        if (!tenant || tenant.public_booking_enabled !== 1) { res.status(404).json({ error: 'Agendamento online indisponível.' }); return; }
        tenantId = tenant.id;
        if (!publicBookingProfessional(tenant.id, String(professionalId)) || !professionalBookingService(tenant.id, String(professionalId), String(serviceId))) { res.status(404).json({ error: 'Atendimento indisponível.' }); return; }
        if (!validBookingDate(date)) { res.status(400).json({ error: 'Data inválida.' }); return; }
      }
      if (!tenantId) {
        res.status(400).json({ error: 'Tenant/Clínica não identificado' });
        return;
      }

      if (!professionalId || !serviceId || !date) {
        res.status(400).json({ error: 'professionalId, serviceId e date (YYYY-MM-DD) são obrigatórios' });
        return;
      }

      if (patientId && (isPublic || typeof patientId !== 'string' || (!db.prepare('SELECT 1 FROM patients WHERE id = ? AND tenant_id = ?').get(patientId, tenantId) && (!req.user || !canAccessPatient(req.user.userId, tenantId, patientId, 'appointments'))))) {
        res.status(403).json({ error: 'Paciente não autorizado nesta clínica.' }); return;
      }
      // Consulta FreeBusy da Google Agenda com cache em memória e fallback resiliente
      let externalBusyIntervals: Array<{ startMin: number; endMin: number }> = [];
      try {
        const busyRanges = await GoogleCalendarService.getBusyIntervals(tenantId, String(professionalId), String(date));
        externalBusyIntervals = busyRanges.map(b => ({ startMin: b.startMin, endMin: b.endMin }));
      } catch (fbErr) {
        res.status(503).json({ error: 'Não foi possível verificar a disponibilidade Google. Tente novamente.', code: 'GOOGLE_AVAILABILITY_UNAVAILABLE' });
        return;
      }

      const slots = calculateAvailableSlots(
        tenantId,
        String(professionalId),
        String(serviceId),
        String(date),
        roomId ? String(roomId) : undefined,
        undefined,
        externalBusyIntervals,
        typeof patientId === 'string' ? patientId : undefined
      );

      res.json({
        date: String(date),
        professionalId: String(professionalId),
        serviceId: String(serviceId),
        totalAvailable: slots.length,
        slots
      });
    } catch (err: any) {
      console.error('[SlotController.getAvailableSlots] Erro:', err);
      res.status(500).json({ error: 'Erro ao consultar horários disponíveis' });
    }
  }
}
