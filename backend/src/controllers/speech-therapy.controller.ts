import { Request, Response } from 'express';
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { logAudit } from '../middlewares/audit.middleware';
import { hasClinicalAccess } from './clinical.controller';

/**
 * Validação de acesso exclusivo para Fonoaudiologia (ZemdaFono - Regras 1 e 2)
 */
export function isSpeechTherapistOrClinicManager(req: Request): boolean {
  if (!req.user || !req.tenantId) return false;

  // 1. Administrador Global / SuperAdmin NUNCA visualiza conteúdo clínico
  if (req.user.role === 'superadmin') return false;

  // 2. Cargos não-clínicos são bloqueados
  const roleStr = req.user.role as string;
  if (roleStr === 'receptionist' || roleStr === 'financial' || roleStr === 'secretary' || roleStr === 'assistant') {
    return false;
  }

  // 3. Busca vínculo do usuário na clínica
  const clinicUser = db.prepare(`
    SELECT cu.role, cu.status as cu_status, cu.is_manager, cu.permissions_json, cu.profession_custom,
           cu.practice_areas as cu_practice_areas, cu.zemda_fono_enabled,
           u.status as u_status, u.profession_name, u.practice_areas as u_practice_areas, u.zemda_fono_enabled as u_zemda_fono_enabled
    FROM users u
    LEFT JOIN clinic_users cu ON cu.user_id = u.id AND cu.tenant_id = ?
    WHERE u.id = ?
  `).get(req.tenantId, req.user.userId) as any;

  if (clinicUser?.u_status === 'inactive' || clinicUser?.u_status === 'blocked' || clinicUser?.cu_status === 'inactive' || clinicUser?.cu_status === 'blocked') {
    return false;
  }

  // Busca dados de tenant para profissão do gestor
  const tenant = db.prepare('SELECT manager_profession, manager_practice_areas FROM tenants WHERE id = ?').get(req.tenantId) as any;

  // Busca dados de professional se houver
  const prof = db.prepare(`
    SELECT p.id, p.profession_id, p.practice_areas, p.specialty_custom, p.zemda_fono_enabled,
           prof.slug as profession_slug, prof.name as profession_name
    FROM professionals p
    LEFT JOIN professions prof ON prof.id = p.profession_id
    WHERE p.user_id = ? AND p.tenant_id = ?
  `).get(req.user.userId, req.tenantId) as any;

  // 4. Critério 1: Profissão / Área clínica deve ser Fonoaudiologia
  const combinedProfessionText = [
    prof?.profession_id,
    prof?.profession_slug,
    prof?.profession_name,
    prof?.practice_areas,
    prof?.specialty_custom,
    clinicUser?.profession_custom,
    clinicUser?.cu_practice_areas,
    clinicUser?.profession_name,
    clinicUser?.u_practice_areas,
    tenant?.manager_profession,
    tenant?.manager_practice_areas
  ].filter(Boolean).join(' ').toLowerCase();

  const isFonoArea =
    prof?.profession_id === 'prof-fonoaudiologo' ||
    prof?.profession_id === 'prof-fonoaudiologia' ||
    combinedProfessionText.includes('fonoaudiol') ||
    combinedProfessionText.includes('fono') ||
    combinedProfessionText.includes('speech') ||
    combinedProfessionText.includes('crfa');

  if (!isFonoArea) {
    return false;
  }

  // 5. Critério 2: Liberação explícita ou gerente atuando em fonoaudiologia
  let perms: string[] = [];
  try {
    if (clinicUser?.permissions_json) {
      perms = JSON.parse(clinicUser.permissions_json);
    }
  } catch {}

  const isManager = req.user.role === 'clinic_admin' || clinicUser?.is_manager === 1 || clinicUser?.role === 'clinic_admin';

  const isAuthorized =
    (isManager && isFonoArea) ||
    perms.includes('access_zemda_fono') ||
    Number(prof?.zemda_fono_enabled) === 1 ||
    Number(clinicUser?.zemda_fono_enabled) === 1 ||
    Number(clinicUser?.u_zemda_fono_enabled) === 1;

  return isAuthorized;
}

export class SpeechTherapyController {
  // 1. ANAMNESE FONOAUDIOLÓGICA
  static getAnamnesis(req: Request, res: Response): void {
    try {
      const patientId = String(req.params.patientId);
      const tenantId = req.tenantId;
      if (!isSpeechTherapistOrClinicManager(req)) {
        res.status(403).json({ error: 'Acesso restrito ao módulo ZemdaFono' });
        return;
      }
      if (!hasClinicalAccess(req, patientId)) {
        res.status(403).json({ error: 'Acesso clínico restrito (LGPD)' });
        return;
      }

      const row = db.prepare('SELECT * FROM fono_anamnesis WHERE patient_id = ? AND tenant_id = ?').get(patientId, tenantId) as any;
      if (!row) {
        res.json(null);
        return;
      }
      res.json({
        ...row,
        data: JSON.parse(row.data_json || '{}')
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao buscar anamnese fonoaudiológica' });
    }
  }

  static saveAnamnesis(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!isSpeechTherapistOrClinicManager(req)) {
        res.status(403).json({ error: 'Acesso restrito ao módulo ZemdaFono' });
        return;
      }

      const { patientId, data } = req.body;
      if (!patientId || !data) {
        res.status(400).json({ error: 'patientId e data são obrigatórios' });
        return;
      }

      let profId: string | null = null;
      if (req.user?.role === 'professional') {
        const prof = db.prepare('SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ?').get(req.user.userId, tenantId) as any;
        if (prof) profId = prof.id;
      }

      const dataJson = typeof data === 'string' ? data : JSON.stringify(data);
      const existing = db.prepare('SELECT id FROM fono_anamnesis WHERE patient_id = ? AND tenant_id = ?').get(patientId, tenantId) as any;

      if (existing) {
        db.prepare(`
          UPDATE fono_anamnesis SET data_json = ?, professional_id = COALESCE(?, professional_id), updated_at = datetime('now')
          WHERE id = ? AND tenant_id = ?
        `).run(dataJson, profId, existing.id, tenantId);
        res.json({ id: existing.id, message: 'Anamnese fonoaudiológica atualizada' });
      } else {
        const id = 'f-ana-' + uuidv4().slice(0, 8);
        db.prepare(`
          INSERT INTO fono_anamnesis (id, tenant_id, patient_id, professional_id, data_json)
          VALUES (?, ?, ?, ?, ?)
        `).run(id, tenantId, patientId, profId, dataJson);
        res.status(201).json({ id, message: 'Anamnese fonoaudiológica salva com sucesso' });
      }
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao salvar anamnese fonoaudiológica' });
    }
  }

  // 2. AVALIAÇÃO DE LINGUAGEM
  static getLanguage(req: Request, res: Response): void {
    try {
      const patientId = String(req.params.patientId);
      const tenantId = req.tenantId;
      if (!isSpeechTherapistOrClinicManager(req)) {
        res.status(403).json({ error: 'Acesso restrito ao módulo ZemdaFono' });
        return;
      }

      const row = db.prepare('SELECT * FROM fono_language_assessments WHERE patient_id = ? AND tenant_id = ? ORDER BY created_at DESC LIMIT 1').get(patientId, tenantId) as any;
      res.json(row || null);
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao buscar avaliação de linguagem' });
    }
  }

  static saveLanguage(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!isSpeechTherapistOrClinicManager(req)) {
        res.status(403).json({ error: 'Acesso restrito' });
        return;
      }

      const {
        patientId, appointmentId, comprehension, expression, vocabulary,
        semantics, morphosyntax, pragmatics, narrative, functionalComm,
        aacDetails, notes
      } = req.body;

      let profId: string | null = null;
      if (req.user?.role === 'professional') {
        const prof = db.prepare('SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ?').get(req.user.userId, tenantId) as any;
        if (prof) profId = prof.id;
      }

      const id = 'f-lng-' + uuidv4().slice(0, 8);
      db.prepare(`
        INSERT INTO fono_language_assessments (
          id, tenant_id, patient_id, professional_id, appointment_id,
          comprehension, expression, vocabulary, semantics, morphosyntax,
          pragmatics, narrative, functional_comm, aac_details, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, tenantId, patientId, profId, appointmentId || null,
        comprehension || null, expression || null, vocabulary || null, semantics || null,
        morphosyntax || null, pragmatics || null, narrative || null, functionalComm || null,
        aacDetails || null, notes || null
      );

      res.status(201).json({ id, message: 'Avaliação de linguagem registrada' });
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao salvar avaliação de linguagem' });
    }
  }

  // 3. FALA, FONOLOGIA & PAINEL DE FONEMAS
  static getSpeechPhonology(req: Request, res: Response): void {
    try {
      const patientId = String(req.params.patientId);
      const tenantId = req.tenantId;
      if (!isSpeechTherapistOrClinicManager(req)) {
        res.status(403).json({ error: 'Acesso restrito' });
        return;
      }

      const row = db.prepare('SELECT * FROM fono_speech_phonology WHERE patient_id = ? AND tenant_id = ? ORDER BY created_at DESC LIMIT 1').get(patientId, tenantId) as any;
      if (!row) {
        res.json(null);
        return;
      }

      res.json({
        ...row,
        phonemes: JSON.parse(row.phonemes_json || '{}')
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao buscar painel fonêmico' });
    }
  }

  static saveSpeechPhonology(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!isSpeechTherapistOrClinicManager(req)) {
        res.status(403).json({ error: 'Acesso restrito' });
        return;
      }

      const { patientId, appointmentId, phonemes, phonologicalProcesses, intelligibility, articulationNotes, spontaneousSpeech, repetition } = req.body;
      if (!patientId || !phonemes) {
        res.status(400).json({ error: 'patientId e phonemes são obrigatórios' });
        return;
      }

      let profId: string | null = null;
      if (req.user?.role === 'professional') {
        const prof = db.prepare('SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ?').get(req.user.userId, tenantId) as any;
        if (prof) profId = prof.id;
      }

      const id = 'f-sph-' + uuidv4().slice(0, 8);
      db.prepare(`
        INSERT INTO fono_speech_phonology (
          id, tenant_id, patient_id, professional_id, appointment_id,
          phonemes_json, phonological_processes, intelligibility, articulation_notes,
          spontaneous_speech, repetition
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, tenantId, patientId, profId, appointmentId || null,
        JSON.stringify(phonemes), phonologicalProcesses || null, intelligibility || null,
        articulationNotes || null, spontaneousSpeech || null, repetition || null
      );

      res.status(201).json({ id, message: 'Painel de fala e fonologia salvo com sucesso' });
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao salvar avaliação de fala' });
    }
  }

  // 4. MOTRICIDADE OROFACIAL (Face, lábios, língua, respiração, mastigação, deglutição)
  static getOrofacialMotricity(req: Request, res: Response): void {
    try {
      const patientId = String(req.params.patientId);
      const tenantId = req.tenantId;
      if (!isSpeechTherapistOrClinicManager(req)) {
        res.status(403).json({ error: 'Acesso restrito' });
        return;
      }

      const row = db.prepare('SELECT * FROM fono_orofacial_motricity WHERE patient_id = ? AND tenant_id = ? ORDER BY created_at DESC LIMIT 1').get(patientId, tenantId) as any;
      if (!row) {
        res.json(null);
        return;
      }
      res.json({
        ...row,
        structures: row.structures_json ? JSON.parse(row.structures_json) : {}
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao buscar motricidade orofacial' });
    }
  }

  static saveOrofacialMotricity(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!isSpeechTherapistOrClinicManager(req)) {
        res.status(403).json({ error: 'Acesso restrito' });
        return;
      }

      const { patientId, appointmentId, structures, mobility, force, tonus, breathing, chewing, swallowing, speechMotor, notes } = req.body;
      let profId: string | null = null;
      if (req.user?.role === 'professional') {
        const prof = db.prepare('SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ?').get(req.user.userId, tenantId) as any;
        if (prof) profId = prof.id;
      }

      const id = 'f-mo-' + uuidv4().slice(0, 8);
      db.prepare(`
        INSERT INTO fono_orofacial_motricity (
          id, tenant_id, patient_id, professional_id, appointment_id,
          structures_json, mobility, force, tonus, breathing, chewing, swallowing, speech_motor, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, tenantId, patientId, profId, appointmentId || null,
        structures ? JSON.stringify(structures) : null, mobility || null, force || null, tonus || null,
        breathing || null, chewing || null, swallowing || null, speechMotor || null, notes || null
      );

      res.status(201).json({ id, message: 'Motricidade orofacial registrada com sucesso' });
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao salvar motricidade orofacial' });
    }
  }

  // 5. VOZ & ANEXOS DE ÁUDIO
  static getVoice(req: Request, res: Response): void {
    try {
      const patientId = String(req.params.patientId);
      const tenantId = req.tenantId;
      if (!isSpeechTherapistOrClinicManager(req)) {
        res.status(403).json({ error: 'Acesso restrito' });
        return;
      }

      const rows = db.prepare('SELECT * FROM fono_voice_assessments WHERE patient_id = ? AND tenant_id = ? ORDER BY created_at DESC').all(patientId, tenantId) as any[];
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao buscar avaliações de voz' });
    }
  }

  static saveVoice(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!isSpeechTherapistOrClinicManager(req)) {
        res.status(403).json({ error: 'Acesso restrito' });
        return;
      }

      const { patientId, appointmentId, vocalQuality, pitch, loudness, resonance, vocalAttack, pneumophonoCoordination, audioUrl, symptoms, habits, professionalUse, notes } = req.body;
      let profId: string | null = null;
      if (req.user?.role === 'professional') {
        const prof = db.prepare('SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ?').get(req.user.userId, tenantId) as any;
        if (prof) profId = prof.id;
      }

      const id = 'f-voc-' + uuidv4().slice(0, 8);
      db.prepare(`
        INSERT INTO fono_voice_assessments (
          id, tenant_id, patient_id, professional_id, appointment_id,
          vocal_quality, pitch, loudness, resonance, vocal_attack,
          pneumophono_coordination, audio_url, symptoms, habits, professional_use, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, tenantId, patientId, profId, appointmentId || null,
        vocalQuality || null, pitch || null, loudness || null, resonance || null, vocalAttack || null,
        pneumophonoCoordination || null, audioUrl || null, symptoms || null, habits || null, professionalUse || null, notes || null
      );

      res.status(201).json({ id, message: 'Avaliação vocal salva com sucesso' });
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao salvar avaliação vocal' });
    }
  }

  // 6. FLUÊNCIA & GAGUEIRA
  static getFluency(req: Request, res: Response): void {
    try {
      const patientId = String(req.params.patientId);
      const tenantId = req.tenantId;
      if (!isSpeechTherapistOrClinicManager(req)) {
        res.status(403).json({ error: 'Acesso restrito' });
        return;
      }

      const rows = db.prepare('SELECT * FROM fono_fluency_assessments WHERE patient_id = ? AND tenant_id = ? ORDER BY created_at DESC').all(patientId, tenantId) as any[];
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao buscar avaliações de fluência' });
    }
  }

  static saveFluency(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!isSpeechTherapistOrClinicManager(req)) {
        res.status(403).json({ error: 'Acesso restrito' });
        return;
      }

      const { patientId, appointmentId, disfluencyTypes, frequency, tension, blocks, prolongations, repetitions, associatedBehaviors, impact, notes } = req.body;
      let profId: string | null = null;
      if (req.user?.role === 'professional') {
        const prof = db.prepare('SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ?').get(req.user.userId, tenantId) as any;
        if (prof) profId = prof.id;
      }

      const id = 'f-flu-' + uuidv4().slice(0, 8);
      db.prepare(`
        INSERT INTO fono_fluency_assessments (
          id, tenant_id, patient_id, professional_id, appointment_id,
          disfluency_types, frequency, tension, blocks, prolongations,
          repetitions, associated_behaviors, impact, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, tenantId, patientId, profId, appointmentId || null,
        disfluencyTypes || null, frequency || null, tension || null, blocks || null, prolongations || null,
        repetitions || null, associatedBehaviors || null, impact || null, notes || null
      );

      res.status(201).json({ id, message: 'Avaliação de fluência registrada' });
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao salvar avaliação de fluência' });
    }
  }

  // 7. DISFAGIA & ALIMENTAÇÃO FUNCIONAL
  static getDysphagia(req: Request, res: Response): void {
    try {
      const patientId = String(req.params.patientId);
      const tenantId = req.tenantId;
      if (!isSpeechTherapistOrClinicManager(req)) {
        res.status(403).json({ error: 'Acesso restrito' });
        return;
      }

      const rows = db.prepare('SELECT * FROM fono_dysphagia_assessments WHERE patient_id = ? AND tenant_id = ? ORDER BY created_at DESC').all(patientId, tenantId) as any[];
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao buscar avaliações de disfagia' });
    }
  }

  static saveDysphagia(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!isSpeechTherapistOrClinicManager(req)) {
        res.status(403).json({ error: 'Acesso restrito' });
        return;
      }

      const { patientId, appointmentId, foodConsistency, utensil, posture, lipClosure, chewing, oralTransit, clinicalSigns, coughChoke, wetVoice, feedingTime, recommendations, notes } = req.body;
      let profId: string | null = null;
      if (req.user?.role === 'professional') {
        const prof = db.prepare('SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ?').get(req.user.userId, tenantId) as any;
        if (prof) profId = prof.id;
      }

      const id = 'f-dys-' + uuidv4().slice(0, 8);
      db.prepare(`
        INSERT INTO fono_dysphagia_assessments (
          id, tenant_id, patient_id, professional_id, appointment_id,
          food_consistency, utensil, posture, lip_closure, chewing,
          oral_transit, clinical_signs, cough_choke, wet_voice, feeding_time, recommendations, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, tenantId, patientId, profId, appointmentId || null,
        foodConsistency || null, utensil || null, posture || null, lipClosure || null, chewing || null,
        oralTransit || null, clinicalSigns || null, coughChoke || null, wetVoice || null, feedingTime || null, recommendations || null, notes || null
      );

      res.status(201).json({ id, message: 'Avaliação de disfagia/alimentação salva com sucesso' });
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao salvar avaliação de disfagia' });
    }
  }

  // 8. AUDIOLOGIA & EXAMES
  static listAudiology(req: Request, res: Response): void {
    try {
      const patientId = String(req.params.patientId);
      const tenantId = req.tenantId;
      if (!isSpeechTherapistOrClinicManager(req)) {
        res.status(403).json({ error: 'Acesso restrito' });
        return;
      }

      const rows = db.prepare('SELECT * FROM fono_audiology_records WHERE patient_id = ? AND tenant_id = ? ORDER BY exam_date DESC').all(patientId, tenantId) as any[];
      res.json(rows.map(r => ({
        ...r,
        results: r.results_json ? JSON.parse(r.results_json) : null
      })));
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao buscar exames audiológicos' });
    }
  }

  static saveAudiology(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!isSpeechTherapistOrClinicManager(req)) {
        res.status(403).json({ error: 'Acesso restrito' });
        return;
      }

      const { patientId, examType, examDate, results, attachmentUrl, notes } = req.body;
      if (!patientId || !examType) {
        res.status(400).json({ error: 'patientId e examType são obrigatórios' });
        return;
      }

      let profId: string | null = null;
      if (req.user?.role === 'professional') {
        const prof = db.prepare('SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ?').get(req.user.userId, tenantId) as any;
        if (prof) profId = prof.id;
      }

      const id = 'f-aud-' + uuidv4().slice(0, 8);
      const dateStr = examDate || new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

      db.prepare(`
        INSERT INTO fono_audiology_records (
          id, tenant_id, patient_id, professional_id, exam_type, exam_date,
          results_json, attachment_url, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, tenantId, patientId, profId, examType, dateStr,
        results ? JSON.stringify(results) : null, attachmentUrl || null, notes || null
      );

      res.status(201).json({ id, message: 'Registro de audiologia cadastrado' });
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao salvar exame audiológico' });
    }
  }

  // 9. PLANO TERAPÊUTICO FONOAUDIOLÓGICO
  static listTreatmentPlans(req: Request, res: Response): void {
    try {
      const patientId = String(req.params.patientId);
      const tenantId = req.tenantId;
      if (!isSpeechTherapistOrClinicManager(req)) {
        res.status(403).json({ error: 'Acesso restrito' });
        return;
      }

      const rows = db.prepare('SELECT * FROM fono_treatment_plans WHERE patient_id = ? AND tenant_id = ? ORDER BY created_at DESC').all(patientId, tenantId) as any[];
      res.json(rows.map(r => ({
        ...r,
        shortTermGoals: JSON.parse(r.short_term_goals_json || '[]'),
        mediumTermGoals: JSON.parse(r.medium_term_goals_json || '[]'),
        longTermGoals: JSON.parse(r.long_term_goals_json || '[]')
      })));
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao buscar planos terapêuticos fonoaudiológicos' });
    }
  }

  static saveTreatmentPlan(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!isSpeechTherapistOrClinicManager(req)) {
        res.status(403).json({ error: 'Acesso restrito' });
        return;
      }

      const { patientId, shortTermGoals, mediumTermGoals, longTermGoals, status = 'planned' } = req.body;
      if (!patientId) {
        res.status(400).json({ error: 'patientId é obrigatório' });
        return;
      }

      let profId: string | null = null;
      if (req.user?.role === 'professional') {
        const prof = db.prepare('SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ?').get(req.user.userId, tenantId) as any;
        if (prof) profId = prof.id;
      }

      const id = 'f-plan-' + uuidv4().slice(0, 8);
      db.prepare(`
        INSERT INTO fono_treatment_plans (
          id, tenant_id, patient_id, professional_id,
          short_term_goals_json, medium_term_goals_json, long_term_goals_json, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, tenantId, patientId, profId,
        JSON.stringify(shortTermGoals || []),
        JSON.stringify(mediumTermGoals || []),
        JSON.stringify(longTermGoals || []),
        status
      );

      res.status(201).json({ id, message: 'Plano terapêutico fonoaudiológico salvo com sucesso' });
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao salvar plano fonoaudiológico' });
    }
  }

  // 10. FINALIZAÇÃO SEGURA DO ATENDIMENTO FONOAUDIOLÓGICO (Regra 56)
  static finishConsultation(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!isSpeechTherapistOrClinicManager(req)) {
        res.status(403).json({ error: 'Acesso restrito ao ZemdaFono' });
        return;
      }

      const {
        patientId, appointmentId, clinicalEvolution, phonemesData, languageData,
        voiceData, motricityData, fluencyData, dysphagiaData, sessionDate,
        sessionTime, title, technicalNotes, conducts, isSealed
      } = req.body;

      if (!patientId || !clinicalEvolution) {
        res.status(400).json({ error: 'patientId e clinicalEvolution são obrigatórios' });
        return;
      }

      let profId: string | null = null;
      if (req.user?.role === 'professional') {
        const prof = db.prepare('SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ?').get(req.user.userId, tenantId) as any;
        if (prof) profId = prof.id;
      } else if (req.body.professionalId) {
        profId = req.body.professionalId;
      }

      const creatorName = req.user?.name || req.user?.email || 'Fonoaudiólogo';
      const recordId = 'rec-fon-' + uuidv4().slice(0, 8);
      const spDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
      const recDate = sessionDate || spDateStr;
      const recTime = sessionTime || null;
      const recTitle = title || 'Atendimento Fonoaudiológico (ZemdaFono)';

      const fonoModuleData = {
        phonemes: phonemesData || null,
        language: languageData || null,
        voice: voiceData || null,
        motricity: motricityData || null,
        fluency: fluencyData || null,
        dysphagia: dysphagiaData || null
      };

      db.exec('BEGIN TRANSACTION');
      let committed = false;

      try {
        db.prepare(`
          INSERT INTO records (
            id, tenant_id, patient_id, appointment_id, professional_id,
            session_date, session_time, procedure_name, title, clinical_evolution,
            technical_notes, conducts, clinical_data_json, module_type, module_data_json,
            is_sealed, created_by, updated_by, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ZemdaFono', ?, ?, ?, ?, datetime('now'), datetime('now'))
        `).run(
          recordId, tenantId, patientId, appointmentId || null, profId,
          recDate, recTime, 'Sessão de Fonoaudiologia', recTitle, clinicalEvolution,
          technicalNotes || null, conducts || null, JSON.stringify(fonoModuleData),
          JSON.stringify(fonoModuleData), isSealed ? 1 : 0, creatorName, creatorName
        );

        if (appointmentId) {
          db.prepare(`UPDATE appointments SET status = 'completed', updated_at = datetime('now') WHERE id = ? AND tenant_id = ?`).run(appointmentId, tenantId);
        }

        db.exec('COMMIT');
        committed = true;
      } catch (err) {
        if (!committed) {
          try { db.exec('ROLLBACK'); } catch (_) {}
        }
        throw err;
      }

      logAudit(req, 'FINISH_FONO_CONSULTATION', 'records', recordId, { patientId, appointmentId });
      res.status(201).json({
        recordId,
        message: 'Atendimento Fonoaudiológico finalizado e registrado com sucesso!'
      });
    } catch (err: any) {
      console.error('[SpeechTherapyController.finishConsultation]', err);
      res.status(500).json({ error: 'Erro ao finalizar atendimento fonoaudiológico' });
    }
  }
}
