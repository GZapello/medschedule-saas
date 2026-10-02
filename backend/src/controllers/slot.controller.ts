import { resolveBookingTenant, publicBookingProfessional, professionalBookingService, validBookingDate } from '../utils/public-booking';
import { Request, Response } from 'express';
import { calculateAvailableSlots } from '../utils/slot-calculator';
import { db } from '../config/database';

export class SlotController {
  static getAvailableSlots(req: Request, res: Response): void {
    try {
      let tenantId = req.tenantId;
      const { tenantSlug, professionalId, serviceId, date, roomId } = req.query;

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

      const slots = calculateAvailableSlots(
        tenantId,
        String(professionalId),
        String(serviceId),
        String(date),
        roomId ? String(roomId) : undefined
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
