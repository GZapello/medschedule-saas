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
      if (!tenantId) {
        res.status(400).json({ error: 'Tenant não informado' });
        return;
      }

      const existing = db.prepare('SELECT id, name FROM services WHERE id = ? AND tenant_id = ?').get(id, tenantId) as any;
      if (!existing) {
        res.status(404).json({ error: 'Serviço não encontrado' });
        return;
      }

      const {
        specialtyId, name, description, durationMinutes, bufferMinutes,
        price, modality, active, minLeadTimeHours, maxAdvanceDays, cancellationPolicy
      } = req.body;

      const updateStmt = db.prepare(`
        UPDATE services SET
          specialty_id = CASE WHEN ? = 1 THEN ? ELSE specialty_id END,
          name = CASE WHEN ? = 1 THEN ? ELSE name END,
          description = CASE WHEN ? = 1 THEN ? ELSE description END,
          duration_minutes = CASE WHEN ? = 1 THEN ? ELSE duration_minutes END,
          buffer_minutes = CASE WHEN ? = 1 THEN ? ELSE buffer_minutes END,
          price = CASE WHEN ? = 1 THEN ? ELSE price END,
          modality = CASE WHEN ? = 1 THEN ? ELSE modality END,
          active = CASE WHEN ? = 1 THEN ? ELSE active END,
          min_lead_time_hours = CASE WHEN ? = 1 THEN ? ELSE min_lead_time_hours END,
          max_advance_days = CASE WHEN ? = 1 THEN ? ELSE max_advance_days END,
          cancellation_policy = CASE WHEN ? = 1 THEN ? ELSE cancellation_policy END,
          updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ?
      `);

      updateStmt.run(
        specialtyId !== undefined ? 1 : 0, specialtyId || null,
        name !== undefined ? 1 : 0, name ? name.trim() : existing.name,
        description !== undefined ? 1 : 0, description !== null ? description : null,
        durationMinutes !== undefined ? 1 : 0, durationMinutes !== undefined ? Number(durationMinutes) : 50,
        bufferMinutes !== undefined ? 1 : 0, bufferMinutes !== undefined ? Number(bufferMinutes) : 10,
        price !== undefined ? 1 : 0, price !== undefined ? Number(price) : 0,
        modality !== undefined ? 1 : 0, modality || 'both',
        active !== undefined ? 1 : 0, active ? 1 : 0,
        minLeadTimeHours !== undefined ? 1 : 0, minLeadTimeHours !== undefined ? Number(minLeadTimeHours) : 2,
        maxAdvanceDays !== undefined ? 1 : 0, maxAdvanceDays !== undefined ? Number(maxAdvanceDays) : 60,
        cancellationPolicy !== undefined ? 1 : 0, cancellationPolicy || null,
        id,
        tenantId
      );

      logAudit(req, 'UPDATE_SERVICE', 'services', id, { name: name || existing.name });
      res.json({ success: true, message: 'Serviço atualizado com sucesso' });
    } catch (err: any) {
      console.error('[ServiceController.update] Erro:', err);
      res.status(500).json({ error: 'Erro ao atualizar serviço' });
    }
  }

  static delete(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: 'Tenant não informado' });
        return;
      }

      const service = db.prepare('SELECT id, name, active FROM services WHERE id = ? AND tenant_id = ?').get(id, tenantId) as any;
      if (!service) {
        res.status(404).json({ error: 'Serviço não encontrado' });
        return;
      }

      // Verificação de vínculos históricos antes de excluir:
      // 1. Agendamentos
      const appointmentCount = (db.prepare('SELECT COUNT(*) as count FROM appointments WHERE service_id = ? AND tenant_id = ?').get(id, tenantId) as any)?.count || 0;

      // 2. Atendimentos (consultas realizadas/em andamento ou com prontuário clínico gerado)
      const consultationCount = (db.prepare(`
        SELECT COUNT(*) as count 
        FROM appointments a
        WHERE a.service_id = ? AND a.tenant_id = ? 
          AND (a.status IN ('completed', 'in_progress') OR EXISTS (SELECT 1 FROM records r WHERE r.appointment_id = a.id))
      `).get(id, tenantId) as any)?.count || 0;

      // 3. Financeiro (pagamentos ou recibos emitidos vinculados ao serviço)
      const financialCount = (db.prepare(`
        SELECT COUNT(*) as count 
        FROM appointments a
        WHERE a.service_id = ? AND a.tenant_id = ? 
          AND (
            EXISTS (SELECT 1 FROM payments p WHERE p.appointment_id = a.id) OR 
            EXISTS (SELECT 1 FROM receipts rec WHERE rec.appointment_id = a.id)
          )
      `).get(id, tenantId) as any)?.count || 0;

      // 4. Histórico (encaminhamentos ou outros registros vinculados)
      let referralCount = 0;
      const hasReferralsTable = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='patient_referrals'").get();
      if (hasReferralsTable) {
        referralCount = (db.prepare('SELECT COUNT(*) as count FROM patient_referrals WHERE service_id = ? AND tenant_id = ?').get(id, tenantId) as any)?.count || 0;
      }

      const hasHistoricalLinks = appointmentCount > 0 || consultationCount > 0 || financialCount > 0 || referralCount > 0;

      if (hasHistoricalLinks) {
        // Se houver vínculo histórico, evitar exclusão destrutiva e preferir desativação/inativação, preservando registros antigos
        db.prepare("UPDATE services SET active = 0, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?").run(id, tenantId);

        logAudit(req, 'INACTIVATE_SERVICE', 'services', id, {
          name: service.name,
          reason: 'historical_links',
          appointmentCount,
          consultationCount,
          financialCount,
          referralCount
        });

        res.json({
          success: true,
          action: 'inactivated',
          message: 'O serviço possui vínculos históricos (agendamentos, atendimentos ou registros financeiros) e foi inativado para preservar os dados.',
          service: { id: service.id, name: service.name, active: 0 }
        });
        return;
      }

      // Se NÃO houver vínculos históricos, executar exclusão segura
      db.prepare('DELETE FROM professional_services WHERE service_id = ?').run(id);
      db.prepare('DELETE FROM services WHERE id = ? AND tenant_id = ?').run(id, tenantId);

      logAudit(req, 'DELETE_SERVICE', 'services', id, { name: service.name });

      res.json({
        success: true,
        action: 'deleted',
        message: 'Serviço excluído com sucesso.'
      });
    } catch (err: any) {
      console.error('[ServiceController.delete] Erro:', err);
      res.status(500).json({ error: 'Erro ao processar exclusão do serviço' });
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
