import type { Request, Response } from 'express';
import { SystemIntegrity } from '../services/system-integrity.service';

export class SystemIntegrityController {
  static get(req: Request, res: Response) {
    if (req.user?.role !== 'superadmin' || (req as any).isSandboxSession || req.headers['x-sandbox-session'] || req.tenantId?.startsWith('sbx-')) {
      res.status(403).json({ error: 'Acesso exclusivo ao SuperAdmin fora do Sandbox.' }); return;
    }
    const rawPage = Number(req.query.page || 1);
    if (!Number.isSafeInteger(rawPage) || rawPage < 1 || rawPage > 800) {
      res.status(400).json({ error: 'Página inválida.' }); return;
    }
    res.setHeader('Cache-Control', 'no-store');
    try { res.json(SystemIntegrity.snapshot(rawPage)); }
    catch { res.status(500).json({ error: 'Não foi possível consultar a integridade.' }); }
  }
}
