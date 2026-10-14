export type Specialty = 'medical' | 'psychology' | 'speech_therapy';

export type AppointmentStatus =
  | 'scheduled'
  | 'confirmed'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'no_show';

export interface MedicalMetadata {
  consultationType: 'first_visit' | 'follow_up' | 'emergency';
  icd10Code?: string;
  prescriptionRequired?: boolean;
}

export interface PsychologyMetadata {
  sessionType: 'individual' | 'couples' | 'child' | 'family';
  recurrencePattern: 'none' | 'weekly' | 'biweekly';
  decompressionBufferMinutes: number; // Intervalo para fechamento de prontuário e descanso mental
  confidentialNotes?: string;
}

export interface SpeechTherapyMetadata {
  therapyFocus: 'speech' | 'language' | 'orofacial_myology' | 'voice' | 'hearing' | 'dysphagia';
  sessionNumber: number;
  totalPlannedSessions?: number;
  caregiverPresent?: boolean;
  evolutionNotes?: string;
}

export type ClinicalMetadata = MedicalMetadata | PsychologyMetadata | SpeechTherapyMetadata;

export interface Appointment {
  id: string;
  patientName: string;
  patientPhone: string;
  patientEmail?: string;
  professionalId: string;
  specialty: Specialty;
  startTime: string; // ISO 8601
  endTime: string;   // ISO 8601
  status: AppointmentStatus;
  notes?: string;
  clinicalMetadata?: ClinicalMetadata;
  createdAt: string;
  updatedAt: string;
  isDeleted: boolean; // Suporte a soft delete para sincronização consistente
  version: number;    // Contador de versões para detecção de conflitos otimista
}

export interface Professional {
  id: string;
  name: string;
  specialty: Specialty;
  registrationNumber: string; // CRM, CRP ou CRFa
  defaultDurationMinutes: number;
  bufferMinutes: number;
  workingHoursStart: string; // "08:00"
  workingHoursEnd: string;   // "18:00"
}

export interface SyncMutation {
  mutationId: string;
  entityId: string;
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  payload: Partial<Appointment>;
  clientTimestamp: string;
}

export interface SyncRequest {
  clientLastSyncTimestamp: string;
  mutations: SyncMutation[];
}

export interface SyncResponse {
  serverTimestamp: string;
  appliedMutationIds: string[];
  conflictErrors: Array<{
    mutationId: string;
    entityId: string;
    reason: string;
  }>;
  serverDeltas: Appointment[];
}

export type UserRole = 'admin' | 'professional' | 'client';

export type UserStatus = 'active' | 'inactive';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  professionCategory?: string;
  professionId?: string;
  professionLabel?: string;
  phone?: string;
  status?: UserStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}

export interface RegisterDTO {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  professionCategory?: string;
  professionId?: string;
  phone?: string;
  status?: UserStatus;
}

export interface LoginDTO {
  email: string;
  password: string;
}

export interface UpdateUserDTO {
  name?: string;
  email?: string;
  role?: UserRole;
  professionCategory?: string;
  professionId?: string;
  phone?: string;
  status?: UserStatus;
  password?: string;
}


