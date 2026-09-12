import { Request, Response } from 'express';
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { hashPassword } from '../utils/password';
import { logAudit } from '../middlewares/audit.middleware';

export class ProfessionalController {
  static list(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: 'Tenant não informado' });
        return;
      }

      const stmt = db.prepare(`
        SELECT 
          p.id, p.tenant_id, p.user_id, p.name, p.photo_url, p.profession_id, p.specialty_id,
          p.registration_type, p.registration_number, p.bio, p.practice_areas, p.buffer_minutes, p.active,
          u.email, u.phone,
          spec.name as specialty_name, spec.color as specialty_color,
          prof.name as profession_name
        FROM professionals p
        LEFT JOIN users u ON u.id = p.user_id
        LEFT JOIN specialties spec ON spec.id = p.specialty_id
        LEFT JOIN professions prof ON prof.id = p.profession_id
        WHERE p.tenant_id = ?
        ORDER BY p.name ASC
      `);
      const professionals = stmt.all(tenantId);
      res.json(professionals);
    } catch (err: any) {
      console.error('[ProfessionalController.list] Erro:', err);
      res.status(500).json({ error: 'Erro ao listar profissionais' });
    }
  }

  static getById(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;

      const stmt = db.prepare(`
        SELECT 
          p.id, p.tenant_id, p.user_id, p.name, p.photo_url, p.profession_id, p.specialty_id,
          p.registration_type, p.registration_number, p.bio, p.practice_areas, p.buffer_minutes, p.active,
          u.email, u.phone,
          spec.name as specialty_name,
          prof.name as profession_name
        FROM professionals p
        LEFT JOIN users u ON u.id = p.user_id
        LEFT JOIN specialties spec ON spec.id = p.specialty_id
        LEFT JOIN professions prof ON prof.id = p.profession_id
        WHERE p.id = ? AND p.tenant_id = ?
      `);
      const professional = stmt.get(id, tenantId);

      if (!professional) {
        res.status(404).json({ error: 'Profissional não encontrado' });
        return;
      }

      // Busca grade de horários
      const schedStmt = db.prepare(`
        SELECT id, day_of_week, start_time, end_time, break_start, break_end, is_active
        FROM schedules
        WHERE professional_id = ? AND tenant_id = ?
        ORDER BY day_of_week ASC
      `);
      const schedules = schedStmt.all(id, tenantId);

      // Busca bloqueios futuros
      const blockStmt = db.prepare(`
        SELECT id, title, start_datetime, end_datetime, reason, type
        FROM blocked_times
        WHERE professional_id = ? AND tenant_id = ? AND end_datetime >= datetime('now')
        ORDER BY start_datetime ASC
      `);
      const blockedTimes = blockStmt.all(id, tenantId);

      res.json({
        professional,
        schedules,
        blockedTimes
      });
    } catch (err: any) {
      console.error('[ProfessionalController.getById] Erro:', err);
      res.status(500).json({ error: 'Erro ao buscar detalhes do profissional' });
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: 'Tenant não informado' });
        return;
      }

      const {
        name, email, password, phone, professionId, specialtyId,
        registrationType, registrationNumber, bio, practiceAreas, bufferMinutes, photoUrl, gender
      } = req.body;

      if (!name || !email) {
        res.status(400).json({ error: 'Nome e e-mail são obrigatórios' });
        return;
      }

      // Verifica ou cria usuário
      let userId: string;
      const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email.trim().toLowerCase()) as { id: string } | undefined;

      if (existingUser) {
        userId = existingUser.id;
      } else {
        userId = uuidv4();
        const pwdHash = await hashPassword(password || '123456');
        const insertUser = db.prepare(`
          INSERT INTO users (id, tenant_id, name, email, password_hash, role, phone, status)
          VALUES (?, ?, ?, ?, ?, 'professional', ?, 'active')
        `);
        insertUser.run(userId, tenantId, name, email.trim().toLowerCase(), pwdHash, phone || null);
      }

      const profId = 'pro-' + uuidv4().slice(0, 8);
      const insertProf = db.prepare(`
        INSERT INTO professionals (
          id, tenant_id, user_id, name, photo_url, profession_id, specialty_id,
          registration_type, registration_number, bio, practice_areas, buffer_minutes, gender, active
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `);

      insertProf.run(
        profId,
        tenantId,
        userId,
        name,
        photoUrl || null,
        professionId || null,
        specialtyId || null,
        registrationType || null,
        registrationNumber || null,
        bio || null,
        practiceAreas || null,
        bufferMinutes || 10,
        gender === 'F' ? 'F' : 'M'
      );

      // Cria grade de horários padrão de segunda a sexta
      const insertSched = db.prepare(`
        INSERT INTO schedules (id, tenant_id, professional_id, day_of_week, start_time, end_time, break_start, break_end, is_active)
        VALUES (?, ?, ?, ?, '08:00', '18:00', '12:00', '13:30', 1)
      `);
      for (let day = 1; day <= 5; day++) {
        insertSched.run(`sch-${uuidv4().slice(0, 8)}`, tenantId, profId, day);
      }

      logAudit(req, 'CREATE_PROFESSIONAL', 'professionals', profId, { name, email });
      res.status(201).json({ id: profId, name, message: 'Profissional cadastrado com sucesso' });
    } catch (err: any) {
      console.error('[ProfessionalController.create] Erro:', err);
      res.status(500).json({ error: 'Erro ao cadastrar profissional' });
    }
  }

  static update(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;
      const {
        name, professionId, specialtyId, registrationType, registrationNumber,
        bio, practiceAreas, bufferMinutes, photoUrl, gender, active
      } = req.body;

      const updateStmt = db.prepare(`
        UPDATE professionals SET
          name = COALESCE(?, name),
          profession_id = COALESCE(?, profession_id),
          specialty_id = COALESCE(?, specialty_id),
          registration_type = COALESCE(?, registration_type),
          registration_number = COALESCE(?, registration_number),
          bio = COALESCE(?, bio),
          practice_areas = COALESCE(?, practice_areas),
          buffer_minutes = COALESCE(?, buffer_minutes),
          photo_url = COALESCE(?, photo_url),
          gender = COALESCE(?, gender),
          active = COALESCE(?, active),
          updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ?
      `);

      updateStmt.run(
        name || null,
        professionId || null,
        specialtyId || null,
        registrationType || null,
        registrationNumber || null,
        bio || null,
        practiceAreas || null,
        bufferMinutes !== undefined ? Number(bufferMinutes) : null,
        photoUrl || null,
        gender || null,
        active !== undefined ? (active ? 1 : 0) : null,
        id,
        tenantId
      );

      logAudit(req, 'UPDATE_PROFESSIONAL', 'professionals', id);
      res.json({ message: 'Profissional atualizado com sucesso' });
    } catch (err: any) {
      console.error('[ProfessionalController.update] Erro:', err);
      res.status(500).json({ error: 'Erro ao atualizar profissional' });
    }
  }

  static updateSchedules(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;
      const { schedules } = req.body; // Array de { day_of_week, start_time, end_time, break_start, break_end, is_active }

      if (!Array.isArray(schedules)) {
        res.status(400).json({ error: 'Array de horários (schedules) é obrigatório' });
        return;
      }

      // Remove horários existentes
      db.prepare('DELETE FROM schedules WHERE professional_id = ? AND tenant_id = ?').run(id, tenantId);

      // Insere novos
      const insertStmt = db.prepare(`
        INSERT INTO schedules (id, tenant_id, professional_id, day_of_week, start_time, end_time, break_start, break_end, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const s of schedules) {
        insertStmt.run(
          `sch-${uuidv4().slice(0, 8)}`,
          tenantId,
          id,
          s.day_of_week,
          s.start_time || '08:00',
          s.end_time || '18:00',
          s.break_start || null,
          s.break_end || null,
          s.is_active ? 1 : 0
        );
      }

      logAudit(req, 'UPDATE_SCHEDULES', 'schedules', id);
      res.json({ message: 'Grade de horários atualizada com sucesso' });
    } catch (err: any) {
      console.error('[ProfessionalController.updateSchedules] Erro:', err);
      res.status(500).json({ error: 'Erro ao atualizar horários' });
    }
  }

  static createBlockedTime(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const { professionalId, roomId, title, startDatetime, endDatetime, reason, type } = req.body;

      if (!title || !startDatetime || !endDatetime) {
        res.status(400).json({ error: 'Título, data/hora inicial e final são obrigatórios' });
        return;
      }

      const id = 'blk-' + uuidv4().slice(0, 8);
      const insertStmt = db.prepare(`
        INSERT INTO blocked_times (id, tenant_id, professional_id, room_id, title, start_datetime, end_datetime, reason, type)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      insertStmt.run(
        id,
        tenantId,
        professionalId || null,
        roomId || null,
        title,
        startDatetime,
        endDatetime,
        reason || null,
        type || 'absence'
      );

      logAudit(req, 'CREATE_BLOCKED_TIME', 'blocked_times', id, { title, startDatetime, endDatetime });
      res.status(201).json({ id, message: 'Bloqueio de horário registrado com sucesso' });
    } catch (err: any) {
      console.error('[ProfessionalController.createBlockedTime] Erro:', err);
      res.status(500).json({ error: 'Erro ao criar bloqueio' });
    }
  }

  static deleteBlockedTime(req: Request, res: Response): void {
    try {
      const { blockId } = req.params;
      const tenantId = req.tenantId;

      db.prepare('DELETE FROM blocked_times WHERE id = ? AND tenant_id = ?').run(blockId, tenantId);
      logAudit(req, 'DELETE_BLOCKED_TIME', 'blocked_times', blockId);
      res.json({ message: 'Bloqueio removido com sucesso' });
    } catch (err: any) {
      console.error('[ProfessionalController.deleteBlockedTime] Erro:', err);
      res.status(500).json({ error: 'Erro ao remover bloqueio' });
    }
  }
}
