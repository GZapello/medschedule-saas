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

    // 1. Cria Páginas
    const pageMainId = `aac-page-${uuidv4()}`;
    const pageNeedsId = `aac-page-${uuidv4()}`;
    const pageFeelingsId = `aac-page-${uuidv4()}`;
    const pageActivitiesId = `aac-page-${uuidv4()}`;
    const pageFoodId = `aac-page-${uuidv4()}`;

    insertPage.run(pageMainId, boardId, 'Principal', 0, 'Home', now);
    insertPage.run(pageNeedsId, boardId, 'Necessidades & Dor', 1, 'AlertCircle', now);
    insertPage.run(pageFeelingsId, boardId, 'Sentimentos', 2, 'Smile', now);
    insertPage.run(pageActivitiesId, boardId, 'Atividades', 3, 'Sparkles', now);
    insertPage.run(pageFoodId, boardId, 'Alimentos & Bebidas', 4, 'Coffee', now);

    // Cores padronizadas da Chave Fitzgerald:
    // Pessoas/Pronomes: Amarelo (#fef08a)
    // Ações/Verbos: Verde (#bbf7d0)
    // Substantivos/Objetos: Laranja (#fed7aa)
    // Sentimentos: Azul (#bfdbfe)
    // Descritores/Respostas: Branco/Cinza (#f1f5f9)
    // Social: Rosa/Roxo (#fbcfe8)
    // Navegação: Índigo (#e0e7ff)

    // --- PÁGINA 1: PRINCIPAL ---
    const mainCards = [
      { label: 'Eu', spoken: 'Eu', cat: 'pronoun', col: '#fef08a', sym: '🙋', target: null },
      { label: 'Você', spoken: 'Você', cat: 'pronoun', col: '#fef08a', sym: '👉', target: null },
      { label: 'Quero', spoken: 'Quero', cat: 'action', col: '#bbf7d0', sym: '🤲', target: null },
      { label: 'Não quero', spoken: 'Não quero', cat: 'action', col: '#fee2e2', sym: '🚫', target: null },
      { label: 'Sim', spoken: 'Sim', cat: 'descriptor', col: '#dcfce7', sym: '👍', target: null },
      { label: 'Não', spoken: 'Não', cat: 'descriptor', col: '#fee2e2', sym: '👎', target: null },
      { label: 'Mais', spoken: 'Mais', cat: 'descriptor', col: '#f1f5f9', sym: '➕', target: null },
      { label: 'Acabou', spoken: 'Acabou', cat: 'descriptor', col: '#f1f5f9', sym: '🛑', target: null },
      { label: 'Ajuda', spoken: 'Ajuda', cat: 'action', col: '#fef3c7', sym: '🆘', target: null },
      { label: 'Banheiro', spoken: 'Banheiro', cat: 'noun', col: '#fed7aa', sym: '🚽', target: null },
      { label: 'Água', spoken: 'Água', cat: 'noun', col: '#fed7aa', sym: '💧', target: null },
      { label: 'Comer', spoken: 'Comer', cat: 'navigation', col: '#fed7aa', sym: '🍽️', target: pageFoodId },
      { label: 'Necessidades & Dor', spoken: 'Necessidades e Dor', cat: 'navigation', col: '#e0e7ff', sym: '🩹', target: pageNeedsId },
      { label: 'Sentimentos', spoken: 'Sentimentos', cat: 'navigation', col: '#e0e7ff', sym: '😊', target: pageFeelingsId },
      { label: 'Brincar / Fazer', spoken: 'Brincar', cat: 'navigation', col: '#e0e7ff', sym: '🎨', target: pageActivitiesId },
      { label: 'Obrigado', spoken: 'Obrigado', cat: 'social', col: '#fbcfe8', sym: '🙏', target: null },
      { label: 'Oi / Olá', spoken: 'Oi', cat: 'social', col: '#fbcfe8', sym: '👋', target: null },
      { label: 'Tchau', spoken: 'Tchau', cat: 'social', col: '#fbcfe8', sym: '👋', target: null }
    ];

    mainCards.forEach((c, idx) => {
      insertCard.run(
        `aac-card-${uuidv4()}`,
        boardId,
        pageMainId,
        c.label,
        c.spoken,
        c.sym,
        'emoji',
        c.cat,
        c.col,
        idx,
        c.target,
        now,
        now
      );
    });

    // --- PÁGINA 2: NECESSIDADES & DOR ---
    const needsCards = [
      { label: 'Banheiro', spoken: 'Banheiro', cat: 'noun', col: '#fed7aa', sym: '🚽', target: null },
      { label: 'Água', spoken: 'Água', cat: 'noun', col: '#fed7aa', sym: '💧', target: null },
      { label: 'Fome', spoken: 'Fome', cat: 'noun', col: '#fed7aa', sym: '🥪', target: null },
      { label: 'Dor de Cabeça', spoken: 'Dor de cabeça', cat: 'feeling', col: '#fee2e2', sym: '🤕', target: null },
      { label: 'Dor na Barriga', spoken: 'Dor na barriga', cat: 'feeling', col: '#fee2e2', sym: '🤢', target: null },
      { label: 'Dói Aqui', spoken: 'Dói aqui', cat: 'feeling', col: '#fee2e2', sym: '🩹', target: null },
      { label: 'Remédio', spoken: 'Remédio', cat: 'noun', col: '#fed7aa', sym: '💊', target: null },
      { label: 'Frio', spoken: 'Frio', cat: 'feeling', col: '#bfdbfe', sym: '🥶', target: null },
      { label: 'Calor', spoken: 'Calor', cat: 'feeling', col: '#fed7aa', sym: '🥵', target: null },
      { label: 'Cansado', spoken: 'Cansado', cat: 'feeling', col: '#bfdbfe', sym: '🥱', target: null },
      { label: 'Vontade de Dormir', spoken: 'Sono', cat: 'feeling', col: '#bfdbfe', sym: '😴', target: null },
      { label: 'Voltar ao Início', spoken: 'Início', cat: 'navigation', col: '#e0e7ff', sym: '🏠', target: pageMainId }
    ];

    needsCards.forEach((c, idx) => {
      insertCard.run(
        `aac-card-${uuidv4()}`,
        boardId,
        pageNeedsId,
        c.label,
        c.spoken,
        c.sym,
        'emoji',
        c.cat,
        c.col,
        idx,
        c.target,
        now,
        now
      );
    });

    // --- PÁGINA 3: SENTIMENTOS ---
    const feelingsCards = [
      { label: 'Feliz', spoken: 'Feliz', cat: 'feeling', col: '#bfdbfe', sym: '😃', target: null },
      { label: 'Triste', spoken: 'Triste', cat: 'feeling', col: '#bfdbfe', sym: '😢', target: null },
      { label: 'Bravo / Irritado', spoken: 'Bravo', cat: 'feeling', col: '#fee2e2', sym: '😡', target: null },
      { label: 'Medo', spoken: 'Medo', cat: 'feeling', col: '#fee2e2', sym: '😨', target: null },
      { label: 'Calmo', spoken: 'Calmo', cat: 'feeling', col: '#bfdbfe', sym: '😌', target: null },
      { label: 'Ansioso', spoken: 'Ansioso', cat: 'feeling', col: '#fee2e2', sym: '😰', target: null },
      { label: 'Animado', spoken: 'Animado', cat: 'feeling', col: '#bfdbfe', sym: '🤩', target: null },
      { label: 'Frustrado', spoken: 'Frustrado', cat: 'feeling', col: '#fee2e2', sym: '😤', target: null },
      { label: 'Confortável', spoken: 'Confortável', cat: 'feeling', col: '#dcfce7', sym: '🛋️', target: null },
      { label: 'Desconfortável', spoken: 'Desconfortável', cat: 'feeling', col: '#fee2e2', sym: '😣', target: null },
      { label: 'Muito Barulho', spoken: 'Muito barulho', cat: 'feeling', col: '#fee2e2', sym: '📢', target: null },
      { label: 'Voltar ao Início', spoken: 'Início', cat: 'navigation', col: '#e0e7ff', sym: '🏠', target: pageMainId }
    ];

    feelingsCards.forEach((c, idx) => {
      insertCard.run(
        `aac-card-${uuidv4()}`,
        boardId,
        pageFeelingsId,
        c.label,
        c.spoken,
        c.sym,
        'emoji',
        c.cat,
        c.col,
        idx,
        c.target,
        now,
        now
      );
    });

    // --- PÁGINA 4: ATIVIDADES & CONSULTÓRIO ---
    const activitiesCards = [
      { label: 'Ouvir', spoken: 'Ouvir', cat: 'action', col: '#bbf7d0', sym: '👂', target: null },
      { label: 'Falar', spoken: 'Falar', cat: 'action', col: '#bbf7d0', sym: '🗣️', target: null },
      { label: 'Desenhar', spoken: 'Desenhar', cat: 'action', col: '#bbf7d0', sym: '🖍️', target: null },
      { label: 'Brinquedo', spoken: 'Brinquedo', cat: 'noun', col: '#fed7aa', sym: '🧸', target: null },
      { label: 'Jogo', spoken: 'Jogo', cat: 'noun', col: '#fed7aa', sym: '🎲', target: null },
      { label: 'Música', spoken: 'Música', cat: 'noun', col: '#fed7aa', sym: '🎵', target: null },
      { label: 'Livro / História', spoken: 'História', cat: 'noun', col: '#fed7aa', sym: '📖', target: null },
      { label: 'Espere', spoken: 'Espere', cat: 'action', col: '#fef3c7', sym: '✋', target: null },
      { label: 'Não Entendi', spoken: 'Não entendi', cat: 'descriptor', col: '#f1f5f9', sym: '❓', target: null },
      { label: 'Pausa / Descanso', spoken: 'Pausa', cat: 'action', col: '#bfdbfe', sym: '⏸️', target: null },
      { label: 'Terminou a Sessão', spoken: 'Terminou', cat: 'social', col: '#fbcfe8', sym: '🏁', target: null },
      { label: 'Voltar ao Início', spoken: 'Início', cat: 'navigation', col: '#e0e7ff', sym: '🏠', target: pageMainId }
    ];

    activitiesCards.forEach((c, idx) => {
      insertCard.run(
        `aac-card-${uuidv4()}`,
        boardId,
        pageActivitiesId,
        c.label,
        c.spoken,
        c.sym,
        'emoji',
        c.cat,
        c.col,
        idx,
        c.target,
        now,
        now
      );
    });

    // --- PÁGINA 5: ALIMENTOS & BEBIDAS ---
    const foodCards = [
      { label: 'Água', spoken: 'Água', cat: 'noun', col: '#fed7aa', sym: '💧', target: null },
      { label: 'Suco', spoken: 'Suco', cat: 'noun', col: '#fed7aa', sym: '🧃', target: null },
      { label: 'Leite', spoken: 'Leite', cat: 'noun', col: '#fed7aa', sym: '🥛', target: null },
      { label: 'Fruta', spoken: 'Fruta', cat: 'noun', col: '#fed7aa', sym: '🍎', target: null },
      { label: 'Banana', spoken: 'Banana', cat: 'noun', col: '#fed7aa', sym: '🍌', target: null },
      { label: 'Maçã', spoken: 'Maçã', cat: 'noun', col: '#fed7aa', sym: '🍏', target: null },
      { label: 'Pão', spoken: 'Pão', cat: 'noun', col: '#fed7aa', sym: '🍞', target: null },
      { label: 'Biscoito', spoken: 'Biscoito', cat: 'noun', col: '#fed7aa', sym: '🍪', target: null },
      { label: 'Comida de Sal', spoken: 'Comida', cat: 'noun', col: '#fed7aa', sym: '🍲', target: null },
      { label: 'Gostoso', spoken: 'Gostoso', cat: 'descriptor', col: '#dcfce7', sym: '😋', target: null },
      { label: 'Não Gosto', spoken: 'Não gosto', cat: 'descriptor', col: '#fee2e2', sym: '😖', target: null },
      { label: 'Voltar ao Início', spoken: 'Início', cat: 'navigation', col: '#e0e7ff', sym: '🏠', target: pageMainId }
    ];

    foodCards.forEach((c, idx) => {
      insertCard.run(
        `aac-card-${uuidv4()}`,
        boardId,
        pageFoodId,
        c.label,
        c.spoken,
        c.sym,
        'emoji',
        c.cat,
        c.col,
        idx,
        c.target,
        now,
        now
      );
    });
  }
}
