import { Request, Response } from 'express';
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import {
  generateStudentAccessToken,
  hashStudentAccessToken,
  encryptStudentAccessToken,
  decryptStudentAccessToken,
  evaluateInactivity
} from '../services/personal-student-link.service';
import { hasPersonalAccess, getProfessionalId } from './personal.controller';
import { logAudit } from '../middlewares/audit.middleware';

export class PersonalStudentLinkController {
  // ==========================================
  // ENDPOINTS AUTENTICADOS (PROFISSIONAL PERSONAL)
  // ==========================================

  /**
   * Obtém os detalhes do link do aluno no ZemdaPersonal
   */
  static async getAccessLink(req: Request, res: Response): Promise<void> {
    try {
      if (!hasPersonalAccess(req)) {
        res.status(403).json({ error: 'Acesso não autorizado ao ZemdaPersonal' });
        return;
      }
      const tenantId = req.tenantId!;
      const { studentId } = req.params;

      if (!studentId) {
        res.status(400).json({ error: 'Identificador do aluno é obrigatório' });
        return;
      }

      // Busca o registro mais recente para este aluno
      const link = db.prepare(`
        SELECT * FROM personal_student_access_links
        WHERE tenant_id = ? AND student_id = ?
        ORDER BY created_at DESC
        LIMIT 1
      `).get(tenantId, studentId) as any;

      if (!link) {
        res.json({
          hasLink: false,
          status: 'none'
        });
        return;
      }

      const inactivity = evaluateInactivity(link);

      // Se estiver ativo mas com mais de 30 dias sem acesso, atualiza status para 'expired'
      if (link.status === 'active' && inactivity.isExpired) {
        db.prepare(`
          UPDATE personal_student_access_links
          SET status = 'expired', updated_at = datetime('now')
          WHERE id = ?
        `).run(link.id);
        link.status = 'expired';
      }

      let rawToken: string | null = null;
      let linkUrl: string | null = null;

      if (link.status === 'active') {
        rawToken = decryptStudentAccessToken(link.token_encrypted);
        if (rawToken) {
          const origin = req.get('origin') || `${req.protocol}://${req.get('host')}`;
          linkUrl = `${origin}/treino/${rawToken}`;
        }
      }

      res.json({
        hasLink: true,
        id: link.id,
        status: link.status,
        linkUrl,
        token: rawToken,
        createdAt: link.created_at,
        lastAccessAt: link.last_access_at,
        revokedAt: link.revoked_at,
        expiresAt: inactivity.expiresAt,
        daysRemaining: inactivity.daysRemaining,
        isExpired: inactivity.isExpired,
        inactivityDays: link.inactivity_days || 30
      });
    } catch (err: any) {
      console.error('[PersonalStudentLinkController.getAccessLink] Erro:', err);
      res.status(500).json({ error: 'Erro ao consultar link do aluno' });
    }
  }

  /**
   * Gera um novo link ou retorna o link ativo existente (regra de 1 link por aluno)
   */
  static async generateOrGetAccessLink(req: Request, res: Response): Promise<void> {
    try {
      if (!hasPersonalAccess(req)) {
        res.status(403).json({ error: 'Acesso não autorizado ao ZemdaPersonal' });
        return;
      }
      const tenantId = req.tenantId!;
      const professionalId = getProfessionalId(req);
      const { studentId } = req.params;

      if (!studentId) {
        res.status(400).json({ error: 'Identificador do aluno é obrigatório' });
        return;
      }

      // Valida se o aluno pertence à clínica
      const student = db.prepare(`
        SELECT id, COALESCE(full_name, social_name) as name
        FROM patients
        WHERE id = ? AND tenant_id = ?
      `).get(studentId, tenantId) as any;

      if (!student) {
        res.status(404).json({ error: 'Aluno não encontrado' });
        return;
      }

      // Verifica se já existe link ativo
      const existingLink = db.prepare(`
        SELECT * FROM personal_student_access_links
        WHERE tenant_id = ? AND student_id = ? AND status = 'active'
        ORDER BY created_at DESC
        LIMIT 1
      `).get(tenantId, studentId) as any;

      if (existingLink) {
        const inactivity = evaluateInactivity(existingLink);

        // Se ainda estiver dentro do prazo de 30 dias de inatividade, reutiliza o mesmo link
        if (!inactivity.isExpired) {
          const rawToken = decryptStudentAccessToken(existingLink.token_encrypted);
          const origin = req.get('origin') || `${req.protocol}://${req.get('host')}`;
          const linkUrl = rawToken ? `${origin}/treino/${rawToken}` : null;

          res.json({
            id: existingLink.id,
            status: 'active',
            linkUrl,
            token: rawToken,
            createdAt: existingLink.created_at,
            lastAccessAt: existingLink.last_access_at,
            expiresAt: inactivity.expiresAt,
            daysRemaining: inactivity.daysRemaining,
            isExpired: false,
            message: 'Link ativo existente recuperado'
          });
          return;
        }

        // Se expirou por inatividade, marca como expirado antes de gerar um novo
        db.prepare(`
          UPDATE personal_student_access_links
          SET status = 'expired', updated_at = datetime('now')
          WHERE id = ?
        `).run(existingLink.id);
      }

      // Gera novo token aleatório criptograficamente seguro
      const rawToken = generateStudentAccessToken();
      const tokenHash = hashStudentAccessToken(rawToken);
      const tokenEncrypted = encryptStudentAccessToken(rawToken);
      const linkId = 'psl-' + uuidv4().slice(0, 8);

      db.prepare(`
        INSERT INTO personal_student_access_links (
          id, tenant_id, student_id, professional_id, token_hash, token_encrypted,
          status, inactivity_days, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'active', 30, datetime('now'), datetime('now'))
      `).run(linkId, tenantId, studentId, professionalId, tokenHash, tokenEncrypted);

      const now = new Date();
      const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const origin = req.get('origin') || `${req.protocol}://${req.get('host')}`;
      const linkUrl = `${origin}/treino/${rawToken}`;

      logAudit(req, 'GENERATE_PERSONAL_STUDENT_LINK', 'personal_student_access_links', linkId, {
        student_id: studentId,
        student_name: student.name
      });

      res.status(201).json({
        id: linkId,
        status: 'active',
        linkUrl,
        token: rawToken,
        createdAt: now.toISOString(),
        lastAccessAt: null,
        expiresAt,
        daysRemaining: 30,
        isExpired: false,
        message: 'Link exclusivo do aluno gerado com sucesso'
      });
    } catch (err: any) {
      console.error('[PersonalStudentLinkController.generateOrGetAccessLink] Erro:', err);
      res.status(500).json({ error: 'Erro ao gerar link de acesso do aluno' });
    }
  }

  /**
   * Revoga manualmente o link do aluno
   */
  static async revokeAccessLink(req: Request, res: Response): Promise<void> {
    try {
      if (!hasPersonalAccess(req)) {
        res.status(403).json({ error: 'Acesso não autorizado ao ZemdaPersonal' });
        return;
      }
      const tenantId = req.tenantId!;
      const userId = req.user?.userId;
      const { studentId } = req.params;

      if (!studentId) {
        res.status(400).json({ error: 'Identificador do aluno é obrigatório' });
        return;
      }

      const result = db.prepare(`
        UPDATE personal_student_access_links
        SET status = 'revoked', revoked_at = datetime('now'), revoked_by = ?, updated_at = datetime('now')
        WHERE tenant_id = ? AND student_id = ? AND status = 'active'
      `).run(userId || null, tenantId, studentId);

      if (result.changes === 0) {
        res.status(404).json({ error: 'Nenhum link ativo encontrado para revogação' });
        return;
      }

      logAudit(req, 'REVOKE_PERSONAL_STUDENT_LINK', 'personal_student_access_links', studentId, {
        student_id: studentId
      });

      res.json({
        success: true,
        message: 'Acesso do aluno revogado com sucesso'
      });
    } catch (err: any) {
      console.error('[PersonalStudentLinkController.revokeAccessLink] Erro:', err);
      res.status(500).json({ error: 'Erro ao revogar link do aluno' });
    }
  }

  // ==========================================
  // ENDPOINTS PÚBLICOS (ALUNO ACESSA /treino/:token)
  // ==========================================

  /**
   * Consulta pública dos treinos prescritos ativos do aluno
   */
  static async getPublicWorkout(req: Request, res: Response): Promise<void> {
    try {
      const { token } = req.params;
      if (!token || typeof token !== 'string') {
        res.status(400).json({ error: 'Token de treino inválido' });
        return;
      }

      const tokenHash = hashStudentAccessToken(token);

      const link = db.prepare(`
        SELECT * FROM personal_student_access_links
        WHERE token_hash = ?
      `).get(tokenHash) as any;

      if (!link) {
        res.status(404).json({ error: 'Link de treino não encontrado ou inválido' });
        return;
      }

      if (link.status === 'revoked') {
        res.status(403).json({
          error: 'Este link de acesso foi revogado pelo seu personal trainer.',
          code: 'REVOKED'
        });
        return;
      }

      // Validação de expiração por 30 dias de inatividade
      const inactivity = evaluateInactivity(link);
      if (inactivity.isExpired || link.status === 'expired') {
        if (link.status !== 'expired') {
          db.prepare(`
            UPDATE personal_student_access_links
            SET status = 'expired', updated_at = datetime('now')
            WHERE id = ?
          `).run(link.id);
        }
        res.status(410).json({
          error: 'Este link expirou por 30 dias consecutivos sem acesso. Solicite um novo link ao seu personal trainer.',
          code: 'EXPIRED'
        });
        return;
      }

      // Atualiza last_access_at para o momento atual (estende os 30 dias)
      db.prepare(`
        UPDATE personal_student_access_links
        SET last_access_at = datetime('now'), updated_at = datetime('now')
        WHERE id = ?
      `).run(link.id);

      // Busca dados básicos do aluno (apenas o estritamente necessário para treino, sem dados sensíveis)
      const student = db.prepare(`
        SELECT id, COALESCE(full_name, social_name) as name, gender
        FROM patients
        WHERE id = ? AND tenant_id = ?
      `).get(link.student_id, link.tenant_id) as any;

      if (!student) {
        res.status(404).json({ error: 'Registro do aluno não localizado' });
        return;
      }

      // Nome da academia/clínica para cabeçalho não-administrativo
      const tenant = db.prepare(`
        SELECT name FROM tenants WHERE id = ?
      `).get(link.tenant_id) as any;

      // Busca os treinos ativos prescritos diretamente do banco
      const workouts = db.prepare(`
        SELECT id, title, division, structure_type, notes, updated_at
        FROM personal_workouts
        WHERE patient_id = ? AND tenant_id = ? AND is_active = 1
        ORDER BY division ASC, created_at DESC
      `).all(link.student_id, link.tenant_id) as any[];

      // Anexa exercícios para cada treino
      for (const w of workouts) {
        const exercises = db.prepare(`
          SELECT id, workout_id, order_index, name, muscle_group, sets, reps, load_kg,
                 rest_seconds, cadence, tempo, rpe, rir, technique, technique_custom, notes, photo_url
          FROM personal_workout_exercises
          WHERE workout_id = ? AND tenant_id = ?
          ORDER BY order_index ASC
        `).all(w.id, link.tenant_id) as any[];

        w.exercises = exercises;
      }

      // Verifica se há alguma sessão em andamento iniciada pelo aluno
      const activeSession = db.prepare(`
        SELECT id, workout_id, started_at, snapshot_workout_json, progress_state_json
        FROM personal_student_sessions
        WHERE tenant_id = ? AND student_id = ? AND status = 'in_progress'
        ORDER BY started_at DESC
        LIMIT 1
      `).get(link.tenant_id, link.student_id) as any;

      let sessionData = null;
      if (activeSession) {
        try {
          sessionData = {
            id: activeSession.id,
            workout_id: activeSession.workout_id,
            started_at: activeSession.started_at,
            snapshot: JSON.parse(activeSession.snapshot_workout_json),
            progress: activeSession.progress_state_json ? JSON.parse(activeSession.progress_state_json) : null
          };
        } catch {
          sessionData = null;
        }
      }

      res.json({
        student: {
          name: student.name,
          gender: student.gender
        },
        clinicName: tenant?.name || 'ZemdaPersonal',
        workouts,
        activeSession: sessionData
      });
    } catch (err: any) {
      console.error('[PersonalStudentLinkController.getPublicWorkout] Erro:', err);
      res.status(500).json({ error: 'Erro ao carregar treinos prescritos' });
    }
  }

  /**
   * Inicia a execução do treino pelo aluno
   * Grava started_at e congela snapshot dos exercícios para não corromper caso o personal altere durante a sessão
   */
  static async startSession(req: Request, res: Response): Promise<void> {
    try {
      const token = String(req.params.token || '');
      const { workout_id } = req.body;

      if (!token || !workout_id) {
        res.status(400).json({ error: 'Token e identificador do treino são obrigatórios' });
        return;
      }

      const tokenHash = hashStudentAccessToken(token);
      const link = db.prepare(`
        SELECT * FROM personal_student_access_links
        WHERE token_hash = ? AND status = 'active'
      `).get(tokenHash) as any;

      if (!link) {
        res.status(403).json({ error: 'Acesso não autorizado ou link inválido' });
        return;
      }

      const inactivity = evaluateInactivity(link);
      if (inactivity.isExpired) {
        res.status(410).json({ error: 'Link expirado por inatividade' });
        return;
      }

      // Valida se o treino pertence ao aluno
      const workout = db.prepare(`
        SELECT * FROM personal_workouts
        WHERE id = ? AND patient_id = ? AND tenant_id = ? AND is_active = 1
      `).get(workout_id, link.student_id, link.tenant_id) as any;

      if (!workout) {
        res.status(404).json({ error: 'Treino não encontrado ou inativo' });
        return;
      }

      const exercises = db.prepare(`
        SELECT * FROM personal_workout_exercises
        WHERE workout_id = ? AND tenant_id = ?
        ORDER BY order_index ASC
      `).all(workout_id, link.tenant_id) as any[];

      // Se já houver sessão em andamento do mesmo treino, retorna a existente
      const existingSession = db.prepare(`
        SELECT * FROM personal_student_sessions
        WHERE tenant_id = ? AND student_id = ? AND workout_id = ? AND status = 'in_progress'
        ORDER BY started_at DESC
        LIMIT 1
      `).get(link.tenant_id, link.student_id, workout_id) as any;

      if (existingSession) {
        res.json({
          sessionId: existingSession.id,
          started_at: existingSession.started_at,
          snapshot: JSON.parse(existingSession.snapshot_workout_json),
          progress: existingSession.progress_state_json ? JSON.parse(existingSession.progress_state_json) : null
        });
        return;
      }

      // Abandona eventuais sessões anteriores que ficaram em aberto em outras divisões
      db.prepare(`
        UPDATE personal_student_sessions
        SET status = 'abandoned', updated_at = datetime('now')
        WHERE tenant_id = ? AND student_id = ? AND status = 'in_progress'
      `).run(link.tenant_id, link.student_id);

      const sessionId = 'pss-' + uuidv4().slice(0, 8);
      const startedAt = new Date().toISOString();
      const snapshot = {
        workout: {
          id: workout.id,
          title: workout.title,
          division: workout.division,
          notes: workout.notes
        },
        exercises
      };

      db.prepare(`
        INSERT INTO personal_student_sessions (
          id, tenant_id, student_id, workout_id, link_id, status,
          snapshot_workout_json, progress_state_json, started_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'in_progress', ?, ?, ?, datetime('now'), datetime('now'))
      `).run(
        sessionId,
        link.tenant_id,
        link.student_id,
        workout_id,
        link.id,
        JSON.stringify(snapshot),
        JSON.stringify({}),
        startedAt
      );

      res.status(201).json({
        sessionId,
        started_at: startedAt,
        snapshot
      });
    } catch (err: any) {
      console.error('[PersonalStudentLinkController.startSession] Erro:', err);
      res.status(500).json({ error: 'Erro ao iniciar execução de treino' });
    }
  }

  /**
   * Salva progresso intermediário durante a sessão (autosave seguro)
   */
  static async saveProgress(req: Request, res: Response): Promise<void> {
    try {
      const token = String(req.params.token || '');
      const sessionId = String(req.params.sessionId || '');
      const { progress_state } = req.body;

      if (!token || !sessionId) {
        res.status(400).json({ error: 'Parâmetros insuficientes' });
        return;
      }

      const tokenHash = hashStudentAccessToken(token);
      const link = db.prepare(`
        SELECT student_id, tenant_id FROM personal_student_access_links
        WHERE token_hash = ? AND status = 'active'
      `).get(tokenHash) as any;

      if (!link) {
        res.status(403).json({ error: 'Acesso não autorizado' });
        return;
      }

      db.prepare(`
        UPDATE personal_student_sessions
        SET progress_state_json = ?, updated_at = datetime('now')
        WHERE id = ? AND student_id = ? AND tenant_id = ? AND status = 'in_progress'
      `).run(JSON.stringify(progress_state || {}), sessionId, link.student_id, link.tenant_id);

      res.json({ success: true });
    } catch (err: any) {
      console.error('[PersonalStudentLinkController.saveProgress] Erro:', err);
      res.status(500).json({ error: 'Erro ao salvar progresso' });
    }
  }

  /**
   * Finaliza o treino executado pelo aluno
   * Alimenta diretamente a tabela personal_workout_logs e o módulo "Execuções & Recordes"
   */
  static async finishSession(req: Request, res: Response): Promise<void> {
    try {
      const token = String(req.params.token || '');
      const sessionId = String(req.params.sessionId || '');
      const { duration_minutes, rpe, feedback_notes, exercises_performed } = req.body;

      if (!token || !sessionId) {
        res.status(400).json({ error: 'Parâmetros insuficientes para finalização' });
        return;
      }

      const tokenHash = hashStudentAccessToken(token);
      const link = db.prepare(`
        SELECT * FROM personal_student_access_links
        WHERE token_hash = ? AND status = 'active'
      `).get(tokenHash) as any;

      if (!link) {
        res.status(403).json({ error: 'Acesso não autorizado' });
        return;
      }

      const session = db.prepare(`
        SELECT * FROM personal_student_sessions
        WHERE id = ? AND student_id = ? AND tenant_id = ? AND status = 'in_progress'
      `).get(sessionId, link.student_id, link.tenant_id) as any;

      if (!session) {
        res.status(404).json({ error: 'Sessão de treino não encontrada ou já finalizada' });
        return;
      }

      // Calcula duração real a partir do started_at caso duration_minutes não seja fornecido
      const startedTime = new Date(session.started_at).getTime();
      const nowTime = Date.now();
      const calculatedDuration = Math.max(1, Math.round((nowTime - startedTime) / 60000));
      const finalDuration = duration_minutes ? Number(duration_minutes) : calculatedDuration;

      const logId = 'pwl-' + uuidv4().slice(0, 8);
      const detailsJson = exercises_performed ? JSON.stringify(exercises_performed) : null;
      const completedAt = new Date().toISOString();

      // Busca o professional_id associado ao treino
      const workout = db.prepare(`
        SELECT professional_id FROM personal_workouts WHERE id = ?
      `).get(session.workout_id) as any;
      const professionalId = workout?.professional_id || link.professional_id;

      // 1. Grava no histórico oficial existente do ZemdaPersonal (personal_workout_logs)
      db.prepare(`
        INSERT INTO personal_workout_logs (
          id, tenant_id, workout_id, patient_id, professional_id, appointment_id,
          completed_at, duration_minutes, rpe, feedback_notes, log_details_json, created_at
        ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, datetime('now'))
      `).run(
        logId,
        link.tenant_id,
        session.workout_id,
        link.student_id,
        professionalId || null,
        completedAt,
        finalDuration,
        rpe ? Number(rpe) : null,
        feedback_notes || null,
        detailsJson
      );

      // 2. Cálculo e detecção de Recordes Pessoais (PRs - Carga máxima superada)
      const newPRs: Array<{ exercise_name: string; previous_max: number; new_pr: number }> = [];

      if (Array.isArray(exercises_performed)) {
        const priorLogs = db.prepare(`
          SELECT log_details_json FROM personal_workout_logs
          WHERE patient_id = ? AND tenant_id = ? AND id != ?
        `).all(link.student_id, link.tenant_id, logId) as any[];

        const bestPriorLoads: Record<string, number> = {};
        priorLogs.forEach((pl: any) => {
          try {
            const exList = JSON.parse(pl.log_details_json);
            if (Array.isArray(exList)) {
              exList.forEach((e: any) => {
                const name = (e.name || '').trim().toLowerCase();
                const load = Number(e.load_kg || e.load || 0);
                if (load > (bestPriorLoads[name] || 0)) {
                  bestPriorLoads[name] = load;
                }
              });
            }
          } catch {}
        });

        exercises_performed.forEach((ex: any) => {
          const name = (ex.name || '').trim();
          const key = name.toLowerCase();
          const currentLoad = Number(ex.load_kg || ex.load || 0);
          const prevBest = bestPriorLoads[key] || 0;

          if (currentLoad > 0 && currentLoad > prevBest) {
            newPRs.push({
              exercise_name: name,
              previous_max: prevBest,
              new_pr: currentLoad
            });
          }
        });
      }

      // 3. Atualiza a sessão para concluída
      db.prepare(`
        UPDATE personal_student_sessions
        SET status = 'completed', finished_at = ?, duration_minutes = ?, workout_log_id = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(completedAt, finalDuration, logId, sessionId);

      res.status(200).json({
        success: true,
        logId,
        newPRs,
        summary: {
          completed_at: completedAt,
          duration_minutes: finalDuration,
          exercises_count: Array.isArray(exercises_performed) ? exercises_performed.length : 0,
          completed_exercises_count: Array.isArray(exercises_performed)
            ? exercises_performed.filter((e: any) => !e.skipped && (e.sets_completed > 0 || e.sets_done > 0)).length
            : 0,
          rpe: rpe ? Number(rpe) : null,
          feedback_notes: feedback_notes || null
        },
        message: 'Treino finalizado com sucesso e sincronizado com o ZemdaPersonal'
      });
    } catch (err: any) {
      console.error('[PersonalStudentLinkController.finishSession] Erro:', err);
      res.status(500).json({ error: 'Erro ao finalizar treino' });
    }
  }
}
