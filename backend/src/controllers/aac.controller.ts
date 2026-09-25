import { Request, Response } from 'express';
import '../middlewares/auth.middleware';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { db } from '../config/database';

export class AACController {
  /**
   * GET /v1/aac/boards?patientId=xyz
   * Lista as pranchas ativas de um paciente no tenant
   */
  static async listBoards(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId;
      const patientId = req.query.patientId as string;

      if (!tenantId) {
        res.status(403).json({ error: 'Clínica não identificada no contexto.' });
        return;
      }
      if (!patientId) {
        res.status(400).json({ error: 'O parâmetro patientId é obrigatório.' });
        return;
      }

      // Validação de isolamento do paciente no tenant
      const patient = db.prepare('SELECT id, full_name, COALESCE(social_name, full_name) as name FROM patients WHERE id = ? AND tenant_id = ?').get(patientId, tenantId) as any;
      if (!patient) {
        res.status(404).json({ error: 'Paciente não encontrado neste ambiente clínico.' });
        return;
      }

      const boards = db.prepare(`
        SELECT b.id, b.tenant_id, b.patient_id, b.created_by_professional_id,
               b.name, b.description, b.context, b.columns, b.status, b.is_template,
               b.created_at, b.updated_at,
               (SELECT COUNT(*) FROM aac_pages p WHERE p.board_id = b.id) as pages_count,
               (SELECT COUNT(*) FROM aac_cards c WHERE c.board_id = b.id) as cards_count
        FROM aac_boards b
        WHERE b.tenant_id = ? AND b.patient_id = ?
        ORDER BY b.created_at DESC
      `).all(tenantId, patientId) as any[];

      res.json({ boards, patientName: patient.name });
    } catch (err: any) {
      console.error('[AACController.listBoards] Erro:', err);
      res.status(500).json({ error: 'Erro ao listar pranchas de CAA do paciente.' });
    }
  }

  /**
   * GET /v1/aac/boards/:id
   * Retorna os detalhes de uma prancha específica com todas as suas páginas e cartões
   */
  static async getBoard(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId;
      const boardId = req.params.id;

      const board = db.prepare(`
        SELECT id, tenant_id, patient_id, created_by_professional_id,
               name, description, context, columns, status, is_template,
               created_at, updated_at
        FROM aac_boards
        WHERE id = ? AND tenant_id = ?
      `).get(boardId, tenantId) as any;

      if (!board) {
        res.status(404).json({ error: 'Prancha de CAA não encontrada.' });
        return;
      }

      const pages = db.prepare(`
        SELECT id, board_id, name, position, icon, created_at
        FROM aac_pages
        WHERE board_id = ?
        ORDER BY position ASC, created_at ASC
      `).all(boardId) as any[];

      const cards = db.prepare(`
        SELECT *
        FROM aac_cards
        WHERE board_id = ?
        ORDER BY position ASC, created_at ASC
      `).all(boardId) as any[];

      // Agrupa os cartões dentro de suas respectivas páginas garantindo o campo behavior
      const pagesWithCards = pages.map(p => ({
        ...p,
        cards: cards.filter(c => c.page_id === p.id).map(c => ({
          ...c,
          behavior: c.behavior || (c.category === 'navigation' ? 'navigation' : (c.target_page_id ? 'word_and_navigation' : 'word'))
        }))
      }));

      res.json({
        board: {
          ...board,
          pages: pagesWithCards
        }
      });
    } catch (err: any) {
      console.error('[AACController.getBoard] Erro:', err);
      res.status(500).json({ error: 'Erro ao carregar detalhes da prancha de CAA.' });
    }
  }

  /**
   * POST /v1/aac/boards
   * Cria uma nova prancha de comunicação (em branco ou com vocabulário nuclear pré-carregado)
   */
  static async createBoard(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId;
      const userId = req.user?.userId;
      const {
        patientId,
        name,
        description = '',
        context = 'Geral',
        columns = 4,
        useStarterTemplate = true
      } = req.body;

      if (!tenantId || !userId) {
        res.status(401).json({ error: 'Sessão inválida ou tenant não identificado.' });
        return;
      }

      if (!patientId || !name?.trim()) {
        res.status(400).json({ error: 'patientId e name são campos obrigatórios.' });
        return;
      }

      // Validação do paciente
      const patient = db.prepare('SELECT id FROM patients WHERE id = ? AND tenant_id = ?').get(patientId, tenantId);
      if (!patient) {
        res.status(404).json({ error: 'Paciente não encontrado neste ambiente.' });
        return;
      }

      const boardId = `aac-board-${uuidv4()}`;
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO aac_boards (
          id, tenant_id, patient_id, created_by_professional_id,
          name, description, context, columns, status, is_template,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', 0, ?, ?)
      `).run(
        boardId,
        tenantId,
        patientId,
        userId,
        name.trim(),
        description.trim(),
        context.trim(),
        Number(columns) || 4,
        now,
        now
      );

      // Se solicitado, popula com o vocabulário clínico nuclear inicial (Chave Fitzgerald)
      if (useStarterTemplate) {
        AACController.seedStarterPagesAndCards(boardId);
      } else {
        // Cria pelo menos uma página inicial em branco
        const initialPageId = `aac-page-${uuidv4()}`;
        db.prepare(`
          INSERT INTO aac_pages (id, board_id, name, position, icon, created_at)
          VALUES (?, ?, 'Principal', 0, 'Home', ?)
        `).run(initialPageId, boardId, now);
      }

      // Retorna o resultado completo
      req.params.id = boardId;
      return await AACController.getBoard(req, res);
    } catch (err: any) {
      console.error('[AACController.createBoard] Erro:', err);
      res.status(500).json({ error: 'Erro ao criar prancha de CAA.' });
    }
  }

  /**
   * PUT /v1/aac/boards/:id
   * Atualiza os dados gerais da prancha
   */
  static async updateBoard(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId;
      const boardId = req.params.id;
      const { name, description, context, columns, status } = req.body;

      const board = db.prepare('SELECT id FROM aac_boards WHERE id = ? AND tenant_id = ?').get(boardId, tenantId);
      if (!board) {
        res.status(404).json({ error: 'Prancha de CAA não encontrada.' });
        return;
      }

      const now = new Date().toISOString();
      db.prepare(`
        UPDATE aac_boards
        SET name = COALESCE(?, name),
            description = COALESCE(?, description),
            context = COALESCE(?, context),
            columns = COALESCE(?, columns),
            status = COALESCE(?, status),
            updated_at = ?
        WHERE id = ? AND tenant_id = ?
      `).run(
        name !== undefined ? name.trim() : null,
        description !== undefined ? description.trim() : null,
        context !== undefined ? context.trim() : null,
        columns !== undefined ? Number(columns) : null,
        status !== undefined ? status : null,
        now,
        boardId,
        tenantId
      );

      res.json({ success: true, message: 'Prancha atualizada com sucesso.' });
    } catch (err: any) {
      console.error('[AACController.updateBoard] Erro:', err);
      res.status(500).json({ error: 'Erro ao atualizar prancha de CAA.' });
    }
  }

  /**
   * POST /v1/aac/boards/:id/duplicate
   * Duplica integralmente uma prancha com todas as suas páginas e cartões
   */
  static async duplicateBoard(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId;
      const userId = req.user?.userId;
      const boardId = req.params.id;

      const originalBoard = db.prepare('SELECT * FROM aac_boards WHERE id = ? AND tenant_id = ?').get(boardId, tenantId) as any;
      if (!originalBoard) {
        res.status(404).json({ error: 'Prancha original não encontrada.' });
        return;
      }

      const newBoardId = `aac-board-${uuidv4()}`;
      const now = new Date().toISOString();
      const newName = `${originalBoard.name} (Cópia)`;

      db.prepare(`
        INSERT INTO aac_boards (
          id, tenant_id, patient_id, created_by_professional_id,
          name, description, context, columns, status, is_template,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', 0, ?, ?)
      `).run(
        newBoardId,
        tenantId,
        originalBoard.patient_id,
        userId || originalBoard.created_by_professional_id,
        newName,
        originalBoard.description,
        originalBoard.context,
        originalBoard.columns,
        now,
        now
      );

      // Busca páginas antigas
      const oldPages = db.prepare('SELECT * FROM aac_pages WHERE board_id = ? ORDER BY position ASC').all(boardId) as any[];
      const pageIdMap = new Map<string, string>();

      const insertPageStmt = db.prepare(`
        INSERT INTO aac_pages (id, board_id, name, position, icon, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      for (const op of oldPages) {
        const newPageId = `aac-page-${uuidv4()}`;
        pageIdMap.set(op.id, newPageId);
        insertPageStmt.run(newPageId, newBoardId, op.name, op.position, op.icon, now);
      }

      // Busca cartões antigos
      const oldCards = db.prepare('SELECT * FROM aac_cards WHERE board_id = ? ORDER BY position ASC').all(boardId) as any[];
      const insertCardStmt = db.prepare(`
        INSERT INTO aac_cards (
          id, board_id, page_id, label, spoken_text, image_url,
          symbol_type, category, color, position, target_page_id, active,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const oc of oldCards) {
        const newCardId = `aac-card-${uuidv4()}`;
        const newPageId = pageIdMap.get(oc.page_id);
        if (!newPageId) continue;

        // Se o cartão apontava para uma página interna do mesmo board, atualiza para o novo ID
        const targetPage = oc.target_page_id ? (pageIdMap.get(oc.target_page_id) || null) : null;

        insertCardStmt.run(
          newCardId,
          newBoardId,
          newPageId,
          oc.label,
          oc.spoken_text,
          oc.image_url,
          oc.symbol_type,
          oc.category,
          oc.color,
          oc.position,
          targetPage,
          oc.active,
          now,
          now
        );
      }

      req.params.id = newBoardId;
      return await AACController.getBoard(req, res);
    } catch (err: any) {
      console.error('[AACController.duplicateBoard] Erro:', err);
      res.status(500).json({ error: 'Erro ao duplicar prancha de CAA.' });
    }
  }

  /**
   * DELETE /v1/aac/boards/:id
   * Exclui uma prancha e seus elementos vinculados
   */
  static async deleteBoard(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId;
      const boardId = req.params.id;

      const board = db.prepare('SELECT id FROM aac_boards WHERE id = ? AND tenant_id = ?').get(boardId, tenantId);
      if (!board) {
        res.status(404).json({ error: 'Prancha de CAA não encontrada.' });
        return;
      }

      db.prepare('DELETE FROM aac_cards WHERE board_id = ?').run(boardId);
      db.prepare('DELETE FROM aac_pages WHERE board_id = ?').run(boardId);
      db.prepare('DELETE FROM aac_boards WHERE id = ? AND tenant_id = ?').run(boardId, tenantId);

      res.json({ success: true, message: 'Prancha de CAA excluída com sucesso.' });
    } catch (err: any) {
      console.error('[AACController.deleteBoard] Erro:', err);
      res.status(500).json({ error: 'Erro ao excluir prancha de CAA.' });
    }
  }

  /**
   * POST /v1/aac/boards/:boardId/pages
   * Cria uma nova página na prancha
   */
  static async createPage(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId;
      const boardId = req.params.boardId;
      const { name, icon = 'Layers', position } = req.body;

      const board = db.prepare('SELECT id FROM aac_boards WHERE id = ? AND tenant_id = ?').get(boardId, tenantId);
      if (!board) {
        res.status(404).json({ error: 'Prancha de CAA não encontrada.' });
        return;
      }

      if (!name?.trim()) {
        res.status(400).json({ error: 'Nome da página é obrigatório.' });
        return;
      }

      let pagePos = Number(position);
      if (isNaN(pagePos)) {
        const lastPosRow = db.prepare('SELECT MAX(position) as maxPos FROM aac_pages WHERE board_id = ?').get(boardId) as any;
        pagePos = (lastPosRow?.maxPos ?? -1) + 1;
      }

      const pageId = `aac-page-${uuidv4()}`;
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO aac_pages (id, board_id, name, position, icon, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(pageId, boardId, name.trim(), pagePos, icon || 'Layers', now);

      res.status(201).json({
        success: true,
        page: {
          id: pageId,
          board_id: boardId,
          name: name.trim(),
          position: pagePos,
          icon,
          cards: []
        }
      });
    } catch (err: any) {
      console.error('[AACController.createPage] Erro:', err);
      res.status(500).json({ error: 'Erro ao criar página na prancha.' });
    }
  }

  /**
   * PUT /v1/aac/boards/:boardId/pages/:pageId
   * Atualiza uma página existente
   */
  static async updatePage(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId;
      const { boardId, pageId } = req.params;
      const { name, icon, position } = req.body;

      const board = db.prepare('SELECT id FROM aac_boards WHERE id = ? AND tenant_id = ?').get(boardId, tenantId);
      if (!board) {
        res.status(404).json({ error: 'Prancha de CAA não encontrada.' });
        return;
      }

      db.prepare(`
        UPDATE aac_pages
        SET name = COALESCE(?, name),
            icon = COALESCE(?, icon),
            position = COALESCE(?, position)
        WHERE id = ? AND board_id = ?
      `).run(
        name !== undefined ? name.trim() : null,
        icon !== undefined ? icon : null,
        position !== undefined ? Number(position) : null,
        pageId,
        boardId
      );

      res.json({ success: true, message: 'Página atualizada com sucesso.' });
    } catch (err: any) {
      console.error('[AACController.updatePage] Erro:', err);
      res.status(500).json({ error: 'Erro ao atualizar página da prancha.' });
    }
  }

  /**
   * DELETE /v1/aac/boards/:boardId/pages/:pageId
   * Exclui uma página e seus cartões
   */
  static async deletePage(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId;
      const { boardId, pageId } = req.params;

      const board = db.prepare('SELECT id FROM aac_boards WHERE id = ? AND tenant_id = ?').get(boardId, tenantId);
      if (!board) {
        res.status(404).json({ error: 'Prancha de CAA não encontrada.' });
        return;
      }

      // Impede excluir a única página da prancha
      const totalPagesRow = db.prepare('SELECT COUNT(*) as count FROM aac_pages WHERE board_id = ?').get(boardId) as any;
      if (totalPagesRow?.count <= 1) {
        res.status(400).json({ error: 'A prancha precisa manter ao menos uma página ativa.' });
        return;
      }

      db.prepare('DELETE FROM aac_cards WHERE page_id = ? AND board_id = ?').run(pageId, boardId);
      db.prepare('DELETE FROM aac_pages WHERE id = ? AND board_id = ?').run(pageId, boardId);

      res.json({ success: true, message: 'Página excluída com sucesso.' });
    } catch (err: any) {
      console.error('[AACController.deletePage] Erro:', err);
      res.status(500).json({ error: 'Erro ao excluir página da prancha.' });
    }
  }

  /**
   * POST /v1/aac/boards/:boardId/pages/:pageId/duplicate
   * Duplica uma página e todos os seus cartões vinculados
   */
  static async duplicatePage(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId;
      const { boardId, pageId } = req.params;

      const board = db.prepare('SELECT id FROM aac_boards WHERE id = ? AND tenant_id = ?').get(boardId, tenantId);
      if (!board) {
        res.status(404).json({ error: 'Prancha de CAA não encontrada.' });
        return;
      }

      const originalPage = db.prepare('SELECT * FROM aac_pages WHERE id = ? AND board_id = ?').get(pageId, boardId) as any;
      if (!originalPage) {
        res.status(404).json({ error: 'Página original não encontrada.' });
        return;
      }

      const lastPosRow = db.prepare('SELECT MAX(position) as maxPos FROM aac_pages WHERE board_id = ?').get(boardId) as any;
      const newPos = (lastPosRow?.maxPos ?? -1) + 1;
      const newPageId = `aac-page-${uuidv4()}`;
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO aac_pages (id, board_id, name, position, icon, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(newPageId, boardId, `${originalPage.name} (Cópia)`, newPos, originalPage.icon || 'Layers', now);

      // Clona cartões da página original
      const cards = db.prepare('SELECT * FROM aac_cards WHERE page_id = ? AND board_id = ? ORDER BY position ASC').all(pageId, boardId) as any[];
      const insertCardStmt = db.prepare(`
        INSERT INTO aac_cards (
          id, board_id, page_id, label, spoken_text, image_url,
          symbol_type, category, color, position, target_page_id, active,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const card of cards) {
        const newCardId = `aac-card-${uuidv4()}`;
        insertCardStmt.run(
          newCardId,
          boardId,
          newPageId,
          card.label,
          card.spoken_text,
          card.image_url,
          card.symbol_type,
          card.category,
          card.color,
          card.position,
          card.target_page_id,
          card.active,
          now,
          now
        );
      }

      res.status(201).json({
        success: true,
        message: 'Página duplicada com sucesso.',
        pageId: newPageId
      });
    } catch (err: any) {
      console.error('[AACController.duplicatePage] Erro:', err);
      res.status(500).json({ error: 'Erro ao duplicar página da prancha.' });
    }
  }

  /**
   * POST /v1/aac/boards/:boardId/reorder-pages
   * Reorganiza a ordem das páginas da prancha
   */
  static async reorderPages(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId;
      const boardId = req.params.boardId;
      const { pages } = req.body; // Array de { id, position }

      const board = db.prepare('SELECT id FROM aac_boards WHERE id = ? AND tenant_id = ?').get(boardId, tenantId);
      if (!board) {
        res.status(404).json({ error: 'Prancha de CAA não encontrada.' });
        return;
      }

      if (!Array.isArray(pages)) {
        res.status(400).json({ error: 'Formato inválido para pages, esperava array.' });
        return;
      }

      const updateStmt = db.prepare(`
        UPDATE aac_pages
        SET position = ?
        WHERE id = ? AND board_id = ?
      `);

      for (let i = 0; i < pages.length; i++) {
        const item = pages[i];
        if (item && item.id) {
          updateStmt.run(
            item.position !== undefined ? Number(item.position) : i,
            item.id,
            boardId
          );
        }
      }

      res.json({ success: true, message: 'Ordem das páginas atualizada com sucesso.' });
    } catch (err: any) {
      console.error('[AACController.reorderPages] Erro:', err);
      res.status(500).json({ error: 'Erro ao reordenar páginas da prancha.' });
    }
  }

  /**
   * POST /v1/aac/boards/:boardId/cards
   * Cria um novo cartão na página
   */
  static async createCard(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId;
      const boardId = req.params.boardId;
      const {
        page_id,
        label,
        spoken_text,
        image_url = '',
        symbol_type = 'symbol',
        category = 'action',
        color = '#f1f5f9',
        position,
        target_page_id = null,
        behavior,
        active = 1
      } = req.body;

      const board = db.prepare('SELECT id FROM aac_boards WHERE id = ? AND tenant_id = ?').get(boardId, tenantId);
      if (!board) {
        res.status(404).json({ error: 'Prancha de CAA não encontrada.' });
        return;
      }

      if (!page_id || !label?.trim()) {
        res.status(400).json({ error: 'page_id e label são campos obrigatórios.' });
        return;
      }

      let cardPos = Number(position);
      if (isNaN(cardPos)) {
        const lastPos = db.prepare('SELECT MAX(position) as maxPos FROM aac_cards WHERE page_id = ?').get(page_id) as any;
        cardPos = (lastPos?.maxPos ?? -1) + 1;
      }

      const cardId = `aac-card-${uuidv4()}`;
      const now = new Date().toISOString();
      const resolvedBehavior = behavior || (category === 'navigation' ? 'navigation' : (target_page_id ? 'word_and_navigation' : 'word'));

      let hasBehaviorCol = false;
      try {
        const cols = db.prepare('PRAGMA table_info(aac_cards)').all() as any[];
        hasBehaviorCol = cols.some((c: any) => c.name === 'behavior');
      } catch (_) {}

      if (hasBehaviorCol) {
        db.prepare(`
          INSERT INTO aac_cards (
            id, board_id, page_id, label, spoken_text, image_url,
            symbol_type, category, color, position, target_page_id, behavior, active,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          cardId,
          boardId,
          page_id,
          label.trim(),
          (spoken_text?.trim() || label.trim()),
          image_url || '',
          symbol_type || 'symbol',
          category || 'action',
          color || '#f1f5f9',
          cardPos,
          target_page_id || null,
          resolvedBehavior,
          active === 0 ? 0 : 1,
          now,
          now
        );
      } else {
        db.prepare(`
          INSERT INTO aac_cards (
            id, board_id, page_id, label, spoken_text, image_url,
            symbol_type, category, color, position, target_page_id, active,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          cardId,
          boardId,
          page_id,
          label.trim(),
          (spoken_text?.trim() || label.trim()),
          image_url || '',
          symbol_type || 'symbol',
          category || 'action',
          color || '#f1f5f9',
          cardPos,
          target_page_id || null,
          active === 0 ? 0 : 1,
          now,
          now
        );
      }

      res.status(201).json({
        success: true,
        card: {
          id: cardId,
          board_id: boardId,
          page_id,
          label: label.trim(),
          spoken_text: (spoken_text?.trim() || label.trim()),
          image_url: image_url || '',
          symbol_type: symbol_type || 'symbol',
          category: category || 'action',
          color: color || '#f1f5f9',
          position: cardPos,
          target_page_id: target_page_id || null,
          behavior: resolvedBehavior,
          active: active === 0 ? 0 : 1
        }
      });
    } catch (err: any) {
      console.error('[AACController.createCard] Erro:', err);
      res.status(500).json({ error: 'Erro ao criar cartão de CAA.' });
    }
  }

  /**
   * PUT /v1/aac/boards/:boardId/cards/:cardId
   * Atualiza um cartão existente
   */
  static async updateCard(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId;
      const { boardId, cardId } = req.params;
      const {
        page_id,
        label,
        spoken_text,
        image_url,
        symbol_type,
        category,
        color,
        position,
        target_page_id,
        behavior,
        active
      } = req.body;

      const board = db.prepare('SELECT id FROM aac_boards WHERE id = ? AND tenant_id = ?').get(boardId, tenantId);
      if (!board) {
        res.status(404).json({ error: 'Prancha de CAA não encontrada.' });
        return;
      }

      let hasBehaviorCol = false;
      try {
        const cols = db.prepare('PRAGMA table_info(aac_cards)').all() as any[];
        hasBehaviorCol = cols.some((c: any) => c.name === 'behavior');
      } catch (_) {}

      const now = new Date().toISOString();

      if (hasBehaviorCol) {
        db.prepare(`
          UPDATE aac_cards
          SET page_id = COALESCE(?, page_id),
              label = COALESCE(?, label),
              spoken_text = COALESCE(?, spoken_text),
              image_url = COALESCE(?, image_url),
              symbol_type = COALESCE(?, symbol_type),
              category = COALESCE(?, category),
              color = COALESCE(?, color),
              position = COALESCE(?, position),
              target_page_id = ?,
              behavior = COALESCE(?, behavior),
              active = COALESCE(?, active),
              updated_at = ?
          WHERE id = ? AND board_id = ?
        `).run(
          page_id !== undefined ? page_id : null,
          label !== undefined ? label.trim() : null,
          spoken_text !== undefined ? spoken_text.trim() : null,
          image_url !== undefined ? image_url : null,
          symbol_type !== undefined ? symbol_type : null,
          category !== undefined ? category : null,
          color !== undefined ? color : null,
          position !== undefined ? Number(position) : null,
          target_page_id !== undefined ? (target_page_id || null) : null,
          behavior !== undefined ? behavior : null,
          active !== undefined ? (active ? 1 : 0) : null,
          now,
          cardId,
          boardId
        );
      } else {
        db.prepare(`
          UPDATE aac_cards
          SET page_id = COALESCE(?, page_id),
              label = COALESCE(?, label),
              spoken_text = COALESCE(?, spoken_text),
              image_url = COALESCE(?, image_url),
              symbol_type = COALESCE(?, symbol_type),
              category = COALESCE(?, category),
              color = COALESCE(?, color),
              position = COALESCE(?, position),
              target_page_id = ?,
              active = COALESCE(?, active),
              updated_at = ?
          WHERE id = ? AND board_id = ?
        `).run(
          page_id !== undefined ? page_id : null,
          label !== undefined ? label.trim() : null,
          spoken_text !== undefined ? spoken_text.trim() : null,
          image_url !== undefined ? image_url : null,
          symbol_type !== undefined ? symbol_type : null,
          category !== undefined ? category : null,
          color !== undefined ? color : null,
          position !== undefined ? Number(position) : null,
          target_page_id !== undefined ? (target_page_id || null) : null,
          active !== undefined ? (active ? 1 : 0) : null,
          now,
          cardId,
          boardId
        );
      }

      res.json({ success: true, message: 'Cartão atualizado com sucesso.' });
    } catch (err: any) {
      console.error('[AACController.updateCard] Erro:', err);
      res.status(500).json({ error: 'Erro ao atualizar cartão de CAA.' });
    }
  }

  /**
   * DELETE /v1/aac/boards/:boardId/cards/:cardId
   * Exclui um cartão da prancha
   */
  static async deleteCard(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId;
      const { boardId, cardId } = req.params;

      const board = db.prepare('SELECT id FROM aac_boards WHERE id = ? AND tenant_id = ?').get(boardId, tenantId);
      if (!board) {
        res.status(404).json({ error: 'Prancha de CAA não encontrada.' });
        return;
      }

      db.prepare('DELETE FROM aac_cards WHERE id = ? AND board_id = ?').run(cardId, boardId);
      res.json({ success: true, message: 'Cartão excluído com sucesso.' });
    } catch (err: any) {
      console.error('[AACController.deleteCard] Erro:', err);
      res.status(500).json({ error: 'Erro ao excluir cartão de CAA.' });
    }
  }

  /**
   * POST /v1/aac/boards/:boardId/cards/:cardId/duplicate
   * Duplica um cartão na mesma página
   */
  static async duplicateCard(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId;
      const { boardId, cardId } = req.params;

      const board = db.prepare('SELECT id FROM aac_boards WHERE id = ? AND tenant_id = ?').get(boardId, tenantId);
      if (!board) {
        res.status(404).json({ error: 'Prancha de CAA não encontrada.' });
        return;
      }

      const card = db.prepare('SELECT * FROM aac_cards WHERE id = ? AND board_id = ?').get(cardId, boardId) as any;
      if (!card) {
        res.status(404).json({ error: 'Cartão não encontrado.' });
        return;
      }

      const lastPosRow = db.prepare('SELECT MAX(position) as maxPos FROM aac_cards WHERE page_id = ?').get(card.page_id) as any;
      const newPos = (lastPosRow?.maxPos ?? -1) + 1;
      const newCardId = `aac-card-${uuidv4()}`;
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO aac_cards (
          id, board_id, page_id, label, spoken_text, image_url,
          symbol_type, category, color, position, target_page_id, active,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        newCardId,
        boardId,
        card.page_id,
        `${card.label} (Cópia)`,
        card.spoken_text,
        card.image_url,
        card.symbol_type,
        card.category,
        card.color,
        newPos,
        card.target_page_id,
        card.active,
        now,
        now
      );

      res.status(201).json({
        success: true,
        message: 'Cartão duplicado com sucesso.',
        cardId: newCardId
      });
    } catch (err: any) {
      console.error('[AACController.duplicateCard] Erro:', err);
      res.status(500).json({ error: 'Erro ao duplicar cartão de CAA.' });
    }
  }

  /**
   * POST /v1/aac/boards/:boardId/reorder-cards
   * Reorganiza a ordem e/ou página de múltiplos cartões
   */
  static async reorderCards(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId;
      const boardId = req.params.boardId;
      const { cards } = req.body; // Array de { id, page_id?, position }

      const board = db.prepare('SELECT id FROM aac_boards WHERE id = ? AND tenant_id = ?').get(boardId, tenantId);
      if (!board) {
        res.status(404).json({ error: 'Prancha de CAA não encontrada.' });
        return;
      }

      if (!Array.isArray(cards)) {
        res.status(400).json({ error: 'Estrutura cards inválida, esperava array.' });
        return;
      }

      const updateStmt = db.prepare(`
        UPDATE aac_cards
        SET position = ?,
            page_id = COALESCE(?, page_id),
            updated_at = datetime('now')
        WHERE id = ? AND board_id = ?
      `);

      for (let i = 0; i < cards.length; i++) {
        const item = cards[i];
        if (item && item.id) {
          updateStmt.run(
            item.position !== undefined ? Number(item.position) : i,
            item.page_id || null,
            item.id,
            boardId
          );
        }
      }

      res.json({ success: true, message: 'Ordem dos cartões atualizada com sucesso.' });
    } catch (err: any) {
      console.error('[AACController.reorderCards] Erro:', err);
      res.status(500).json({ error: 'Erro ao reordenar cartões de CAA.' });
    }
  }

  /**
   * POST /v1/aac/upload-image
   * Salva imagem enviada para o cartão no disco local seguro (evitando base64 no banco)
   */
  static async uploadImage(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(403).json({ error: 'Clínica não identificada no contexto.' });
        return;
      }

      const { image, fileName } = req.body;
      if (!image || typeof image !== 'string') {
        res.status(400).json({ error: 'Dados da imagem não fornecidos.' });
        return;
      }

      // Suporta DataURL base64: data:image/png;base64,xxxx
      const match = image.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
      let ext = 'png';
      let buffer: Buffer;

      if (match) {
        ext = match[1] === 'jpeg' ? 'jpg' : match[1];
        buffer = Buffer.from(match[2], 'base64');
      } else {
        buffer = Buffer.from(image, 'base64');
      }

      // Validação de tamanho: máximo 5MB
      if (buffer.length > 5 * 1024 * 1024) {
        res.status(400).json({ error: 'A imagem deve ter no máximo 5MB.' });
        return;
      }

      const uploadsDir = path.resolve(__dirname, '../../public/uploads/aac');
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }

      const uniqueName = `aac_${tenantId}_${uuidv4()}.${ext}`;
      const filePath = path.join(uploadsDir, uniqueName);

      fs.writeFileSync(filePath, buffer);

      const publicUrl = `/uploads/aac/${uniqueName}`;
      res.json({ success: true, url: publicUrl });
    } catch (err: any) {
      console.error('[AACController.uploadImage] Erro:', err);
      res.status(500).json({ error: 'Erro ao processar upload de imagem para o cartão.' });
    }
  }

  /**
   * Helper privado: Popula o vocabulário clínico nuclear inicial com Chave Fitzgerald
   */
  /**
   * Helper privado: Popula o vocabulário clínico nuclear inicial com Chave Fitzgerald e 27 categorias
   */
  /**
   * Helper privado: Popula o vocabulário clínico nuclear inicial com Chave Fitzgerald e 28 categorias completas
   */
  private static seedStarterPagesAndCards(boardId: string): void {
    const now = new Date().toISOString();

    const insertPage = db.prepare(`
      INSERT INTO aac_pages (id, board_id, name, position, icon, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const insertCard = db.prepare(`
      INSERT INTO aac_cards (
        id, board_id, page_id, label, spoken_text, image_url,
        symbol_type, category, color, position, target_page_id, active,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `);

    const categoriesData: Array<{
      name: string;
      icon: string;
      cards: Array<{ label: string; spoken?: string; cat: string; col?: string; sym: string; target_page_name?: string }>;
    }> = [
      {
        name: 'Principal',
        icon: 'Home',
        cards: [
          // Vocabulário Nuclear Permanente (Linha 1 e 2 - Memória Motora)
          { label: 'Eu', spoken: 'Eu', cat: 'pronoun', col: '#fef08a', sym: '🙋' },
          { label: 'Você', spoken: 'Você', cat: 'pronoun', col: '#fef08a', sym: '👉' },
          { label: 'Quero', spoken: 'Quero', cat: 'action', col: '#bbf7d0', sym: '🤲' },
          { label: 'Não quero', spoken: 'Não quero', cat: 'action', col: '#fee2e2', sym: '🚫' },
          { label: 'Mais', spoken: 'Mais', cat: 'descriptor', col: '#f1f5f9', sym: '➕' },
          { label: 'Acabou', spoken: 'Acabou', cat: 'descriptor', col: '#f1f5f9', sym: '🛑' },
          { label: 'Sim', spoken: 'Sim', cat: 'descriptor', col: '#dcfce7', sym: '👍' },
          { label: 'Não', spoken: 'Não', cat: 'descriptor', col: '#fee2e2', sym: '👎' },
          { label: 'Ajuda', spoken: 'Ajuda', cat: 'action', col: '#fef3c7', sym: '🆘' },
          { label: 'Gostei', spoken: 'Gostei', cat: 'descriptor', col: '#dcfce7', sym: '😊' },
          { label: 'Não gostei', spoken: 'Não gostei', cat: 'descriptor', col: '#fee2e2', sym: '😖' },
          { label: 'Ir', spoken: 'Ir', cat: 'action', col: '#bbf7d0', sym: '🚶' },
          { label: 'Água', spoken: 'Água', cat: 'noun', col: '#fed7aa', sym: '💧' },
          { label: 'Banheiro', spoken: 'Quero ir ao banheiro', cat: 'noun', col: '#fed7aa', sym: '🚽' },
          { label: 'Dor', spoken: 'Estou com dor', cat: 'feeling', col: '#fee2e2', sym: '🩹' },
          { label: 'Para', spoken: 'Para por favor', cat: 'action', col: '#fee2e2', sym: '🛑' },

          // Atalhos de Contexto (Navegação Real para Categorias)
          { label: 'Brincar →', cat: 'navigation', target_page_name: 'Brincadeiras', sym: '🎮', col: '#e0e7ff' },
          { label: 'Comer →', cat: 'navigation', target_page_name: 'Alimentos & Bebidas', sym: '🍽️', col: '#e0e7ff' },
          { label: 'Sentimentos →', cat: 'navigation', target_page_name: 'Sentimentos', sym: '😊', col: '#e0e7ff' },
          { label: 'Dor & Necessidades →', cat: 'navigation', target_page_name: 'Necessidades & Dor', sym: '🩹', col: '#e0e7ff' },
          { label: 'Pessoas →', cat: 'navigation', target_page_name: 'Pessoas', sym: '👨‍👩‍👧', col: '#e0e7ff' },
          { label: 'Lugares →', cat: 'navigation', target_page_name: 'Lugares', sym: '📍', col: '#e0e7ff' },
          { label: 'Higiene →', cat: 'navigation', target_page_name: 'Higiene', sym: '🚽', col: '#e0e7ff' },
          { label: 'Escola / Terapia →', cat: 'navigation', target_page_name: 'Escola / Terapia', sym: '🎒', col: '#e0e7ff' },
          { label: 'Corpo →', cat: 'navigation', target_page_name: 'Corpo', sym: '🫀', col: '#e0e7ff' },
          { label: 'Saúde →', cat: 'navigation', target_page_name: 'Saúde', sym: '🩺', col: '#e0e7ff' },
          { label: 'Perguntas →', cat: 'navigation', target_page_name: 'Perguntas', sym: '❓', col: '#e0e7ff' },
          { label: 'Comunicação →', cat: 'navigation', target_page_name: 'Comunicação', sym: '💬', col: '#e0e7ff' },
          { label: 'Rotina →', cat: 'navigation', target_page_name: 'Rotina', sym: '⏰', col: '#e0e7ff' },
          { label: 'Social →', cat: 'navigation', target_page_name: 'Social', sym: '🤝', col: '#e0e7ff' },
          { label: 'Ações →', cat: 'navigation', target_page_name: 'Ações', sym: '🏃', col: '#e0e7ff' },
          { label: 'Mais Opções →', cat: 'navigation', target_page_name: 'Respostas Rápidas', sym: '⚡', col: '#e0e7ff' }
        ]
      },
      {
        name: 'Brincadeiras',
        icon: 'Play',
        cards: [
          // Subpáginas de Brincadeiras
          { label: 'Jogos & Movimento →', cat: 'navigation', target_page_name: 'Jogos & Movimento', sym: '🏃', col: '#e0e7ff' },
          { label: 'Brinquedos →', cat: 'navigation', target_page_name: 'Brinquedos', sym: '🧸', col: '#e0e7ff' },
          { label: 'Artes & Desenho →', cat: 'navigation', target_page_name: 'Artes & Desenho', sym: '🎨', col: '#e0e7ff' },
          // Núcleo local
          { label: 'Quero', spoken: 'Quero', cat: 'action', col: '#bbf7d0', sym: '🤲' },
          { label: 'Mais', spoken: 'Mais', cat: 'descriptor', col: '#f1f5f9', sym: '➕' },
          { label: 'Acabou', spoken: 'Acabou', cat: 'descriptor', col: '#f1f5f9', sym: '🛑' },
          { label: 'Minha vez', spoken: 'Minha vez', cat: 'social', col: '#fbcfe8', sym: '🙋' },
          { label: 'Sua vez', spoken: 'Sua vez', cat: 'social', col: '#fbcfe8', sym: '👉' },
          // Vocabulário de brincadeiras
          { label: 'Bola', spoken: 'Bola', cat: 'noun', col: '#fed7aa', sym: '⚽' },
          { label: 'Boneca', spoken: 'Boneca', cat: 'noun', col: '#fed7aa', sym: '🪆' },
          { label: 'Carrinho', spoken: 'Carrinho', cat: 'noun', col: '#fed7aa', sym: '🚗' },
          { label: 'Blocos', spoken: 'Blocos de montar', cat: 'noun', col: '#fed7aa', sym: '🧱' },
          { label: 'Massinha', spoken: 'Massinha', cat: 'noun', col: '#fed7aa', sym: '🟣' },
          { label: 'Quebra-cabeça', spoken: 'Quebra-cabeça', cat: 'noun', col: '#fed7aa', sym: '🧩' },
          { label: 'Bolha de Sabão', spoken: 'Bolha de sabão', cat: 'noun', col: '#fed7aa', sym: '🫧' },
          { label: 'Videogame', spoken: 'Videogame', cat: 'noun', col: '#fed7aa', sym: '🎮' },
          { label: 'Desenho Animado', spoken: 'Desenho animado', cat: 'noun', col: '#fed7aa', sym: '📺' },
          { label: 'De novo', spoken: 'De novo', cat: 'descriptor', col: '#dcfce7', sym: '🔁' },
          { label: 'Ganhei', spoken: 'Ganhei', cat: 'social', col: '#dcfce7', sym: '🏆' },
          { label: 'Perdi', spoken: 'Perdi', cat: 'social', col: '#fee2e2', sym: '🙃' },
          { label: 'Vamos brincar', spoken: 'Vamos brincar', cat: 'action', col: '#bbf7d0', sym: '✨' }
        ]
      },
      {
        name: 'Jogos & Movimento',
        icon: 'Sparkles',
        cards: [
          { label: 'Correr', spoken: 'Correr', cat: 'action', col: '#bbf7d0', sym: '🏃' },
          { label: 'Pular', spoken: 'Pular', cat: 'action', col: '#bbf7d0', sym: '🦘' },
          { label: 'Balanço', spoken: 'Balanço', cat: 'noun', col: '#fed7aa', sym: '🎡' },
          { label: 'Escorregador', spoken: 'Escorregador', cat: 'noun', col: '#fed7aa', sym: '🛝' },
          { label: 'Pega-pega', spoken: 'Pega-pega', cat: 'noun', col: '#fed7aa', sym: '🏃💨' },
          { label: 'Esconde-esconde', spoken: 'Esconde-esconde', cat: 'noun', col: '#fed7aa', sym: '🙈' },
          { label: 'Dança', spoken: 'Dançar', cat: 'action', col: '#bbf7d0', sym: '💃' },
          { label: 'Música', spoken: 'Música', cat: 'noun', col: '#fed7aa', sym: '🎵' },
          { label: 'Mais rápido', spoken: 'Mais rápido', cat: 'descriptor', col: '#f1f5f9', sym: '⚡' },
          { label: 'Devagar', spoken: 'Devagar', cat: 'descriptor', col: '#f1f5f9', sym: '🐢' },
          { label: 'Cuidado', spoken: 'Cuidado', cat: 'feeling', col: '#fee2e2', sym: '⚠️' },
          { label: 'Cansei', spoken: 'Cansei', cat: 'feeling', col: '#bfdbfe', sym: '😮‍💨' }
        ]
      },
      {
        name: 'Brinquedos',
        icon: 'Sparkles',
        cards: [
          { label: 'Bola', spoken: 'Bola', cat: 'noun', col: '#fed7aa', sym: '⚽' },
          { label: 'Boneca', spoken: 'Boneca', cat: 'noun', col: '#fed7aa', sym: '🪆' },
          { label: 'Carrinho', spoken: 'Carrinho', cat: 'noun', col: '#fed7aa', sym: '🚗' },
          { label: 'Blocos', spoken: 'Blocos', cat: 'noun', col: '#fed7aa', sym: '🧱' },
          { label: 'Urso de Pelúcia', spoken: 'Urso de pelúcia', cat: 'noun', col: '#fed7aa', sym: '🧸' },
          { label: 'Dinossauro', spoken: 'Dinossauro', cat: 'noun', col: '#fed7aa', sym: '🦖' },
          { label: 'Trem', spoken: 'Trem', cat: 'noun', col: '#fed7aa', sym: '🚂' },
          { label: 'Avião', spoken: 'Avião', cat: 'noun', col: '#fed7aa', sym: '✈️' },
          { label: 'Robô', spoken: 'Robô', cat: 'noun', col: '#fed7aa', sym: '🤖' },
          { label: 'Quebra-cabeça', spoken: 'Quebra-cabeça', cat: 'noun', col: '#fed7aa', sym: '🧩' },
          { label: 'Guardar Brinquedos', spoken: 'Guardar os brinquedos', cat: 'action', col: '#bbf7d0', sym: '📦' },
          { label: 'Meu Brinquedo', spoken: 'Meu brinquedo', cat: 'pronoun', col: '#fef08a', sym: '🎁' }
        ]
      },
      {
        name: 'Artes & Desenho',
        icon: 'Palette',
        cards: [
          { label: 'Desenhar', spoken: 'Desenhar', cat: 'action', col: '#bbf7d0', sym: '✏️' },
          { label: 'Pintar', spoken: 'Pintar', cat: 'action', col: '#bbf7d0', sym: '🖌️' },
          { label: 'Recortar', spoken: 'Recortar', cat: 'action', col: '#bbf7d0', sym: '✂️' },
          { label: 'Colar', spoken: 'Colar', cat: 'action', col: '#bbf7d0', sym: '🧴' },
          { label: 'Lápis de Cor', spoken: 'Lápis de cor', cat: 'noun', col: '#fed7aa', sym: '🖍️' },
          { label: 'Canetinha', spoken: 'Canetinha', cat: 'noun', col: '#fed7aa', sym: '🖊️' },
          { label: 'Tinta', spoken: 'Tinta', cat: 'noun', col: '#fed7aa', sym: '🎨' },
          { label: 'Papel', spoken: 'Papel', cat: 'noun', col: '#fed7aa', sym: '📄' },
          { label: 'Massinha', spoken: 'Massinha de modelar', cat: 'noun', col: '#fed7aa', sym: '🟣' },
          { label: 'Ficou Lindo', spoken: 'Ficou muito lindo', cat: 'descriptor', col: '#dcfce7', sym: '⭐' },
          { label: 'Olha o Desenho', spoken: 'Olha o meu desenho', cat: 'action', col: '#bbf7d0', sym: '👀' },
          { label: 'Limpar a Mesa', spoken: 'Limpar a mesa', cat: 'action', col: '#fef3c7', sym: '🧽' }
        ]
      },
      {
        name: 'Alimentos & Bebidas',
        icon: 'Coffee',
        cards: [
          // Subpáginas
          { label: 'Bebidas →', cat: 'navigation', target_page_name: 'Bebidas', sym: '🥤', col: '#e0e7ff' },
          { label: 'Refeições & Lanches →', cat: 'navigation', target_page_name: 'Refeições & Lanches', sym: '🥪', col: '#e0e7ff' },
          // Núcleo local
          { label: 'Quero comer', spoken: 'Quero comer', cat: 'action', col: '#bbf7d0', sym: '🍽️' },
          { label: 'Quero beber', spoken: 'Quero beber', cat: 'action', col: '#bbf7d0', sym: '🥤' },
          { label: 'Mais', spoken: 'Mais comida', cat: 'descriptor', col: '#f1f5f9', sym: '➕' },
          { label: 'Acabou', spoken: 'Já acabou', cat: 'descriptor', col: '#f1f5f9', sym: '🛑' },
          { label: 'Gostoso', spoken: 'Está muito gostoso', cat: 'descriptor', col: '#dcfce7', sym: '😋' },
          { label: 'Ruim', spoken: 'Não gostei do gosto', cat: 'descriptor', col: '#fee2e2', sym: '😖' },
          // Alimentos gerais
          { label: 'Água', spoken: 'Água', cat: 'noun', col: '#fed7aa', sym: '💧' },
          { label: 'Suco', spoken: 'Suco', cat: 'noun', col: '#fed7aa', sym: '🧃' },
          { label: 'Leite', spoken: 'Leite', cat: 'noun', col: '#fed7aa', sym: '🥛' },
          { label: 'Arroz', spoken: 'Arroz', cat: 'noun', col: '#fed7aa', sym: '🍚' },
          { label: 'Feijão', spoken: 'Feijão', cat: 'noun', col: '#fed7aa', sym: '🍲' },
          { label: 'Pão', spoken: 'Pão', cat: 'noun', col: '#fed7aa', sym: '🍞' },
          { label: 'Fruta', spoken: 'Fruta', cat: 'noun', col: '#fed7aa', sym: '🍎' },
          { label: 'Biscoito', spoken: 'Biscoito', cat: 'noun', col: '#fed7aa', sym: '🍪' },
          { label: 'Fome', spoken: 'Estou com fome', cat: 'feeling', col: '#fed7aa', sym: '🥪' },
          { label: 'Sede', spoken: 'Estou com sede', cat: 'feeling', col: '#fed7aa', sym: '💧' }
        ]
      },
      {
        name: 'Bebidas',
        icon: 'Droplet',
        cards: [
          { label: 'Água Natural', spoken: 'Água natural', cat: 'noun', col: '#fed7aa', sym: '💧' },
          { label: 'Água Gelada', spoken: 'Água bem gelada', cat: 'noun', col: '#fed7aa', sym: '🧊' },
          { label: 'Suco de Uva', spoken: 'Suco de uva', cat: 'noun', col: '#fed7aa', sym: '🍇' },
          { label: 'Suco de Laranja', spoken: 'Suco de laranja', cat: 'noun', col: '#fed7aa', sym: '🍊' },
          { label: 'Leite', spoken: 'Leite', cat: 'noun', col: '#fed7aa', sym: '🥛' },
          { label: 'Achocolatado', spoken: 'Leite com chocolate', cat: 'noun', col: '#fed7aa', sym: '🍫' },
          { label: 'Chá', spoken: 'Chá', cat: 'noun', col: '#fed7aa', sym: '🍵' },
          { label: 'Copo', spoken: 'Copo', cat: 'noun', col: '#fed7aa', sym: '🥛' },
          { label: 'Canudo', spoken: 'Canudo', cat: 'noun', col: '#fed7aa', sym: '🥤' },
          { label: 'Garrafinha', spoken: 'Minha garrafinha', cat: 'noun', col: '#fed7aa', sym: '🍶' },
          { label: 'Derramei', spoken: 'Derramei água', cat: 'feeling', col: '#fee2e2', sym: '💦' },
          { label: 'Quero beber mais', spoken: 'Quero beber mais', cat: 'action', col: '#bbf7d0', sym: '🤲' }
        ]
      },
      {
        name: 'Refeições & Lanches',
        icon: 'Coffee',
        cards: [
          { label: 'Arroz e Feijão', spoken: 'Arroz e feijão', cat: 'noun', col: '#fed7aa', sym: '🍲' },
          { label: 'Carne', spoken: 'Carne', cat: 'noun', col: '#fed7aa', sym: '🥩' },
          { label: 'Frango', spoken: 'Frango', cat: 'noun', col: '#fed7aa', sym: '🍗' },
          { label: 'Macarrão', spoken: 'Macarrão', cat: 'noun', col: '#fed7aa', sym: '🍝' },
          { label: 'Batata', spoken: 'Batata', cat: 'noun', col: '#fed7aa', sym: '🥔' },
          { label: 'Salada', spoken: 'Salada', cat: 'noun', col: '#fed7aa', sym: '🥗' },
          { label: 'Sopa', spoken: 'Sopa quentinha', cat: 'noun', col: '#fed7aa', sym: '🥣' },
          { label: 'Sanduíche', spoken: 'Sanduíche', cat: 'noun', col: '#fed7aa', sym: '🥪' },
          { label: 'Banana', spoken: 'Banana', cat: 'noun', col: '#fed7aa', sym: '🍌' },
          { label: 'Maçã', spoken: 'Maçã', cat: 'noun', col: '#fed7aa', sym: '🍎' },
          { label: 'Iogurte', spoken: 'Iogurte', cat: 'noun', col: '#fed7aa', sym: '🥣' },
          { label: 'Bolo', spoken: 'Pedaço de bolo', cat: 'noun', col: '#fed7aa', sym: '🍰' }
        ]
      },
      {
        name: 'Pessoas',
        icon: 'Users',
        cards: [
          { label: 'Família →', cat: 'navigation', target_page_name: 'Família', sym: '👨‍👩‍👧', col: '#e0e7ff' },
          { label: 'Profissionais & Terapia →', cat: 'navigation', target_page_name: 'Profissionais & Terapia', sym: '🧑‍⚕️', col: '#e0e7ff' },
          { label: 'Eu', spoken: 'Eu', cat: 'pronoun', col: '#fef08a', sym: '🙋' },
          { label: 'Você', spoken: 'Você', cat: 'pronoun', col: '#fef08a', sym: '👉' },
          { label: 'Mamãe', spoken: 'Mamãe', cat: 'pronoun', col: '#fef08a', sym: '👩' },
          { label: 'Papai', spoken: 'Papai', cat: 'pronoun', col: '#fef08a', sym: '👨' },
          { label: 'Irmão', spoken: 'Irmão', cat: 'pronoun', col: '#fef08a', sym: '👦' },
          { label: 'Irmã', spoken: 'Irmã', cat: 'pronoun', col: '#fef08a', sym: '👧' },
          { label: 'Vovó', spoken: 'Vovó', cat: 'pronoun', col: '#fef08a', sym: '👵' },
          { label: 'Vovô', spoken: 'Vovô', cat: 'pronoun', col: '#fef08a', sym: '👴' },
          { label: 'Amigo', spoken: 'Amigo', cat: 'pronoun', col: '#fef08a', sym: '🧑‍🤝‍🧑' },
          { label: 'Professora', spoken: 'Professora', cat: 'pronoun', col: '#fef08a', sym: '🧑‍🏫' },
          { label: 'Fonoaudióloga', spoken: 'Fonoaudióloga', cat: 'pronoun', col: '#fef08a', sym: '🗣️' },
          { label: 'Terapeuta', spoken: 'Terapeuta Ocupacional', cat: 'pronoun', col: '#fef08a', sym: '🤲' },
          { label: 'Médico', spoken: 'Médico', cat: 'pronoun', col: '#fef08a', sym: '🩺' },
          { label: 'Criança', spoken: 'Criança', cat: 'pronoun', col: '#fef08a', sym: '🧒' }
        ]
      },
      {
        name: 'Família',
        icon: 'Users',
        cards: [
          { label: 'Mamãe', spoken: 'Mamãe', cat: 'pronoun', col: '#fef08a', sym: '👩' },
          { label: 'Papai', spoken: 'Papai', cat: 'pronoun', col: '#fef08a', sym: '👨' },
          { label: 'Irmão', spoken: 'Irmão', cat: 'pronoun', col: '#fef08a', sym: '👦' },
          { label: 'Irmã', spoken: 'Irmã', cat: 'pronoun', col: '#fef08a', sym: '👧' },
          { label: 'Vovó', spoken: 'Vovó', cat: 'pronoun', col: '#fef08a', sym: '👵' },
          { label: 'Vovô', spoken: 'Vovô', cat: 'pronoun', col: '#fef08a', sym: '👴' },
          { label: 'Titio', spoken: 'Titio', cat: 'pronoun', col: '#fef08a', sym: '👨' },
          { label: 'Titia', spoken: 'Titia', cat: 'pronoun', col: '#fef08a', sym: '👩' },
          { label: 'Primo', spoken: 'Primo', cat: 'pronoun', col: '#fef08a', sym: '🧒' },
          { label: 'Bebê', spoken: 'Bebê', cat: 'pronoun', col: '#fef08a', sym: '👶' },
          { label: 'Cachorro', spoken: 'Cachorro da família', cat: 'noun', col: '#fed7aa', sym: '🐶' },
          { label: 'Gato', spoken: 'Gato da família', cat: 'noun', col: '#fed7aa', sym: '🐱' }
        ]
      },
      {
        name: 'Profissionais & Terapia',
        icon: 'Activity',
        cards: [
          { label: 'Fonoaudióloga', spoken: 'Fonoaudióloga', cat: 'pronoun', col: '#fef08a', sym: '🗣️' },
          { label: 'Terapeuta Ocupacional', spoken: 'Terapeuta Ocupacional', cat: 'pronoun', col: '#fef08a', sym: '🤲' },
          { label: 'Psicóloga', spoken: 'Psicóloga', cat: 'pronoun', col: '#fef08a', sym: '🧠' },
          { label: 'Fisioterapeuta', spoken: 'Fisioterapeuta', cat: 'pronoun', col: '#fef08a', sym: '🚶' },
          { label: 'Neurologista', spoken: 'Neurologista', cat: 'pronoun', col: '#fef08a', sym: '🩺' },
          { label: 'Pediatra', spoken: 'Pediatra', cat: 'pronoun', col: '#fef08a', sym: '👶' },
          { label: 'Dentista', spoken: 'Dentista', cat: 'pronoun', col: '#fef08a', sym: '🦷' },
          { label: 'Professora', spoken: 'Professora', cat: 'pronoun', col: '#fef08a', sym: '🧑‍🏫' },
          { label: 'Mediadora Escolar', spoken: 'Mediadora escolar', cat: 'pronoun', col: '#fef08a', sym: '🤝' },
          { label: 'Acolhedor', spoken: 'Acolhedor', cat: 'pronoun', col: '#fef08a', sym: '🫂' },
          { label: 'Muito Obrigado', spoken: 'Muito obrigado pela terapia', cat: 'social', col: '#fbcfe8', sym: '🙏' },
          { label: 'Tchau até a Próxima', spoken: 'Tchau, até a próxima sessão', cat: 'social', col: '#fbcfe8', sym: '👋' }
        ]
      },
      {
        name: 'Lugares',
        icon: 'MapPin',
        cards: [
          { label: 'Casa →', cat: 'navigation', target_page_name: 'Casa', sym: '🏠', col: '#e0e7ff' },
          { label: 'Comunidade & Clínica →', cat: 'navigation', target_page_name: 'Comunidade & Clínica', sym: '🏥', col: '#e0e7ff' },
          { label: 'Casa', spoken: 'Minha casa', cat: 'noun', col: '#fed7aa', sym: '🏠' },
          { label: 'Escola', spoken: 'Escola', cat: 'noun', col: '#fed7aa', sym: '🏫' },
          { label: 'Clínica', spoken: 'Clínica de terapia', cat: 'noun', col: '#fed7aa', sym: '🏥' },
          { label: 'Hospital', spoken: 'Hospital', cat: 'noun', col: '#fed7aa', sym: '🏨' },
          { label: 'Parque', spoken: 'Parque', cat: 'noun', col: '#fed7aa', sym: '🌳' },
          { label: 'Shopping', spoken: 'Shopping', cat: 'noun', col: '#fed7aa', sym: '🛍️' },
          { label: 'Supermercado', spoken: 'Supermercado', cat: 'noun', col: '#fed7aa', sym: '🛒' },
          { label: 'Carro', spoken: 'Carro', cat: 'noun', col: '#fed7aa', sym: '🚗' },
          { label: 'Passear', spoken: 'Quero passear', cat: 'action', col: '#bbf7d0', sym: '🚶' },
          { label: 'Ir Embora', spoken: 'Quero ir embora para casa', cat: 'action', col: '#fee2e2', sym: '🚪' }
        ]
      },
      {
        name: 'Casa',
        icon: 'Home',
        cards: [
          { label: 'Quarto', spoken: 'Meu quarto', cat: 'noun', col: '#fed7aa', sym: '🛏️' },
          { label: 'Cama', spoken: 'Cama', cat: 'noun', col: '#fed7aa', sym: '🛌' },
          { label: 'Sala', spoken: 'Sala', cat: 'noun', col: '#fed7aa', sym: '🛋️' },
          { label: 'Sofá', spoken: 'Sofá', cat: 'noun', col: '#fed7aa', sym: '🛋️' },
          { label: 'Cozinha', spoken: 'Cozinha', cat: 'noun', col: '#fed7aa', sym: '🍳' },
          { label: 'Geladeira', spoken: 'Geladeira', cat: 'noun', col: '#fed7aa', sym: '🧊' },
          { label: 'Banheiro', spoken: 'Banheiro de casa', cat: 'noun', col: '#fed7aa', sym: '🚽' },
          { label: 'Quintal', spoken: 'Quintal', cat: 'noun', col: '#fed7aa', sym: '🏡' },
          { label: 'Porta', spoken: 'Porta', cat: 'noun', col: '#fed7aa', sym: '🚪' },
          { label: 'Janela', spoken: 'Janela', cat: 'noun', col: '#fed7aa', sym: '🪟' },
          { label: 'Entrar', spoken: 'Entrar', cat: 'action', col: '#bbf7d0', sym: '➡️' },
          { label: 'Sair', spoken: 'Sair', cat: 'action', col: '#bbf7d0', sym: '⬅️' }
        ]
      },
      {
        name: 'Comunidade & Clínica',
        icon: 'MapPin',
        cards: [
          { label: 'Sala de Terapia', spoken: 'Sala de terapia', cat: 'noun', col: '#fed7aa', sym: '🛋️' },
          { label: 'Recepção', spoken: 'Recepção da clínica', cat: 'noun', col: '#fed7aa', sym: '🪑' },
          { label: 'Sala de Aula', spoken: 'Sala de aula', cat: 'noun', col: '#fed7aa', sym: '🏫' },
          { label: 'Pátio', spoken: 'Pátio da escola', cat: 'noun', col: '#fed7aa', sym: '🛝' },
          { label: 'Parquinho', spoken: 'Parquinho ao ar livre', cat: 'noun', col: '#fed7aa', sym: '🎡' },
          { label: 'Praça', spoken: 'Praça', cat: 'noun', col: '#fed7aa', sym: '🌳' },
          { label: 'Farmácia', spoken: 'Farmácia', cat: 'noun', col: '#fed7aa', sym: '💊' },
          { label: 'Padaria', spoken: 'Padaria', cat: 'noun', col: '#fed7aa', sym: '🥖' },
          { label: 'Praia', spoken: 'Praia', cat: 'noun', col: '#fed7aa', sym: '🏖️' },
          { label: 'Piscina', spoken: 'Piscina', cat: 'noun', col: '#fed7aa', sym: '🏊' },
          { label: 'Muito Barulho', spoken: 'Tem muito barulho aqui', cat: 'feeling', col: '#fee2e2', sym: '📢' },
          { label: 'Lugar Calmo', spoken: 'Quero um lugar mais calmo', cat: 'feeling', col: '#bfdbfe', sym: '🕊️' }
        ]
      },
      {
        name: 'Higiene',
        icon: 'Droplet',
        cards: [
          { label: 'Banheiro', spoken: 'Quero ir ao banheiro', cat: 'noun', col: '#fed7aa', sym: '🚽' },
          { label: 'Fazer Xixi', spoken: 'Preciso fazer xixi', cat: 'action', col: '#fed7aa', sym: '🟡' },
          { label: 'Fazer Cocô', spoken: 'Preciso fazer cocô', cat: 'action', col: '#fed7aa', sym: '💩' },
          { label: 'Lavar as Mãos', spoken: 'Lavar as mãos', cat: 'action', col: '#bbf7d0', sym: '🧼' },
          { label: 'Tomar Banho', spoken: 'Tomar banho', cat: 'action', col: '#bbf7d0', sym: '🚿' },
          { label: 'Escovar Dentes', spoken: 'Escovar os dentes', cat: 'action', col: '#bbf7d0', sym: '🪥' },
          { label: 'Trocar Fralda', spoken: 'Preciso trocar a fralda', cat: 'action', col: '#fed7aa', sym: '👶' },
          { label: 'Limpar', spoken: 'Limpar', cat: 'action', col: '#bbf7d0', sym: '🧻' },
          { label: 'Pente', spoken: 'Pentear o cabelo', cat: 'noun', col: '#fed7aa', sym: '🪮' },
          { label: 'Toalha', spoken: 'Toalha', cat: 'noun', col: '#fed7aa', sym: '🧖' },
          { label: 'Sabonete', spoken: 'Sabonete', cat: 'noun', col: '#fed7aa', sym: '🫧' },
          { label: 'Roupa Limpa', spoken: 'Colocar roupa limpa', cat: 'noun', col: '#fed7aa', sym: '👕' }
        ]
      },
      {
        name: 'Corpo',
        icon: 'Activity',
        cards: [
          { label: 'Cabeça', spoken: 'Cabeça', cat: 'noun', col: '#fed7aa', sym: '🗣️' },
          { label: 'Barriga', spoken: 'Barriga', cat: 'noun', col: '#fed7aa', sym: '🤰' },
          { label: 'Braço', spoken: 'Braço', cat: 'noun', col: '#fed7aa', sym: '💪' },
          { label: 'Perna', spoken: 'Perna', cat: 'noun', col: '#fed7aa', sym: '🦵' },
          { label: 'Mão', spoken: 'Mão', cat: 'noun', col: '#fed7aa', sym: '✋' },
          { label: 'Pé', spoken: 'Pé', cat: 'noun', col: '#fed7aa', sym: '🦶' },
          { label: 'Boca', spoken: 'Boca', cat: 'noun', col: '#fed7aa', sym: '👄' },
          { label: 'Olho', spoken: 'Olho', cat: 'noun', col: '#fed7aa', sym: '👁️' },
          { label: 'Ouvido', spoken: 'Ouvido', cat: 'noun', col: '#fed7aa', sym: '👂' },
          { label: 'Nariz', spoken: 'Nariz', cat: 'noun', col: '#fed7aa', sym: '👃' },
          { label: 'Costas', spoken: 'Costas', cat: 'noun', col: '#fed7aa', sym: '🔙' },
          { label: 'Dente', spoken: 'Dente', cat: 'noun', col: '#fed7aa', sym: '🦷' }
        ]
      },
      {
        name: 'Necessidades & Dor',
        icon: 'AlertCircle',
        cards: [
          { label: 'Dói Aqui', spoken: 'Está doendo aqui', cat: 'feeling', col: '#fee2e2', sym: '🩹' },
          { label: 'Dor de Cabeça', spoken: 'Estou com dor de cabeça', cat: 'feeling', col: '#fee2e2', sym: '🤕' },
          { label: 'Dor na Barriga', spoken: 'Estou com dor na barriga', cat: 'feeling', col: '#fee2e2', sym: '🤢' },
          { label: 'Machucou', spoken: 'Machucou', cat: 'feeling', col: '#fee2e2', sym: '💥' },
          { label: 'Doeu', spoken: 'Doeu bastante', cat: 'feeling', col: '#fee2e2', sym: '⚡' },
          { label: 'Remédio', spoken: 'Preciso de remédio', cat: 'noun', col: '#fed7aa', sym: '💊' },
          { label: 'Frio', spoken: 'Estou com frio', cat: 'feeling', col: '#bfdbfe', sym: '🥶' },
          { label: 'Calor', spoken: 'Estou com calor', cat: 'feeling', col: '#fed7aa', sym: '🥵' },
          { label: 'Cansado', spoken: 'Estou muito cansado', cat: 'feeling', col: '#bfdbfe', sym: '🥱' },
          { label: 'Descansar', spoken: 'Quero descansar', cat: 'feeling', col: '#bfdbfe', sym: '🧘' },
          { label: 'Pouco', spoken: 'Dói só um pouco', cat: 'descriptor', col: '#f1f5f9', sym: '🤏' },
          { label: 'Muito Forte', spoken: 'A dor está muito forte', cat: 'descriptor', col: '#fee2e2', sym: '🚨' }
        ]
      },
      {
        name: 'Saúde',
        icon: 'Heart',
        cards: [
          { label: 'Médico', spoken: 'Médico', cat: 'pronoun', col: '#fef08a', sym: '🩺' },
          { label: 'Hospital', spoken: 'Hospital', cat: 'noun', col: '#fed7aa', sym: '🏥' },
          { label: 'Termômetro', spoken: 'Medir a febre', cat: 'noun', col: '#fed7aa', sym: '🌡️' },
          { label: 'Febre', spoken: 'Acho que estou com febre', cat: 'feeling', col: '#fee2e2', sym: '🤒' },
          { label: 'Curativo', spoken: 'Colocar curativo', cat: 'noun', col: '#fed7aa', sym: '🩹' },
          { label: 'Injeção', spoken: 'Injeção', cat: 'noun', col: '#fed7aa', sym: '💉' },
          { label: 'Remédio', spoken: 'Tomar o remédio', cat: 'noun', col: '#fed7aa', sym: '💊' },
          { label: 'Consulta', spoken: 'Consulta médica', cat: 'noun', col: '#fed7aa', sym: '📋' },
          { label: 'Falta de Ar', spoken: 'Estou com falta de ar', cat: 'feeling', col: '#fee2e2', sym: '🫁' },
          { label: 'Tontura', spoken: 'Estou com tontura', cat: 'feeling', col: '#fee2e2', sym: '💫' },
          { label: 'Enjoo', spoken: 'Estou com enjoo', cat: 'feeling', col: '#fee2e2', sym: '🤢' },
          { label: 'Já Melhorei', spoken: 'Já estou me sentindo melhor', cat: 'descriptor', col: '#dcfce7', sym: '✨' }
        ]
      },
      {
        name: 'Escola / Terapia',
        icon: 'BookOpen',
        cards: [
          { label: 'Mochila', spoken: 'Mochila', cat: 'noun', col: '#fed7aa', sym: '🎒' },
          { label: 'Caderno', spoken: 'Caderno', cat: 'noun', col: '#fed7aa', sym: '📓' },
          { label: 'Lápis', spoken: 'Lápis', cat: 'noun', col: '#fed7aa', sym: '✏️' },
          { label: 'Borracha', spoken: 'Borracha', cat: 'noun', col: '#fed7aa', sym: '🧼' },
          { label: 'Tesoura', spoken: 'Tesoura', cat: 'noun', col: '#fed7aa', sym: '✂️' },
          { label: 'Cola', spoken: 'Cola', cat: 'noun', col: '#fed7aa', sym: '🧴' },
          { label: 'Livro', spoken: 'Livro de histórias', cat: 'noun', col: '#fed7aa', sym: '📖' },
          { label: 'Sentar na Mesa', spoken: 'Sentar na mesa', cat: 'action', col: '#bbf7d0', sym: '🪑' },
          { label: 'Prestar Atenção', spoken: 'Prestar atenção', cat: 'action', col: '#fef3c7', sym: '👀' },
          { label: 'Guardar Material', spoken: 'Guardar o material', cat: 'action', col: '#bbf7d0', sym: '📦' },
          { label: 'Hora do Recreio', spoken: 'Hora do recreio e lanche', cat: 'social', col: '#fbcfe8', sym: '🔔' },
          { label: 'Fazer Tarefa', spoken: 'Fazer a tarefa', cat: 'action', col: '#bbf7d0', sym: '📝' }
        ]
      },
      {
        name: 'Comunicação',
        icon: 'MessageCircle',
        cards: [
          { label: 'Não Sei', spoken: 'Não sei', cat: 'descriptor', col: '#f1f5f9', sym: '🤷' },
          { label: 'Não Entendi', spoken: 'Não entendi', cat: 'descriptor', col: '#f1f5f9', sym: '❓' },
          { label: 'Repete por Favor', spoken: 'Repete por favor', cat: 'social', col: '#fbcfe8', sym: '🔁' },
          { label: 'Espera um Pouco', spoken: 'Espera um pouco', cat: 'action', col: '#fef3c7', sym: '✋' },
          { label: 'Mais Devagar', spoken: 'Fale mais devagar', cat: 'descriptor', col: '#f1f5f9', sym: '🐢' },
          { label: 'Me Mostra', spoken: 'Mostra para mim', cat: 'action', col: '#bbf7d0', sym: '👈' },
          { label: 'Quero Falar', spoken: 'Eu quero falar', cat: 'action', col: '#bbf7d0', sym: '💬' },
          { label: 'Não Foi Isso', spoken: 'Não foi isso que eu quis dizer', cat: 'descriptor', col: '#fee2e2', sym: '❌' },
          { label: 'Deixa Eu Escolher', spoken: 'Deixa eu escolher', cat: 'action', col: '#bbf7d0', sym: '👉' },
          { label: 'Sim', spoken: 'Sim', cat: 'descriptor', col: '#dcfce7', sym: '👍' },
          { label: 'Não', spoken: 'Não', cat: 'descriptor', col: '#fee2e2', sym: '👎' },
          { label: 'Talvez', spoken: 'Talvez', cat: 'descriptor', col: '#f1f5f9', sym: '🤔' },
          { label: 'Me Ajuda', spoken: 'Me ajuda aqui', cat: 'action', col: '#fef3c7', sym: '🆘' },
          { label: 'Olha', spoken: 'Olha para cá', cat: 'action', col: '#bbf7d0', sym: '👀' },
          { label: 'Escuta', spoken: 'Escuta isso', cat: 'action', col: '#bbf7d0', sym: '👂' },
          { label: 'Terminei', spoken: 'Eu terminei de falar', cat: 'social', col: '#fbcfe8', sym: '🏁' }
        ]
      },
      {
        name: 'Sentimentos',
        icon: 'Smile',
        cards: [
          { label: 'Feliz', spoken: 'Estou feliz', cat: 'feeling', col: '#bfdbfe', sym: '😃' },
          { label: 'Triste', spoken: 'Estou triste', cat: 'feeling', col: '#bfdbfe', sym: '😢' },
          { label: 'Bravo', spoken: 'Estou bravo', cat: 'feeling', col: '#fee2e2', sym: '😡' },
          { label: 'Calmo', spoken: 'Estou calmo e tranquilo', cat: 'feeling', col: '#bfdbfe', sym: '😌' },
          { label: 'Assustado', spoken: 'Estou com medo', cat: 'feeling', col: '#fee2e2', sym: '😨' },
          { label: 'Cansado', spoken: 'Estou cansado', cat: 'feeling', col: '#bfdbfe', sym: '🥱' },
          { label: 'Ansioso', spoken: 'Estou ansioso', cat: 'feeling', col: '#fee2e2', sym: '😰' },
          { label: 'Animado', spoken: 'Estou muito animado', cat: 'feeling', col: '#bfdbfe', sym: '🤩' },
          { label: 'Com Vergonha', spoken: 'Estou com vergonha', cat: 'feeling', col: '#fbcfe8', sym: '🙈' },
          { label: 'Amado', spoken: 'Me sinto amado', cat: 'feeling', col: '#fbcfe8', sym: '❤️' },
          { label: 'Chorar', spoken: 'Quero chorar', cat: 'action', col: '#fee2e2', sym: '😭' },
          { label: 'Rir', spoken: 'Quero dar risada', cat: 'action', col: '#dcfce7', sym: '😄' }
        ]
      },
      {
        name: 'Social',
        icon: 'MessageSquare',
        cards: [
          { label: 'Oi!', spoken: 'Oi, tudo bem?', cat: 'social', col: '#fbcfe8', sym: '👋' },
          { label: 'Tchau!', spoken: 'Tchau, até logo!', cat: 'social', col: '#fbcfe8', sym: '🙋' },
          { label: 'Bom Dia', spoken: 'Bom dia', cat: 'social', col: '#fbcfe8', sym: '☀️' },
          { label: 'Boa Tarde', spoken: 'Boa tarde', cat: 'social', col: '#fbcfe8', sym: '🌤️' },
          { label: 'Boa Noite', spoken: 'Boa noite', cat: 'social', col: '#fbcfe8', sym: '🌙' },
          { label: 'Por Favor', spoken: 'Por favor', cat: 'social', col: '#fbcfe8', sym: '🤝' },
          { label: 'Obrigado', spoken: 'Muito obrigado', cat: 'social', col: '#fbcfe8', sym: '🙏' },
          { label: 'De Nada', spoken: 'De nada', cat: 'social', col: '#fbcfe8', sym: '😊' },
          { label: 'Desculpa', spoken: 'Me desculpe', cat: 'social', col: '#fbcfe8', sym: '🥺' },
          { label: 'Com Licença', spoken: 'Com licença por favor', cat: 'social', col: '#fbcfe8', sym: '🚪' },
          { label: 'Parabéns!', spoken: 'Parabéns!', cat: 'social', col: '#fbcfe8', sym: '🎉' },
          { label: 'Quero Conversar', spoken: 'Eu quero conversar com você', cat: 'action', col: '#bbf7d0', sym: '💬' }
        ]
      },
      {
        name: 'Ações',
        icon: 'Play',
        cards: [
          { label: 'Quero', spoken: 'Quero', cat: 'action', col: '#bbf7d0', sym: '🤲' },
          { label: 'Posso?', spoken: 'Eu posso?', cat: 'action', col: '#bbf7d0', sym: '🙋' },
          { label: 'Ir', spoken: 'Ir', cat: 'action', col: '#bbf7d0', sym: '🚶' },
          { label: 'Vir', spoken: 'Vir aqui', cat: 'action', col: '#bbf7d0', sym: '🏃' },
          { label: 'Fazer', spoken: 'Fazer', cat: 'action', col: '#bbf7d0', sym: '🛠️' },
          { label: 'Dar', spoken: 'Me dá por favor', cat: 'action', col: '#bbf7d0', sym: '🎁' },
          { label: 'Pegar', spoken: 'Pegar', cat: 'action', col: '#bbf7d0', sym: '🤏' },
          { label: 'Abrir', spoken: 'Abrir', cat: 'action', col: '#bbf7d0', sym: '🔓' },
          { label: 'Fechar', spoken: 'Fechar', cat: 'action', col: '#bbf7d0', sym: '🔒' },
          { label: 'Colocar', spoken: 'Colocar', cat: 'action', col: '#bbf7d0', sym: '📥' },
          { label: 'Tirar', spoken: 'Tirar', cat: 'action', col: '#bbf7d0', sym: '📤' },
          { label: 'Ver', spoken: 'Ver', cat: 'action', col: '#bbf7d0', sym: '👀' },
          { label: 'Ouvir', spoken: 'Ouvir', cat: 'action', col: '#bbf7d0', sym: '👂' },
          { label: 'Parar', spoken: 'Parar agora', cat: 'action', col: '#fee2e2', sym: '🛑' },
          { label: 'Continuar', spoken: 'Continuar fazendo', cat: 'action', col: '#bbf7d0', sym: '▶️' },
          { label: 'Esperar', spoken: 'Esperar', cat: 'action', col: '#fef3c7', sym: '✋' }
        ]
      },
      {
        name: 'Descritores',
        icon: 'Sliders',
        cards: [
          { label: 'Bom', spoken: 'Bom', cat: 'descriptor', col: '#dcfce7', sym: '👍' },
          { label: 'Ruim', spoken: 'Ruim', cat: 'descriptor', col: '#fee2e2', sym: '👎' },
          { label: 'Grande', spoken: 'Grande', cat: 'descriptor', col: '#f1f5f9', sym: '🐘' },
          { label: 'Pequeno', spoken: 'Pequeno', cat: 'descriptor', col: '#f1f5f9', sym: '🐜' },
          { label: 'Quente', spoken: 'Quente', cat: 'descriptor', col: '#fed7aa', sym: '🔥' },
          { label: 'Frio', spoken: 'Frio', cat: 'descriptor', col: '#bfdbfe', sym: '❄️' },
          { label: 'Rápido', spoken: 'Rápido', cat: 'descriptor', col: '#f1f5f9', sym: '⚡' },
          { label: 'Devagar', spoken: 'Devagar', cat: 'descriptor', col: '#f1f5f9', sym: '🐢' },
          { label: 'Igual', spoken: 'Igual', cat: 'descriptor', col: '#f1f5f9', sym: '🟰' },
          { label: 'Diferente', spoken: 'Diferente', cat: 'descriptor', col: '#f1f5f9', sym: '≠' },
          { label: 'Bonito', spoken: 'Bonito', cat: 'descriptor', col: '#dcfce7', sym: '✨' },
          { label: 'Feio', spoken: 'Feio', cat: 'descriptor', col: '#fee2e2', sym: '👾' },
          { label: 'Muito', spoken: 'Muito', cat: 'descriptor', col: '#f1f5f9', sym: '📈' },
          { label: 'Pouco', spoken: 'Pouco', cat: 'descriptor', col: '#f1f5f9', sym: '📉' },
          { label: 'Outro', spoken: 'Outro', cat: 'descriptor', col: '#f1f5f9', sym: '🔄' },
          { label: 'Certo', spoken: 'Está certo', cat: 'descriptor', col: '#dcfce7', sym: '✅' }
        ]
      },
      {
        name: 'Tempo / Clima',
        icon: 'Sun',
        cards: [
          { label: 'Agora', spoken: 'Agora', cat: 'descriptor', col: '#f1f5f9', sym: '⏱️' },
          { label: 'Depois', spoken: 'Depois', cat: 'descriptor', col: '#f1f5f9', sym: '⌛' },
          { label: 'Antes', spoken: 'Antes', cat: 'descriptor', col: '#f1f5f9', sym: '⏮️' },
          { label: 'Hoje', spoken: 'Hoje', cat: 'descriptor', col: '#f1f5f9', sym: '📅' },
          { label: 'Amanhã', spoken: 'Amanhã', cat: 'descriptor', col: '#f1f5f9', sym: '🌅' },
          { label: 'Ontem', spoken: 'Ontem', cat: 'descriptor', col: '#f1f5f9', sym: '🌇' },
          { label: 'Manhã', spoken: 'De manhã', cat: 'descriptor', col: '#f1f5f9', sym: '☕' },
          { label: 'Tarde', spoken: 'À tarde', cat: 'descriptor', col: '#f1f5f9', sym: '⛅' },
          { label: 'Noite', spoken: 'À noite', cat: 'descriptor', col: '#f1f5f9', sym: '🌙' },
          { label: 'Sol', spoken: 'Está ensolarado', cat: 'descriptor', col: '#fef08a', sym: '☀️' },
          { label: 'Chuva', spoken: 'Está chovendo', cat: 'descriptor', col: '#bfdbfe', sym: '🌧️' },
          { label: 'Vento', spoken: 'Está com muito vento', cat: 'descriptor', col: '#f1f5f9', sym: '💨' }
        ]
      },
      {
        name: 'Rotina',
        icon: 'Clock',
        cards: [
          { label: 'Acordar', spoken: 'Hora de acordar', cat: 'action', col: '#bbf7d0', sym: '⏰' },
          { label: 'Café da Manhã', spoken: 'Café da manhã', cat: 'action', col: '#fed7aa', sym: '🥣' },
          { label: 'Escovar Dentes', spoken: 'Escovar os dentes', cat: 'action', col: '#bbf7d0', sym: '🪥' },
          { label: 'Ir para Escola', spoken: 'Hora de ir para escola', cat: 'action', col: '#bbf7d0', sym: '🎒' },
          { label: 'Ir para Terapia', spoken: 'Hora de ir para terapia', cat: 'action', col: '#bbf7d0', sym: '🏥' },
          { label: 'Almoçar', spoken: 'Hora do almoço', cat: 'action', col: '#fed7aa', sym: '🍽️' },
          { label: 'Tomar Banho', spoken: 'Tomar banho', cat: 'action', col: '#bbf7d0', sym: '🚿' },
          { label: 'Jantar', spoken: 'Hora do jantar', cat: 'action', col: '#fed7aa', sym: '🍲' },
          { label: 'Hora do Remédio', spoken: 'Hora do remédio', cat: 'action', col: '#fed7aa', sym: '💊' },
          { label: 'Dormir', spoken: 'Hora de dormir', cat: 'action', col: '#bfdbfe', sym: '🛌' },
          { label: 'Chegou a Hora', spoken: 'Chegou a hora', cat: 'descriptor', col: '#dcfce7', sym: '🔔' },
          { label: 'O que vamos fazer?', spoken: 'O que nós vamos fazer agora?', cat: 'action', col: '#fef3c7', sym: '❓' }
        ]
      },
      {
        name: 'Perguntas',
        icon: 'HelpCircle',
        cards: [
          { label: 'O que é?', spoken: 'O que é isso?', cat: 'descriptor', col: '#f1f5f9', sym: '❓' },
          { label: 'Onde está?', spoken: 'Onde está?', cat: 'descriptor', col: '#f1f5f9', sym: '🔍' },
          { label: 'Quem é?', spoken: 'Quem é essa pessoa?', cat: 'descriptor', col: '#f1f5f9', sym: '👤' },
          { label: 'Quando?', spoken: 'Quando vai ser?', cat: 'descriptor', col: '#f1f5f9', sym: '⏰' },
          { label: 'Por quê?', spoken: 'Por quê?', cat: 'descriptor', col: '#f1f5f9', sym: '🤔' },
          { label: 'Como?', spoken: 'Como faz isso?', cat: 'descriptor', col: '#f1f5f9', sym: '⚙️' },
          { label: 'Qual?', spoken: 'Qual deles?', cat: 'descriptor', col: '#f1f5f9', sym: '👉' },
          { label: 'Posso?', spoken: 'Eu posso fazer isso?', cat: 'action', col: '#bbf7d0', sym: '🙋' },
          { label: 'Para onde vamos?', spoken: 'Para onde nós vamos?', cat: 'action', col: '#bbf7d0', sym: '🗺️' },
          { label: 'O que aconteceu?', spoken: 'O que aconteceu?', cat: 'feeling', col: '#fee2e2', sym: '❗' },
          { label: 'Você me ajuda?', spoken: 'Você pode me ajudar?', cat: 'action', col: '#fef3c7', sym: '🤝' },
          { label: 'Posso escolher?', spoken: 'Posso escolher outro?', cat: 'action', col: '#bbf7d0', sym: '🎲' }
        ]
      },
      {
        name: 'Emergência',
        icon: 'AlertCircle',
        cards: [
          { label: 'Ajuda Urgente!', spoken: 'Preciso de ajuda urgente agora', cat: 'action', col: '#fee2e2', sym: '🆘' },
          { label: 'Socorro!', spoken: 'Socorro por favor', cat: 'action', col: '#fee2e2', sym: '🚨' },
          { label: 'Dor Muito Forte!', spoken: 'Estou com muita dor', cat: 'feeling', col: '#fee2e2', sym: '💥' },
          { label: 'Machucou Grave', spoken: 'Machucou de verdade', cat: 'feeling', col: '#fee2e2', sym: '🩹' },
          { label: 'Falta de Ar', spoken: 'Estou com falta de ar', cat: 'feeling', col: '#fee2e2', sym: '🫁' },
          { label: 'Não Consigo Respirar', spoken: 'Não consigo respirar direito', cat: 'feeling', col: '#fee2e2', sym: '😮‍💨' },
          { label: 'Chamar Mamãe', spoken: 'Chamar a mamãe agora', cat: 'pronoun', col: '#fef08a', sym: '👩' },
          { label: 'Chamar Papai', spoken: 'Chamar o papai agora', cat: 'pronoun', col: '#fef08a', sym: '👨' },
          { label: 'Hospital', spoken: 'Preciso ir ao hospital', cat: 'noun', col: '#fed7aa', sym: '🏥' },
          { label: 'Ambulância', spoken: 'Ligue para emergência', cat: 'noun', col: '#fee2e2', sym: '🚑' },
          { label: 'Preciso de Calma', spoken: 'Preciso de calma e silêncio', cat: 'feeling', col: '#bfdbfe', sym: '🕊️' },
          { label: 'Perigo!', spoken: 'Isso é perigoso!', cat: 'feeling', col: '#fee2e2', sym: '⚠️' }
        ]
      },
      {
        name: 'Preferências',
        icon: 'Heart',
        cards: [
          { label: 'Eu Amo', spoken: 'Eu amo isso', cat: 'feeling', col: '#fbcfe8', sym: '❤️' },
          { label: 'Eu Gosto', spoken: 'Eu gosto muito', cat: 'descriptor', col: '#dcfce7', sym: '😊' },
          { label: 'Não Gosto', spoken: 'Não gosto disso', cat: 'descriptor', col: '#fee2e2', sym: '😖' },
          { label: 'Meu Favorito', spoken: 'Esse é o meu favorito', cat: 'descriptor', col: '#dcfce7', sym: '⭐' },
          { label: 'Não Quero Esse', spoken: 'Não quero esse aqui', cat: 'descriptor', col: '#fee2e2', sym: '🚫' },
          { label: 'Escolher Outro', spoken: 'Quero escolher outro', cat: 'action', col: '#bbf7d0', sym: '🔄' },
          { label: 'É Divertido', spoken: 'É muito divertido', cat: 'descriptor', col: '#dcfce7', sym: '🎉' },
          { label: 'É Chato', spoken: 'Isso é muito chato', cat: 'descriptor', col: '#fee2e2', sym: '🥱' },
          { label: 'Está Legal', spoken: 'Está bem legal', cat: 'descriptor', col: '#dcfce7', sym: '👌' },
          { label: 'Não Sei Escolher', spoken: 'Não sei qual escolher', cat: 'feeling', col: '#bfdbfe', sym: '🤷' },
          { label: 'Esse Mesmo', spoken: 'Eu quero esse mesmo', cat: 'descriptor', col: '#dcfce7', sym: '🎯' },
          { label: 'Pode Ser', spoken: 'Pode ser esse', cat: 'descriptor', col: '#f1f5f9', sym: '👍' }
        ]
      },
      {
        name: 'Objetos',
        icon: 'Sliders',
        cards: [
          { label: 'Copo', spoken: 'Copo', cat: 'noun', col: '#fed7aa', sym: '🥛' },
          { label: 'Prato', spoken: 'Prato', cat: 'noun', col: '#fed7aa', sym: '🍽️' },
          { label: 'Colher', spoken: 'Colher', cat: 'noun', col: '#fed7aa', sym: '🥄' },
          { label: 'Garfo', spoken: 'Garfo', cat: 'noun', col: '#fed7aa', sym: '🍴' },
          { label: 'Cadeira', spoken: 'Cadeira', cat: 'noun', col: '#fed7aa', sym: '🪑' },
          { label: 'Mesa', spoken: 'Mesa', cat: 'noun', col: '#fed7aa', sym: '🪵' },
          { label: 'Cama', spoken: 'Cama', cat: 'noun', col: '#fed7aa', sym: '🛏️' },
          { label: 'Celular', spoken: 'Celular', cat: 'noun', col: '#fed7aa', sym: '📱' },
          { label: 'Tablet', spoken: 'Tablet', cat: 'noun', col: '#fed7aa', sym: '📱' },
          { label: 'Brinquedo', spoken: 'Brinquedo', cat: 'noun', col: '#fed7aa', sym: '🧸' },
          { label: 'Mochila', spoken: 'Mochila', cat: 'noun', col: '#fed7aa', sym: '🎒' },
          { label: 'Óculos', spoken: 'Meus óculos', cat: 'noun', col: '#fed7aa', sym: '👓' }
        ]
      },
      {
        name: 'Transporte',
        icon: 'Compass',
        cards: [
          { label: 'Carro', spoken: 'Carro', cat: 'noun', col: '#fed7aa', sym: '🚗' },
          { label: 'Ônibus', spoken: 'Ônibus', cat: 'noun', col: '#fed7aa', sym: '🚌' },
          { label: 'Bicicleta', spoken: 'Bicicleta', cat: 'noun', col: '#fed7aa', sym: '🚲' },
          { label: 'Metrô', spoken: 'Metrô', cat: 'noun', col: '#fed7aa', sym: '🚇' },
          { label: 'Andar a Pé', spoken: 'Andar a pé', cat: 'action', col: '#bbf7d0', sym: '🚶' },
          { label: 'Van Escolar', spoken: 'Van escolar', cat: 'noun', col: '#fed7aa', sym: '🚐' },
          { label: 'Caminhão', spoken: 'Caminhão', cat: 'noun', col: '#fed7aa', sym: '🚛' },
          { label: 'Avião', spoken: 'Avião', cat: 'noun', col: '#fed7aa', sym: '✈️' },
          { label: 'Parada', spoken: 'Ponto de ônibus', cat: 'noun', col: '#fed7aa', sym: '🚏' },
          { label: 'Chegar', spoken: 'Hora de chegar', cat: 'action', col: '#bbf7d0', sym: '🏁' },
          { label: 'Entrar no Carro', spoken: 'Entrar no carro', cat: 'action', col: '#bbf7d0', sym: '🚪' },
          { label: 'Colocar o Cinto', spoken: 'Colocar o cinto de segurança', cat: 'action', col: '#fef3c7', sym: '💺' }
        ]
      },
      {
        name: 'Cores',
        icon: 'Palette',
        cards: [
          { label: 'Vermelho', spoken: 'Vermelho', cat: 'descriptor', col: '#fee2e2', sym: '🔴' },
          { label: 'Azul', spoken: 'Azul', cat: 'descriptor', col: '#bfdbfe', sym: '🔵' },
          { label: 'Amarelo', spoken: 'Amarelo', cat: 'descriptor', col: '#fef08a', sym: '🟡' },
          { label: 'Verde', spoken: 'Verde', cat: 'descriptor', col: '#bbf7d0', sym: '🟢' },
          { label: 'Roxo', spoken: 'Roxo', cat: 'descriptor', col: '#e9d5ff', sym: '🟣' },
          { label: 'Laranja', spoken: 'Laranja', cat: 'descriptor', col: '#fed7aa', sym: '🟠' },
          { label: 'Rosa', spoken: 'Rosa', cat: 'descriptor', col: '#fbcfe8', sym: '🌸' },
          { label: 'Preto', spoken: 'Preto', cat: 'descriptor', col: '#cbd5e1', sym: '⚫' },
          { label: 'Branco', spoken: 'Branco', cat: 'descriptor', col: '#f1f5f9', sym: '⚪' },
          { label: 'Marrom', spoken: 'Marrom', cat: 'descriptor', col: '#fed7aa', sym: '🟤' },
          { label: 'Colorido', spoken: 'Tudo colorido', cat: 'descriptor', col: '#f1f5f9', sym: '🌈' },
          { label: 'Minha Cor Favorita', spoken: 'Essa é a minha cor favorita', cat: 'descriptor', col: '#dcfce7', sym: '🎨' }
        ]
      },
      {
        name: 'Números',
        icon: 'Hash',
        cards: [
          { label: '1 (Um)', spoken: 'Um', cat: 'descriptor', col: '#f1f5f9', sym: '1️⃣' },
          { label: '2 (Dois)', spoken: 'Dois', cat: 'descriptor', col: '#f1f5f9', sym: '2️⃣' },
          { label: '3 (Três)', spoken: 'Três', cat: 'descriptor', col: '#f1f5f9', sym: '3️⃣' },
          { label: '4 (Quatro)', spoken: 'Quatro', cat: 'descriptor', col: '#f1f5f9', sym: '4️⃣' },
          { label: '5 (Cinco)', spoken: 'Cinco', cat: 'descriptor', col: '#f1f5f9', sym: '5️⃣' },
          { label: '6 (Seis)', spoken: 'Seis', cat: 'descriptor', col: '#f1f5f9', sym: '6️⃣' },
          { label: '7 (Sete)', spoken: 'Sete', cat: 'descriptor', col: '#f1f5f9', sym: '7️⃣' },
          { label: '8 (Oito)', spoken: 'Oito', cat: 'descriptor', col: '#f1f5f9', sym: '8️⃣' },
          { label: '9 (Nove)', spoken: 'Nove', cat: 'descriptor', col: '#f1f5f9', sym: '9️⃣' },
          { label: '10 (Dez)', spoken: 'Dez', cat: 'descriptor', col: '#f1f5f9', sym: '🔟' },
          { label: 'Muito', spoken: 'Tem muito', cat: 'descriptor', col: '#f1f5f9', sym: '➕' },
          { label: 'Nenhum', spoken: 'Não tem nenhum', cat: 'descriptor', col: '#fee2e2', sym: '0️⃣' }
        ]
      },
      {
        name: 'Tecnologia',
        icon: 'Tv',
        cards: [
          { label: 'Tablet', spoken: 'Tablet', cat: 'noun', col: '#fed7aa', sym: '📱' },
          { label: 'Celular', spoken: 'Celular', cat: 'noun', col: '#fed7aa', sym: '📲' },
          { label: 'Televisão', spoken: 'Televisão', cat: 'noun', col: '#fed7aa', sym: '📺' },
          { label: 'Computador', spoken: 'Computador', cat: 'noun', col: '#fed7aa', sym: '💻' },
          { label: 'Fone de Ouvido', spoken: 'Fone de ouvido', cat: 'noun', col: '#fed7aa', sym: '🎧' },
          { label: 'Carregador', spoken: 'Carregador', cat: 'noun', col: '#fed7aa', sym: '🔌' },
          { label: 'Vídeo', spoken: 'Quero ver vídeo', cat: 'action', col: '#bbf7d0', sym: '▶️' },
          { label: 'Música', spoken: 'Quero ouvir música', cat: 'action', col: '#bbf7d0', sym: '🎵' },
          { label: 'Ligar', spoken: 'Ligar', cat: 'action', col: '#bbf7d0', sym: '🟢' },
          { label: 'Desligar', spoken: 'Desligar', cat: 'action', col: '#fee2e2', sym: '🔴' },
          { label: 'Aumentar Volume', spoken: 'Aumentar o volume', cat: 'descriptor', col: '#f1f5f9', sym: '🔊' },
          { label: 'Abaixar Volume', spoken: 'Abaixar o volume', cat: 'descriptor', col: '#f1f5f9', sym: '🔉' }
        ]
      },
      {
        name: 'Sono / Descanso',
        icon: 'Moon',
        cards: [
          { label: 'Quero Dormir', spoken: 'Quero dormir', cat: 'feeling', col: '#bfdbfe', sym: '😴' },
          { label: 'Cansado', spoken: 'Estou cansado', cat: 'feeling', col: '#bfdbfe', sym: '😫' },
          { label: 'Deitar', spoken: 'Quero deitar', cat: 'action', col: '#bbf7d0', sym: '🛌' },
          { label: 'Descansar', spoken: 'Preciso descansar', cat: 'feeling', col: '#bfdbfe', sym: '🧘' },
          { label: 'Travesseiro', spoken: 'Travesseiro', cat: 'noun', col: '#fed7aa', sym: '🛏️' },
          { label: 'Cobertor', spoken: 'Cobertor', cat: 'noun', col: '#fed7aa', sym: '🧶' },
          { label: 'Luz Apagada', spoken: 'Apagar a luz por favor', cat: 'descriptor', col: '#f1f5f9', sym: '🌑' },
          { label: 'Luz Acesa', spoken: 'Deixar luz acesa', cat: 'pronoun', col: '#fef08a', sym: '💡' },
          { label: 'Silêncio', spoken: 'Silêncio por favor', cat: 'feeling', col: '#bfdbfe', sym: '🤫' },
          { label: 'Dormir na Cama', spoken: 'Dormir na minha cama', cat: 'noun', col: '#fed7aa', sym: '🛏️' },
          { label: 'Acordar', spoken: 'Acordar', cat: 'action', col: '#bbf7d0', sym: '🌅' },
          { label: 'História para Dormir', spoken: 'Conta uma história para dormir', cat: 'action', col: '#bbf7d0', sym: '📖' }
        ]
      },
      {
        name: 'Respostas Rápidas',
        icon: 'Sparkles',
        cards: [
          { label: 'Sim', spoken: 'Sim', cat: 'descriptor', col: '#dcfce7', sym: '👍' },
          { label: 'Não', spoken: 'Não', cat: 'descriptor', col: '#fee2e2', sym: '👎' },
          { label: 'Quero', spoken: 'Quero', cat: 'action', col: '#bbf7d0', sym: '🤲' },
          { label: 'Não quero', spoken: 'Não quero', cat: 'action', col: '#fee2e2', sym: '🚫' },
          { label: 'Gostei', spoken: 'Gostei', cat: 'descriptor', col: '#dcfce7', sym: '😊' },
          { label: 'Não gostei', spoken: 'Não gostei', cat: 'descriptor', col: '#fee2e2', sym: '😖' },
          { label: 'Está bom', spoken: 'Está bom', cat: 'descriptor', col: '#dcfce7', sym: '✨' },
          { label: 'Não está bom', spoken: 'Não está bom', cat: 'descriptor', col: '#fee2e2', sym: '❌' },
          { label: 'Esse', spoken: 'Esse', cat: 'descriptor', col: '#f1f5f9', sym: '👉' },
          { label: 'Aquele', spoken: 'Aquele', cat: 'descriptor', col: '#f1f5f9', sym: '👈' },
          { label: 'De novo', spoken: 'De novo', cat: 'descriptor', col: '#dcfce7', sym: '🔁' },
          { label: 'Agora', spoken: 'Agora', cat: 'descriptor', col: '#f1f5f9', sym: '⏱️' },
          { label: 'Depois', spoken: 'Depois', cat: 'descriptor', col: '#f1f5f9', sym: '⌛' },
          { label: 'Aqui', spoken: 'Aqui', cat: 'descriptor', col: '#f1f5f9', sym: '📍' },
          { label: 'Ali', spoken: 'Ali', cat: 'descriptor', col: '#f1f5f9', sym: '🔭' },
          { label: 'Acabou', spoken: 'Acabou', cat: 'descriptor', col: '#f1f5f9', sym: '🛑' }
        ]
      },
      {
        name: 'Atividades',
        icon: 'Sparkles',
        cards: [
          { label: 'Desenhar', spoken: 'Desenhar', cat: 'action', col: '#bbf7d0', sym: '🖍️' },
          { label: 'Pintar', spoken: 'Pintar', cat: 'action', col: '#bbf7d0', sym: '🎨' },
          { label: 'Ler Livro', spoken: 'Ler livro', cat: 'action', col: '#bbf7d0', sym: '📖' },
          { label: 'Escrever', spoken: 'Escrever', cat: 'action', col: '#bbf7d0', sym: '✏️' },
          { label: 'Dançar', spoken: 'Dançar', cat: 'action', col: '#bbf7d0', sym: '💃' },
          { label: 'Ouvir Música', spoken: 'Ouvir música', cat: 'action', col: '#bbf7d0', sym: '🎵' },
          { label: 'Correr', spoken: 'Correr', cat: 'action', col: '#bbf7d0', sym: '🏃' },
          { label: 'Pular', spoken: 'Pular', cat: 'action', col: '#bbf7d0', sym: '🦘' },
          { label: 'Descansar', spoken: 'Descansar', cat: 'action', col: '#bfdbfe', sym: '🧘' },
          { label: 'Fazer Yoga', spoken: 'Fazer yoga', cat: 'action', col: '#bfdbfe', sym: '🧘' },
          { label: 'Jogar Bola', spoken: 'Jogar bola', cat: 'action', col: '#bbf7d0', sym: '⚽' },
          { label: 'Hora de Parar', spoken: 'Hora de parar a atividade', cat: 'action', col: '#fee2e2', sym: '🛑' }
        ]
      }
    ];

    // PASSO 1: Inserir todas as páginas e mapear nome normalizado -> ID da página
    const pageMap = new Map<string, string>();
    categoriesData.forEach((catData, catIdx) => {
      const pageId = `aac-page-${uuidv4()}`;
      pageMap.set(catData.name.trim().toLowerCase(), pageId);
      insertPage.run(pageId, boardId, catData.name, catIdx, catData.icon, now);
    });

    // PASSO 2: Inserir cartões, resolvendo target_page_id para links de navegação
    categoriesData.forEach((catData) => {
      const pageId = pageMap.get(catData.name.trim().toLowerCase())!;

      catData.cards.forEach((c: any, cardIdx) => {
        let targetPageId: string | null = null;
        let isNav = c.cat === 'navigation';

        if (c.target_page_name) {
          const targetKey = c.target_page_name.trim().toLowerCase();
          targetPageId = pageMap.get(targetKey) || null;
          if (targetPageId) {
            isNav = true;
          }
        }

        const category = isNav ? 'navigation' : (c.cat || 'descriptor');
        const color = isNav ? (c.col || '#e0e7ff') : (c.col || '#f1f5f9');
        const spoken = isNav ? (c.spoken || '') : (c.spoken || c.label);

        insertCard.run(
          `aac-card-${uuidv4()}`,
          boardId,
          pageId,
          c.label,
          spoken,
          c.sym,
          'emoji',
          category,
          color,
          cardIdx,
          targetPageId,
          now,
          now
        );
      });
    });

  }
}
