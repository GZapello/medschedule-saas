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

      res.json({ byProfessional, byService });
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
}
