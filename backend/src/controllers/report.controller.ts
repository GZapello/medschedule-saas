import { Request, Response } from 'express';
import { db } from '../config/database';

export class ReportController {
  static getAttendanceReport(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const { startDate, endDate } = req.query;

      let dateFilter = '';
      const params: any[] = [tenantId];
      if (startDate) {
        dateFilter += ' AND a.start_time >= ?';
        params.push(startDate);
      }
      if (endDate) {
        dateFilter += ' AND a.start_time <= ?';
        params.push(endDate);
      }

      // Por Profissional
      const byProfStmt = db.prepare(`
        SELECT 
          p.name as professional_name,
          COUNT(*) as total,
          SUM(CASE WHEN a.status = 'completed' THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN a.status = 'no_show' THEN 1 ELSE 0 END) as no_show,
          SUM(CASE WHEN a.status = 'cancelled' THEN 1 ELSE 0 END) as cancelled
        FROM appointments a
        JOIN professionals p ON p.id = a.professional_id
        WHERE a.tenant_id = ? ${dateFilter}
        GROUP BY p.id
        ORDER BY total DESC
      `);
      const byProfessional = byProfStmt.all(...params);

      // Por Serviço
      const byServiceStmt = db.prepare(`
        SELECT 
          s.name as service_name,
          COUNT(*) as total,
          SUM(s.price) as total_value
        FROM appointments a
        JOIN services s ON s.id = a.service_id
        WHERE a.tenant_id = ? ${dateFilter}
        GROUP BY s.id
        ORDER BY total DESC
      `);
      const byService = byServiceStmt.all(...params);

      // Por Módulo Clínico Especializado (ZemdaOdonto, ZemdaNutri, ZemdaTO, ZemdaFono, ZemdaFisio)
      const byModuleStmt = db.prepare(`
        SELECT 
          COALESCE(r.module_type, 'Geral') as module_type,
          COUNT(*) as total
        FROM records r
        WHERE r.tenant_id = ?
        GROUP BY r.module_type
        ORDER BY total DESC
      `);
      const byModule = byModuleStmt.all(tenantId);

      res.json({ byProfessional, byService, byModule });
    } catch (err: any) {
      console.error('[ReportController.getAttendanceReport] Erro:', err);
      res.status(500).json({ error: 'Erro ao gerar relatório de atendimentos' });
    }
  }

  static getFinancialReport(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const { startDate, endDate } = req.query;

      let dateFilter = '';
      const params: any[] = [tenantId];
      if (startDate) {
        dateFilter += ' AND pay.created_at >= ?';
        params.push(startDate);
      }
      if (endDate) {
        dateFilter += ' AND pay.created_at <= ?';
        params.push(endDate);
      }

      const byMethodStmt = db.prepare(`
        SELECT 
          payment_method,
          COUNT(*) as count,
          SUM(amount) as total_amount
        FROM payments pay
        WHERE tenant_id = ? AND status = 'paid' ${dateFilter}
        GROUP BY payment_method
      `);
      const byMethod = byMethodStmt.all(...params);

      const byStatusStmt = db.prepare(`
        SELECT 
          status,
          COUNT(*) as count,
          SUM(amount) as total_amount
        FROM payments pay
        WHERE tenant_id = ? ${dateFilter}
        GROUP BY status
      `);
      const byStatus = byStatusStmt.all(...params);

      res.json({ byMethod, byStatus });
    } catch (err: any) {
      console.error('[ReportController.getFinancialReport] Erro:', err);
      res.status(500).json({ error: 'Erro ao gerar relatório financeiro' });
    }
  }

  static exportCsv(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const { type } = req.query; // 'appointments' | 'payments'

      if (type === 'payments') {
        const stmt = db.prepare(`
          SELECT 
            pay.created_at as Data,
            pat.full_name as Paciente,
            pay.amount as Valor,
            pay.payment_method as Forma_Pagamento,
            pay.status as Status,
            pay.notes as Observacoes
          FROM payments pay
          JOIN patients pat ON pat.id = pay.patient_id
          WHERE pay.tenant_id = ?
          ORDER BY pay.created_at DESC
        `);
        const rows = stmt.all(tenantId) as any[];

        let csv = 'Data,Paciente,Valor,Forma_Pagamento,Status,Observacoes\n';
        for (const r of rows) {
          csv += `"${r.Data}","${r.Paciente}","${r.Valor}","${r.Forma_Pagamento}","${r.Status}","${r.Observacoes || ''}"\n`;
        }

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="relatorio-financeiro.csv"');
        res.send(csv);
        return;
      }

      // Default: Appointments CSV
      const stmt = db.prepare(`
        SELECT 
          a.appointment_number as Codigo,
          a.start_time as Inicio,
          a.end_time as Fim,
          pat.full_name as Paciente,
          p.name as Profissional,
          s.name as Servico,
          a.status as Status,
          a.modality as Modalidade
        FROM appointments a
        JOIN patients pat ON pat.id = a.patient_id
        JOIN professionals p ON p.id = a.professional_id
        JOIN services s ON s.id = a.service_id
        WHERE a.tenant_id = ?
        ORDER BY a.start_time DESC
      `);
      const rows = stmt.all(tenantId) as any[];

      let csv = 'Codigo,Inicio,Fim,Paciente,Profissional,Servico,Status,Modalidade\n';
      for (const r of rows) {
        csv += `"${r.Codigo}","${r.Inicio}","${r.Fim}","${r.Paciente}","${r.Profissional}","${r.Servico}","${r.Status}","${r.Modalidade}"\n`;
      }

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="relatorio-atendimentos.csv"');
      res.send(csv);
    } catch (err: any) {
      console.error('[ReportController.exportCsv] Erro:', err);
      res.status(500).json({ error: 'Erro ao exportar arquivo CSV' });
    }
  }

  static exportDocx(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      const { type, patientId } = req.query; // 'patient_records' | 'attendance' | 'financial'

      const clinic = db.prepare('SELECT name, trade_name, cnpj_cpf, phone, email, street, number, neighborhood, city, state, address FROM tenants WHERE id = ?').get(tenantId) as any;
      const clinicName = clinic?.trade_name || clinic?.name || 'Clínica Emissora';
      const clinicAddress = clinic?.address || [
        [clinic?.street, clinic?.number].filter(Boolean).join(', '),
        clinic?.neighborhood,
        (clinic?.city && clinic?.state) ? `${clinic.city}/${clinic.state}` : (clinic?.city || '')
      ].filter(Boolean).join(' - ') + (clinic?.phone ? ` | Tel: ${clinic.phone}` : '');

      let title = 'Relatório';
      let contentHtml = '';

      if (type === 'patient_records' && patientId) {
        const patient = db.prepare('SELECT * FROM patients WHERE id = ? AND tenant_id = ?').get(patientId, tenantId) as any;
        const records = db.prepare(`
          SELECT r.*, p.name as prof_name, p.registration_type, p.registration_number, p.specialty
          FROM records r
          JOIN professionals p ON p.id = r.professional_id
          WHERE r.patient_id = ? AND r.tenant_id = ?
          ORDER BY r.session_date DESC
        `).all(patientId, tenantId) as any[];

        const allergies = db.prepare('SELECT * FROM patient_allergies WHERE patient_id = ? AND tenant_id = ?').all(patientId, tenantId) as any[];
        const medications = db.prepare('SELECT * FROM patient_medications WHERE patient_id = ? AND tenant_id = ? AND status = "active"').all(patientId, tenantId) as any[];

        title = `Prontuário Clínico - ${patient?.full_name || 'Paciente'}`;

        contentHtml = `
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12pt; margin-bottom: 18pt;">
            <h2 style="margin-top: 0; color: #0369a1; font-size: 14pt;">Dados do Paciente</h2>
            <p><strong>Nome:</strong> ${patient?.full_name || '-'} | <strong>CPF:</strong> ${patient?.cpf || '-'} | <strong>Nascimento:</strong> ${patient?.birth_date || '-'}</p>
            <p><strong>Telefone:</strong> ${patient?.phone || '-'} | <strong>E-mail:</strong> ${patient?.email || '-'}</p>
            <p><strong>Status de Alergias:</strong> ${patient?.allergies_status === 'has_allergies' ? '<span style="color: #dc2626; font-weight: bold;">Possui alergias declaradas</span>' : (patient?.allergies_status === 'none_known' ? 'Nenhuma alergia conhecida' : 'Não informado')}</p>
          </div>
        `;

        if (allergies.length > 0) {
          contentHtml += `
            <h3 style="color: #b91c1c; font-size: 12pt; border-bottom: 1px solid #fecaca; padding-bottom: 4pt;">Alergias Identificadas</h3>
            <table>
              <thead>
                <tr><th>Substância</th><th>Reação</th><th>Gravidade</th><th>Data Identificação</th></tr>
              </thead>
              <tbody>
                ${allergies.map(a => `<tr><td><strong>${a.substance}</strong></td><td>${a.reaction_type || '-'}</td><td>${a.severity}</td><td>${a.identified_at || '-'}</td></tr>`).join('')}
              </tbody>
            </table>
            <br/>
          `;
        }

        if (medications.length > 0) {
          contentHtml += `
            <h3 style="color: #047857; font-size: 12pt; border-bottom: 1px solid #a7f3d0; padding-bottom: 4pt;">Medicamentos em Uso</h3>
            <table>
              <thead>
                <tr><th>Medicamento</th><th>Dosagem</th><th>Frequência</th><th>Via</th><th>Prescritor</th></tr>
              </thead>
              <tbody>
                ${medications.map(m => `<tr><td><strong>${m.medication_name}</strong></td><td>${m.dosage || '-'}</td><td>${m.frequency || '-'}</td><td>${m.route || 'oral'}</td><td>${m.prescriber_name || '-'}</td></tr>`).join('')}
              </tbody>
            </table>
            <br/>
          `;
        }

        contentHtml += `<h3 style="color: #0f172a; font-size: 13pt; margin-top: 18pt;">Histórico de Evoluções Clínicas</h3>`;

        if (records.length === 0) {
          contentHtml += `<p style="color: #64748b; font-style: italic;">Nenhuma evolução clínica registrada até o momento.</p>`;
        } else {
          for (const rec of records) {
            contentHtml += `
              <div style="border: 1px solid #cbd5e1; border-radius: 6px; padding: 12pt; margin-bottom: 12pt; background-color: #ffffff;">
                <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #e2e8f0; padding-bottom: 6pt; margin-bottom: 8pt;">
                  <strong style="color: #0f172a; font-size: 12pt;">${rec.title || 'Consulta'}</strong>
                  <span style="color: #64748b;">${rec.session_date} | Prof. ${rec.prof_name} (${rec.registration_type || 'CRM'} ${rec.registration_number || ''})</span>
                </div>
                <div style="font-size: 10.5pt; line-height: 1.5; white-space: pre-wrap;">${rec.clinical_evolution || 'Sem notas textuais.'}</div>
                ${rec.technical_notes ? `<p style="margin-top: 6pt; color: #475569; font-size: 9.5pt;"><em>Notas Técnicas:</em> ${rec.technical_notes}</p>` : ''}
              </div>
            `;
          }
        }
      } else {
        // Relatório de Atendimentos Geral
        title = 'Relatório Geral de Atendimentos';
        const appts = db.prepare(`
          SELECT 
            a.appointment_number, a.start_time, a.status, a.modality,
            pat.full_name as patient_name,
            p.name as professional_name,
            s.name as service_name
          FROM appointments a
          JOIN patients pat ON pat.id = a.patient_id
          JOIN professionals p ON p.id = a.professional_id
          JOIN services s ON s.id = a.service_id
          WHERE a.tenant_id = ?
          ORDER BY a.start_time DESC
          LIMIT 200
        `).all(tenantId) as any[];

        contentHtml = `
          <table>
            <thead>
              <tr><th>Código</th><th>Data / Hora</th><th>Paciente</th><th>Profissional</th><th>Serviço</th><th>Status</th></tr>
            </thead>
            <tbody>
              ${appts.map(a => `<tr><td><strong>${a.appointment_number}</strong></td><td>${a.start_time}</td><td>${a.patient_name}</td><td>${a.professional_name}</td><td>${a.service_name}</td><td>${a.status}</td></tr>`).join('')}
            </tbody>
          </table>
        `;
      }

      const docxHtml = `
        <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
        <head>
          <meta charset='utf-8'>
          <title>${title}</title>
          <!--[if gte mso 9]>
          <xml>
            <w:WordDocument>
              <w:View>Print</w:View>
              <w:Zoom>100</w:Zoom>
              <w:DoNotOptimizeForBrowser/>
            </w:WordDocument>
          </xml>
          <![endif]-->
          <style>
            @page Section1 { size: 595.3pt 841.9pt; margin: 45pt 45pt 45pt 45pt; }
            div.Section1 { page: Section1; font-family: 'Segoe UI', Calibri, Arial, sans-serif; font-size: 11pt; color: #1e293b; }
            h1 { color: #0284c7; font-size: 18pt; margin: 0 0 6pt 0; }
            h2 { color: #0f172a; font-size: 13pt; margin: 12pt 0 6pt 0; }
            table { width: 100%; border-collapse: collapse; margin-top: 10pt; }
            th, td { border: 1px solid #cbd5e1; padding: 7pt; text-align: left; font-size: 10pt; }
            th { background-color: #f1f5f9; font-weight: bold; color: #1e293b; }
            .header-box { border-bottom: 2px solid #0284c7; padding-bottom: 12pt; margin-bottom: 16pt; }
            .clinic-title { font-size: 16pt; font-weight: bold; color: #0f172a; margin: 0; }
            .clinic-sub { font-size: 9.5pt; color: #64748b; margin: 4pt 0 0 0; }
            .footer-box { border-top: 1px solid #cbd5e1; margin-top: 30pt; padding-top: 12pt; font-size: 8.5pt; color: #94a3b8; text-align: center; }
          </style>
        </head>
        <body>
          <div class="Section1">
            <div class="header-box">
              <div class="clinic-title">${clinicName}</div>
              <div class="clinic-sub">${clinicAddress}</div>
            </div>
            <h1>${title}</h1>
            <p style="color: #64748b; font-size: 9.5pt;">Documento emitido eletronicamente em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}</p>
            ${contentHtml}
            <div class="footer-box">
              <p>Documento emitido eletronicamente pelo Sistema Zemda</p>
              <p>Documento de conferência e registro clínico oficial. Impresso sob responsabilidade do profissional emissor.</p>
            </div>
          </div>
        </body>
        </html>
      `;

      res.setHeader('Content-Type', 'application/vnd.ms-word; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${title.replace(/\s+/g, '_')}.docx"`);
      res.send(docxHtml);
    } catch (err: any) {
      console.error('[ReportController.exportDocx] Erro:', err);
      res.status(500).json({ error: 'Erro ao exportar arquivo DOCX' });
    }
  }
}
