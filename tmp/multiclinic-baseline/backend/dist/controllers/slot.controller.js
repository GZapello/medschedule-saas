"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SlotController = void 0;
const public_booking_1 = require("../utils/public-booking");
const slot_calculator_1 = require("../utils/slot-calculator");
class SlotController {
    static getAvailableSlots(req, res) {
        try {
            let tenantId = req.tenantId;
            const { tenantSlug, professionalId, serviceId, date, roomId } = req.query;
            const isPublic = req.path.startsWith('/v1/public/');
            if (isPublic) {
                const tenant = (0, public_booking_1.resolveBookingTenant)(tenantSlug, req.query.bookingSequence);
                if (!tenant || tenant.public_booking_enabled !== 1) {
                    res.status(404).json({ error: 'Agendamento online indisponível.' });
                    return;
                }
                tenantId = tenant.id;
                if (!(0, public_booking_1.publicBookingProfessional)(tenant.id, String(professionalId)) || !(0, public_booking_1.professionalBookingService)(tenant.id, String(professionalId), String(serviceId))) {
                    res.status(404).json({ error: 'Atendimento indisponível.' });
                    return;
                }
                if (!(0, public_booking_1.validBookingDate)(date)) {
                    res.status(400).json({ error: 'Data inválida.' });
                    return;
                }
            }
            if (!tenantId) {
                res.status(400).json({ error: 'Tenant/Clínica não identificado' });
                return;
            }
            if (!professionalId || !serviceId || !date) {
                res.status(400).json({ error: 'professionalId, serviceId e date (YYYY-MM-DD) são obrigatórios' });
                return;
            }
            const slots = (0, slot_calculator_1.calculateAvailableSlots)(tenantId, String(professionalId), String(serviceId), String(date), roomId ? String(roomId) : undefined);
            res.json({
                date: String(date),
                professionalId: String(professionalId),
                serviceId: String(serviceId),
                totalAvailable: slots.length,
                slots
            });
        }
        catch (err) {
            console.error('[SlotController.getAvailableSlots] Erro:', err);
            res.status(500).json({ error: 'Erro ao consultar horários disponíveis' });
        }
    }
}
exports.SlotController = SlotController;
