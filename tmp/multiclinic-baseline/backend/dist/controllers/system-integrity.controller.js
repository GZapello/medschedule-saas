"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SystemIntegrityController = void 0;
const system_integrity_service_1 = require("../services/system-integrity.service");
class SystemIntegrityController {
    static get(req, res) {
        if (req.user?.role !== 'superadmin' || req.isSandboxSession || req.headers['x-sandbox-session'] || req.tenantId?.startsWith('sbx-')) {
            res.status(403).json({ error: 'Acesso exclusivo ao SuperAdmin fora do Sandbox.' });
            return;
        }
        const rawPage = Number(req.query.page || 1);
        if (!Number.isSafeInteger(rawPage) || rawPage < 1 || rawPage > 800) {
            res.status(400).json({ error: 'Página inválida.' });
            return;
        }
        res.setHeader('Cache-Control', 'no-store');
        try {
            res.json(system_integrity_service_1.SystemIntegrity.snapshot(rawPage));
        }
        catch {
            res.status(500).json({ error: 'Não foi possível consultar a integridade.' });
        }
    }
}
exports.SystemIntegrityController = SystemIntegrityController;
