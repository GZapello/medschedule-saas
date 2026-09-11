export type Specialty = 'medical' | 'psychology' | 'speech_therapy';

export type AppointmentStatus =
  | 'scheduled'
  | 'confirmed'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'no_show';

export type SyncStatus = 'synced' | 'pending' | 'error';

export interface MedicalMetadata {
  consultationType: 'first_visit' | 'follow_up' | 'emergency';
  icd10Code?: string;
  prescriptionRequired?: boolean;
}

export interface PsychologyMetadata {
  sessionType: 'individual' | 'couples' | 'child' | 'family';
  recurrencePattern: 'none' | 'weekly' | 'biweekly';
  decompressionBufferMinutes: number;
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
  startTime: string; // ISO string: '2026-09-09T14:00:00.000Z'
  endTime: string;   // ISO string: '2026-09-09T14:40:00.000Z'
  status: AppointmentStatus;
  notes?: string;
  clinicalMetadata?: ClinicalMetadata;
  createdAt: string;
  updatedAt: string;
  isDeleted: boolean;
  version: number;
  syncStatus?: SyncStatus; // Estado de sincronização com a nuvem no cliente
}

export interface Professional {
  id: string;
  name: string;
  specialty: Specialty;
  registrationNumber: string;
  defaultDurationMinutes: number;
  bufferMinutes: number;
  workingHoursStart: string;
  workingHoursEnd: string;
}

export interface SyncQueueItem {
  id?: number;
  appointmentId: string;
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  payload: Partial<Appointment>;
  clientTimestamp: string;
  attempts: number;
  lastError?: string;
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


