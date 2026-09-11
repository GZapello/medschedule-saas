import { Request, Response } from 'express';
import { db } from '../config/database';

export class DashboardController {
  static getMetrics(req: Request, res: Response): void {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: 'Tenant não informado' });
        return;
      }

      const today = new Date().toISOString().split('T')[0];
      const monthStart = `${today.slice(0, 7)}-01`;

      // 1. Atendimentos de hoje
      const todayApptsStmt = db.prepare(`
        SELECT 
          a.id, a.appointment_number, a.start_time, a.end_time, a.status, a.modality,
          pat.full_name as patient_name, pat.phone as patient_phone,
          p.name as professional_name,
          s.name as service_name
        FROM appointments a
        JOIN patients pat ON pat.id = a.patient_id
        JOIN professionals p ON p.id = a.professional_id
        JOIN services s ON s.id = a.service_id
        WHERE a.tenant_id = ? AND a.start_time LIKE ?
        ORDER BY a.start_time ASC
      `);
      const todayAppointments = todayApptsStmt.all(tenantId, `${today}%`);

      // 2. Contadores do mês
      const countStmt = db.prepare(`
        SELECT 
          COUNT(*) as total_month,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_month,
          SUM(CASE WHEN status = 'no_show' THEN 1 ELSE 0 END) as no_show_month,
          SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_month
        FROM appointments
        WHERE tenant_id = ? AND start_time >= ?
      `);
      const counts = countStmt.get(tenantId, monthStart) as any;

      // 3. Faturamento do mês
      const financeStmt = db.prepare(`
        SELECT 
          SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END) as revenue_month,
          SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END) as pending_month
        FROM payments
        WHERE tenant_id = ? AND created_at >= ?
      `);
      const finance = financeStmt.get(tenantId, monthStart) as any;

      // 4. Novos pacientes do mês
      const patientCountStmt = db.prepare(`
        SELECT COUNT(*) as new_patients
        FROM patients
        WHERE tenant_id = ? AND created_at >= ?
      `);
      const newPatients = (patientCountStmt.get(tenantId, monthStart) as any)?.new_patients || 0;

      // 5. Total de profissionais e salas ativas
      const totalsStmt = db.prepare(`
        SELECT 
          (SELECT COUNT(*) FROM professionals WHERE tenant_id = ? AND active = 1) as active_professionals,
          (SELECT COUNT(*) FROM services WHERE tenant_id = ? AND active = 1) as active_services,
          (SELECT COUNT(*) FROM rooms WHERE tenant_id = ? AND active = 1) as active_rooms
      `);
      const totals = totalsStmt.get(tenantId, tenantId, tenantId) as any;

      // 6. Taxa de ocupação estimada (baseada em agendamentos vs capacidade de 8 slots/dia por profissional)
      const totalMonth = counts.total_month || 0;
      const profCount = totals.active_professionals || 1;
      const estimatedCapacity = profCount * 8 * 22; // 22 dias úteis
      const occupancyRate = Math.min(100, Math.round((totalMonth / (estimatedCapacity || 1)) * 100));

      // 7. Dados dos últimos 6 meses para gráficos
      const monthsData: { month: string; appointments: number; revenue: number }[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const yMonth = d.toISOString().slice(0, 7);
        const monthLabel = d.toLocaleString('pt-BR', { month: 'short' });

        const apptCount = (db.prepare(`
          SELECT COUNT(*) as c FROM appointments 
          WHERE tenant_id = ? AND start_time LIKE ? AND status != 'cancelled'
        `).get(tenantId, `${yMonth}%`) as any)?.c || 0;

        const revSum = (db.prepare(`
          SELECT SUM(amount) as s FROM payments 
          WHERE tenant_id = ? AND created_at LIKE ? AND status = 'paid'
        `).get(tenantId, `${yMonth}%`) as any)?.s || 0;

        monthsData.push({
          month: monthLabel,
          appointments: apptCount,
          revenue: revSum
        });
      }

      res.json({
        today: {
          date: today,
          total: todayAppointments.length,
          appointments: todayAppointments
        },
        monthly: {
          totalAppointments: counts.total_month || 0,
          completed: counts.completed_month || 0,
          noShow: counts.no_show_month || 0,
          cancelled: counts.cancelled_month || 0,
          revenue: finance.revenue_month || 0,
          pending: finance.pending_month || 0,
          newPatients,
          occupancyRate
        },
        totals,
        chart: monthsData
      });
    } catch (err: any) {
      console.error('[DashboardController.getMetrics] Erro:', err);
      res.status(500).json({ error: 'Erro ao compilar indicadores do dashboard' });
    }
  }
}
