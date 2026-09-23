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
  needsLegalAcceptance?: boolean;
  termsVersionAccepted?: string | null;
  privacyVersionAccepted?: string | null;
  termsAcceptedAt?: string | null;
  privacyAcceptedAt?: string | null;
  professionalId?: string;
  professionId?: string;
  canonicalProfessionId?: string;
  canonicalProfessionName?: string;
  professionName?: string;
  professionSlug?: string;
  registrationType?: string;
  registrationNumber?: string;
  specialtyName?: string;
  professionalSlug?: string;
  practiceAreas?: string;
  zemdaFisioEnabled?: boolean;
  zemdaOdontoEnabled?: boolean;
  zemdaNutriEnabled?: boolean;
  zemdaToEnabled?: boolean;
  zemdaFonoEnabled?: boolean;
  zemdaPPEnabled?: boolean;
  zemdaPsicoEnabled?: boolean;
  zemdaPersonalEnabled?: boolean;
  zemdaMedEnabled?: boolean;
  zemdaBodyEnabled?: boolean;
  commercialModule?: string;
  capabilities?: string[];
  practiceAreaIds?: string[];
  selectedOptionalCapabilities?: string[];
  permissions?: string[];
}

export * from './capabilities';

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
  business_hours_json?: string;
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
  slug?: string;
  public_booking_enabled?: number;
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
  gender?: 'M' | 'F';
  remuneration_type?: 'commission' | 'salary' | 'both';
  commission_percentage?: number;
  fixed_salary?: number;
  payment_day?: number;
  active: number;
  profession_change_used?: number | boolean;
  profession_changed_at?: string | null;
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
  gender?: 'M' | 'F';
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
  gender?: string;
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
  registration_type?: string;
  session_date: string;
  session_time?: string;
  procedure_name?: string;
  title: string;
  clinical_evolution?: string;
  technical_notes?: string;
  private_notes?: string;
  conducts?: string;
  clinical_data_json?: string;
  module_type?: string;
  module_data_json?: string;
  is_sealed: number;
  signature_hash?: string;
  signed_at?: string;
  signed_by_user_id?: string;
  signer_name?: string;
  signer_registration?: string;
  sealed_at?: string;
  amendments_json?: string;
  created_by?: string;
  updated_by?: string;
  edit_history_json?: string;
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
  payment_method: 'pix' | 'credit_card' | 'debit_card' | 'cash' | 'bank_transfer' | 'insurance' | 'other';
  status: 'paid' | 'pending' | 'partial' | 'cancelled' | 'refunded' | 'exempt';
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

// 1. Central de Chamados & Suporte
export interface SupportTicket {
  id: string;
  tenant_id?: string;
  user_id: string;
  title: string;
  category: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  attachments_json?: string;
  app_version?: string;
  platform?: string;
  status: 'open' | 'analyzing' | 'in_progress' | 'resolved' | 'closed';
  created_at: string;
  updated_at: string;
  user_name?: string;
  user_email?: string;
  user_role?: string;
  clinic_name?: string;
}

export interface SupportTicketMessage {
  id: string;
  ticket_id: string;
  user_id: string;
  message: string;
  attachments_json?: string;
  is_internal?: number;
  created_at: string;
  sender_name?: string;
  sender_role?: string;
}

// 2. Exames a Receber
export interface PendingExam {
  id: string;
  tenant_id: string;
  patient_id: string;
  professional_id?: string;
  exam_name: string;
  request_date: string;
  expected_date?: string;
  received_date?: string;
  status: 'waiting' | 'received' | 'delayed' | 'cancelled';
  notes?: string;
  cid_code?: string;
  patient_name?: string;
  patient_phone?: string;
  professional_name?: string;
  is_delayed?: boolean;
  created_at: string;
  updated_at?: string;
}

// 3. Estoque de Insumos & Produtos
export interface InventoryItem {
  id: string;
  tenant_id: string;
  name: string;
  category?: string;
  product_type?: string;
  brand?: string;
  presentation?: string;
  volume_ml?: number;
  quantity: number;
  unit: string;
  batch_number?: string;
  expiration_date?: string;
  unit_cost: number;
  supplier?: string;
  min_stock: number;
  notes?: string;
  active: number;
  is_low_stock?: boolean;
  is_zero_stock?: boolean;
  is_expiring_soon?: boolean;
  is_expired?: boolean;
  created_at: string;
  updated_at: string;
}

export interface InventoryMovement {
  id: string;
  tenant_id: string;
  item_id: string;
  item_name?: string;
  unit?: string;
  movement_type: 'in' | 'out' | 'adjustment';
  quantity: number;
  previous_quantity: number;
  new_quantity: number;
  reason?: string;
  document_reference?: string;
  user_id?: string;
  user_name?: string;
  created_at: string;
}

// 4. Orçamentos
export interface Budget {
  id: string;
  tenant_id: string;
  budget_type: 'patient' | 'supplier';
  budget_number: string;
  patient_id?: string;
  patient_name?: string;
  patient_phone?: string;
  patient_cpf?: string;
  supplier_name?: string;
  supplier_contact?: string;
  discount: number;
  total_amount: number;
  validity_date?: string;
  delivery_deadline?: string;
  status: 'draft' | 'sent' | 'approved' | 'rejected' | 'expired';
  notes?: string;
  converted_to_inventory?: number;
  created_at: string;
  updated_at: string;
}

export interface BudgetItem {
  id: string;
  budget_id: string;
  item_type: 'service' | 'product' | 'custom';
  reference_id?: string;
  description: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

// 5. Folha de Pagamentos e Comissões
export interface ProfessionalPayroll {
  id: string;
  tenant_id: string;
  professional_id: string;
  professional_name?: string;
  professional_photo?: string;
  specialty_name?: string;
  period_month: string;
  remuneration_type: 'commission' | 'salary' | 'both';
  appointments_count: number;
  produced_amount: number;
  commission_percentage: number;
  commission_amount: number;
  fixed_salary: number;
  adjustments: number;
  adjustment_notes?: string;
  total_payable: number;
  due_date?: string;
  paid_date?: string;
  status: 'pending' | 'paid' | 'delayed';
  notes?: string;
  created_at: string;
  updated_at: string;
}

// 6. ZemdaFisio: Prontuário & Avaliação Fisioterapêutica
export interface PhysiotherapyAssessment {
  id: string;
  tenant_id: string;
  patient_id: string;
  professional_id: string;
  appointment_id?: string;
  specialty_id?: string;
  chief_complaint: string;
  hpi?: string;
  past_medical_history?: string;
  medical_diagnosis?: string;
  physio_diagnosis?: string;
  pain_score: number;
  pain_location?: string;
  pain_characteristics?: string;
  inspection_palpation?: string;
  range_of_motion?: string;
  muscle_strength?: string;
  posture_balance?: string;
  gait_mobility?: string;
  functional_limitations?: string;
  specific_tests?: string;
  short_term_goals?: string;
  long_term_goals?: string;
  treatment_plan?: string;
  conducts_exercises?: string;
  guidelines?: string;
  body_map_json?: string;
  body_map_image?: string;
  is_sealed: number;
  created_by?: string;
  updated_by?: string;
  created_at: string;
  updated_at?: string;
  professional_name?: string;
  registration_type?: string;
  registration_number?: string;
  specialty_name?: string;
}

// 7. ZemdaFisio: Evolução de Sessão
export interface PhysiotherapyEvolution {
  id: string;
  tenant_id: string;
  patient_id: string;
  professional_id: string;
  appointment_id?: string;
  specialty_id?: string;
  session_date: string;
  session_time?: string;
  patient_condition?: string;
  procedures_performed?: string;
  exercises_performed?: string;
  techniques_used?: string;
  clinical_evolution: string;
  treatment_response?: string;
  complications?: string;
  guidelines?: string;
  next_session_plan?: string;
  notes?: string;
  is_sealed: number;
  created_by?: string;
  updated_by?: string;
  created_at: string;
  updated_at?: string;
  professional_name?: string;
  registration_type?: string;
  registration_number?: string;
  specialty_name?: string;
}

// 8. Central de Certificados Digitais ICP-Brasil e Assinaturas
export interface DigitalCertificate {
  id: string;
  tenant_id: string;
  holder_type: 'professional' | 'patient';
  holder_id: string;
  certificate_type: 'A1' | 'A3' | 'remote';
  serial_number: string;
  subject_name: string;
  subject_cpf_masked?: string;
  issuer: string;
  valid_from: string;
  valid_to: string;
  fingerprint_sha256: string;
  provider: string;
  status: 'valid' | 'expired' | 'revoked' | 'pending';
  created_at: string;
  updated_at: string;
}

export interface DigitalSignature {
  id: string;
  tenant_id: string;
  document_type: string;
  document_id: string;
  signer_type: 'professional' | 'patient';
  signer_id: string;
  certificate_id?: string;
  signature_type: 'pades' | 'cades' | 'electronic';
  signature_hash: string;
  signed_at: string;
  pades_visual_stamp_json?: string;
  verification_url?: string;
  verification_token?: string;
  is_valid: number;
  created_at: string;
}

// 9. ZemdaPP (Psicopedagogia Clínica & Institucional)
export interface PsychopedagogyProfile {
  id: string;
  tenant_id: string;
  patient_id: string;
  school_name?: string;
  grade_level?: string;
  shift?: string;
  teacher_name?: string;
  coordinator_name?: string;
  main_complaint?: string;
  family_dynamics?: string;
  development_history?: string;
  strengths?: string;
  difficulties?: string;
  created_at: string;
  updated_at: string;
}

export interface PsychopedagogyAssessment {
  id: string;
  tenant_id: string;
  patient_id: string;
  professional_id: string;
  assessment_type: 'clinical' | 'institutional';
  status: 'in_progress' | 'completed' | 'archived';
  pedagogical_hypothesis?: string;
  conclusions?: string;
  recommendations?: string;
  is_sealed: number;
  created_at: string;
  updated_at: string;
}

export interface PsychopedagogySession {
  id: string;
  tenant_id: string;
  patient_id: string;
  professional_id: string;
  appointment_id?: string;
  session_number?: number;
  session_date: string;
  objectives?: string;
  activities_developed?: string;
  learner_reactions?: string;
  interventions_performed?: string;
  results_observations?: string;
  next_steps?: string;
  is_sealed: number;
  signature_hash?: string;
  signed_at?: string;
  signer_name?: string;
  signer_registration?: string;
  sealed_at?: string;
  created_at: string;
  updated_at: string;
}
