import { canAccessPatient } from '../services/patient-sharing.service';
import { referenceSex } from '../services/personal-assessment-calculation.service';
import { Request, Response } from 'express';
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { logAudit } from '../middlewares/audit.middleware';
import { validateAndFormatBrazilianPhone } from '../utils/phone-validator';

// Autorização do responsável informada pelo cliente (camelCase ou snake_case); undefined = não informada.
function informedAuthorization(g: any): 0 | 1 | undefined {
  const value = g?.authorizationSigned ?? g?.authorization_signed;
  if (value === undefined || value === null) return undefined;
  return value === true || value === 1 || value === '1' || value === 'true' ? 1 : 0;
}

const digitsOnly = (v: unknown) => String(v ?? '').replace(/\D/g, '');
const normalizedName = (v: unknown) => String(v ?? '').trim().toLowerCase();

// Valores aceitos pelo CHECK de guardians.relationship (schema.sql); outros viram 'other'.
const GUARDIAN_RELATIONSHIPS = ['mother', 'father', 'legal_guardian', 'tutor', 'other'];
const validRelationship = (value: unknown) =>
  typeof value === 'string' && GUARDIAN_RELATIONSHIPS.includes(value) ? value : 'other';

export class PatientController {
  static list(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: 'Tenant não informado' });
        return;
      }

      const { search, limit } = req.query;
      let query = `
        SELECT 
          p.id, p.tenant_id, p.full_name, p.social_name, p.birth_date, p.cpf, p.gender, p.anthropometric_sex,
          p.email, p.phone, p.whatsapp, p.city, p.state, p.is_child, p.active, p.created_at,
          (SELECT COUNT(*) FROM appointments WHERE patient_id = p.id AND tenant_id = ?) as total_appointments,
          (SELECT COUNT(*) FROM records WHERE patient_id = p.id AND tenant_id = ?) as total_records
        FROM patients p
        WHERE (p.tenant_id = ? OR EXISTS (
          SELECT 1 FROM shared_patient_links l JOIN clinic_data_shares sh ON sh.id=l.share_id
          JOIN tenants source ON source.id=sh.source_tenant_id
          WHERE l.patient_id=p.id AND sh.target_tenant_id=? AND sh.source_tenant_id=p.tenant_id
          AND sh.status='ACTIVE' AND source.status='active'
          AND EXISTS(SELECT 1 FROM json_each(sh.scope_json) WHERE value='patient')
        ))
      `;
      const params: any[] = [tenantId, tenantId, tenantId, tenantId];

      if (search && typeof search === 'string' && search.trim().length > 0) {
        const raw = search.trim();
        const term = `%${raw}%`;
        const digits = raw.replace(/\D/g, '');
        if (digits.length >= 3) {
          const digitsTerm = `%${digits}%`;
          query += ` AND (
            p.full_name LIKE ? OR 
            p.cpf LIKE ? OR 
            REPLACE(REPLACE(REPLACE(COALESCE(p.cpf, ''), '.', ''), '-', ''), ' ', '') LIKE ? OR
            p.phone LIKE ? OR 
            REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(p.phone, ''), '(', ''), ')', ''), '-', ''), ' ', '') LIKE ? OR
            p.email LIKE ?
          )`;
          params.push(term, term, digitsTerm, term, digitsTerm, term);
        } else {
          query += ` AND (p.full_name LIKE ? OR p.cpf LIKE ? OR p.phone LIKE ? OR p.email LIKE ?)`;
          params.push(term, term, term, term);
        }
      }

      query += ' ORDER BY p.full_name ASC';

      if (limit && Number(limit) > 0) {
        query += ' LIMIT ?';
        params.push(Number(limit));
      }

      const stmt = db.prepare(query);
      let patients = stmt.all(...params);
      const visibleIds = new Set(patients.map(p=>p.id));
      const retained = db.prepare('SELECT patient_id,identity_json FROM clinic_patient_contexts WHERE tenant_id=?').all(tenantId);
      for (const context of retained) {
        if (visibleIds.has(context.patient_id)) continue;
        const identity = JSON.parse(context.identity_json);
        if (search && !String(identity.full_name).toLowerCase().includes(String(search).trim().toLowerCase())) continue;
        patients.push({...identity,tenant_id:tenantId,active:1,retained:true,shared:true});
      }
      patients.sort((a,b)=>String(a.full_name).localeCompare(String(b.full_name),'pt-BR'));
      if (limit && Number(limit)>0) patients=patients.slice(0,Number(limit));
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
          id, tenant_id, full_name, social_name, birth_date, cpf, gender, anthropometric_sex, email, phone, whatsapp,
          address, city, state, zip_code, photo_url, emergency_contact, emergency_phone,
          notes_admin, is_child, pet_metadata_json, active, allergies_status,
          health_insurance_provider, health_insurance_card, health_insurance_plan,
          created_at, updated_at
        FROM patients
        WHERE id = ? AND tenant_id = ?
      `);
      let patient = stmt.get(id, tenantId) as any;
      if (!patient && req.user && tenantId && canAccessPatient(req.user.userId, tenantId, String(id))) {
        // Explicit clinical identity projection; no administrative notes or insurance.
        patient = db.prepare(`SELECT id,tenant_id,full_name,social_name,birth_date,gender,anthropometric_sex,
          phone,email,is_child,active,created_at FROM patients WHERE id=?`).get(id);
        patient.shared = true;
      }

      if (!patient) {
        const retained = db.prepare('SELECT identity_json FROM clinic_patient_contexts WHERE tenant_id=? AND patient_id=?').get(tenantId,id);
        if (retained) patient={...JSON.parse(retained.identity_json),tenant_id:tenantId,retained:true,shared:true,active:1};
      }
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

      const phoneValidation = validateAndFormatBrazilianPhone(rawPhone, false);
      if (!phoneValidation.isValid) {
        res.status(400).json({ error: phoneValidation.error || 'Telefone brasileiro inválido (verifique o DDD e a quantidade de dígitos)' });
        return;
      }
      const effectivePhone = phoneValidation.formatted || null;

      let effectiveWhatsapp = effectivePhone;
      if (whatsapp !== undefined && String(whatsapp || '').trim() !== '' && String(whatsapp).trim() !== rawPhone) {
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

      if(req.body.anthropometric_sex !== undefined) db.prepare('UPDATE patients SET anthropometric_sex=? WHERE id=? AND tenant_id=?').run(referenceSex({anthropometric_sex:req.body.anthropometric_sex}).sex,patientId,tenantId);
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
              g.relationship ? validRelationship(g.relationship) : 'mother',
              g.cpf || null,
              g.phone,
              g.email || null,
              g.isPrimary ? 1 : 0,
              informedAuthorization(g) ?? 0
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

      let shouldUpdatePhone = 0;
      let effectivePhoneToUpdate: string | null = null;
      if (phone !== undefined || req.body.telephone !== undefined) {
        shouldUpdatePhone = 1;
        const rawUpdatePhone = String(phone ?? req.body.telephone ?? '').trim();
        if (rawUpdatePhone.length > 0) {
          const pVal = validateAndFormatBrazilianPhone(rawUpdatePhone, false);
          if (!pVal.isValid) {
            res.status(400).json({ error: pVal.error || 'Telefone brasileiro inválido' });
            return;
          }
          effectivePhoneToUpdate = pVal.formatted || null;
        } else {
          effectivePhoneToUpdate = null;
        }
      }

      let shouldUpdateWhatsapp = 0;
      let effectiveWhatsappToUpdate: string | null = null;
      if (whatsapp !== undefined) {
        shouldUpdateWhatsapp = 1;
        const rawUpdateWpp = String(whatsapp ?? '').trim();
        if (rawUpdateWpp.length > 0) {
          const wVal = validateAndFormatBrazilianPhone(rawUpdateWpp, false);
          if (!wVal.isValid) {
            res.status(400).json({ error: wVal.error || 'WhatsApp inválido' });
            return;
          }
          effectiveWhatsappToUpdate = wVal.formatted || null;
        } else {
          effectiveWhatsappToUpdate = null;
        }
      } else if (shouldUpdatePhone === 1 && effectivePhoneToUpdate === null) {
        shouldUpdateWhatsapp = 1;
        effectiveWhatsappToUpdate = null;
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
          phone = CASE WHEN ? = 1 THEN ? ELSE phone END,
          whatsapp = CASE WHEN ? = 1 THEN ? ELSE whatsapp END,
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
        shouldUpdatePhone,
        effectivePhoneToUpdate,
        shouldUpdateWhatsapp,
        effectiveWhatsappToUpdate,
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

      if(req.body.anthropometric_sex !== undefined) db.prepare('UPDATE patients SET anthropometric_sex=? WHERE id=? AND tenant_id=?').run(referenceSex({anthropometric_sex:req.body.anthropometric_sex}).sex,id,tenantId);
      // Atualiza responsáveis se informados
      if (Array.isArray(guardians)) {
        // Os responsáveis são regravados; a autorização já registrada de um mesmo responsável
        // (mesmo id, CPF ou nome) é mantida quando o cliente não informa um novo valor.
        const previous = db.prepare(
          'SELECT id, full_name, cpf, relationship, authorization_signed FROM guardians WHERE patient_id = ? AND tenant_id = ?'
        ).all(id, tenantId) as Array<{ id: string; full_name: string; cpf: string | null; relationship: string; authorization_signed: number }>;
        const reused = new Set<string>();
        const findPrevious = (g: any, gName: string) => {
          const available = previous.filter(p => !reused.has(p.id));
          const cpfDigits = digitsOnly(g.cpf);
          return (g.id && available.find(p => p.id === g.id))
            || (cpfDigits && available.find(p => digitsOnly(p.cpf) === cpfDigits))
            || available.find(p => normalizedName(p.full_name) === normalizedName(gName));
        };

        const insertGrd = db.prepare(`
          INSERT INTO guardians (id, tenant_id, patient_id, full_name, relationship, cpf, phone, email, is_primary, authorization_signed)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        // Atômico: se algum responsável falhar, os anteriores não são perdidos.
        db.transaction(() => {
          db.prepare('DELETE FROM guardians WHERE patient_id = ? AND tenant_id = ?').run(id, tenantId);
          for (const g of guardians) {
            const gName = g.full_name || g.fullName;
            if (gName) {
              const match = findPrevious(g, gName);
              if (match) reused.add(match.id);
              insertGrd.run(
                match?.id ?? 'grd-' + uuidv4().slice(0, 8),
                tenantId,
                id,
                gName,
                g.relationship ? validRelationship(g.relationship) : (match?.relationship ?? 'other'),
                g.cpf || null,
                g.phone || null,
                g.email || null,
                g.is_primary !== undefined ? (g.is_primary ? 1 : 0) : 1,
                informedAuthorization(g) ?? match?.authorization_signed ?? 0
              );
            }
          }
        })();
      }

      logAudit(req, 'UPDATE_PATIENT', 'patients', id);
      res.json({ message: 'Cadastro atualizado com sucesso' });
    } catch (err: any) {
      console.error('[PatientController.update] Erro:', err);
      res.status(500).json({ error: 'Erro ao atualizar paciente' });
    }
  }
}
