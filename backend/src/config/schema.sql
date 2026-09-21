-- SaaS Universal de Agendamento e Gestão Profissional
-- DDL Schema Completo (SQLite WAL Mode com chaves estrangeiras e índices)

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- 1. Categorias Macro (Saúde Mental, Medicina, Terapias, Educação, Estética, etc.)
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  tenant_id TEXT, -- NULL para categorias globais do sistema
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  icon TEXT DEFAULT 'Layers',
  description TEXT,
  default_terminology TEXT NOT NULL DEFAULT 'client' CHECK(default_terminology IN ('patient', 'client', 'student', 'pet_owner')),
  is_clinical INTEGER NOT NULL DEFAULT 0, -- 1 se saúde/sigilo médico, 0 se serviços em geral
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_slug ON categories (tenant_id, slug);

-- 2. Profissões
CREATE TABLE IF NOT EXISTS professions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT, -- NULL para profissões padrão globais
  category_id TEXT NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  registration_board_label TEXT, -- Ex: 'CRP', 'CRM', 'OAB', 'CREF', 'CRFa', etc.
  registration_required INTEGER NOT NULL DEFAULT 0,
  custom_fields_schema TEXT, -- JSON Schema para campos customizados adicionais
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_professions_category ON professions (category_id, active);

-- 3. Especialidades / Subcategorias
CREATE TABLE IF NOT EXISTS specialties (
  id TEXT PRIMARY KEY,
  tenant_id TEXT, -- NULL para globais
  profession_id TEXT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#4f46e5',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (profession_id) REFERENCES professions(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_specialties_profession ON specialties (profession_id, active);

-- 4. Planos SaaS
CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  price_monthly REAL NOT NULL DEFAULT 0,
  max_professionals INTEGER NOT NULL DEFAULT 1,
  max_patients INTEGER NOT NULL DEFAULT 50,
  max_rooms INTEGER NOT NULL DEFAULT 1,
  features_json TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 5. Tenants (Clínicas, Consultórios, Estúdios, Escritórios)
CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  corporate_name TEXT, -- Razão Social
  trade_name TEXT,     -- Nome Fantasia
  person_type TEXT NOT NULL DEFAULT 'pj' CHECK(person_type IN ('pj', 'pf')),
  cnpj_cpf TEXT,
  municipal_registration TEXT,
  state_registration TEXT,
  professional_board TEXT,    -- Ex: 'CRM', 'CRP', 'CRFa', 'CREFITO', 'OAB'
  professional_registry TEXT, -- Número do registro do responsável ou clínica
  category_id TEXT,
  email TEXT NOT NULL,
  phone TEXT,
  mobile TEXT,
  whatsapp TEXT,
  website TEXT,
  description TEXT,
  -- Endereço Completo
  address TEXT,
  street TEXT,
  number TEXT,
  complement TEXT,
  neighborhood TEXT,
  city TEXT,
  state TEXT,
  zip_code TEXT,
  country TEXT DEFAULT 'Brasil',
  logo_url TEXT,
  primary_color TEXT DEFAULT '#4f46e5',
  client_term_label TEXT DEFAULT 'Paciente', -- 'Paciente', 'Cliente', 'Aluno', 'Tutor'
  plan_id TEXT,
  -- Responsável Legal / Gestor Cadastrado
  responsible_name TEXT,
  responsible_cpf TEXT,
  responsible_email TEXT,
  responsible_phone TEXT,
  responsible_role TEXT,
  -- Status e Controle de Onboarding
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'active', 'blocked', 'rejected', 'suspended', 'banned')),
  rejection_reason TEXT,
  onboarding_completed INTEGER NOT NULL DEFAULT 0,
  onboarding_step INTEGER NOT NULL DEFAULT 1,
  manager_confirmed INTEGER NOT NULL DEFAULT 0,
  terms_accepted INTEGER NOT NULL DEFAULT 1,
  terms_accepted_at TEXT,
  privacy_accepted INTEGER NOT NULL DEFAULT 1,
  privacy_accepted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
  FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants (slug);
CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants (status);

-- 6. Assinaturas SaaS
CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL UNIQUE,
  plan_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'past_due', 'cancelled', 'trial')),
  current_period_start TEXT NOT NULL,
  current_period_end TEXT NOT NULL,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (plan_id) REFERENCES plans(id)
);

-- 7. Usuários (Autenticação RBAC)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  tenant_id TEXT, -- NULL se superadmin
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('superadmin', 'clinic_admin', 'professional', 'receptionist', 'secretary', 'financial', 'assistant', 'custom', 'patient')),
  phone TEXT,
  avatar_url TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('pending', 'active', 'inactive', 'blocked', 'rejected')),
  two_factor_enabled INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_tenant_role ON users (tenant_id, role);

-- 7.1 Associação Usuário x Clínica & Permissões Customizadas (clinic_users)
CREATE TABLE IF NOT EXISTS clinic_users (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('pending', 'active', 'inactive', 'blocked', 'rejected')),
  is_manager INTEGER NOT NULL DEFAULT 0,
  permissions_json TEXT, -- JSON com array de permissões concedidas
  approved_by TEXT,
  approved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(tenant_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_clinic_users_lookup ON clinic_users (tenant_id, user_id, status);

-- 8. Profissionais
CREATE TABLE IF NOT EXISTS professionals (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  user_id TEXT UNIQUE,
  name TEXT NOT NULL,
  photo_url TEXT,
  profession_id TEXT,
  specialty_id TEXT,
  registration_type TEXT, -- Ex: 'CRP', 'CRM', 'OAB', 'CRFa'
  registration_number TEXT,
  custom_attributes_json TEXT,
  bio TEXT,
  buffer_minutes INTEGER NOT NULL DEFAULT 10,
  active INTEGER NOT NULL DEFAULT 1,
  profession_change_used INTEGER NOT NULL DEFAULT 0,
  profession_changed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (profession_id) REFERENCES professions(id) ON DELETE SET NULL,
  FOREIGN KEY (specialty_id) REFERENCES specialties(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_professionals_tenant ON professionals (tenant_id, active);

-- 9. Salas e Espaços
CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- 10. Catálogo de Serviços
CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  specialty_id TEXT,
  name TEXT NOT NULL,
  description TEXT,
  duration_minutes INTEGER NOT NULL DEFAULT 50,
  buffer_minutes INTEGER NOT NULL DEFAULT 10,
  price REAL NOT NULL DEFAULT 0.0,
  modality TEXT NOT NULL DEFAULT 'both' CHECK(modality IN ('presential', 'online', 'home', 'both')),
  active INTEGER NOT NULL DEFAULT 1,
  min_lead_time_hours INTEGER NOT NULL DEFAULT 2,
  max_advance_days INTEGER NOT NULL DEFAULT 60,
  cancellation_policy TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (specialty_id) REFERENCES specialties(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_services_tenant ON services (tenant_id, active);

-- 11. Associação Profissional x Serviços
CREATE TABLE IF NOT EXISTS professional_services (
  id TEXT PRIMARY KEY,
  professional_id TEXT NOT NULL,
  service_id TEXT NOT NULL,
  custom_price REAL,
  custom_duration INTEGER,
  FOREIGN KEY (professional_id) REFERENCES professionals(id) ON DELETE CASCADE,
  FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE,
  UNIQUE(professional_id, service_id)
);

-- 12. Grade Semanal de Horários de Trabalho (Schedules)
CREATE TABLE IF NOT EXISTS schedules (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  professional_id TEXT NOT NULL,
  day_of_week INTEGER NOT NULL CHECK(day_of_week BETWEEN 0 AND 6), -- 0=Domingo, 1=Segunda, ..., 6=Sábado
  start_time TEXT NOT NULL, -- '08:00'
  end_time TEXT NOT NULL,   -- '18:00'
  break_start TEXT,         -- '12:00'
  break_end TEXT,           -- '13:30'
  is_active INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (professional_id) REFERENCES professionals(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_schedules_prof_day ON schedules (professional_id, day_of_week, is_active);

-- 13. Bloqueios e Ausências (Férias, Almoço, Reuniões, Feriados)
CREATE TABLE IF NOT EXISTS blocked_times (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  professional_id TEXT, -- NULL se bloqueio geral da clínica/sala
  room_id TEXT,
  title TEXT NOT NULL,
  start_datetime TEXT NOT NULL, -- ISO 8601 'YYYY-MM-DDTHH:mm:ss'
  end_datetime TEXT NOT NULL,
  reason TEXT,
  type TEXT NOT NULL DEFAULT 'absence' CHECK(type IN ('vacation', 'meeting', 'lunch', 'holiday', 'maintenance', 'absence')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (professional_id) REFERENCES professionals(id) ON DELETE CASCADE,
  FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_blocked_times_range ON blocked_times (tenant_id, professional_id, start_datetime, end_datetime);

-- 14. Feriados e Recessos
CREATE TABLE IF NOT EXISTS holidays (
  id TEXT PRIMARY KEY,
  tenant_id TEXT, -- NULL se nacional
  date TEXT NOT NULL, -- 'YYYY-MM-DD'
  name TEXT NOT NULL,
  is_national INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1
);

-- 15. Clientes / Pacientes / Alunos / Tutores
CREATE TABLE IF NOT EXISTS patients (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  full_name TEXT NOT NULL,
  social_name TEXT,
  birth_date TEXT,
  cpf TEXT,
  email TEXT,
  phone TEXT NOT NULL,
  whatsapp TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip_code TEXT,
  photo_url TEXT,
  emergency_contact TEXT,
  emergency_phone TEXT,
  notes_admin TEXT,
  is_child INTEGER NOT NULL DEFAULT 0,
  pet_metadata_json TEXT, -- Para pets/animais (espécie, raça, porte, idade)
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_patients_tenant_search ON patients (tenant_id, full_name, phone, active);

-- 16. Responsáveis Legais (Para Atendimento Infantil / Pediátrico / Menores)
CREATE TABLE IF NOT EXISTS guardians (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  full_name TEXT NOT NULL,
  relationship TEXT NOT NULL DEFAULT 'mother' CHECK(relationship IN ('mother', 'father', 'legal_guardian', 'tutor', 'other')),
  cpf TEXT,
  phone TEXT NOT NULL,
  email TEXT,
  is_primary INTEGER NOT NULL DEFAULT 1,
  authorization_signed INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_guardians_patient ON guardians (patient_id);

-- 17. Agendamentos (Appointments)
CREATE TABLE IF NOT EXISTS appointments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  appointment_number TEXT NOT NULL, -- Ex: 'AG-2026-0001'
  patient_id TEXT NOT NULL,
  professional_id TEXT NOT NULL,
  service_id TEXT NOT NULL,
  room_id TEXT,
  start_time TEXT NOT NULL, -- ISO 8601
  end_time TEXT NOT NULL,   -- ISO 8601
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show', 'rescheduled')),
  modality TEXT NOT NULL DEFAULT 'presential' CHECK(modality IN ('presential', 'online', 'home')),
  patient_notes TEXT,
  internal_notes TEXT,
  cancellation_reason TEXT,
  cancelled_at TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (patient_id) REFERENCES patients(id),
  FOREIGN KEY (professional_id) REFERENCES professionals(id),
  FOREIGN KEY (service_id) REFERENCES services(id),
  FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_appointments_tenant_time ON appointments (tenant_id, start_time, end_time, status);
CREATE INDEX IF NOT EXISTS idx_appointments_prof_time ON appointments (professional_id, start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_appointments_patient ON appointments (patient_id);

-- 18. Histórico de Mudanças de Status do Agendamento
CREATE TABLE IF NOT EXISTS appointment_status_history (
  id TEXT PRIMARY KEY,
  appointment_id TEXT NOT NULL,
  previous_status TEXT,
  new_status TEXT NOT NULL,
  changed_by TEXT,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE
);

-- 19. Prontuários Clínicos / Evolução de Sessão / Ficha Técnica (Restrito por Sigilo e LGPD)
CREATE TABLE IF NOT EXISTS records (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  appointment_id TEXT,
  professional_id TEXT NOT NULL,
  session_date TEXT NOT NULL,
  title TEXT NOT NULL,
  clinical_evolution TEXT, -- Anotações clínicas confidenciais
  technical_notes TEXT,    -- Para profissionais não-médicos (briefing, treino, evolução de aluno)
  private_notes TEXT,      -- Anotações pessoais exclusivas do profissional
  is_sealed INTEGER NOT NULL DEFAULT 0, -- 1 se prontuário fechado e imutável
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL,
  FOREIGN KEY (professional_id) REFERENCES professionals(id)
);

CREATE INDEX IF NOT EXISTS idx_records_patient ON records (patient_id, session_date);

-- 20. Documentos e Anexos
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  record_id TEXT,
  title TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT,
  file_size INTEGER,
  uploaded_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  FOREIGN KEY (record_id) REFERENCES records(id) ON DELETE SET NULL
);

-- 21. Pagamentos e Módulo Financeiro
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  appointment_id TEXT,
  patient_id TEXT NOT NULL,
  amount REAL NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'pix' CHECK(payment_method IN ('pix', 'credit_card', 'debit_card', 'cash', 'bank_transfer', 'insurance')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('paid', 'pending', 'partial', 'cancelled', 'refunded')),
  transaction_id TEXT,
  payment_date TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL,
  FOREIGN KEY (patient_id) REFERENCES patients(id)
);

CREATE INDEX IF NOT EXISTS idx_payments_tenant_date ON payments (tenant_id, status, created_at);

-- 22. Configuração de Recibos por Clínica (Dados do Emitente e Numeração Própria)
CREATE TABLE IF NOT EXISTS receipt_settings (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL UNIQUE,
  emitter_type TEXT NOT NULL DEFAULT 'pj' CHECK(emitter_type IN ('pj', 'pf')),
  emitter_name TEXT NOT NULL,
  emitter_trade_name TEXT,
  emitter_document TEXT NOT NULL, -- CPF ou CNPJ
  emitter_municipal_reg TEXT,
  emitter_board_name TEXT,        -- Ex: 'CRM', 'CRP', 'CRFa', 'OAB'
  emitter_registry_number TEXT,   -- Número no conselho
  emitter_registry_state TEXT,    -- UF do conselho
  emitter_street TEXT,
  emitter_number TEXT,
  emitter_complement TEXT,
  emitter_neighborhood TEXT,
  emitter_city TEXT,
  emitter_state TEXT,
  emitter_zip_code TEXT,
  emitter_phone TEXT,
  emitter_email TEXT,
  receipt_prefix TEXT NOT NULL DEFAULT 'REC-',
  next_sequence INTEGER NOT NULL DEFAULT 1,
  default_template_text TEXT NOT NULL DEFAULT 'Recebemos de [CLIENTE] a importância de R$ [VALOR], referente à prestação do serviço [SERVIÇO], realizado em [DATA], pelo profissional [PROFISSIONAL].',
  is_configured INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- 22.1 Recibos Emitidos com Numeração Independente por Clínica
CREATE TABLE IF NOT EXISTS receipts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  receipt_number TEXT NOT NULL, -- Ex: 'REC-000001'
  sequence_number INTEGER NOT NULL,
  payment_id TEXT,
  appointment_id TEXT,
  patient_id TEXT,
  emitter_json TEXT NOT NULL,
  payer_type TEXT NOT NULL DEFAULT 'pf' CHECK(payer_type IN ('pf', 'pj')),
  payer_name TEXT NOT NULL,
  payer_document TEXT NOT NULL, -- CPF ou CNPJ
  payer_email TEXT,
  payer_phone TEXT,
  payer_address TEXT,
  service_description TEXT NOT NULL,
  service_date TEXT NOT NULL,
  professional_name TEXT NOT NULL,
  professional_specialty TEXT,
  professional_registry TEXT,
  gross_amount REAL NOT NULL,
  discount_amount REAL NOT NULL DEFAULT 0,
  final_amount REAL NOT NULL,
  payment_method TEXT NOT NULL,
  payment_status TEXT NOT NULL DEFAULT 'paid',
  notes TEXT,
  custom_text TEXT,
  issued_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by TEXT,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE SET NULL,
  FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL,
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE SET NULL,
  UNIQUE(tenant_id, sequence_number)
);

CREATE INDEX IF NOT EXISTS idx_receipts_tenant ON receipts (tenant_id, issued_at);

-- 22.2 Convites para Novos Funcionários da Clínica
CREATE TABLE IF NOT EXISTS invites (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  role TEXT NOT NULL,
  profession_id TEXT,
  specialty_id TEXT,
  registration_number TEXT,
  permissions_json TEXT,
  token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'accepted', 'expired', 'cancelled')),
  created_by TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_invites_tenant_status ON invites (tenant_id, status);

-- 22.3 Comprovantes Legados
CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  payment_id TEXT NOT NULL,
  invoice_number TEXT NOT NULL,
  pdf_url TEXT,
  issued_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE CASCADE
);

-- 23. Fila de Notificações (WhatsApp, Email, SMS)
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  patient_id TEXT,
  professional_id TEXT,
  appointment_id TEXT,
  type TEXT NOT NULL CHECK(type IN ('confirmation', 'reminder_24h', 'reminder_2h', 'cancellation', 'reschedule', 'payment')),
  channel TEXT NOT NULL DEFAULT 'whatsapp' CHECK(channel IN ('whatsapp', 'email', 'sms', 'push')),
  recipient TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'sent', 'failed')),
  scheduled_for TEXT NOT NULL,
  sent_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notifications_queue ON notifications (status, scheduled_for);

-- 24. Trilha Imutável de Auditoria (LGPD Compliance & Segurança)
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  user_id TEXT,
  action TEXT NOT NULL, -- 'LOGIN', 'CREATE_APPOINTMENT', 'VIEW_RECORD', 'UPDATE_PAYMENT', etc.
  entity TEXT NOT NULL, -- 'appointments', 'records', 'patients', 'payments'
  entity_id TEXT,
  ip_address TEXT,
  user_agent TEXT,
  details_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_time ON audit_logs (tenant_id, created_at);

-- 25. Configurações por Clínica/Tenant
CREATE TABLE IF NOT EXISTS settings (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  setting_key TEXT NOT NULL,
  setting_value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  UNIQUE(tenant_id, setting_key)
);

-- 26. Integrações (Gateways, WhatsApp, etc.)
CREATE TABLE IF NOT EXISTS integrations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK(provider IN ('stripe', 'asaas', 'mercadopago', 'whatsapp_evolution', 'z-api')),
  config_json TEXT,
  is_active INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  UNIQUE(tenant_id, provider)
);

-- 27. Registro e Prova de Aceite Legal (Termos de Uso e Política de Privacidade / LGPD)
CREATE TABLE IF NOT EXISTS legal_acceptances (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  clinic_id TEXT NOT NULL,
  terms_version TEXT NOT NULL,
  privacy_version TEXT NOT NULL,
  marketing_opt_in INTEGER DEFAULT 0,
  accepted_at TEXT NOT NULL DEFAULT (datetime('now')),
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (clinic_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_legal_acceptances_user ON legal_acceptances (user_id);
CREATE INDEX IF NOT EXISTS idx_legal_acceptances_clinic ON legal_acceptances (clinic_id);

-- 28. Verificação de E-mail Obrigatória (OTP de 6 dígitos)
CREATE TABLE IF NOT EXISTS email_verifications (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  purpose TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  resend_count INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  verified_at TEXT,
  consumed_at TEXT,
  last_sent_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_email_verif_email_purpose ON email_verifications(email, purpose);
CREATE INDEX IF NOT EXISTS idx_email_verif_status ON email_verifications(status);


