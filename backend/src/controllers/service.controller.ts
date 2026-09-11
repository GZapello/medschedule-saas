import { Request, Response } from 'express';
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { logAudit } from '../middlewares/audit.middleware';

export class ServiceController {
  static list(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: 'Tenant não informado' });
        return;
      }

      const stmt = db.prepare(`
        SELECT 
          s.id, s.tenant_id, s.specialty_id, s.name, s.description,
          s.duration_minutes, s.buffer_minutes, s.price, s.modality, s.active,
          s.min_lead_time_hours, s.max_advance_days, s.cancellation_policy,
          spec.name as specialty_name, spec.color as specialty_color
        FROM services s
        LEFT JOIN specialties spec ON spec.id = s.specialty_id
        WHERE s.tenant_id = ?
        ORDER BY s.name ASC
      `);
      const services = stmt.all(tenantId);
      res.json(services);
    } catch (err: any) {
      console.error('[ServiceController.list] Erro:', err);
      res.status(500).json({ error: 'Erro ao listar serviços' });
    }
  }

  static create(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: 'Tenant não informado' });
        return;
      }

      const {
        specialtyId, name, description, durationMinutes, bufferMinutes,
        price, modality, minLeadTimeHours, maxAdvanceDays, cancellationPolicy
      } = req.body;

      if (!name) {
        res.status(400).json({ error: 'Nome do serviço é obrigatório' });
        return;
      }

      const id = 'srv-' + uuidv4().slice(0, 8);
      const insertStmt = db.prepare(`
        INSERT INTO services (
          id, tenant_id, specialty_id, name, description, duration_minutes,
          buffer_minutes, price, modality, active, min_lead_time_hours, max_advance_days, cancellation_policy
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
      `);

      insertStmt.run(
        id,
        tenantId,
        specialtyId || null,
        name,
        description || null,
        durationMinutes || 50,
        bufferMinutes || 10,
        price || 0.0,
        modality || 'both',
        minLeadTimeHours || 2,
        maxAdvanceDays || 60,
        cancellationPolicy || null
      );

      logAudit(req, 'CREATE_SERVICE', 'services', id, { name, price });
      res.status(201).json({ id, name, message: 'Serviço criado com sucesso' });
    } catch (err: any) {
      console.error('[ServiceController.create] Erro:', err);
      res.status(500).json({ error: 'Erro ao criar serviço' });
    }
  }

  static update(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;
      const {
        specialtyId, name, description, durationMinutes, bufferMinutes,
        price, modality, active, minLeadTimeHours, maxAdvanceDays, cancellationPolicy
      } = req.body;

      const updateStmt = db.prepare(`
        UPDATE services SET
          specialty_id = COALESCE(?, specialty_id),
          name = COALESCE(?, name),
          description = COALESCE(?, description),
          duration_minutes = COALESCE(?, duration_minutes),
          buffer_minutes = COALESCE(?, buffer_minutes),
          price = COALESCE(?, price),
          modality = COALESCE(?, modality),
          active = COALESCE(?, active),
          min_lead_time_hours = COALESCE(?, min_lead_time_hours),
          max_advance_days = COALESCE(?, max_advance_days),
          cancellation_policy = COALESCE(?, cancellation_policy),
          updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ?
      `);

      updateStmt.run(
        specialtyId || null,
        name || null,
        description || null,
        durationMinutes !== undefined ? durationMinutes : null,
        bufferMinutes !== undefined ? bufferMinutes : null,
        price !== undefined ? price : null,
        modality || null,
        active !== undefined ? (active ? 1 : 0) : null,
        minLeadTimeHours !== undefined ? minLeadTimeHours : null,
        maxAdvanceDays !== undefined ? maxAdvanceDays : null,
        cancellationPolicy || null,
        id,
        tenantId
      );

      logAudit(req, 'UPDATE_SERVICE', 'services', id);
      res.json({ message: 'Serviço atualizado com sucesso' });
    } catch (err: any) {
      console.error('[ServiceController.update] Erro:', err);
      res.status(500).json({ error: 'Erro ao atualizar serviço' });
    }
  }

  // Salas
  static listRooms(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const stmt = db.prepare('SELECT id, name, description, active FROM rooms WHERE tenant_id = ? ORDER BY name ASC');
      const rooms = stmt.all(tenantId);
      res.json(rooms);
    } catch (err: any) {
      console.error('[ServiceController.listRooms] Erro:', err);
      res.status(500).json({ error: 'Erro ao listar salas' });
    }
  }

  static createRoom(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const { name, description } = req.body;
      if (!name) {
        res.status(400).json({ error: 'Nome da sala é obrigatório' });
        return;
      }

      const id = 'room-' + uuidv4().slice(0, 8);
      const insertStmt = db.prepare('INSERT INTO rooms (id, tenant_id, name, description, active) VALUES (?, ?, ?, ?, 1)');
      insertStmt.run(id, tenantId, name, description || null);

      res.status(201).json({ id, name, message: 'Sala cadastrada com sucesso' });
    } catch (err: any) {
      console.error('[ServiceController.createRoom] Erro:', err);
      res.status(500).json({ error: 'Erro ao cadastrar sala' });
    }
  }
}
