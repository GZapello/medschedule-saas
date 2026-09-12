import { Request, Response } from 'express';
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { logAudit } from '../middlewares/audit.middleware';

export class InsuranceController {
  // 1. CONVÊNIOS DA CLÍNICA
  static listClinicInsurances(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const insurances = db.prepare(`
        SELECT * FROM clinic_insurances
        WHERE tenant_id = ?
        ORDER BY name ASC
      `).all(tenantId);
      res.json(insurances);
    } catch (err: any) {
      console.error('[InsuranceController.listClinicInsurances] Erro:', err);
      res.status(500).json({ error: 'Erro ao listar convênios da clínica' });
    }
  }

  static createClinicInsurance(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const { name, ansCode, phone, email, notes, planName, cardNumber, validityDate } = req.body;

      if (!name) {
        res.status(400).json({ error: 'Nome do convênio é obrigatório' });
        return;
      }

      const id = 'ins-' + uuidv4().slice(0, 8);
      db.prepare(`
        INSERT INTO clinic_insurances (id, tenant_id, name, ans_code, phone, email, notes, plan_name, card_number, validity_date, active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `).run(id, tenantId, name, ansCode || null, phone || null, email || null, notes || null, planName || null, cardNumber || null, validityDate || null);

      logAudit(req, 'CREATE_CLINIC_INSURANCE', 'clinic_insurances', id, { name, ansCode });
      res.status(201).json({ id, message: 'Convênio cadastrado com sucesso' });
    } catch (err: any) {
      console.error('[InsuranceController.createClinicInsurance] Erro:', err);
      res.status(500).json({ error: 'Erro ao cadastrar convênio' });
    }
  }

  static updateClinicInsurance(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;
      const { name, ansCode, phone, email, notes, planName, cardNumber, validityDate, active } = req.body;

      const existing = db.prepare('SELECT * FROM clinic_insurances WHERE id = ? AND tenant_id = ?').get(id, tenantId) as any;
      if (!existing) {
        res.status(404).json({ error: 'Convênio não encontrado' });
        return;
      }

      const updatedName = name !== undefined ? name : existing.name;
      if (!updatedName) {
        res.status(400).json({ error: 'Nome do convênio é obrigatório' });
        return;
      }

      const updatedAns = ansCode !== undefined ? (ansCode || null) : existing.ans_code;
      const updatedPhone = phone !== undefined ? (phone || null) : existing.phone;
      const updatedEmail = email !== undefined ? (email || null) : existing.email;
      const updatedNotes = notes !== undefined ? (notes || null) : existing.notes;
      const updatedPlan = planName !== undefined ? (planName || null) : existing.plan_name;
      const updatedCard = cardNumber !== undefined ? (cardNumber || null) : existing.card_number;
      const updatedValidity = validityDate !== undefined ? (validityDate || null) : existing.validity_date;
      const updatedActive = active !== undefined ? (active ? 1 : 0) : existing.active;

      db.prepare(`
        UPDATE clinic_insurances SET
          name = ?,
          ans_code = ?,
          phone = ?,
          email = ?,
          notes = ?,
          plan_name = ?,
          card_number = ?,
          validity_date = ?,
          active = ?
        WHERE id = ? AND tenant_id = ?
      `).run(
        updatedName, updatedAns, updatedPhone, updatedEmail, updatedNotes,
        updatedPlan, updatedCard, updatedValidity, updatedActive,
        id, tenantId
      );

      logAudit(req, 'UPDATE_CLINIC_INSURANCE', 'clinic_insurances', id, { name: updatedName, active: updatedActive });
      res.json({ message: 'Convênio atualizado com sucesso' });
    } catch (err: any) {
      console.error('[InsuranceController.updateClinicInsurance] Erro:', err);
      res.status(500).json({ error: 'Erro ao atualizar convênio' });
    }
  }

  // 2. CONVÊNIOS DO PACIENTE
  static listPatientInsurances(req: Request, res: Response): void {
    try {
      const { patientId } = req.params;
      const tenantId = req.tenantId;

      const insurances = db.prepare(`
        SELECT pi.*, ci.name as insurance_name, ci.ans_code
        FROM patient_insurances pi
        JOIN clinic_insurances ci ON ci.id = pi.insurance_id
        WHERE pi.patient_id = ? AND pi.tenant_id = ?
        ORDER BY pi.is_primary DESC, ci.name ASC
      `).all(patientId, tenantId);

      res.json(insurances);
    } catch (err: any) {
      console.error('[InsuranceController.listPatientInsurances] Erro:', err);
      res.status(500).json({ error: 'Erro ao listar convênios do paciente' });
    }
  }

  static addPatientInsurance(req: Request, res: Response): void {
    try {
      const { patientId } = req.params;
      const tenantId = req.tenantId;
      const { insuranceId, cardNumber, planName, validUntil, isPrimary } = req.body;

      if (!insuranceId || !cardNumber) {
        res.status(400).json({ error: 'Convênio e número da carteirinha são obrigatórios' });
        return;
      }

      if (isPrimary) {
        db.prepare('UPDATE patient_insurances SET is_primary = 0 WHERE patient_id = ? AND tenant_id = ?').run(patientId, tenantId);
      }

      const id = 'pins-' + uuidv4().slice(0, 8);
      db.prepare(`
        INSERT INTO patient_insurances (
          id, tenant_id, patient_id, insurance_id, card_number,
          plan_name, valid_until, is_primary, active
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
      `).run(
        id, tenantId, patientId, insuranceId, cardNumber,
        planName || null, validUntil || null, isPrimary ? 1 : 0
      );

      logAudit(req, 'ADD_PATIENT_INSURANCE', 'patient_insurances', id, { patientId, insuranceId });
      res.status(201).json({ id, message: 'Convênio vinculado ao paciente com sucesso' });
    } catch (err: any) {
      console.error('[InsuranceController.addPatientInsurance] Erro:', err);
      res.status(500).json({ error: 'Erro ao vincular convênio ao paciente' });
    }
  }

  static deletePatientInsurance(req: Request, res: Response): void {
    try {
      const { patientId, id } = req.params;
      const tenantId = req.tenantId;

      db.prepare('DELETE FROM patient_insurances WHERE id = ? AND patient_id = ? AND tenant_id = ?').run(id, patientId, tenantId);
      logAudit(req, 'DELETE_PATIENT_INSURANCE', 'patient_insurances', id, { patientId });
      res.json({ message: 'Convênio do paciente desvinculado com sucesso' });
    } catch (err: any) {
      console.error('[InsuranceController.deletePatientInsurance] Erro:', err);
      res.status(500).json({ error: 'Erro ao desvincular convênio' });
    }
  }

  // 3. RELATÓRIO DE ATENDIMENTOS POR CONVÊNIO
  static getInsuranceReport(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const { startDate, endDate } = req.query;

      let query = `
        SELECT 
          COALESCE(ci.name, 'Particular') as insurance_name,
          COUNT(a.id) as total_appointments,
          COUNT(CASE WHEN a.status = 'completed' THEN 1 END) as completed_appointments,
          COUNT(CASE WHEN a.status = 'cancelled' THEN 1 END) as cancelled_appointments
        FROM appointments a
        LEFT JOIN clinic_insurances ci ON ci.id = a.insurance_id
        WHERE a.tenant_id = ?
      `;
      const params: any[] = [tenantId];

      if (startDate) {
        query += ' AND a.start_time >= ?';
        params.push(startDate);
      }
      if (endDate) {
        query += ' AND a.start_time <= ?';
        params.push(endDate);
      }

      query += ' GROUP BY COALESCE(ci.name, "Particular") ORDER BY total_appointments DESC';

      const report = db.prepare(query).all(...params);
      res.json(report);
    } catch (err: any) {
      console.error('[InsuranceController.getInsuranceReport] Erro:', err);
      res.status(500).json({ error: 'Erro ao emitir relatório de convênios' });
    }
  }
}
