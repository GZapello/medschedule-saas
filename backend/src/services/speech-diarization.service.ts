export const PSYCHOLOGY_FIELDS = {
  "session": {
    "currentDemand": "Demanda Atual",
    "relevantThemes": "Temas Relevantes",
    "interventionsUsed": "Intervenções Utilizadas",
    "patientResponse": "Resposta do Paciente",
    "clinicalEvolution": "Evolução Clínica",
    "conductPlan": "Conduta",
    "referrals": "Encaminhamentos",
    "nextSessionPlan": "Planejamento da Próxima Sessão",
    "sessionRiskNotes": "Observações de Risco"
  },
  "anamnesis": {
    "mainComplaint": "Queixa Principal",
    "demandHistory": "História da Demanda",
    "psychPsychiatricHistory": "Histórico Psicológico e Psiquiátrico",
    "medicalHistory": "Histórico Médico",
    "currentMedications": "Medicações Atuais",
    "sleepPatterns": "Padrões de Sono",
    "eatingHabits": "Hábitos Alimentares",
    "physicalActivity": "Atividade Física",
    "substanceUse": "Uso de Substâncias",
    "familyContext": "Contexto Familiar",
    "developmentalHistory": "Histórico do Desenvolvimento",
    "maritalRelationshipContext": "Contexto Conjugal",
    "academicEducationalContext": "Contexto Acadêmico e Educacional",
    "professionalWorkContext": "Contexto Profissional",
    "socialContext": "Contexto Social",
    "supportNetwork": "Rede de Apoio",
    "protectiveFactors": "Fatores Protetivos",
    "vulnerabilityFactors": "Fatores de Vulnerabilidade",
    "significantLifeEvents": "Eventos de Vida Significativos",
    "previousTreatments": "Tratamentos Anteriores",
    "treatmentGoals": "Objetivos do Tratamento",
    "theoreticalApproach": "Abordagem Teórica",
    "clinicalObservations": "Observações Clínicas"
  },
  "mentalState": {
    "appearance": "Aparência",
    "attitudeBehavior": "Atitude e Comportamento",
    "consciousnessLevel": "Nível de Consciência",
    "orientation": "Orientação",
    "attention": "Atenção",
    "memory": "Memória",
    "languageSpeech": "Linguagem e Fala",
    "psychomotor": "Psicomotricidade",
    "mood": "Humor",
    "affect": "Afeto",
    "thoughtProcess": "Processo do Pensamento",
    "sensoryPerception": "Sensopercepção",
    "cognitiveFunctions": "Funções Cognitivas",
    "criticalJudgment": "Juízo Crítico",
    "insight": "Insight",
    "impulseControl": "Controle de Impulsos",
    "currentRisk": "Risco Atual",
    "observations": "Observações"
  },
  "riskAssessment": {
    "suicidalIdeation": "Ideação Suicida",
    "selfHarm": "Autolesão",
    "planning": "Planejamento",
    "intentLevel": "Intenção Verbalizada",
    "meansAccess": "Acesso a Meios",
    "historyPreviousAttempts": "Tentativas Anteriores",
    "precipitatingFactors": "Fatores Precipitantes",
    "protectiveFactors": "Fatores Protetivos",
    "supportNetworkActionable": "Rede de Apoio Acionável",
    "conductAdopted": "Conduta Adotada",
    "referralDestination": "Destino do Encaminhamento",
    "safetyPlan": "Plano de Segurança",
    "reassessmentSchedule": "Reavaliação",
    "clinicianSummary": "Síntese do Profissional"
  },
  "assessment": {
    "assessmentTitle": "Título da Avaliação",
    "purpose": "Finalidade",
    "demandDescription": "Descrição da Demanda",
    "fundamentalSources": "Fontes Fundamentais",
    "complementarySources": "Fontes Complementares",
    "clinicalIntegrationAnalysis": "Análise de Integração Clínica",
    "conclusionSynthesis": "Síntese Conclusiva",
    "professionalSynthesis": "Síntese Profissional do Instrumento"
  },
  "screenings": {
    "clinicalNotes": "Notas Clínicas"
  },
  "goals": {
    "title": "Título",
    "indicator": "Indicador",
    "targetPeriod": "Prazo",
    "strategy": "Estratégia",
    "notes": "Observações"
  }
} as const;
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
    status: 'requires_configuration',
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
    status: 'requires_configuration',
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
        startTime
      });
    }
  }

  return segments;
}

/**
 * Motor local heurístico estruturado de extração de seções clínicas psicológicas (CFP)
 * Usado como fallback quando o Gemini não estiver conectado ou falhar.
 * NUNCA inventa dados ausentes, NUNCA prescreve diagnósticos e NUNCA gera scores de risco.
 */
export function emptyPsychologySections(): any {
  return Object.fromEntries(Object.entries(PSYCHOLOGY_FIELDS).map(([section, fields]) =>
    [section, section === 'goals' ? [] : Object.fromEntries(Object.keys(fields).map(field => [field, null]))]));
}

// Accept only allowlisted fields with evidence tied to a submitted turn.
export function validatePsychologyExtraction(raw: any, segments: DiarizedSegment[], speakers: Record<string, string>): any {
  const sections = emptyPsychologySections();
  const evidenceFor = (items: any): DiarizationEvidence[] => !Array.isArray(items) ? [] : items.flatMap((e: any) => {
    const source = segments.find(s => s.speakerId === e?.speaker && typeof e?.text === 'string' && e.text.trim() && s.text.includes(e.text) && (e.startTime === undefined || e.startTime === s.startTime));
    return source ? [{ speaker: source.speakerId, role: speakers[source.speakerId], text: e.text, startTime: source.startTime }] : [];
  });
  for (const [section, fields] of Object.entries(PSYCHOLOGY_FIELDS)) {
    if (section === 'goals') continue;
    for (const [field, label] of Object.entries(fields)) {
      const item = raw?.[section]?.[field];
      const evidence = evidenceFor(item?.evidence);
      if (typeof item?.value === 'string' && item.value.trim() && evidence.length) {
        sections[section][field] = { label, value: item.value.trim(), evidence, requiresProfessionalReview: true };
      }
    }
  }
  if (Array.isArray(raw?.goals)) for (const goal of raw.goals) {
    const evidence = evidenceFor(goal.evidence);
    if (goal.agreedExplicitly !== true || !evidence.some(e => e.role === 'patient') || !evidence.some(e => e.role === 'professional') || typeof goal.title !== 'string' || !goal.title.trim()) continue;
    sections.goals.push(Object.assign(Object.fromEntries(Object.keys(PSYCHOLOGY_FIELDS.goals).map(k => [k, typeof goal[k] === 'string' ? goal[k] : null])), { evidence, requiresProfessionalReview: true }));
  }
  return sections;
}

// No clinical inference when the language model is unavailable.
export function extractPsychologySectionsLocalFallback(_segments: DiarizedSegment[], _speakers: Record<string, string>): any {
  return emptyPsychologySections();
}
