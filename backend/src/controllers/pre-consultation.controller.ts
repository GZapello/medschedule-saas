import { Request, Response } from 'express';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../config/database';
import { hasClinicalAccess } from './clinical.controller';
import { hasZemda360Access } from './body-assessment.controller';
import { ClinicalRecordService } from '../services/clinical-record.service';

export type PreConsultationFieldType =
  | 'short_text'
  | 'long_text'
  | 'single_choice'
  | 'multiple_choice'
  | 'checkbox'
  | 'scale'
  | 'date'
  | 'file'
  | 'image'
  | 'zemda360_body_map';

export interface PreConsultationField {
  id: string;
  type: PreConsultationFieldType;
  label: string;
  instructions?: string;
  required?: boolean;
  order: number;
  options?: string[];
  scaleMin?: number;
  scaleMax?: number;
  scaleMinLabel?: string;
  scaleMaxLabel?: string;
}

export type PreConsultationStatus =
  | 'not_sent'
  | 'pending'
  | 'submitted'
  | 'expired'
  | 'revoked';

export const PRE_CONSULTATION_STATUS_LABELS: Record<PreConsultationStatus, string> = {
  not_sent: 'Formulário não enviado',
  pending: 'Aguardando resposta',
  submitted: 'Respondido',
  expired: 'Expirado',
  revoked: 'Link revogado'
};

const VALID_FIELD_TYPES: PreConsultationFieldType[] = [
  'short_text',
  'long_text',
  'single_choice',
  'multiple_choice',
  'checkbox',
  'scale',
  'date',
  'file',
  'image',
  'zemda360_body_map'
];

// Profissões que NÃO utilizam mapa anatômico corporal físico por padrão (ex.: Psicologia e Psicopedagogia)
const NON_BODY_MAP_PROFESSIONS = new Set([
  'prof-psicologia',
  'prof-psicopedagogia',
  'psicologia',
  'psicopedagogia'
]);

export function canProfessionUseZemda360BodyMap(professionId?: string | null): boolean {
  if (!professionId) return true;
  const norm = String(professionId).trim().toLowerCase();
  if (NON_BODY_MAP_PROFESSIONS.has(norm)) return false;
  return true;
}

function nowBrazilIso(): string {
  const now = new Date();
  const datePart = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(now);
  const timePart = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).format(now);
  return `${datePart}T${timePart}`;
}

function isExpiredIso(expiresAt?: string | null): boolean {
  if (!expiresAt) return false;
  const expMs = Date.parse(String(expiresAt).includes('T') ? String(expiresAt) : String(expiresAt).replace(' ', 'T'));
  if (!Number.isFinite(expMs)) return false;
  return Date.now() > expMs;
}

function buildPublicBaseUrl(req: Request): string {
  const envUrl = process.env.FRONTEND_URL || process.env.PUBLIC_APP_URL;
  if (envUrl) return envUrl.replace(/\/+$/, '');
  const origin = req.headers.origin;
  if (origin && typeof origin === 'string') return origin.replace(/\/+$/, '');
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:5173';
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  return `${proto}://${host}`;
}

function buildWhatsAppShareUrl(
  phone: string | null | undefined,
  patientName: string,
  clinicName: string,
  publicUrl: string,
  startTime?: string | null
): { whatsappUrl: string; messageText: string } {
  const firstName = String(patientName || 'Paciente').trim().split(/\s+/)[0];
  let dateLabel = '';
  if (startTime) {
    const clean = String(startTime).replace(' ', 'T');
    const [dPart, tPart] = clean.split('T');
    if (dPart && tPart) {
      const [y, m, d] = dPart.split('-');
      dateLabel = ` para o seu atendimento em ${d}/${m}/${y} às ${tPart.slice(0, 5)}`;
    }
  }
  const messageText = `Olá, ${firstName}! A equipe da ${clinicName} preparou um breve formulário de Pré-consulta Digital${dateLabel}. Preencha com antecedência pelo link seguro: ${publicUrl}`;
  const digits = String(phone || '').replace(/\D/g, '');
  const normalizedPhone = digits.length >= 10 ? (digits.startsWith('55') ? digits : `55${digits}`) : '';
  const whatsappUrl = normalizedPhone
    ? `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(messageText)}`
    : `https://wa.me/?text=${encodeURIComponent(messageText)}`;
  return { whatsappUrl, messageText };
}

function normalizeFields(rawFields: any[], allowBodyMap: boolean): PreConsultationField[] {
  if (!Array.isArray(rawFields)) return [];
  return rawFields
    .filter(f => f && typeof f === 'object' && VALID_FIELD_TYPES.includes(f.type))
    .filter(f => allowBodyMap || f.type !== 'zemda360_body_map')
    .map((f, idx) => ({
      id: String(f.id || `fld-${idx + 1}`),
      type: f.type as PreConsultationFieldType,
      label: String(f.label || 'Pergunta').trim(),
      instructions: f.instructions ? String(f.instructions).trim() : '',
      required: Boolean(f.required),
      order: typeof f.order === 'number' ? f.order : idx + 1,
      options: Array.isArray(f.options) ? f.options.map((o: any) => String(o).trim()).filter(Boolean) : undefined,
      scaleMin: typeof f.scaleMin === 'number' ? f.scaleMin : 0,
      scaleMax: typeof f.scaleMax === 'number' ? f.scaleMax : 10,
      scaleMinLabel: f.scaleMinLabel ? String(f.scaleMinLabel) : 'Mínimo',
      scaleMaxLabel: f.scaleMaxLabel ? String(f.scaleMaxLabel) : 'Máximo'
    }))
    .sort((a, b) => a.order - b.order);
}

/**
 * Semeia 2 modelos iniciais de Pré-consulta Digital para a clínica caso ainda não haja nenhum modelo cadastrado.
 */
function ensureDefaultFormsForTenant(tenantId: string): void {
  try {
    const countRow = db.prepare('SELECT COUNT(*) as c FROM pre_consultation_forms WHERE tenant_id = ?').get(tenantId) as { c: number } | undefined;
    if ((countRow?.c || 0) > 0) return;

    const now = nowBrazilIso();
    const form1Id = `pcf-default-1-${tenantId.slice(0, 6)}`;
    const ver1Id = `pcfv-default-1-${tenantId.slice(0, 6)}`;
    const fields1: PreConsultationField[] = [
      {
        id: 'motivo_principal',
        type: 'long_text',
        label: 'Qual é o principal motivo ou queixa para esta consulta?',
        instructions: 'Descreva com suas palavras o que motivou o agendamento.',
        required: true,
        order: 1
      },
      {
        id: 'tempo_sintomas',
        type: 'single_choice',
        label: 'Há quanto tempo você percebe essa necessidade ou sintoma?',
        required: false,
        order: 2,
        options: ['Menos de 1 semana', 'De 1 a 4 semanas', 'De 1 a 6 meses', 'Mais de 6 meses', 'Apenas check-up / prevenção']
      },
      {
        id: 'medicamentos_uso',
        type: 'long_text',
        label: 'Utiliza medicamentos contínuos ou possui alguma alergia importante?',
        instructions: 'Caso não utilize medicamentos e não tenha alergias, informe "Não".',
        required: false,
        order: 3
      },
      {
        id: 'intensidade_desconforto',
        type: 'scale',
        label: 'De 0 a 10, qual o nível de desconforto atual?',
        required: false,
        order: 4,
        scaleMin: 0,
        scaleMax: 10,
        scaleMinLabel: 'Sem desconforto',
        scaleMaxLabel: 'Desconforto intenso'
      }
    ];

    db.prepare(`
      INSERT OR IGNORE INTO pre_consultation_forms (
        id, tenant_id, professional_id, profession_id, title, description, instructions,
        purpose, visibility, include_zemda360_body_map, fields_json, version, status, is_active, created_at, updated_at
      ) VALUES (?, ?, NULL, NULL, ?, ?, ?, ?, 'clinic', 0, ?, 1, 'active', 1, ?, ?)
    `).run(
      form1Id,
      tenantId,
      'Pré-consulta Geral — Primeira Consulta',
      'Levantamento inicial de queixa principal, histórico breve, alergias e expectativas para o atendimento.',
      'Por favor, preencha as informações abaixo antes da sua consulta para agilizar e personalizar seu atendimento.',
      'Primeira Consulta / Anamnese Prévia',
      JSON.stringify(fields1),
      now,
      now
    );

    db.prepare(`
      INSERT OR IGNORE INTO pre_consultation_form_versions (
        id, form_id, tenant_id, version, title, description, instructions,
        purpose, profession_id, include_zemda360_body_map, fields_json, created_at
      ) VALUES (?, ?, ?, 1, ?, ?, ?, ?, NULL, 0, ?, ?)
    `).run(
      ver1Id,
      form1Id,
      tenantId,
      'Pré-consulta Geral — Primeira Consulta',
      'Levantamento inicial de queixa principal, histórico breve, alergias e expectativas para o atendimento.',
      'Por favor, preencha as informações abaixo antes da sua consulta para agilizar e personalizar seu atendimento.',
      'Primeira Consulta / Anamnese Prévia',
      JSON.stringify(fields1),
      now
    );

    const form2Id = `pcf-default-360-${tenantId.slice(0, 6)}`;
    const ver2Id = `pcfv-default-360-${tenantId.slice(0, 6)}`;
    const fields2: PreConsultationField[] = [
      {
        id: 'queixa_funcional',
        type: 'long_text',
        label: 'O que você está sentindo e em quais momentos do dia o sintoma piora?',
        required: true,
        order: 1
      },
      {
        id: 'mapa_corporal_360',
        type: 'zemda360_body_map',
        label: 'Mapa corporal — Zemda360 (Marque as regiões de dor, tensão ou desconforto)',
        instructions: 'Toque nas regiões do corpo (Frente ou Costas) onde você sente dor, desconforto ou deseja avaliação.',
        required: false,
        order: 2
      },
      {
        id: 'restricoes_movimento',
        type: 'multiple_choice',
        label: 'Quais atividades estão sendo impactadas atualmente?',
        required: false,
        order: 3,
        options: ['Trabalho / estudos', 'Sono / repouso', 'Atividade física / treino', 'Caminhada / locomoção', 'Nenhuma restrição importante']
      }
    ];

    db.prepare(`
      INSERT OR IGNORE INTO pre_consultation_forms (
        id, tenant_id, professional_id, profession_id, title, description, instructions,
        purpose, visibility, include_zemda360_body_map, fields_json, version, status, is_active, created_at, updated_at
      ) VALUES (?, ?, NULL, NULL, ?, ?, ?, ?, 'clinic', 1, ?, 1, 'active', 1, ?, ?)
    `).run(
      form2Id,
      tenantId,
      'Pré-consulta com Mapa Corporal — Zemda360',
      'Formulário com mapeamento anatômico interativo para o paciente indicar pontos de dor, desconforto ou queixa estética.',
      'Indique nos campos abaixo sua queixa e selecione no Mapa Corporal as regiões que deseja destacar para o profissional.',
      'Mapeamento Corporal / Avaliação Física e Dor',
      JSON.stringify(fields2),
      now,
      now
    );

    db.prepare(`
      INSERT OR IGNORE INTO pre_consultation_form_versions (
        id, form_id, tenant_id, version, title, description, instructions,
        purpose, profession_id, include_zemda360_body_map, fields_json, created_at
      ) VALUES (?, ?, ?, 1, ?, ?, ?, ?, NULL, 1, ?, ?)
    `).run(
      ver2Id,
      form2Id,
      tenantId,
      'Pré-consulta com Mapa Corporal — Zemda360',
      'Formulário com mapeamento anatômico interativo para o paciente indicar pontos de dor, desconforto ou queixa estética.',
      'Indique nos campos abaixo sua queixa e selecione no Mapa Corporal as regiões que deseja destacar para o profissional.',
      'Mapeamento Corporal / Avaliação Física e Dor',
      JSON.stringify(fields2),
      now
    );
  } catch (err) {
    console.warn('[PreConsultation.ensureDefaultFormsForTenant] Aviso:', err);
  }
}

/**
 * Helper interno reutilizável por AppointmentController.create para preparar o envio
 * quando o agendamento já inclui preConsultationFormId.
 */
export function createPreConsultationSubmissionForAppointment(params: {
  tenantId: string;
  appointmentId: string;
  formId: string;
  expirationHours?: number;
  createdBy?: string | null;
  baseUrl?: string;
}): {
  submissionId: string;
  token: string;
  status: PreConsultationStatus;
  statusLabel: string;
  publicUrl: string;
  whatsappUrl: string;
  messageText: string;
  expiresAt: string;
  formTitle: string;
} | null {
  const { tenantId, appointmentId, formId, expirationHours = 168, createdBy = null, baseUrl = 'http://localhost:5173' } = params;

  const appt = db.prepare(`
    SELECT a.id, a.patient_id, a.professional_id, a.start_time,
           pat.full_name as patient_name, pat.phone as patient_phone,
           t.name as clinic_name, t.trade_name as clinic_trade_name
    FROM appointments a
    JOIN patients pat ON pat.id = a.patient_id
    JOIN tenants t ON t.id = a.tenant_id
    WHERE a.id = ? AND a.tenant_id = ?
  `).get(appointmentId, tenantId) as any;
  if (!appt) return null;

  const form = db.prepare(`
    SELECT * FROM pre_consultation_forms
    WHERE id = ? AND tenant_id = ? AND is_active = 1 AND status != 'archived'
  `).get(formId, tenantId) as any;
  if (!form) return null;

  // Localiza ou cria snapshot imutável da versão atual do modelo
  let versionRow = db.prepare(`
    SELECT id, version FROM pre_consultation_form_versions
    WHERE form_id = ? AND tenant_id = ? AND version = ?
    LIMIT 1
  `).get(form.id, tenantId, form.version || 1) as { id: string; version: number } | undefined;

  if (!versionRow) {
    const verId = 'pcfv-' + uuidv4().slice(0, 8);
    db.prepare(`
      INSERT INTO pre_consultation_form_versions (
        id, form_id, tenant_id, version, title, description, instructions,
        purpose, profession_id, include_zemda360_body_map, fields_json, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      verId,
      form.id,
      tenantId,
      form.version || 1,
      form.title,
      form.description || null,
      form.instructions || null,
      form.purpose || null,
      form.profession_id || null,
      form.include_zemda360_body_map ? 1 : 0,
      form.fields_json || '[]',
      createdBy
    );
    versionRow = { id: verId, version: form.version || 1 };
  }

  // Revoga submissões pendentes anteriores do mesmo agendamento para evitar links órfãos duplicados
  db.prepare(`
    UPDATE pre_consultation_submissions
    SET status = 'revoked', revoked_at = datetime('now'), updated_at = datetime('now')
    WHERE tenant_id = ? AND appointment_id = ? AND status = 'pending'
  `).run(tenantId, appointmentId);

  const submissionId = 'pcs-' + uuidv4().slice(0, 10);
  const token = crypto.randomBytes(24).toString('hex');
  const expHours = Math.max(1, Math.min(720, Number(expirationHours) || 168));
  const expiresAt = new Date(Date.now() + expHours * 3600000).toISOString();
  const sentAt = nowBrazilIso();

  db.prepare(`
    INSERT INTO pre_consultation_submissions (
      id, tenant_id, appointment_id, patient_id, professional_id,
      form_id, form_version_id, form_version, token, status,
      sent_at, expires_at, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, datetime('now'), datetime('now'))
  `).run(
    submissionId,
    tenantId,
    appointmentId,
    appt.patient_id,
    appt.professional_id,
    form.id,
    versionRow.id,
    versionRow.version,
    token,
    sentAt,
    expiresAt,
    createdBy
  );

  db.prepare(`
    UPDATE appointments
    SET pre_consultation_form_id = ?,
        pre_consultation_submission_id = ?,
        pre_consultation_status = 'pending',
        updated_at = datetime('now')
    WHERE id = ? AND tenant_id = ?
  `).run(form.id, submissionId, appointmentId, tenantId);

  const publicUrl = `${baseUrl}/pre-consulta/${token}`;
  const clinicDisplayName = appt.clinic_trade_name || appt.clinic_name || 'Clínica';
  const { whatsappUrl, messageText } = buildWhatsAppShareUrl(
    appt.patient_phone,
    appt.patient_name,
    clinicDisplayName,
    publicUrl,
    appt.start_time
  );

  return {
    submissionId,
    token,
    status: 'pending',
    statusLabel: PRE_CONSULTATION_STATUS_LABELS.pending,
    publicUrl,
    whatsappUrl,
    messageText,
    expiresAt,
    formTitle: form.title
  };
}

const SIMPLIFIED_LEGACY_TO_CANONICAL: Record<string, string> = {
  head_front: 'cabeca',
  head_back: 'cabeca',
  neck_front: 'cervical',
  cervical_back: 'joint_cervical',
  shoulder_right: 'shoulder_right',
  shoulder_left: 'shoulder_left',
  chest: 'thorax',
  abdomen: 'abdomen_upper',
  arm_right: 'upper_arm_right',
  arm_left: 'upper_arm_left',
  hand_right: 'hand_right',
  hand_left: 'hand_left',
  pelvis_front: 'pelvis',
  thigh_knee_right: 'thigh_anterior_right',
  thigh_knee_left: 'thigh_anterior_left',
  leg_foot_right: 'leg_anterior_right',
  leg_foot_left: 'leg_anterior_left',
  scapula_right: 'scapula_right',
  scapula_left: 'scapula_left',
  thoracic_spine: 'thoracic_back',
  lumbar_spine: 'lumbar',
  glute_hip: 'pelvis',
  posterior_thigh_left: 'thigh_posterior_left',
  posterior_thigh_right: 'thigh_posterior_right',
  calf_heel_left: 'leg_posterior_left',
  calf_heel_right: 'leg_posterior_right',
  coluna_cervical: 'joint_cervical',
  coluna_toracica: 'thoracic_back',
  coluna_lombar: 'lumbar',
  pelve: 'pelvis',
  ombro_direito: 'shoulder_right',
  ombro_esquerdo: 'shoulder_left',
  cotovelo_direito: 'elbow_right',
  cotovelo_esquerdo: 'elbow_left',
  punho_direito: 'wrist_right',
  punho_esquerdo: 'wrist_left',
  quadril_direito: 'hip_right',
  quadril_esquerdo: 'hip_left',
  joelho_direito: 'knee_right',
  joelho_esquerdo: 'knee_left',
  tornozelo_direito: 'ankle_right',
  tornozelo_esquerdo: 'ankle_left',
  pe_direito: 'foot_right',
  pe_esquerdo: 'foot_left',
  antebraco_direito: 'forearm_right',
  antebraco_esquerdo: 'forearm_left',
  quadriceps_direito: 'thigh_anterior_right',
  quadriceps_esquerdo: 'thigh_anterior_left',
  posteriores_direito: 'thigh_posterior_right',
  posteriores_esquerdo: 'thigh_posterior_left'
};

function resolveCanonicalZemda360RegionId(rawId: string): string {
  const trimmed = String(rawId || '').trim();
  if (!trimmed) return 'regiao';
  return SIMPLIFIED_LEGACY_TO_CANONICAL[trimmed] || trimmed;
}

export class PreConsultationController {
  /**
   * 4.1. Lista os modelos da Biblioteca "Formulários de Pré-consulta"
   */
  static listForms(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId as string;
      if (!tenantId) {
        res.status(400).json({ error: 'Clínica não identificada' });
        return;
      }

      ensureDefaultFormsForTenant(tenantId);

      const includeArchived = req.query.includeArchived === '1' || req.query.includeArchived === 'true';
      const professionFilter = req.query.professionId ? String(req.query.professionId) : null;
      const purposeFilter = req.query.purpose ? String(req.query.purpose) : null;

      const myProf = req.user?.userId
        ? (db.prepare('SELECT id, profession_id, name FROM professionals WHERE user_id = ? AND tenant_id = ? AND active = 1 LIMIT 1').get(req.user.userId, tenantId) as any)
        : null;

      let sql = `
        SELECT
          f.*,
          p.name as professional_name,
          (SELECT COUNT(*) FROM pre_consultation_submissions s WHERE s.form_id = f.id AND s.tenant_id = f.tenant_id) as total_submissions
        FROM pre_consultation_forms f
        LEFT JOIN professionals p ON p.id = f.professional_id
        WHERE f.tenant_id = ?
      `;
      const params: any[] = [tenantId];

      if (!includeArchived) {
        sql += ` AND f.status != 'archived' AND f.is_active = 1`;
      }

      // Visibilidade: compartilhados na clínica ('clinic') ou privados do próprio profissional ('private') ou se for clinic_admin
      if (req.user?.role !== 'clinic_admin') {
        if (myProf?.id) {
          sql += ` AND (f.visibility = 'clinic' OR f.professional_id = ?)`;
          params.push(myProf.id);
        } else {
          sql += ` AND f.visibility = 'clinic'`;
        }
      }

      if (professionFilter) {
        sql += ` AND (f.profession_id = ? OR f.profession_id IS NULL)`;
        params.push(professionFilter);
      }

      if (purposeFilter) {
        sql += ` AND f.purpose LIKE ?`;
        params.push(`%${purposeFilter}%`);
      }

      sql += ` ORDER BY f.updated_at DESC, f.created_at DESC`;

      const rows = (db.prepare(sql).all(...params) as any[]).map(r => {
        let fields: PreConsultationField[] = [];
        try {
          fields = JSON.parse(r.fields_json || '[]');
        } catch {
          fields = [];
        }
        return {
          ...r,
          include_zemda360_body_map: Boolean(r.include_zemda360_body_map),
          fields
        };
      });

      const canUseBodyMap =
        hasZemda360Access(req) &&
        canProfessionUseZemda360BodyMap(myProf?.profession_id || professionFilter);

      res.json({
        forms: rows,
        permissions: {
          canManageForms: req.user?.role === 'clinic_admin' || req.user?.role === 'professional',
          canUseZemda360BodyMap: canUseBodyMap,
          myProfessionalId: myProf?.id || null,
          myProfessionId: myProf?.profession_id || null
        }
      });
    } catch (err: any) {
      console.error('[PreConsultationController.listForms] Erro:', err);
      res.status(500).json({ error: 'Erro ao listar Formulários de Pré-consulta' });
    }
  }

  /**
   * Cria um novo modelo na biblioteca "Formulários de Pré-consulta"
   */
  static createForm(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId as string;
      if (!tenantId || !req.user) {
        res.status(401).json({ error: 'Não autenticado' });
        return;
      }

      if (req.user.role !== 'clinic_admin' && req.user.role !== 'professional') {
        res.status(403).json({ error: 'Apenas profissionais e gestores podem criar modelos de Pré-consulta.' });
        return;
      }

      const {
        title,
        description,
        instructions,
        purpose,
        professionId,
        visibility = 'clinic',
        includeZemda360BodyMap = false,
        fields = []
      } = req.body;

      if (!title || !String(title).trim()) {
        res.status(400).json({ error: 'O título do formulário é obrigatório.' });
        return;
      }

      const myProf = db.prepare('SELECT id, profession_id FROM professionals WHERE user_id = ? AND tenant_id = ? AND active = 1 LIMIT 1').get(req.user.userId, tenantId) as any;
      const effectiveProfessionId = professionId !== undefined ? professionId : (myProf?.profession_id || null);

      const requestedBodyMap =
        Boolean(includeZemda360BodyMap) ||
        (Array.isArray(fields) && fields.some((f: any) => f?.type === 'zemda360_body_map'));

      if (requestedBodyMap && (!hasZemda360Access(req) || !canProfessionUseZemda360BodyMap(effectiveProfessionId))) {
        res.status(403).json({
          code: 'ZEMDA360_NOT_AVAILABLE_FOR_PROFESSION',
          error: 'O campo "Mapa corporal — Zemda360" está disponível apenas para profissões e profissionais que utilizam o mapeamento corporal Zemda360.'
        });
        return;
      }

      let normalizedFields = normalizeFields(fields, requestedBodyMap);
      if (requestedBodyMap && !normalizedFields.some(f => f.type === 'zemda360_body_map')) {
        normalizedFields.push({
          id: 'zemda360_body_map',
          type: 'zemda360_body_map',
          label: 'Mapa corporal — Zemda360',
          instructions: 'Selecione no corpo as regiões onde sente dor, desconforto ou queixa.',
          required: false,
          order: normalizedFields.length + 1
        });
      }

      const formId = 'pcf-' + uuidv4().slice(0, 8);
      const versionId = 'pcfv-' + uuidv4().slice(0, 8);
      const safeVisibility = visibility === 'private' ? 'private' : 'clinic';
      const now = nowBrazilIso();

      db.prepare(`
        INSERT INTO pre_consultation_forms (
          id, tenant_id, professional_id, profession_id, title, description, instructions,
          purpose, visibility, include_zemda360_body_map, fields_json, version, status, is_active,
          created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'active', 1, ?, ?, ?)
      `).run(
        formId,
        tenantId,
        myProf?.id || null,
        effectiveProfessionId || null,
        String(title).trim(),
        description ? String(description).trim() : null,
        instructions ? String(instructions).trim() : null,
        purpose ? String(purpose).trim() : null,
        safeVisibility,
        requestedBodyMap ? 1 : 0,
        JSON.stringify(normalizedFields),
        req.user.userId,
        now,
        now
      );

      db.prepare(`
        INSERT INTO pre_consultation_form_versions (
          id, form_id, tenant_id, version, title, description, instructions,
          purpose, profession_id, include_zemda360_body_map, fields_json, created_by, created_at
        ) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        versionId,
        formId,
        tenantId,
        String(title).trim(),
        description ? String(description).trim() : null,
        instructions ? String(instructions).trim() : null,
        purpose ? String(purpose).trim() : null,
        effectiveProfessionId || null,
        requestedBodyMap ? 1 : 0,
        JSON.stringify(normalizedFields),
        req.user.userId,
        now
      );

      res.status(201).json({
        id: formId,
        version: 1,
        versionId,
        title: String(title).trim(),
        include_zemda360_body_map: requestedBodyMap,
        fields: normalizedFields,
        message: 'Formulário de Pré-consulta criado com sucesso!'
      });
    } catch (err: any) {
      console.error('[PreConsultationController.createForm] Erro:', err);
      res.status(500).json({ error: 'Erro ao criar Formulário de Pré-consulta' });
    }
  }

  /**
   * Edita um modelo existente gerando uma nova versão imutável em pre_consultation_form_versions,
   * garantindo que respostas antigas preservem a versão exata em que foram respondidas.
   */
  static updateForm(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId as string;
      const { id } = req.params;
      if (!tenantId || !req.user) {
        res.status(401).json({ error: 'Não autenticado' });
        return;
      }

      const existing = db.prepare('SELECT * FROM pre_consultation_forms WHERE id = ? AND tenant_id = ?').get(id, tenantId) as any;
      if (!existing) {
        res.status(404).json({ error: 'Formulário de Pré-consulta não encontrado' });
        return;
      }

      const {
        title,
        description,
        instructions,
        purpose,
        professionId,
        visibility,
        includeZemda360BodyMap,
        fields
      } = req.body;

      const effectiveProfessionId = professionId !== undefined ? professionId : existing.profession_id;
      const requestedBodyMap =
        includeZemda360BodyMap !== undefined
          ? Boolean(includeZemda360BodyMap)
          : Boolean(existing.include_zemda360_body_map) ||
            (Array.isArray(fields) && fields.some((f: any) => f?.type === 'zemda360_body_map'));

      if (requestedBodyMap && (!hasZemda360Access(req) || !canProfessionUseZemda360BodyMap(effectiveProfessionId))) {
        res.status(403).json({
          code: 'ZEMDA360_NOT_AVAILABLE_FOR_PROFESSION',
          error: 'O campo "Mapa corporal — Zemda360" não está habilitado para esta profissão.'
        });
        return;
      }

      let normalizedFields: PreConsultationField[];
      if (Array.isArray(fields)) {
        normalizedFields = normalizeFields(fields, requestedBodyMap);
      } else {
        try {
          normalizedFields = JSON.parse(existing.fields_json || '[]');
        } catch {
          normalizedFields = [];
        }
      }

      if (requestedBodyMap && !normalizedFields.some(f => f.type === 'zemda360_body_map')) {
        normalizedFields.push({
          id: 'zemda360_body_map',
          type: 'zemda360_body_map',
          label: 'Mapa corporal — Zemda360',
          instructions: 'Selecione no corpo as regiões onde sente dor, desconforto ou queixa.',
          required: false,
          order: normalizedFields.length + 1
        });
      } else if (!requestedBodyMap) {
        normalizedFields = normalizedFields.filter(f => f.type !== 'zemda360_body_map');
      }

      const nextVersion = Number(existing.version || 1) + 1;
      const nextTitle = title !== undefined ? String(title).trim() : existing.title;
      const nextDesc = description !== undefined ? (description ? String(description).trim() : null) : existing.description;
      const nextInst = instructions !== undefined ? (instructions ? String(instructions).trim() : null) : existing.instructions;
      const nextPurpose = purpose !== undefined ? (purpose ? String(purpose).trim() : null) : existing.purpose;
      const nextVisibility = visibility ? (visibility === 'private' ? 'private' : 'clinic') : existing.visibility;
      const now = nowBrazilIso();

      db.prepare(`
        UPDATE pre_consultation_forms
        SET title = ?,
            description = ?,
            instructions = ?,
            purpose = ?,
            profession_id = ?,
            visibility = ?,
            include_zemda360_body_map = ?,
            fields_json = ?,
            version = ?,
            updated_at = ?
        WHERE id = ? AND tenant_id = ?
      `).run(
        nextTitle,
        nextDesc,
        nextInst,
        nextPurpose,
        effectiveProfessionId || null,
        nextVisibility,
        requestedBodyMap ? 1 : 0,
        JSON.stringify(normalizedFields),
        nextVersion,
        now,
        id,
        tenantId
      );

      const versionId = 'pcfv-' + uuidv4().slice(0, 8);
      db.prepare(`
        INSERT INTO pre_consultation_form_versions (
          id, form_id, tenant_id, version, title, description, instructions,
          purpose, profession_id, include_zemda360_body_map, fields_json, created_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        versionId,
        id,
        tenantId,
        nextVersion,
        nextTitle,
        nextDesc,
        nextInst,
        nextPurpose,
        effectiveProfessionId || null,
        requestedBodyMap ? 1 : 0,
        JSON.stringify(normalizedFields),
        req.user.userId,
        now
      );

      res.json({
        id,
        version: nextVersion,
        versionId,
        title: nextTitle,
        include_zemda360_body_map: requestedBodyMap,
        fields: normalizedFields,
        message: `Formulário atualizado para a versão v${nextVersion}. Submissões anteriores permanecem vinculadas às suas versões originais.`
      });
    } catch (err: any) {
      console.error('[PreConsultationController.updateForm] Erro:', err);
      res.status(500).json({ error: 'Erro ao atualizar Formulário de Pré-consulta' });
    }
  }

  /**
   * Duplica um modelo de formulário
   */
  static duplicateForm(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId as string;
      const { id } = req.params;
      if (!tenantId || !req.user) {
        res.status(401).json({ error: 'Não autenticado' });
        return;
      }

      const source = db.prepare('SELECT * FROM pre_consultation_forms WHERE id = ? AND tenant_id = ?').get(id, tenantId) as any;
      if (!source) {
        res.status(404).json({ error: 'Formulário original não encontrado' });
        return;
      }

      const myProf = db.prepare('SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ? AND active = 1 LIMIT 1').get(req.user.userId, tenantId) as any;
      const newFormId = 'pcf-' + uuidv4().slice(0, 8);
      const newVersionId = 'pcfv-' + uuidv4().slice(0, 8);
      const newTitle = req.body?.title ? String(req.body.title).trim() : `${source.title} (Cópia)`;
      const now = nowBrazilIso();

      db.prepare(`
        INSERT INTO pre_consultation_forms (
          id, tenant_id, professional_id, profession_id, title, description, instructions,
          purpose, visibility, include_zemda360_body_map, fields_json, version, status, is_active,
          created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'active', 1, ?, ?, ?)
      `).run(
        newFormId,
        tenantId,
        myProf?.id || source.professional_id || null,
        source.profession_id || null,
        newTitle,
        source.description || null,
        source.instructions || null,
        source.purpose || null,
        source.visibility || 'clinic',
        source.include_zemda360_body_map ? 1 : 0,
        source.fields_json || '[]',
        req.user.userId,
        now,
        now
      );

      db.prepare(`
        INSERT INTO pre_consultation_form_versions (
          id, form_id, tenant_id, version, title, description, instructions,
          purpose, profession_id, include_zemda360_body_map, fields_json, created_by, created_at
        ) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        newVersionId,
        newFormId,
        tenantId,
        newTitle,
        source.description || null,
        source.instructions || null,
        source.purpose || null,
        source.profession_id || null,
        source.include_zemda360_body_map ? 1 : 0,
        source.fields_json || '[]',
        req.user.userId,
        now
      );

      res.status(201).json({
        id: newFormId,
        version: 1,
        title: newTitle,
        message: 'Formulário duplicado com sucesso!'
      });
    } catch (err: any) {
      console.error('[PreConsultationController.duplicateForm] Erro:', err);
      res.status(500).json({ error: 'Erro ao duplicar Formulário de Pré-consulta' });
    }
  }

  /**
   * Arquiva ou restaura um modelo de formulário sem afetar históricos
   */
  static archiveForm(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId as string;
      const { id } = req.params;
      const restore = req.body?.restore === true;

      if (!tenantId) {
        res.status(400).json({ error: 'Clínica não identificada' });
        return;
      }

      const nextStatus = restore ? 'active' : 'archived';
      const nextActive = restore ? 1 : 0;

      db.prepare(`
        UPDATE pre_consultation_forms
        SET status = ?, is_active = ?, updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ?
      `).run(nextStatus, nextActive, id, tenantId);

      res.json({
        success: true,
        id,
        status: nextStatus,
        message: restore ? 'Formulário restaurado com sucesso.' : 'Formulário arquivado com sucesso.'
      });
    } catch (err: any) {
      console.error('[PreConsultationController.archiveForm] Erro:', err);
      res.status(500).json({ error: 'Erro ao arquivar Formulário de Pré-consulta' });
    }
  }

  /**
   * 4.2. Prepara o envio ou reenvio de um formulário de Pré-consulta Digital para um agendamento
   */
  static prepareOrSendForAppointment(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId as string;
      const { appointmentId } = req.params;
      const { formId, expirationHours } = req.body;

      if (!tenantId) {
        res.status(400).json({ error: 'Clínica não identificada' });
        return;
      }

      const appt = db.prepare('SELECT id, pre_consultation_form_id FROM appointments WHERE id = ? AND tenant_id = ?').get(appointmentId, tenantId) as any;
      if (!appt) {
        res.status(404).json({ error: 'Agendamento não encontrado nesta clínica' });
        return;
      }

      const targetFormId = formId || appt.pre_consultation_form_id;
      if (!targetFormId) {
        res.status(400).json({ error: 'Selecione um Formulário de Pré-consulta para gerar o link seguro.' });
        return;
      }

      const baseUrl = buildPublicBaseUrl(req);
      const prepared = createPreConsultationSubmissionForAppointment({
        tenantId,
        appointmentId: String(appointmentId),
        formId: String(targetFormId),
        expirationHours: expirationHours ? Number(expirationHours) : 168,
        createdBy: req.user?.userId || null,
        baseUrl
      });

      if (!prepared) {
        res.status(404).json({ error: 'Formulário selecionado não encontrado ou arquivado.' });
        return;
      }

      res.status(201).json({
        success: true,
        ...prepared
      });
    } catch (err: any) {
      console.error('[PreConsultationController.prepareOrSendForAppointment] Erro:', err);
      res.status(500).json({ error: 'Erro ao preparar envio da Pré-consulta Digital' });
    }
  }

  /**
   * Revoga um link de Pré-consulta Digital ativo
   */
  static revokeSubmission(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId as string;
      const { id } = req.params;

      const sub = db.prepare('SELECT id, appointment_id, status FROM pre_consultation_submissions WHERE id = ? AND tenant_id = ?').get(id, tenantId) as any;
      if (!sub) {
        res.status(404).json({ error: 'Submissão de pré-consulta não encontrada' });
        return;
      }

      const now = nowBrazilIso();
      db.prepare(`
        UPDATE pre_consultation_submissions
        SET status = 'revoked', revoked_at = ?, updated_at = ?
        WHERE id = ? AND tenant_id = ?
      `).run(now, now, id, tenantId);

      if (sub.appointment_id) {
        db.prepare(`
          UPDATE appointments
          SET pre_consultation_status = 'revoked', updated_at = datetime('now')
          WHERE id = ? AND tenant_id = ?
        `).run(sub.appointment_id, tenantId);
      }

      res.json({
        success: true,
        id,
        status: 'revoked',
        statusLabel: PRE_CONSULTATION_STATUS_LABELS.revoked,
        message: 'Link de Pré-consulta revogado com sucesso.'
      });
    } catch (err: any) {
      console.error('[PreConsultationController.revokeSubmission] Erro:', err);
      res.status(500).json({ error: 'Erro ao revogar link de Pré-consulta' });
    }
  }

  /**
   * 4.5. Consulta status e detalhes da Pré-consulta de um agendamento.
   * REGRA DE PRIVACIDADE (Item 4.5): A recepção vê APENAS o status administrativo e o link para envio/reenvio,
   * NUNCA as respostas clínicas nem o mapa corporal.
   */
  static getByAppointment(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId as string;
      const { appointmentId } = req.params;
      if (!tenantId || !req.user) {
        res.status(401).json({ error: 'Não autenticado' });
        return;
      }

      const appt = db.prepare(`
        SELECT a.id, a.patient_id, a.professional_id, a.start_time,
               COALESCE(a.pre_consultation_status, 'not_sent') as pre_consultation_status,
               a.pre_consultation_form_id, a.pre_consultation_submission_id,
               pat.full_name as patient_name, pat.phone as patient_phone,
               t.name as clinic_name, t.trade_name as clinic_trade_name
        FROM appointments a
        JOIN patients pat ON pat.id = a.patient_id
        JOIN tenants t ON t.id = a.tenant_id
        WHERE a.id = ? AND a.tenant_id = ?
      `).get(appointmentId, tenantId) as any;

      if (!appt) {
        res.status(404).json({ error: 'Agendamento não encontrado' });
        return;
      }

      const sub = db.prepare(`
        SELECT s.*,
               v.title as version_title,
               v.description as version_description,
               v.instructions as version_instructions,
               v.include_zemda360_body_map as version_include_body_map,
               v.fields_json as version_fields_json,
               f.title as current_form_title
        FROM pre_consultation_submissions s
        LEFT JOIN pre_consultation_form_versions v ON v.id = s.form_version_id
        LEFT JOIN pre_consultation_forms f ON f.id = s.form_id
        WHERE s.tenant_id = ? AND s.appointment_id = ?
        ORDER BY s.created_at DESC
        LIMIT 1
      `).get(tenantId, appointmentId) as any;

      if (!sub) {
        res.json({
          appointmentId,
          status: 'not_sent',
          statusLabel: PRE_CONSULTATION_STATUS_LABELS.not_sent,
          submission: null
        });
        return;
      }

      let effectiveStatus: PreConsultationStatus = (sub.status as PreConsultationStatus) || 'pending';
      if (effectiveStatus === 'pending' && isExpiredIso(sub.expires_at)) {
        effectiveStatus = 'expired';
        db.prepare(`UPDATE pre_consultation_submissions SET status = 'expired' WHERE id = ? AND tenant_id = ?`).run(sub.id, tenantId);
        db.prepare(`UPDATE appointments SET pre_consultation_status = 'expired' WHERE id = ? AND tenant_id = ?`).run(appointmentId, tenantId);
      }

      const baseUrl = buildPublicBaseUrl(req);
      const publicUrl = `${baseUrl}/pre-consulta/${sub.token}`;
      const clinicDisplayName = appt.clinic_trade_name || appt.clinic_name || 'Clínica';
      const { whatsappUrl, messageText } = buildWhatsAppShareUrl(
        appt.patient_phone,
        appt.patient_name,
        clinicDisplayName,
        publicUrl,
        appt.start_time
      );

      const roleStr = String(req.user.role || '');
      const canSeeClinicalAnswers =
        (roleStr === 'clinic_admin' || roleStr === 'professional') &&
        hasClinicalAccess(req, appt.patient_id);

      let parsedFields: PreConsultationField[] = [];
      let parsedAnswers: Record<string, any> | null = null;
      let parsedBodyMap: any = null;

      if (canSeeClinicalAnswers) {
        try {
          parsedFields = JSON.parse(sub.version_fields_json || '[]');
        } catch {
          parsedFields = [];
        }
        try {
          parsedAnswers = sub.answers_json ? JSON.parse(sub.answers_json) : {};
        } catch {
          parsedAnswers = {};
        }
        try {
          parsedBodyMap = sub.body_map_json ? JSON.parse(sub.body_map_json) : null;
        } catch {
          parsedBodyMap = null;
        }
      }

      res.json({
        appointmentId,
        status: effectiveStatus,
        statusLabel: PRE_CONSULTATION_STATUS_LABELS[effectiveStatus] || effectiveStatus,
        clinicalRestricted: !canSeeClinicalAnswers,
        submission: {
          id: sub.id,
          formId: sub.form_id,
          formVersionId: sub.form_version_id,
          formVersion: sub.form_version,
          formTitle: sub.version_title || sub.current_form_title || 'Formulário de Pré-consulta',
          formDescription: sub.version_description || null,
          formInstructions: sub.version_instructions || null,
          includeZemda360BodyMap: Boolean(sub.version_include_body_map),
          status: effectiveStatus,
          statusLabel: PRE_CONSULTATION_STATUS_LABELS[effectiveStatus] || effectiveStatus,
          sentAt: sub.sent_at,
          submittedAt: sub.submitted_at,
          expiresAt: sub.expires_at,
          revokedAt: sub.revoked_at,
          publicUrl,
          whatsappUrl,
          messageText,
          respondentName: sub.respondent_name,
          respondentRelationship: sub.respondent_relationship,
          isGuardian: Boolean(sub.is_guardian),
          guardianName: sub.guardian_name,
          bodyMapImportedAt: sub.body_map_imported_at || null,
          bodyMapImportedAssessmentId: sub.body_map_imported_assessment_id || null,
          // Somente perfis clínicos autorizados recebem o conteúdo das respostas e mapa corporal
          fields: canSeeClinicalAnswers ? parsedFields : null,
          answers: canSeeClinicalAnswers ? parsedAnswers : null,
          bodyMap: canSeeClinicalAnswers ? parsedBodyMap : null
        }
      });
    } catch (err: any) {
      console.error('[PreConsultationController.getByAppointment] Erro:', err);
      res.status(500).json({ error: 'Erro ao consultar Pré-consulta do agendamento' });
    }
  }

  /**
   * Lista o histórico de Pré-consultas de um paciente (para o Prontuário ou Ficha do Paciente).
   * Se recepção, retorna apenas a lista administrativa de envios sem respostas clínicas.
   */
  static listByPatient(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId as string;
      const { patientId } = req.params;
      if (!tenantId || !req.user) {
        res.status(401).json({ error: 'Não autenticado' });
        return;
      }

      const roleStr = String(req.user.role || '');
      const canSeeClinicalAnswers =
        (roleStr === 'clinic_admin' || roleStr === 'professional') &&
        hasClinicalAccess(req, String(patientId));

      const rows = db.prepare(`
        SELECT s.*,
               v.title as version_title,
               v.include_zemda360_body_map as version_include_body_map,
               v.fields_json as version_fields_json,
               f.title as current_form_title,
               a.start_time as appointment_start_time,
               p.name as professional_name
        FROM pre_consultation_submissions s
        LEFT JOIN pre_consultation_form_versions v ON v.id = s.form_version_id
        LEFT JOIN pre_consultation_forms f ON f.id = s.form_id
        LEFT JOIN appointments a ON a.id = s.appointment_id
        LEFT JOIN professionals p ON p.id = s.professional_id
        WHERE s.tenant_id = ? AND s.patient_id = ?
        ORDER BY s.created_at DESC
      `).all(tenantId, patientId) as any[];

      const submissions = rows.map(sub => {
        let effectiveStatus: PreConsultationStatus = (sub.status as PreConsultationStatus) || 'pending';
        if (effectiveStatus === 'pending' && isExpiredIso(sub.expires_at)) {
          effectiveStatus = 'expired';
        }
        return {
          id: sub.id,
          appointmentId: sub.appointment_id,
          appointmentStartTime: sub.appointment_start_time,
          professionalName: sub.professional_name,
          formId: sub.form_id,
          formVersion: sub.form_version,
          formTitle: sub.version_title || sub.current_form_title || 'Formulário de Pré-consulta',
          includeZemda360BodyMap: Boolean(sub.version_include_body_map),
          status: effectiveStatus,
          statusLabel: PRE_CONSULTATION_STATUS_LABELS[effectiveStatus] || effectiveStatus,
          sentAt: sub.sent_at,
          submittedAt: sub.submitted_at,
          expiresAt: sub.expires_at,
          respondentName: sub.respondent_name,
          isGuardian: Boolean(sub.is_guardian),
          guardianName: sub.guardian_name,
          bodyMapImportedAt: sub.body_map_imported_at || null,
          bodyMapImportedAssessmentId: sub.body_map_imported_assessment_id || null,
          fields: canSeeClinicalAnswers ? (() => { try { return JSON.parse(sub.version_fields_json || '[]'); } catch { return []; } })() : null,
          answers: canSeeClinicalAnswers ? (() => { try { return sub.answers_json ? JSON.parse(sub.answers_json) : {}; } catch { return {}; } })() : null,
          bodyMap: canSeeClinicalAnswers ? (() => { try { return sub.body_map_json ? JSON.parse(sub.body_map_json) : null; } catch { return null; } })() : null
        };
      });

      res.json({
        patientId,
        clinicalRestricted: !canSeeClinicalAnswers,
        submissions
      });
    } catch (err: any) {
      console.error('[PreConsultationController.listByPatient] Erro:', err);
      res.status(500).json({ error: 'Erro ao listar histórico de Pré-consultas do paciente' });
    }
  }

  /**
   * 4.4. Importa explicitamente as marcações do Mapa Corporal Zemda360 informadas pelo paciente
   * na pré-consulta para uma Avaliação Clínica no Zemda360 (body_assessments / body_markers).
   * NUNCA ocorre automaticamente sem ação do profissional.
   */
  static importBodyMapToClinical(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId as string;
      const { id } = req.params;
      if (!tenantId || !req.user) {
        res.status(401).json({ error: 'Não autenticado' });
        return;
      }

      if (!hasZemda360Access(req)) {
        res.status(403).json({ error: 'Apenas profissionais autorizados no Zemda360 podem importar o mapa corporal para o prontuário.' });
        return;
      }

      const sub = db.prepare(`
        SELECT * FROM pre_consultation_submissions WHERE id = ? AND tenant_id = ?
      `).get(id, tenantId) as any;

      if (!sub) {
        res.status(404).json({ error: 'Submissão de pré-consulta não encontrada' });
        return;
      }

      if (!hasClinicalAccess(req, sub.patient_id)) {
        res.status(403).json({ error: 'Sem permissão de acesso clínico a este paciente.' });
        return;
      }

      let bodyMapData: any = null;
      try {
        bodyMapData = sub.body_map_json ? JSON.parse(sub.body_map_json) : null;
      } catch {
        bodyMapData = null;
      }

      const regions: any[] = Array.isArray(bodyMapData?.regions) ? bodyMapData.regions : [];
      if (regions.length === 0) {
        res.status(400).json({ error: 'Esta pré-consulta não possui regiões marcadas no Mapa Corporal Zemda360 para importar.' });
        return;
      }

      // Filtra apenas regiões selecionadas caso o profissional tenha escolhido um subconjunto na revisão
      const selectedRegionIds: string[] | null = Array.isArray(req.body?.selectedRegionIds) ? req.body.selectedRegionIds : null;
      const regionsToImport = selectedRegionIds
        ? regions.filter(r => selectedRegionIds.includes(r.regionId || r.id))
        : regions;

      if (regionsToImport.length === 0) {
        res.status(400).json({ error: 'Selecione ao menos uma região do mapa corporal para importar.' });
        return;
      }

      const dateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
      let existingAssessment = sub.appointment_id
        ? (db.prepare('SELECT * FROM body_assessments WHERE appointment_id = ? AND tenant_id = ? LIMIT 1').get(sub.appointment_id, tenantId) as any)
        : null;

      const summaryNotes = regionsToImport
        .map(
          (r: any) =>
            `• ${r.regionLabel || r.regionId} (${r.view === 'back' ? 'Costas' : 'Frente'}): ${r.complaintType || 'Queixa'}${
              r.intensity !== undefined ? ` — Intensidade ${r.intensity}/10` : ''
            }${r.notes ? ` (${r.notes})` : ''} [Informado pelo paciente na Pré-consulta]`
        )
        .join('\n');

      let assessmentId: string;
      if (existingAssessment) {
        assessmentId = existingAssessment.id;
        const mergedNotes = existingAssessment.notes
          ? `${existingAssessment.notes}\n\n[Importado da Pré-consulta Digital]:\n${summaryNotes}`
          : `[Importado da Pré-consulta Digital]:\n${summaryNotes}`;
        db.prepare(`
          UPDATE body_assessments
          SET notes = ?, updated_at = datetime('now')
          WHERE id = ? AND tenant_id = ?
        `).run(mergedNotes, assessmentId, tenantId);
      } else {
        assessmentId = 'ba-pc-' + uuidv4().slice(0, 8);
        const patGenderRow = db.prepare('SELECT gender, anthropometric_sex FROM patients WHERE id = ? AND tenant_id = ?').get(sub.patient_id, tenantId) as { gender?: string; anthropometric_sex?: string } | undefined;
        const resolvedBodyModel =
          patGenderRow?.anthropometric_sex === 'male' || patGenderRow?.gender === 'male' || patGenderRow?.gender === 'M'
            ? 'male'
            : 'female';
        db.prepare(`
          INSERT INTO body_assessments (
            id, tenant_id, patient_id, appointment_id, professional_id,
            module, body_model, assessment_date, notes, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, 'Zemda360', ?, ?, ?, datetime('now'), datetime('now'))
        `).run(
          assessmentId,
          tenantId,
          sub.patient_id,
          sub.appointment_id || null,
          sub.professional_id || null,
          resolvedBodyModel,
          dateStr,
          `[Importado da Pré-consulta Digital - Informado pelo paciente]:\n${summaryNotes}`
        );
      }

      const insertMarker = db.prepare(`
        INSERT INTO body_markers (
          id, tenant_id, assessment_id, body_region, side, view,
          marker_type, value, severity, notes, details_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `);

      const importedMarkers: any[] = [];
      for (const reg of regionsToImport) {
        const markerId = 'bm-pc-' + uuidv4().slice(0, 8);
        const rawRegionKey = String(reg.canonicalRegionId || reg.regionId || reg.id || 'regiao');
        const canonicalKey = resolveCanonicalZemda360RegionId(rawRegionKey);
        const side =
          reg.side === 'right' || reg.side === 'left' || reg.side === 'midline'
            ? reg.side
            : /_right$|direit/i.test(canonicalKey)
            ? 'right'
            : /_left$|esquerd/i.test(canonicalKey)
            ? 'left'
            : 'midline';
        const view =
          reg.view === 'back' || reg.view === 'left' || reg.view === 'right' ? reg.view : 'front';
        const markerType = String(reg.complaintType || 'pain');
        const severity = reg.intensity !== undefined ? String(reg.intensity) : null;
        const noteText = `[Informado pelo paciente na Pré-consulta] ${reg.notes || ''}`.trim();
        const details = JSON.stringify({
          source: 'patient_pre_consultation',
          submissionId: sub.id,
          canonicalRegionId: canonicalKey,
          originalRegionId: rawRegionKey,
          regionLabel: reg.regionLabel || canonicalKey,
          complaintType: markerType,
          intensity: reg.intensity ?? null,
          patientNotes: reg.notes || null
        });

        insertMarker.run(
          markerId,
          tenantId,
          assessmentId,
          canonicalKey,
          side,
          view,
          markerType,
          reg.regionLabel || canonicalKey,
          severity,
          noteText,
          details
        );
        importedMarkers.push({
          markerId,
          canonicalRegionId: canonicalKey,
          region: reg.regionLabel || canonicalKey,
          side,
          view,
          complaintType: markerType,
          intensity: reg.intensity
        });
      }

      const now = nowBrazilIso();
      db.prepare(`
        UPDATE pre_consultation_submissions
        SET body_map_imported_at = ?,
            body_map_imported_by = ?,
            body_map_imported_assessment_id = ?,
            updated_at = ?
        WHERE id = ? AND tenant_id = ?
      `).run(now, req.user.userId, assessmentId, now, id, tenantId);

      try {
        ClinicalRecordService.recordClinicalEvent({
          tenantId,
          patientId: sub.patient_id,
          professionalId: sub.professional_id || null,
          appointmentId: sub.appointment_id || null,
          moduleType: 'Zemda360',
          sourceId: assessmentId,
          sourceType: 'pre_consultation_body_map_import',
          title: 'Mapa Corporal Zemda360 — Importado da Pré-consulta Digital',
          procedureName: 'Revisão de Mapa Corporal (Pré-consulta)',
          sessionDate: dateStr,
          clinicalEvolution: `Regiões informadas pelo paciente na Pré-consulta Digital e revisadas/importadas pelo profissional:\n${summaryNotes}`,
          moduleData: {
            assessmentId,
            submissionId: sub.id,
            source: 'patient_pre_consultation',
            importedRegionsCount: importedMarkers.length,
            importedMarkers
          },
          createdBy: req.user.name || 'Profissional'
        });
      } catch (recErr) {
        console.warn('[PreConsultationController.importBodyMapToClinical] Aviso ao gravar evolução:', recErr);
      }

      res.json({
        success: true,
        assessmentId,
        importedCount: importedMarkers.length,
        importedMarkers,
        importedAt: now,
        message: 'Marcações do Mapa Corporal Zemda360 importadas com sucesso para a avaliação clínica!'
      });
    } catch (err: any) {
      console.error('[PreConsultationController.importBodyMapToClinical] Erro:', err);
      res.status(500).json({ error: 'Erro ao importar Mapa Corporal para o prontuário' });
    }
  }

  // ============================================================================
  // 4.3. ROTAS PÚBLICAS DO PACIENTE (/v1/public/pre-consultation/:token)
  // ============================================================================

  /**
   * Carrega o formulário público de Pré-consulta a partir do token imprevisível,
   * sem expor dados sensíveis na URL nem liberar prontuário.
   */
  static getPublicFormByToken(req: Request, res: Response): void {
    try {
      res.setHeader('X-Robots-Tag', 'noindex, nofollow');
      res.setHeader('Referrer-Policy', 'no-referrer');
      res.setHeader('Cache-Control', 'no-store, max-age=0');

      const token = String(req.params.token || '').trim();
      if (!token || token.length < 16) {
        res.status(404).json({ error: 'Link de Pré-consulta inválido ou não encontrado.' });
        return;
      }

      const sub = db.prepare(`
        SELECT s.*,
               v.title as version_title,
               v.description as version_description,
               v.instructions as version_instructions,
               v.include_zemda360_body_map as version_include_body_map,
               v.fields_json as version_fields_json,
               f.title as fallback_title,
               f.description as fallback_description,
               f.instructions as fallback_instructions,
               f.include_zemda360_body_map as fallback_include_body_map,
               f.fields_json as fallback_fields_json,
               pat.full_name as patient_name,
               pat.is_child as patient_is_child,
               pat.gender as patient_gender,
               pat.anthropometric_sex as patient_anthropometric_sex,
               (SELECT g.full_name FROM guardians g WHERE g.patient_id = pat.id LIMIT 1) as patient_guardian_name,
               p.name as professional_name,
               a.start_time as appointment_start_time,
               srv.name as service_name,
               t.name as clinic_name,
               t.trade_name as clinic_trade_name,
               t.logo_url as clinic_logo_url
        FROM pre_consultation_submissions s
        JOIN tenants t ON t.id = s.tenant_id
        JOIN patients pat ON pat.id = s.patient_id AND pat.tenant_id = s.tenant_id
        LEFT JOIN professionals p ON p.id = s.professional_id
        LEFT JOIN appointments a ON a.id = s.appointment_id
        LEFT JOIN services srv ON srv.id = a.service_id
        LEFT JOIN pre_consultation_form_versions v ON v.id = s.form_version_id
        LEFT JOIN pre_consultation_forms f ON f.id = s.form_id
        WHERE s.token = ?
        LIMIT 1
      `).get(token) as any;

      if (!sub) {
        res.status(404).json({ error: 'Link de Pré-consulta inválido ou não encontrado.' });
        return;
      }

      if (sub.status === 'revoked') {
        res.status(410).json({
          code: 'LINK_REVOKED',
          status: 'revoked',
          clinicName: sub.clinic_trade_name || sub.clinic_name,
          error: 'Este link de Pré-consulta foi revogado ou substituído por um novo envio da clínica.'
        });
        return;
      }

      if (sub.status === 'submitted') {
        res.json({
          alreadySubmitted: true,
          status: 'submitted',
          submittedAt: sub.submitted_at,
          clinicName: sub.clinic_trade_name || sub.clinic_name,
          clinicLogoUrl: sub.clinic_logo_url || null,
          professionalName: sub.professional_name || null,
          appointmentStartTime: sub.appointment_start_time || null,
          formTitle: sub.version_title || sub.fallback_title || 'Pré-consulta Digital',
          message: 'Suas informações de Pré-consulta já foram recebidas com segurança. Obrigado!'
        });
        return;
      }

      if (sub.status === 'expired' || isExpiredIso(sub.expires_at)) {
        if (sub.status !== 'expired') {
          db.prepare(`UPDATE pre_consultation_submissions SET status = 'expired' WHERE id = ?`).run(sub.id);
          if (sub.appointment_id) {
            db.prepare(`UPDATE appointments SET pre_consultation_status = 'expired' WHERE id = ?`).run(sub.appointment_id);
          }
        }
        res.status(410).json({
          code: 'LINK_EXPIRED',
          status: 'expired',
          clinicName: sub.clinic_trade_name || sub.clinic_name,
          error: 'O prazo de validade deste link de Pré-consulta expirou. Solicite um novo link à clínica caso necessário.'
        });
        return;
      }

      let fields: PreConsultationField[] = [];
      try {
        fields = JSON.parse(sub.version_fields_json || sub.fallback_fields_json || '[]');
      } catch {
        fields = [];
      }

      // Exibe apenas o primeiro nome e inicial do sobrenome para privacidade na tela pública
      const nameParts = String(sub.patient_name || 'Paciente').trim().split(/\s+/);
      const safePatientDisplayName =
        nameParts.length > 1
          ? `${nameParts[0]} ${nameParts[nameParts.length - 1][0]}.`
          : nameParts[0];

      const patientBodyModel: 'female' | 'male' =
        sub.patient_anthropometric_sex === 'male' ||
        sub.patient_gender === 'male' ||
        sub.patient_gender === 'M' ||
        sub.patient_gender === 'Masculino'
          ? 'male'
          : 'female';

      res.json({
        alreadySubmitted: false,
        status: 'pending',
        clinicName: sub.clinic_trade_name || sub.clinic_name,
        clinicLogoUrl: sub.clinic_logo_url || null,
        professionalName: sub.professional_name || null,
        serviceName: sub.service_name || null,
        appointmentStartTime: sub.appointment_start_time || null,
        patientDisplayName: safePatientDisplayName,
        patientFullName: sub.patient_name,
        patientBodyModel,
        isChild: Boolean(sub.patient_is_child),
        suggestedGuardianName: sub.patient_guardian_name || null,
        form: {
          title: sub.version_title || sub.fallback_title || 'Pré-consulta Digital',
          description: sub.version_description || sub.fallback_description || null,
          instructions: sub.version_instructions || sub.fallback_instructions || null,
          version: sub.form_version || 1,
          includeZemda360BodyMap: Boolean(sub.version_include_body_map ?? sub.fallback_include_body_map),
          fields
        },
        expiresAt: sub.expires_at
      });
    } catch (err: any) {
      console.error('[PreConsultationController.getPublicFormByToken] Erro:', err);
      res.status(500).json({ error: 'Erro ao carregar formulário de Pré-consulta' });
    }
  }

  /**
   * Recebe e salva as respostas da Pré-consulta Digital pelo paciente ou responsável legal,
   * bloqueando envios duplicados, links expirados/revogados e preservando a identificação de autoria do paciente.
   */
  static submitPublicFormByToken(req: Request, res: Response): void {
    try {
      res.setHeader('X-Robots-Tag', 'noindex, nofollow');
      res.setHeader('Referrer-Policy', 'no-referrer');
      res.setHeader('Cache-Control', 'no-store, max-age=0');

      const token = String(req.params.token || '').trim();
      if (!token || token.length < 16) {
        res.status(404).json({ error: 'Link de Pré-consulta inválido.' });
        return;
      }

      const sub = db.prepare(`
        SELECT s.*,
               v.fields_json as version_fields_json,
               v.include_zemda360_body_map as version_include_body_map,
               f.fields_json as fallback_fields_json,
               pat.full_name as patient_name,
               pat.is_child as patient_is_child
        FROM pre_consultation_submissions s
        JOIN patients pat ON pat.id = s.patient_id AND pat.tenant_id = s.tenant_id
        LEFT JOIN pre_consultation_form_versions v ON v.id = s.form_version_id
        LEFT JOIN pre_consultation_forms f ON f.id = s.form_id
        WHERE s.token = ?
        LIMIT 1
      `).get(token) as any;

      if (!sub) {
        res.status(404).json({ error: 'Formulário de Pré-consulta não encontrado.' });
        return;
      }

      if (sub.status === 'submitted') {
        res.status(409).json({
          code: 'DUPLICATE_SUBMISSION',
          error: 'Este formulário de Pré-consulta já foi respondido anteriormente. Não é necessário enviá-lo novamente.'
        });
        return;
      }

      if (sub.status === 'revoked') {
        res.status(410).json({
          code: 'LINK_REVOKED',
          error: 'Este link de Pré-consulta foi revogado pela clínica.'
        });
        return;
      }

      if (sub.status === 'expired' || isExpiredIso(sub.expires_at)) {
        db.prepare(`UPDATE pre_consultation_submissions SET status = 'expired' WHERE id = ?`).run(sub.id);
        if (sub.appointment_id) {
          db.prepare(`UPDATE appointments SET pre_consultation_status = 'expired' WHERE id = ?`).run(sub.appointment_id);
        }
        res.status(410).json({
          code: 'LINK_EXPIRED',
          error: 'O prazo de validade deste link de Pré-consulta expirou.'
        });
        return;
      }

      const {
        respondentName,
        respondentRelationship = 'self',
        isGuardian = false,
        guardianName,
        guardianCpf,
        answers = {},
        bodyMap = null
      } = req.body || {};

      const effectiveIsGuardian = Boolean(isGuardian) || Boolean(sub.patient_is_child) || respondentRelationship !== 'self';
      const finalRespondentName = String(respondentName || guardianName || sub.patient_name || '').trim();

      if (!finalRespondentName) {
        res.status(400).json({ error: 'Informe o nome de quem está preenchendo o formulário.' });
        return;
      }

      if (effectiveIsGuardian && (!guardianName && !respondentName)) {
        res.status(400).json({ error: 'Para preenchimento por responsável legal, informe o nome completo do responsável.' });
        return;
      }

      let fields: PreConsultationField[] = [];
      try {
        fields = JSON.parse(sub.version_fields_json || sub.fallback_fields_json || '[]');
      } catch {
        fields = [];
      }

      // Valida campos obrigatórios da versão do formulário
      for (const field of fields) {
        if (!field.required) continue;
        if (field.type === 'zemda360_body_map') {
          const regions = Array.isArray(bodyMap?.regions) ? bodyMap.regions : [];
          if (regions.length === 0) {
            res.status(400).json({ error: `O campo "${field.label}" é obrigatório.` });
            return;
          }
          continue;
        }
        const val = answers?.[field.id];
        const isEmpty =
          val === undefined ||
          val === null ||
          (typeof val === 'string' && !val.trim()) ||
          (Array.isArray(val) && val.length === 0);
        if (isEmpty) {
          res.status(400).json({ error: `O campo obrigatório "${field.label}" precisa ser preenchido.` });
          return;
        }
      }

      // Normaliza dados do Mapa Corporal Zemda360 identificando claramente que foram informados pelo paciente
      let normalizedBodyMap: any = null;
      if (bodyMap && Array.isArray(bodyMap.regions) && bodyMap.regions.length > 0) {
        normalizedBodyMap = {
          source: 'patient_pre_consultation',
          sourceLabel: 'Informado pelo paciente na Pré-consulta Digital',
          submittedBy: finalRespondentName,
          regions: bodyMap.regions.map((r: any, idx: number) => {
            const rawRegId = String(r.canonicalRegionId || r.regionId || r.id || `reg-${idx + 1}`);
            const canonicalId = resolveCanonicalZemda360RegionId(rawRegId);
            const resolvedSide =
              r.side === 'right' || r.side === 'left' || r.side === 'midline'
                ? r.side
                : /_right$|direit/i.test(canonicalId)
                ? 'right'
                : /_left$|esquerd/i.test(canonicalId)
                ? 'left'
                : 'midline';
            const resolvedView =
              r.view === 'back' || r.view === 'left' || r.view === 'right' ? r.view : 'front';
            return {
              id: String(r.id || `pcr-${canonicalId}`),
              regionId: canonicalId,
              canonicalRegionId: canonicalId,
              regionLabel: String(r.regionLabel || canonicalId || 'Região corporal'),
              view: resolvedView,
              side: resolvedSide,
              group: r.group ? String(r.group) : undefined,
              kind: r.kind === 'joint' ? 'joint' : 'region',
              complaintType: String(r.complaintType || 'dor'),
              intensity: typeof r.intensity === 'number' ? Math.max(0, Math.min(10, r.intensity)) : 5,
              notes: r.notes ? String(r.notes).trim() : '',
              source: 'patient_pre_consultation'
            };
          })
        };
      }

      const now = nowBrazilIso();
      db.prepare(`
        UPDATE pre_consultation_submissions
        SET status = 'submitted',
            respondent_name = ?,
            respondent_relationship = ?,
            is_guardian = ?,
            guardian_name = ?,
            guardian_cpf = ?,
            answers_json = ?,
            body_map_json = ?,
            submitted_at = ?,
            updated_at = ?
        WHERE id = ? AND tenant_id = ?
      `).run(
        finalRespondentName,
        effectiveIsGuardian ? String(respondentRelationship || 'guardian') : 'self',
        effectiveIsGuardian ? 1 : 0,
        effectiveIsGuardian ? String(guardianName || finalRespondentName) : null,
        guardianCpf ? String(guardianCpf).trim() : null,
        JSON.stringify(answers || {}),
        normalizedBodyMap ? JSON.stringify(normalizedBodyMap) : null,
        now,
        now,
        sub.id,
        sub.tenant_id
      );

      if (sub.appointment_id) {
        db.prepare(`
          UPDATE appointments
          SET pre_consultation_status = 'submitted',
              updated_at = datetime('now')
          WHERE id = ? AND tenant_id = ?
        `).run(sub.appointment_id, sub.tenant_id);
      }

      res.json({
        success: true,
        status: 'submitted',
        submittedAt: now,
        message: 'Formulário de Pré-consulta enviado com sucesso! Suas informações foram encaminhadas com segurança ao profissional responsável.'
      });
    } catch (err: any) {
      console.error('[PreConsultationController.submitPublicFormByToken] Erro:', err);
      res.status(500).json({ error: 'Erro ao enviar respostas da Pré-consulta' });
    }
  }
}
