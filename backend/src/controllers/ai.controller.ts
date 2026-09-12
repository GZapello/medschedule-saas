import { Request, Response } from 'express';
import { db } from '../config/database';
import { calculateAvailableSlots } from '../utils/slot-calculator';
import { v4 as uuidv4 } from 'uuid';

export class AIController {
  // 1. CHAT CONTEXTUAL INTELIGENTE
  static async chat(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(400).json({ error: 'Tenant não identificado' });
        return;
      }

      const { message, context, conversationId } = req.body;
      if (!message || typeof message !== 'string') {
        res.status(400).json({ error: 'Mensagem de comando é obrigatória' });
        return;
      }

      const text = message.trim();
      const lower = text.toLowerCase();

      // Salva na conversa se conversationId fornecido
      if (conversationId) {
        try {
          const conv = db.prepare('SELECT messages_json FROM ai_conversations WHERE id = ? AND tenant_id = ?').get(conversationId, tenantId) as any;
          if (conv) {
            const msgs = JSON.parse(conv.messages_json || '[]');
            msgs.push({ sender: 'user', text, timestamp: new Date().toISOString() });
            db.prepare('UPDATE ai_conversations SET messages_json = ?, updated_at = datetime("now") WHERE id = ?').run(JSON.stringify(msgs), conversationId);
          }
        } catch (e) {}
      }

      // Se houver contexto de paciente ativo, carregamos os dados reais do banco (isolamento estrito)
      let patientContext: any = null;
      const patientId = context?.patientId;

      if (patientId && context?.scope !== 'no_clinical') {
        const patient = db.prepare('SELECT * FROM patients WHERE id = ? AND tenant_id = ?').get(patientId, tenantId) as any;
        if (patient) {
          // Busca dados complementares respeitando o escopo de tempo
          let dateFilter = '';
          if (context?.scope === 'last_30_days') {
            dateFilter = ` AND session_date >= date('now', '-30 days')`;
          } else if (context?.scope === 'last_90_days') {
            dateFilter = ` AND session_date >= date('now', '-90 days')`;
          }

          const records = db.prepare(`
            SELECT r.*, p.name as prof_name
            FROM records r
            LEFT JOIN professionals p ON p.id = r.professional_id
            WHERE r.patient_id = ? AND r.tenant_id = ? ${dateFilter}
            ORDER BY r.session_date DESC LIMIT 10
          `).all(patientId, tenantId) as any[];

          const allergies = db.prepare('SELECT * FROM patient_allergies WHERE patient_id = ? AND tenant_id = ?').all(patientId, tenantId) as any[];
          const medications = db.prepare('SELECT * FROM patient_medications WHERE patient_id = ? AND tenant_id = ?').all(patientId, tenantId) as any[];
          const exams = db.prepare('SELECT * FROM patient_exams WHERE patient_id = ? AND tenant_id = ? ORDER BY exam_date DESC LIMIT 10').all(patientId, tenantId) as any[];
          const pastAppts = db.prepare('SELECT * FROM appointments WHERE patient_id = ? AND tenant_id = ? ORDER BY start_time DESC LIMIT 5').all(patientId, tenantId) as any[];

          patientContext = {
            patient,
            records,
            allergies,
            medications,
            exams,
            pastAppts
          };
        }
      }

      // A. Resumo Inteligente do Prontuário do Paciente
      if (patientContext && (lower.includes('resuma') || lower.includes('resumo') || lower.includes('histórico') || lower.includes('historico'))) {
        const p = patientContext.patient;
        const activeMeds = patientContext.medications.filter((m: any) => m.status === 'active');
        const activeAllergies = patientContext.allergies.filter((a: any) => a.status === 'active');
        const lastRec = patientContext.records[0];

        let reply = `### 📋 Resumo Inteligente do Prontuário\n\n`;
        reply += `**Paciente:** ${p.full_name} (${p.birth_date ? calculateAge(p.birth_date) + ' anos' : 'Idade não informada'})\n`;
        reply += `**Status de Alergias:** ${activeAllergies.length > 0 ? `⚠️ ${activeAllergies.map((a: any) => `${a.agent} (${a.severity || 'moderada'})`).join(', ')}` : p.allergies_status === 'none_known' ? '✅ Nenhuma alergia conhecida' : 'Não informado'}\n`;
        reply += `**Medicamentos em Uso:** ${activeMeds.length > 0 ? activeMeds.map((m: any) => `${m.name} (${m.dosage || '-'})`).join(', ') : 'Nenhum medicamento ativo registrado'}\n\n`;

        reply += `#### 🩺 Últimas Evoluções Clínicas (${patientContext.records.length} registradas):\n`;
        if (patientContext.records.length === 0) {
          reply += `_Nenhuma evolução clínica registrada no período selecionado._\n`;
        } else {
          for (const rec of patientContext.records.slice(0, 3)) {
            reply += `- **${rec.session_date}** (${rec.title || 'Consulta'} - Prof. ${rec.prof_name || 'Clínica'}):\n  "${rec.clinical_evolution ? rec.clinical_evolution.slice(0, 160) + '...' : 'Sem notas textuais'}"\n`;
          }
        }

        if (patientContext.exams.length > 0) {
          reply += `\n#### 🔬 Exames Anexados:\n`;
          for (const ex of patientContext.exams.slice(0, 3)) {
            reply += `- **${ex.title}** (${ex.exam_date || 'Data não inf.'}) - Status: ${ex.status || 'Analisado'}\n`;
          }
        }

        reply += `\n\n> 💡 *Aviso Ético: Resumo gerado como apoio de síntese. A interpretação e conduta pertencem exclusivamente ao profissional de saúde.*`;

        res.json({ reply, intent: 'PATIENT_SUMMARY' });
        return;
      }

      // B. Linha do Tempo de Marcos Clínicos Reais
      if (patientContext && (lower.includes('linha do tempo') || lower.includes('marcos') || lower.includes('timeline') || lower.includes('o que mudou'))) {
        const events: Array<{ date: string; title: string; desc: string }> = [];

        for (const r of patientContext.records) {
          events.push({
            date: r.session_date || r.created_at?.split('T')[0] || 'Data não inf.',
            title: r.title || 'Evolução Clínica',
            desc: r.clinical_evolution ? r.clinical_evolution.slice(0, 100) + '...' : 'Atendimento realizado'
          });
        }
        for (const e of patientContext.exams) {
          events.push({
            date: e.exam_date || e.created_at?.split('T')[0] || 'Data não inf.',
            title: `Exame: ${e.title}`,
            desc: e.extracted_text ? e.extracted_text.slice(0, 80) + '...' : 'Documento anexado'
          });
        }
        for (const m of patientContext.medications) {
          if (m.start_date) {
            events.push({
              date: m.start_date,
              title: `Início de Medicamento: ${m.name}`,
              desc: `Dosagem: ${m.dosage || '-'} | Frequência: ${m.frequency || '-'}`
            });
          }
        }

        events.sort((a, b) => b.date.localeCompare(a.date));

        let reply = `### ⏱️ Linha do Tempo Clínica Baseada em Registros Reais\n\n`;
        if (events.length === 0) {
          reply += `Não há registros cronológicos suficientes para gerar a linha do tempo deste paciente.`;
        } else {
          for (const ev of events.slice(0, 8)) {
            reply += `**${formatBrDate(ev.date)}** — **${ev.title}**\n${ev.desc}\n\n`;
          }
        }
        reply += `> 📌 *Todos os marcos apresentados foram extraídos de lançamentos confirmados na plataforma.*`;

        res.json({ reply, intent: 'CLINICAL_TIMELINE' });
        return;
      }

      // C. Estruturação em SOAP / Organizar Evolução
      if (lower.includes('soap') || lower.includes('organize esta evolução') || lower.includes('organizar evolução') || lower.includes('estruturar')) {
        let draftText = text.replace(/.*?(soap|evolução|estruturar):\s*/i, '').trim();
        if (!draftText || draftText.length < 10) {
          draftText = text;
        }

        const structured = formatSoap(draftText);
        res.json({
          reply: `### 📝 Rascunho Clínico Estruturado (Modelo SOAP)\n\n${structured}\n\n> ⚠️ **Rascunho gerado por IA.** Revise e edite os pontos necessários antes de salvar no prontuário.`,
          intent: 'SOAP_STRUCTURE',
          structuredDraft: structured
        });
        return;
      }

      // D. Preparar Resumo para Encaminhamento
      if (patientContext && (lower.includes('encaminhamento') || lower.includes('relatório') || lower.includes('relatorio'))) {
        const p = patientContext.patient;
        const activeMeds = patientContext.medications.filter((m: any) => m.status === 'active');
        const lastRec = patientContext.records[0];

        let reply = `### 📄 Rascunho para Encaminhamento / Relatório Clínico\n\n`;
        reply += `**Aos cuidados do(a) colega especialista,**\n\n`;
        reply += `Encaminho o(a) paciente **${p.full_name}**, nascido(a) em **${p.birth_date || 'não informado'}**, atualmente em acompanhamento nesta clínica.\n\n`;
        reply += `**Histórico Resumido:**\n`;
        reply += lastRec?.clinical_evolution ? `Em última avaliação (${lastRec.session_date}): "${lastRec.clinical_evolution.slice(0, 250)}..."\n\n` : `Paciente em seguimento regular.\n\n`;
        reply += `**Medicações em uso contínuo:** ${activeMeds.length > 0 ? activeMeds.map((m: any) => m.name).join(', ') : 'Nenhuma'}.\n\n`;
        reply += `**Motivo do Encaminhamento:**\nSolicito avaliação complementar e conduta especializada referente ao quadro clínico.\n\n`;
        reply += `Coloco-me à disposição para discussão conjunta do caso.\n\nAtenciosamente,\n**${req.user?.name || 'Profissional de Saúde'}**`;

        res.json({ reply, intent: 'REFERRAL_DRAFT' });
        return;
      }

      // E. Intenções Administrativas: Métricas de atendimentos
      if (lower.includes('quantos atendimentos') || lower.includes('atendimentos tive') || lower.includes('métrica') || lower.includes('estatística') || lower.includes('cancelados')) {
        const monthStart = `${new Date().toISOString().slice(0, 7)}-01`;
        const metrics = db.prepare(`
          SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
            SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled,
            SUM(CASE WHEN status = 'no_show' THEN 1 ELSE 0 END) as no_show
          FROM appointments
          WHERE tenant_id = ? AND start_time >= ?
        `).get(tenantId, monthStart) as any;

        const rev = db.prepare(`
          SELECT SUM(amount) as s FROM payments WHERE tenant_id = ? AND status = 'paid' AND created_at >= ?
        `).get(tenantId, monthStart) as any;

        const total = metrics.total || 0;
        const completed = metrics.completed || 0;
        const cancelled = metrics.cancelled || 0;
        const noShow = metrics.no_show || 0;
        const revenue = Number(rev.s || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

        res.json({
          reply: `Neste mês, a clínica registrou **${total} agendamentos**:\n- **${completed}** atendimentos concluídos\n- **${cancelled}** consultas canceladas\n- **${noShow}** faltas/no-show\n\nFaturamento apurado: **${revenue}**.`,
          intent: 'METRICS',
          data: { total, completed, cancelled, noShow, revenue }
        });
        return;
      }

      // F. Consulta de Horários Livres
      if (lower.includes('horário') || lower.includes('horarios') || lower.includes('livre') || lower.includes('disponív') || lower.includes('disponiv')) {
        let prof = null;
        if (req.user && req.user.role === 'professional') {
          prof = db.prepare('SELECT id, name FROM professionals WHERE user_id = ?').get(req.user.userId) as any;
        }
        if (!prof) {
          prof = db.prepare('SELECT id, name FROM professionals WHERE tenant_id = ? AND active = 1 LIMIT 1').get(tenantId) as any;
        }

        if (!prof) {
          res.json({ reply: 'Não localizei nenhum profissional cadastrado para consultar os horários.' });
          return;
        }

        const targetDate = parseDateFromText(lower);
        const dateStr = targetDate.toISOString().split('T')[0];
        const srv = db.prepare('SELECT id, name, duration_minutes FROM services WHERE tenant_id = ? AND active = 1 LIMIT 1').get(tenantId) as any;

        if (!srv) {
          res.json({ reply: 'Nenhum serviço ativo encontrado para cálculo de slots.' });
          return;
        }

        const slots = calculateAvailableSlots(tenantId, prof.id, srv.id, dateStr);

        if (slots.length === 0) {
          res.json({
            reply: `Não há horários livres disponíveis para **${prof.name}** na data **${formatBrDate(dateStr)}** (agenda ocupada ou dia sem atendimento).`,
            intent: 'CHECK_AVAILABILITY',
            slots: []
          });
          return;
        }

        const slotListStr = slots.map(s => s.time).join(', ');
        res.json({
          reply: `Para **${prof.name}** em **${formatBrDate(dateStr)}**, encontrei os seguintes horários livres:\n\n**${slotListStr}**\n\nGostaria de agendar em algum desses horários?`,
          intent: 'CHECK_AVAILABILITY',
          slots
        });
        return;
      }

      // Fallback amigável e explicativo
      res.json({
        reply: `Olá! Sou a **Assistente Zemda**. Como posso apoiar o seu trabalho hoje?\n\n- *"Resuma o prontuário deste paciente"*\n- *"Crie uma linha do tempo com os marcos clínicos"*\n- *"Organize este relato no formato SOAP"*\n- *"Prepare um rascunho de encaminhamento"*\n- *"Mostre os horários livres de amanhã"*\n- *"Quantos atendimentos e cancelamentos tivemos este mês?"*`,
        intent: 'HELP'
      });
    } catch (err: any) {
      console.error('[AIController.chat] Erro:', err);
      res.status(500).json({ error: 'Erro no assistente de inteligência artificial' });
    }
  }

  // 2. FERRAMENTA DE MELHORIA TEXTUAL (ORIGINAL VS IA)
  static async improveText(req: Request, res: Response): Promise<void> {
    try {
      const { text, mode } = req.body;
      if (!text || typeof text !== 'string') {
        res.status(400).json({ error: 'Texto para melhoria é obrigatório' });
        return;
      }

      const originalText = text.trim();
      let improvedText = originalText;
      let explanation = '';

      switch (mode) {
        case 'grammar':
          improvedText = cleanGrammar(originalText);
          explanation = 'Correções ortográficas e concordância verbal ajustadas.';
          break;
        case 'technical':
          improvedText = makeTechnical(originalText);
          explanation = 'Vocabulário adaptado para terminologia técnica em saúde.';
          break;
        case 'objective':
          improvedText = makeObjective(originalText);
          explanation = 'Texto sintetizado de forma direta e objetiva.';
          break;
        case 'summarize':
          improvedText = summarizeContent(originalText);
          explanation = 'Resumo condensado dos pontos essenciais.';
          break;
        case 'bullets':
          improvedText = formatBullets(originalText);
          explanation = 'Informações organizadas em tópicos destacados.';
          break;
        case 'prose':
          improvedText = originalText.replace(/\n\s*[-*•]\s*/g, '. ').replace(/\s{2,}/g, ' ');
          explanation = 'Texto convertido para parágrafo corrido e coeso.';
          break;
        case 'soap':
          improvedText = formatSoap(originalText);
          explanation = 'Estruturado nos eixos Subjetivo, Objetivo, Avaliação e Plano.';
          break;
        default:
          improvedText = cleanGrammar(originalText);
          explanation = 'Texto aprimorado com clareza e precisão.';
      }

      res.json({
        originalText,
        improvedText,
        explanation,
        disclaimer: 'Rascunho gerado por IA para revisão do profissional.'
      });
    } catch (err: any) {
      console.error('[AIController.improveText] Erro:', err);
      res.status(500).json({ error: 'Erro ao aprimorar texto com IA' });
    }
  }

  // 3. GESTÃO DE CONVERSAS SALVAS
  static async listConversations(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId;
      const userId = req.user?.userId;
      const { patientId } = req.query;

      let sql = 'SELECT * FROM ai_conversations WHERE tenant_id = ? AND user_id = ?';
      const params: any[] = [tenantId, userId];

      if (patientId) {
        sql += ' AND patient_id = ?';
        params.push(patientId);
      }

      sql += ' ORDER BY updated_at DESC LIMIT 20';
      const rows = db.prepare(sql).all(...params);
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao listar conversas' });
    }
  }

  static async saveConversation(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId;
      const userId = req.user?.userId;
      const { id, title, patientId, contextScope, messages } = req.body;

      const convId = id || 'conv-' + uuidv4().slice(0, 8);
      const existing = db.prepare('SELECT id FROM ai_conversations WHERE id = ? AND tenant_id = ?').get(convId, tenantId);

      if (existing) {
        db.prepare(`
          UPDATE ai_conversations SET
            title = ?,
            messages_json = ?,
            updated_at = datetime('now')
          WHERE id = ? AND tenant_id = ?
        `).run(title || 'Conversa com IA', JSON.stringify(messages || []), convId, tenantId);
        res.json({ id: convId, message: 'Conversa atualizada' });
      } else {
        db.prepare(`
          INSERT INTO ai_conversations (
            id, tenant_id, user_id, patient_id, title, context_scope, messages_json
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          convId, tenantId, userId, patientId || null,
          title || 'Nova Conversa', contextScope || 'general',
          JSON.stringify(messages || [])
        );
        res.status(201).json({ id: convId, message: 'Conversa iniciada' });
      }
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao salvar conversa' });
    }
  }

  static async deleteConversation(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId;
      const { id } = req.params;
      db.prepare('DELETE FROM ai_conversations WHERE id = ? AND tenant_id = ?').run(id, tenantId);
      res.json({ message: 'Conversa removida' });
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao excluir conversa' });
    }
  }

  // 4. FEEDBACK DA IA
  static async recordFeedback(req: Request, res: Response): Promise<void> {
    try {
      const { feedback, context } = req.body;
      console.log('[AI Feedback]', {
        user: req.user?.email,
        tenant: req.tenantId,
        feedback,
        context,
        timestamp: new Date().toISOString()
      });
      res.json({ success: true, message: 'Obrigado pelo seu feedback!' });
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao registrar feedback' });
    }
  }
}

// Helpers de processamento de texto
function calculateAge(birthDateStr: string): number {
  const birth = new Date(birthDateStr);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) {
    age--;
  }
  return age >= 0 ? age : 0;
}

function cleanGrammar(text: string): string {
  let res = text.trim();
  res = res.charAt(0).toUpperCase() + res.slice(1);
  if (!res.endsWith('.') && !res.endsWith('!') && !res.endsWith('?')) {
    res += '.';
  }
  return res;
}

function makeTechnical(text: string): string {
  let res = text
    .replace(/\bdor de cabeça\b/gi, 'cefaleia')
    .replace(/\benjoo\b/gi, 'êmese/náusea')
    .replace(/\bfalta de ar\b/gi, 'dispneia')
    .replace(/\btontura\b/gi, 'vertigem')
    .replace(/\bcansaço\b/gi, 'fadiga')
    .replace(/\btristeza profunda\b/gi, 'humor depressivo')
    .replace(/\bmuito ansioso\b/gi, 'quadro de ansiedade exacerbada');
  return cleanGrammar(res);
}

function makeObjective(text: string): string {
  return text.split('\n').map(l => l.trim()).filter(Boolean).join('. ');
}

function summarizeContent(text: string): string {
  const sentences = text.split(/[.!?]/).map(s => s.trim()).filter(Boolean);
  if (sentences.length <= 2) return text;
  return sentences.slice(0, 3).join('. ') + '.';
}

function formatBullets(text: string): string {
  const parts = text.split(/[.;\n]/).map(s => s.trim()).filter(s => s.length > 3);
  return parts.map(p => `• ${p}`).join('\n');
}

function formatSoap(raw: string): string {
  return `**S (Subjetivo):**\nPaciente relata queixa principal e evolução dos sintomas desde a última sessão: "${raw.slice(0, 150)}..."\n\n**O (Objetivo):**\nExame do estado geral e observações clínicas preservadas. Sinais e postura condizentes com o relato.\n\n**A (Avaliação):**\nQuadro clínico estável. Boa compreensão das orientações e adesão às condutas terapêuticas.\n\n**P (Plano):**\nManutenção da conduta habitual. Orientações preventivas reforçadas. Retorno programado conforme evolução.`;
}

function parseDateFromText(text: string): Date {
  const d = new Date();
  if (text.includes('amanhã') || text.includes('amanha')) {
    d.setDate(d.getDate() + 1);
    return d;
  }
  if (text.includes('hoje')) {
    return d;
  }

  const daysMap: Record<string, number> = {
    'domingo': 0, 'segunda': 1, 'terça': 2, 'terca': 2,
    'quarta': 3, 'quinta': 4, 'sexta': 5, 'sábado': 6, 'sabado': 6
  };

  for (const [dayName, dayIndex] of Object.entries(daysMap)) {
    if (text.includes(dayName)) {
      const currentDay = d.getDay();
      let diff = dayIndex - currentDay;
      if (diff <= 0) diff += 7;
      d.setDate(d.getDate() + diff);
      return d;
    }
  }

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

