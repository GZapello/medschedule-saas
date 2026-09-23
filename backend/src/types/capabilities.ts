export type CapabilityRule = 'DEFAULT' | 'OPTIONAL' | 'HIDDEN';

export type PracticeAreaType = 'SPECIALTY' | 'AREA' | 'APPROACH' | 'METHOD';

export interface CapabilityItem {
  id: string;
  category:
    | 'CORE'
    | 'BODY'
    | 'ANTHROPOMETRY'
    | 'BODY_COMPOSITION'
    | 'FUNCTIONAL'
    | 'MOBILITY'
    | 'ADL'
    | 'SENSORY'
    | 'COMMUNICATION'
    | 'LEARNING'
    | 'BEHAVIOR'
    | 'FONO_SPECIFIC'
    | 'NUTRITION'
    | 'PHYSICAL'
    | 'TRAINING'
    | 'ODONTO'
    | 'MEDICAL';
  name: string;
  description: string;
  commercialPlanRequired?: 'SOLO' | 'TEAM' | 'CLINIC';
}

export interface PracticeAreaDefinition {
  id: string;
  professionId: string;
  name: string;
  slug: string;
  type: PracticeAreaType;
  description?: string;
  defaultCapabilities?: string[];
  optionalCapabilities?: string[];
  hiddenCapabilities?: string[];
}

export interface ProfessionCapabilitiesConfig {
  professionId: string;
  commercialModuleName: string;
  defaultCapabilities: string[];
  optionalCapabilities: string[];
  hiddenCapabilities: string[];
}

export interface ComputedUserCapabilities {
  professionId: string;
  commercialModule: string;
  practiceAreaIds: string[];
  activeCapabilities: string[];
  defaultCapabilities: string[];
  availableOptionalCapabilities: string[];
  selectedOptionalCapabilities: string[];
  hiddenCapabilities: string[];
  planRestrictedCapabilities: { capabilityId: string; requiredPlan: string }[];
}
