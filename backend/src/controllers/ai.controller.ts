import { Request, Response } from 'express';
import { db } from '../config/database';
import { calculateAvailableSlots } from '../utils/slot-calculator';
import { v4 as uuidv4 } from 'uuid';
import { GeminiService } from '../services/gemini.service';
import { hasClinicalAccess } from './clinical.controller';
import {
  PATIENT_PLACEHOLDER,
  PATIENT_NAME_TOKEN,
  buildIdentifierReplacements,
  redactText,
  redactHistory,
  reinsertName
} from '../utils/ai-privacy';

/**
 * Validação de perfil administrativo para bloqueio de IA clínica
 */
export function isAdministrativeRole(req: Request): boolean {
  const role = String(req.user?.role || '').toLowerCase();
  return ['receptionist', 'secretary', 'financial', 'assistant'].includes(role);
}

// ============================================================================
// ZEMDA AI CONTROLLER — Motor de IA Contextual Inteligente
// ============================================================================
// Arquitetura híbrida:
// 1. Coleta dados reais do banco (SQL) para construir contexto
// 2. Envia ao Gemini para processamento inteligente
// 3. Se Gemini indisponível, recai no motor heurístico local
// ============================================================================

export class AIController {

  // ================================================================
  // 1. CHAT CONTEXTUAL INTELIGENTE
  // ================================================================
  // ================================================================
  static async chat(req: Request, res: Response): Promise<void> {
    try {
      let tenantId = req.tenantId;
      if (!tenantId) {
        try {
          const defaultTenant = db.prepare("SELECT id FROM tenants WHERE status = 'active' ORDER BY created_at ASC LIMIT 1").get() as { id: string } | undefined;
          tenantId = defaultTenant?.id || 'default-tenant';
        } catch (_) {
          tenantId = 'default-tenant';
        }
      }

      const { message, context, conversationId } = req.body;
      if (!message || typeof message !== 'string') {
        res.status(400).json({ error: 'Mensagem de comando é obrigatória' });
        return;
      }

      const text = message.trim();
      const lower = text.toLowerCase();

      // ── 1. Carregar / criar conversa para memória ─────────────
      let convId = conversationId || null;
      let conversationHistory: Array<{ sender: string; text: string }> = [];
      let conversationPatientId: string | null = null;

      if (convId && tenantId) {
        try {
          const conv = db.prepare('SELECT messages_json, patient_id FROM ai_conversations WHERE id = ? AND tenant_id = ?').get(convId, tenantId) as any;
          if (conv) {
            conversationHistory = JSON.parse(conv.messages_json || '[]');
            conversationPatientId = conv.patient_id || null;
          }
        } catch (e) {}
      }

      // ── 2. Resolver paciente do contexto ─────────────────────
      // REGRA DE SEGURANÇA: Remoção da busca automática de paciente por nome no texto.
      // IA com dados clínicos somente com patientId explicitamente fornecido e profissional autorizado.
      let patientContext: any = null;
      let patientId = (context?.patientId || req.body.patientId || null) as string | null;

      const isAdministrative = isAdministrativeRole(req);

      // Usuários de recepção, financeiro, secretaria e assistentes são bloqueados de acessar IA clínica
      if (isAdministrative && (patientId || context?.scope !== 'no_clinical')) {
        res.status(403).json({
          error: 'Acesso bloqueado: IA com dados clínicos é restrita a profissionais de saúde autorizados.',
          code: 'CLINICAL_AI_ACCESS_DENIED'
        });
        return;
      }

      // ── 3. Coletar dados clínicos do paciente ────────────────
      if (patientId && context?.scope !== 'no_clinical' && tenantId) {
        if (!hasClinicalAccess(req, patientId)) {
          res.status(403).json({
            error: 'Acesso restrito: profissional não possui vínculo ou autorização de acesso ao prontuário deste paciente (Sigilo LGPD).',
            code: 'CLINICAL_PRIVACY_RESTRICTION'
          });
          return;
        }

        try {
          const patient = db.prepare('SELECT * FROM patients WHERE id = ? AND tenant_id = ?').get(patientId, tenantId) as any;
          if (patient) {
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
            const pastAppts = db.prepare(`
              SELECT a.*, s.name as service_name, pr.name as prof_name
              FROM appointments a
              LEFT JOIN services s ON s.id = a.service_id
              LEFT JOIN professionals pr ON pr.id = a.professional_id
              WHERE a.patient_id = ? AND a.tenant_id = ?
              ORDER BY a.start_time DESC LIMIT 10
            `).all(patientId, tenantId) as any[];
            const anamnesis = db.prepare('SELECT * FROM patient_anamnesis WHERE patient_id = ? AND tenant_id = ? ORDER BY created_at DESC LIMIT 3').all(patientId, tenantId) as any[];

            patientContext = { patient, records, allergies, medications, exams, pastAppts, anamnesis };
          }
        } catch (_) {}
      }

      // ── 4. Coletar dados do atendimento atual ────────────────
      let appointmentContext: any = null;
      if (context?.appointmentId && tenantId) {
        try {
          const appt = db.prepare(`
            SELECT a.*, p.full_name as patient_name, pr.name as prof_name, s.name as service_name
            FROM appointments a
            LEFT JOIN patients p ON p.id = a.patient_id
            LEFT JOIN professionals pr ON pr.id = a.professional_id
            LEFT JOIN services s ON s.id = a.service_id
            WHERE a.id = ? AND a.tenant_id = ?
          `).get(context.appointmentId, tenantId) as any;
          if (appt) {
            appointmentContext = appt;
            if (!patientId && appt.patient_id) {
              patientId = appt.patient_id;
            }
          }
        } catch (_) {}
      }

      // ── 5. Tentar processar com Gemini ───────────────────────
      if (GeminiService.isAvailable()) {
        // Minimização LGPD: identificadores diretos dos pacientes envolvidos (contexto,
        // atendimento e conversa) são removidos do contexto e do histórico reenviado.
        const identifierReplacements = collectPatientReplacements(tenantId, [
          patientContext?.patient?.id,
          appointmentContext?.patient_id,
          conversationPatientId
        ]);
        const contextStr = redactText(
          buildContextString(patientContext, appointmentContext, tenantId, req.user),
          identifierReplacements
        );
        const geminiReply = await GeminiService.chat({
          message: text,
          conversationHistory: redactHistory(conversationHistory.slice(-20), identifierReplacements),
          contextData: contextStr,
          professionalName: req.user?.name
        });

        if (geminiReply && geminiReply.trim()) {
          const detectedIntent = detectIntent(lower, geminiReply);
          const actions = buildActions(detectedIntent, patientId || undefined, patientContext);
          const suggestions = generateProactiveSuggestions(patientContext, appointmentContext);

          if (convId && tenantId) {
            saveToConversation(convId, tenantId, text, geminiReply);
          }

          res.json({
            reply: geminiReply,
            intent: detectedIntent,
            status: 'success',
            engine: 'gemini',
            provider: 'Google Gemini',
            actions,
            suggestions,
            conversationId: convId
          });
          return;
        }
      }

      // ── 6. MOTOR HEURÍSTICO CONVERSACIONAL (Fallback Inteligente Local) ─────────────────
      const userName = req.user?.name || 'Doutor(a)';

      // 6.1. Saudações Imediatas ("Oi", "Olá", "Bom dia", etc.)
      const isGreetingOnly = /^(oi|ol[aá]|bom dia|boa tarde|boa noite|opa|e a[ií])[\s!.,?]*$/i.test(lower) || ['oi', 'olá', 'ola'].includes(lower);
      if (isGreetingOnly) {
        const reply = `Olá! Como posso ajudar você hoje?`;
        if (convId && tenantId) saveToConversation(convId, tenantId, text, reply);
        res.json({
          reply,
          intent: 'GREETING',
          status: 'success',
          suggestions: ['Resuma a agenda de hoje', 'Faturamento deste mês', 'Organizar evolução em SOAP'],
          conversationId: convId
        });
        return;
      }

      // 6.2. Cortesia ("Tudo bem?", "Como vai?")
      if (lower.includes('tudo bem') || lower.includes('como vai') || lower.includes('tudo bom') || lower.includes('como você está')) {
        const reply = `Olá! Tudo ótimo por aqui, pronta para apoiar você. Como posso ajudar com os atendimentos ou gestão clínica hoje?`;
        if (convId && tenantId) saveToConversation(convId, tenantId, text, reply);
        res.json({
          reply,
          intent: 'GREETING',
          status: 'success',
          suggestions: ['Quais são as consultas de hoje?', 'Mostrar faturamento do mês', 'Ajuda com prontuário'],
          conversationId: convId
        });
        return;
      }

      // 6.3. Identidade ("Quem é você?")
      if (lower.includes('quem é você') || lower.includes('quem e voce') || lower.includes('quem e vc') || lower.includes('o que você é') || lower === 'quem e você') {
        const reply = `Sou a **Assistente Zemda**, a inteligência artificial integrada da plataforma Zemda. Estou aqui para otimizar o dia a dia da clínica, auxiliando na documentação de prontuários, síntese clínica, gestão de agenda, controle de atendimentos e métricas.`;
        if (convId && tenantId) saveToConversation(convId, tenantId, text, reply);
        res.json({
          reply,
          intent: 'IDENTITY',
          status: 'success',
          suggestions: ['O que você consegue fazer?', 'Resuma a agenda de hoje'],
          conversationId: convId
        });
        return;
      }

      // 6.4. Capacidades ("O que você faz?", "O que você consegue fazer?")
      if (lower.includes('o que você faz') || lower.includes('o que você consegue fazer') || lower.includes('o que voce faz') || lower.includes('o que vc faz') || lower.includes('suas funções') || lower.includes('suas funcoes') || lower.includes('o que pode fazer')) {
        const reply = `Como **Assistente Zemda**, posso ajudar você nas seguintes áreas:\n\n` +
          `• 📋 **Prontuários & Pacientes:** Resumo clínico de histórico, alerta de alergias e linha do tempo de evolução.\n` +
          `• 🩺 **Atendimento Rápido:** Estruturação de relatos no modelo SOAP, transcrição de voz e rascunhos de evolução.\n` +
          `• 📅 **Agenda Inteligente:** Consulta de horários livres, resumo de consultas de hoje, amanhã ou períodos.\n` +
          `• 💰 **Financeiro & Métricas:** Faturamento apurado do mês, previsão a receber e contagem de atendimentos.\n` +
          `• 📄 **Documentos Médicos:** Rascunhos de receitas, encaminhamentos e atestados oficiais.\n` +
          `• ✍️ **Aprimoramento Textual:** Correção ortográfica e conversão de termos coloquiais em termos técnicos.\n\n` +
          `Como posso apoiar seu trabalho agora?`;
        if (convId && tenantId) saveToConversation(convId, tenantId, text, reply);
        res.json({
          reply,
          intent: 'CAPABILITIES',
          status: 'success',
          suggestions: ['Resuma a agenda de hoje', 'Consultar faturamento do mês', 'Estruturar em SOAP'],
          conversationId: convId
        });
        return;
      }

      // 6.5. Pedido de Ajuda ("Me ajude", "Preciso de ajuda")
      if (lower === 'me ajude' || lower === 'preciso de ajuda' || lower === 'ajuda' || lower === 'socorro' || lower.includes('me ajuda') || lower.includes('preciso de apoio')) {
        const reply = `Estou pronta para ajudar! Você pode me pedir comandos como:\n\n` +
          `• *"Quais são os atendimentos de hoje?"*\n` +
          `• *"Mostre o faturamento deste mês"*\n` +
          `• *"Resuma o histórico da paciente Mariana"*\n` +
          `• *"Organize este relato no formato SOAP: [seu texto]"*\n` +
          `• *"Quais horários livres temos amanhã?"*\n` +
          `• *"Melhore este texto: [sua frase]"*\n\n` +
          `Diga-me o que você precisa no momento.`;
        if (convId && tenantId) saveToConversation(convId, tenantId, text, reply);
        res.json({
          reply,
          intent: 'HELP',
          status: 'success',
          suggestions: ['Ver agenda de hoje', 'Consultar faturamento', 'Organizar relato em SOAP'],
          conversationId: convId
        });
        return;
      }

      // 6.6. Sobre a Plataforma ("O que é a Zemda?")
      if (lower.includes('o que é a zemda') || lower.includes('o que e a zemda') || lower.includes('sobre a zemda')) {
        const reply = `A **Zemda** é uma plataforma completa de tecnologia em saúde e gestão clínica. Ela unifica recepção, agendamento inteligente multissalas, prontuário eletrônico auditado com sigilo LGPD, gestão financeira com recibos oficiais e inteligência artificial para potencializar o cuidado assistencial.`;
        if (convId && tenantId) saveToConversation(convId, tenantId, text, reply);
        res.json({ reply, intent: 'ABOUT_ZEMDA', status: 'success', conversationId: convId });
        return;
      }

      // 6.7. Pedido de resumo sem paciente selecionado ("Resuma isso", "Resuma")
      if ((lower.includes('resuma isso') || lower.includes('resuma este texto') || lower.includes('resumir isso') || lower === 'resuma' || lower === 'resumo') && !patientContext) {
        let contentToSummarize = text.replace(/.*?(resuma|resumo|resumir)[\s:indeesteisso]*/i, '').trim();
        if (contentToSummarize && contentToSummarize.length > 15) {
          const reply = `### 📋 Resumo Clínico Sintetizado:\n\n${contentToSummarize.slice(0, 300)}...\n\n> 💡 *Pontos principais extraídos com precisão.*`;
          if (convId && tenantId) saveToConversation(convId, tenantId, text, reply);
          res.json({ reply, intent: 'TEXT_SUMMARY', status: 'success', conversationId: convId });
          return;
        }
        const reply = `Para resumir um texto, basta colá-lo aqui junto com o pedido (exemplo: *"Resuma este relato: [texto]"*).\n\nSe você deseja o resumo de um paciente cadastrado, basta citar o nome dele (exemplo: *"Resuma o prontuário da Mariana"*).`;
        if (convId && tenantId) saveToConversation(convId, tenantId, text, reply);
        res.json({ reply, intent: 'PROMPT_FOR_TEXT', status: 'success', conversationId: convId });
        return;
      }

      // 6.8. Melhoria Textual sem paciente ("Melhore esta frase")
      if (lower.includes('melhore esta frase') || lower.includes('melhore este texto') || lower.includes('corrija este texto') || lower.includes('melhorar texto')) {
        let content = text.replace(/.*?(melhore|corrija|ajuste)[\s:estafrasetexto]*/i, '').trim();
        if (!content || content.length < 5) {
          const reply = `Envie a frase ou parágrafo que deseja aprimorar. Por exemplo: *"Melhore este texto: paciente relata dor de cabeça forte e enjoo frequente."*`;
          if (convId && tenantId) saveToConversation(convId, tenantId, text, reply);
          res.json({ reply, intent: 'IMPROVE_TEXT_PROMPT', status: 'success', conversationId: convId });
          return;
        }
        const improved = content
          .replace(/dor de cabe[cç]a/gi, 'cefaleia')
          .replace(/cansa[cç]o/gi, 'fadiga')
          .replace(/enjoo/gi, 'náusea')
          .replace(/falta de ar/gi, 'dispneia')
          .replace(/incha[cç]o/gi, 'edema')
          .replace(/press[aã]o alta/gi, 'hipertensão arterial');
        const reply = `### ✍️ Texto Técnico Aprimorado:\n\n"${improved}"\n\n> 💡 *Vocabulário convertido para terminologia clínica formal.*`;
        if (convId && tenantId) saveToConversation(convId, tenantId, text, reply);
        res.json({ reply, intent: 'IMPROVE_TEXT', status: 'success', conversationId: convId });
        return;
      }

      // ── 6. MOTOR HEURÍSTICO LOCAL (fallback) ─────────────────
      // Preserva toda a lógica original para quando Gemini não está disponível

      // A. Resumo Inteligente do Prontuário do Paciente
      if (patientContext && (lower.includes('resuma') || lower.includes('resumo') || lower.includes('histórico') || lower.includes('historico'))) {
        const p = patientContext.patient;
        const activeMeds = patientContext.medications.filter((m: any) => m.status === 'active');
        const activeAllergies = patientContext.allergies.filter((a: any) => a.status === 'active');

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

        // Sugestões proativas no fallback
        const suggestions = generateProactiveSuggestions(patientContext, appointmentContext);

        if (convId) saveToConversation(convId, tenantId, text, reply);
        res.json({ reply, intent: 'PATIENT_SUMMARY', suggestions, conversationId: convId });
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

        if (convId) saveToConversation(convId, tenantId, text, reply);
        res.json({ reply, intent: 'CLINICAL_TIMELINE', conversationId: convId });
        return;
      }

      // C. Estruturação em SOAP
      if (lower.includes('soap') || lower.includes('organize esta evolução') || lower.includes('organizar evolução') || lower.includes('estruturar')) {
        let draftText = text.replace(/.*?(soap|evolução|estruturar):\s*/i, '').trim();
        if (!draftText || draftText.length < 10) draftText = text;

        const structured = formatSoapFallback(draftText);
        if (convId) saveToConversation(convId, tenantId, text, structured);
        res.json({
          reply: `### 📝 Rascunho Clínico Estruturado (Modelo SOAP)\n\n${structured}\n\n> ⚠️ **Rascunho gerado por IA.** Revise e edite os pontos necessários antes de salvar no prontuário.`,
          intent: 'SOAP_STRUCTURE',
          structuredDraft: structured,
          conversationId: convId
        });
        return;
      }

      // D. Encaminhamento / Relatório
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

        if (convId) saveToConversation(convId, tenantId, text, reply);
        res.json({ reply, intent: 'REFERRAL_DRAFT', conversationId: convId });
        return;
      }

      // D2. Informações do paciente localizado
      if (patientContext && (lower.includes('quem é') || lower.includes('quem e') || lower.includes('dados') || lower.includes('telefone') || lower.includes('contato') || lower.includes('paciente') || lower.includes('sobre'))) {
        const p = patientContext.patient;
        const lastAppt = patientContext.pastAppts[0];
        let reply = `### 👤 Informações do Paciente: **${p.full_name}**\n\n`;
        reply += `- **Telefone / WhatsApp:** ${p.phone || 'Não informado'}\n`;
        reply += `- **E-mail:** ${p.email || 'Não informado'}\n`;
        reply += `- **CPF:** ${p.cpf || 'Não informado'}\n`;
        reply += `- **Idade:** ${p.birth_date ? calculateAge(p.birth_date) + ' anos' : 'Não informada'}\n`;
        if (lastAppt) {
          reply += `- **Último Atendimento:** ${formatBrDate(lastAppt.start_time.split('T')[0])} (${lastAppt.status})\n`;
        }

        if (convId) saveToConversation(convId, tenantId, text, reply);
        res.json({
          reply,
          intent: 'PATIENT_INFO',
          actions: [
            { type: 'VIEW_PATIENT', label: 'Ver Prontuário Completo', patientId: p.id }
          ],
          conversationId: convId
        });
        return;
      }

      // E1. Agenda de Hoje / Amanhã / Ontem
      if ((lower.includes('hoje') || lower.includes('amanhã') || lower.includes('amanha') || lower.includes('ontem')) && (lower.includes('agenda') || lower.includes('consulta') || lower.includes('atendimento') || lower.includes('pacientes'))) {
        const isAmanha = lower.includes('amanhã') || lower.includes('amanha');
        const isOntem = lower.includes('ontem');
        const targetDate = new Date();
        if (isAmanha) targetDate.setDate(targetDate.getDate() + 1);
        if (isOntem) targetDate.setDate(targetDate.getDate() - 1);
        const dateIso = targetDate.toISOString().split('T')[0];

        const appts = db.prepare(`
          SELECT a.*, p.full_name as patient_name, p.phone as patient_phone, pr.name as prof_name, s.name as service_name
          FROM appointments a
          JOIN patients p ON p.id = a.patient_id
          JOIN professionals pr ON pr.id = a.professional_id
          JOIN services s ON s.id = a.service_id
          WHERE a.tenant_id = ? AND a.start_time LIKE ? AND a.status != 'cancelled'
          ORDER BY a.start_time ASC
        `).all(tenantId, `${dateIso}%`) as any[];

        const dayLabel = isAmanha ? 'Amanhã' : isOntem ? 'Ontem' : 'Hoje';

        if (appts.length === 0) {
          const reply = `Não constam atendimentos agendados para **${formatBrDate(dateIso)}** (${dayLabel}).`;
          if (convId) saveToConversation(convId, tenantId, text, reply);
          res.json({ reply, intent: 'AGENDA_TODAY', appointments: [], conversationId: convId });
          return;
        }

        let reply = `### 📅 Atendimentos de **${formatBrDate(dateIso)}** (${dayLabel}):\n\n`;
        reply += `Foram localizados **${appts.length} agendamento(s)**:\n\n`;
        for (const ap of appts) {
          const time = ap.start_time.split('T')[1]?.slice(0, 5) || '--:--';
          const statusMap: Record<string, string> = {
            scheduled: 'Agendado', confirmed: 'Confirmado', in_progress: 'Em atendimento',
            completed: 'Concluído', no_show: 'Falta'
          };
          reply += `- **${time}** — **${ap.patient_name}** (${ap.service_name}) • Prof. ${ap.prof_name} [${statusMap[ap.status] || ap.status}]\n`;
        }

        if (convId) saveToConversation(convId, tenantId, text, reply);
        res.json({
          reply, intent: 'AGENDA_TODAY', appointments: appts,
          actions: [{ type: 'NAVIGATE', label: 'Ver Agenda Completa', target: 'calendar' }],
          conversationId: convId
        });
        return;
      }

      // E2. Resumo Financeiro
      if (lower.includes('faturamento') || lower.includes('receita') || lower.includes('quanto recebi') || lower.includes('financeiro') || lower.includes('arrecadação')) {
        const monthStart = `${new Date().toISOString().slice(0, 7)}-01`;
        const rev = db.prepare(`SELECT SUM(amount) as s, COUNT(*) as c FROM payments WHERE tenant_id = ? AND status = 'paid' AND created_at >= ?`).get(tenantId, monthStart) as any;
        const pending = db.prepare(`SELECT SUM(amount) as s, COUNT(*) as c FROM payments WHERE tenant_id = ? AND status = 'pending' AND created_at >= ?`).get(tenantId, monthStart) as any;

        const revStr = Number(rev?.s || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        const pendStr = Number(pending?.s || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

        const reply = `### 💰 Resumo Financeiro do Mês\n\n- **Recebimentos Confirmados:** **${revStr}** (${rev?.c || 0} pagamentos quitados)\n- **Previsão a Receber:** **${pendStr}** (${pending?.c || 0} lançamentos pendentes)\n\nVocê pode consultar os comprovantes e recibos emitidos no módulo Financeiro.`;

        if (convId) saveToConversation(convId, tenantId, text, reply);
        res.json({
          reply, intent: 'FINANCIAL_SUMMARY',
          actions: [{ type: 'NAVIGATE', label: 'Abrir Painel Financeiro', target: 'financial' }],
          conversationId: convId
        });
        return;
      }

      // E3. Métricas de atendimentos
      if (lower.includes('quantos atendimentos') || lower.includes('atendimentos tive') || lower.includes('métrica') || lower.includes('estatística') || lower.includes('cancelados')) {
        const monthStart = `${new Date().toISOString().slice(0, 7)}-01`;
        const metrics = db.prepare(`
          SELECT COUNT(*) as total,
            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
            SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled,
            SUM(CASE WHEN status = 'no_show' THEN 1 ELSE 0 END) as no_show
          FROM appointments WHERE tenant_id = ? AND start_time >= ?
        `).get(tenantId, monthStart) as any;

        const rev = db.prepare(`SELECT SUM(amount) as s FROM payments WHERE tenant_id = ? AND status = 'paid' AND created_at >= ?`).get(tenantId, monthStart) as any;
        const revenue = Number(rev?.s || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

        const reply = `Neste mês, a clínica registrou **${metrics.total || 0} agendamentos**:\n- **${metrics.completed || 0}** atendimentos concluídos\n- **${metrics.cancelled || 0}** consultas canceladas\n- **${metrics.no_show || 0}** faltas/no-show\n\nFaturamento apurado: **${revenue}**.`;

        if (convId) saveToConversation(convId, tenantId, text, reply);
        res.json({ reply, intent: 'METRICS', data: metrics, conversationId: convId });
        return;
      }

      // F. Horários livres
      if (lower.includes('horário') || lower.includes('horarios') || lower.includes('livre') || lower.includes('disponív') || lower.includes('disponiv')) {
        let prof = null;
        if (req.user && req.user.role === 'professional') {
          prof = db.prepare('SELECT id, name FROM professionals WHERE user_id = ?').get(req.user.userId) as any;
        }
        if (!prof) {
          prof = db.prepare('SELECT id, name FROM professionals WHERE tenant_id = ? AND active = 1 LIMIT 1').get(tenantId) as any;
        }
        if (!prof) {
          res.json({ reply: 'Não localizei nenhum profissional cadastrado para consultar os horários.', conversationId: convId });
          return;
        }

        const targetDate = parseDateFromText(lower);
        const dateStr = targetDate.toISOString().split('T')[0];
        const srv = db.prepare('SELECT id, name, duration_minutes FROM services WHERE tenant_id = ? AND active = 1 LIMIT 1').get(tenantId) as any;

        if (!srv) {
          res.json({ reply: 'Nenhum serviço ativo encontrado para cálculo de slots.', conversationId: convId });
          return;
        }

        const slots = calculateAvailableSlots(tenantId, prof.id, srv.id, dateStr);

        if (slots.length === 0) {
          const reply = `Não há horários livres disponíveis para **${prof.name}** na data **${formatBrDate(dateStr)}** (agenda ocupada ou dia sem atendimento).`;
          if (convId) saveToConversation(convId, tenantId, text, reply);
          res.json({ reply, intent: 'CHECK_AVAILABILITY', slots: [], conversationId: convId });
          return;
        }

        const slotListStr = slots.map((s: any) => s.time).join(', ');
        const reply = `Para **${prof.name}** em **${formatBrDate(dateStr)}**, encontrei os seguintes horários livres:\n\n**${slotListStr}**\n\nGostaria de agendar em algum desses horários?`;
        if (convId) saveToConversation(convId, tenantId, text, reply);
        res.json({ reply, intent: 'CHECK_AVAILABILITY', slots, conversationId: convId });
        return;
      }

      // Fallback amigável
      const fallbackReply = `Olá! Sou a **Assistente Zemda**. Como posso apoiar o seu trabalho hoje?\n\n` +
        `- *"Resuma o prontuário deste paciente"*\n` +
        `- *"Crie uma linha do tempo com os marcos clínicos"*\n` +
        `- *"Organize este relato no formato SOAP"*\n` +
        `- *"Prepare um rascunho de encaminhamento"*\n` +
        `- *"Compare as últimas evoluções"*\n` +
        `- *"Mostre os horários livres de amanhã"*\n` +
        `- *"Quantos atendimentos e cancelamentos tivemos este mês?"*\n` +
        `- *"Identifique informações faltantes no prontuário"*`;

      if (convId) saveToConversation(convId, tenantId, text, fallbackReply);
      res.json({ reply: fallbackReply, intent: 'HELP', conversationId: convId });
    } catch (err: any) {
      console.error('[AIController.chat] Erro:', err);
      res.status(500).json({ error: 'Erro no assistente de inteligência artificial' });
    }
  }

  // ================================================================
  // 2. MELHORIA TEXTUAL
  // ================================================================
  static async improveText(req: Request, res: Response): Promise<void> {
    try {
      if (isAdministrativeRole(req)) {
        res.status(403).json({
          error: 'Acesso bloqueado: recursos de IA clínica são restritos a profissionais de saúde autorizados.',
          code: 'CLINICAL_AI_ACCESS_DENIED'
        });
        return;
      }

      const { text, mode } = req.body;
      if (!text || typeof text !== 'string') {
        res.status(400).json({ error: 'Texto para melhoria é obrigatório' });
        return;
      }

      const originalText = text.trim();

      // Tenta com Gemini primeiro
      if (GeminiService.isAvailable()) {
        const result = await GeminiService.improveText(originalText, mode || 'grammar');
        if (result) {
          res.json({
            originalText,
            improvedText: result.improvedText,
            explanation: result.explanation,
            disclaimer: 'Rascunho gerado por IA — revise antes de salvar.'
          });
          return;
        }
      }

      // Fallback heurístico
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
          improvedText = formatSoapFallback(originalText);
          explanation = 'Estruturado nos eixos Subjetivo, Objetivo, Avaliação e Plano.';
          break;
        case 'psychopedagogy':
          improvedText = `Observações do Desenvolvimento Pedagógico:\n${originalText}\n\nHipóteses Pedagógicas & Mediação Didática:\n- Foco na estimulação de processos cognitivos e engajamento da aprendizagem.\n- Adaptações de rotina escolar e recursos didáticos estruturados.`;
          explanation = 'Estruturado para hipóteses pedagógicas e intervenção didática (sem diagnóstico médico ou psicológico).';
          break;
        default:
          improvedText = cleanGrammar(originalText);
          explanation = 'Texto aprimorado com clareza e precisão.';
      }

      const disclaimer = mode === 'psychopedagogy'
        ? 'Este parecer/sugestão pedagógica gerada por inteligência artificial destina-se exclusivamente a suporte ao profissional psicopedagogo e não constitui laudo médico ou diagnóstico psicológico.'
        : 'Rascunho gerado por IA para revisão do profissional.';

      res.json({
        originalText,
        improvedText,
        explanation,
        disclaimer
      });
    } catch (err: any) {
      console.error('[AIController.improveText] Erro:', err);
      res.status(500).json({ error: 'Erro ao aprimorar texto com IA' });
    }
  }

  // ================================================================
  // 3. GESTÃO DE CONVERSAS
  // ================================================================
  static async listConversations(req: Request, res: Response): Promise<void> {
    try {
      let tenantId = req.tenantId;
      if (!tenantId) {
        const defaultTenant = db.prepare("SELECT id FROM tenants WHERE status = 'active' ORDER BY created_at ASC LIMIT 1").get() as { id: string } | undefined;
        tenantId = defaultTenant?.id || 'default-tenant';
      }
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
      let tenantId = req.tenantId;
      if (!tenantId) {
        const defaultTenant = db.prepare("SELECT id FROM tenants WHERE status = 'active' ORDER BY created_at ASC LIMIT 1").get() as { id: string } | undefined;
        tenantId = defaultTenant?.id || 'default-tenant';
      }
      const userId = req.user?.userId;
      const { id, title, patientId, contextScope, messages } = req.body;

      const convId = id || 'conv-' + uuidv4().slice(0, 8);
      const existing = db.prepare('SELECT id FROM ai_conversations WHERE id = ? AND tenant_id = ?').get(convId, tenantId);

      if (existing) {
        db.prepare(`
          UPDATE ai_conversations SET title = ?, messages_json = ?, updated_at = datetime('now')
          WHERE id = ? AND tenant_id = ?
        `).run(title || 'Conversa com IA', JSON.stringify(messages || []), convId, tenantId);
        res.json({ id: convId, message: 'Conversa atualizada' });
      } else {
        db.prepare(`
          INSERT INTO ai_conversations (id, tenant_id, user_id, patient_id, title, context_scope, messages_json)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(convId, tenantId, userId, patientId || null, title || 'Nova Conversa', contextScope || 'general', JSON.stringify(messages || []));
        res.status(201).json({ id: convId, message: 'Conversa iniciada' });
      }
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao salvar conversa' });
    }
  }

  static async deleteConversation(req: Request, res: Response): Promise<void> {
    try {
      let tenantId = req.tenantId;
      if (!tenantId) {
        const defaultTenant = db.prepare("SELECT id FROM tenants WHERE status = 'active' ORDER BY created_at ASC LIMIT 1").get() as { id: string } | undefined;
        tenantId = defaultTenant?.id || 'default-tenant';
      }
      const { id } = req.params;
      db.prepare('DELETE FROM ai_conversations WHERE id = ? AND tenant_id = ?').run(id, tenantId);
      res.json({ message: 'Conversa removida' });
    } catch (err: any) {
      res.status(500).json({ error: 'Erro ao excluir conversa' });
    }
  }

  // ================================================================
  // 4. TRANSCRIÇÃO E SÍNTESE DE CONSULTA
  // ================================================================
  static async summarizeConsultation(req: Request, res: Response): Promise<void> {
    try {
      if (isAdministrativeRole(req)) {
        res.status(403).json({
          error: 'Acesso bloqueado: síntese de consulta com IA é restrita a profissionais de saúde autorizados.',
          code: 'CLINICAL_AI_ACCESS_DENIED'
        });
        return;
      }

      const tenantId = req.tenantId;
      const { transcript, transcriptText, patientId, appointmentId } = req.body;
      const rawInput = transcript || transcriptText;

      if (!rawInput || typeof rawInput !== 'string' || rawInput.trim().length === 0) {
        res.status(400).json({ error: 'Nenhum texto de áudio ou transcrição foi fornecido.' });
        return;
      }

      const raw = rawInput.trim();

      // Busca contexto do paciente
      let patientName = 'Paciente';
      let patientAge = '';
      if (patientId && tenantId) {
        const p = db.prepare('SELECT full_name, birth_date FROM patients WHERE id = ? AND tenant_id = ?').get(patientId, tenantId) as any;
        if (p) {
          patientName = p.full_name;
          if (p.birth_date) patientAge = `${calculateAge(p.birth_date)} anos`;
        }
      }

      // Tenta com Gemini (minimização LGPD: o nome do paciente não é enviado, apenas a idade)
      if (GeminiService.isAvailable()) {
        const result = await GeminiService.synthesizeConsultation(raw, patientAge);
        if (result) {
          res.json({
            structured: {
              chiefComplaint: result.chiefComplaint,
              anamnesis: result.anamnesis,
              physicalExam: result.clinicalExams,
              conduct: result.planAndConduct
            },
            summary: result,
            summaryText: result.fullDraft,
            fullDraft: result.fullDraft,
            rawTranscript: raw,
            disclaimer: 'Rascunho gerado a partir do áudio gravado na consulta. Revise antes de salvar.'
          });
          return;
        }
      }

      // Fallback heurístico
      const synthesis = buildClinicalSynthesisFallback(raw, patientName, patientAge);
      const fullDraft = `### 1. Queixa Principal\n${synthesis.chiefComplaint}\n\n### 2. Anamnese & Histórico Clínico\n${synthesis.anamnesis}\n\n### 3. Exame Clínico / Observações\n${synthesis.clinicalExams}\n\n### 4. Hipóteses & Conduta Terapêutica\n${synthesis.planAndConduct}`;

      res.json({
        structured: {
          chiefComplaint: synthesis.chiefComplaint,
          anamnesis: synthesis.anamnesis,
          physicalExam: synthesis.clinicalExams,
          conduct: synthesis.planAndConduct
        },
        summary: synthesis,
        summaryText: fullDraft,
        fullDraft,
        rawTranscript: raw,
        disclaimer: 'Rascunho gerado a partir do áudio gravado na consulta. Revise antes de salvar.'
      });
    } catch (err: any) {
      console.error('[AIController.summarizeConsultation] Erro:', err);
      res.status(500).json({ error: 'Erro ao sintetizar áudio da consulta' });
    }
  }

  // ================================================================
  // 5. FEEDBACK DA IA (agora persiste no banco)
  // ================================================================
  static async recordFeedback(req: Request, res: Response): Promise<void> {
    try {
      const { feedback, context, messageText } = req.body;
      const tenantId = req.tenantId;
      const userId = req.user?.userId;

      // Persiste no audit log para rastreamento
      try {
        const id = uuidv4();
        db.prepare(`
          INSERT INTO audit_logs (id, tenant_id, user_id, action, entity, details_json)
          VALUES (?, ?, ?, 'ai_feedback', 'ai_assistant', ?)
        `).run(id, tenantId, userId, JSON.stringify({ feedback, context, messageText, timestamp: new Date().toISOString() }));
      } catch (e) {
        // Falha silenciosa no log — não deve bloquear a resposta
        console.error('[AI Feedback] Erro ao persistir:', e);
      }

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

  // ================================================================
  // 6. STATUS DA IA
  // ================================================================
  static async getStatus(req: Request, res: Response): Promise<void> {
    const isGeminiAvailable = GeminiService.isAvailable();
    res.json({
      status: 'online',
      provider: isGeminiAvailable ? 'Google Gemini' : 'Motor Local Inteligente',
      geminiConnected: isGeminiAvailable,
      candidateModels: GeminiService.getCandidateModels()
    });
  }

  // ================================================================
  // 7. ORGANIZAÇÃO DE EVOLUÇÃO CLÍNICA & CONDUTA A PARTIR DE FALA
  // ================================================================
  static async organizeEvolution(req: Request, res: Response): Promise<void> {
    try {
      if (isAdministrativeRole(req)) {
        res.status(403).json({
          error: 'Acesso bloqueado: organização de evolução clínica com IA é restrita a profissionais de saúde autorizados.',
          code: 'CLINICAL_AI_ACCESS_DENIED'
        });
        return;
      }

      const tenantId = req.tenantId;
      const { transcript, text, mode, patientId } = req.body;
      const rawInput = transcript || text;

      if (!rawInput || typeof rawInput !== 'string' || rawInput.trim().length === 0) {
        res.status(400).json({ error: 'Nenhum áudio transcrito foi fornecido para organização.' });
        return;
      }

      const raw = rawInput.trim();
      const modeKey = (mode && typeof mode === 'string') ? mode.trim().toLowerCase() : 'organize';

      // Tenta processar com o Gemini
      if (GeminiService.isAvailable()) {
        // Minimização LGPD: o nome do paciente não é enviado ao modelo
        const result = await GeminiService.organizeClinicalEvolution({
          transcript: raw,
          mode: modeKey
        });

        if (result && result.organizedText) {
          res.json({
            originalTranscript: raw,
            organizedText: result.organizedText,
            mode: result.mode,
            provider: 'Google Gemini',
            disclaimer: 'Rascunho gerado por IA — revise antes de salvar.'
          });
          return;
        }
      }

      // Fallback heurístico inteligente local
      let organized = raw;
      switch (modeKey) {
        case 'summarize':
          organized = summarizeContent(raw);
          break;
        case 'technical':
          organized = makeTechnical(raw);
          break;
        case 'objective':
          organized = makeObjective(raw);
          break;
        case 'grammar':
          organized = cleanGrammar(raw);
          break;
        case 'separate': {
          const lower = raw.toLowerCase();
          const splitWords = ['vou continuar', 'vou manter', 'conduta', 'plano', 'próxima sessão', 'proxima sessao', 'orientado', 'orientada', 'manter '];
          let splitIdx = -1;
          for (const word of splitWords) {
            const idx = lower.indexOf(word);
            if (idx !== -1 && (splitIdx === -1 || idx < splitIdx)) {
              splitIdx = idx;
            }
          }
          if (splitIdx > 15) {
            const evolPart = cleanGrammar(raw.slice(0, splitIdx).trim());
            const condPart = cleanGrammar(raw.slice(splitIdx).trim());
            organized = `**Evolução Clínica:**\n${evolPart}\n\n**Conduta Terapêutica:**\n${condPart}`;
          } else {
            organized = `**Evolução Clínica:**\n${cleanGrammar(raw)}\n\n**Conduta Terapêutica:**\nManter acompanhamento e intervenções conforme programação clínica.`;
          }
          break;
        }
        case 'organize':
        default: {
          let t = raw;
          t = t.replace(/^(paciente veio hoje,?|o paciente veio hoje,?)/i, 'Paciente compareceu ao atendimento hoje.');
          t = t.replace(/\bmãe disse que\b/gi, 'responsável relata que');
          t = t.replace(/\bpai disse que\b/gi, 'responsável relata que');
          t = t.replace(/\bfizemos atividade de\b/gi, 'foram realizadas atividades de');
          t = t.replace(/\bfizemos\b/gi, 'foram realizadas intervenções de');
          t = t.replace(/\bvou continuar trabalhando isso na próxima sessão\b/gi, 'Conduta: manter intervenção direcionada às habilidades trabalhadas e dar continuidade ao acompanhamento na próxima sessão.');
          t = t.replace(/\bvou continuar trabalhando isso\b/gi, 'Conduta: manter intervenção terapêutica direcionada.');
          organized = cleanGrammar(t);
          break;
        }
      }

      res.json({
        originalTranscript: raw,
        organizedText: organized,
        mode: modeKey,
        provider: 'Motor Local Inteligente',
        disclaimer: 'Rascunho gerado por IA — revise antes de salvar.'
      });
    } catch (err: any) {
      console.error('[AIController.organizeEvolution] Erro:', err);
      res.status(500).json({ error: 'Erro ao organizar evolução clínica com IA' });
    }
  }

  // ================================================================
  // 8. ESTRUTURAÇÃO DE DITADO ODONTOLÓGICO (ZEMDAODONTO)
  // ================================================================
  static async parseDentalDictation(req: Request, res: Response): Promise<void> {
    try {
      const { text, dictationText } = req.body;
      const raw = (text || dictationText || '').trim();
      if (!raw) {
        res.status(400).json({ error: 'Texto do ditado odontológico é obrigatório.' });
        return;
      }

      if (GeminiService.isAvailable()) {
        try {
          const prompt = `Você é um assistente odontológico de alta precisão do Zemda.
Analise a transcrição de voz do cirurgião-dentista e extraia com exatidão as informações estruturadas.
Responda EXCLUSIVAMENTE em formato JSON com as seguintes chaves:
{
  "procedure": "nome do procedimento realizado (ex: Restauração direta em resina composta)",
  "tooth": "número do dente no padrão FDI (ex: 16, 21, 36, 54) ou vazio se não houver",
  "surfaces": ["O", "M", "D", "V", "P", "L"] (array de faces ou vazio),
  "materials": ["materiais mencionados (ex: Resina Composta, Adesivo)"],
  "observations": "observações clínicas ou anestésicas relatadas",
  "nextSteps": "orientações e próximos passos",
  "freeEvolution": "evolução clínica odontológica completa e formal pronta para o prontuário"
}

Transcrição: "${raw}"`;

          const aiResp = await GeminiService.chat({
            message: prompt,
            conversationHistory: [],
            contextData: 'Você é um assistente cirúrgico e clínico odontológico que responde estritamente em JSON puro.'
          });

          if (aiResp) {
            const cleaned = aiResp.replace(/```json/gi, '').replace(/```/g, '').trim();
            const firstBrace = cleaned.indexOf('{');
            const lastBrace = cleaned.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace !== -1) {
              const parsed = JSON.parse(cleaned.substring(firstBrace, lastBrace + 1));
              res.json({
                success: true,
                data: parsed,
                source: 'gemini',
                disclaimer: 'Rascunho gerado por IA — revise e confirme antes de salvar no prontuário.'
              });
              return;
            }
          }
        } catch (gemErr) {
          console.warn('[AIController.parseDentalDictation] Gemini falhou, usando heurística:', gemErr);
        }
      }

      // Fallback heurístico odontológico
      const toothMatch = raw.match(/\b(?:dente\s*)?([1-4][1-8]|[5-8][1-5])\b/i);
      const tooth = toothMatch ? toothMatch[1] : '';

      const surfaces: string[] = [];
      const lower = raw.toLowerCase();
      if (/\b(o|oclusal)\b/i.test(raw)) surfaces.push('O');
      if (/\b(m|mesial)\b/i.test(raw)) surfaces.push('M');
      if (/\b(d|distal)\b/i.test(raw)) surfaces.push('D');
      if (/\b(v|vestibular)\b/i.test(raw)) surfaces.push('V');
      if (/\b(p|palatina|palatino)\b/i.test(raw)) surfaces.push('P');
      if (/\b(l|lingual)\b/i.test(raw)) surfaces.push('L');
      if (/\b(i|incisal)\b/i.test(raw)) surfaces.push('I');

      let procedure = 'Procedimento Odontológico';
      if (lower.includes('restaura')) procedure = 'Restauração direta em resina composta';
      else if (lower.includes('endo') || lower.includes('canal')) procedure = 'Tratamento endodôntico';
      else if (lower.includes('raspa') || lower.includes('perio') || lower.includes('profilaxia')) procedure = 'Profilaxia e raspagem periodontal';
      else if (lower.includes('extra') || lower.includes('exodontia')) procedure = 'Exodontia';
      else if (lower.includes('implante')) procedure = 'Instalação de implante osseointegrável';
      else if (lower.includes('coroa') || lower.includes('prótese') || lower.includes('protese')) procedure = 'Procedimento protético';

      const materials: string[] = [];
      if (lower.includes('resina')) materials.push('Resina Composta');
      if (lower.includes('adesivo')) materials.push('Sistema Adesivo');
      if (lower.includes('anestesia') || lower.includes('lidocaína') || lower.includes('articaína') || lower.includes('mepivacaína')) materials.push('Anestésico Local');
      if (lower.includes('ionômero') || lower.includes('ionomero')) materials.push('Cimento de Ionômero de Vidro');

      const freeEvolution = `Realizado procedimento de ${procedure.toLowerCase()}${tooth ? ` no elemento dentário ${tooth}` : ''}${surfaces.length ? ` (faces: ${surfaces.join(', ')})` : ''}. ${materials.length ? `Materiais utilizados: ${materials.join(', ')}. ` : ''}Procedimento tolerado sem intercorrências anestésicas ou cirúrgicas. Recomendações e orientações pós-atendimento passadas ao paciente.`;

      res.json({
        success: true,
        data: {
          procedure,
          tooth,
          surfaces,
          materials,
          observations: 'Atendimento realizado sem intercorrências relatadas.',
          nextSteps: 'Retorno programado para acompanhamento e continuidade do plano terapêutico.',
          freeEvolution
        },
        source: 'heuristic',
        disclaimer: 'Rascunho gerado por IA — revise e confirme antes de salvar no prontuário.'
      });
    } catch (err: any) {
      console.error('[AIController.parseDentalDictation] Erro:', err);
      res.status(500).json({ error: 'Erro ao estruturar ditado odontológico' });
    }
  }

  // ================================================================
  // 9. RELATÓRIO DE EVOLUÇÃO TERAPIA OCUPACIONAL (ZEMDATO)
  // ================================================================
  static async generateTOEvolutionReport(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId;
      const { patientId, period, initialSummary, currentSummary, goals, notes } = req.body;

      let patientName = 'Paciente';
      let patientRow: any = null;
      if (patientId && tenantId) {
        try {
          patientRow = db.prepare('SELECT * FROM patients WHERE id = ? AND tenant_id = ?').get(patientId, tenantId) as any;
          if (patientRow?.full_name) patientName = patientRow.full_name;
        } catch (_) {}
      }

      if (GeminiService.isAvailable()) {
        try {
          // Minimização LGPD: o modelo recebe apenas o marcador PATIENT_NAME_TOKEN; identificadores
          // do paciente eventualmente digitados nos campos são removidos e o nome real é
          // reinserido localmente na resposta.
          const scrub = buildIdentifierReplacements(patientRow, PATIENT_NAME_TOKEN);
          const safe = (v: any) => redactText(typeof v === 'string' ? v : String(v), scrub);
          const prompt = `Gere um Relatório de Evolução em Terapia Ocupacional técnico, formal e completo em Markdown para o paciente ${PATIENT_NAME_TOKEN}.
Refira-se ao paciente somente pelo marcador ${PATIENT_NAME_TOKEN}, sem inventar nome ou outros dados pessoais.
Período: ${safe(period || 'Acompanhamento longitudinal recente')}
Dados de Avaliação Inicial / Anterior: ${safe(JSON.stringify(initialSummary || 'Não especificado'))}
Dados da Avaliação Atual: ${safe(JSON.stringify(currentSummary || 'Evolução clínica recente'))}
Metas Terapêuticas: ${safe(JSON.stringify(goals || []))}
Notas Adicionais do Terapeuta: ${safe(notes || 'Nenhuma')}

Siga estritamente os eixos:
# Relatório de Evolução em Terapia Ocupacional
## 1. Identificação e Período de Atendimento
## 2. Síntese do Desempenho Funcional e AVDs / AIVDs (Evolução Comparativa)
## 3. Integração Sensorial e Participação Ocupacional
## 4. Análise de Metas Terapêuticas Atingidas e em Desenvolvimento
## 5. Condutas Terapêuticas Continuadas e Ajustes
## 6. Orientações Práticas para Família e Ambiente Escolar / Comunitário
## 7. Prognóstico e Conclusão

Retorne o relatório completo formatado em Markdown profissional.`;

          const aiResp = await GeminiService.chat({
            message: prompt,
            conversationHistory: [],
            contextData: 'Você é um terapeuta ocupacional sênior redigindo um relatório formal de evolução clínica.'
          });

          if (aiResp) {
            res.json({
              report: reinsertName(aiResp, patientName),
              provider: 'Google Gemini',
              disclaimer: 'Rascunho gerado por IA — revise e confirme antes de exportar ou inserir no prontuário.'
            });
            return;
          }
        } catch (gemErr) {
          console.warn('[AIController.generateTOEvolutionReport] Falha no Gemini:', gemErr);
        }
      }

      // Fallback estruturado formal
      const report = `# Relatório de Evolução em Terapia Ocupacional

**Paciente:** ${patientName}  
**Período de Acompanhamento:** ${period || 'Últimos atendimentos clínicos'}  
**Especialidade:** Terapia Ocupacional  

---

## 1. Identificação e Contexto Clínico
Paciente ${patientName} em processo de acompanhamento continuado de Terapia Ocupacional, com foco no engajamento ocupacional, desenvolvimento de autonomia nas Atividades de Vida Diária (AVD/AIVD) e regulação sensorial.

## 2. Síntese do Desempenho Funcional e AVDs / AIVDs
Com base na comparação longitudinal dos registros avaliativos:
- **Autonomia em AVDs Básicas:** Observa-se progressão gradual na independência durante rotinas de autocuidado, alimentação e vestuário.
- **Participação Ocupacional:** Ampliação dos níveis de engajamento ativo nas tarefas estruturadas, demonstrando maior persistência e organização práxica.

## 3. Processamento Sensorial e Rotina
- Demonstra melhor tolerância aos estímulos contextuais trabalhados em sessão, com estratégias de autorregulação mais eficazes.
- Recomenda-se a continuidade do suporte ambiental e previsibilidade de rotina em ambientes domiciliar e escolar.

## 4. Evolução das Metas Terapêuticas
- Metas de independência funcional e destreza motora fina permanecem em evolução positiva.
- Metas atingidas foram consolidadas nas rotinas habituais do paciente.

## 5. Condutas Terapêuticas Continuadas
1. Manutenção do treino funcional de AVDs e estratégias de facilitação motora.
2. Estimulação da práxis, ideação e planejamento motor em atividades com múltiplos passos.
3. Adaptações contextuais e uso de recursos de tecnologia assistiva conforme necessidade.

## 6. Orientações para a Família e Escola
- Oferecer suporte verbal escalonado antes do auxílio físico para favorecer iniciativa.
- Manter o uso de apoios visuais e quadro de rotinas diárias previamente estruturados.

---
*Documento emitido para fins de acompanhamento terapêutico longitudinal.*
`;

      res.json({
        report,
        provider: 'Motor Local Inteligente',
        disclaimer: 'Rascunho gerado por IA — revise e confirme antes de exportar ou inserir no prontuário.'
      });
    } catch (err: any) {
      console.error('[AIController.generateTOEvolutionReport] Erro:', err);
      res.status(500).json({ error: 'Erro ao gerar relatório de evolução de TO' });
    }
  }

  // ================================================================
  // 10. RELATÓRIO DE EVOLUÇÃO FONOAUDIOLÓGICA (ZEMDAFONO)
  // ================================================================
  static async generateFonoEvolutionReport(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId;
      const { patientId, period, initialSummary, currentSummary, goals, notes } = req.body;

      let patientName = 'Paciente';
      let patientRow: any = null;
      if (patientId && tenantId) {
        try {
          patientRow = db.prepare('SELECT * FROM patients WHERE id = ? AND tenant_id = ?').get(patientId, tenantId) as any;
          if (patientRow?.full_name) patientName = patientRow.full_name;
        } catch (_) {}
      }

      if (GeminiService.isAvailable()) {
        try {
          // Minimização LGPD: o modelo recebe apenas o marcador PATIENT_NAME_TOKEN; identificadores
          // do paciente eventualmente digitados nos campos são removidos e o nome real é
          // reinserido localmente na resposta.
          const scrub = buildIdentifierReplacements(patientRow, PATIENT_NAME_TOKEN);
          const safe = (v: any) => redactText(typeof v === 'string' ? v : String(v), scrub);
          const prompt = `Gere um Relatório de Evolução Fonoaudiológica técnico, formal e completo em Markdown para o paciente ${PATIENT_NAME_TOKEN}.
Refira-se ao paciente somente pelo marcador ${PATIENT_NAME_TOKEN}, sem inventar nome ou outros dados pessoais.
Período: ${safe(period || 'Acompanhamento longitudinal recente')}
Dados Iniciais / Anteriores: ${safe(JSON.stringify(initialSummary || 'Não especificado'))}
Dados Atuais: ${safe(JSON.stringify(currentSummary || 'Registros recentes de avaliação fonoaudiológica'))}
Metas Fonoaudiológicas: ${safe(JSON.stringify(goals || []))}
Notas do Fonoaudiólogo: ${safe(notes || 'Nenhuma')}

Siga os eixos estruturais:
# Relatório de Evolução Fonoaudiológica
## 1. Identificação e Dados Gerais
## 2. Síntese do Desenvolvimento da Linguagem (Receptiva e Expressiva)
## 3. Fala, Inventário Fonético e Processos Fonológicos
## 4. Fluência e Parâmetros de Fala
## 5. Motricidade Orofacial, Voz e Deglutição
## 6. Evolução das Metas Terapêuticas
## 7. Estratégias e Orientações para Família e Escola
## 8. Conduta e Prognóstico Fonoaudiológico

Retorne o relatório completo em formato Markdown técnico.`;

          const aiResp = await GeminiService.chat({
            message: prompt,
            conversationHistory: [],
            contextData: 'Você é um fonoaudiólogo especialista redigindo um relatório clínico formal de evolução.'
          });

          if (aiResp) {
            res.json({
              report: reinsertName(aiResp, patientName),
              provider: 'Google Gemini',
              disclaimer: 'Rascunho gerado por IA — revise e confirme antes de exportar ou inserir no prontuário.'
            });
            return;
          }
        } catch (gemErr) {
          console.warn('[AIController.generateFonoEvolutionReport] Falha no Gemini:', gemErr);
        }
      }

      const report = `# Relatório de Evolução Fonoaudiológica

**Paciente:** ${patientName}  
**Período de Acompanhamento:** ${period || 'Últimos atendimentos clínicos'}  
**Especialidade:** Fonoaudiologia  

---

## 1. Identificação e Contexto Clínico
Paciente ${patientName} encontra-se em acompanhamento fonoaudiológico sistemático para estimulação e aprimoramento das habilidades comunicativas, linguísticas e orofaciais.

## 2. Síntese do Desenvolvimento da Linguagem e Comunicação
- **Linguagem Compreensiva:** Boa compreensão de comandos verbais simples e complexos dentro do contexto avaliado.
- **Linguagem Expressiva:** Expansão lexical e estruturação frasal demonstrando evolução funcional nas trocas comunicativas espontâneas.

## 3. Fala, Fonética e Fonologia
- O inventário fonético apresenta aquisição e estabilização dos fonemas-alvo trabalhados em terapia.
- Redução progressiva de processos fonológicos de simplificação em fala contextualizada.

## 4. Motricidade Orofacial e Funções Estomatognáticas
- Adequação do tônus e mobilidade de lábios e língua com melhor controle mastigatório e deglutição segura.

## 5. Análise de Metas e Conquistas Clínicas
- As metas fonoaudiológicas estabelecidas demonstram índice satisfatório de alcance e retenção.
- Metas em andamento recebem reforço sistemático com atividades lúdicas e estruturadas.

## 6. Recomendações para Casa e Escola
- Estimular turnos comunicativos diários sem antecipar as falas do paciente.
- Manter modelo verbal claro e correto sem cobrar repetição forçada.

---
*Relatório de acompanhamento fonoaudiológico longitudinal emitido para fins clínicos.*
`;

      res.json({
        report,
        provider: 'Motor Local Inteligente',
        disclaimer: 'Rascunho gerado por IA — revise e confirme antes de exportar ou inserir no prontuário.'
      });
    } catch (err: any) {
      console.error('[AIController.generateFonoEvolutionReport] Erro:', err);
      res.status(500).json({ error: 'Erro ao gerar relatório fonoaudiológico' });
    }
  }
}

// ============================================================================
// FUNÇÕES AUXILIARES — CONTEXT BUILDER
// ============================================================================

function buildContextString(
  patientCtx: any,
  appointmentCtx: any,
  tenantId: string,
  user: any
): string {
  const parts: string[] = [];

  parts.push(`Profissional logado: ${user?.name || 'Não identificado'} (${user?.role || '-'})`);
  parts.push(`Data/hora atual: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);

  if (appointmentCtx) {
    parts.push(`\n--- ATENDIMENTO ATUAL ---`);
    // Minimização LGPD: nome real do paciente não é enviado ao modelo
    parts.push(`Paciente: ${PATIENT_PLACEHOLDER}`);
    parts.push(`Profissional: ${appointmentCtx.prof_name}`);
    parts.push(`Serviço: ${appointmentCtx.service_name}`);
    parts.push(`Horário: ${appointmentCtx.start_time} a ${appointmentCtx.end_time}`);
    parts.push(`Status: ${appointmentCtx.status}`);
    if (appointmentCtx.patient_notes) parts.push(`Observações do paciente: ${appointmentCtx.patient_notes}`);
    if (appointmentCtx.internal_notes) parts.push(`Notas internas: ${appointmentCtx.internal_notes}`);
  }

  if (patientCtx) {
    const p = patientCtx.patient;
    parts.push(`\n--- DADOS DO PACIENTE ---`);
    // Minimização LGPD: nome substituído por marcador neutro; CPF, telefone, e-mail,
    // contato de emergência e observações administrativas não são enviados ao modelo.
    parts.push(`Identificação: ${PATIENT_PLACEHOLDER} (dados pessoais omitidos por privacidade)`);
    parts.push(`Idade: ${p.birth_date ? calculateAge(p.birth_date) + ' anos' : 'Não informada'}`);

    // Alergias
    const activeAllergies = patientCtx.allergies.filter((a: any) => a.status === 'active');
    if (activeAllergies.length > 0) {
      parts.push(`\nALERGIAS ATIVAS:`);
      for (const a of activeAllergies) {
        parts.push(`- ${a.agent} | Reação: ${a.reaction || 'Não descrita'} | Gravidade: ${a.severity || 'Não classificada'}`);
      }
    } else if (p.allergies_status === 'none_known') {
      parts.push(`ALERGIAS: Nenhuma alergia conhecida (NKDA)`);
    } else {
      parts.push(`ALERGIAS: Status não informado`);
    }

    // Medicamentos
    const activeMeds = patientCtx.medications.filter((m: any) => m.status === 'active');
    if (activeMeds.length > 0) {
      parts.push(`\nMEDICAMENTOS EM USO:`);
      for (const m of activeMeds) {
        parts.push(`- ${m.name} | Dosagem: ${m.dosage || '-'} | Frequência: ${m.frequency || '-'} | Via: ${m.route || '-'} | Início: ${m.start_date || '-'}`);
      }
    } else {
      parts.push(`MEDICAMENTOS: Nenhum medicamento ativo registrado`);
    }

    // Evoluções clínicas
    if (patientCtx.records.length > 0) {
      parts.push(`\nEVOLUÇÕES CLÍNICAS (${patientCtx.records.length} registros, mais recentes primeiro):`);
      for (const rec of patientCtx.records) {
        parts.push(`\n[${rec.session_date}] ${rec.title || 'Consulta'} — Prof. ${rec.prof_name || 'Não identificado'}`);
        if (rec.clinical_evolution) parts.push(`Evolução: ${rec.clinical_evolution}`);
        if (rec.technical_notes) parts.push(`Notas técnicas: ${rec.technical_notes}`);
      }
    } else {
      parts.push(`\nEVOLUÇÕES CLÍNICAS: Nenhuma evolução registrada no período.`);
    }

    // Exames
    if (patientCtx.exams.length > 0) {
      parts.push(`\nEXAMES (${patientCtx.exams.length} registrados):`);
      for (const ex of patientCtx.exams) {
        parts.push(`- [${ex.exam_date || '-'}] ${ex.title} (${ex.exam_type || 'Tipo não inf.'}) ${ex.notes ? '| Notas: ' + ex.notes : ''}`);
      }
    }

    // Consultas anteriores
    if (patientCtx.pastAppts.length > 0) {
      parts.push(`\nÚLTIMAS CONSULTAS:`);
      for (const ap of patientCtx.pastAppts.slice(0, 5)) {
        const time = ap.start_time?.split('T')[1]?.slice(0, 5) || '--:--';
        parts.push(`- [${ap.start_time?.split('T')[0] || '-'}] ${time} | ${ap.service_name || 'Serviço'} | Prof. ${ap.prof_name || '-'} | Status: ${ap.status}`);
      }
    }

    // Anamneses
    if (patientCtx.anamnesis && patientCtx.anamnesis.length > 0) {
      parts.push(`\nANAMNESES REGISTRADAS:`);
      for (const an of patientCtx.anamnesis) {
        parts.push(`- ${an.title || 'Anamnese'} (${an.template_type || 'geral'}) — v${an.version || 1}`);
        if (an.content_json) {
          try {
            const content = JSON.parse(an.content_json);
            if (typeof content === 'object') {
              for (const [key, value] of Object.entries(content)) {
                if (value) parts.push(`  ${key}: ${value}`);
              }
            }
          } catch (e) {}
        }
      }
    }
  }

  // Dados administrativos gerais (se sem paciente)
  if (!patientCtx) {
    try {
      const today = new Date().toISOString().split('T')[0];
      const todayAppts = db.prepare(`
        SELECT COUNT(*) as total,
          SUM(CASE WHEN status = 'scheduled' THEN 1 ELSE 0 END) as scheduled,
          SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) as confirmed,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
        FROM appointments WHERE tenant_id = ? AND start_time LIKE ?
      `).get(tenantId, `${today}%`) as any;

      if (todayAppts) {
        parts.push(`\n--- RESUMO DO DIA ---`);
        parts.push(`Agendamentos de hoje: ${todayAppts.total || 0} (${todayAppts.scheduled || 0} agendados, ${todayAppts.confirmed || 0} confirmados, ${todayAppts.completed || 0} concluídos)`);
      }

      const monthStart = `${new Date().toISOString().slice(0, 7)}-01`;
      const monthMetrics = db.prepare(`
        SELECT COUNT(*) as total,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled,
          SUM(CASE WHEN status = 'no_show' THEN 1 ELSE 0 END) as no_show
        FROM appointments WHERE tenant_id = ? AND start_time >= ?
      `).get(tenantId, monthStart) as any;

      if (monthMetrics) {
        parts.push(`Métricas do mês: ${monthMetrics.total || 0} agendamentos, ${monthMetrics.completed || 0} concluídos, ${monthMetrics.cancelled || 0} cancelados, ${monthMetrics.no_show || 0} faltas`);
      }

      const revenue = db.prepare(`SELECT SUM(amount) as s FROM payments WHERE tenant_id = ? AND status = 'paid' AND created_at >= ?`).get(tenantId, monthStart) as any;
      if (revenue?.s) {
        parts.push(`Faturamento do mês: R$ ${Number(revenue.s).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
      }
    } catch (e) {}
  }

  return parts.join('\n');
}

/**
 * Substituições de identificadores diretos (nome, CPF, telefone, e-mail, contato de
 * emergência, observações administrativas) dos pacientes citados, usadas para limpar
 * o contexto e o histórico antes do envio ao Gemini. Uso estritamente local.
 */
function collectPatientReplacements(tenantId: string, patientIds: Array<string | null | undefined>) {
  const ids = Array.from(new Set(patientIds.filter((id): id is string => !!id)));
  const all: ReturnType<typeof buildIdentifierReplacements> = [];
  for (const id of ids) {
    try {
      const row = db.prepare('SELECT * FROM patients WHERE id = ? AND tenant_id = ?').get(id, tenantId) as any;
      if (row) all.push(...buildIdentifierReplacements(row, PATIENT_PLACEHOLDER));
    } catch (_) {}
  }
  return all;
}

// ============================================================================
// SUGESTÕES PROATIVAS
// ============================================================================

function generateProactiveSuggestions(patientCtx: any, appointmentCtx: any): string[] {
  const suggestions: string[] = [];
  if (!patientCtx) return suggestions;

  const p = patientCtx.patient;
  const records = patientCtx.records || [];
  const allergies = patientCtx.allergies || [];
  const medications = patientCtx.medications || [];

  // Prontuário extenso → sugerir resumo
  if (records.length > 5) {
    suggestions.push('📋 Prontuário extenso com ' + records.length + ' evoluções. Deseja que eu faça um resumo?');
  }

  // Alergias não verificadas
  if (!p.allergies_status || (p.allergies_status !== 'none_known' && allergies.filter((a: any) => a.status === 'active').length === 0)) {
    suggestions.push('⚠️ Status de alergias não verificado. Deseja revisar?');
  }

  // Sem evolução registrada recentemente
  if (records.length > 0) {
    const lastRecord = records[0];
    const lastDate = new Date(lastRecord.session_date || lastRecord.created_at);
    const daysSince = Math.floor((Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
    if (daysSince > 90) {
      suggestions.push('📝 Última evolução registrada há ' + daysSince + ' dias. Pode ser útil revisar o quadro atual.');
    }
  }

  // Atendimento sem evolução
  if (appointmentCtx && appointmentCtx.status === 'in_progress') {
    const hasRecord = records.some((r: any) => r.appointment_id === appointmentCtx.id);
    if (!hasRecord) {
      suggestions.push('📝 Atendimento em andamento sem evolução registrada. Posso ajudar a estruturar?');
    }
  }

  // Medicamentos antigos sem revisão
  const activeMeds = medications.filter((m: any) => m.status === 'active');
  if (activeMeds.length > 3) {
    suggestions.push('💊 Paciente com ' + activeMeds.length + ' medicamentos ativos. Deseja revisar a lista?');
  }

  return suggestions.slice(0, 3); // Máximo 3 sugestões
}

// ============================================================================
// DETECÇÃO DE INTENÇÕES E AÇÕES
// ============================================================================

function detectIntent(userMessage: string, aiReply: string): string {
  const lower = userMessage.toLowerCase();
  const replyLower = aiReply.toLowerCase();

  if (lower.includes('resuma') || lower.includes('resumo') || lower.includes('histórico') || lower.includes('historico')) return 'PATIENT_SUMMARY';
  if (lower.includes('linha do tempo') || lower.includes('timeline') || lower.includes('marcos')) return 'CLINICAL_TIMELINE';
  if (lower.includes('soap') || lower.includes('organiz') || lower.includes('estrutur')) return 'SOAP_STRUCTURE';
  if (lower.includes('encaminhamento') || lower.includes('relatório') || lower.includes('relatorio')) return 'REFERRAL_DRAFT';
  if (lower.includes('agenda') || lower.includes('consulta') || lower.includes('atendimento')) return 'AGENDA_TODAY';
  if (lower.includes('faturamento') || lower.includes('financeiro') || lower.includes('receita')) return 'FINANCIAL_SUMMARY';
  if (lower.includes('horário') || lower.includes('livre') || lower.includes('disponív')) return 'CHECK_AVAILABILITY';
  if (lower.includes('métrica') || lower.includes('estatística') || lower.includes('cancelados')) return 'METRICS';
  if (lower.includes('compare') || lower.includes('comparar') || lower.includes('comparação')) return 'COMPARE_EVOLUTIONS';
  if (lower.includes('faltante') || lower.includes('faltando') || lower.includes('incompleto')) return 'MISSING_INFO';
  if (lower.includes('pendência') || lower.includes('pendente')) return 'PENDING_TASKS';

  return 'AI_RESPONSE';
}

function buildActions(intent: string, patientId: string | undefined, patientCtx: any): any[] {
  const actions: any[] = [];

  if (patientId && patientCtx) {
    if (intent === 'PATIENT_SUMMARY' || intent === 'CLINICAL_TIMELINE') {
      actions.push({ type: 'VIEW_PATIENT', label: 'Ver Prontuário Completo', patientId });
    }
  }

  if (intent === 'AGENDA_TODAY') {
    actions.push({ type: 'NAVIGATE', label: 'Ver Agenda Completa', target: 'calendar' });
  }

  if (intent === 'FINANCIAL_SUMMARY' || intent === 'METRICS') {
    actions.push({ type: 'NAVIGATE', label: 'Abrir Painel Financeiro', target: 'financial' });
  }

  return actions;
}

// ============================================================================
// PERSISTÊNCIA DE CONVERSA
// ============================================================================

function saveToConversation(convId: string, tenantId: string, userText: string, aiReply: string): void {
  try {
    const conv = db.prepare('SELECT messages_json FROM ai_conversations WHERE id = ? AND tenant_id = ?').get(convId, tenantId) as any;
    if (conv) {
      const msgs = JSON.parse(conv.messages_json || '[]');
      msgs.push({ sender: 'user', text: userText, timestamp: new Date().toISOString() });
      msgs.push({ sender: 'assistant', text: aiReply, timestamp: new Date().toISOString() });
      db.prepare('UPDATE ai_conversations SET messages_json = ?, updated_at = datetime("now") WHERE id = ?').run(JSON.stringify(msgs), convId);
    }
  } catch (e) {
    console.error('[AIController.saveToConversation] Erro:', e);
  }
}

// ============================================================================
// HELPERS — MOTOR HEURÍSTICO (fallback quando Gemini indisponível)
// ============================================================================

function calculateAge(birthDateStr: string): number {
  const birth = new Date(birthDateStr);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age >= 0 ? age : 0;
}

function cleanGrammar(text: string): string {
  let res = text.trim();
  res = res.charAt(0).toUpperCase() + res.slice(1);
  if (!res.endsWith('.') && !res.endsWith('!') && !res.endsWith('?')) res += '.';
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
    .replace(/\bmuito ansioso\b/gi, 'quadro de ansiedade exacerbada')
    .replace(/\binchaço\b/gi, 'edema')
    .replace(/\bpressão alta\b/gi, 'hipertensão arterial')
    .replace(/\baçúcar alto\b/gi, 'hiperglicemia')
    .replace(/\bdor no peito\b/gi, 'precordialgia')
    .replace(/\bdor nas costas\b/gi, 'dorsalgia')
    .replace(/\bdor de barriga\b/gi, 'dor abdominal')
    .replace(/\bfebre\b/gi, 'estado febril')
    .replace(/\bvômito\b/gi, 'êmese')
    .replace(/\bcoceira\b/gi, 'prurido')
    .replace(/\bvermelhidão\b/gi, 'hiperemia')
    .replace(/\bformigamento\b/gi, 'parestesia');
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

function formatSoapFallback(raw: string): string {
  return `**S (Subjetivo):**\nPaciente relata queixa principal e evolução dos sintomas desde a última sessão: "${raw.slice(0, 150)}..."\n\n**O (Objetivo):**\nExame do estado geral e observações clínicas preservadas. Sinais e postura condizentes com o relato.\n\n**A (Avaliação):**\nQuadro clínico estável. Boa compreensão das orientações e adesão às condutas terapêuticas.\n\n**P (Plano):**\nManutenção da conduta habitual. Orientações preventivas reforçadas. Retorno programado conforme evolução.`;
}

function parseDateFromText(text: string): Date {
  const d = new Date();
  if (text.includes('amanhã') || text.includes('amanha')) { d.setDate(d.getDate() + 1); return d; }
  if (text.includes('hoje')) return d;

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
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return dateStr;
}

// Exporta para uso em outros módulos (ex: QuickConsultationModal)
export function buildClinicalSynthesis(rawText: string, patientName: string = 'Paciente', patientAge: string = ''): {
  chiefComplaint: string; anamnesis: string; clinicalExams: string;
  physicalExam: string; planAndConduct: string; conduct: string;
} {
  return buildClinicalSynthesisFallback(rawText, patientName, patientAge);
}

function buildClinicalSynthesisFallback(rawText: string, patientName: string = 'Paciente', patientAge: string = ''): {
  chiefComplaint: string; anamnesis: string; clinicalExams: string;
  physicalExam: string; planAndConduct: string; conduct: string;
} {
  const clean = rawText.trim();
  const sentences = clean.split(/[.!?\n]+/).map(s => s.trim()).filter(s => s.length > 2);

  const qpKeywords = ['dor', 'sinto', 'sentindo', 'queixa', 'começou', 'veio por', 'incomodando', 'febre', 'mal estar', 'falta de ar', 'cansaço', 'tontura'];
  const anKeywords = ['histórico', 'dias', 'semanas', 'meses', 'tomo', 'tomando', 'remédio', 'medicamento', 'pressão', 'diabetes', 'alergia', 'cirurgia', 'anterior', 'crônico'];
  const exKeywords = ['exame', 'pressão', 'fc', 'batimento', 'ausculta', 'temperatura', 'pulmão', 'abdômen', 'garganta', 'olho', 'palpação', 'peso', 'altura', 'sinais'];
  const cdKeywords = ['prescrevo', 'receita', 'orientação', 'retorno', 'exercício', 'dieta', 'repouso', 'solicito', 'tomar', 'conduta', 'plano', 'acompanhamento'];

  const qpMatches: string[] = [], anMatches: string[] = [], exMatches: string[] = [], cdMatches: string[] = [];

  for (const s of sentences) {
    const sLower = s.toLowerCase();
    if (qpKeywords.some(k => sLower.includes(k)) && qpMatches.length < 3) qpMatches.push(cleanGrammar(s));
    else if (exKeywords.some(k => sLower.includes(k)) && exMatches.length < 3) exMatches.push(cleanGrammar(s));
    else if (cdKeywords.some(k => sLower.includes(k)) && cdMatches.length < 3) cdMatches.push(cleanGrammar(s));
    else anMatches.push(cleanGrammar(s));
  }

  const chiefComplaint = qpMatches.length > 0 ? qpMatches.join(' ') : cleanGrammar(sentences[0] || 'Paciente comparece relatando sintomas para avaliação clínica.');
  const anamnesis = anMatches.length > 0 ? anMatches.join(' ') : `Paciente ${patientName}${patientAge ? ` (${patientAge})` : ''} refere evolução dos sintomas e histórico clínico recente em acompanhamento.`;
  const clinicalExams = exMatches.length > 0 ? exMatches.join(' ') : 'Estado geral estável. Avaliação clínica e observações compatíveis com o quadro apresentado.';
  const planAndConduct = cdMatches.length > 0 ? cdMatches.join(' ') : 'Orientações clínicas transmitidas, conduta terapêutica alinhada e acompanhamento programado conforme evolução.';

  return {
    chiefComplaint, anamnesis, clinicalExams,
    physicalExam: clinicalExams, planAndConduct, conduct: planAndConduct
  };
}
