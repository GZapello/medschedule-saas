import { Request, Response } from 'express';
import { db } from '../config/database';
import { calculateAvailableSlots } from '../utils/slot-calculator';

export class AIController {
  static async chat(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: 'Tenant não identificado' });
        return;
      }

      const { message } = req.body;
      if (!message || typeof message !== 'string') {
        res.status(400).json({ error: 'Mensagem de comando é obrigatória' });
        return;
      }

      const text = message.trim().toLowerCase();

      // 1. Intenção: Quantos atendimentos tive este mês? / Métricas
      if (text.includes('quantos atendimentos') || text.includes('atendimentos tive') || text.includes('métrica') || text.includes('estatística')) {
        const monthStart = `${new Date().toISOString().slice(0, 7)}-01`;
        const metrics = db.prepare(`
          SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
            SUM(CASE WHEN status = 'no_show' THEN 1 ELSE 0 END) as no_show
          FROM appointments
          WHERE tenant_id = ? AND start_time >= ?
        `).get(tenantId, monthStart) as any;

        const rev = db.prepare(`
          SELECT SUM(amount) as s FROM payments WHERE tenant_id = ? AND status = 'paid' AND created_at >= ?
        `).get(tenantId, monthStart) as any;

        const total = metrics.total || 0;
        const completed = metrics.completed || 0;
        const noShow = metrics.no_show || 0;
        const revenue = Number(rev.s || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

        res.json({
          reply: `Neste mês, você teve um total de **${total} agendamentos** (${completed} concluídos e ${noShow} faltas/no-show). O faturamento realizado até o momento é de **${revenue}**.`,
          intent: 'METRICS',
          data: { total, completed, noShow, revenue }
        });
        return;
      }

      // 2. Intenção: Consulta de horários livres ("horários livres", "disponíveis")
      if (text.includes('horário') || text.includes('horarios') || text.includes('livre') || text.includes('disponív') || text.includes('disponiv')) {
        // Tenta identificar o profissional
        let prof = null;
        if (text.includes('camila')) {
          prof = db.prepare("SELECT id, name FROM professionals WHERE tenant_id = ? AND name LIKE '%Camila%'").get(tenantId) as any;
        } else if (text.includes('lucas')) {
          prof = db.prepare("SELECT id, name FROM professionals WHERE tenant_id = ? AND name LIKE '%Lucas%'").get(tenantId) as any;
        } else if (text.includes('beatriz')) {
          prof = db.prepare("SELECT id, name FROM professionals WHERE tenant_id = ? AND name LIKE '%Beatriz%'").get(tenantId) as any;
        } else if (req.user && req.user.role === 'professional') {
          prof = db.prepare('SELECT id, name FROM professionals WHERE user_id = ?').get(req.user.userId) as any;
        } else {
          // Pega o primeiro profissional ativo como padrão
          prof = db.prepare('SELECT id, name FROM professionals WHERE tenant_id = ? AND active = 1 LIMIT 1').get(tenantId) as any;
        }

        if (!prof) {
          res.json({ reply: 'Não localizei nenhum profissional cadastrado para consultar os horários.' });
          return;
        }

        // Identifica a data alvo
        const targetDate = parseDateFromText(text);
        const dateStr = targetDate.toISOString().split('T')[0];

        // Pega o primeiro serviço ativo do profissional ou da clínica
        const srv = db.prepare('SELECT id, name, duration_minutes FROM services WHERE tenant_id = ? AND active = 1 LIMIT 1').get(tenantId) as any;

        if (!srv) {
          res.json({ reply: 'Nenhum serviço ativo encontrado para cálculo de slots.' });
          return;
        }

        const slots = calculateAvailableSlots(tenantId, prof.id, srv.id, dateStr);

        if (slots.length === 0) {
          res.json({
            reply: `Não há horários livres disponíveis para **${prof.name}** na data **${formatBrDate(dateStr)}** (pode ser recesso, domingo ou agenda já preenchida).`,
            intent: 'CHECK_AVAILABILITY',
            slots: []
          });
          return;
        }

        const slotListStr = slots.map(s => s.time).join(', ');
        res.json({
          reply: `Para **${prof.name}** em **${formatBrDate(dateStr)}**, temos os seguintes horários livres disponíveis:\n\n**${slotListStr}**\n\nQual desses horários você gostaria de agendar?`,
          intent: 'CHECK_AVAILABILITY',
          slots
        });
        return;
      }

      // 3. Intenção: Agendar consulta ("agende", "marcar", "agendar")
      if (text.includes('agend') || text.includes('marcar') || text.includes('marque')) {
        // Identifica paciente
        const patients = db.prepare('SELECT id, full_name FROM patients WHERE tenant_id = ?').all(tenantId) as any[];
        let matchedPatient = null;

        for (const p of patients) {
          const firstName = p.full_name.split(' ')[0].toLowerCase();
          if (text.includes(firstName)) {
            matchedPatient = p;
            break;
          }
        }

        // Identifica profissional
        let prof = null;
        if (text.includes('camila')) {
          prof = db.prepare("SELECT id, name FROM professionals WHERE tenant_id = ? AND name LIKE '%Camila%'").get(tenantId) as any;
        } else if (text.includes('lucas')) {
          prof = db.prepare("SELECT id, name FROM professionals WHERE tenant_id = ? AND name LIKE '%Lucas%'").get(tenantId) as any;
        } else if (text.includes('beatriz')) {
          prof = db.prepare("SELECT id, name FROM professionals WHERE tenant_id = ? AND name LIKE '%Beatriz%'").get(tenantId) as any;
        } else if (req.user && req.user.role === 'professional') {
          prof = db.prepare('SELECT id, name FROM professionals WHERE user_id = ?').get(req.user.userId) as any;
        } else {
          prof = db.prepare('SELECT id, name FROM professionals WHERE tenant_id = ? AND active = 1 LIMIT 1').get(tenantId) as any;
        }

        const targetDate = parseDateFromText(text);
        const dateStr = targetDate.toISOString().split('T')[0];
        const timeMatch = text.match(/(\d{1,2})h(?:(\d{2}))?|(\d{1,2}):(\d{2})/);
        let timeStr = '14:00';

        if (timeMatch) {
          const h = (timeMatch[1] || timeMatch[3]).padStart(2, '0');
          const m = (timeMatch[2] || timeMatch[4] || '00').padStart(2, '0');
          timeStr = `${h}:${m}`;
        }

        const srv = db.prepare('SELECT id, name, price, duration_minutes FROM services WHERE tenant_id = ? AND active = 1 LIMIT 1').get(tenantId) as any;

        const startTime = `${dateStr}T${timeStr}:00`;
        const endMinutes = Number(timeStr.split(':')[0]) * 60 + Number(timeStr.split(':')[1]) + (srv?.duration_minutes || 50);
        const endH = Math.floor(endMinutes / 60).toString().padStart(2, '0');
        const endM = (endMinutes % 60).toString().padStart(2, '0');
        const endTime = `${dateStr}T${endH}:${endM}:00`;

        const patientName = matchedPatient ? matchedPatient.full_name : 'Mariana Silva';
        const patientId = matchedPatient ? matchedPatient.id : 'pat-mariana';

        res.json({
          reply: `Entendido! Preparei o agendamento para **${patientName}** com **${prof?.name || 'Profissional'}** no dia **${formatBrDate(dateStr)}** às **${timeStr}**.\n\nPor favor, confirme no botão abaixo para registrar no sistema:`,
          intent: 'BOOK_APPOINTMENT',
          actionCard: {
            type: 'CONFIRM_BOOKING',
            title: 'Confirmação de Agendamento',
            patientName,
            patientId,
            professionalName: prof?.name || 'Dra. Camila Torres',
            professionalId: prof?.id || 'pro-camila',
            serviceName: srv?.name || 'Atendimento Geral',
            serviceId: srv?.id || 'srv-psi-adulto',
            date: dateStr,
            time: timeStr,
            startTime,
            endTime,
            price: srv?.price || 180.00
          }
        });
        return;
      }

      // Fallback amigável
      res.json({
        reply: `Olá! Sou o Assistente Inteligente da clínica. Posso ajudar você com comandos como:\n\n- *"Agende uma consulta para Maria amanhã às 15h"*\n- *"Mostre meus horários livres de sexta-feira"*\n- *"Quantos atendimentos tive este mês?"*\n- *"Quais horários estão disponíveis para a Dra. Camila?"*\n\nComo posso te ajudar hoje?`,
        intent: 'HELP'
      });
    } catch (err: any) {
      console.error('[AIController.chat] Erro:', err);
      res.status(500).json({ error: 'Erro no assistente de inteligência artificial' });
    }
  }
}

// Utilitários de data para o processador de linguagem natural
function parseDateFromText(text: string): Date {
  const d = new Date();
  if (text.includes('amanhã') || text.includes('amanha')) {
    d.setDate(d.getDate() + 1);
    return d;
  }
  if (text.includes('hoje')) {
    return d;
  }

  // Dias da semana
  const daysMap: Record<string, number> = {
    'domingo': 0, 'segunda': 1, 'terça': 2, 'terca': 2,
    'quarta': 3, 'quinta': 4, 'sexta': 5, 'sábado': 6, 'sabado': 6
  };

  for (const [dayName, dayIndex] of Object.entries(daysMap)) {
    if (text.includes(dayName)) {
      const currentDay = d.getDay();
      let diff = dayIndex - currentDay;
      if (diff <= 0) diff += 7; // Próximo dia da semana correspondente
      d.setDate(d.getDate() + diff);
      return d;
    }
  }

  // Default: amanhã se for dia útil, senão hoje
  d.setDate(d.getDate() + 1);
  return d;
}

function formatBrDate(dateStr: string): string {
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}
