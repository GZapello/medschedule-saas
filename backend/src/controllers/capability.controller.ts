import { Request, Response } from 'express';
import { db } from '../config/database';
import { CapabilityService } from '../services/capability.service';
import { logAudit } from '../middlewares/audit.middleware';

export class CapabilityController {
  /**
   * Catálogo geral de capabilities
   */
  public static getCatalog(req: Request, res: Response): void {
    try {
      const catalog = CapabilityService.getCatalog();
      res.json(catalog);
    } catch (err: any) {
      console.error('[CapabilityController.getCatalog] Erro:', err);
      res.status(500).json({ error: 'Erro ao listar catálogo de capabilities' });
    }
  }

  /**
   * Lista áreas de atuação para uma dada profissão
   */
  public static getPracticeAreas(req: Request, res: Response): void {
    try {
      const professionId = String(req.query.professionId || req.query.profession || req.query.id || req.query.slug || '').trim();
      if (!professionId) {
        res.status(400).json({ error: 'professionId é obrigatório' });
        return;
      }
      const areas = CapabilityService.getPracticeAreas(professionId);
      res.json(areas);
    } catch (err: any) {
      console.error('[CapabilityController.getPracticeAreas] Erro:', err);
      res.status(500).json({ error: 'Erro ao listar áreas de atuação' });
    }
  }

  /**
   * Obtém a configuração de recursos do profissional atual ("Meus Recursos Profissionais")
   */
  public static getMyResources(req: Request, res: Response): void {
    try {
      if (!req.user || !req.tenantId) {
        res.status(401).json({ error: 'Não autenticado' });
        return;
      }

      const computed = CapabilityService.computeUserCapabilities(req.user.userId, req.tenantId);
      const availableAreas = CapabilityService.getPracticeAreas(computed.professionId);
      const catalog = CapabilityService.getCatalog();

      res.json({
        ...computed,
        availableAreas,
        catalog
      });
    } catch (err: any) {
      console.error('[CapabilityController.getMyResources] Erro:', err);
      res.status(500).json({ error: 'Erro ao carregar recursos do profissional' });
    }
  }

  /**
   * Atualiza os recursos opcionais escolhidos pelo próprio profissional
   */
  public static updateMyOptionalResources(req: Request, res: Response): void {
    try {
      if (!req.user || !req.tenantId) {
        res.status(401).json({ error: 'Não autenticado' });
        return;
      }

      const { optionalCapabilities } = req.body;
      if (!Array.isArray(optionalCapabilities)) {
        res.status(400).json({ error: 'optionalCapabilities deve ser um array de IDs de capabilities' });
        return;
      }

      const updated = CapabilityService.setUserOptionalCapabilities(req.user.userId, req.tenantId, optionalCapabilities);
      logAudit(req, 'UPDATE_MY_RESOURCES', 'users', req.user.userId, { optionalCapabilities });

      res.json({
        message: 'Preferências de recursos atualizadas com sucesso',
        ...updated
      });
    } catch (err: any) {
      console.error('[CapabilityController.updateMyOptionalResources] Erro:', err);
      res.status(500).json({ error: 'Erro ao salvar preferências de recursos' });
    }
  }

  /**
   * Atualiza as áreas de atuação do profissional
   */
  public static updateMyPracticeAreas(req: Request, res: Response): void {
    try {
      if (!req.user || !req.tenantId) {
        res.status(401).json({ error: 'Não autenticado' });
        return;
      }

      const { practiceAreaIds } = req.body;
      if (!Array.isArray(practiceAreaIds)) {
        res.status(400).json({ error: 'practiceAreaIds deve ser um array de IDs' });
        return;
      }

      // Validação rigorosa: busca profissão do usuário e rejeita áreas incompatíveis
      const userProf = db.prepare(`
        SELECT p.profession_id as p_prof_id, u.profession_id as u_prof_id, u.profession_name, cu.profession_custom
        FROM users u
        LEFT JOIN professionals p ON p.user_id = u.id AND p.tenant_id = ?
        LEFT JOIN clinic_users cu ON cu.user_id = u.id AND cu.tenant_id = ?
        WHERE u.id = ?
      `).get(req.tenantId, req.tenantId, req.user.userId) as any;

      const rawProf = userProf?.p_prof_id || userProf?.u_prof_id || userProf?.profession_custom || userProf?.profession_name;
      const validation = CapabilityService.validatePracticeAreasForProfession(rawProf, practiceAreaIds);
      if (!validation.valid) {
        res.status(400).json({ error: validation.error });
        return;
      }

      CapabilityService.setUserPracticeAreas(req.user.userId, req.tenantId, practiceAreaIds);
      const updated = CapabilityService.computeUserCapabilities(req.user.userId, req.tenantId);
      logAudit(req, 'UPDATE_MY_PRACTICE_AREAS', 'users', req.user.userId, { practiceAreaIds });

      res.json({
        message: 'Áreas de atuação atualizadas com sucesso',
        ...updated
      });
    } catch (err: any) {
      console.error('[CapabilityController.updateMyPracticeAreas] Erro:', err);
      res.status(500).json({ error: 'Erro ao salvar áreas de atuação' });
    }
  }
}
