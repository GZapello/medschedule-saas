import React from 'react';
import { Stethoscope } from 'lucide-react';
import { ALL_CLINICAL_MODULES, ClinicalModuleOption } from './SelectConsultationModuleModal';

export type ProfessionalModuleId =
  | 'ZemdaPersonal'
  | 'ZemdaPsico'
  | 'ZemdaFono'
  | 'ZemdaFisio'
  | 'ZemdaOdonto'
  | 'ZemdaNutri'
  | 'ZemdaTO'
  | 'ZemdaMed'
  | 'ZemdaPP'
  | 'ZemdaEstetic';

export interface ResolvedClinicalModule {
  id: string;
  name: string;
  tooltip: string;
  icon: React.ComponentType<{ className?: string }>;
  isSpecialized: boolean;
  badge?: string;
  profession?: string;
}

export interface ClinicalModuleContext {
  moduleType?: string | null;
  clinicalModule?: string | null;
  serviceName?: string | null;
  currentUser?: {
    commercialModule?: string;
    professionId?: string;
    professionName?: string;
    professionSlug?: string;
    canonicalProfessionName?: string;
  } | null;
  auth?: {
    isDoctor?: boolean;
    isZemdaMed?: boolean;
    isPersonalTrainer?: boolean;
    isZemdaPersonal?: boolean;
    isEsthetician?: boolean;
    isZemdaEstetic?: boolean;
    isSpeechTherapist?: boolean;
    isZemdaFono?: boolean;
    isPsychologist?: boolean;
    isZemdaPsico?: boolean;
    isPsychopedagogue?: boolean;
    isZemdaPP?: boolean;
    isPhysiotherapist?: boolean;
    isZemdaFisio?: boolean;
    isOccupationalTherapist?: boolean;
    isZemdaTO?: boolean;
    isNutritionist?: boolean;
    isZemdaNutri?: boolean;
    isDentist?: boolean;
    isZemdaOdonto?: boolean;
    currentUser?: any;
  } | null;
}

/**
 * Resolve o identificador do módulo clínico profissional de forma centralizada e determinística.
 */
export function resolveClinicalModuleId(ctx: ClinicalModuleContext): string {
  // 1. Módulo explícito informado via prop ou registro do agendamento (prioridade se especializado)
  const explicit = ctx.moduleType || ctx.clinicalModule;
  if (
    explicit &&
    explicit !== 'general' &&
    explicit !== 'ZemdaBody' &&
    explicit !== 'Zemda360' &&
    ALL_CLINICAL_MODULES[explicit]
  ) {
    return explicit;
  }

  // 2. Módulo comercial ou workspace clínico explícito do usuário logado
  const userComm =
    ctx.currentUser?.commercialModule ||
    ctx.auth?.currentUser?.commercialModule ||
    (ctx.currentUser as any)?.clinicalWorkspace ||
    ctx.auth?.currentUser?.clinicalWorkspace;
  if (userComm && userComm !== 'general' && ALL_CLINICAL_MODULES[userComm]) {
    return userComm;
  }

  // 3. Flags de perfil do AuthContext
  const a = ctx.auth || {};
  if (a.isPersonalTrainer || a.isZemdaPersonal) return 'ZemdaPersonal';
  if (a.isPsychologist || a.isZemdaPsico) return 'ZemdaPsico';
  if (a.isSpeechTherapist || a.isZemdaFono) return 'ZemdaFono';
  if (a.isPhysiotherapist || a.isZemdaFisio) return 'ZemdaFisio';
  if (a.isDentist || a.isZemdaOdonto) return 'ZemdaOdonto';
  if (a.isNutritionist || a.isZemdaNutri) return 'ZemdaNutri';
  if (a.isOccupationalTherapist || a.isZemdaTO) return 'ZemdaTO';
  if (a.isDoctor || a.isZemdaMed) return 'ZemdaMed';
  if (a.isPsychopedagogue || a.isZemdaPP) return 'ZemdaPP';
  if (a.isEsthetician || a.isZemdaEstetic) return 'ZemdaEstetic';

  // 4. Detecção por texto na profissão do usuário ou nome do serviço agendado
  const text = [
    ctx.currentUser?.professionName,
    ctx.currentUser?.professionSlug,
    ctx.currentUser?.canonicalProfessionName,
    ctx.currentUser?.professionId,
    ctx.auth?.currentUser?.professionName,
    ctx.auth?.currentUser?.professionSlug,
    ctx.auth?.currentUser?.canonicalProfessionName,
    ctx.auth?.currentUser?.professionId,
    ctx.serviceName
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (
    text.includes('personal') ||
    text.includes('educa') ||
    text.includes('cref') ||
    text.includes('treino') ||
    text.includes('muscula')
  ) {
    return 'ZemdaPersonal';
  }
  if (text.includes('psicopedag') || text.includes('abpp')) {
    return 'ZemdaPP';
  }
  if (text.includes('psicolog') || text.includes('psicólog') || text.includes('crp')) {
    return 'ZemdaPsico';
  }
  if (text.includes('fono') || text.includes('crfa')) {
    return 'ZemdaFono';
  }
  if (text.includes('odonto') || text.includes('dentis') || text.includes('cro')) {
    return 'ZemdaOdonto';
  }
  if (text.includes('ocupacional') || text.includes('avd')) {
    return 'ZemdaTO';
  }
  if (text.includes('nutri') || text.includes('crn')) {
    return 'ZemdaNutri';
  }
  if (text.includes('estet') || text.includes('estét')) {
    return 'ZemdaEstetic';
  }
  if (text.includes('médic') || text.includes('medic') || text.includes('crm')) {
    return 'ZemdaMed';
  }
  if (text.includes('fisio') || text.includes('crefito') || text.includes('fisioterap')) {
    return 'ZemdaFisio';
  }

  return 'general';
}

/**
 * Retorna os metadados visuais completos (nome real, ícone, tooltip e badge) do módulo.
 */
export function resolveClinicalModuleInfo(ctx: ClinicalModuleContext): ResolvedClinicalModule {
  const id = resolveClinicalModuleId(ctx);
  const mod = ALL_CLINICAL_MODULES[id];
  const isSpecialized = Boolean(mod && id !== 'general' && id !== 'Zemda360' && id !== 'ZemdaBody');

  if (isSpecialized && mod) {
    return {
      id,
      name: mod.name,
      tooltip: `Abrir módulo completo ${mod.name}`,
      icon: mod.icon,
      isSpecialized: true,
      badge: mod.badge,
      profession: mod.profession
    };
  }

  return {
    id: 'general',
    name: 'Atendimento Clínico',
    tooltip: 'Abrir Atendimento Clínico',
    icon: Stethoscope,
    isSpecialized: false,
    badge: 'Clínico',
    profession: 'Atendimento Clínico'
  };
}
