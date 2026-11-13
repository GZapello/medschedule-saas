import { Request, Response } from 'express';
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';

const PROTECTED_SIDEBAR_KEYS = new Set([
  'sidebar-customize',
  'settings',
  'help',
  'logout'
]);

const MAX_HIDDEN_ITEMS = 60;

export class SidebarPreferencesController {
  static get(req: Request, res: Response): void {
    try {
      const userId = req.user?.userId;
      const tenantId = req.tenantId || req.user?.tenantId;

      if (!userId || !tenantId) {
        res.status(401).json({ error: 'Usuário e estabelecimento obrigatórios.' });
        return;
      }

      const row = db.prepare(`
        SELECT hidden_items_json, updated_at
        FROM user_sidebar_preferences
        WHERE user_id = ? AND tenant_id = ?
      `).get(userId, tenantId) as { hidden_items_json?: string; updated_at?: string } | undefined;

      let hiddenItems: string[] = [];
      if (row?.hidden_items_json) {
        try {
          const parsed = JSON.parse(row.hidden_items_json);
          if (Array.isArray(parsed)) {
            hiddenItems = Array.from(new Set(
              parsed
                .filter((x): x is string => typeof x === 'string' && x.trim().length > 0 && !PROTECTED_SIDEBAR_KEYS.has(x.trim()))
                .map(x => x.trim())
            ));
          }
        } catch (_) {}
      }

      res.json({
        userId,
        tenantId,
        hiddenItems,
        updatedAt: row?.updated_at || null
      });
    } catch (err: any) {
      console.error('[SidebarPreferencesController.get] Erro:', err);
      res.status(500).json({ error: 'Erro ao carregar preferências do menu lateral.' });
    }
  }

  static update(req: Request, res: Response): void {
    try {
      const userId = req.user?.userId;
      const tenantId = req.tenantId || req.user?.tenantId;
      const rawHidden = req.body?.hiddenItems;

      if (!userId || !tenantId) {
        res.status(401).json({ error: 'Usuário e estabelecimento obrigatórios.' });
        return;
      }

      if (!Array.isArray(rawHidden)) {
        res.status(400).json({ error: 'hiddenItems deve ser uma lista de identificadores.' });
        return;
      }

      const cleanHidden = Array.from(new Set(
        rawHidden
          .filter((x): x is string => typeof x === 'string' && x.trim().length > 0 && x.trim().length <= 80 && !PROTECTED_SIDEBAR_KEYS.has(x.trim()))
          .map(x => x.trim())
      )).slice(0, MAX_HIDDEN_ITEMS);

      db.prepare(`
        INSERT INTO user_sidebar_preferences (id, user_id, tenant_id, hidden_items_json, updated_at)
        VALUES (?, ?, ?, ?, datetime('now'))
        ON CONFLICT(user_id, tenant_id) DO UPDATE SET
          hidden_items_json = excluded.hidden_items_json,
          updated_at = datetime('now')
      `).run('usp-' + uuidv4().slice(0, 8), userId, tenantId, JSON.stringify(cleanHidden));

      res.json({
        userId,
        tenantId,
        hiddenItems: cleanHidden,
        message: 'Menu lateral personalizado com sucesso.'
      });
    } catch (err: any) {
      console.error('[SidebarPreferencesController.update] Erro:', err);
      res.status(500).json({ error: 'Erro ao salvar preferências do menu lateral.' });
    }
  }

  static reset(req: Request, res: Response): void {
    try {
      const userId = req.user?.userId;
      const tenantId = req.tenantId || req.user?.tenantId;

      if (!userId || !tenantId) {
        res.status(401).json({ error: 'Usuário e estabelecimento obrigatórios.' });
        return;
      }

      db.prepare(`
        DELETE FROM user_sidebar_preferences
        WHERE user_id = ? AND tenant_id = ?
      `).run(userId, tenantId);

      res.json({
        userId,
        tenantId,
        hiddenItems: [],
        message: 'Menu lateral restaurado para o padrão.'
      });
    } catch (err: any) {
      console.error('[SidebarPreferencesController.reset] Erro:', err);
      res.status(500).json({ error: 'Erro ao restaurar menu lateral.' });
    }
  }
}
