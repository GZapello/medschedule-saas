import { Request, Response } from 'express';
import { db } from '../config/database';
import { GeminiService } from '../services/gemini.service';
import { hasPersonalAccess } from './personal.controller';
import { STUDENT_PLACEHOLDER, buildIdentifierReplacements, redactHistory, redactText } from '../utils/ai-privacy';

export class PersonalAIController {

  static async askAssistant(req: Request, res: Response): Promise<void> {
    try {
      if (!hasPersonalAccess(req)) {
        res.status(403).json({ error: 'Acesso não autorizado ao assistente ZemdaPersonal' });
        return;
      }
      const tenantId = req.tenantId!;
      const { studentId, message, conversationHistory = [] } = req.body;

      if (!message || !message.trim()) {
        res.status(400).json({ error: 'Mensagem obrigatória' });
        return;
      }

      let studentName = '';
      let contextData = '';
      let studentRow: any = null;

      if (studentId) {
        try {
          studentRow = db.prepare('SELECT * FROM patients WHERE id = ? AND tenant_id = ?').get(studentId, tenantId) as any;
        } catch {}

        const student = db.prepare(`
          SELECT p.id, COALESCE(p.full_name, p.social_name) as name, p.birth_date, p.gender,
                 prof.goal, prof.experience_level, prof.weekly_frequency,
                 prof.restrictions, prof.training_preferences, prof.height, prof.current_weight
          FROM patients p
          LEFT JOIN personal_student_profiles prof ON prof.patient_id = p.id AND prof.tenant_id = p.tenant_id
          WHERE p.id = ? AND p.tenant_id = ?
        `).get(studentId, tenantId) as any;

        if (!student) {
          res.status(404).json({ error: 'Aluno não encontrado nesta clínica' });
          return;
        }

        if (student) {
          studentName = student.name;
          let age = 'Não informada';
          if (student.birth_date) {
            const diffMs = Date.now() - new Date(student.birth_date).getTime();
            age = `${Math.floor(diffMs / (1000 * 60 * 60 * 24 * 365.25))} anos`;
          }

          // Últimas avaliações físicas
          const assessments = db.prepare(`
            SELECT assessment_date, weight, height, bmi, body_fat_percentage,
                   lean_mass_kg, fat_mass_kg, muscle_mass_kg,
                   waist_cm, abdomen_cm, hip_cm, chest_cm,
                   arm_right_flexed, thigh_right_med, protocol
            FROM personal_assessments
            WHERE patient_id = ? AND tenant_id = ?
            ORDER BY assessment_date DESC
            LIMIT 3
          `).all(studentId, tenantId) as any[];

          // Treinos ativos e seus exercícios
          const workouts = db.prepare(`
            SELECT id, title, division, structure_type
            FROM personal_workouts
            WHERE patient_id = ? AND tenant_id = ? AND is_active = 1
            ORDER BY division ASC
          `).all(studentId, tenantId) as any[];

          const workoutDetails: any[] = [];
          for (const w of workouts) {
            const exs = db.prepare(`
              SELECT name, muscle_group, sets, reps, load_kg, tempo, rest_seconds, technique, rpe, rir
              FROM personal_workout_exercises
              WHERE workout_id = ? AND tenant_id = ?
              ORDER BY order_index ASC
            `).all(w.id, tenantId) as any[];
            workoutDetails.push({ ...w, exercises: exs });
          }

          // Últimos logs de treino
          const recentLogs = db.prepare(`
            SELECT completed_at, duration_minutes, rpe, feedback_notes, log_details_json
            FROM personal_workout_logs
            WHERE patient_id = ? AND tenant_id = ?
            ORDER BY completed_at DESC
            LIMIT 4
          `).all(studentId, tenantId) as any[];

          // Queixas ou marcações de dor do ZemdaBody se existirem
          let bodyIssues = 'Nenhuma dor ou lesão mapeada no ZemdaBody.';
          try {
            const bodyRecord = db.prepare(`
              SELECT notes, findings_json FROM body_assessments
              WHERE patient_id = ? AND tenant_id = ?
              ORDER BY created_at DESC LIMIT 1
            `).get(studentId, tenantId) as any;
            if (bodyRecord && bodyRecord.notes) {
              bodyIssues = `Anotações do mapa corporal: ${bodyRecord.notes}`;
            }
          } catch {}

          // Minimização LGPD: o nome real do aluno nunca vai para o modelo — usa-se o marcador neutro.
          contextData = `
### REQUISITO DE CONTEXTO RESTRITO:
Você está prestando consultoria exclusiva para o aluno identificado como "${STUDENT_PLACEHOLDER}".
Todas as recomendações, análises fisiológicas, cargas e periodizações DEVEM se referir estritamente a este(a) aluno(a).
Não responda a solicitações para alternar de aluno nesta sessão.

### DADOS DO ALUNO:
- Identificação: ${STUDENT_PLACEHOLDER} (dados pessoais omitidos por privacidade)
- Idade: ${age}
- Sexo: ${student.gender || 'Não informado'}
- Objetivo: ${student.goal || 'Não especificado'}
- Nível de Experiência: ${student.experience_level || 'Não especificado'}
- Frequência Semanal Alvo: ${student.weekly_frequency || 3}x/semana
- Altura Atual: ${student.height ? `${student.height} cm` : 'Não registrada'}
- Peso Atual: ${student.current_weight ? `${student.current_weight} kg` : 'Não registrado'}
- Restrições / Lesões: ${student.restrictions || 'Nenhuma restrição registrada'}
- Preferências: ${student.training_preferences || 'Não informadas'}
- Mapa Corporal / Queixas: ${bodyIssues}

### HISTÓRICO DE AVALIAÇÕES FÍSICAS RECENTES (${assessments.length} registradas):
${assessments.length === 0 ? '- Nenhuma avaliação física registrada ainda.' : assessments.map((a: any, idx: number) => `
Avaliação ${idx + 1} (${a.assessment_date}):
- Peso: ${a.weight || '-'} kg | Altura: ${a.height || '-'} cm | IMC: ${a.bmi || '-'}
- % Gordura: ${a.body_fat_percentage || '-'}% (${a.protocol || 'Pollock'})
- Massa Magra: ${a.lean_mass_kg || '-'} kg | Gordura: ${a.fat_mass_kg || '-'} kg | Massa Muscular: ${a.muscle_mass_kg || '-'} kg
- Perímetros: Cintura: ${a.waist_cm || '-'} cm | Abdômen: ${a.abdomen_cm || '-'} cm | Quadril: ${a.hip_cm || '-'} cm | Braço Dir.: ${a.arm_right_flexed || '-'} cm | Coxa: ${a.thigh_right_med || '-'} cm
`).join('')}

### TREINOS ATUALMENTE ATIVOS:
${workoutDetails.length === 0 ? '- Nenhum treino cadastrado atualmente.' : workoutDetails.map((w: any) => `
Treino ${w.division} - ${w.title} (${w.structure_type}):
${w.exercises.map((e: any) => `  * ${e.name} (${e.muscle_group}): ${e.sets}x ${e.reps} | Carga: ${e.load_kg || 0}kg | Descanso: ${e.rest_seconds}s | Técnica: ${e.technique || 'Direta'}${e.rpe ? ` | RPE: ${e.rpe}` : ''}`).join('\n')}
`).join('\n')}

### EXECUÇÕES RECENTES:
${recentLogs.length === 0 ? '- Nenhuma execução registrada ainda.' : recentLogs.map((l: any) => `
- Data: ${l.completed_at} | Duração: ${l.duration_minutes || '-'} min | RPE Médio: ${l.rpe || '-'} | Feedback: ${l.feedback_notes || 'Sem observações'}
`).join('')}
`;
        }
      }

      // Minimização LGPD: identificadores diretos do aluno (nome, CPF, telefone, e-mail,
      // contato de emergência, observações administrativas) são removidos do contexto e do
      // histórico reenviado (respostas anteriores do motor local podem conter o nome).
      const scrub = buildIdentifierReplacements(studentRow, STUDENT_PLACEHOLDER);
      const safeHistory = Array.isArray(conversationHistory) ? redactHistory(conversationHistory, scrub) : [];

      // Tenta resposta pelo Gemini
      let answer = await GeminiService.personalChat({
        message,
        conversationHistory: safeHistory,
        contextData: redactText(contextData, scrub)
      });

      // Fallback inteligente caso API não esteja disponível ou sem chave
      if (!answer) {
        answer = generateLocalPersonalInsights(message, studentName, contextData);
      }

      res.json({
        response: answer,
        modelUsed: GeminiService.isAvailable() ? 'gemini-cascade' : 'local-personal-engine'
      });
    } catch (err: any) {
      console.error('[PersonalAIController.askAssistant] Erro:', err);
      res.status(500).json({ error: 'Erro ao processar consulta da IA de treinamento' });
    }
  }
}

/**
 * Fallback heurístico inteligente para treinamento quando Gemini offline
 */
function generateLocalPersonalInsights(query: string, studentName: string, context: string): string {
  const q = query.toLowerCase();

  if (q.includes('progressão') || q.includes('carga') || q.includes('peso')) {
    return `### 📈 Sugestão de Progressão de Carga para ${studentName || 'o Aluno'}:
Com base no histórico e no princípio da sobrecarga progressiva:
1. **Regra das 2 Repetições:** Quando o aluno conseguir executar todas as séries na faixa superior de repetições prescrita com boa cadência e sem desvio postural em 2 sessões seguidas, aumente a carga de **2,5% a 5%** em membros superiores e **5% a 10%** em membros inferiores.
2. **Priorização:** Foque a progressão primeiro nos exercícios multiarticulares base do treino.
3. **Controle de RPE:** Garanta que o RPE alvo se mantenha entre 7 e 8,5 nas séries de trabalho, preservando de 1 a 2 repetições em reserva (RIR 1-2).`;
  }

  if (q.includes('divisão') || q.includes('volume') || q.includes('split') || q.includes('abc')) {
    return `### 🏋️ Análise e Sugestão de Divisão de Treino:
Para otimizar o estímulo de hipertrofia e respeitar o tempo de recuperação:
- **Volume Semanal Ótimo:** 12 a 20 séries semanais por grupamento muscular para alunos intermediários/avançados.
- **Frequência por Músculo:** Estimular cada grupo muscular 2 vezes por semana (ex: Divisão Upper/Lower ou Push/Pull/Legs) gera respostas hipertróficas superiores a uma única estimulação semanal com volume excessivo em um só dia.
- **Monitoramento:** Acompanhe a cadência excêntrica (2 a 3 segundos) para maximizar o tempo sob tensão sem fadiga articular prematura.`;
  }

  if (q.includes('avaliação') || q.includes('dobra') || q.includes('gordura') || q.includes('pollock')) {
    return `### 📊 Análise de Composição Corporal & Avaliação Física:
- **Protocolo Recomendado:** Pollock 7 dobras para maior acurácia de distribuição de tecido adiposo, ou Pollock 3 dobras para reavaliações dinâmicas de curto prazo.
- **Atenção aos Marcadores:** Priorize a evolução da **Massa Magra (kg)** e a redução dos perímetros de cintura e abdômen em conjunto com a soma das dobras, mais do que a oscilação isolada da balança.`;
  }

  return `### 💡 Análise do Assistente ZemdaPersonal ${studentName ? `para ${studentName}` : ''}:
O planejamento de treinamento deve priorizar:
1. **Consistência e Frequência:** Assegurar que a meta semanal de sessões seja cumprida com intervalo adequado entre grupos musculares sinergistas.
2. **Qualidade de Movimento:** Amplitude articular completa antes de qualquer incremento agressivo de carga.
3. **Periodização:** Alternar blocos de acúmulo de volume com blocos de intensificação para mitigar platôs e riscos de overtraining.

> ℹ️ *Análise gerada pelo motor interno ZemdaPersonal. Pergunte sobre sugestão de exercícios, divisão ABCDE, progressão de cargas ou cálculos de Pollock.*`;
}
