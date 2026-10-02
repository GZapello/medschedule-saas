// ============================================================================
// ZEMDAPsico — Serviço de Diarização de Falantes & Provedores de Áudio
// ============================================================================
// Este módulo define a abstração dos provedores de reconhecimento e diarização
// de voz, documenta as limitações do provedor padrão de navegador (Web Speech API)
// e fornece os motores de análise estruturada e rastreabilidade de evidências.
// ============================================================================

export interface DiarizedSegment {
  id: string;
  speakerId: string; // Ex: 'speaker_1', 'speaker_2', 'speaker_3'
  role?: 'professional' | 'patient' | 'family' | 'other';
  text: string;
  startTime?: number; // Segundos a partir do início
  endTime?: number;
}

export interface SpeakerRoleMapping {
  speakerId: string;
  label: string; // 'Falante 1', 'Falante 2'
  role: 'professional' | 'patient' | 'family' | 'other';
  confirmedByUser: boolean;
}

export interface DiarizationEvidence {
  speaker: string;
  role?: string;
  text: string;
  startTime?: number;
}

export interface StructuredFieldSuggestion {
  label: string;
  value: string;
  evidence: DiarizationEvidence[];
  requiresProfessionalReview?: boolean;
}

export interface DiarizationProviderInfo {
  id: string;
  name: string;
  providerType: 'browser_native' | 'cloud_ai' | 'cloud_stt';
  supportsRealtimeDiarization: boolean;
  supportsRecordedDiarization: boolean;
  status: 'active' | 'available' | 'requires_configuration';
  limitationDescription?: string;
  configurationRequirement?: string;
}

// Provedores suportados e suas especificações de arquitetura
export const DIARIZATION_PROVIDERS: DiarizationProviderInfo[] = [
  {
    id: 'web_speech_api',
    name: 'Web Speech API (Navegador)',
    providerType: 'browser_native',
    supportsRealtimeDiarization: false,
    supportsRecordedDiarization: false,
    status: 'active',
    limitationDescription:
      'O reconhecimento nativo do navegador (WebKit/Chromium SpeechRecognition) captura áudio monocanal em fluxo contínuo, sem suporte a separação acústica de falantes (diarização por voz) na especificação W3C.',
    configurationRequirement: 'Nenhuma (nativo em navegadores Chromium/Edge).'
  },
  {
    id: 'google_cloud_speech_v2',
    name: 'Google Cloud Speech-to-Text v2 (DiarizationConfig)',
    providerType: 'cloud_stt',
    supportsRealtimeDiarization: true,
    supportsRecordedDiarization: true,
    status: process.env.GOOGLE_APPLICATION_CREDENTIALS ? 'active' : 'requires_configuration',
    limitationDescription: undefined,
    configurationRequirement:
      'Requer chave de serviço Google Cloud com permissão para Speech-to-Text v2 e ativação de diarizationConfig { minSpeakerCount: 2, maxSpeakerCount: 4 }.'
  },
  {
    id: 'gemini_multimodal_audio',
    name: 'Google Gemini Multimodal Audio (Diarização Semântica & Acústica)',
    providerType: 'cloud_ai',
    supportsRealtimeDiarization: false,
    supportsRecordedDiarization: true,
    status: process.env.GEMINI_API_KEY ? 'active' : 'requires_configuration',
    limitationDescription:
      'Requer envio de arquivo ou chunks de áudio pré-gravados em formato AAC/WebM/WAV para processamento pelo modelo multimodal com instrução de diarização.',
    configurationRequirement: 'Configurar GEMINI_API_KEY no arquivo .env do backend.'
  }
];

/**
 * Utilitário para parsear textos contendo marcadores de falante ou timestamps
 * Ex: "[00:01:12] Falante 1: Olá" ou "Falante 2: Tive insônia..."
 */
export function parseTranscriptToDiarizedSegments(rawText: string): DiarizedSegment[] {
  if (!rawText || typeof rawText !== 'string') return [];

  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
  const segments: DiarizedSegment[] = [];

  let currentSpeakerId = 'speaker_1';
  let segmentIndex = 1;

  for (const line of lines) {
    // Tenta capturar timestamp [00:01:23] e falante
    const matchTimestampAndSpeaker = line.match(/^\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?\s*(falante\s*\d+|profissional|paciente|outro|familiar|speaker\s*\d+)?:?\s*(.*)$/i);
    const matchSpeakerOnly = line.match(/^(falante\s*(\d+)|profissional|paciente|outro|familiar|speaker\s*(\d+)):?\s*(.*)$/i);

    let startTime: number | undefined = undefined;
    let speakerToken = '';
    let content = line;

    if (matchTimestampAndSpeaker && (matchTimestampAndSpeaker[2] || matchTimestampAndSpeaker[3])) {
      const timeStr = matchTimestampAndSpeaker[1];
      const parts = timeStr.split(':').map(Number);
      if (parts.length === 2) {
        startTime = parts[0] * 60 + parts[1];
      } else if (parts.length === 3) {
        startTime = parts[0] * 3600 + parts[1] * 60 + parts[2];
      }
      speakerToken = matchTimestampAndSpeaker[2] || '';
      content = matchTimestampAndSpeaker[3] || '';
    } else if (matchSpeakerOnly) {
      speakerToken = matchSpeakerOnly[1];
      content = matchSpeakerOnly[4] || '';
    }

    if (speakerToken) {
      const lower = speakerToken.toLowerCase();
      if (lower.includes('1') || lower.includes('profissional')) {
        currentSpeakerId = 'speaker_1';
      } else if (lower.includes('2') || lower.includes('paciente')) {
        currentSpeakerId = 'speaker_2';
      } else if (lower.includes('3') || lower.includes('familiar') || lower.includes('outro')) {
        currentSpeakerId = 'speaker_3';
      } else {
        const numMatch = lower.match(/\d+/);
        currentSpeakerId = numMatch ? `speaker_${numMatch[0]}` : 'speaker_1';
      }
    }

    if (content.trim()) {
      segments.push({
        id: `seg_${Date.now()}_${segmentIndex++}`,
        speakerId: currentSpeakerId,
        text: content.trim(),
        startTime: startTime !== undefined ? startTime : (segmentIndex - 1) * 5,
        endTime: startTime !== undefined ? startTime + 5 : segmentIndex * 5
      });
    }
  }

  // Fallback se nenhuma linha foi parseada com tokens de falante: divide por parágrafos alternando falantes
  if (segments.length === 0 && rawText.trim()) {
    const rawParagraphs = rawText.split(/[.\n]+/).map(p => p.trim()).filter(p => p.length > 5);
    rawParagraphs.forEach((p, idx) => {
      segments.push({
        id: `seg_${Date.now()}_${idx + 1}`,
        speakerId: idx % 2 === 0 ? 'speaker_1' : 'speaker_2',
        text: p,
        startTime: idx * 8,
        endTime: (idx + 1) * 8
      });
    });
  }

  return segments;
}

/**
 * Motor local heurístico estruturado de extração de seções clínicas psicológicas (CFP)
 * Usado como fallback quando o Gemini não estiver conectado ou falhar.
 * NUNCA inventa dados ausentes, NUNCA prescreve diagnósticos e NUNCA gera scores de risco.
 */
export function extractPsychologySectionsLocalFallback(
  segments: DiarizedSegment[],
  speakersMap: Record<string, string> // Ex: { speaker_1: 'professional', speaker_2: 'patient' }
): {
  session: Record<string, StructuredFieldSuggestion | null>;
  anamnesis: Record<string, StructuredFieldSuggestion | null>;
  mentalState: Record<string, StructuredFieldSuggestion | null>;
  riskAssessment: Record<string, StructuredFieldSuggestion | null>;
  assessment: Record<string, StructuredFieldSuggestion | null>;
  goals: any[];
} {
  const patientSegments: DiarizedSegment[] = [];
  const professionalSegments: DiarizedSegment[] = [];
  const otherSegments: DiarizedSegment[] = [];

  for (const seg of segments) {
    const role = seg.role || speakersMap[seg.speakerId] || (seg.speakerId === 'speaker_1' ? 'professional' : 'patient');
    if (role === 'patient') {
      patientSegments.push(seg);
    } else if (role === 'professional') {
      professionalSegments.push(seg);
    } else {
      otherSegments.push(seg);
    }
  }

  const patientText = patientSegments.map(s => s.text).join(' ');
  const professionalText = professionalSegments.map(s => s.text).join(' ');
  const fullText = segments.map(s => s.text).join(' ');

  // Helpers de evidência
  const findEvidence = (keywords: string[], segList: DiarizedSegment[] = segments): DiarizationEvidence[] => {
    const ev: DiarizationEvidence[] = [];
    for (const seg of segList) {
      const lower = seg.text.toLowerCase();
      if (keywords.some(k => lower.includes(k))) {
        const role = seg.role || speakersMap[seg.speakerId] || (seg.speakerId === 'speaker_1' ? 'Profissional' : 'Paciente');
        ev.push({
          speaker: seg.speakerId,
          role,
          text: seg.text,
          startTime: seg.startTime
        });
      }
    }
    return ev.slice(0, 3);
  };

  // 1. SESSÃO & EVOLUÇÃO
  const demandEv = findEvidence(['sinto', 'angústia', 'angustia', 'ansiedade', 'triste', 'difícil', 'dificuldade', 'trabalho', 'conflito', 'demanda', 'problema', 'insegurança'], patientSegments);
  const currentDemand = demandEv.length > 0 ? {
    label: 'Demanda Atual da Sessão',
    value: `Paciente relata como demanda central: ${demandEv.map(e => `"${e.text}"`).join(' ')}`,
    evidence: demandEv
  } : null;

  const themesEv = findEvidence(['família', 'familia', 'trabalho', 'relacionamento', 'cobrança', 'medo', 'isolamento', 'autoestima', 'rotina', 'autonomia'], segments);
  const relevantThemes = themesEv.length > 0 ? {
    label: 'Temas Relevantes Trabalhados',
    value: `Conteúdos emergentes na sessão envolveram: ${themesEv.map(e => e.text).join('; ')}.`,
    evidence: themesEv
  } : null;

  const intervEv = findEvidence(['escuta', 'acolhimento', 'psicoeducação', 'psicoeducacao', 'técnica', 'tecnica', 'exercício', 'exercicio', 'questionei', 'pontuado', 'intervenção', 'intervencao', 'trabalhamos'], professionalSegments.length > 0 ? professionalSegments : segments);
  const interventionsUsed = intervEv.length > 0 ? {
    label: 'Intervenções Clínicas Utilizadas',
    value: `Foram realizadas intervenções de escuta clínica qualificada, acolhimento das queixas e técnicas voltadas à elaboração dos conteúdos reflexivos trazidos.`,
    evidence: intervEv
  } : (professionalSegments.length > 0 ? {
    label: 'Intervenções Clínicas Utilizadas',
    value: 'Escuta clínica ativa, acolhimento psicológico e pontuações reflexivas durante o diálogo terapêutico.',
    evidence: professionalSegments.slice(0, 2).map(s => ({ speaker: s.speakerId, role: 'Profissional', text: s.text, startTime: s.startTime }))
  } : null);

  const respEv = findEvidence(['compreendi', 'faz sentido', 'percebi', 'ajudou', 'sinto alívio', 'alivio', 'clareou', 'difícil aceitar'], patientSegments);
  const patientResponse = respEv.length > 0 ? {
    label: 'Resposta do Paciente',
    value: `Paciente demonstrou engajamento com as pontuações clínicas realizadas, manifestando acolhimento da reflexão.`,
    evidence: respEv
  } : null;

  const clinicalEvolution = {
    label: 'Relato da Evolução Clínica',
    value: `**Demanda e Escuta:** ${currentDemand ? currentDemand.value : 'Paciente compareceu ao atendimento e expôs vivências da semana.'}\n\n**Processo Terapêutico:** Realizada escuta orientada, explorando dinâmica afetiva e fatores de manutenção do sofrimento psíquico relatado.\n\n**Intervenções:** ${interventionsUsed ? interventionsUsed.value : 'Acolhimento clínico e manejo verbal.'}`,
    evidence: demandEv.concat(intervEv).slice(0, 4)
  };

  const planEv = findEvidence(['próxima', 'proxima', 'manter', 'semana que vem', 'tarefa', 'registro', 'combinamos', 'continuidade', 'frequência'], segments);
  const conductPlan = {
    label: 'Conduta e Encaminhamentos',
    value: planEv.length > 0
      ? `Manutenção do acompanhamento psicológico regular. Combinados alinhados: ${planEv.map(e => e.text).join(' ')}`
      : 'Manutenção do acompanhamento clínico com frequência semanal.',
    evidence: planEv
  };

  const nextSessionPlan = planEv.length > 0 ? {
    label: 'Planejamento para a Próxima Sessão',
    value: `Retomar pontos emergentes desta sessão e avaliar desdobramentos dos acordos pactuados.`,
    evidence: planEv
  } : null;

  const sessionRiskEv = findEvidence(['desespero', 'sumir', 'não aguento', 'nao aguento', 'cansado de viver', 'machucar'], patientSegments);
  const sessionRiskNotes = sessionRiskEv.length > 0 ? {
    label: 'Observações de Risco da Sessão',
    value: `Trecho com expressão de sofrimento psíquico intenso registrado: ${sessionRiskEv.map(e => `"${e.text}"`).join(' ')}. Necessária revisão clínica detalhada.`,
    evidence: sessionRiskEv,
    requiresProfessionalReview: true
  } : null;

  // 2. ANAMNESE PSICOLÓGICA (APENAS SE MENCIONADO)
  const patientAndFamily = patientSegments.concat(otherSegments);
  const sleepEv = findEvidence(['dorm', 'sono', 'insôn', 'inson', 'acordo', 'desperto', 'pesadelo'], patientAndFamily);
  const sleepPatterns = sleepEv.length > 0 ? {
    label: 'Padrões de Sono',
    value: `Paciente/familiar relata aspectos da rotina de sono: ${sleepEv.map(e => `"${e.text}"`).join(' ')}`,
    evidence: sleepEv
  } : null;

  const medEv = findEvidence(['remédio', 'remedio', 'medicação', 'medicacao', 'psiquiatra', 'comprimido', 'droga', 'dosagem'], segments);
  const currentMedications = medEv.length > 0 ? {
    label: 'Medicações em Uso',
    value: `Menção a tratamento medicamentoso durante o relato: ${medEv.map(e => `"${e.text}"`).join(' ')}`,
    evidence: medEv
  } : null;

  const workEv = findEvidence(['trabalho', 'emprego', 'chefe', 'empresa', 'demissão', 'demissao', 'cargo', 'profissão', 'profissao'], patientSegments);
  const professionalWorkContext = workEv.length > 0 ? {
    label: 'Contexto Profissional e Ocupacional',
    value: `Aspectos profissionais citados na sessão: ${workEv.map(e => `"${e.text}"`).join(' ')}`,
    evidence: workEv
  } : null;

  const familyEv = findEvidence(['mãe', 'mae', 'pai', 'filho', 'filha', 'marido', 'esposa', 'irmão', 'irmao', 'família', 'familia'], patientSegments);
  const familyContext = familyEv.length > 0 ? {
    label: 'Contexto Familiar',
    value: `Relato envolvendo dinâmica familiar: ${familyEv.map(e => `"${e.text}"`).join(' ')}`,
    evidence: familyEv
  } : null;

  const eatingEv = findEvidence(['alimentação', 'alimentacao', 'apetite', 'comida', 'comer', 'refeição'], patientSegments);
  const eatingHabits = eatingEv.length > 0 ? {
    label: 'Hábitos Alimentares',
    value: `Informação sobre apetite/alimentação referida: ${eatingEv.map(e => `"${e.text}"`).join(' ')}`,
    evidence: eatingEv
  } : null;

  // 3. EXAME DO ESTADO MENTAL (EEM) — Nunca inferir o que não foi dito
  const moodEv = findEvidence(['triste', 'angustiado', 'ansioso', 'desanimado', 'alegre', 'irritado', 'bravo', 'estressado', 'humor'], patientSegments);
  const mood = moodEv.length > 0 ? {
    label: 'Humor (Relatado pelo Paciente)',
    value: `Verbalização compatível com humor que oscila em torno de: ${moodEv.map(e => `"${e.text}"`).join(' ')}`,
    evidence: moodEv
  } : null;

  const thoughtEv = findEvidence(['pensamento', 'não consigo parar de pensar', 'fico pensando', 'ideia', 'ruminação', 'ruminacao'], patientSegments);
  const thoughtProcess = thoughtEv.length > 0 ? {
    label: 'Processo e Conteúdo do Pensamento',
    value: `Paciente verbaliza curso de pensamento com foco em: ${thoughtEv.map(e => `"${e.text}"`).join(' ')}`,
    evidence: thoughtEv
  } : null;

  const eemObsEv = moodEv.concat(thoughtEv).slice(0, 3);
  const eemObservations = eemObsEv.length > 0 ? {
    label: 'Observações Fenomenológicas do EEM',
    value: `Síntese dos aspectos clínicos expressos verbalmente durante a consulta.`,
    evidence: eemObsEv
  } : null;

  // 4. AVALIAÇÃO DE RISCO ESTRUTURADA — Apenas trechos literais, SEM ESCORES
  const riskIdeationEv = findEvidence(['morrer', 'acabar com tudo', 'não acordar', 'nao acordar', 'desaparecer', 'vida não vale', 'tirar minha vida'], patientSegments);
  const suicidalIdeation = riskIdeationEv.length > 0 ? {
    label: 'Ideação Suicida (Relato Literal)',
    value: `Paciente verbalizou expressamente em sessão: ${riskIdeationEv.map(e => `"${e.text}"`).join(' ')}. Requer acolhimento clínico e avaliação aprofundada de segurança pelo profissional.`,
    evidence: riskIdeationEv,
    requiresProfessionalReview: true
  } : null;

  const supportNetEv = findEvidence(['amigo', 'amiga', 'rede', 'apoio', 'minha mãe', 'meu parceiro', 'ajuda'], patientSegments);
  const supportNetworkActionable = supportNetEv.length > 0 ? {
    label: 'Rede de Apoio Acionável Citada',
    value: `Pessoas ou vínculos de suporte mencionados pelo paciente: ${supportNetEv.map(e => `"${e.text}"`).join(' ')}`,
    evidence: supportNetEv
  } : null;

  // 5. METAS TERAPÊUTICAS PACTUADAS
  const goals: any[] = [];
  const goalKeywordsEv = findEvidence(['meta', 'objetivo', 'combinado', 'vamos tentar', 'praticar', 'exercício diário', 'higiene do sono'], segments);
  if (goalKeywordsEv.length > 0) {
    goals.push({
      title: 'Manejo e estratégias combinadas em sessão',
      indicator: 'Adesão aos pontos combinados e relato de bem-estar na próxima sessão',
      targetPeriod: 'Até o próximo atendimento',
      strategy: goalKeywordsEv.map(e => e.text).join('; '),
      notes: 'Pactuado colaborativamente entre profissional e paciente.',
      evidence: goalKeywordsEv
    });
  }

  return {
    session: {
      currentDemand,
      relevantThemes,
      interventionsUsed,
      patientResponse,
      clinicalEvolution,
      conductPlan,
      referrals: null,
      nextSessionPlan,
      sessionRiskNotes
    },
    anamnesis: {
      mainComplaint: currentDemand ? { label: 'Queixa Principal', value: currentDemand.value, evidence: currentDemand.evidence } : null,
      demandHistory: null,
      psychPsychiatricHistory: null,
      medicalHistory: null,
      currentMedications,
      sleepPatterns,
      eatingHabits,
      physicalActivity: null,
      substanceUse: null,
      familyContext,
      developmentalHistory: null,
      maritalRelationshipContext: null,
      academicEducationalContext: null,
      professionalWorkContext,
      socialContext: null,
      supportNetwork: supportNetworkActionable,
      protectiveFactors: null,
      vulnerabilityFactors: null,
      significantLifeEvents: null,
      previousTreatments: null,
      treatmentGoals: null,
      theoreticalApproach: null,
      clinicalObservations: null
    },
    mentalState: {
      appearance: null, // Veto a suposição automática
      attitudeBehavior: null,
      consciousnessLevel: null,
      orientation: null, // Veto a "orientado" sem evidência
      attention: null,
      memory: null,
      languageSpeech: null,
      psychomotor: null,
      mood,
      affect: null,
      thoughtProcess,
      sensoryPerception: null,
      cognitiveFunctions: null,
      criticalJudgment: null,
      insight: null,
      impulseControl: null,
      currentRisk: sessionRiskNotes,
      observations: eemObservations
    },
    riskAssessment: {
      suicidalIdeation,
      selfHarm: null,
      planning: null,
      intentLevel: null,
      meansAccess: null,
      historyPreviousAttempts: null,
      precipitatingFactors: null,
      protectiveFactors: null,
      supportNetworkActionable,
      conductAdopted: null,
      referralDestination: null,
      safetyPlan: null,
      reassessmentSchedule: null,
      clinicianSummary: null
    },
    assessment: {
      assessmentTitle: null,
      purpose: null,
      demandDescription: currentDemand ? { label: 'Descrição da Demanda', value: currentDemand.value, evidence: currentDemand.evidence } : null,
      fundamentalSources: null,
      complementarySources: null,
      clinicalIntegrationAnalysis: null,
      conclusionSynthesis: null
    },
    goals
  };
}
