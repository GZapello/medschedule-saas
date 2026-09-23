import { Request, Response, NextFunction } from 'express';
import { CapabilityService } from '../services/capability.service';

export function requireCapability(capabilityId: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !req.tenantId) {
      res.status(401).json({ error: 'Usuário não autenticado ou tenant não identificado.' });
      return;
    }

    // SuperAdmin possui autorização global administrativa (exceto quando simulando em sandbox, onde respeita a capability do perfil de teste)
    if (req.user.role === 'superadmin' && !(req as any).isSandboxSession) {
      return next();
    }

    const hasCap = CapabilityService.hasCapability(req.user.userId, req.tenantId, capabilityId);
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
