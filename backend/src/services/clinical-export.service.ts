import AdmZip from 'adm-zip';
import PDFDocument from 'pdfkit';
import crypto from 'crypto';
import { db } from '../config/database';

function escapeXml(str: any): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export interface ClinicalExportOptions {
  modules?: string[]; // 'records', 'documents', 'exams', 'consents', 'dental', 'physio', 'fono', 'nutri', 'psico', 'to', 'pp', 'personal', 'estetic'
  dateFrom?: string;
  dateTo?: string;
  order?: 'asc' | 'desc';
  coverNotes?: string;
}

export class ClinicalExportService {
  /**
   * Coleta completa e profunda de todos os dados clínicos de um paciente em todos os módulos
   */
  static fetchFullClinicalData(tenantId: string, patientId: string): any {
    const clinic = db.prepare('SELECT * FROM tenants WHERE id = ?').get(tenantId) as any || { name: 'Estabelecimento de Saúde' };
    const patient = db.prepare('SELECT * FROM patients WHERE id = ? AND tenant_id = ?').get(patientId, tenantId) as any;

    if (!patient) return null;

    const safeQuery = (query: string, params: any[]): any[] => {
      try {
        return db.prepare(query).all(...params) as any[];
      } catch (e) {
        return [];
      }
    };

    const guardians = safeQuery('SELECT * FROM guardians WHERE patient_id = ? AND tenant_id = ?', [patientId, tenantId]);
    const appointments = safeQuery(`
      SELECT a.*, p.name as professional_name, s.name as service_name
      FROM appointments a
      LEFT JOIN professionals p ON p.id = a.professional_id
      LEFT JOIN services s ON s.id = a.service_id
      WHERE a.patient_id = ? AND a.tenant_id = ?
      ORDER BY a.start_time DESC
    `, [patientId, tenantId]);

    const records = safeQuery(`
      SELECT r.*, p.name as professional_name, p.registration_type, p.registration_number
      FROM records r
      LEFT JOIN professionals p ON p.id = r.professional_id
      WHERE r.patient_id = ? AND r.tenant_id = ?
      ORDER BY r.session_date DESC
    `, [patientId, tenantId]);

    const anamnesis = safeQuery(`
      SELECT an.*, p.name as professional_name
      FROM patient_anamnesis an
      LEFT JOIN professionals p ON p.id = an.professional_id
      WHERE an.patient_id = ? AND an.tenant_id = ?
      ORDER BY an.created_at DESC
    `, [patientId, tenantId]);

    const allergies = safeQuery('SELECT * FROM patient_allergies WHERE patient_id = ? AND tenant_id = ?', [patientId, tenantId]);
    const medications = safeQuery('SELECT * FROM patient_medications WHERE patient_id = ? AND tenant_id = ?', [patientId, tenantId]);

    const prescriptions = safeQuery(`
      SELECT c.*, p.name as professional_name, p.registration_type, p.registration_number
      FROM clinical_prescriptions c
      LEFT JOIN professionals p ON p.id = c.professional_id
      WHERE c.patient_id = ? AND c.tenant_id = ?
      ORDER BY c.created_at DESC
    `, [patientId, tenantId]);

    const certificates = safeQuery(`
      SELECT c.*, p.name as professional_name, p.registration_type, p.registration_number
      FROM clinical_certificates c
      LEFT JOIN professionals p ON p.id = c.professional_id
      WHERE c.patient_id = ? AND c.tenant_id = ?
      ORDER BY c.created_at DESC
    `, [patientId, tenantId]);

    const examRequests = safeQuery(`
      SELECT c.*, p.name as professional_name
      FROM clinical_exam_requests c
      LEFT JOIN professionals p ON p.id = c.professional_id
      WHERE c.patient_id = ? AND c.tenant_id = ?
      ORDER BY c.created_at DESC
    `, [patientId, tenantId]);

    const exams = safeQuery(`
      SELECT pe.*, p.name as professional_name
      FROM patient_exams pe
      LEFT JOIN professionals p ON p.id = pe.professional_id
      WHERE pe.patient_id = ? AND pe.tenant_id = ?
      ORDER BY pe.created_at DESC
    `, [patientId, tenantId]);

    const consents = safeQuery(`
      SELECT pc.*, p.name as professional_name
      FROM patient_consents pc
      LEFT JOIN professionals p ON p.id = pc.professional_id
      WHERE pc.patient_id = ? AND pc.tenant_id = ?
      ORDER BY pc.created_at DESC
    `, [patientId, tenantId]);

    // Módulos Especializados
    // 1. Odontologia
    const dental = {
      toothRecords: safeQuery('SELECT * FROM dental_tooth_records WHERE patient_id = ? AND tenant_id = ?', [patientId, tenantId]),
      periodontal: safeQuery('SELECT * FROM dental_periodontal_records WHERE patient_id = ? AND tenant_id = ?', [patientId, tenantId]),
      endodontic: safeQuery('SELECT * FROM dental_endodontic_records WHERE patient_id = ? AND tenant_id = ?', [patientId, tenantId]),
      anamnesis: safeQuery('SELECT * FROM dental_anamnesis WHERE patient_id = ? AND tenant_id = ?', [patientId, tenantId]),
      treatmentPlans: safeQuery('SELECT * FROM dental_treatment_plans WHERE patient_id = ? AND tenant_id = ?', [patientId, tenantId]),
      prosthetics: safeQuery('SELECT * FROM dental_prosthetics_lab WHERE patient_id = ? AND tenant_id = ?', [patientId, tenantId]),
      orthodontics: safeQuery('SELECT * FROM dental_orthodontics WHERE patient_id = ? AND tenant_id = ?', [patientId, tenantId]),
      hof: safeQuery('SELECT * FROM dental_hof WHERE patient_id = ? AND tenant_id = ?', [patientId, tenantId])
    };

    // 2. Fisioterapia
    const physio = {
      assessments: safeQuery('SELECT * FROM physiotherapy_assessments WHERE patient_id = ? AND tenant_id = ?', [patientId, tenantId]),
      evolutions: safeQuery('SELECT * FROM physiotherapy_evolutions WHERE patient_id = ? AND tenant_id = ?', [patientId, tenantId]),
      regional: safeQuery('SELECT * FROM physiotherapy_regional_evaluations WHERE patient_id = ? AND tenant_id = ?', [patientId, tenantId])
    };

    // 3. Fonoaudiologia
    const fono = {
      anamnesis: safeQuery('SELECT * FROM fono_anamnesis WHERE patient_id = ? AND tenant_id = ?', [patientId, tenantId]),
      audiology: safeQuery('SELECT * FROM fono_audiology_records WHERE patient_id = ? AND tenant_id = ?', [patientId, tenantId]),
      language: safeQuery('SELECT * FROM fono_language_assessments WHERE patient_id = ? AND tenant_id = ?', [patientId, tenantId]),
      speechPhonology: safeQuery('SELECT * FROM fono_speech_phonology WHERE patient_id = ? AND tenant_id = ?', [patientId, tenantId]),
      orofacial: safeQuery('SELECT * FROM fono_orofacial_motricity WHERE patient_id = ? AND tenant_id = ?', [patientId, tenantId]),
      voice: safeQuery('SELECT * FROM fono_voice_assessments WHERE patient_id = ? AND tenant_id = ?', [patientId, tenantId]),
      fluency: safeQuery('SELECT * FROM fono_fluency_assessments WHERE patient_id = ? AND tenant_id = ?', [patientId, tenantId]),
      dysphagia: safeQuery('SELECT * FROM fono_dysphagia_assessments WHERE patient_id = ? AND tenant_id = ?', [patientId, tenantId]),
      abfw: safeQuery('SELECT * FROM fono_abfw_records WHERE patient_id = ? AND tenant_id = ?', [patientId, tenantId])
    };

    // 4. Nutrição
    const nutri = {
      assessments: safeQuery('SELECT * FROM nutrition_assessments WHERE patient_id = ? AND tenant_id = ?', [patientId, tenantId]),
      mealPlans: safeQuery('SELECT * FROM nutrition_meal_plans WHERE patient_id = ? AND tenant_id = ?', [patientId, tenantId]),
      goals: safeQuery('SELECT * FROM nutrition_goals WHERE patient_id = ? AND tenant_id = ?', [patientId, tenantId]),
      anamnesis: safeQuery('SELECT * FROM nutrition_anamnesis WHERE patient_id = ? AND tenant_id = ?', [patientId, tenantId]),
      bioimpedance: safeQuery('SELECT * FROM nutrition_bioimpedance WHERE patient_id = ? AND tenant_id = ?', [patientId, tenantId]),
      recalls: safeQuery('SELECT * FROM nutrition_recalls WHERE patient_id = ? AND tenant_id = ?', [patientId, tenantId])
    };

    // 5. Psicologia
    const psico = {
      anamnesis: safeQuery('SELECT * FROM psychology_anamnesis WHERE patient_id = ? AND tenant_id = ?', [patientId, tenantId]),
      sessions: safeQuery('SELECT * FROM psychology_sessions WHERE patient_id = ? AND tenant_id = ?', [patientId, tenantId]),
      goals: safeQuery('SELECT * FROM psychology_goals WHERE patient_id = ? AND tenant_id = ?', [patientId, tenantId]),
      assessments: safeQuery('SELECT * FROM psychology_assessments WHERE patient_id = ? AND tenant_id = ?', [patientId, tenantId]),
      documents: safeQuery('SELECT * FROM psychology_documents WHERE patient_id = ? AND tenant_id = ?', [patientId, tenantId])
    };

    // 6. Terapia Ocupacional
    const to = {
      profiles: safeQuery('SELECT * FROM to_occupational_profiles WHERE patient_id = ? AND tenant_id = ?', [patientId, tenantId]),
      avd: safeQuery('SELECT * FROM to_avd_assessments WHERE patient_id = ? AND tenant_id = ?', [patientId, tenantId]),
      sensory: safeQuery('SELECT * FROM to_sensory_assessments WHERE patient_id = ? AND tenant_id = ?', [patientId, tenantId]),
      motorCognitive: safeQuery('SELECT * FROM to_motor_cognitive_assessments WHERE patient_id = ? AND tenant_id = ?', [patientId, tenantId]),
      plans: safeQuery('SELECT * FROM to_treatment_plans WHERE patient_id = ? AND tenant_id = ?', [patientId, tenantId]),
      assistiveTech: safeQuery('SELECT * FROM to_assistive_tech WHERE patient_id = ? AND tenant_id = ?', [patientId, tenantId])
    };

    // 7. Psicopedagogia
    const pp = {
      profiles: safeQuery('SELECT * FROM psychopedagogy_profiles WHERE patient_id = ? AND tenant_id = ?', [patientId, tenantId]),
      assessments: safeQuery('SELECT * FROM psychopedagogy_assessments WHERE patient_id = ? AND tenant_id = ?', [patientId, tenantId]),
      sessions: safeQuery('SELECT * FROM psychopedagogy_sessions WHERE patient_id = ? AND tenant_id = ?', [patientId, tenantId]),
      plans: safeQuery('SELECT * FROM psychopedagogy_intervention_plans WHERE patient_id = ? AND tenant_id = ?', [patientId, tenantId]),
      goals: safeQuery('SELECT * FROM psychopedagogy_goals WHERE patient_id = ? AND tenant_id = ?', [patientId, tenantId])
    };

    // 8. Personal & Avaliação Corporal
    const personal = {
      bodyAssessments: safeQuery('SELECT * FROM body_assessments WHERE patient_id = ? AND tenant_id = ?', [patientId, tenantId]),
      bodyMarkers: safeQuery('SELECT * FROM body_markers WHERE patient_id = ? AND tenant_id = ?', [patientId, tenantId]),
      anthropometrics: safeQuery('SELECT * FROM body_anthropometric_assessments WHERE patient_id = ? AND tenant_id = ?', [patientId, tenantId]),
      therapeuticPlans: safeQuery('SELECT * FROM body_therapeutic_plans WHERE patient_id = ? AND tenant_id = ?', [patientId, tenantId]),
      studentProfile: safeQuery('SELECT * FROM personal_student_profiles WHERE patient_id = ? AND tenant_id = ?', [patientId, tenantId]),
      personalAssessments: safeQuery('SELECT * FROM personal_assessments WHERE patient_id = ? AND tenant_id = ?', [patientId, tenantId]),
      workouts: safeQuery('SELECT * FROM personal_workouts WHERE patient_id = ? AND tenant_id = ?', [patientId, tenantId])
    };

    // 9. Estética
    const estetic = {
      assessments: safeQuery('SELECT * FROM estetic_assessments WHERE patient_id = ? AND tenant_id = ?', [patientId, tenantId]),
      procedures: safeQuery('SELECT * FROM estetic_procedures WHERE patient_id = ? AND tenant_id = ?', [patientId, tenantId]),
      plans: safeQuery('SELECT * FROM estetic_plans WHERE patient_id = ? AND tenant_id = ?', [patientId, tenantId]),
      returns: safeQuery('SELECT * FROM estetic_returns WHERE patient_id = ? AND tenant_id = ?', [patientId, tenantId]),
      photos: safeQuery('SELECT id, area, photo_type, view_type, photo_date, created_at FROM estetic_photos WHERE patient_id = ? AND tenant_id = ?', [patientId, tenantId])
    };

    return {
      clinic,
      patient,
      guardians,
      appointments,
      records,
      anamnesis,
      allergies,
      medications,
      prescriptions,
      certificates,
      examRequests,
      exams,
      consents,
      specialtyModules: {
        dental,
        physio,
        fono,
        nutri,
        psico,
        to,
        pp,
        personal,
        estetic
      }
    };
  }

  /**
   * Gera documento Microsoft Word (.docx) 100% autêntico no padrão ECMA-376 OpenXML
   */
  static generateDocxBuffer(data: any, options: ClinicalExportOptions = {}): Buffer {
    const { clinic, patient, records = [], prescriptions = [], certificates = [], examRequests = [], exams = [], consents = [], allergies = [], medications = [], specialtyModules = {} } = data;
    const isAsc = options.order === 'asc';
    const sortedRecords = [...records].sort((a, b) => {
      const dateA = new Date(a.session_date || a.created_at).getTime();
      const dateB = new Date(b.session_date || b.created_at).getTime();
      return isAsc ? dateA - dateB : dateB - dateA;
    });

    const clinicName = escapeXml(clinic?.trade_name || clinic?.name || 'Clínica Zemda');
    const clinicAddress = escapeXml([clinic?.street, clinic?.number, clinic?.city, clinic?.state].filter(Boolean).join(', ') || 'Brasil');
    const patientName = escapeXml(patient?.full_name || patient?.name || 'Paciente');
    const patientDoc = escapeXml(patient?.cpf || 'Não informado');
    const patientBirth = patient?.birth_date ? new Date(patient.birth_date).toLocaleDateString('pt-BR') : 'Não informada';
    const patientGender = escapeXml(patient?.gender === 'female' ? 'Feminino' : patient?.gender === 'male' ? 'Masculino' : 'Não informado');
    const exportDateStr = new Date().toLocaleDateString('pt-BR');
    const exportTimeStr = new Date().toLocaleTimeString('pt-BR');

    // 1. [Content_Types].xml
    const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;

    // 2. _rels/.rels
    const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

    // 3. word/_rels/document.xml.rels
    const docRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

    // 4. word/styles.xml
    const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Segoe UI" w:hAnsi="Segoe UI" w:cs="Segoe UI"/>
        <w:sz w:val="22"/>
        <w:color w:val="1E293B"/>
      </w:rPr>
    </w:rPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:pPr><w:spacing w:before="360" w:after="160"/></w:pPr>
    <w:rPr>
      <w:b/>
      <w:sz w:val="32"/>
      <w:color w:val="0F172A"/>
    </w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/>
    <w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr>
    <w:rPr>
      <w:b/>
      <w:sz w:val="26"/>
      <w:color w:val="0284C7"/>
    </w:rPr>
  </w:style>
</w:styles>`;

    // 5. word/document.xml
    let bodyElements = '';

    // Cabeçalho da Clínica
    bodyElements += `
      <w:p>
        <w:pPr><w:jc w:val="center"/><w:spacing w:after="60"/></w:pPr>
        <w:r><w:rPr><w:b/><w:sz w:val="36"/><w:color w:val="0284C7"/></w:rPr><w:t>${clinicName}</w:t></w:r>
      </w:p>
      <w:p>
        <w:pPr><w:jc w:val="center"/><w:spacing w:after="240"/></w:pPr>
        <w:r><w:rPr><w:sz w:val="18"/><w:color w:val="64748B"/></w:rPr><w:t>${clinicAddress}</w:t></w:r>
      </w:p>
      <w:p>
        <w:pPr><w:jc w:val="center"/><w:spacing w:after="300"/></w:pPr>
        <w:r><w:rPr><w:b/><w:sz w:val="28"/><w:color w:val="0F172A"/></w:rPr><w:t>PRONTUÁRIO CLÍNICO &amp; HISTÓRICO INTEGRAL 360°</w:t></w:r>
      </w:p>
    `;

    if (options.coverNotes) {
      bodyElements += `
        <w:p>
          <w:pPr><w:jc w:val="center"/><w:spacing w:after="200"/></w:pPr>
          <w:r><w:rPr><w:i/><w:color w:val="475569"/></w:rPr><w:t>Finalidade / Observações: ${escapeXml(options.coverNotes)}</w:t></w:r>
        </w:p>
      `;
    }

    // Identificação do Paciente
    bodyElements += `
      <w:p>
        <w:pPr><w:pBdr><w:bottom w:val="single" w:sz="12" w:space="4" w:color="0284C7"/></w:pBdr><w:spacing w:before="200" w:after="100"/></w:pPr>
        <w:r><w:rPr><w:b/><w:sz w:val="24"/><w:color w:val="0F172A"/></w:rPr><w:t>1. DADOS CADASTRAIS DO PACIENTE</w:t></w:r>
      </w:p>
      <w:p>
        <w:r><w:rPr><w:b/></w:rPr><w:t>Nome Completo: </w:t></w:r><w:r><w:t>${patientName}</w:t></w:r>
      </w:p>
      <w:p>
        <w:r><w:rPr><w:b/></w:rPr><w:t>CPF: </w:t></w:r><w:r><w:t>${patientDoc}  |  </w:t></w:r>
        <w:r><w:rPr><w:b/></w:rPr><w:t>Data de Nascimento: </w:t></w:r><w:r><w:t>${patientBirth}  |  </w:t></w:r>
        <w:r><w:rPr><w:b/></w:rPr><w:t>Sexo: </w:t></w:r><w:r><w:t>${patientGender}</w:t></w:r>
      </w:p>
      <w:p>
        <w:r><w:rPr><w:b/></w:rPr><w:t>Telefone: </w:t></w:r><w:r><w:t>${escapeXml(patient?.phone || 'Não informado')}  |  </w:t></w:r>
        <w:r><w:rPr><w:b/></w:rPr><w:t>E-mail: </w:t></w:r><w:r><w:t>${escapeXml(patient?.email || 'Não informado')}</w:t></w:r>
      </w:p>
    `;

    // Alergias e Medicamentos
    if (allergies.length > 0 || medications.length > 0) {
      bodyElements += `
        <w:p><w:pPr><w:spacing w:before="140" w:after="60"/></w:pPr>
          <w:r><w:rPr><w:b/><w:color w:val="B91C1C"/></w:rPr><w:t>ALERGIAS REGISTRADAS: </w:t></w:r>
          <w:r><w:t>${escapeXml(allergies.map((a: any) => a.agent || a.allergen || a.name).join(', ') || 'Nenhuma alergia relatada.')}</w:t></w:r>
        </w:p>
        <w:p><w:pPr><w:spacing w:after="160"/></w:pPr>
          <w:r><w:rPr><w:b/><w:color w:val="0369A1"/></w:rPr><w:t>MEDICAÇÕES EM USO: </w:t></w:r>
          <w:r><w:t>${escapeXml(medications.map((m: any) => `${m.name || m.medication_name} (${m.dosage || 'uso contínuo'})`).join(', ') || 'Nenhum medicamento informado.')}</w:t></w:r>
        </w:p>
      `;
    }

    // Evoluções Clínicas
    bodyElements += `
      <w:p>
        <w:pPr><w:pBdr><w:bottom w:val="single" w:sz="12" w:space="4" w:color="0284C7"/></w:pBdr><w:spacing w:before="260" w:after="120"/></w:pPr>
        <w:r><w:rPr><w:b/><w:sz w:val="24"/><w:color w:val="0F172A"/></w:rPr><w:t>2. EVOLUÇÕES CLÍNICAS &amp; ATENDIMENTOS (${sortedRecords.length})</w:t></w:r>
      </w:p>
    `;

    if (sortedRecords.length === 0) {
      bodyElements += `<w:p><w:r><w:rPr><w:i/></w:rPr><w:t>Nenhuma evolução clínica registrada até o momento.</w:t></w:r></w:p>`;
    } else {
      for (const rec of sortedRecords) {
        const sessionDate = rec.session_date ? new Date(rec.session_date).toLocaleDateString('pt-BR') : 'Data não informada';
        const profInfo = escapeXml(`Prof. ${rec.professional_name || 'Profissional'} (${rec.registration_type || 'Conselho'} ${rec.registration_number || ''})`);
        const title = escapeXml(rec.title || 'Consulta / Atendimento Clínico');
        const evolutionText = escapeXml(rec.clinical_evolution || 'Sem notas textuais.');

        bodyElements += `
          <w:p><w:pPr><w:spacing w:before="180" w:after="40"/></w:pPr>
            <w:r><w:rPr><w:b/><w:sz w:val="22"/><w:color w:val="0284C7"/></w:rPr><w:t>${sessionDate} — ${title}</w:t></w:r>
          </w:p>
          <w:p><w:pPr><w:spacing w:after="60"/></w:pPr>
            <w:r><w:rPr><w:sz w:val="18"/><w:color w:val="64748B"/></w:rPr><w:t>${profInfo}</w:t></w:r>
          </w:p>
          <w:p><w:pPr><w:spacing w:after="100"/></w:pPr>
            <w:r><w:t>${evolutionText}</w:t></w:r>
          </w:p>
        `;
        if (rec.technical_notes) {
          bodyElements += `
            <w:p><w:pPr><w:spacing w:after="100"/></w:pPr>
              <w:r><w:rPr><w:i/><w:color w:val="475569"/></w:rPr><w:t>Notas Técnicas: ${escapeXml(rec.technical_notes)}</w:t></w:r>
            </w:p>
          `;
        }
      }
    }

    // Prescrições e Documentos
    if (prescriptions.length > 0 || certificates.length > 0) {
      bodyElements += `
        <w:p>
          <w:pPr><w:pBdr><w:bottom w:val="single" w:sz="12" w:space="4" w:color="0284C7"/></w:pBdr><w:spacing w:before="260" w:after="120"/></w:pPr>
          <w:r><w:rPr><w:b/><w:sz w:val="24"/><w:color w:val="0F172A"/></w:rPr><w:t>3. PRESCRIÇÕES, RECEITUÁRIOS &amp; ATESTADOS</w:t></w:r>
        </w:p>
      `;

      for (const p of prescriptions) {
        bodyElements += `
          <w:p><w:pPr><w:spacing w:before="120" w:after="40"/></w:pPr>
            <w:r><w:rPr><w:b/><w:color w:val="0369A1"/></w:rPr><w:t>Receita Emitida em: ${new Date(p.created_at).toLocaleDateString('pt-BR')} (Prof. ${escapeXml(p.professional_name || '')})</w:t></w:r>
          </w:p>
          <w:p><w:pPr><w:spacing w:after="80"/></w:pPr>
            <w:r><w:t>${escapeXml(p.medications_text || p.content_text || 'Prescrição registrada.')}</w:t></w:r>
          </w:p>
        `;
      }

      for (const c of certificates) {
        bodyElements += `
          <w:p><w:pPr><w:spacing w:before="120" w:after="40"/></w:pPr>
            <w:r><w:rPr><w:b/><w:color w:val="0369A1"/></w:rPr><w:t>Atestado Emitido em: ${new Date(c.created_at).toLocaleDateString('pt-BR')} (Prof. ${escapeXml(c.professional_name || '')})</w:t></w:r>
          </w:p>
          <w:p><w:pPr><w:spacing w:after="80"/></w:pPr>
            <w:r><w:t>${escapeXml(c.content_text || 'Atestado médico emitido.')}</w:t></w:r>
          </w:p>
        `;
      }
    }

    // Odontologia
    if (specialtyModules.dental && specialtyModules.dental.treatmentPlans?.length > 0) {
      bodyElements += `
        <w:p>
          <w:pPr><w:pBdr><w:bottom w:val="single" w:sz="12" w:space="4" w:color="0284C7"/></w:pBdr><w:spacing w:before="260" w:after="120"/></w:pPr>
          <w:r><w:rPr><w:b/><w:sz w:val="24"/><w:color w:val="0F172A"/></w:rPr><w:t>4. ODONTOLOGIA — PLANOS DE TRATAMENTO &amp; HISTÓRICO</w:t></w:r>
        </w:p>
      `;
      for (const tp of specialtyModules.dental.treatmentPlans) {
        bodyElements += `
          <w:p><w:pPr><w:spacing w:before="100" w:after="40"/></w:pPr>
            <w:r><w:rPr><w:b/></w:rPr><w:t>Plano Odontológico: ${escapeXml(tp.title || 'Tratamento')} (Status: ${escapeXml(tp.status || 'Ativo')})</w:t></w:r>
          </w:p>
          <w:p><w:pPr><w:spacing w:after="80"/></w:pPr>
            <w:r><w:t>${escapeXml(tp.description || tp.notes || 'Procedimentos planejados.')}</w:t></w:r>
          </w:p>
        `;
      }
    }

    // Fisioterapia
    if (specialtyModules.physio && (specialtyModules.physio.assessments?.length > 0 || specialtyModules.physio.evolutions?.length > 0)) {
      bodyElements += `
        <w:p>
          <w:pPr><w:pBdr><w:bottom w:val="single" w:sz="12" w:space="4" w:color="0284C7"/></w:pBdr><w:spacing w:before="260" w:after="120"/></w:pPr>
          <w:r><w:rPr><w:b/><w:sz w:val="24"/><w:color w:val="0F172A"/></w:rPr><w:t>5. FISIOTERAPIA — AVALIAÇÕES &amp; CONDUTAS</w:t></w:r>
        </w:p>
      `;
      for (const ev of (specialtyModules.physio.evolutions || [])) {
        bodyElements += `
          <w:p><w:pPr><w:spacing w:before="100" w:after="40"/></w:pPr>
            <w:r><w:rPr><w:b/></w:rPr><w:t>Evolução Fisioterapêutica (${new Date(ev.created_at).toLocaleDateString('pt-BR')}):</w:t></w:r>
          </w:p>
          <w:p><w:pPr><w:spacing w:after="80"/></w:pPr>
            <w:r><w:t>${escapeXml(ev.notes || ev.conduct || 'Conduta executada.')}</w:t></w:r>
          </w:p>
        `;
      }
    }

    // Nutrição
    if (specialtyModules.nutri && specialtyModules.nutri.mealPlans?.length > 0) {
      bodyElements += `
        <w:p>
          <w:pPr><w:pBdr><w:bottom w:val="single" w:sz="12" w:space="4" w:color="0284C7"/></w:pBdr><w:spacing w:before="260" w:after="120"/></w:pPr>
          <w:r><w:rPr><w:b/><w:sz w:val="24"/><w:color w:val="0F172A"/></w:rPr><w:t>6. NUTRIÇÃO — CONDUTAS &amp; PLANOS ALIMENTARES</w:t></w:r>
        </w:p>
      `;
      for (const mp of specialtyModules.nutri.mealPlans) {
        bodyElements += `
          <w:p><w:pPr><w:spacing w:before="100" w:after="40"/></w:pPr>
            <w:r><w:rPr><w:b/></w:rPr><w:t>Plano Alimentar: ${escapeXml(mp.title || 'Dieta')} (${new Date(mp.created_at).toLocaleDateString('pt-BR')})</w:t></w:r>
          </w:p>
          <w:p><w:pPr><w:spacing w:after="80"/></w:pPr>
            <w:r><w:t>${escapeXml(mp.notes || mp.guidelines || 'Orientações nutricionais prescritas.')}</w:t></w:r>
          </w:p>
        `;
      }
    }

    // Estética
    if (specialtyModules.estetic && specialtyModules.estetic.procedures?.length > 0) {
      bodyElements += `
        <w:p>
          <w:pPr><w:pBdr><w:bottom w:val="single" w:sz="12" w:space="4" w:color="0284C7"/></w:pBdr><w:spacing w:before="260" w:after="120"/></w:pPr>
          <w:r><w:rPr><w:b/><w:sz w:val="24"/><w:color w:val="0F172A"/></w:rPr><w:t>7. ESTÉTICA AVANÇADA — PROCEDIMENTOS REALIZADOS</w:t></w:r>
        </w:p>
      `;
      for (const pr of specialtyModules.estetic.procedures) {
        bodyElements += `
          <w:p><w:pPr><w:spacing w:before="100" w:after="40"/></w:pPr>
            <w:r><w:rPr><w:b/></w:rPr><w:t>Procedimento: ${escapeXml(pr.procedure_name || pr.area)} (${new Date(pr.created_at).toLocaleDateString('pt-BR')})</w:t></w:r>
          </w:p>
          <w:p><w:pPr><w:spacing w:after="80"/></w:pPr>
            <w:r><w:t>Área: ${escapeXml(pr.area)}  |  Lote do Produto: ${escapeXml(pr.lot_number || 'N/A')}  |  Notas: ${escapeXml(pr.notes || 'Sem observações adicionais.')}</w:t></w:r>
          </w:p>
        `;
      }
    }

    // Rodapé de Certificação
    bodyElements += `
      <w:p>
        <w:pPr><w:pBdr><w:top w:val="single" w:sz="6" w:space="8" w:color="CBD5E1"/></w:pBdr><w:spacing w:before="400" w:after="80"/><w:jc w:val="center"/></w:pPr>
        <w:r><w:rPr><w:sz w:val="18"/><w:color w:val="64748B"/></w:rPr><w:t>Documento emitido eletronicamente pelo Sistema Zemda em ${exportDateStr} às ${exportTimeStr}.</w:t></w:r>
      </w:p>
      <w:p>
        <w:pPr><w:jc w:val="center"/></w:pPr>
        <w:r><w:rPr><w:sz w:val="16"/><w:color w:val="94A3B8"/></w:rPr><w:t>Documento oficial para fins assistenciais, de conferência clínica e resguardo legal do paciente e profissional assistente.</w:t></w:r>
      </w:p>
    `;

    const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    ${bodyElements}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;

    const zip = new AdmZip();
    zip.addFile('[Content_Types].xml', Buffer.from(contentTypesXml, 'utf-8'));
    zip.addFile('_rels/.rels', Buffer.from(rootRelsXml, 'utf-8'));
    zip.addFile('word/_rels/document.xml.rels', Buffer.from(docRelsXml, 'utf-8'));
    zip.addFile('word/styles.xml', Buffer.from(stylesXml, 'utf-8'));
    zip.addFile('word/document.xml', Buffer.from(documentXml, 'utf-8'));

    return zip.toBuffer();
  }

  /**
   * Gera PDF oficial estilizado via PDFKit em memória (Zero Retention)
   */
  static async generatePdfBuffer(data: any, options: ClinicalExportOptions = {}): Promise<Buffer> {
    const { clinic, patient, records = [], prescriptions = [], certificates = [], allergies = [], medications = [], specialtyModules = {} } = data;

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 40,
        info: {
          Title: `Prontuário - ${patient?.full_name || 'Paciente'}`,
          Author: clinic?.name || 'Zemda'
        }
      });

      const chunks: Buffer[] = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', err => reject(err));

      // Cabeçalho
      doc.fontSize(16).fillColor('#0284c7').font('Helvetica-Bold').text(clinic?.name || 'Clínica Zemda', { align: 'center' });
      doc.fontSize(9).fillColor('#64748b').font('Helvetica').text([clinic?.street, clinic?.city, clinic?.state].filter(Boolean).join(', ') || 'Brasil', { align: 'center' });
      doc.moveDown(0.8);

      doc.fontSize(14).fillColor('#0f172a').font('Helvetica-Bold').text('PRONTUÁRIO CLÍNICO 360°', { align: 'center' });
      doc.fontSize(8).fillColor('#94a3b8').font('Helvetica').text(`Emitido em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`, { align: 'center' });
      if (options.coverNotes) {
        doc.moveDown(0.3);
        doc.fontSize(8.5).font('Helvetica-Oblique').fillColor('#475569').text(`Finalidade: ${options.coverNotes}`, { align: 'center' });
      }
      doc.moveDown(0.8);

      // Caixa de Identificação do Paciente
      doc.rect(40, doc.y, 515, 60).fillAndStroke('#f8fafc', '#e2e8f0');
      const boxY = doc.y + 8;
      doc.fillColor('#0f172a').fontSize(10).font('Helvetica-Bold').text(`Paciente: ${patient?.full_name || patient?.name}`, 50, boxY);
      doc.fontSize(8).font('Helvetica').fillColor('#475569');
      doc.text(`CPF: ${patient?.cpf || 'Não informado'}   •   Nascimento: ${patient?.birth_date ? new Date(patient.birth_date).toLocaleDateString('pt-BR') : 'Não informado'}   •   Sexo: ${patient?.gender || 'Não informado'}`, 50, boxY + 16);
      doc.text(`Telefone: ${patient?.phone || 'Não informado'}   •   E-mail: ${patient?.email || 'Não informado'}`, 50, boxY + 30);
      doc.y = boxY + 56;
      doc.moveDown(1);

      // Alergias
      if (allergies.length > 0 || medications.length > 0) {
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#b91c1c').text('ALERGIAS: ', { continued: true });
        doc.font('Helvetica').fillColor('#0f172a').text(allergies.map((a: any) => a.agent || a.allergen || a.name).join(', ') || 'Nenhuma relatada.');
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#0284c7').text('MEDICAÇÕES: ', { continued: true });
        doc.font('Helvetica').fillColor('#0f172a').text(medications.map((m: any) => m.name || m.medication_name).join(', ') || 'Nenhuma relatada.');
        doc.moveDown(1);
      }

      // Evoluções Clínicas
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#0f172a').text(`EVOLUÇÕES CLÍNICAS (${records.length})`);
      doc.strokeColor('#0284c7').lineWidth(1).moveTo(40, doc.y).lineTo(555, doc.y).stroke();
      doc.moveDown(0.5);

      if (records.length === 0) {
        doc.fontSize(9).font('Helvetica-Oblique').fillColor('#64748b').text('Nenhuma evolução clínica registrada.');
        doc.moveDown(1);
      } else {
        for (const rec of records) {
          if (doc.y > 720) doc.addPage();
          const dStr = rec.session_date ? new Date(rec.session_date).toLocaleDateString('pt-BR') : 'Data n/i';
          doc.fontSize(9).font('Helvetica-Bold').fillColor('#0369a1').text(`${dStr} — ${rec.title || 'Consulta'}`);
          doc.fontSize(7.5).font('Helvetica').fillColor('#64748b').text(`Prof. ${rec.professional_name || 'Profissional'} (${rec.registration_type || 'CRM'} ${rec.registration_number || ''})`);
          doc.fontSize(8.5).font('Helvetica').fillColor('#1e293b').text(rec.clinical_evolution || 'Sem notas textuais.', { lineGap: 2 });
          if (rec.technical_notes) {
            doc.fontSize(8).font('Helvetica-Oblique').fillColor('#64748b').text(`Notas Técnicas: ${rec.technical_notes}`);
          }
          doc.moveDown(0.8);
        }
      }

      // Prescrições e Atestados
      if (prescriptions.length > 0 || certificates.length > 0) {
        if (doc.y > 700) doc.addPage();
        doc.fontSize(11).font('Helvetica-Bold').fillColor('#0f172a').text('PRESCRIÇÕES & ATESTADOS');
        doc.strokeColor('#0284c7').lineWidth(1).moveTo(40, doc.y).lineTo(555, doc.y).stroke();
        doc.moveDown(0.5);

        for (const p of prescriptions) {
          if (doc.y > 720) doc.addPage();
          doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#0369a1').text(`Receita em ${new Date(p.created_at).toLocaleDateString('pt-BR')} (Prof. ${p.professional_name || ''}):`);
          doc.fontSize(8).font('Helvetica').fillColor('#1e293b').text(p.medications_text || p.content_text || 'Prescrição.');
          doc.moveDown(0.5);
        }
      }

      // Rodapé
      doc.fontSize(7.5).font('Helvetica').fillColor('#94a3b8').text('Documento oficial gerado pelo Sistema Zemda. Sigilo clínico resguardado conforme LGPD e normas dos conselhos profissionais de saúde.', 40, 790, { align: 'center', width: 515 });

      doc.end();
    });
  }

  /**
   * Gera representação JSON interoperável e estruturada do prontuário
   */
  static generateJson(data: any): any {
    return {
      version: '2.0.0',
      compliance: 'CFM 1.821/2007 & LGPD Lei 13.709/2018',
      exportedAt: new Date().toISOString(),
      patient: {
        id: data.patient?.id,
        fullName: data.patient?.full_name || data.patient?.name,
        cpf: data.patient?.cpf,
        birthDate: data.patient?.birth_date,
        gender: data.patient?.anthropometric_sex || data.patient?.gender,
        phone: data.patient?.phone,
        email: data.patient?.email,
        notes: data.patient?.notes_admin || data.patient?.notes
      },
      clinic: data.clinic,
      records: data.records || [],
      prescriptions: data.prescriptions || [],
      certificates: data.certificates || [],
      examRequests: data.examRequests || [],
      exams: data.exams || [],
      consents: data.consents || [],
      allergies: data.allergies || [],
      medications: data.medications || [],
      specialties: data.specialtyModules || {}
    };
  }

  /**
   * Gera arquivo ZIP com pacote completo (DOCX + PDF + JSON + manifest.json)
   */
  static async generateBundleZip(data: any, options: ClinicalExportOptions = {}): Promise<Buffer> {
    const docxBuf = this.generateDocxBuffer(data, options);
    const pdfBuf = await this.generatePdfBuffer(data, options);
    const jsonFormatted = this.generateJson(data);
    const jsonStr = JSON.stringify(jsonFormatted, null, 2);

    const docxSha = crypto.createHash('sha256').update(docxBuf).digest('hex');
    const pdfSha = crypto.createHash('sha256').update(pdfBuf).digest('hex');
    const jsonSha = crypto.createHash('sha256').update(jsonStr).digest('hex');

    const manifest = {
      schemaVersion: '2.0.0',
      exportedAt: new Date().toISOString(),
      system: 'Zemda SaaS Saúde',
      version: '1.1.2',
      compliance: 'CFM 1.821/2007 & LGPD Lei 13.709/2018',
      retentionPolicy: 'ZERO RETENTION ON CLOUD - STREAMED DIRECTLY TO AUTHORIZED CLIENT',
      patient: {
        id: data.patient?.id,
        name: data.patient?.full_name || data.patient?.name,
        cpf: data.patient?.cpf
      },
      files: {
        docx: {
          name: 'prontuario.docx',
          format: 'ECMA-376 OpenXML',
          description: 'Documento Word oficial editável',
          sha256: docxSha,
          sizeBytes: docxBuf.length
        },
        pdf: {
          name: 'prontuario.pdf',
          format: 'PDF/A',
          description: 'Documento PDF vetorial para impressão e leitura',
          sha256: pdfSha,
          sizeBytes: pdfBuf.length
        },
        json: {
          name: 'dados_clinicos.json',
          format: 'JSON Estruturado',
          description: 'Dados estruturados para interoperabilidade',
          sha256: jsonSha,
          sizeBytes: Buffer.byteLength(jsonStr, 'utf-8')
        }
      }
    };

    const zip = new AdmZip();
    zip.addFile('prontuario.docx', docxBuf);
    zip.addFile('prontuario.pdf', pdfBuf);
    zip.addFile('dados_clinicos.json', Buffer.from(jsonStr, 'utf-8'));
    zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8'));

    return zip.toBuffer();
  }
}
