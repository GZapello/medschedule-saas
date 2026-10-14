import { Specialty } from './appointment';

export interface SpecialtyConfig {
  id: Specialty;
  label: string;
  professionalRole: string;
  badgeColor: string;
  badgeBg: string;
  accentColor: string;
  councilName: string;
  defaultDurationMinutes: number;
  defaultBufferMinutes: number;
  description: string;
}

export const SPECIALTY_CONFIGS: Record<Specialty, SpecialtyConfig> = {
  medical: {
    id: 'medical',
    label: 'Medicina Geral / Especialistas',
    professionalRole: 'Médico(a)',
    badgeColor: '#1d4ed8',
    badgeBg: '#dbeafe',
    accentColor: '#2563eb',
    councilName: 'CRM',
    defaultDurationMinutes: 30,
    defaultBufferMinutes: 0,
    description: 'Consultas eletivas, retornos rápidos, receitas de controle especial e exames complementares.'
  },
  psychology: {
    id: 'psychology',
    label: 'Psicologia Clínica',
    professionalRole: 'Psicólogo(a)',
    badgeColor: '#7e22ce',
    badgeBg: '#f3e8ff',
    accentColor: '#9333ea',
    councilName: 'CRP',
    defaultDurationMinutes: 50,
    defaultBufferMinutes: 10, // Intervalo obrigatório de descompressão entre pacientes
    description: 'Sessões de psicoterapia estruturadas de 50 minutos com intervalo reservado para síntese de prontuário.'
  },
  speech_therapy: {
    id: 'speech_therapy',
    label: 'Fonoaudiologia',
    professionalRole: 'Fonoaudiólogo(a)',
    badgeColor: '#0f766e',
    badgeBg: '#ccfbf1',
    accentColor: '#0d9488',
    councilName: 'CRFa',
    defaultDurationMinutes: 40,
    defaultBufferMinutes: 5,
    description: 'Terapia vocal, reabilitação auditiva, motricidade orofacial e estimulação de linguagem.'
  }
};
