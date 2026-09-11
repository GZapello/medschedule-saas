export type Role = 'superadmin' | 'clinic_admin' | 'professional' | 'receptionist' | 'patient';

export type Terminology = 'patient' | 'client' | 'student' | 'pet_owner';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  phone?: string;
  avatarUrl?: string;
  tenantId?: string | null;
  status?: string;
  needsOnboarding?: boolean;
}

export interface Tenant {
  id: string;
  slug: string;
  name: string;
  corporate_name?: string;
  trade_name?: string;
  cnpj_cpf?: string;
  email: string;
  phone?: string;
  mobile?: string;
  whatsapp?: string;
  address?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  logo_url?: string;
  primary_color?: string;
  client_term_label?: string;
  status: 'active' | 'suspended' | 'trial' | 'pending' | 'blocked' | 'rejected';
  plan_name?: string;
  plan_slug?: string;
  onboarding_completed?: number;
  onboarding_step?: number;
  manager_confirmed?: number;
  settings?: Record<string, string>;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  icon?: string;
  description?: string;
  default_terminology: Terminology;
  is_clinical: number;
  active: number;
}

export interface Profession {
  id: string;
  category_id: string;
  category_name?: string;
  name: string;
  slug: string;
  registration_board_label?: string;
  registration_required: number;
  custom_fields_schema?: any;
  active: number;
}

export interface Specialty {
  id: string;
  profession_id?: string;
  profession_name?: string;
  name: string;
  slug: string;
  description?: string;
  color?: string;
  active: number;
}

export interface Professional {
  id: string;
  tenant_id: string;
  user_id?: string;
  name: string;
  photo_url?: string;
  profession_id?: string;
  profession_name?: string;
  specialty_id?: string;
  specialty_name?: string;
  specialty_color?: string;
  registration_type?: string;
  registration_number?: string;
  bio?: string;
  practice_areas?: string;
  buffer_minutes: number;
  active: number;
  email?: string;
  phone?: string;
}

export interface StaffMember {
  id: string;
  tenant_id: string;
  name: string;
  email: string;
  role: Role;
  phone?: string;
  avatar_url?: string;
  status: 'active' | 'blocked' | 'pending' | 'rejected';
  created_at: string;
  is_manager?: number;
  permissions?: string[];
  permissions_json?: string;
  approved_at?: string;
  approved_by?: string;
  profession_name?: string;
  practice_areas?: string;
  professional_id?: string;
  registration_type?: string;
  registration_number?: string;
  specialty_name?: string;
}

export interface Service {
  id: string;
  tenant_id: string;
  specialty_id?: string;
  specialty_name?: string;
  name: string;
  description?: string;
  duration_minutes: number;
  buffer_minutes: number;
  price: number;
  modality: 'presential' | 'online' | 'home' | 'both';
  active: number;
  min_lead_time_hours?: number;
  max_advance_days?: number;
  cancellation_policy?: string;
}

export interface Room {
  id: string;
  tenant_id: string;
  name: string;
  description?: string;
  active: number;
}

export interface Guardian {
  id: string;
  patient_id: string;
  full_name: string;
  relationship: 'mother' | 'father' | 'legal_guardian' | 'tutor' | 'other';
  cpf?: string;
  phone: string;
  email?: string;
  is_primary: number;
}

export interface Patient {
  id: string;
  tenant_id: string;
  full_name: string;
  social_name?: string;
  birth_date?: string;
  cpf?: string;
  email?: string;
  phone: string;
  whatsapp?: string;
  address?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  emergency_contact?: string;
  emergency_phone?: string;
  notes_admin?: string;
  is_child: number;
  active: number;
  created_at?: string;
  total_appointments?: number;
  total_records?: number;
  guardians?: Guardian[];
}

export type AppointmentStatus =
  | 'scheduled'
  | 'confirmed'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'no_show'
  | 'rescheduled';

export interface Appointment {
  id: string;
  tenant_id: string;
  appointment_number: string;
  patient_id: string;
  patient_name: string;
  patient_phone: string;
  patient_email?: string;
  patient_is_child?: number;
  professional_id: string;
  professional_name: string;
  professional_photo?: string;
  service_id: string;
  service_name: string;
  service_price?: number;
  duration_minutes?: number;
  room_id?: string;
  room_name?: string;
  start_time: string;
  end_time: string;
  status: AppointmentStatus;
  modality: 'presential' | 'online' | 'home';
  patient_notes?: string;
  internal_notes?: string;
  cancellation_reason?: string;
  payment_status?: 'paid' | 'pending' | 'partial' | 'cancelled';
  payment_amount?: number;
  payment_method?: string;
}

export interface ClinicalRecord {
  id: string;
  tenant_id: string;
  patient_id: string;
  appointment_id?: string;
  professional_id: string;
  professional_name?: string;
  registration_number?: string;
  session_date: string;
  title: string;
  clinical_evolution?: string;
  technical_notes?: string;
  private_notes?: string;
  is_sealed: number;
  created_at: string;
  updated_at?: string;
  total_attachments?: number;
}

export interface Payment {
  id: string;
  tenant_id: string;
  appointment_id?: string;
  appointment_number?: string;
  patient_id: string;
  patient_name: string;
  patient_phone?: string;
  professional_name?: string;
  service_name?: string;
  amount: number;
  payment_method: 'pix' | 'credit_card' | 'debit_card' | 'cash' | 'bank_transfer' | 'insurance';
  status: 'paid' | 'pending' | 'partial' | 'cancelled' | 'refunded';
  transaction_id?: string;
  payment_date?: string;
  notes?: string;
  created_at: string;
}

export interface AvailableSlot {
  time: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  bufferMinutes: number;
}
