import { Request, Response } from 'express';
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { logAudit } from '../middlewares/audit.middleware';
import { validateAndFormatBrazilianPhone } from '../utils/phone-validator';

export class PatientController {
  static list(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: 'Tenant não informado' });
        return;
      }

      const { search } = req.query;
      let query = `
        SELECT 
          p.id, p.tenant_id, p.full_name, p.social_name, p.birth_date, p.cpf, p.gender,
          p.email, p.phone, p.whatsapp, p.city, p.state, p.is_child, p.active, p.created_at,
          (SELECT COUNT(*) FROM appointments WHERE patient_id = p.id) as total_appointments,
          (SELECT COUNT(*) FROM records WHERE patient_id = p.id) as total_records
        FROM patients p
        WHERE p.tenant_id = ?
      `;
      const params: any[] = [tenantId];

      if (search && typeof search === 'string' && search.trim().length > 0) {
        const term = `%${search.trim()}%`;
        query += ` AND (p.full_name LIKE ? OR p.cpf LIKE ? OR p.phone LIKE ? OR p.email LIKE ?)`;
        params.push(term, term, term, term);
      }

      query += ' ORDER BY p.full_name ASC';

      const stmt = db.prepare(query);
      const patients = stmt.all(...params);
      res.json(patients);
    } catch (err: any) {
      console.error('[PatientController.list] Erro:', err);
      res.status(500).json({ error: 'Erro ao listar pacientes/clientes' });
    }
  }

  static getById(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;

      const stmt = db.prepare(`
        SELECT 
          id, tenant_id, full_name, social_name, birth_date, cpf, gender, email, phone, whatsapp,
          address, city, state, zip_code, photo_url, emergency_contact, emergency_phone,
          notes_admin, is_child, pet_metadata_json, active, allergies_status,
          health_insurance_provider, health_insurance_card, health_insurance_plan,
          created_at, updated_at
        FROM patients
        WHERE id = ? AND tenant_id = ?
      `);
      const patient = stmt.get(id, tenantId) as any;

      if (!patient) {
        const otherTenantCheck = db.prepare('SELECT tenant_id FROM patients WHERE id = ?').get(id) as { tenant_id: string } | undefined;
        if (otherTenantCheck && otherTenantCheck.tenant_id !== tenantId) {
          res.status(403).json({ error: 'Acesso negado: este paciente pertence a outra clínica', code: 'FORBIDDEN_IDOR' });
          return;
        }
        res.status(404).json({ error: 'Paciente não encontrado' });
        return;
      }

      // Se for criança ou menor, busca os responsáveis legais
      let guardians: any[] = [];
      if (patient.is_child) {
        const grdStmt = db.prepare(`
          SELECT id, full_name, relationship, cpf, phone, email, is_primary, authorization_signed
          FROM guardians
          WHERE patient_id = ? AND tenant_id = ?
          ORDER BY is_primary DESC, full_name ASC
        `);
        guardians = grdStmt.all(id, tenantId);
      }

      // Histórico recente de agendamentos
      const apptStmt = db.prepare(`
        SELECT 
          a.id, a.appointment_number, a.start_time, a.end_time, a.status, a.modality,
          p.name as professional_name, s.name as service_name
        FROM appointments a
        JOIN professionals p ON p.id = a.professional_id
        JOIN services s ON s.id = a.service_id
        WHERE a.patient_id = ? AND a.tenant_id = ?
        ORDER BY a.start_time DESC
        LIMIT 10
      `);
      const recentAppointments = apptStmt.all(id, tenantId);

      res.json({
        patient,
        guardians,
        recentAppointments
      });
    } catch (err: any) {
      console.error('[PatientController.getById] Erro:', err);
      res.status(500).json({ error: 'Erro ao buscar detalhes do paciente' });
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
        fullName, socialName, birthDate, cpf, gender, email, phone, whatsapp,
        address, city, state, zipCode, photoUrl, emergencyContact, emergencyPhone,
        notesAdmin, isChild, petMetadata, guardians
      } = req.body;

      const effectiveFullName = String(fullName || req.body.name || '').trim();
      const rawPhone = String(phone || req.body.telephone || '').trim();

      if (!effectiveFullName) {
        res.status(400).json({ error: 'Nome completo é obrigatório' });
        return;
      }

      const phoneValidation = validateAndFormatBrazilianPhone(rawPhone, true);
      if (!phoneValidation.isValid) {
        res.status(400).json({ error: phoneValidation.error || 'Telefone brasileiro inválido (verifique o DDD e a quantidade de dígitos)' });
        return;
      }
      const effectivePhone = phoneValidation.formatted!;

      let effectiveWhatsapp = effectivePhone;
      if (whatsapp && String(whatsapp).trim() !== rawPhone) {
        const wppVal = validateAndFormatBrazilianPhone(whatsapp, false);
        if (!wppVal.isValid) {
          res.status(400).json({ error: wppVal.error || 'WhatsApp inválido' });
          return;
        }
        effectiveWhatsapp = wppVal.formatted || effectivePhone;
      }

      let effectiveEmergencyPhone = null;
      if (emergencyPhone) {
        const emVal = validateAndFormatBrazilianPhone(emergencyPhone, false);
        if (!emVal.isValid) {
          res.status(400).json({ error: emVal.error || 'Telefone de emergência inválido' });
          return;
        }
        effectiveEmergencyPhone = emVal.formatted || null;
      }

      const patientId = 'pat-' + uuidv4().slice(0, 8);
      const insertStmt = db.prepare(`
        INSERT INTO patients (
          id, tenant_id, full_name, social_name, birth_date, cpf, gender, email, phone, whatsapp,
          address, city, state, zip_code, photo_url, emergency_contact, emergency_phone,
          notes_admin, is_child, pet_metadata_json, active
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `);

      insertStmt.run(
        patientId,
        tenantId,
        effectiveFullName,
        socialName || null,
        birthDate || null,
        cpf || null,
        gender || req.body.sex || null,
        email || null,
        effectivePhone,
        effectiveWhatsapp,
        address || null,
        city || null,
        state || null,
        zipCode || null,
        photoUrl || null,
        emergencyContact || null,
        effectiveEmergencyPhone,
        notesAdmin || null,
        isChild ? 1 : 0,
        petMetadata ? JSON.stringify(petMetadata) : null
      );

      // Cadastra responsáveis legais se fornecidos (para atendimento infantil)
      if (isChild && Array.isArray(guardians)) {
        const insertGrd = db.prepare(`
          INSERT INTO guardians (id, tenant_id, patient_id, full_name, relationship, cpf, phone, email, is_primary, authorization_signed)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const g of guardians) {
          if (g.fullName && g.phone) {
            insertGrd.run(
              'grd-' + uuidv4().slice(0, 8),
              tenantId,
              patientId,
              g.fullName,
              g.relationship || 'mother',
              g.cpf || null,
              g.phone,
              g.email || null,
              g.isPrimary ? 1 : 0,
              g.authorizationSigned ? 1 : 1
            );
          }
        }
      }

      logAudit(req, 'CREATE_PATIENT', 'patients', patientId, { fullName, phone, isChild });
      res.status(201).json({ id: patientId, fullName, message: 'Paciente/Cliente cadastrado com sucesso' });
    } catch (err: any) {
      console.error('[PatientController.create] Erro:', err);
      res.status(500).json({ error: 'Erro ao cadastrar paciente' });
    }
  }

  static update(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;
      const {
        fullName, socialName, birthDate, cpf, gender, email, phone, whatsapp,
        address, city, state, zipCode, photoUrl, emergencyContact, emergencyPhone,
        notesAdmin, notes, clinicalNotes, importantAlert, isChild, active,
        healthInsuranceProvider, healthInsuranceCard, healthInsurancePlan,
        guardians
      } = req.body;

      const effectiveFullName = fullName !== undefined ? (fullName ? String(fullName).trim() : null) : (req.body.name !== undefined ? (req.body.name ? String(req.body.name).trim() : null) : null);
      const effectivePhoto = photoUrl !== undefined ? photoUrl : (req.body.avatar_url !== undefined ? req.body.avatar_url : null);
      const effectiveGender = gender !== undefined ? gender : (req.body.sex !== undefined ? req.body.sex : null);

      let effectivePhoneToUpdate = undefined;
      if (phone !== undefined) {
        const pVal = validateAndFormatBrazilianPhone(phone, true);
        if (!pVal.isValid) {
          res.status(400).json({ error: pVal.error || 'Telefone brasileiro inválido' });
          return;
        }
        effectivePhoneToUpdate = pVal.formatted;
      }

      let effectiveWhatsappToUpdate = undefined;
      if (whatsapp !== undefined) {
        if (whatsapp) {
          const wVal = validateAndFormatBrazilianPhone(whatsapp, false);
          if (!wVal.isValid) {
            res.status(400).json({ error: wVal.error || 'WhatsApp inválido' });
            return;
          }
          effectiveWhatsappToUpdate = wVal.formatted;
        } else {
          effectiveWhatsappToUpdate = null;
        }
      }

      let effectiveEmergencyPhoneToUpdate = undefined;
      if (emergencyPhone !== undefined) {
        if (emergencyPhone) {
          const eVal = validateAndFormatBrazilianPhone(emergencyPhone, false);
          if (!eVal.isValid) {
            res.status(400).json({ error: eVal.error || 'Telefone de emergência inválido' });
            return;
          }
          effectiveEmergencyPhoneToUpdate = eVal.formatted;
        } else {
          effectiveEmergencyPhoneToUpdate = null;
        }
      }

      const updateStmt = db.prepare(`
        UPDATE patients SET
          full_name = COALESCE(?, full_name),
          social_name = COALESCE(?, social_name),
          birth_date = COALESCE(?, birth_date),
          cpf = COALESCE(?, cpf),
          gender = COALESCE(?, gender),
          email = COALESCE(?, email),
          phone = COALESCE(?, phone),
          whatsapp = COALESCE(?, whatsapp),
          address = COALESCE(?, address),
          city = COALESCE(?, city),
          state = COALESCE(?, state),
          zip_code = COALESCE(?, zip_code),
          photo_url = COALESCE(?, photo_url),
          emergency_contact = COALESCE(?, emergency_contact),
          emergency_phone = COALESCE(?, emergency_phone),
          notes_admin = COALESCE(?, notes_admin),
          notes = COALESCE(?, notes),
          clinical_notes = COALESCE(?, clinical_notes),
          important_alert = COALESCE(?, important_alert),
          is_child = COALESCE(?, is_child),
          active = COALESCE(?, active),
          health_insurance_provider = COALESCE(?, health_insurance_provider),
          health_insurance_card = COALESCE(?, health_insurance_card),
          health_insurance_plan = COALESCE(?, health_insurance_plan),
          updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ?
      `);

      updateStmt.run(
        effectiveFullName || null,
        socialName || null,
        birthDate || null,
        cpf || null,
        effectiveGender || null,
        email || null,
        effectivePhoneToUpdate !== undefined ? effectivePhoneToUpdate : null,
        effectiveWhatsappToUpdate !== undefined ? effectiveWhatsappToUpdate : null,
        address || null,
        city || null,
        state || null,
        zipCode || null,
        effectivePhoto || null,
        emergencyContact || null,
        effectiveEmergencyPhoneToUpdate !== undefined ? effectiveEmergencyPhoneToUpdate : null,
        notesAdmin !== undefined ? notesAdmin : null,
        notes !== undefined ? notes : null,
        clinicalNotes !== undefined ? clinicalNotes : null,
        importantAlert !== undefined ? importantAlert : null,
        isChild !== undefined ? (isChild ? 1 : 0) : null,
        active !== undefined ? (active ? 1 : 0) : null,
        healthInsuranceProvider !== undefined ? healthInsuranceProvider : null,
        healthInsuranceCard !== undefined ? healthInsuranceCard : null,
        healthInsurancePlan !== undefined ? healthInsurancePlan : null,
        id,
        tenantId
      );

      // Atualiza responsáveis se informados
      if (Array.isArray(guardians)) {
        db.prepare('DELETE FROM guardians WHERE patient_id = ? AND tenant_id = ?').run(id, tenantId);
        const insertGrd = db.prepare(`
          INSERT INTO guardians (id, tenant_id, patient_id, full_name, relationship, cpf, phone, email, is_primary, authorization_signed)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        `);
        for (const g of guardians) {
          const gName = g.full_name || g.fullName;
          if (gName) {
            insertGrd.run(
              'grd-' + uuidv4().slice(0, 8),
              tenantId,
              id,
              gName,
              g.relationship || 'Responsável',
              g.cpf || null,
              g.phone || null,
              g.email || null,
              g.is_primary !== undefined ? (g.is_primary ? 1 : 0) : 1
            );
          }
        }
      }

      logAudit(req, 'UPDATE_PATIENT', 'patients', id);
      res.json({ message: 'Cadastro atualizado com sucesso' });
    } catch (err: any) {
      console.error('[PatientController.update] Erro:', err);
      res.status(500).json({ error: 'Erro ao atualizar paciente' });
    }
  }
}
