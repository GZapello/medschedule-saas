import { Request, Response } from 'express';
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { logAudit } from '../middlewares/audit.middleware';

/**
 * Validação de sigilo e privacidade do paciente por profissional (Itens 7, 8, 9, 48 - LGPD)
 * Regra: Um profissional só acessa o prontuário completo de pacientes para os quais possui:
 * - Consulta agendada ou realizada;
 * - Encaminhamento ativo atribuído a ele;
 * - Autoria de prontuário existente;
 * - Ou permissão expressa de supervisão clínica.
 */
export function hasClinicalAccess(req: Request, patientId: string): boolean {
  if (!req.user) return false;
  if (req.user.role === 'superadmin') return true;

  const tenantId = req.tenantId;

  // Se gestor/admin da clínica, verificar permissão assistencial
  if (req.user.role === 'clinic_admin') {
    const clinicUser = db.prepare('SELECT permissions_json, is_manager FROM clinic_users WHERE user_id = ? AND tenant_id = ?').get(req.user.userId, tenantId) as any;
    if (clinicUser?.permissions_json && (clinicUser.permissions_json.includes('clinical_access_all') || clinicUser.permissions_json.includes('clinical_records_all'))) {
      return true;
    }
  }

  // Se profissional de saúde
  const prof = db.prepare('SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ?').get(req.user.userId, tenantId) as any;
  if (prof) {
    const profId = prof.id;

    // 1. Possui ou possuiu consulta agendada com este paciente
    const hasAppt = db.prepare('SELECT 1 FROM appointments WHERE tenant_id = ? AND patient_id = ? AND professional_id = ? LIMIT 1').get(tenantId, patientId, profId);
    if (hasAppt) return true;

    // 2. Possui encaminhamento ativo destinado a este profissional (Item 9)
    const hasReferral = db.prepare('SELECT 1 FROM patient_referrals WHERE tenant_id = ? AND patient_id = ? AND to_professional_id = ? LIMIT 1').get(tenantId, patientId, profId);
    if (hasReferral) return true;

    // 3. Foi autor de evolução clínica prévia
    const hasRecord = db.prepare('SELECT 1 FROM records WHERE tenant_id = ? AND patient_id = ? AND professional_id = ? LIMIT 1').get(tenantId, patientId, profId);
    if (hasRecord) return true;

    return false;
  }

  // Demais perfis administrativos (Recepção / Secretária): sem acesso clínico salvo permissão específica
  const cu = db.prepare('SELECT permissions_json FROM clinic_users WHERE user_id = ? AND tenant_id = ?').get(req.user.userId, tenantId) as any;
  if (cu?.permissions_json && cu.permissions_json.includes('clinical_records_all')) {
    return true;
  }

  return false;
}

export class ClinicalController {
  // 1. Lista prontuários e evoluções de um paciente específico (com verificação estrita de privacidade)
  static listByPatient(req: Request, res: Response): void {
    try {
      const patientId = req.params.patientId as string;
      const tenantId = req.tenantId;

      if (!req.user) {
        res.status(401).json({ error: 'Usuário não autenticado' });
        return;
      }

      // Validação estrita de privacidade e vínculo assistencial (Itens 7 e 8)
      if (!hasClinicalAccess(req, patientId)) {
        res.status(403).json({
          error: 'Acesso clínico restrito: profissional não possui consulta agendada, histórico de atendimento ou encaminhamento ativo vinculado a este paciente (Sigilo LGPD).',
          code: 'CLINICAL_PRIVACY_RESTRICTION'
        });
        return;
      }

      const stmt = db.prepare(`
        SELECT 
          r.id, r.tenant_id, r.patient_id, r.appointment_id, r.professional_id,
          r.session_date, r.title, r.clinical_evolution, r.technical_notes, r.private_notes,
          r.is_sealed, r.created_by, r.updated_by, r.edit_history_json, r.created_at, r.updated_at,
          p.name as professional_name, p.registration_type, p.registration_number,
          (SELECT COUNT(*) FROM documents WHERE record_id = r.id) as total_attachments
        FROM records r
        JOIN professionals p ON p.id = r.professional_id
        WHERE r.patient_id = ? AND r.tenant_id = ?
        ORDER BY r.session_date DESC, r.created_at DESC
      `);
      const records = stmt.all(patientId, tenantId);

      logAudit(req, 'VIEW_CLINICAL_RECORDS', 'records', patientId, { totalViewed: records.length });
      res.json(records);
    } catch (err: any) {
      console.error('[ClinicalController.listByPatient] Erro:', err);
      res.status(500).json({ error: 'Erro ao consultar prontuários clínicos' });
    }
  }

  // 2. Detalhes de uma evolução específica
  static getById(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;

      const record = db.prepare(`
        SELECT 
          r.*,
          p.name as professional_name, p.registration_type, p.registration_number,
          pat.full_name as patient_name, pat.cpf as patient_cpf, pat.birth_date as patient_birth_date
        FROM records r
        JOIN professionals p ON p.id = r.professional_id
        JOIN patients pat ON pat.id = r.patient_id
        WHERE r.id = ? AND r.tenant_id = ?
      `).get(id, tenantId) as any;

      if (!record) {
        res.status(404).json({ error: 'Prontuário não encontrado' });
        return;
      }

      if (!hasClinicalAccess(req, record.patient_id)) {
        res.status(403).json({ error: 'Acesso restrito ao prontuário deste paciente' });
        return;
      }

      res.json(record);
    } catch (err: any) {
      console.error('[ClinicalController.getById] Erro:', err);
      res.status(500).json({ error: 'Erro ao consultar prontuário' });
    }
  }

  // 3. Cria nova evolução ou anotação de sessão
  static create(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const { patientId, appointmentId, professionalId, sessionDate, title, clinicalEvolution, technicalNotes, privateNotes, isSealed } = req.body;

      if (!patientId || !sessionDate || !title) {
        res.status(400).json({ error: 'Paciente, data da sessão e título são obrigatórios' });
        return;
      }

      // Se não enviou professionalId explicitamente, resolve a partir do usuário autenticado
      let resolvedProfId = professionalId;
      if (!resolvedProfId && req.user) {
        const prof = db.prepare('SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ?').get(req.user.userId, tenantId) as { id: string } | undefined;
        if (prof) resolvedProfId = prof.id;
      }

      if (!resolvedProfId) {
        res.status(400).json({ error: 'Profissional responsável não identificado' });
        return;
      }

      const id = 'rec-' + uuidv4().slice(0, 8);
      const creatorName = req.user?.name || req.user?.email || 'Profissional';

      const insertStmt = db.prepare(`
        INSERT INTO records (
          id, tenant_id, patient_id, appointment_id, professional_id,
          session_date, title, clinical_evolution, technical_notes, private_notes,
          is_sealed, created_by, updated_by, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `);

      insertStmt.run(
        id,
        tenantId,
        patientId,
        appointmentId || null,
        resolvedProfId,
        sessionDate,
        title,
        clinicalEvolution || null,
        technicalNotes || null,
        privateNotes || null,
        isSealed ? 1 : 0,
        creatorName,
        creatorName
      );

      logAudit(req, 'CREATE_CLINICAL_RECORD', 'records', id, { patientId, title, isSealed });
      res.status(201).json({ id, message: 'Registro clínico / evolução gravado com sucesso' });
    } catch (err: any) {
      console.error('[ClinicalController.create] Erro:', err);
      res.status(500).json({ error: 'Erro ao registrar evolução clínica' });
    }
  }

  // 4. Atualiza evolução com trilha de autoria e versionamento (Item 11)
  static update(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;
      const { title, clinicalEvolution, technicalNotes, privateNotes, isSealed } = req.body;

      const record = db.prepare('SELECT * FROM records WHERE id = ? AND tenant_id = ?').get(id, tenantId) as any;
      if (!record) {
        res.status(404).json({ error: 'Registro não encontrado' });
        return;
      }

      if (record.is_sealed === 1 && !req.body.overrideSealed) {
        res.status(403).json({ error: 'Este prontuário foi lacrado e não pode ser sobrescrito diretamente (integridade legal)' });
        return;
      }

      const editorName = req.user?.name || req.user?.email || 'Operador';

      // Constrói histórico de versionamento (Item 11)
      let history: any[] = [];
      try {
        if (record.edit_history_json) {
          history = JSON.parse(record.edit_history_json);
        }
      } catch (_) {}

      history.push({
        edited_by: editorName,
        edited_at: new Date().toISOString(),
        previous_title: record.title,
        previous_evolution: record.clinical_evolution,
        previous_session_date: record.session_date
      });

      const updateStmt = db.prepare(`
        UPDATE records SET
          title = COALESCE(?, title),
          clinical_evolution = COALESCE(?, clinical_evolution),
          technical_notes = COALESCE(?, technical_notes),
          private_notes = COALESCE(?, private_notes),
          is_sealed = COALESCE(?, is_sealed),
          updated_by = ?,
          edit_history_json = ?,
          updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ?
      `);

      updateStmt.run(
        title !== undefined ? title : null,
        clinicalEvolution !== undefined ? clinicalEvolution : null,
        technicalNotes !== undefined ? technicalNotes : null,
        privateNotes !== undefined ? privateNotes : null,
        isSealed !== undefined ? (isSealed ? 1 : 0) : null,
        editorName,
        JSON.stringify(history),
        id,
        tenantId
      );

      logAudit(req, 'UPDATE_CLINICAL_RECORD', 'records', id, { editorName, versionCount: history.length });
      res.json({ message: 'Evolução clínica atualizada e versionada com sucesso!' });
    } catch (err: any) {
      console.error('[ClinicalController.update] Erro:', err);
      res.status(500).json({ error: 'Erro ao atualizar registro clínico' });
    }
  }

  // 5. Exportação Oficial em Formato A4 com Identidade da Clínica e Localidade Automática (Itens 12, 13, 14)
  static exportPdfHtml(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;

      const record = db.prepare(`
        SELECT 
          r.*,
          p.name as professional_name, p.registration_type, p.registration_number,
          pat.full_name as patient_name, pat.cpf as patient_cpf, pat.birth_date as patient_birth_date,
          pat.phone as patient_phone, pat.email as patient_email
        FROM records r
        JOIN professionals p ON p.id = r.professional_id
        JOIN patients pat ON pat.id = r.patient_id
        WHERE r.id = ? AND r.tenant_id = ?
      `).get(id, tenantId) as any;

      if (!record) {
        res.status(404).json({ error: 'Prontuário não encontrado' });
        return;
      }

      if (!hasClinicalAccess(req, record.patient_id)) {
        res.status(403).json({ error: 'Acesso não autorizado para exportação deste prontuário' });
        return;
      }

      const clinic = db.prepare('SELECT name, corporate_name, trade_name, cnpj_cpf, phone, email, address, city, state, logo_url FROM tenants WHERE id = ?').get(tenantId) as any;
      const clinicName = clinic?.trade_name || clinic?.name || 'Zemda Saúde';
      const clinicCity = clinic?.city || 'Brasil';
      const clinicCnpj = clinic?.cnpj_cpf ? `CNPJ: ${clinic.cnpj_cpf}` : '';
      const clinicAddress = clinic?.address || `${clinicCity}/${clinic?.state || ''}`;

      // Localidade automática a partir do cadastro da clínica (Item 14)
      const localityText = `${clinicCity}, ${new Date(record.session_date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}`;

      const html = `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
          <meta charset="utf-8">
          <title>${record.title} - ${record.patient_name}</title>
          <style>
            @page {
              size: A4;
              margin: 20mm 15mm 20mm 15mm;
            }
            body {
              font-family: 'Segoe UI', Arial, sans-serif;
              color: #1e293b;
              margin: 0;
              padding: 0;
              font-size: 11pt;
              line-height: 1.6;
              background: #fff;
            }
            .header-box {
              border-bottom: 2px solid #0d9488;
              padding-bottom: 12px;
              margin-bottom: 20px;
              display: flex;
              align-items: center;
              justify-content: space-between;
            }
            .clinic-info h2 {
              margin: 0;
              color: #0f172a;
              font-size: 16pt;
              font-weight: bold;
            }
            .clinic-info p {
              margin: 2px 0 0 0;
              font-size: 9pt;
              color: #64748b;
            }
            .clinic-logo {
              max-height: 55px;
              max-width: 150px;
              object-contain: contain;
            }
            .doc-title {
              text-align: center;
              font-size: 14pt;
              font-weight: bold;
              color: #0d9488;
              margin: 15px 0 20px 0;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }
            .patient-box {
              background-color: #f8fafc;
              border: 1px solid #e2e8f0;
              border-radius: 8px;
              padding: 12px 16px;
              margin-bottom: 20px;
              font-size: 10pt;
            }
            .patient-box p {
              margin: 4px 0;
            }
            .content-section {
              margin-bottom: 25px;
            }
            .section-label {
              font-weight: bold;
              color: #334155;
              font-size: 10.5pt;
              text-transform: uppercase;
              border-bottom: 1px solid #e2e8f0;
              padding-bottom: 4px;
              margin-bottom: 8px;
            }
            .content-text {
              white-space: pre-wrap;
              font-size: 11pt;
              color: #1e293b;
            }
            .signature-area {
              margin-top: 60px;
              text-align: center;
            }
            .signature-line {
              width: 280px;
              border-top: 1px solid #0f172a;
              margin: 0 auto 8px auto;
            }
            .prof-name {
              font-weight: bold;
              font-size: 11pt;
            }
            .prof-reg {
              font-size: 9pt;
              color: #64748b;
            }
            .locality-date {
              text-align: right;
              margin-top: 40px;
              font-size: 10pt;
              color: #475569;
            }
            .footer-box {
              position: fixed;
              bottom: 0;
              left: 0;
              right: 0;
              text-align: center;
              font-size: 8pt;
              color: #94a3b8;
              border-top: 1px solid #e2e8f0;
              padding-top: 6px;
            }
            @media print {
              .no-print { display: none !important; }
            }
          </style>
        </head>
        <body>
          <div class="header-box">
            <div class="clinic-info">
              <h2>${clinicName}</h2>
              <p>${clinicAddress} | ${clinicCnpj} | Tel: ${clinic?.phone || '-'}</p>
            </div>
            ${clinic?.logo_url ? `<img src="${clinic.logo_url}" class="clinic-logo" alt="Logo" />` : ''}
          </div>

          <div class="doc-title">${record.title}</div>

          <div class="patient-box">
            <p><strong>Paciente:</strong> ${record.patient_name} | <strong>CPF:</strong> ${record.patient_cpf || 'Não informado'} | <strong>Nascimento:</strong> ${record.patient_birth_date || '-'}</p>
            <p><strong>Data do Atendimento:</strong> ${new Date(record.session_date + 'T12:00:00').toLocaleDateString('pt-BR')} | <strong>Profissional:</strong> ${record.professional_name} (${record.registration_type || 'Conselho'} ${record.registration_number || ''})</p>
          </div>

          <div class="content-section">
            <div class="section-label">Evolução Clínica & Conduta</div>
            <div class="content-text">${record.clinical_evolution || 'Sem notas clínicas textuais.'}</div>
          </div>

          ${record.technical_notes ? `
            <div class="content-section">
              <div class="section-label">Orientações & Anotações Complementares</div>
              <div class="content-text">${record.technical_notes}</div>
            </div>
          ` : ''}

          <div class="locality-date">${localityText}</div>

          <div class="signature-area">
            <div class="signature-line"></div>
            <div class="prof-name">${record.professional_name}</div>
            <div class="prof-reg">${record.registration_type || 'Registro'}: ${record.registration_number || '-'}</div>
          </div>

          <div class="footer-box">
            Documento emitido eletronicamente pela Plataforma Zemda • Válido como prontuário clínico oficial • Emitido em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}
          </div>

          <script>
            window.onload = function() {
              if (window.location.search.includes('autoprint=true')) {
                window.print();
              }
            };
          </script>
        </body>
        </html>
      `;

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (err: any) {
      console.error('[ClinicalController.exportPdfHtml] Erro:', err);
      res.status(500).json({ error: 'Erro ao gerar documento para impressão e PDF' });
    }
  }
}
