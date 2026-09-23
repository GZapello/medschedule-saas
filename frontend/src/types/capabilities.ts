export type CapabilityCategory =
  | 'clinical_core'
  | 'assessment'
  | 'planning'
  | 'body_evolution'
  | 'records_documents'
  | 'communication'
  | 'business'
  | 'specialty';

export type CapabilityRule = 'DEFAULT' | 'OPTIONAL' | 'HIDDEN';

export interface Capability {
  id: string;
  category: CapabilityCategory;
  name: string;
  description: string;
  active?: boolean;
}

export interface PracticeArea {
  id: string;
  profession_id: string;
  name: string;
  slug: string;
  type: 'practice_area' | 'approach';
  description?: string;
  active?: boolean;
  isInferredForAlias?: boolean;
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
  planRestrictedCapabilities?: { capabilityId: string; requiredPlan: string }[];
}

export type MedicalSpecialtyPresetKey =
  | 'clinica-medica'
  | 'neurologia'
  | 'psiquiatria'
  | 'pediatria'
  | 'geriatria'
  | 'endocrinologia'
  | 'ortopedia'
  | 'cardiologia'
  | 'dermatologia'
  | 'reumatologia';

export interface MedicalSpecialtyPreset {
  id: MedicalSpecialtyPresetKey;
  name: string;
  description: string;
  iconName: string;
  focusAreas: string[];
}

export interface MedicalVitalSigns {
  bloodPressureSystolic?: number;
  bloodPressureDiastolic?: number;
  heartRate?: number;
  respiratoryRate?: number;
  oxygenSaturation?: number;
  temperature?: number;
  weight?: number;
  height?: number;
  bmi?: number;
  measuredAt?: string;
}

export interface MedicalPhysicalExam {
  generalStatus?: string;
  headAndNeck?: string;
  cardiovascular?: string;
  respiratory?: string;
  abdomen?: string;
  extremities?: string;
  skin?: string;
  additionalNotes?: string;
}

export interface MedicalNeurologicalExam {
  mentalStatus?: string;
  cranialNerves?: string;
  motorSystem?: string;
  reflexes?: string;
  sensorySystem?: string;
  coordinationAndGait?: string;
  meningealSigns?: string;
  painMapMarkers?: { x: number; y: number; label: string; intensity: number }[];
}

export interface MedicalSoapNotes {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
}

export interface MedicalConsultation {
  id: string;
  tenant_id: string;
  patient_id: string;
  appointment_id?: string | null;
  professional_id: string;
  professional_name?: string;
  registration_type?: string;
  registration_number?: string;
  specialty_preset: MedicalSpecialtyPresetKey;
  chief_complaint?: string;
  hpi?: string;
  past_medical_history?: string;
  family_history?: string;
  habits_lifestyle?: string;
  vitalSigns?: MedicalVitalSigns;
  physicalExam?: MedicalPhysicalExam;
  neurologicalExam?: MedicalNeurologicalExam;
  diagnosticHypotheses?: string[];
  cid_code?: string;
  cid_description?: string;
  clinical_conduct?: string;
  soapNotes?: MedicalSoapNotes;
  return_in_days?: number;
  created_at: string;
  updated_at: string;
}

export interface SandboxSession {
  sessionId: string;
  sandboxTenantId: string;
  sandboxUserId: string;
  professionId: string;
  practiceAreaIds: string[];
  planCode: string;
  token: string;
  capabilities: ComputedUserCapabilities;
}
