import { ApiClient } from '../api/client';
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
// ZEMDAPsico — Provedor de Transcrição, Diarização & Estruturação Clínica
// ============================================================================

export interface DiarizedSegment {
  id: string;
  speakerId: string; // Ex: 'speaker_1', 'speaker_2', 'speaker_3'
  role?: 'professional' | 'patient' | 'family' | 'other';
  text: string;
  startTime?: number; // Segundos
  endTime?: number;
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

export interface StructuredExtractionResult {
  success: boolean;
  provider?: string;
  summary?: string;
  disclaimer?: string;
  sections: {
    session?: Record<string, StructuredFieldSuggestion | null>;
    anamnesis?: Record<string, StructuredFieldSuggestion | null>;
    mentalState?: Record<string, StructuredFieldSuggestion | null>;
    riskAssessment?: Record<string, StructuredFieldSuggestion | null>;
    screenings?: Record<string, StructuredFieldSuggestion | null>;
    assessment?: Record<string, StructuredFieldSuggestion | null>;
    goals?: Array<{
      title: string;
      indicator?: string;
      targetPeriod?: string;
      strategy?: string;
      notes?: string;
      evidence?: DiarizationEvidence[];
    }>;
  };
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

export function formatTimestamp(seconds?: number): string {
  if (typeof seconds !== 'number' || isNaN(seconds) || seconds < 0) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export function parseRawTranscriptToSegments(rawText: string): DiarizedSegment[] {
  if (!rawText || typeof rawText !== 'string') return [];

  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
  const segments: DiarizedSegment[] = [];

  let currentSpeakerId = 'speaker_1';
  let segmentIndex = 1;

  for (const line of lines) {
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
 * Chamada à API para estruturação do atendimento a partir de transcrição diarizada
 */
export async function requestPsychologyTranscriptStructure(params: {
  patientId?: string;
  appointmentId?: string;
  transcript: DiarizedSegment[];
  speakers: Record<string, string>;
  signal?: AbortSignal;
}): Promise<StructuredExtractionResult> {
  const { signal, ...body } = params;
  return ApiClient.post<StructuredExtractionResult>('/v1/ai/psychology/transcript-structure', body, { signal });
}
export async function fetchDiarizationStatus(): Promise<any> {
  return ApiClient.get('/v1/ai/psychology/diarization-status');
}
