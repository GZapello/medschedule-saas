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
        startTime: startTime !== undefined ? startTime : (segmentIndex - 1) * 6,
        endTime: startTime !== undefined ? startTime + 6 : segmentIndex * 6
      });
    }
  }

  // Se nenhuma linha continha marcadores explícitos, segmenta por sentenças alternadas
  if (segments.length === 0 && rawText.trim()) {
    const sentences = rawText.split(/[.!?\n]+/).map(s => s.trim()).filter(s => s.length > 3);
    sentences.forEach((s, idx) => {
      segments.push({
        id: `seg_${Date.now()}_${idx + 1}`,
        speakerId: idx % 2 === 0 ? 'speaker_1' : 'speaker_2',
        text: s,
        startTime: idx * 6,
        endTime: (idx + 1) * 6
      });
    });
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
}): Promise<StructuredExtractionResult> {
  const token = localStorage.getItem('token') || '';
  const tenantId = localStorage.getItem('tenantId') || localStorage.getItem('activeTenantId') || '';

  const response = await fetch('/v1/ai/psychology/transcript-structure', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'x-tenant-id': tenantId
    },
    body: JSON.stringify(params)
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Erro HTTP ${response.status} ao estruturar atendimento`);
  }

  return await response.json();
}

/**
 * Busca status dos provedores de diarização
 */
export async function fetchDiarizationStatus(): Promise<any> {
  const token = localStorage.getItem('token') || '';
  const tenantId = localStorage.getItem('tenantId') || localStorage.getItem('activeTenantId') || '';

  const response = await fetch('/v1/ai/psychology/diarization-status', {
    headers: {
      'Authorization': `Bearer ${token}`,
      'x-tenant-id': tenantId
    }
  });

  if (!response.ok) {
    return null;
  }

  return await response.json();
}
