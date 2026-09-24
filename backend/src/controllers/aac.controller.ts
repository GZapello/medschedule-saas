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
        SELECT id, board_id, page_id, label, spoken_text, image_url,
               symbol_type, category, color, position, target_page_id, active,
               created_at, updated_at
        FROM aac_cards
        WHERE board_id = ?
        ORDER BY position ASC, created_at ASC
      `).all(boardId) as any[];

      // Agrupa os cartões dentro de suas respectivas páginas
      const pagesWithCards = pages.map(p => ({
        ...p,
        cards: cards.filter(c => c.page_id === p.id)
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
        active
      } = req.body;

      const board = db.prepare('SELECT id FROM aac_boards WHERE id = ? AND tenant_id = ?').get(boardId, tenantId);
      if (!board) {
        res.status(404).json({ error: 'Prancha de CAA não encontrada.' });
        return;
      }

      const now = new Date().toISOString();
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
        target_page_id !== undefined ? target_page_id : null,
        active !== undefined ? (active ? 1 : 0) : null,
        now,
        cardId,
        boardId
      );

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
      cards: Array<{ label: string; spoken: string; cat: string; col: string; sym: string }>;
    }> = [
      {
        name: 'Principal',
        icon: 'Home',
        cards: [
          { label: 'Eu', spoken: 'Eu', cat: 'pronoun', col: '#fef08a', sym: '🙋' },
          { label: 'Você', spoken: 'Você', cat: 'pronoun', col: '#fef08a', sym: '👉' },
          { label: 'Quero', spoken: 'Quero', cat: 'action', col: '#bbf7d0', sym: '🤲' },
          { label: 'Não quero', spoken: 'Não quero', cat: 'action', col: '#fee2e2', sym: '🚫' },
          { label: 'Sim', spoken: 'Sim', cat: 'descriptor', col: '#dcfce7', sym: '👍' },
          { label: 'Não', spoken: 'Não', cat: 'descriptor', col: '#fee2e2', sym: '👎' },
          { label: 'Mais', spoken: 'Mais', cat: 'descriptor', col: '#f1f5f9', sym: '➕' },
          { label: 'Chega / Acabou', spoken: 'Acabou', cat: 'descriptor', col: '#f1f5f9', sym: '🛑' },
          { label: 'Ajuda', spoken: 'Ajuda', cat: 'action', col: '#fef3c7', sym: '🆘' },
          { label: 'Banheiro', spoken: 'Banheiro', cat: 'noun', col: '#fed7aa', sym: '🚽' },
          { label: 'Água', spoken: 'Água', cat: 'noun', col: '#fed7aa', sym: '💧' },
          { label: 'Comer', spoken: 'Comer', cat: 'noun', col: '#fed7aa', sym: '🍽️' },
          { label: 'Por favor', spoken: 'Por favor', cat: 'social', col: '#fbcfe8', sym: '🤝' },
          { label: 'Obrigado', spoken: 'Obrigado', cat: 'social', col: '#fbcfe8', sym: '🙏' },
          { label: 'Oi / Olá', spoken: 'Oi', cat: 'social', col: '#fbcfe8', sym: '👋' },
          { label: 'Tchau', spoken: 'Tchau', cat: 'social', col: '#fbcfe8', sym: '👋' }
        ]
      },
      {
        name: 'Necessidades & Dor',
        icon: 'AlertCircle',
        cards: [
          { label: 'Banheiro', spoken: 'Banheiro', cat: 'noun', col: '#fed7aa', sym: '🚽' },
          { label: 'Água', spoken: 'Água', cat: 'noun', col: '#fed7aa', sym: '💧' },
          { label: 'Fome', spoken: 'Fome', cat: 'noun', col: '#fed7aa', sym: '🥪' },
          { label: 'Sede', spoken: 'Sede', cat: 'noun', col: '#fed7aa', sym: '🥤' },
          { label: 'Dor de Cabeça', spoken: 'Dor de cabeça', cat: 'feeling', col: '#fee2e2', sym: '🤕' },
          { label: 'Dor na Barriga', spoken: 'Dor na barriga', cat: 'feeling', col: '#fee2e2', sym: '🤢' },
          { label: 'Dói Aqui', spoken: 'Dói aqui', cat: 'feeling', col: '#fee2e2', sym: '🩹' },
          { label: 'Remédio', spoken: 'Remédio', cat: 'noun', col: '#fed7aa', sym: '💊' },
          { label: 'Frio', spoken: 'Frio', cat: 'feeling', col: '#bfdbfe', sym: '🥶' },
          { label: 'Calor', spoken: 'Calor', cat: 'feeling', col: '#fed7aa', sym: '🥵' },
          { label: 'Cansado', spoken: 'Cansado', cat: 'feeling', col: '#bfdbfe', sym: '🥱' },
          { label: 'Vontade de Dormir', spoken: 'Sono', cat: 'feeling', col: '#bfdbfe', sym: '😴' }
        ]
      },
      {
        name: 'Sentimentos',
        icon: 'Smile',
        cards: [
          { label: 'Feliz', spoken: 'Feliz', cat: 'feeling', col: '#bfdbfe', sym: '😃' },
          { label: 'Triste', spoken: 'Triste', cat: 'feeling', col: '#bfdbfe', sym: '😢' },
          { label: 'Bravo / Irritado', spoken: 'Bravo', cat: 'feeling', col: '#fee2e2', sym: '😡' },
          { label: 'Medo', spoken: 'Medo', cat: 'feeling', col: '#fee2e2', sym: '😨' },
          { label: 'Calmo', spoken: 'Calmo', cat: 'feeling', col: '#bfdbfe', sym: '😌' },
          { label: 'Ansioso', spoken: 'Ansioso', cat: 'feeling', col: '#fee2e2', sym: '😰' },
          { label: 'Animado', spoken: 'Animado', cat: 'feeling', col: '#bfdbfe', sym: '🤩' },
          { label: 'Frustrado', spoken: 'Frustrado', cat: 'feeling', col: '#fee2e2', sym: '😤' },
          { label: 'Confortável', spoken: 'Confortável', cat: 'feeling', col: '#dcfce7', sym: '🛋️' },
          { label: 'Desconfortável', spoken: 'Desconfortável', cat: 'feeling', col: '#fee2e2', sym: '😣' },
          { label: 'Com Saudades', spoken: 'Com saudades', cat: 'feeling', col: '#bfdbfe', sym: '🥺' },
          { label: 'Com Vergonha', spoken: 'Com vergonha', cat: 'feeling', col: '#fed7aa', sym: '😳' }
        ]
      },
      {
        name: 'Atividades',
        icon: 'Sparkles',
        cards: [
          { label: 'Ouvir Música', spoken: 'Ouvir música', cat: 'action', col: '#bbf7d0', sym: '🎵' },
          { label: 'Falar', spoken: 'Falar', cat: 'action', col: '#bbf7d0', sym: '🗣️' },
          { label: 'Desenhar', spoken: 'Desenhar', cat: 'action', col: '#bbf7d0', sym: '🖍️' },
          { label: 'Pintar', spoken: 'Pintar', cat: 'action', col: '#bbf7d0', sym: '🎨' },
          { label: 'Brinquedo', spoken: 'Brinquedo', cat: 'noun', col: '#fed7aa', sym: '🧸' },
          { label: 'Jogo', spoken: 'Jogo', cat: 'noun', col: '#fed7aa', sym: '🎲' },
          { label: 'Dançar', spoken: 'Dançar', cat: 'action', col: '#bbf7d0', sym: '💃' },
          { label: 'Livro / História', spoken: 'História', cat: 'noun', col: '#fed7aa', sym: '📖' },
          { label: 'Espere', spoken: 'Espere', cat: 'action', col: '#fef3c7', sym: '✋' },
          { label: 'Pausa / Descanso', spoken: 'Pausa', cat: 'action', col: '#bfdbfe', sym: '⏸️' },
          { label: 'Assistir Vídeo', spoken: 'Assistir vídeo', cat: 'action', col: '#fed7aa', sym: '📺' },
          { label: 'Terminou a Sessão', spoken: 'Terminou', cat: 'social', col: '#fbcfe8', sym: '🏁' }
        ]
      },
      {
        name: 'Alimentos & Bebidas',
        icon: 'Coffee',
        cards: [
          { label: 'Água', spoken: 'Água', cat: 'noun', col: '#fed7aa', sym: '💧' },
          { label: 'Suco', spoken: 'Suco', cat: 'noun', col: '#fed7aa', sym: '🧃' },
          { label: 'Leite', spoken: 'Leite', cat: 'noun', col: '#fed7aa', sym: '🥛' },
          { label: 'Fruta', spoken: 'Fruta', cat: 'noun', col: '#fed7aa', sym: '🍎' },
          { label: 'Banana', spoken: 'Banana', cat: 'noun', col: '#fed7aa', sym: '🍌' },
          { label: 'Maçã', spoken: 'Maçã', cat: 'noun', col: '#fed7aa', sym: '🍏' },
          { label: 'Pão', spoken: 'Pão', cat: 'noun', col: '#fed7aa', sym: '🍞' },
          { label: 'Biscoito', spoken: 'Biscoito', cat: 'noun', col: '#fed7aa', sym: '🍪' },
          { label: 'Arroz e Feijão', spoken: 'Arroz e feijão', cat: 'noun', col: '#fed7aa', sym: '🍚' },
          { label: 'Macarrão', spoken: 'Macarrão', cat: 'noun', col: '#fed7aa', sym: '🍝' },
          { label: 'Carne', spoken: 'Carne', cat: 'noun', col: '#fed7aa', sym: '🥩' },
          { label: 'Gostoso', spoken: 'Gostoso', cat: 'descriptor', col: '#dcfce7', sym: '😋' }
        ]
      },
      {
        name: 'Pessoas',
        icon: 'Users',
        cards: [
          { label: 'Mamãe', spoken: 'Mamãe', cat: 'pronoun', col: '#fef08a', sym: '👩' },
          { label: 'Papai', spoken: 'Papai', cat: 'pronoun', col: '#fef08a', sym: '👨' },
          { label: 'Irmão / Irmã', spoken: 'Irmão', cat: 'pronoun', col: '#fef08a', sym: '👧' },
          { label: 'Vovó', spoken: 'Vovó', cat: 'pronoun', col: '#fef08a', sym: '👵' },
          { label: 'Vovô', spoken: 'Vovô', cat: 'pronoun', col: '#fef08a', sym: '👴' },
          { label: 'Terapeuta', spoken: 'Terapeuta', cat: 'pronoun', col: '#fef08a', sym: '🧑‍⚕️' },
          { label: 'Fonoaudióloga', spoken: 'Fonoaudióloga', cat: 'pronoun', col: '#fef08a', sym: '👩‍⚕️' },
          { label: 'Terapeuta Ocupacional', spoken: 'Terapeuta ocupacional', cat: 'pronoun', col: '#fef08a', sym: '🧑‍⚕️' },
          { label: 'Professor(a)', spoken: 'Professora', cat: 'pronoun', col: '#fef08a', sym: '🧑‍🏫' },
          { label: 'Médico(a)', spoken: 'Médico', cat: 'pronoun', col: '#fef08a', sym: '👨‍⚕️' },
          { label: 'Amigo(a)', spoken: 'Amigo', cat: 'pronoun', col: '#fef08a', sym: '🧒' },
          { label: 'Família', spoken: 'Família', cat: 'pronoun', col: '#fef08a', sym: '👨‍👩‍👧' }
        ]
      },
      {
        name: 'Lugares',
        icon: 'MapPin',
        cards: [
          { label: 'Casa', spoken: 'Casa', cat: 'noun', col: '#fed7aa', sym: '🏠' },
          { label: 'Escola', spoken: 'Escola', cat: 'noun', col: '#fed7aa', sym: '🏫' },
          { label: 'Consultório', spoken: 'Consultório', cat: 'noun', col: '#fed7aa', sym: '🏥' },
          { label: 'Clínica', spoken: 'Clínica', cat: 'noun', col: '#fed7aa', sym: '🏢' },
          { label: 'Parque', spoken: 'Parque', cat: 'noun', col: '#fed7aa', sym: '🌳' },
          { label: 'Quarto', spoken: 'Quarto', cat: 'noun', col: '#fed7aa', sym: '🛏️' },
          { label: 'Banheiro', spoken: 'Banheiro', cat: 'noun', col: '#fed7aa', sym: '🚽' },
          { label: 'Cozinha', spoken: 'Cozinha', cat: 'noun', col: '#fed7aa', sym: '🍳' },
          { label: 'Sala', spoken: 'Sala', cat: 'noun', col: '#fed7aa', sym: '🛋️' },
          { label: 'Hospital', spoken: 'Hospital', cat: 'noun', col: '#fed7aa', sym: '🏥' },
          { label: 'Rua', spoken: 'Rua', cat: 'noun', col: '#fed7aa', sym: '🛣️' },
          { label: 'Supermercado', spoken: 'Supermercado', cat: 'noun', col: '#fed7aa', sym: '🛒' }
        ]
      },
      {
        name: 'Ações',
        icon: 'Play',
        cards: [
          { label: 'Quero', spoken: 'Quero', cat: 'action', col: '#bbf7d0', sym: '🤲' },
          { label: 'Não quero', spoken: 'Não quero', cat: 'action', col: '#fee2e2', sym: '🚫' },
          { label: 'Ajudar', spoken: 'Ajudar', cat: 'action', col: '#bbf7d0', sym: '🤝' },
          { label: 'Comer', spoken: 'Comer', cat: 'action', col: '#bbf7d0', sym: '🍽️' },
          { label: 'Beber', spoken: 'Beber', cat: 'action', col: '#bbf7d0', sym: '🥤' },
          { label: 'Ir', spoken: 'Ir', cat: 'action', col: '#bbf7d0', sym: '🚶' },
          { label: 'Vir', spoken: 'Vir', cat: 'action', col: '#bbf7d0', sym: '🏃' },
          { label: 'Parar', spoken: 'Parar', cat: 'action', col: '#fee2e2', sym: '🛑' },
          { label: 'Continuar', spoken: 'Continuar', cat: 'action', col: '#bbf7d0', sym: '▶️' },
          { label: 'Olhar', spoken: 'Olhar', cat: 'action', col: '#bbf7d0', sym: '👀' },
          { label: 'Escutar', spoken: 'Escutar', cat: 'action', col: '#bbf7d0', sym: '👂' },
          { label: 'Pegar', spoken: 'Pegar', cat: 'action', col: '#bbf7d0', sym: '✊' },
          { label: 'Guardar', spoken: 'Guardar', cat: 'action', col: '#bbf7d0', sym: '📦' },
          { label: 'Abrir', spoken: 'Abrir', cat: 'action', col: '#bbf7d0', sym: '🔓' },
          { label: 'Fechar', spoken: 'Fechar', cat: 'action', col: '#bbf7d0', sym: '🔒' },
          { label: 'Sentar', spoken: 'Sentar', cat: 'action', col: '#bbf7d0', sym: '🪑' }
        ]
      },
      {
        name: 'Higiene',
        icon: 'Droplet',
        cards: [
          { label: 'Fazer Xixi', spoken: 'Fazer xixi', cat: 'noun', col: '#fed7aa', sym: '🚽' },
          { label: 'Fazer Cocô', spoken: 'Fazer cocô', cat: 'noun', col: '#fed7aa', sym: '🧻' },
          { label: 'Lavar as Mãos', spoken: 'Lavar as mãos', cat: 'action', col: '#bbf7d0', sym: '🧼' },
          { label: 'Escovar Dentes', spoken: 'Escovar os dentes', cat: 'action', col: '#bbf7d0', sym: '🪥' },
          { label: 'Tomar Banho', spoken: 'Tomar banho', cat: 'action', col: '#bbf7d0', sym: '🚿' },
          { label: 'Trocar Fralda', spoken: 'Trocar a fralda', cat: 'noun', col: '#fed7aa', sym: '👶' },
          { label: 'Limpar Nariz', spoken: 'Limpar o nariz', cat: 'noun', col: '#fed7aa', sym: '🤧' },
          { label: 'Pente', spoken: 'Pente de cabelo', cat: 'noun', col: '#fed7aa', sym: '🪮' },
          { label: 'Toalha', spoken: 'Toalha', cat: 'noun', col: '#fed7aa', sym: '🧖' },
          { label: 'Sabonete', spoken: 'Sabonete', cat: 'noun', col: '#fed7aa', sym: '🧼' },
          { label: 'Papel Higiênico', spoken: 'Papel higiênico', cat: 'noun', col: '#fed7aa', sym: '🧻' },
          { label: 'Fralda', spoken: 'Fralda', cat: 'noun', col: '#fed7aa', sym: '🩲' }
        ]
      },
      {
        name: 'Corpo',
        icon: 'Activity',
        cards: [
          { label: 'Cabeça', spoken: 'Cabeça', cat: 'noun', col: '#fed7aa', sym: '🗣️' },
          { label: 'Olhos', spoken: 'Olhos', cat: 'noun', col: '#fed7aa', sym: '👀' },
          { label: 'Boca', spoken: 'Boca', cat: 'noun', col: '#fed7aa', sym: '👄' },
          { label: 'Nariz', spoken: 'Nariz', cat: 'noun', col: '#fed7aa', sym: '👃' },
          { label: 'Ouvido', spoken: 'Ouvido', cat: 'noun', col: '#fed7aa', sym: '👂' },
          { label: 'Mãos', spoken: 'Mãos', cat: 'noun', col: '#fed7aa', sym: '✋' },
          { label: 'Pés', spoken: 'Pés', cat: 'noun', col: '#fed7aa', sym: '🦶' },
          { label: 'Braço', spoken: 'Braço', cat: 'noun', col: '#fed7aa', sym: '💪' },
          { label: 'Perna', spoken: 'Perna', cat: 'noun', col: '#fed7aa', sym: '🦵' },
          { label: 'Barriga', spoken: 'Barriga', cat: 'noun', col: '#fed7aa', sym: '🫃' },
          { label: 'Costas', spoken: 'Costas', cat: 'noun', col: '#fed7aa', sym: '🧍' },
          { label: 'Dente', spoken: 'Dente', cat: 'noun', col: '#fed7aa', sym: '🦷' }
        ]
      },
      {
        name: 'Saúde / Dor',
        icon: 'Heart',
        cards: [
          { label: 'Dói Aqui', spoken: 'Dói aqui', cat: 'feeling', col: '#fee2e2', sym: '🩹' },
          { label: 'Dor Forte', spoken: 'Dor forte', cat: 'feeling', col: '#fee2e2', sym: '💥' },
          { label: 'Dor Fraca', spoken: 'Dor fraca', cat: 'feeling', col: '#fee2e2', sym: '⚡' },
          { label: 'Remédio', spoken: 'Remédio', cat: 'noun', col: '#fed7aa', sym: '💊' },
          { label: 'Febre', spoken: 'Febre', cat: 'feeling', col: '#fee2e2', sym: '🌡️' },
          { label: 'Enjoado', spoken: 'Enjoado', cat: 'feeling', col: '#fee2e2', sym: '🤢' },
          { label: 'Tontura', spoken: 'Tontura', cat: 'feeling', col: '#fee2e2', sym: '😵‍💫' },
          { label: 'Curativo', spoken: 'Curativo', cat: 'noun', col: '#fed7aa', sym: '🩹' },
          { label: 'Termômetro', spoken: 'Termômetro', cat: 'noun', col: '#fed7aa', sym: '🌡️' },
          { label: 'Médico', spoken: 'Médico', cat: 'pronoun', col: '#fef08a', sym: '👨‍⚕️' },
          { label: 'Dentista', spoken: 'Dentista', cat: 'pronoun', col: '#fef08a', sym: '🦷' },
          { label: 'Hospital', spoken: 'Hospital', cat: 'noun', col: '#fed7aa', sym: '🏥' }
        ]
      },
      {
        name: 'Escola',
        icon: 'BookOpen',
        cards: [
          { label: 'Caderno', spoken: 'Caderno', cat: 'noun', col: '#fed7aa', sym: '📓' },
          { label: 'Lápis', spoken: 'Lápis', cat: 'noun', col: '#fed7aa', sym: '✏️' },
          { label: 'Caneta', spoken: 'Caneta', cat: 'noun', col: '#fed7aa', sym: '🖊️' },
          { label: 'Borracha', spoken: 'Borracha', cat: 'noun', col: '#fed7aa', sym: '🧼' },
          { label: 'Mochila', spoken: 'Mochila', cat: 'noun', col: '#fed7aa', sym: '🎒' },
          { label: 'Tesoura', spoken: 'Tesoura', cat: 'noun', col: '#fed7aa', sym: '✂️' },
          { label: 'Cola', spoken: 'Cola', cat: 'noun', col: '#fed7aa', sym: '🧴' },
          { label: 'Livro', spoken: 'Livro', cat: 'noun', col: '#fed7aa', sym: '📚' },
          { label: 'Lição', spoken: 'Lição', cat: 'noun', col: '#fed7aa', sym: '📝' },
          { label: 'Recreio', spoken: 'Recreio', cat: 'action', col: '#bbf7d0', sym: '🔔' },
          { label: 'Professora', spoken: 'Professora', cat: 'pronoun', col: '#fef08a', sym: '👩‍🏫' },
          { label: 'Amigos', spoken: 'Amigos', cat: 'pronoun', col: '#fef08a', sym: '🧑‍🤝‍🧑' }
        ]
      },
      {
        name: 'Casa',
        icon: 'Home',
        cards: [
          { label: 'Cama', spoken: 'Cama', cat: 'noun', col: '#fed7aa', sym: '🛏️' },
          { label: 'Mesa', spoken: 'Mesa', cat: 'noun', col: '#fed7aa', sym: '🪑' },
          { label: 'Cadeira', spoken: 'Cadeira', cat: 'noun', col: '#fed7aa', sym: '🪑' },
          { label: 'Sofá', spoken: 'Sofá', cat: 'noun', col: '#fed7aa', sym: '🛋️' },
          { label: 'Geladeira', spoken: 'Geladeira', cat: 'noun', col: '#fed7aa', sym: '🧊' },
          { label: 'Televisão', spoken: 'Televisão', cat: 'noun', col: '#fed7aa', sym: '📺' },
          { label: 'Porta', spoken: 'Porta', cat: 'noun', col: '#fed7aa', sym: '🚪' },
          { label: 'Janela', spoken: 'Janela', cat: 'noun', col: '#fed7aa', sym: '🪟' },
          { label: 'Chave', spoken: 'Chave', cat: 'noun', col: '#fed7aa', sym: '🔑' },
          { label: 'Copo', spoken: 'Copo', cat: 'noun', col: '#fed7aa', sym: '🥛' },
          { label: 'Prato', spoken: 'Prato', cat: 'noun', col: '#fed7aa', sym: '🍽️' },
          { label: 'Talher', spoken: 'Talher', cat: 'noun', col: '#fed7aa', sym: '🍴' }
        ]
      },
      {
        name: 'Brinquedos / Lazer',
        icon: 'Smile',
        cards: [
          { label: 'Bola', spoken: 'Bola', cat: 'noun', col: '#fed7aa', sym: '⚽' },
          { label: 'Boneca', spoken: 'Boneca', cat: 'noun', col: '#fed7aa', sym: '🪆' },
          { label: 'Carrinho', spoken: 'Carrinho', cat: 'noun', col: '#fed7aa', sym: '🚗' },
          { label: 'Blocos / Lego', spoken: 'Blocos de montar', cat: 'noun', col: '#fed7aa', sym: '🧱' },
          { label: 'Massinha', spoken: 'Massinha', cat: 'noun', col: '#fed7aa', sym: '🧁' },
          { label: 'Quebra-Cabeça', spoken: 'Quebra-cabeça', cat: 'noun', col: '#fed7aa', sym: '🧩' },
          { label: 'Jogo', spoken: 'Jogo', cat: 'noun', col: '#fed7aa', sym: '🎮' },
          { label: 'Bolha de Sabão', spoken: 'Bolha de sabão', cat: 'noun', col: '#fed7aa', sym: '🫧' },
          { label: 'Balanço', spoken: 'Balanço', cat: 'noun', col: '#fed7aa', sym: '🎪' },
          { label: 'Escorregador', spoken: 'Escorregador', cat: 'noun', col: '#fed7aa', sym: '🛝' },
          { label: 'Tablet', spoken: 'Tablet', cat: 'noun', col: '#fed7aa', sym: '📱' },
          { label: 'Desenho Animado', spoken: 'Desenho animado', cat: 'noun', col: '#fed7aa', sym: '🎬' }
        ]
      },
      {
        name: 'Perguntas',
        icon: 'HelpCircle',
        cards: [
          { label: 'O que?', spoken: 'O que?', cat: 'descriptor', col: '#f1f5f9', sym: '❓' },
          { label: 'Quem?', spoken: 'Quem?', cat: 'descriptor', col: '#f1f5f9', sym: '👤' },
          { label: 'Onde?', spoken: 'Onde?', cat: 'descriptor', col: '#f1f5f9', sym: '📍' },
          { label: 'Quando?', spoken: 'Quando?', cat: 'descriptor', col: '#f1f5f9', sym: '⏰' },
          { label: 'Por quê?', spoken: 'Por quê?', cat: 'descriptor', col: '#f1f5f9', sym: '🤷' },
          { label: 'Como?', spoken: 'Como?', cat: 'descriptor', col: '#f1f5f9', sym: '💡' },
          { label: 'Quanto Custa?', spoken: 'Quanto custa?', cat: 'descriptor', col: '#f1f5f9', sym: '💰' },
          { label: 'Qual?', spoken: 'Qual?', cat: 'descriptor', col: '#f1f5f9', sym: '🔀' },
          { label: 'Posso?', spoken: 'Posso?', cat: 'descriptor', col: '#f1f5f9', sym: '🙋' },
          { label: 'Cadê?', spoken: 'Cadê?', cat: 'descriptor', col: '#f1f5f9', sym: '🔍' },
          { label: 'Que Horas?', spoken: 'Que horas são?', cat: 'descriptor', col: '#f1f5f9', sym: '🕒' },
          { label: 'Tem Mais?', spoken: 'Tem mais?', cat: 'descriptor', col: '#f1f5f9', sym: '➕' }
        ]
      },
      {
        name: 'Social',
        icon: 'MessageSquare',
        cards: [
          { label: 'Oi / Olá', spoken: 'Oi', cat: 'social', col: '#fbcfe8', sym: '👋' },
          { label: 'Tchau', spoken: 'Tchau', cat: 'social', col: '#fbcfe8', sym: '👋' },
          { label: 'Bom Dia', spoken: 'Bom dia', cat: 'social', col: '#fbcfe8', sym: '☀️' },
          { label: 'Boa Tarde', spoken: 'Boa tarde', cat: 'social', col: '#fbcfe8', sym: '🌤️' },
          { label: 'Boa Noite', spoken: 'Boa noite', cat: 'social', col: '#fbcfe8', sym: '🌙' },
          { label: 'Por Favor', spoken: 'Por favor', cat: 'social', col: '#fbcfe8', sym: '🤝' },
          { label: 'Obrigado(a)', spoken: 'Obrigado', cat: 'social', col: '#fbcfe8', sym: '🙏' },
          { label: 'Desculpe', spoken: 'Desculpe', cat: 'social', col: '#fbcfe8', sym: '🙇' },
          { label: 'De Nada', spoken: 'De nada', cat: 'social', col: '#fbcfe8', sym: '😊' },
          { label: 'Parabéns', spoken: 'Parabéns', cat: 'social', col: '#fbcfe8', sym: '🎂' },
          { label: 'Tudo Bem?', spoken: 'Tudo bem?', cat: 'social', col: '#fbcfe8', sym: '💬' },
          { label: 'Com Licença', spoken: 'Com licença', cat: 'social', col: '#fbcfe8', sym: '🚪' }
        ]
      },
      {
        name: 'Rotina',
        icon: 'Clock',
        cards: [
          { label: 'Acordar', spoken: 'Acordar', cat: 'action', col: '#bbf7d0', sym: '⏰' },
          { label: 'Café da Manhã', spoken: 'Café da manhã', cat: 'noun', col: '#fed7aa', sym: '🥐' },
          { label: 'Escovar Dentes', spoken: 'Escovar dentes', cat: 'action', col: '#bbf7d0', sym: '🪥' },
          { label: 'Trocar de Roupa', spoken: 'Trocar de roupa', cat: 'action', col: '#bbf7d0', sym: '👕' },
          { label: 'Ir à Escola', spoken: 'Ir à escola', cat: 'action', col: '#bbf7d0', sym: '🎒' },
          { label: 'Sessão / Terapia', spoken: 'Terapia', cat: 'action', col: '#bbf7d0', sym: '🩺' },
          { label: 'Almoço', spoken: 'Almoço', cat: 'noun', col: '#fed7aa', sym: '🍲' },
          { label: 'Soneca', spoken: 'Soneca', cat: 'feeling', col: '#bfdbfe', sym: '🛌' },
          { label: 'Banho', spoken: 'Banho', cat: 'action', col: '#bbf7d0', sym: '🛁' },
          { label: 'Jantar', spoken: 'Jantar', cat: 'noun', col: '#fed7aa', sym: '🍽️' },
          { label: 'Hora de Dormir', spoken: 'Hora de dormir', cat: 'feeling', col: '#bfdbfe', sym: '💤' },
          { label: 'Fim de Semana', spoken: 'Fim de semana', cat: 'descriptor', col: '#dcfce7', sym: '🏖️' }
        ]
      },
      {
        name: 'Animais',
        icon: 'Sparkles',
        cards: [
          { label: 'Cachorro', spoken: 'Cachorro', cat: 'noun', col: '#fed7aa', sym: '🐶' },
          { label: 'Gato', spoken: 'Gato', cat: 'noun', col: '#fed7aa', sym: '🐱' },
          { label: 'Pássaro', spoken: 'Pássaro', cat: 'noun', col: '#fed7aa', sym: '🐦' },
          { label: 'Peixe', spoken: 'Peixe', cat: 'noun', col: '#fed7aa', sym: '🐟' },
          { label: 'Cavalo', spoken: 'Cavalo', cat: 'noun', col: '#fed7aa', sym: '🐴' },
          { label: 'Vaca', spoken: 'Vaca', cat: 'noun', col: '#fed7aa', sym: '🐮' },
          { label: 'Tartaruga', spoken: 'Tartaruga', cat: 'noun', col: '#fed7aa', sym: '🐢' },
          { label: 'Coelho', spoken: 'Coelho', cat: 'noun', col: '#fed7aa', sym: '🐰' },
          { label: 'Leão', spoken: 'Leão', cat: 'noun', col: '#fed7aa', sym: '🦁' },
          { label: 'Elefante', spoken: 'Elefante', cat: 'noun', col: '#fed7aa', sym: '🐘' },
          { label: 'Macaco', spoken: 'Macaco', cat: 'noun', col: '#fed7aa', sym: '🐵' },
          { label: 'Borboleta', spoken: 'Borboleta', cat: 'noun', col: '#fed7aa', sym: '🦋' }
        ]
      },
      {
        name: 'Roupas',
        icon: 'Layers',
        cards: [
          { label: 'Camiseta', spoken: 'Camiseta', cat: 'noun', col: '#fed7aa', sym: '👕' },
          { label: 'Calça', spoken: 'Calça', cat: 'noun', col: '#fed7aa', sym: '👖' },
          { label: 'Bermuda / Shorts', spoken: 'Bermuda', cat: 'noun', col: '#fed7aa', sym: '🩳' },
          { label: 'Vestido', spoken: 'Vestido', cat: 'noun', col: '#fed7aa', sym: '👗' },
          { label: 'Casaco / Blusa', spoken: 'Casaco', cat: 'noun', col: '#fed7aa', sym: '🧥' },
          { label: 'Meia', spoken: 'Meia', cat: 'noun', col: '#fed7aa', sym: '🧦' },
          { label: 'Tênis', spoken: 'Tênis', cat: 'noun', col: '#fed7aa', sym: '👟' },
          { label: 'Chinelo', spoken: 'Chinelo', cat: 'noun', col: '#fed7aa', sym: '🩴' },
          { label: 'Pijama', spoken: 'Pijama', cat: 'noun', col: '#fed7aa', sym: '🥱' },
          { label: 'Boné', spoken: 'Boné', cat: 'noun', col: '#fed7aa', sym: '🧢' },
          { label: 'Roupa Íntima', spoken: 'Roupa íntima', cat: 'noun', col: '#fed7aa', sym: '👙' },
          { label: 'Cueca / Calcinha', spoken: 'Cueca', cat: 'noun', col: '#fed7aa', sym: '🩲' }
        ]
      },
      {
        name: 'Transporte',
        icon: 'Compass',
        cards: [
          { label: 'Carro', spoken: 'Carro', cat: 'noun', col: '#fed7aa', sym: '🚗' },
          { label: 'Ônibus', spoken: 'Ônibus', cat: 'noun', col: '#fed7aa', sym: '🚌' },
          { label: 'Bicicleta', spoken: 'Bicicleta', cat: 'noun', col: '#fed7aa', sym: '🚲' },
          { label: 'Moto', spoken: 'Moto', cat: 'noun', col: '#fed7aa', sym: '🏍️' },
          { label: 'Avião', spoken: 'Avião', cat: 'noun', col: '#fed7aa', sym: '✈️' },
          { label: 'Trem', spoken: 'Trem', cat: 'noun', col: '#fed7aa', sym: '🚆' },
          { label: 'Metrô', spoken: 'Metrô', cat: 'noun', col: '#fed7aa', sym: '🚇' },
          { label: 'Van Escolar', spoken: 'Van escolar', cat: 'noun', col: '#fed7aa', sym: '🚐' },
          { label: 'Caminhão', spoken: 'Caminhão', cat: 'noun', col: '#fed7aa', sym: '🚚' },
          { label: 'A Pé', spoken: 'Andar a pé', cat: 'action', col: '#bbf7d0', sym: '🚶' },
          { label: 'Ambulância', spoken: 'Ambulância', cat: 'noun', col: '#fee2e2', sym: '🚑' },
          { label: 'Barco', spoken: 'Barco', cat: 'noun', col: '#fed7aa', sym: '⛵' }
        ]
      },
      {
        name: 'Tempo / Clima',
        icon: 'Sun',
        cards: [
          { label: 'Hoje', spoken: 'Hoje', cat: 'descriptor', col: '#f1f5f9', sym: '📅' },
          { label: 'Amanhã', spoken: 'Amanhã', cat: 'descriptor', col: '#f1f5f9', sym: '⏩' },
          { label: 'Ontem', spoken: 'Ontem', cat: 'descriptor', col: '#f1f5f9', sym: '⏪' },
          { label: 'Agora', spoken: 'Agora', cat: 'descriptor', col: '#f1f5f9', sym: '⏱️' },
          { label: 'Depois', spoken: 'Depois', cat: 'descriptor', col: '#f1f5f9', sym: '⌛' },
          { label: 'Sol / Ensolarado', spoken: 'Sol', cat: 'noun', col: '#fed7aa', sym: '☀️' },
          { label: 'Chuva', spoken: 'Chuva', cat: 'feeling', col: '#bfdbfe', sym: '🌧️' },
          { label: 'Nublado', spoken: 'Nublado', cat: 'descriptor', col: '#f1f5f9', sym: '☁️' },
          { label: 'Vento', spoken: 'Vento', cat: 'feeling', col: '#bfdbfe', sym: '💨' },
          { label: 'Frio', spoken: 'Frio', cat: 'feeling', col: '#bfdbfe', sym: '❄️' },
          { label: 'Calor', spoken: 'Calor', cat: 'noun', col: '#fed7aa', sym: '🔥' },
          { label: 'Dia / Noite', spoken: 'Dia e noite', cat: 'descriptor', col: '#e0e7ff', sym: '🌗' }
        ]
      },
      {
        name: 'Descritores / Conceitos',
        icon: 'Sliders',
        cards: [
          { label: 'Grande', spoken: 'Grande', cat: 'descriptor', col: '#f1f5f9', sym: '🐘' },
          { label: 'Pequeno', spoken: 'Pequeno', cat: 'descriptor', col: '#f1f5f9', sym: '🐜' },
          { label: 'Alto', spoken: 'Alto', cat: 'descriptor', col: '#f1f5f9', sym: '🦒' },
          { label: 'Baixo', spoken: 'Baixo', cat: 'descriptor', col: '#f1f5f9', sym: '🐕' },
          { label: 'Quente', spoken: 'Quente', cat: 'noun', col: '#fed7aa', sym: '☕' },
          { label: 'Frio', spoken: 'Frio', cat: 'feeling', col: '#bfdbfe', sym: '🍦' },
          { label: 'Rápido', spoken: 'Rápido', cat: 'descriptor', col: '#dcfce7', sym: '🐆' },
          { label: 'Devagar', spoken: 'Devagar', cat: 'descriptor', col: '#fee2e2', sym: '🐢' },
          { label: 'Bom / Legal', spoken: 'Bom', cat: 'descriptor', col: '#dcfce7', sym: '👍' },
          { label: 'Ruim / Chato', spoken: 'Ruim', cat: 'descriptor', col: '#fee2e2', sym: '👎' },
          { label: 'Fácil', spoken: 'Fácil', cat: 'descriptor', col: '#dcfce7', sym: '✨' },
          { label: 'Difícil', spoken: 'Difícil', cat: 'descriptor', col: '#fee2e2', sym: '🧩' },
          { label: 'Cheio', spoken: 'Cheio', cat: 'descriptor', col: '#f1f5f9', sym: '🌕' },
          { label: 'Vazio', spoken: 'Vazio', cat: 'descriptor', col: '#f1f5f9', sym: '🌑' }
        ]
      },
      {
        name: 'Cores',
        icon: 'Palette',
        cards: [
          { label: 'Vermelho', spoken: 'Vermelho', cat: 'descriptor', col: '#fee2e2', sym: '🔴' },
          { label: 'Azul', spoken: 'Azul', cat: 'feeling', col: '#bfdbfe', sym: '🔵' },
          { label: 'Amarelo', spoken: 'Amarelo', cat: 'pronoun', col: '#fef08a', sym: '🟡' },
          { label: 'Verde', spoken: 'Verde', cat: 'action', col: '#bbf7d0', sym: '🟢' },
          { label: 'Laranja', spoken: 'Laranja', cat: 'noun', col: '#fed7aa', sym: '🟠' },
          { label: 'Roxo', spoken: 'Roxo', cat: 'descriptor', col: '#e0e7ff', sym: '🟣' },
          { label: 'Rosa', spoken: 'Rosa', cat: 'social', col: '#fbcfe8', sym: '🌸' },
          { label: 'Marrom', spoken: 'Marrom', cat: 'noun', col: '#fed7aa', sym: '🟤' },
          { label: 'Preto', spoken: 'Preto', cat: 'descriptor', col: '#f1f5f9', sym: '⚫' },
          { label: 'Branco', spoken: 'Branco', cat: 'descriptor', col: '#f1f5f9', sym: '⚪' },
          { label: 'Cinza', spoken: 'Cinza', cat: 'descriptor', col: '#f1f5f9', sym: '🔘' },
          { label: 'Colorido', spoken: 'Colorido', cat: 'descriptor', col: '#dcfce7', sym: '🌈' }
        ]
      },
      {
        name: 'Números',
        icon: 'Hash',
        cards: [
          { label: '1', spoken: 'Um', cat: 'descriptor', col: '#f1f5f9', sym: '1️⃣' },
          { label: '2', spoken: 'Dois', cat: 'descriptor', col: '#f1f5f9', sym: '2️⃣' },
          { label: '3', spoken: 'Três', cat: 'descriptor', col: '#f1f5f9', sym: '3️⃣' },
          { label: '4', spoken: 'Quatro', cat: 'descriptor', col: '#f1f5f9', sym: '4️⃣' },
          { label: '5', spoken: 'Cinco', cat: 'descriptor', col: '#f1f5f9', sym: '5️⃣' },
          { label: '6', spoken: 'Seis', cat: 'descriptor', col: '#f1f5f9', sym: '6️⃣' },
          { label: '7', spoken: 'Sete', cat: 'descriptor', col: '#f1f5f9', sym: '7️⃣' },
          { label: '8', spoken: 'Oito', cat: 'descriptor', col: '#f1f5f9', sym: '8️⃣' },
          { label: '9', spoken: 'Nove', cat: 'descriptor', col: '#f1f5f9', sym: '9️⃣' },
          { label: '10', spoken: 'Dez', cat: 'descriptor', col: '#f1f5f9', sym: '🔟' },
          { label: 'Muito', spoken: 'Muito', cat: 'descriptor', col: '#f1f5f9', sym: '📈' },
          { label: 'Pouco', spoken: 'Pouco', cat: 'descriptor', col: '#f1f5f9', sym: '📉' }
        ]
      },
      {
        name: 'Tecnologia',
        icon: 'Tv',
        cards: [
          { label: 'Celular', spoken: 'Celular', cat: 'noun', col: '#fed7aa', sym: '📱' },
          { label: 'Tablet', spoken: 'Tablet', cat: 'noun', col: '#fed7aa', sym: '📲' },
          { label: 'Computador', spoken: 'Computador', cat: 'noun', col: '#fed7aa', sym: '💻' },
          { label: 'Televisão', spoken: 'Televisão', cat: 'noun', col: '#fed7aa', sym: '📺' },
          { label: 'Fone de Ouvido', spoken: 'Fone de ouvido', cat: 'noun', col: '#fed7aa', sym: '🎧' },
          { label: 'Carregador', spoken: 'Carregador', cat: 'noun', col: '#fed7aa', sym: '🔌' },
          { label: 'Vídeo', spoken: 'Vídeo', cat: 'noun', col: '#fed7aa', sym: '▶️' },
          { label: 'Música', spoken: 'Música', cat: 'noun', col: '#fed7aa', sym: '🎵' },
          { label: 'Jogar no Celular', spoken: 'Jogar no celular', cat: 'action', col: '#bbf7d0', sym: '🎮' },
          { label: 'Ligar', spoken: 'Ligar', cat: 'descriptor', col: '#dcfce7', sym: '🟢' },
          { label: 'Desligar', spoken: 'Desligar', cat: 'descriptor', col: '#fee2e2', sym: '🔴' },
          { label: 'Aumentar Som', spoken: 'Aumentar o som', cat: 'noun', col: '#fed7aa', sym: '🔊' }
        ]
      },
      {
        name: 'Sono / Descanso',
        icon: 'Moon',
        cards: [
          { label: 'Sono', spoken: 'Sono', cat: 'feeling', col: '#bfdbfe', sym: '🥱' },
          { label: 'Quero Dormir', spoken: 'Quero dormir', cat: 'feeling', col: '#bfdbfe', sym: '😴' },
          { label: 'Cansado', spoken: 'Cansado', cat: 'feeling', col: '#bfdbfe', sym: '😫' },
          { label: 'Deitar', spoken: 'Deitar', cat: 'action', col: '#bbf7d0', sym: '🛌' },
          { label: 'Travesseiro', spoken: 'Travesseiro', cat: 'noun', col: '#fed7aa', sym: '🛏️' },
          { label: 'Cobertor', spoken: 'Cobertor', cat: 'noun', col: '#fed7aa', sym: '🧶' },
          { label: 'Luz Apagada', spoken: 'Luz apagada', cat: 'descriptor', col: '#f1f5f9', sym: '🌑' },
          { label: 'Luz Acesa', spoken: 'Luz acesa', cat: 'pronoun', col: '#fef08a', sym: '💡' },
          { label: 'Silêncio', spoken: 'Silêncio por favor', cat: 'feeling', col: '#bfdbfe', sym: '🤫' },
          { label: 'Dormir na Cama', spoken: 'Dormir na cama', cat: 'noun', col: '#fed7aa', sym: '🛏️' },
          { label: 'Acordar', spoken: 'Acordar', cat: 'action', col: '#bbf7d0', sym: '🌅' },
          { label: 'Descansar', spoken: 'Descansar', cat: 'feeling', col: '#bfdbfe', sym: '🧘' }
        ]
      },
      {
        name: 'Comunicação',
        icon: 'MessageCircle',
        cards: [
          { label: 'Não Entendi', spoken: 'Não entendi', cat: 'descriptor', col: '#f1f5f9', sym: '❓' },
          { label: 'Repita por Favor', spoken: 'Repita por favor', cat: 'social', col: '#fbcfe8', sym: '🔁' },
          { label: 'Fale Devagar', spoken: 'Fale devagar', cat: 'descriptor', col: '#f1f5f9', sym: '🗣️' },
          { label: 'Quero Falar', spoken: 'Quero falar', cat: 'action', col: '#bbf7d0', sym: '💬' },
          { label: 'Espere um Pouco', spoken: 'Espere um pouco', cat: 'action', col: '#fef3c7', sym: '✋' },
          { label: 'Preciso Pensar', spoken: 'Preciso pensar', cat: 'feeling', col: '#bfdbfe', sym: '🤔' },
          { label: 'Mostre para Mim', spoken: 'Mostre para mim', cat: 'action', col: '#bbf7d0', sym: '👈' },
          { label: 'Sim', spoken: 'Sim', cat: 'descriptor', col: '#dcfce7', sym: '👍' },
          { label: 'Não', spoken: 'Não', cat: 'descriptor', col: '#fee2e2', sym: '👎' },
          { label: 'Não Sei', spoken: 'Não sei', cat: 'descriptor', col: '#f1f5f9', sym: '🤷' },
          { label: 'Quero Outra Coisa', spoken: 'Quero outra coisa', cat: 'noun', col: '#fed7aa', sym: '🔄' },
          { label: 'Terminei', spoken: 'Terminei', cat: 'social', col: '#fbcfe8', sym: '🏁' }
        ]
      }
    ];

    categoriesData.forEach((catData, catIdx) => {
      const pageId = `aac-page-${uuidv4()}`;
      insertPage.run(pageId, boardId, catData.name, catIdx, catData.icon, now);

      catData.cards.forEach((c, cardIdx) => {
        insertCard.run(
          `aac-card-${uuidv4()}`,
          boardId,
          pageId,
          c.label,
          c.spoken,
          c.sym,
          'emoji',
          c.cat,
          c.col,
          cardIdx,
          null,
          now,
          now
        );
      });
    });
  }
}
