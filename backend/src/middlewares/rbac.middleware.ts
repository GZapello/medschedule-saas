import { Request, Response, NextFunction } from 'express';

export type Role = 'superadmin' | 'clinic_admin' | 'professional' | 'receptionist' | 'patient';

export function requireRole(...allowedRoles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Usuário não autenticado' });
      return;
    }

    // SuperAdmin tem acesso irrestrito em qualquer rota de gestão
    if (req.user.role === 'superadmin') {
      return next();
    }

    if (!allowedRoles.includes(req.user.role as Role)) {
      res.status(403).json({
        error: 'Acesso negado: seu perfil de usuário não possui permissão para executar esta ação'
      });
      return;
    }

    next();
  };
}
