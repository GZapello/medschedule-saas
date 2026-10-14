"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PersonalStudentLinkController = void 0;
const database_1 = require("../config/database");
const uuid_1 = require("uuid");
const personal_student_link_service_1 = require("../services/personal-student-link.service");
const exercise_media_1 = require("../services/exercise-media");
const personal_controller_1 = require("./personal.controller");
const audit_middleware_1 = require("../middlewares/audit.middleware");
class PersonalStudentLinkController {
    // ==========================================
    // ENDPOINTS AUTENTICADOS (PROFISSIONAL PERSONAL)
    // ==========================================
    /**
     * Obtém os detalhes do link do aluno no ZemdaPersonal
     */
    static async getAccessLink(req, res) {
        try {
            if (!(0, personal_controller_1.hasPersonalAccess)(req)) {
                res.status(403).json({ error: 'Acesso não autorizado ao ZemdaPersonal' });
                return;
            }
            const tenantId = req.tenantId;
            const { studentId } = req.params;
            if (!studentId) {
                res.status(400).json({ error: 'Identificador do aluno é obrigatório' });
                return;
            }
            // Busca o registro mais recente para este aluno
            const link = database_1.db.prepare(`
        SELECT * FROM personal_student_access_links
        WHERE tenant_id = ? AND student_id = ?
        ORDER BY created_at DESC
        LIMIT 1
      `).get(tenantId, studentId);
            if (!link) {
                res.json({
                    hasLink: false,
                    status: 'none'
                });
                return;
            }
            const inactivity = (0, personal_student_link_service_1.evaluateInactivity)(link);
            // Se estiver ativo mas com mais de 30 dias sem acesso, atualiza status para 'expired'
            if (link.status === 'active' && inactivity.isExpired) {
                database_1.db.prepare(`
          UPDATE personal_student_access_links
          SET status = 'expired', updated_at = datetime('now')
          WHERE id = ?
        `).run(link.id);
                link.status = 'expired';
            }
            let rawToken = null;
            let linkUrl = null;
            if (link.status === 'active') {
                rawToken = (0, personal_student_link_service_1.decryptStudentAccessToken)(link.token_encrypted);
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
        }
        catch (err) {
            console.error('[PersonalStudentLinkController.getAccessLink] Erro:', err);
            res.status(500).json({ error: 'Erro ao consultar link do aluno' });
        }
    }
    /**
     * Gera um novo link ou retorna o link ativo existente (regra de 1 link por aluno)
     */
    static async generateOrGetAccessLink(req, res) {
        try {
            if (!(0, personal_controller_1.hasPersonalAccess)(req)) {
                res.status(403).json({ error: 'Acesso não autorizado ao ZemdaPersonal' });
                return;
            }
            const tenantId = req.tenantId;
            const professionalId = (0, personal_controller_1.getProfessionalId)(req);
            const { studentId } = req.params;
            if (!studentId) {
                res.status(400).json({ error: 'Identificador do aluno é obrigatório' });
                return;
            }
            // Valida se o aluno pertence à clínica
            const student = database_1.db.prepare(`
        SELECT id, COALESCE(full_name, social_name) as name
        FROM patients
        WHERE id = ? AND tenant_id = ?
      `).get(studentId, tenantId);
            if (!student) {
                res.status(404).json({ error: 'Aluno não encontrado' });
                return;
            }
            // Verifica se já existe link ativo
            const existingLink = database_1.db.prepare(`
        SELECT * FROM personal_student_access_links
        WHERE tenant_id = ? AND student_id = ? AND status = 'active'
        ORDER BY created_at DESC
        LIMIT 1
      `).get(tenantId, studentId);
            if (existingLink) {
                const inactivity = (0, personal_student_link_service_1.evaluateInactivity)(existingLink);
                // Se ainda estiver dentro do prazo de 30 dias de inatividade, reutiliza o mesmo link
                if (!inactivity.isExpired) {
                    const rawToken = (0, personal_student_link_service_1.decryptStudentAccessToken)(existingLink.token_encrypted);
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
                database_1.db.prepare(`
          UPDATE personal_student_access_links
          SET status = 'expired', updated_at = datetime('now')
          WHERE id = ?
        `).run(existingLink.id);
            }
            // Gera novo token aleatório criptograficamente seguro
            const rawToken = (0, personal_student_link_service_1.generateStudentAccessToken)();
            const tokenHash = (0, personal_student_link_service_1.hashStudentAccessToken)(rawToken);
            const tokenEncrypted = (0, personal_student_link_service_1.encryptStudentAccessToken)(rawToken);
            const linkId = 'psl-' + (0, uuid_1.v4)().slice(0, 8);
            database_1.db.prepare(`
        INSERT INTO personal_student_access_links (
          id, tenant_id, student_id, professional_id, token_hash, token_encrypted,
          status, inactivity_days, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'active', 30, datetime('now'), datetime('now'))
      `).run(linkId, tenantId, studentId, professionalId, tokenHash, tokenEncrypted);
            const now = new Date();
            const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
            const origin = req.get('origin') || `${req.protocol}://${req.get('host')}`;
            const linkUrl = `${origin}/treino/${rawToken}`;
            (0, audit_middleware_1.logAudit)(req, 'GENERATE_PERSONAL_STUDENT_LINK', 'personal_student_access_links', linkId, {
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
        }
        catch (err) {
            console.error('[PersonalStudentLinkController.generateOrGetAccessLink] Erro:', err);
            res.status(500).json({ error: 'Erro ao gerar link de acesso do aluno' });
        }
    }
    /**
     * Revoga manualmente o link do aluno
     */
    static async revokeAccessLink(req, res) {
        try {
            if (!(0, personal_controller_1.hasPersonalAccess)(req)) {
                res.status(403).json({ error: 'Acesso não autorizado ao ZemdaPersonal' });
                return;
            }
            const tenantId = req.tenantId;
            const userId = req.user?.userId;
            const { studentId } = req.params;
            if (!studentId) {
                res.status(400).json({ error: 'Identificador do aluno é obrigatório' });
                return;
            }
            const result = database_1.db.prepare(`
        UPDATE personal_student_access_links
        SET status = 'revoked', revoked_at = datetime('now'), revoked_by = ?, updated_at = datetime('now')
        WHERE tenant_id = ? AND student_id = ? AND status = 'active'
      `).run(userId || null, tenantId, studentId);
            if (result.changes === 0) {
                res.status(404).json({ error: 'Nenhum link ativo encontrado para revogação' });
                return;
            }
            (0, audit_middleware_1.logAudit)(req, 'REVOKE_PERSONAL_STUDENT_LINK', 'personal_student_access_links', studentId, {
                student_id: studentId
            });
            res.json({
                success: true,
                message: 'Acesso do aluno revogado com sucesso'
            });
        }
        catch (err) {
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
    static async getPublicWorkout(req, res) {
        try {
            const { token } = req.params;
            if (!token || typeof token !== 'string') {
                res.status(400).json({ error: 'Token de treino inválido' });
                return;
            }
            const tokenHash = (0, personal_student_link_service_1.hashStudentAccessToken)(token);
            const link = database_1.db.prepare(`
        SELECT * FROM personal_student_access_links
        WHERE token_hash = ?
      `).get(tokenHash);
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
            const inactivity = (0, personal_student_link_service_1.evaluateInactivity)(link);
            if (inactivity.isExpired || link.status === 'expired') {
                if (link.status !== 'expired') {
                    database_1.db.prepare(`
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
            database_1.db.prepare(`
        UPDATE personal_student_access_links
        SET last_access_at = datetime('now'), updated_at = datetime('now')
        WHERE id = ?
      `).run(link.id);
            // Busca dados básicos do aluno (apenas o estritamente necessário para treino, sem dados sensíveis)
            const student = database_1.db.prepare(`
        SELECT id, COALESCE(full_name, social_name) as name, gender
        FROM patients
        WHERE id = ? AND tenant_id = ?
      `).get(link.student_id, link.tenant_id);
            if (!student) {
                res.status(404).json({ error: 'Registro do aluno não localizado' });
                return;
            }
            // Nome da academia/clínica para cabeçalho não-administrativo
            const tenant = database_1.db.prepare(`
        SELECT name FROM tenants WHERE id = ?
      `).get(link.tenant_id);
            // Busca os treinos ativos prescritos diretamente do banco
            const workouts = database_1.db.prepare(`
        SELECT id, title, division, structure_type, notes, updated_at
        FROM personal_workouts
        WHERE patient_id = ? AND tenant_id = ? AND is_active = 1
        ORDER BY division ASC, created_at DESC
      `).all(link.student_id, link.tenant_id);
            // Anexa exercícios para cada treino com resolução completa de mídia/GIF/instruções
            for (const w of workouts) {
                const exercises = database_1.db.prepare(`
          SELECT id, workout_id, exercise_id, order_index, name, muscle_group, sets, reps, load_kg,
                 rest_seconds, cadence, tempo, rpe, rir, technique, technique_custom, notes,
                 photo_url, exercise_file_id, instructions, category, duration_seconds, side
          FROM personal_workout_exercises
          WHERE workout_id = ? AND tenant_id = ?
          ORDER BY order_index ASC
        `).all(w.id, link.tenant_id);
                for (const ex of exercises) {
                    const resolved = (0, exercise_media_1.resolveExerciseMediaAndDetails)(database_1.db, ex);
                    Object.assign(ex, resolved);
                }
                w.exercises = exercises;
            }
            // Calcula indicadores rápidos para cabeçalho do aluno (KPIs de progresso)
            const logsCountRow = database_1.db.prepare(`
        SELECT COUNT(*) as count FROM personal_workout_logs
        WHERE patient_id = ? AND tenant_id = ?
      `).get(link.student_id, link.tenant_id);
            const totalWorkoutsCompleted = Number(logsCountRow?.count || 0);
            const studentLogs = database_1.db.prepare(`
        SELECT log_details_json FROM personal_workout_logs
        WHERE patient_id = ? AND tenant_id = ?
      `).all(link.student_id, link.tenant_id);
            const recordsSet = new Set();
            studentLogs.forEach((l) => {
                try {
                    const list = JSON.parse(l.log_details_json);
                    if (Array.isArray(list)) {
                        list.forEach((e) => {
                            if ((0, exercise_media_1.getExerciseMaxCompletedLoad)(e) > 0) {
                                const key = e.exercise_id ? `id:${e.exercise_id}` : `name:${(0, exercise_media_1.normalizeExerciseLookup)(e.name)}`;
                                if (key)
                                    recordsSet.add(key);
                            }
                        });
                    }
                }
                catch { }
            });
            // Verifica se há alguma sessão em andamento iniciada pelo aluno
            const activeSession = database_1.db.prepare(`
        SELECT id, workout_id, started_at, snapshot_workout_json, progress_state_json
        FROM personal_student_sessions
        WHERE tenant_id = ? AND student_id = ? AND status = 'in_progress'
        ORDER BY started_at DESC
        LIMIT 1
      `).get(link.tenant_id, link.student_id);
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
                }
                catch {
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
                activeSession: sessionData,
                summary: {
                    total_workouts_completed: totalWorkoutsCompleted,
                    total_records: recordsSet.size
                }
            });
        }
        catch (err) {
            console.error('[PersonalStudentLinkController.getPublicWorkout] Erro:', err);
            res.status(500).json({ error: 'Erro ao carregar treinos prescritos' });
        }
    }
    /**
     * Inicia a execução do treino pelo aluno
     * Grava started_at e congela snapshot dos exercícios para não corromper caso o personal altere durante a sessão
     */
    static async startSession(req, res) {
        try {
            const token = String(req.params.token || '');
            const { workout_id } = req.body;
            if (!token || !workout_id) {
                res.status(400).json({ error: 'Token e identificador do treino são obrigatórios' });
                return;
            }
            const tokenHash = (0, personal_student_link_service_1.hashStudentAccessToken)(token);
            const link = database_1.db.prepare(`
        SELECT * FROM personal_student_access_links
        WHERE token_hash = ? AND status = 'active'
      `).get(tokenHash);
            if (!link) {
                res.status(403).json({ error: 'Acesso não autorizado ou link inválido' });
                return;
            }
            const inactivity = (0, personal_student_link_service_1.evaluateInactivity)(link);
            if (inactivity.isExpired) {
                res.status(410).json({ error: 'Link expirado por inatividade' });
                return;
            }
            // Valida se o treino pertence ao aluno
            const workout = database_1.db.prepare(`
        SELECT * FROM personal_workouts
        WHERE id = ? AND patient_id = ? AND tenant_id = ? AND is_active = 1
      `).get(workout_id, link.student_id, link.tenant_id);
            if (!workout) {
                res.status(404).json({ error: 'Treino não encontrado ou inativo' });
                return;
            }
            const exercises = database_1.db.prepare(`
        SELECT * FROM personal_workout_exercises
        WHERE workout_id = ? AND tenant_id = ?
        ORDER BY order_index ASC
      `).all(workout_id, link.tenant_id);
            // Se já houver sessão em andamento do mesmo treino, retorna a existente
            const existingSession = database_1.db.prepare(`
        SELECT * FROM personal_student_sessions
        WHERE tenant_id = ? AND student_id = ? AND workout_id = ? AND status = 'in_progress'
        ORDER BY started_at DESC
        LIMIT 1
      `).get(link.tenant_id, link.student_id, workout_id);
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
            database_1.db.prepare(`
        UPDATE personal_student_sessions
        SET status = 'abandoned', updated_at = datetime('now')
        WHERE tenant_id = ? AND student_id = ? AND status = 'in_progress'
      `).run(link.tenant_id, link.student_id);
            const sessionId = 'pss-' + (0, uuid_1.v4)().slice(0, 8);
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
            database_1.db.prepare(`
        INSERT INTO personal_student_sessions (
          id, tenant_id, student_id, workout_id, link_id, status,
          snapshot_workout_json, progress_state_json, started_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'in_progress', ?, ?, ?, datetime('now'), datetime('now'))
      `).run(sessionId, link.tenant_id, link.student_id, workout_id, link.id, JSON.stringify(snapshot), JSON.stringify({}), startedAt);
            res.status(201).json({
                sessionId,
                started_at: startedAt,
                snapshot
            });
        }
        catch (err) {
            console.error('[PersonalStudentLinkController.startSession] Erro:', err);
            res.status(500).json({ error: 'Erro ao iniciar execução de treino' });
        }
    }
    /**
     * Salva progresso intermediário durante a sessão (autosave seguro)
     */
    static async saveProgress(req, res) {
        try {
            const token = String(req.params.token || '');
            const sessionId = String(req.params.sessionId || '');
            const { progress_state } = req.body;
            if (!token || !sessionId) {
                res.status(400).json({ error: 'Parâmetros insuficientes' });
                return;
            }
            const tokenHash = (0, personal_student_link_service_1.hashStudentAccessToken)(token);
            const link = database_1.db.prepare(`
        SELECT student_id, tenant_id FROM personal_student_access_links
        WHERE token_hash = ? AND status = 'active'
      `).get(tokenHash);
            if (!link) {
                res.status(403).json({ error: 'Acesso não autorizado' });
                return;
            }
            database_1.db.prepare(`
        UPDATE personal_student_sessions
        SET progress_state_json = ?, updated_at = datetime('now')
        WHERE id = ? AND student_id = ? AND tenant_id = ? AND status = 'in_progress'
      `).run(JSON.stringify(progress_state || {}), sessionId, link.student_id, link.tenant_id);
            res.json({ success: true });
        }
        catch (err) {
            console.error('[PersonalStudentLinkController.saveProgress] Erro:', err);
            res.status(500).json({ error: 'Erro ao salvar progresso' });
        }
    }
    /**
     * Finaliza o treino executado pelo aluno
     * Alimenta diretamente a tabela personal_workout_logs e o módulo "Execuções & Recordes"
     */
    static async finishSession(req, res) {
        try {
            const token = String(req.params.token || '');
            const sessionId = String(req.params.sessionId || '');
            const { duration_minutes, rpe, feedback_notes, exercises_performed } = req.body;
            if (!token || !sessionId) {
                res.status(400).json({ error: 'Parâmetros insuficientes para finalização' });
                return;
            }
            const tokenHash = (0, personal_student_link_service_1.hashStudentAccessToken)(token);
            const link = database_1.db.prepare(`
        SELECT * FROM personal_student_access_links
        WHERE token_hash = ? AND status = 'active'
      `).get(tokenHash);
            if (!link) {
                res.status(403).json({ error: 'Acesso não autorizado' });
                return;
            }
            const session = database_1.db.prepare(`
        SELECT * FROM personal_student_sessions
        WHERE id = ? AND student_id = ? AND tenant_id = ? AND status = 'in_progress'
      `).get(sessionId, link.student_id, link.tenant_id);
            if (!session) {
                res.status(404).json({ error: 'Sessão de treino não encontrada ou já finalizada' });
                return;
            }
            // Calcula duração real a partir do started_at caso duration_minutes não seja fornecido
            const startedTime = new Date(session.started_at).getTime();
            const nowTime = Date.now();
            const calculatedDuration = Math.max(1, Math.round((nowTime - startedTime) / 60000));
            const finalDuration = duration_minutes ? Number(duration_minutes) : calculatedDuration;
            const logId = 'pwl-' + (0, uuid_1.v4)().slice(0, 8);
            const detailsJson = exercises_performed ? JSON.stringify(exercises_performed) : null;
            const completedAt = new Date().toISOString();
            // Busca o professional_id associado ao treino
            const workout = database_1.db.prepare(`
        SELECT professional_id FROM personal_workouts WHERE id = ?
      `).get(session.workout_id);
            const professionalId = workout?.professional_id || link.professional_id;
            // 1. Grava no histórico oficial existente do ZemdaPersonal (personal_workout_logs)
            database_1.db.prepare(`
        INSERT INTO personal_workout_logs (
          id, tenant_id, workout_id, patient_id, professional_id, appointment_id,
          completed_at, duration_minutes, rpe, feedback_notes, log_details_json, created_at
        ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, datetime('now'))
      `).run(logId, link.tenant_id, session.workout_id, link.student_id, professionalId || null, completedAt, finalDuration, rpe ? Number(rpe) : null, feedback_notes || null, detailsJson);
            // 2. Cálculo e detecção de Recordes Pessoais (PRs - Carga máxima superada estritamente em séries concluídas)
            const newPRs = [];
            if (Array.isArray(exercises_performed)) {
                const priorLogs = database_1.db.prepare(`
          SELECT log_details_json FROM personal_workout_logs
          WHERE patient_id = ? AND tenant_id = ? AND id != ?
        `).all(link.student_id, link.tenant_id, logId);
                const bestPriorLoads = new Map();
                priorLogs.forEach((pl) => {
                    try {
                        const exList = JSON.parse(pl.log_details_json);
                        if (Array.isArray(exList)) {
                            exList.forEach((e) => {
                                const maxLoad = (0, exercise_media_1.getExerciseMaxCompletedLoad)(e);
                                if (maxLoad > 0) {
                                    const norm = (0, exercise_media_1.normalizeExerciseLookup)(e.name);
                                    if (norm) {
                                        const prev = bestPriorLoads.get('name:' + norm) || 0;
                                        if (maxLoad > prev)
                                            bestPriorLoads.set('name:' + norm, maxLoad);
                                    }
                                    if (e.exercise_id) {
                                        const prevId = bestPriorLoads.get('id:' + e.exercise_id) || 0;
                                        if (maxLoad > prevId)
                                            bestPriorLoads.set('id:' + e.exercise_id, maxLoad);
                                    }
                                }
                            });
                        }
                    }
                    catch { }
                });
                exercises_performed.forEach((ex) => {
                    const currentLoad = (0, exercise_media_1.getExerciseMaxCompletedLoad)(ex);
                    if (currentLoad > 0) {
                        const norm = (0, exercise_media_1.normalizeExerciseLookup)(ex.name);
                        const prevByName = norm ? (bestPriorLoads.get('name:' + norm) || 0) : 0;
                        const prevById = ex.exercise_id ? (bestPriorLoads.get('id:' + ex.exercise_id) || 0) : 0;
                        const prevBest = Math.max(prevByName, prevById);
                        if (currentLoad > prevBest) {
                            const diff = prevBest > 0 ? Number((currentLoad - prevBest).toFixed(1)) : currentLoad;
                            newPRs.push({
                                exercise_name: (ex.name || '').trim(),
                                exercise_id: ex.exercise_id || null,
                                previous_max: prevBest,
                                new_pr: currentLoad,
                                evolution_kg: diff
                            });
                            if (norm)
                                bestPriorLoads.set('name:' + norm, currentLoad);
                            if (ex.exercise_id)
                                bestPriorLoads.set('id:' + ex.exercise_id, currentLoad);
                        }
                    }
                });
            }
            // 3. Atualiza a sessão para concluída
            database_1.db.prepare(`
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
                        ? exercises_performed.filter((e) => !e.skipped && (e.sets_completed > 0 || e.sets_done > 0)).length
                        : 0,
                    rpe: rpe ? Number(rpe) : null,
                    feedback_notes: feedback_notes || null
                },
                message: 'Treino finalizado com sucesso e sincronizado com o ZemdaPersonal'
            });
        }
        catch (err) {
            console.error('[PersonalStudentLinkController.finishSession] Erro:', err);
            res.status(500).json({ error: 'Erro ao finalizar treino' });
        }
    }
    /**
     * Consulta pública de Recordes Pessoais do Aluno (Área "Meus Recordes")
     * Resolvido EXCLUSIVAMENTE pelo token seguro do aluno (nunca aceita studentId do frontend)
     */
    static async getPublicRecords(req, res) {
        try {
            const { token } = req.params;
            if (!token || typeof token !== 'string') {
                res.status(400).json({ error: 'Token de treino inválido' });
                return;
            }
            const tokenHash = (0, personal_student_link_service_1.hashStudentAccessToken)(token);
            const link = database_1.db.prepare(`
        SELECT * FROM personal_student_access_links
        WHERE token_hash = ?
      `).get(tokenHash);
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
            const inactivity = (0, personal_student_link_service_1.evaluateInactivity)(link);
            if (inactivity.isExpired || link.status === 'expired') {
                if (link.status !== 'expired') {
                    database_1.db.prepare(`
            UPDATE personal_student_access_links
            SET status = 'expired', updated_at = datetime('now')
            WHERE id = ?
          `).run(link.id);
                }
                res.status(410).json({
                    error: 'Este link expirou por 30 dias consecutivos sem acesso.',
                    code: 'EXPIRED'
                });
                return;
            }
            // Estende a validade do link pelo acesso
            database_1.db.prepare(`
        UPDATE personal_student_access_links
        SET last_access_at = datetime('now'), updated_at = datetime('now')
        WHERE id = ?
      `).run(link.id);
            // Dados do aluno
            const student = database_1.db.prepare(`
        SELECT id, COALESCE(full_name, social_name) as name, gender
        FROM patients
        WHERE id = ? AND tenant_id = ?
      `).get(link.student_id, link.tenant_id);
            if (!student) {
                res.status(404).json({ error: 'Registro do aluno não localizado' });
                return;
            }
            const tenant = database_1.db.prepare(`
        SELECT name FROM tenants WHERE id = ?
      `).get(link.tenant_id);
            // Busca todos os logs concluídos do aluno em ordem cronológica
            const logs = database_1.db.prepare(`
        SELECT id, workout_id, completed_at, duration_minutes, rpe, feedback_notes, log_details_json
        FROM personal_workout_logs
        WHERE patient_id = ? AND tenant_id = ?
        ORDER BY completed_at ASC
      `).all(link.student_id, link.tenant_id);
            const recordsMap = new Map();
            logs.forEach((log) => {
                try {
                    const exList = JSON.parse(log.log_details_json);
                    if (Array.isArray(exList)) {
                        exList.forEach((e) => {
                            const load = (0, exercise_media_1.getExerciseMaxCompletedLoad)(e);
                            if (load <= 0)
                                return;
                            const key = e.exercise_id ? `id:${e.exercise_id}` : `name:${(0, exercise_media_1.normalizeExerciseLookup)(e.name)}`;
                            const displayName = (e.name || '').trim() || 'Exercício';
                            const muscle = e.muscle_group || 'Geral';
                            const setsDone = Array.isArray(e.sets_data)
                                ? e.sets_data.filter((s) => s.completed === true).length
                                : Number(e.sets_completed || 1);
                            const historyItem = {
                                date: log.completed_at,
                                load_kg: load,
                                sets_completed: setsDone,
                                reps: e.reps || ''
                            };
                            if (!recordsMap.has(key)) {
                                recordsMap.set(key, {
                                    exercise_id: e.exercise_id || null,
                                    exercise_name: displayName,
                                    muscle_group: muscle,
                                    best_load: load,
                                    best_load_date: log.completed_at,
                                    initial_load: load,
                                    previous_record: null,
                                    evolution_kg: 0,
                                    execution_count: 1,
                                    history: [historyItem]
                                });
                            }
                            else {
                                const entry = recordsMap.get(key);
                                entry.execution_count++;
                                entry.history.push(historyItem);
                                if (load > entry.best_load) {
                                    entry.previous_record = entry.best_load;
                                    entry.evolution_kg = Number((load - entry.best_load).toFixed(1));
                                    entry.best_load = load;
                                    entry.best_load_date = log.completed_at;
                                }
                            }
                        });
                    }
                }
                catch { }
            });
            // Enriquece os dados com fotos, GIFs e instruções existentes na biblioteca
            const recordsList = Array.from(recordsMap.values()).map(entry => {
                const resolved = (0, exercise_media_1.resolveExerciseMediaAndDetails)(database_1.db, {
                    exercise_id: entry.exercise_id,
                    name: entry.exercise_name,
                    muscle_group: entry.muscle_group
                });
                return {
                    ...entry,
                    exercise_id: resolved.exercise_id || entry.exercise_id,
                    photo_url: resolved.photo_url,
                    gif_url: resolved.gif_url,
                    gif_attribution: resolved.gif_attribution,
                    instructions: resolved.instructions
                };
            });
            // Ordena por data do recorde mais recente
            recordsList.sort((a, b) => new Date(b.best_load_date).getTime() - new Date(a.best_load_date).getTime());
            const recentRecords = recordsList.slice(0, 5);
            res.json({
                student: {
                    name: student.name,
                    gender: student.gender
                },
                clinicName: tenant?.name || 'ZemdaPersonal',
                summary: {
                    total_workouts_completed: logs.length,
                    total_records: recordsList.length,
                    recent_records: recentRecords
                },
                records: recordsList
            });
        }
        catch (err) {
            console.error('[PersonalStudentLinkController.getPublicRecords] Erro:', err);
            res.status(500).json({ error: 'Erro ao consultar recordes do aluno' });
        }
    }
}
exports.PersonalStudentLinkController = PersonalStudentLinkController;
