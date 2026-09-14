import { Request, Response } from 'express';
import { calculateAvailableSlots } from '../utils/slot-calculator';
import { db } from '../config/database';

export class SlotController {
  static getAvailableSlots(req: Request, res: Response): void {
    try {
      let tenantId = req.tenantId;
      const { tenantSlug, professionalId, serviceId, date, roomId } = req.query;

      if (!tenantId && tenantSlug) {
        const tenantRow = db.prepare("SELECT id FROM tenants WHERE slug = ? AND status = 'active'").get(tenantSlug) as { id: string } | undefined;
        if (tenantRow) tenantId = tenantRow.id;
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
