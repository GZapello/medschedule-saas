"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireCapability = requireCapability;
const capability_service_1 = require("../services/capability.service");
function requireCapability(capabilityId) {
    return (req, res, next) => {
        if (!req.user || !req.tenantId) {
            res.status(401).json({ error: 'Usuário não autenticado ou tenant não identificado.' });
            return;
        }
        // SuperAdmin possui autorização global administrativa (exceto quando simulando em sandbox, onde respeita a capability do perfil de teste)
        if (req.user.role === 'superadmin' && !req.isSandboxSession) {
            return next();
        }
        const hasCap = capability_service_1.CapabilityService.hasCapability(req.user.userId, req.tenantId, capabilityId);
        if (!hasCap) {
            res.status(403).json({
                error: `Acesso negado: seu perfil profissional não possui a capability clínica '${capabilityId}' habilitada.`,
                code: 'CAPABILITY_RESTRICTED',
                requiredCapability: capabilityId
            });
            return;
        }
        next();
    };
}
