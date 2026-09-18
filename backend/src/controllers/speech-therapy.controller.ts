import { Request, Response } from 'express';
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { logAudit } from '../middlewares/audit.middleware';
import { hasClinicalAccess } from './clinical.controller';
import { DocumentsController } from './documents.controller';

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
    req.user.role === 'clinic_admin' ? tenant?.manager_profession : null,
    req.user.role === 'clinic_admin' ? tenant?.manager_practice_areas : null
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
  const isProfessional = req.user.role === 'professional';

  const isAuthorized =
    (isProfessional && isFonoArea) ||
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
      if (!row) {
        res.json(null);
        return;
      }

      const mappedData = {
        ...row,
        comprehensiveLanguage: row.comprehension || '',
        expressiveLanguage: row.expression || '',
        pragmatics: row.pragmatics || '',
        semantics: row.semantics || '',
        morphosyntax: row.morphosyntax || '',
        narrativeDiscourse: row.narrative || '',
        functionalComm: row.functional_comm || '',
        aacDetails: row.aac_details || '',
        notes: row.notes || ''
      };

      res.json({
        ...mappedData,
        data: mappedData
      });
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

      const raw = req.body.data || req.body;
      const patientId = req.body.patientId || raw.patientId;
      const appointmentId = req.body.appointmentId || raw.appointmentId;

      if (!patientId) {
        res.status(400).json({ error: 'patientId é obrigatório' });
        return;
      }

      const comprehension = raw.comprehension || raw.comprehensiveLanguage || null;
      const expression = raw.expression || raw.expressiveLanguage || null;
      const vocabulary = raw.vocabulary || null;
      const semantics = raw.semantics || null;
      const morphosyntax = raw.morphosyntax || null;
      const pragmatics = raw.pragmatics || null;
      const narrative = raw.narrative || raw.narrativeDiscourse || null;
      const functionalComm = raw.functionalComm || raw.functional_comm || null;
      const aacDetails = raw.aacDetails || raw.aac_details || null;
      const notes = raw.notes || null;

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
        comprehension, expression, vocabulary, semantics, morphosyntax,
        pragmatics, narrative, functionalComm, aacDetails, notes
      );

      res.status(201).json({ id, message: 'Avaliação de linguagem registrada com sucesso' });
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

      let phonemesArr: any[] = [];
      try { phonemesArr = JSON.parse(row.phonemes_json || '[]'); } catch { phonemesArr = []; }

      res.json({
        ...row,
        referredBy: row.referred_by || '',
        coarticulationBreakdown: row.coarticulation_breakdown || '',
        phonemes: phonemesArr
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

      const { patientId, appointmentId } = req.body;
      const phonemes = req.body.phonemes || req.body.phonemesData?.phonemes || req.body.data;
      const phonologicalProcesses = req.body.phonologicalProcesses || null;
      const intelligibility = req.body.intelligibility || null;
      const articulationNotes = req.body.articulationNotes || null;
      const spontaneousSpeech = req.body.spontaneousSpeech || null;
      const repetition = req.body.repetition || null;
      const referredBy = req.body.referredBy || req.body.referred_by || null;
      const coarticulationBreakdown = req.body.coarticulationBreakdown || req.body.coarticulation_breakdown || null;

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
          spontaneous_speech, repetition, referred_by, coarticulation_breakdown
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, tenantId, patientId, profId, appointmentId || null,
        JSON.stringify(phonemes), phonologicalProcesses, intelligibility,
        articulationNotes, spontaneousSpeech, repetition, referredBy, coarticulationBreakdown
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

      let structures: any = {};
      try { structures = JSON.parse(row.structures_json || '{}'); } catch { structures = {}; }

      const combinedData = {
        ...structures,
        breathingMode: row.breathing || structures.breathingMode || 'nasal',
        chewingPattern: row.chewing || structures.chewingPattern || 'bilateral_alternated',
        swallowingPattern: row.swallowing || structures.swallowingPattern || 'typical',
        speechMotor: row.speech_motor || structures.speechMotor || '',
        mobility: row.mobility || structures.mobility || '',
        force: row.force || structures.force || '',
        tonus: row.tonus || structures.tonus || '',
        notes: row.notes || structures.notes || ''
      };

      res.json({
        ...row,
        structures,
        data: combinedData
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

      const raw = req.body.data || req.body;
      const patientId = req.body.patientId || raw.patientId;
      const appointmentId = req.body.appointmentId || raw.appointmentId;

      if (!patientId) {
        res.status(400).json({ error: 'patientId é obrigatório' });
        return;
      }

      const structures = req.body.structures || {
        lips: raw.lips,
        tongue: raw.tongue,
        cheeks: raw.cheeks,
        hardSoftPalate: raw.hardSoftPalate,
        mandibleOcclusion: raw.mandibleOcclusion,
        frenulum: raw.frenulum
      };

      const mobility = raw.mobility || null;
      const force = raw.force || null;
      const tonus = raw.tonus || null;
      const breathing = raw.breathing || raw.breathingMode || null;
      const chewing = raw.chewing || raw.chewingPattern || null;
      const swallowing = raw.swallowing || raw.swallowingPattern || null;
      const speechMotor = raw.speechMotor || raw.speech_motor || null;
      const notes = raw.notes || null;

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
        JSON.stringify(structures), mobility, force, tonus,
        breathing, chewing, swallowing, speechMotor, notes
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
      const latest = rows[0] || null;

      let latestData: any = null;
      if (latest) {
        let sympObj: any = {};
        try { sympObj = JSON.parse(latest.symptoms || '{}'); } catch { sympObj = {}; }

        latestData = {
          ...latest,
          degreeOfDeviation: latest.vocal_quality || '0',
          roughness: sympObj.roughness || '0',
          breathiness: sympObj.breathiness || '0',
          asthenia: sympObj.asthenia || '0',
          strain: sympObj.strain || '0',
          instability: sympObj.instability || '0',
          pitch: latest.pitch || 'adequado',
          loudness: latest.loudness || 'adequada',
          tmfSSeconds: sympObj.tmfSSeconds || '16',
          tmfZSeconds: sympObj.tmfZSeconds || '16',
          audioUrl: latest.audio_url || '',
          notes: latest.notes || ''
        };
      }

      res.json(Object.assign(rows, { data: latestData }));
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

      const raw = req.body.data || req.body;
      const patientId = req.body.patientId || raw.patientId;
      const appointmentId = req.body.appointmentId || raw.appointmentId;

      if (!patientId) {
        res.status(400).json({ error: 'patientId é obrigatório' });
        return;
      }

      const vocalQuality = raw.degreeOfDeviation || raw.vocalQuality || null;
      const pitch = raw.pitch || null;
      const loudness = raw.loudness || null;
      const resonance = raw.resonance || null;
      const vocalAttack = raw.vocalAttack || null;
      const pneumophonoCoordination = raw.pneumophonoCoordination || null;
      const audioUrl = raw.audioUrl || raw.audio_url || null;

      const symptomsObj = {
        roughness: raw.roughness,
        breathiness: raw.breathiness,
        asthenia: raw.asthenia,
        strain: raw.strain,
        instability: raw.instability,
        tmfSSeconds: raw.tmfSSeconds,
        tmfZSeconds: raw.tmfZSeconds
      };

      const symptoms = JSON.stringify(symptomsObj);
      const habits = raw.habits || null;
      const professionalUse = raw.professionalUse || null;
      const notes = raw.notes || null;

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
        vocalQuality, pitch, loudness, resonance, vocalAttack,
        pneumophonoCoordination, audioUrl, symptoms, habits, professionalUse, notes
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
      const latest = rows[0] || null;

      let latestData: any = null;
      if (latest) {
        latestData = {
          ...latest,
          wordsPerMinute: latest.frequency || '120',
          typicalDisfluencies: latest.disfluency_types || '',
          atypicalDisfluencies: latest.blocks || '',
          physicalTension: latest.tension || '',
          diagnosisFluency: latest.impact || '',
          notes: latest.notes || ''
        };
      }

      res.json(Object.assign(rows, { data: latestData }));
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

      const raw = req.body.data || req.body;
      const patientId = req.body.patientId || raw.patientId;
      const appointmentId = req.body.appointmentId || raw.appointmentId;

      if (!patientId) {
        res.status(400).json({ error: 'patientId é obrigatório' });
        return;
      }

      const disfluencyTypes = raw.typicalDisfluencies || raw.disfluencyTypes || null;
      const frequency = raw.wordsPerMinute || raw.frequency || null;
      const tension = raw.physicalTension || raw.tension || null;
      const blocks = raw.atypicalDisfluencies || raw.blocks || null;
      const prolongations = raw.prolongations || null;
      const repetitions = raw.repetitions || null;
      const associatedBehaviors = raw.associatedBehaviors || null;
      const impact = raw.diagnosisFluency || raw.impact || null;
      const notes = raw.notes || null;

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
        disfluencyTypes, frequency, tension, blocks, prolongations,
        repetitions, associatedBehaviors, impact, notes
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
      const latest = rows[0] || null;

      let latestData: any = null;
      if (latest) {
        let tested: any = {};
        let signs: any = {};
        try { tested = JSON.parse(latest.food_consistency || '{}'); } catch { tested = {}; }
        try { signs = JSON.parse(latest.clinical_signs || '{}'); } catch { signs = {}; }

        latestData = {
          ...latest,
          testedConsistencies: tested,
          penetrationAspirationSigns: signs,
          compensatoryManeuvers: latest.recommendations || '',
          dietaryConsistencyPrescribed: latest.dietary_consistency || 'Geral',
          notes: latest.notes || ''
        };
      }

      res.json(Object.assign(rows, { data: latestData }));
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

      const raw = req.body.data || req.body;
      const patientId = req.body.patientId || raw.patientId;
      const appointmentId = req.body.appointmentId || raw.appointmentId;

      if (!patientId) {
        res.status(400).json({ error: 'patientId é obrigatório' });
        return;
      }

      const foodConsistency = raw.testedConsistencies ? JSON.stringify(raw.testedConsistencies) : (raw.foodConsistency || null);
      const utensil = raw.utensil || null;
      const posture = raw.posture || null;
      const lipClosure = raw.lipClosure || null;
      const chewing = raw.chewing || null;
      const oralTransit = raw.oralTransit || null;
      const clinicalSigns = raw.penetrationAspirationSigns ? JSON.stringify(raw.penetrationAspirationSigns) : (raw.clinicalSigns || null);
      const coughChoke = raw.coughChoke || null;
      const wetVoice = raw.wetVoice || null;
      const feedingTime = raw.feedingTime || null;
      const recommendations = raw.compensatoryManeuvers || raw.recommendations || null;
      const notes = raw.notes || null;

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
        foodConsistency, utensil, posture, lipClosure, chewing,
        oralTransit, clinicalSigns, coughChoke, wetVoice, feedingTime, recommendations, notes
      );

      res.status(201).json({ id, message: 'Avaliação de disfagia/alimentação salva com sucesso' });
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao salvar avaliação de disfagia' });
    }
  }

  // 7.1 MATRIZ DE CONSISTÊNCIAS DE DISFAGIA (Item 46)
  static getDysphagiaMatrix(req: Request, res: Response): void {
    try {
      const patientId = String(req.params.patientId);
      const tenantId = req.tenantId;
      if (!isSpeechTherapistOrClinicManager(req) || !hasClinicalAccess(req, patientId)) {
        res.status(403).json({ error: 'Acesso restrito' });
        return;
      }

      const row = db.prepare(`
        SELECT * FROM fono_dysphagia_matrix
        WHERE patient_id = ? AND tenant_id = ?
        ORDER BY created_at DESC LIMIT 1
      `).get(patientId, tenantId) as any;

      if (!row) {
        res.json(null);
        return;
      }

      res.json({
        ...row,
        trials: (() => { try { return JSON.parse(row.trials_json); } catch { return []; } })()
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao buscar matriz de consistências' });
    }
  }

  static saveDysphagiaMatrix(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!isSpeechTherapistOrClinicManager(req)) {
        res.status(403).json({ error: 'Acesso restrito' });
        return;
      }

      const { patientId, trials, generalObservations } = req.body;
      if (!patientId || !trials) {
        res.status(400).json({ error: 'patientId e trials são obrigatórios' });
        return;
      }

      let profId: string | null = null;
      if (req.user?.role === 'professional') {
        const prof = db.prepare('SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ?').get(req.user.userId, tenantId) as any;
        if (prof) profId = prof.id;
      }

      const id = 'f-mat-' + uuidv4().slice(0, 8);
      db.prepare(`
        INSERT INTO fono_dysphagia_matrix (
          id, tenant_id, patient_id, professional_id, trials_json, general_observations
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, tenantId, patientId, profId, JSON.stringify(trials), generalObservations || null);

      res.status(201).json({ id, message: 'Matriz de consistências salva com sucesso' });
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao salvar matriz de consistências' });
    }
  }

  // 7.2 PROCESSOS FONOLÓGICOS ESTRUTURADOS (Item 37)
  static getPhonologicalProcesses(req: Request, res: Response): void {
    try {
      const patientId = String(req.params.patientId);
      const tenantId = req.tenantId;
      if (!isSpeechTherapistOrClinicManager(req) || !hasClinicalAccess(req, patientId)) {
        res.status(403).json({ error: 'Acesso restrito' });
        return;
      }

      const row = db.prepare(`
        SELECT * FROM fono_phonological_processes
        WHERE patient_id = ? AND tenant_id = ?
        ORDER BY created_at DESC LIMIT 1
      `).get(patientId, tenantId) as any;

      if (!row) {
        res.json(null);
        return;
      }

      res.json({
        ...row,
        processes: (() => { try { return JSON.parse(row.processes_json); } catch { return []; } })()
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao buscar processos fonológicos' });
    }
  }

  static savePhonologicalProcesses(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!isSpeechTherapistOrClinicManager(req)) {
        res.status(403).json({ error: 'Acesso restrito' });
        return;
      }

      const { patientId, processes, notes } = req.body;
      if (!patientId || !processes) {
        res.status(400).json({ error: 'patientId e processes são obrigatórios' });
        return;
      }

      let profId: string | null = null;
      if (req.user?.role === 'professional') {
        const prof = db.prepare('SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ?').get(req.user.userId, tenantId) as any;
        if (prof) profId = prof.id;
      }

      const id = 'f-prc-' + uuidv4().slice(0, 8);
      db.prepare(`
        INSERT INTO fono_phonological_processes (
          id, tenant_id, patient_id, professional_id, processes_json, notes
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, tenantId, patientId, profId, JSON.stringify(processes), notes || null);

      res.status(201).json({ id, message: 'Processos fonológicos registrados com sucesso' });
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao salvar processos fonológicos' });
    }
  }

  // 7.3 CONTADOR DE FLUÊNCIA E AMOSTRAS (Item 38)
  static listFluencySamples(req: Request, res: Response): void {
    try {
      const patientId = String(req.params.patientId);
      const tenantId = req.tenantId;
      if (!isSpeechTherapistOrClinicManager(req) || !hasClinicalAccess(req, patientId)) {
        res.status(403).json({ error: 'Acesso restrito' });
        return;
      }

      const rows = db.prepare(`
        SELECT * FROM fono_fluency_samples
        WHERE patient_id = ? AND tenant_id = ?
        ORDER BY created_at DESC
      `).all(patientId, tenantId) as any[];

      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao listar amostras de fluência' });
    }
  }

  static saveFluencySample(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!isSpeechTherapistOrClinicManager(req)) {
        res.status(403).json({ error: 'Acesso restrito' });
        return;
      }

      const {
        patientId, durationSeconds, wordsCount, syllablesCount,
        repetitions = 0, prolongations = 0, blocks = 0,
        interjections = 0, revisions = 0, pauses = 0, notes
      } = req.body;

      if (!patientId || !durationSeconds || wordsCount === undefined || syllablesCount === undefined) {
        res.status(400).json({ error: 'patientId, durationSeconds, wordsCount e syllablesCount são obrigatórios' });
        return;
      }

      const durMin = durationSeconds > 0 ? durationSeconds / 60 : 1;
      const wpm = Math.round((wordsCount / durMin) * 10) / 10;
      const spm = Math.round((syllablesCount / durMin) * 10) / 10;

      const stutteringDisfluencies = Number(repetitions) + Number(prolongations) + Number(blocks);
      const totalDisfluencies = stutteringDisfluencies + Number(interjections) + Number(revisions) + Number(pauses);

      const disfluencyPct = syllablesCount > 0 ? Math.round((totalDisfluencies / syllablesCount) * 1000) / 10 : 0;
      const stutteringPct = syllablesCount > 0 ? Math.round((stutteringDisfluencies / syllablesCount) * 1000) / 10 : 0;

      let profId: string | null = null;
      if (req.user?.role === 'professional') {
        const prof = db.prepare('SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ?').get(req.user.userId, tenantId) as any;
        if (prof) profId = prof.id;
      }

      const id = 'f-flu-smp-' + uuidv4().slice(0, 8);
      db.prepare(`
        INSERT INTO fono_fluency_samples (
          id, tenant_id, patient_id, professional_id, duration_seconds,
          words_count, syllables_count, repetitions, prolongations, blocks,
          interjections, revisions, pauses, disfluency_percentage,
          stuttering_percentage, speaking_rate_wpm, speaking_rate_spm, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, tenantId, patientId, profId, durationSeconds,
        wordsCount, syllablesCount, repetitions, prolongations, blocks,
        interjections, revisions, pauses, disfluencyPct, stutteringPct,
        wpm, spm, notes || null
      );

      res.status(201).json({
        id,
        wpm,
        spm,
        disfluencyPct,
        stutteringPct,
        message: 'Amostra de fluência computada com sucesso'
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao salvar amostra de fluência' });
    }
  }

  // 7.4 COMUNICAÇÃO AUMENTATIVA E ALTERNATIVA - CAA (Item 42)
  static listAacRecords(req: Request, res: Response): void {
    try {
      const patientId = String(req.params.patientId);
      const tenantId = req.tenantId;
      if (!isSpeechTherapistOrClinicManager(req) || !hasClinicalAccess(req, patientId)) {
        res.status(403).json({ error: 'Acesso restrito' });
        return;
      }

      const rows = db.prepare(`
        SELECT * FROM fono_aac_records
        WHERE patient_id = ? AND tenant_id = ?
        ORDER BY created_at DESC
      `).all(patientId, tenantId) as any[];

      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao buscar registros de CAA' });
    }
  }

  static saveAacRecord(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!isSpeechTherapistOrClinicManager(req)) {
        res.status(403).json({ error: 'Acesso restrito' });
        return;
      }

      const {
        patientId, systemUsed, modality, accessMethod, symbolsType,
        vocabularyDetails, communicativeIntention, supportLevel,
        communicationPartners, environments, evolutionLevel = 'emergent', notes
      } = req.body;

      if (!patientId || !systemUsed) {
        res.status(400).json({ error: 'patientId e systemUsed são obrigatórios' });
        return;
      }

      let profId: string | null = null;
      if (req.user?.role === 'professional') {
        const prof = db.prepare('SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ?').get(req.user.userId, tenantId) as any;
        if (prof) profId = prof.id;
      }

      const id = 'f-aac-' + uuidv4().slice(0, 8);
      db.prepare(`
        INSERT INTO fono_aac_records (
          id, tenant_id, patient_id, professional_id, system_used,
          modality, access_method, symbols_type, vocabulary_details,
          communicative_intention, support_level, communication_partners,
          environments, evolution_level, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, tenantId, patientId, profId, systemUsed,
        modality || null, accessMethod || null, symbolsType || null, vocabularyDetails || null,
        communicativeIntention || null, supportLevel || null, communicationPartners || null,
        environments || null, evolutionLevel, notes || null
      );

      res.status(201).json({ id, message: 'Registro de CAA cadastrado com sucesso' });
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao salvar registro de CAA' });
    }
  }

  // 7.5 ANÁLISE DE AMOSTRA DE LINGUAGEM (Item 41)
  static analyzeLanguageSample(req: Request, res: Response): void {
    try {
      const { text } = req.body;
      if (!text || typeof text !== 'string') {
        res.status(400).json({ error: 'Texto da transcrição é obrigatório' });
        return;
      }

      const cleaned = text.trim();
      const words = cleaned.toLowerCase().match(/[\p{L}\p{N}']+/gu) || [];
      const totalWords = words.length;

      // Enunciados divididos por pontuação (. ! ? \n)
      const utterances = cleaned.split(/[.!?\n]+/).map(u => u.trim()).filter(u => u.length > 0);
      const totalUtterances = utterances.length || 1;

      // Diversidade lexical (TTR = tipos únicos / total de palavras)
      const uniqueWords = new Set(words);
      const lexicalDiversityTTR = totalWords > 0 ? Math.round((uniqueWords.size / totalWords) * 100) / 100 : 0;

      // Extensão média do enunciado (MLU em palavras)
      const meanLengthUtterance = totalWords > 0 ? Math.round((totalWords / totalUtterances) * 10) / 10 : 0;

      // Frequência das 10 palavras mais comuns
      const freqMap: Record<string, number> = {};
      for (const w of words) {
        freqMap[w] = (freqMap[w] || 0) + 1;
      }
      const topWords = Object.entries(freqMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([word, count]) => ({ word, count }));

      res.json({
        totalWords,
        totalUtterances,
        uniqueWordsCount: uniqueWords.size,
        lexicalDiversityTTR,
        meanLengthUtterance,
        topWords
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao analisar amostra de linguagem' });
    }
  }

  static listAudiology(req: Request, res: Response): void {
    try {
      const patientId = String(req.params.patientId);
      const tenantId = req.tenantId;
      if (!isSpeechTherapistOrClinicManager(req) || !hasClinicalAccess(req, patientId)) {
        res.status(403).json({ error: 'Acesso restrito' });
        return;
      }

      const rows = db.prepare(`
        SELECT 
          r.*,
          p.name as professional_name,
          p.registration_type as professional_reg_type,
          p.registration_number as professional_reg_number
        FROM fono_audiology_records r
        LEFT JOIN professionals p ON p.id = r.professional_id
        WHERE r.patient_id = ? AND r.tenant_id = ?
        ORDER BY r.exam_date DESC, r.created_at DESC
      `).all(patientId, tenantId) as any[];

      res.json(rows.map(r => ({
        ...r,
        referredBy: r.referred_by || '',
        results: r.results_json ? JSON.parse(r.results_json) : null
      })));
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao buscar exames audiológicos' });
    }
  }

  static saveAudiology(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const { id: providedId, patientId, examType, examDate, results, attachmentUrl, notes, referredBy } = req.body;
      if (!patientId || !examType) {
        res.status(400).json({ error: 'patientId e examType são obrigatórios' });
        return;
      }

      if (!isSpeechTherapistOrClinicManager(req) || !hasClinicalAccess(req, String(patientId))) {
        res.status(403).json({ error: 'Acesso restrito' });
        return;
      }

      let profId: string | null = null;
      if (req.user?.role === 'professional') {
        const prof = db.prepare('SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ?').get(req.user.userId, tenantId) as any;
        if (prof) profId = prof.id;
      }

      const dateStr = examDate || new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

      // Atualiza exame existente caso ID tenha sido fornecido e pertença ao mesmo tenant/paciente
      let recordId = providedId;
      if (recordId) {
        const existing = db.prepare('SELECT id FROM fono_audiology_records WHERE id = ? AND tenant_id = ? AND patient_id = ?').get(recordId, tenantId, patientId) as any;
        if (existing) {
          db.prepare(`
            UPDATE fono_audiology_records SET
              exam_type = ?,
              exam_date = ?,
              results_json = ?,
              attachment_url = COALESCE(?, attachment_url),
              notes = ?,
              referred_by = ?,
              professional_id = COALESCE(?, professional_id)
            WHERE id = ? AND tenant_id = ?
          `).run(
            examType,
            dateStr,
            results ? JSON.stringify(results) : null,
            attachmentUrl || null,
            notes || null,
            referredBy || null,
            profId,
            recordId,
            tenantId
          );
          res.status(200).json({ id: recordId, message: 'Registro de audiologia atualizado com sucesso' });
          return;
        }
      }

      // Caso contrário, cria novo exame independente (não sobrescreve histórico)
      recordId = 'f-aud-' + uuidv4().slice(0, 8);
      db.prepare(`
        INSERT INTO fono_audiology_records (
          id, tenant_id, patient_id, professional_id, exam_type, exam_date,
          results_json, attachment_url, notes, referred_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        recordId, tenantId, patientId, profId, examType, dateStr,
        results ? JSON.stringify(results) : null, attachmentUrl || null, notes || null, referredBy || null
      );

      res.status(201).json({ id: recordId, message: 'Registro de audiologia cadastrado com sucesso' });
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
        referredBy: r.referred_by || '',
        goalsStructured: (() => { try { return JSON.parse(r.goals_structured_json || '[]'); } catch { return []; } })(),
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

      const { patientId, shortTermGoals, mediumTermGoals, longTermGoals, goalsStructured, referredBy, status = 'planned' } = req.body;
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
          short_term_goals_json, medium_term_goals_json, long_term_goals_json,
          referred_by, goals_structured_json, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, tenantId, patientId, profId,
        JSON.stringify(shortTermGoals || []),
        JSON.stringify(mediumTermGoals || []),
        JSON.stringify(longTermGoals || []),
        referredBy || null,
        JSON.stringify(goalsStructured || []),
        status
      );

      res.status(201).json({ id, message: 'Plano terapêutico fonoaudiológico salvo com sucesso' });
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao salvar plano fonoaudiológico' });
    }
  }

  // 10. FINALIZAÇÃO SEGURA DO ATENDIMENTO FONOAUDIOLÓGICO (Regra 56)
  static finishConsultation(req: Request, res: Response): void {
    if (req.body.appointmentId) {
      if (!isSpeechTherapistOrClinicManager(req)) { res.status(403).json({ error: 'Sem acesso ao módulo clínico.' }); return; }
      const body = req.body;
      req.params.id = body.appointmentId;
      const isSealed = body.isSealed !== false;
      req.body = {
        ...body,
        isSealed,
        evolution: {
          ...body,
          moduleType: 'ZemdaFono',
          moduleData: { ...body },
          clinicalEvolution: body.clinicalEvolution || 'Atendimento clínico registrado.',
          isSealed
        }
      };
      DocumentsController.finishConsultation(req, res);
      return;
    }
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
      let professional: any = null;
      if (req.user?.role === 'professional') {
        professional = db.prepare('SELECT id, name, registration_type, registration_number FROM professionals WHERE user_id = ? AND tenant_id = ?').get(req.user.userId, tenantId) as any;
        if (professional) profId = professional.id;
      } else if (req.body.professionalId) {
        profId = req.body.professionalId;
        professional = db.prepare('SELECT id, name, registration_type, registration_number FROM professionals WHERE id = ? AND tenant_id = ?').get(profId, tenantId) as any;
      }

      const creatorName = req.user?.name || req.user?.email || 'Fonoaudiólogo';
      const recordId = 'rec-fon-' + uuidv4().slice(0, 8);
      const spDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
      const recDate = sessionDate || spDateStr;
      const recTime = sessionTime || null;
      const recTitle = title || 'Atendimento Fonoaudiológico (ZemdaFono)';

      const fonoModuleData = {
        ...req.body,
        phonemes: phonemesData || null,
        language: languageData || null,
        voice: voiceData || null,
        motricity: motricityData || null,
        fluency: fluencyData || null,
        dysphagia: dysphagiaData || null
      };

      // Assinatura eletrônica e selamento íntegro
      let signatureHash: string | null = null;
      let signedAt: string | null = null;
      let signedByUserId: string | null = null;
      let signerName: string | null = null;
      let signerReg: string | null = null;
      let sealedAt: string | null = null;

      const shouldSeal = isSealed !== false;
      if (shouldSeal) {
        signerName = professional?.name || req.user?.name || req.user?.email || 'Fonoaudiólogo';
        signerReg = professional ? [professional.registration_type, professional.registration_number].filter(Boolean).join(' ') : null;
        signedByUserId = req.user?.userId || null;
        signedAt = new Date().toISOString();
        sealedAt = signedAt;

        const hashPayload = [
          recordId,
          tenantId,
          patientId,
          recDate,
          recTime || '',
          recTitle,
          clinicalEvolution,
          conducts || '',
          signerName,
          signerReg || '',
          signedAt
        ].join('|');
        signatureHash = crypto.createHash('sha256').update(hashPayload).digest('hex');
      }

      db.exec('BEGIN TRANSACTION');
      let committed = false;

      try {
        db.prepare(`
          INSERT INTO records (
            id, tenant_id, patient_id, appointment_id, professional_id,
            session_date, session_time, procedure_name, title, clinical_evolution,
            technical_notes, conducts, clinical_data_json, module_type, module_data_json,
            is_sealed, signature_hash, signed_at, signed_by_user_id, signer_name,
            signer_registration, sealed_at, created_by, updated_by, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ZemdaFono', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `).run(
          recordId, tenantId, patientId, appointmentId || null, profId,
          recDate, recTime, 'Sessão de Fonoaudiologia', recTitle, clinicalEvolution,
          technicalNotes || null, conducts || null, JSON.stringify(fonoModuleData),
          JSON.stringify(fonoModuleData), shouldSeal ? 1 : 0,
          signatureHash, signedAt, signedByUserId, signerName, signerReg, sealedAt,
          creatorName, creatorName
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

      logAudit(req, 'FINISH_FONO_CONSULTATION', 'records', recordId, { patientId, appointmentId, isSealed: !!isSealed });
      res.status(201).json({
        recordId,
        signatureHash,
        signedAt,
        message: 'Atendimento Fonoaudiológico finalizado e registrado com sucesso!'
      });
    } catch (err: any) {
      console.error('[SpeechTherapyController.finishConsultation]', err);
      res.status(500).json({ error: 'Erro ao finalizar atendimento fonoaudiológico' });
    }
  }

  // 11. TESTES COMPLEMENTARES E ANEXOS (ZemdaFono)
  static listComplementaryTests(req: Request, res: Response): void {
    try {
      const patientId = String(req.params.patientId);
      const tenantId = req.tenantId;
      if (!isSpeechTherapistOrClinicManager(req) || !hasClinicalAccess(req, patientId)) {
        res.status(403).json({ error: 'Acesso restrito' });
        return;
      }

      const rows = db.prepare(`
        SELECT 
          c.*,
          p.name as professional_name
        FROM fono_complementary_tests c
        LEFT JOIN professionals p ON p.id = c.professional_id
        WHERE c.patient_id = ? AND c.tenant_id = ?
        ORDER BY c.test_date DESC, c.created_at DESC
      `).all(patientId, tenantId) as any[];

      res.json(rows.map(r => ({
        id: r.id,
        patientId: r.patient_id,
        professionalId: r.professional_id,
        professionalName: r.professional_name,
        appointmentId: r.appointment_id,
        testName: r.test_name,
        testDate: r.test_date,
        referredBy: r.referred_by || '',
        resultScore: r.result_score || '',
        notes: r.notes || '',
        attachmentUrl: r.attachment_url || '',
        attachmentName: r.attachment_name || '',
        createdAt: r.created_at,
        updatedAt: r.updated_at
      })));
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao buscar testes complementares' });
    }
  }

  static saveComplementaryTest(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const { id: providedId, patientId, appointmentId, testName, testDate, referredBy, resultScore, notes, attachmentUrl, attachmentName } = req.body;
      if (!patientId || !testName) {
        res.status(400).json({ error: 'patientId e testName são obrigatórios' });
        return;
      }

      if (!isSpeechTherapistOrClinicManager(req) || !hasClinicalAccess(req, String(patientId))) {
        res.status(403).json({ error: 'Acesso restrito' });
        return;
      }

      let profId: string | null = null;
      if (req.user?.role === 'professional') {
        const prof = db.prepare('SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ?').get(req.user.userId, tenantId) as any;
        if (prof) profId = prof.id;
      }

      const dateStr = testDate || new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

      if (providedId) {
        const existing = db.prepare('SELECT id FROM fono_complementary_tests WHERE id = ? AND tenant_id = ? AND patient_id = ?').get(providedId, tenantId, patientId) as any;
        if (existing) {
          db.prepare(`
            UPDATE fono_complementary_tests SET
              test_name = ?,
              test_date = ?,
              referred_by = ?,
              result_score = ?,
              notes = ?,
              attachment_url = COALESCE(?, attachment_url),
              attachment_name = COALESCE(?, attachment_name),
              professional_id = COALESCE(?, professional_id),
              updated_at = datetime('now')
            WHERE id = ? AND tenant_id = ?
          `).run(
            testName,
            dateStr,
            referredBy || null,
            resultScore || null,
            notes || null,
            attachmentUrl || null,
            attachmentName || null,
            profId,
            providedId,
            tenantId
          );
          res.status(200).json({ id: providedId, message: 'Teste complementar atualizado com sucesso' });
          return;
        }
      }

      const recordId = 'f-cmp-' + uuidv4().slice(0, 8);
      db.prepare(`
        INSERT INTO fono_complementary_tests (
          id, tenant_id, patient_id, professional_id, appointment_id,
          test_name, test_date, referred_by, result_score, notes,
          attachment_url, attachment_name
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        recordId, tenantId, patientId, profId, appointmentId || null,
        testName, dateStr, referredBy || null, resultScore || null, notes || null,
        attachmentUrl || null, attachmentName || null
      );

      res.status(201).json({ id: recordId, message: 'Teste complementar salvo com sucesso' });
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao salvar teste complementar' });
    }
  }

  static deleteComplementaryTest(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const id = req.params.id;
      if (!isSpeechTherapistOrClinicManager(req)) {
        res.status(403).json({ error: 'Acesso restrito' });
        return;
      }

      db.prepare('DELETE FROM fono_complementary_tests WHERE id = ? AND tenant_id = ?').run(id, tenantId);
      res.json({ message: 'Teste complementar removido com sucesso' });
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao remover teste complementar' });
    }
  }
}
