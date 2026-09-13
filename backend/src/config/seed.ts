import { DatabaseSync } from 'node:sqlite';
import bcrypt from 'bcryptjs';

export function runSeed(db: DatabaseSync): void {
  const passwordHash = bcrypt.hashSync('123456', 10);

  // 1. Categorias Macro (20 categorias solicitadas)
  const categoriesData = [
    { id: 'cat-mental', name: 'Saúde Mental e Comportamento', slug: 'saude-mental', icon: 'Brain', default_terminology: 'patient', is_clinical: 1, description: 'Psicologia, Psiquiatria, Terapias Comportamentais e Desenvolvimento Humano' },
    { id: 'cat-infantil', name: 'Atendimento Infantil e Desenvolvimento', slug: 'atendimento-infantil', icon: 'Baby', default_terminology: 'patient', is_clinical: 1, description: 'Especialistas em desenvolvimento infantil, neuropediatria e estimulação precoce' },
    { id: 'cat-fono', name: 'Fonoaudiologia e Comunicação', slug: 'fonoaudiologia', icon: 'Volume2', default_terminology: 'patient', is_clinical: 1, description: 'Linguagem, fala, voz, audiologia, motricidade orofacial e disfagia' },
    { id: 'cat-reab', name: 'Terapias e Reabilitação', slug: 'terapias-reabilitacao', icon: 'Activity', default_terminology: 'patient', is_clinical: 1, description: 'Fisioterapia, Terapia Ocupacional, Osteopatia e Quiropraxia' },
    { id: 'cat-med', name: 'Medicina', slug: 'medicina', icon: 'Stethoscope', default_terminology: 'patient', is_clinical: 1, description: 'Clínica Geral, Pediatria, Cardiologia, Dermatologia e especialidades médicas' },
    { id: 'cat-odonto', name: 'Odontologia', slug: 'odontologia', icon: 'Smile', default_terminology: 'patient', is_clinical: 1, description: 'Clínica geral, ortodontia, odontopediatria e harmonização' },
    { id: 'cat-nutri', name: 'Nutrição e Alimentação', slug: 'nutricao', icon: 'Apple', default_terminology: 'patient', is_clinical: 1, description: 'Nutrição clínica, esportiva, infantil, materno-infantil e funcional' },
    { id: 'cat-edu', name: 'Educação e Aprendizagem', slug: 'educacao', icon: 'GraduationCap', default_terminology: 'student', is_clinical: 0, description: 'Professores particulares, tutores escolares, mentores e reforço' },
    { id: 'cat-dev-pessoal', name: 'Desenvolvimento Profissional e Pessoal', slug: 'desenvolvimento-pessoal', icon: 'Compass', default_terminology: 'client', is_clinical: 0, description: 'Coaching executivo, mentoria de carreira e consultoria de negócios' },
    { id: 'cat-esporte', name: 'Esporte e Atividade Física', slug: 'esporte', icon: 'Dumbbell', default_terminology: 'student', is_clinical: 0, description: 'Personal trainers, instrutores de pilates, yoga e treinamento funcional' },
    { id: 'cat-beleza', name: 'Estética e Beleza', slug: 'estetica-beleza', icon: 'Sparkles', default_terminology: 'client', is_clinical: 0, description: 'Esteticistas, lash designers, sobrancelhas, cabeleireiros e barbeiros' },
    { id: 'cat-maternidade', name: 'Atendimento para Gestantes, Mães e Famílias', slug: 'gestantes-familias', icon: 'HeartHandshake', default_terminology: 'patient', is_clinical: 1, description: 'Doulas, consultoras de amamentação, educadores parentais e sono infantil' },
    { id: 'cat-enfermagem', name: 'Enfermagem e Cuidados', slug: 'enfermagem', icon: 'ShieldCheck', default_terminology: 'patient', is_clinical: 1, description: 'Enfermeiros, técnicos, cuidadores de idosos e home care' },
    { id: 'cat-integrativa', name: 'Saúde e Bem-Estar Complementar', slug: 'saude-complementar', icon: 'Sun', default_terminology: 'client', is_clinical: 0, description: 'Terapias holísticas, aromaterapia, meditação, acupuntura e naturopatia' },
    { id: 'cat-juridico', name: 'Serviços Jurídicos e Profissionais', slug: 'juridico-contabil', icon: 'Briefcase', default_terminology: 'client', is_clinical: 0, description: 'Advogados, contadores, consultores tributários e corretores' },
    { id: 'cat-tech', name: 'Tecnologia e Serviços Especializados', slug: 'tecnologia', icon: 'Code', default_terminology: 'client', is_clinical: 0, description: 'Desenvolvedores, designers, videomakers, fotógrafos e consultores TI' },
    { id: 'cat-domestico', name: 'Serviços Domiciliares e Manutenção', slug: 'servicos-domiciliares', icon: 'Wrench', default_terminology: 'client', is_clinical: 0, description: 'Técnicos de manutenção, eletricistas, encanadores, pintores e organizadoras' },
    { id: 'cat-pets', name: 'Pets e Animais', slug: 'pets-animais', icon: 'Dog', default_terminology: 'pet_owner', is_clinical: 1, description: 'Médicos veterinários, adestradores, banho e tosa, pet sitters' },
    { id: 'cat-criativo', name: 'Profissionais Criativos', slug: 'profissionais-criativos', icon: 'Music', default_terminology: 'client', is_clinical: 0, description: 'Professores de música, canto, dança, DJs, ilustradores e produtores' },
    { id: 'cat-outros', name: 'Outras Atividades e Consultorias', slug: 'outras-atividades', icon: 'Layers', default_terminology: 'client', is_clinical: 0, description: 'Serviços e atendimentos personalizados com horários agendados' }
  ];

  const insertCat = db.prepare(`
    INSERT INTO categories (id, name, slug, icon, default_terminology, is_clinical, description)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  for (const cat of categoriesData) {
    insertCat.run(cat.id, cat.name, cat.slug, cat.icon, cat.default_terminology, cat.is_clinical, cat.description);
  }

  // 2. Profissões com rótulo de conselho/registro de classe
  const professionsData = [
    // Saúde Mental
    { id: 'prof-psicologo', cat_id: 'cat-mental', name: 'Psicólogo', slug: 'psicologo', reg_label: 'CRP', reg_req: 1 },
    { id: 'prof-psiquiatra', cat_id: 'cat-mental', name: 'Psiquiatra', slug: 'psiquiatra', reg_label: 'CRM', reg_req: 1 },
    { id: 'prof-psicopedagogo', cat_id: 'cat-mental', name: 'Psicopedagogo', slug: 'psicopedagogo', reg_label: 'ABPp', reg_req: 0 },
    { id: 'prof-neuropsicologo', cat_id: 'cat-mental', name: 'Neuropsicólogo', slug: 'neuropsicologo', reg_label: 'CRP', reg_req: 1 },
    { id: 'prof-psicanalista', cat_id: 'cat-mental', name: 'Psicanalista', slug: 'psicanalista', reg_label: 'Registro Associação', reg_req: 0 },
    { id: 'prof-terapeuta-familiar', cat_id: 'cat-mental', name: 'Terapeuta Familiar e de Casal', slug: 'terapeuta-familiar', reg_label: 'Registro', reg_req: 0 },
    // Fonoaudiologia
    { id: 'prof-fonoaudiologo', cat_id: 'cat-fono', name: 'Fonoaudiólogo', slug: 'fonoaudiologo', reg_label: 'CRFa', reg_req: 1 },
    // Terapias e Reabilitação
    { id: 'prof-terapeuta-ocupacional', cat_id: 'cat-reab', name: 'Terapeuta Ocupacional', slug: 'terapeuta-ocupacional', reg_label: 'CREFITO', reg_req: 1 },
    { id: 'prof-fisioterapeuta', cat_id: 'cat-reab', name: 'Fisioterapeuta', slug: 'fisioterapeuta', reg_label: 'CREFITO', reg_req: 1 },
    { id: 'prof-osteopata', cat_id: 'cat-reab', name: 'Osteopata', slug: 'osteopata', reg_label: 'Registro', reg_req: 0 },
    { id: 'prof-quiropraxista', cat_id: 'cat-reab', name: 'Quiropraxista', slug: 'quiropraxista', reg_label: 'ABQ', reg_req: 0 },
    // Medicina
    { id: 'prof-medico', cat_id: 'cat-med', name: 'Médico', slug: 'medico', reg_label: 'CRM', reg_req: 1 },
    { id: 'prof-pediatra', cat_id: 'cat-med', name: 'Pediatra', slug: 'pediatra', reg_label: 'CRM', reg_req: 1 },
    { id: 'prof-dermatologista', cat_id: 'cat-med', name: 'Dermatologista', slug: 'dermatologista', reg_label: 'CRM', reg_req: 1 },
    { id: 'prof-cardiologista', cat_id: 'cat-med', name: 'Cardiologista', slug: 'cardiologista', reg_label: 'CRM', reg_req: 1 },
    // Odontologia
    { id: 'prof-dentista', cat_id: 'cat-odonto', name: 'Cirurgião-Dentista', slug: 'dentista', reg_label: 'CRO', reg_req: 1 },
    // Nutrição
    { id: 'prof-nutricionista', cat_id: 'cat-nutri', name: 'Nutricionista', slug: 'nutricionista', reg_label: 'CRN', reg_req: 1 },
    // Educação
    { id: 'prof-professor-particular', cat_id: 'cat-edu', name: 'Professor Particular', slug: 'professor-particular', reg_label: null, reg_req: 0 },
    { id: 'prof-tutor-escolar', cat_id: 'cat-edu', name: 'Tutor / Mentor de Aprendizagem', slug: 'tutor-escolar', reg_label: null, reg_req: 0 },
    // Desenvolvimento Pessoal
    { id: 'prof-coach', cat_id: 'cat-dev-pessoal', name: 'Coach / Mentor de Carreira', slug: 'coach-mentor', reg_label: null, reg_req: 0 },
    { id: 'prof-consultor', cat_id: 'cat-dev-pessoal', name: 'Consultor Empresarial', slug: 'consultor', reg_label: null, reg_req: 0 },
    // Esporte
    { id: 'prof-personal-trainer', cat_id: 'cat-esporte', name: 'Personal Trainer', slug: 'personal-trainer', reg_label: 'CREF', reg_req: 1 },
    { id: 'prof-instrutor-pilates', cat_id: 'cat-esporte', name: 'Instrutor de Pilates', slug: 'instrutor-pilates', reg_label: 'Certificação', reg_req: 0 },
    // Estética
    { id: 'prof-esteticista', cat_id: 'cat-beleza', name: 'Esteticista', slug: 'esteticista', reg_label: 'Registro Técnico', reg_req: 0 },
    { id: 'prof-lash-designer', cat_id: 'cat-beleza', name: 'Lash Designer / Sobrancelhas', slug: 'lash-designer', reg_label: null, reg_req: 0 },
    { id: 'prof-cabeleireiro', cat_id: 'cat-beleza', name: 'Cabeleireiro / Barbeiro', slug: 'cabeleireiro-barbeiro', reg_label: null, reg_req: 0 },
    // Maternidade
    { id: 'prof-doula', cat_id: 'cat-maternidade', name: 'Doula / Consultora de Amamentação', slug: 'doula', reg_label: 'Certificação', reg_req: 0 },
    // Enfermagem
    { id: 'prof-enfermeiro', cat_id: 'cat-enfermagem', name: 'Enfermeiro', slug: 'enfermeiro', reg_label: 'COREN', reg_req: 1 },
    // Jurídico
    { id: 'prof-advogado', cat_id: 'cat-juridico', name: 'Advogado', slug: 'advogado', reg_label: 'OAB', reg_req: 1 },
    { id: 'prof-contador', cat_id: 'cat-juridico', name: 'Contador', slug: 'contador', reg_label: 'CRC', reg_req: 1 },
    // Pets
    { id: 'prof-veterinario', cat_id: 'cat-pets', name: 'Médico Veterinário', slug: 'veterinario', reg_label: 'CRMV', reg_req: 1 },
    { id: 'prof-adestrador', cat_id: 'cat-pets', name: 'Adestrador / Comportamentalista Animal', slug: 'adestrador', reg_label: null, reg_req: 0 }
  ];

  const insertProf = db.prepare(`
    INSERT INTO professions (id, category_id, name, slug, registration_board_label, registration_required)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  for (const p of professionsData) {
    insertProf.run(p.id, p.cat_id, p.name, p.slug, p.reg_label, p.reg_req);
  }

  // 3. Especialidades Principais
  const specialtiesData = [
    { id: 'spec-psi-clinica', prof_id: 'prof-psicologo', name: 'Psicologia Clínica do Adulto', slug: 'psicologia-clinica-adulto', color: '#6366f1' },
    { id: 'spec-psi-infantil', prof_id: 'prof-psicologo', name: 'Psicologia Infantil / Ludoterapia', slug: 'psicologia-infantil', color: '#ec4899' },
    { id: 'spec-psi-tcc', prof_id: 'prof-psicologo', name: 'Terapia Cognitivo-Comportamental (TCC)', slug: 'tcc', color: '#0ea5e9' },
    { id: 'spec-psiq-geral', prof_id: 'prof-psiquiatra', name: 'Psiquiatria Geral e Transtornos de Ansiedade', slug: 'psiquiatria-geral', color: '#8b5cf6' },
    { id: 'spec-psiq-infantil', prof_id: 'prof-psiquiatra', name: 'Psiquiatria da Infância e Adolescência', slug: 'psiquiatria-infantil', color: '#a855f7' },
    { id: 'spec-fono-linguagem', prof_id: 'prof-fonoaudiologo', name: 'Fonoaudiologia Infantil e Linguagem', slug: 'fono-linguagem', color: '#14b8a6' },
    { id: 'spec-fono-voz', prof_id: 'prof-fonoaudiologo', name: 'Voz e Motricidade Orofacial', slug: 'fono-voz', color: '#06b6d4' },
    { id: 'spec-to-integracao', prof_id: 'prof-terapeuta-ocupacional', name: 'Integração Sensorial e Desenvolvimento', slug: 'to-integracao-sensorial', color: '#f59e0b' },
    { id: 'spec-fisio-neuro', prof_id: 'prof-fisioterapeuta', name: 'Fisioterapia Neurofuncional e Pediatria', slug: 'fisio-neuro', color: '#10b981' },
    { id: 'spec-nutri-clinica', prof_id: 'prof-nutricionista', name: 'Nutrição Clínica e Funcional', slug: 'nutricao-clinica', color: '#84cc16' },
    { id: 'spec-personal-cond', prof_id: 'prof-personal-trainer', name: 'Condicionamento Físico e Reabilitação', slug: 'personal-condicionamento', color: '#f97316' },
    { id: 'spec-odonto-geral', prof_id: 'prof-dentista', name: 'Clínica Geral e Odontopediatria', slug: 'odontopediatria', color: '#3b82f6' },
    { id: 'spec-adv-civil', prof_id: 'prof-advogado', name: 'Direito Civil e de Família', slug: 'direito-civil-familia', color: '#64748b' }
  ];

  const insertSpec = db.prepare(`
    INSERT INTO specialties (id, profession_id, name, slug, color)
    VALUES (?, ?, ?, ?, ?)
  `);
  for (const s of specialtiesData) {
    insertSpec.run(s.id, s.prof_id, s.name, s.slug, s.color);
  }

  // 4. Planos SaaS
  const insertPlan = db.prepare(`
    INSERT INTO plans (id, name, slug, price_monthly, max_professionals, max_patients, max_rooms, features_json, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertPlan.run(
    'plan-basic',
    'Plano Básico',
    'basico',
    99.00,
    1,
    50,
    1,
    JSON.stringify({ calendar: true, publicBooking: true, reminders: 'email', reports: false, finance: false }),
    'active'
  );

  insertPlan.run(
    'plan-pro',
    'Plano Profissional',
    'profissional',
    199.00,
    5,
    300,
    3,
    JSON.stringify({ calendar: true, publicBooking: true, reminders: 'whatsapp', reports: true, finance: true, clinicalRecords: true }),
    'active'
  );

  insertPlan.run(
    'plan-clinic',
    'Plano Clínica Multidisciplinar',
    'clinica',
    399.00,
    999,
    99999,
    999,
    JSON.stringify({ calendar: true, publicBooking: true, reminders: 'all', reports: true, finance: true, clinicalRecords: true, multiUser: true, rooms: true, aiAssistant: true }),
    'active'
  );

  // 5. Tenants (Clínica Modelo e Consultório Modelo)
  const insertTenant = db.prepare(`
    INSERT INTO tenants (id, slug, name, trade_name, cnpj_cpf, category_id, email, phone, address, city, state, zip_code, logo_url, primary_color, client_term_label, plan_id, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertTenant.run(
    'tenant-viver-bem',
    'clinica-viver-bem',
    'Clínica Multidisciplinar Viver Bem Ltda',
    'Espaço Viver Bem - Saúde Integrada',
    '12.345.678/0001-90',
    'cat-mental',
    'contato@viverbem.com.br',
    '(11) 3456-7890',
    'Av. Paulista, 1500, Conjunto 82 - Bela Vista',
    'São Paulo',
    'SP',
    '01310-100',
    'https://images.unsplash.com/photo-1629909613654-28e377c37b09?w=300',
    '#4f46e5',
    'Paciente',
    'plan-clinic',
    'active'
  );

  insertTenant.run(
    'tenant-movimento-ativo',
    'movimento-ativo',
    'Estúdio Movimento Ativo & Performance',
    'Movimento Ativo Fisioterapia e Treinamento',
    '98.765.432/0001-10',
    'cat-esporte',
    'contato@movimentoativo.com.br',
    '(11) 98765-0011',
    'Rua Harmonia, 420 - Vila Madalena',
    'São Paulo',
    'SP',
    '05435-000',
    'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=300',
    '#0d9488',
    'Aluno / Cliente',
    'plan-pro',
    'active'
  );

  // Assinaturas ativas dos tenants
  const insertSub = db.prepare(`
    INSERT INTO subscriptions (id, tenant_id, plan_id, status, current_period_start, current_period_end)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  insertSub.run('sub-1', 'tenant-viver-bem', 'plan-clinic', 'active', '2026-01-01', '2026-12-31');
  insertSub.run('sub-2', 'tenant-movimento-ativo', 'plan-pro', 'active', '2026-01-01', '2026-12-31');

  // 6. Usuários (SuperAdmin, ClinicAdmin, Profissionais, Recepcionista, Paciente)
  const insertUser = db.prepare(`
    INSERT INTO users (id, tenant_id, name, email, password_hash, role, phone, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // SuperAdmin Global da Plataforma
  insertUser.run('usr-superadmin', null, 'Administrador Global SaaS', 'admin@saas.com', passwordHash, 'superadmin', '(11) 99999-1000', 'active');

  // ClinicAdmin da Clínica Viver Bem
  insertUser.run('usr-admin-viverbem', 'tenant-viver-bem', 'Dr. Roberto Mendonça (Diretor)', 'diretoria@viverbem.com', passwordHash, 'clinic_admin', '(11) 99999-2000', 'active');

  // Profissionais da Clínica Viver Bem
  insertUser.run('usr-prof-camila', 'tenant-viver-bem', 'Dra. Camila Torres', 'dra.camila@viverbem.com', passwordHash, 'professional', '(11) 98888-3001', 'active');
  insertUser.run('usr-prof-lucas', 'tenant-viver-bem', 'Dr. Lucas Silveira', 'dr.lucas@viverbem.com', passwordHash, 'professional', '(11) 98888-3002', 'active');
  insertUser.run('usr-prof-beatriz', 'tenant-viver-bem', 'Fga. Beatriz Duarte', 'fga.beatriz@viverbem.com', passwordHash, 'professional', '(11) 98888-3003', 'active');

  // Recepcionista da Clínica Viver Bem
  insertUser.run('usr-rec-juliana', 'tenant-viver-bem', 'Juliana Santos (Recepção)', 'recepcao@viverbem.com', passwordHash, 'receptionist', '(11) 97777-4001', 'active');

  // Paciente cadastrado
  insertUser.run('usr-pat-mariana', 'tenant-viver-bem', 'Mariana Silva', 'paciente@email.com', passwordHash, 'patient', '(11) 96666-5001', 'active');

  // 7. Profissionais associados com perfil detalhado
  const insertProfessional = db.prepare(`
    INSERT INTO professionals (id, tenant_id, user_id, name, photo_url, profession_id, specialty_id, registration_type, registration_number, bio, buffer_minutes, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertProfessional.run(
    'pro-camila',
    'tenant-viver-bem',
    'usr-prof-camila',
    'Dra. Camila Torres',
    'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=200',
    'prof-psiquiatra',
    'spec-psiq-geral',
    'CRM',
    'CRM/SP 145.982',
    'Médica Psiquiatra especialista em transtornos de humor, ansiedade e saúde mental do adulto. Formada pela USP com 12 anos de atuação clínica.',
    10,
    1
  );

  insertProfessional.run(
    'pro-lucas',
    'tenant-viver-bem',
    'usr-prof-lucas',
    'Dr. Lucas Silveira',
    'https://images.unsplash.com/photo-1622253692010-333f2da6031d?w=200',
    'prof-psicologo',
    'spec-psi-tcc',
    'CRP',
    'CRP 06/98214',
    'Psicólogo Clínico com formação em Terapia Cognitivo-Comportamental (TCC). Focado em crianças, adolescentes, estresse e regulação emocional.',
    10,
    1
  );

  insertProfessional.run(
    'pro-beatriz',
    'tenant-viver-bem',
    'usr-prof-beatriz',
    'Fga. Beatriz Duarte',
    'https://images.unsplash.com/photo-1594824813570-0720b784a92e?w=200',
    'prof-fonoaudiologo',
    'spec-fono-linguagem',
    'CRFa',
    'CRFa 2-18452',
    'Fonoaudióloga especialista em estimulação precoce da fala, linguagem infantil e atrasos de comunicação.',
    10,
    1
  );

  // 8. Salas da Clínica
  const insertRoom = db.prepare(`
    INSERT INTO rooms (id, tenant_id, name, description, active)
    VALUES (?, ?, ?, ?, ?)
  `);

  insertRoom.run('room-1', 'tenant-viver-bem', 'Consultório 01 (Psicoterapia Adulto)', 'Poltronas confortáveis, isolamento acústico e luz natural', 1);
  insertRoom.run('room-2', 'tenant-viver-bem', 'Consultório 02 (Infantil / Brinquedoteca)', 'Equipada com jogos educativos, tatame e materiais de estimulação', 1);
  insertRoom.run('room-3', 'tenant-viver-bem', 'Consultório 03 (Médico / Psiquiatria)', 'Mesa de atendimento, maca de apoio e prontuário digital', 1);

  // 9. Serviços Oferecidos
  const insertService = db.prepare(`
    INSERT INTO services (id, tenant_id, specialty_id, name, description, duration_minutes, buffer_minutes, price, modality, active, min_lead_time_hours, max_advance_days, cancellation_policy)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertService.run(
    'srv-psi-adulto',
    'tenant-viver-bem',
    'spec-psi-clinica',
    'Sessão de Psicoterapia Individual (Adulto)',
    'Atendimento psicológico clínico baseado em TCC para autoconhecimento, ansiedade e depressão.',
    50,
    10,
    180.00,
    'both',
    1,
    2,
    60,
    'Cancelamento com até 24 horas de antecedência.'
  );

  insertService.run(
    'srv-psi-infantil',
    'tenant-viver-bem',
    'spec-psi-infantil',
    'Psicoterapia Infantil e Ludoterapia',
    'Sessão com atividades lúdicas e orientação aos pais para acolhimento e desenvolvimento socioemocional.',
    50,
    10,
    190.00,
    'presential',
    1,
    4,
    60,
    'Cancelamento com no mínimo 24h de antecedência.'
  );

  insertService.run(
    'srv-psiq-consulta',
    'tenant-viver-bem',
    'spec-psiq-geral',
    'Consulta Psiquiátrica Inicial',
    'Avaliação médica completa, diagnóstico diferencial e plano terapêutico personalizado.',
    45,
    15,
    350.00,
    'both',
    1,
    6,
    90,
    'Cancelamento com até 24 horas de antecedência.'
  );

  insertService.run(
    'srv-fono-avaliacao',
    'tenant-viver-bem',
    'spec-fono-linguagem',
    'Avaliação Fonoaudiológica Infantil',
    'Avaliação diagnóstica de fala, linguagem receptiva e expressiva para crianças.',
    45,
    10,
    220.00,
    'presential',
    1,
    4,
    60,
    'Avisar com 24 horas de antecedência.'
  );

  // Vínculos Professional x Services
  const insertProfService = db.prepare(`
    INSERT INTO professional_services (id, professional_id, service_id)
    VALUES (?, ?, ?)
  `);
  insertProfService.run('ps-1', 'pro-lucas', 'srv-psi-adulto');
  insertProfService.run('ps-2', 'pro-lucas', 'srv-psi-infantil');
  insertProfService.run('ps-3', 'pro-camila', 'srv-psiq-consulta');
  insertProfService.run('ps-4', 'pro-beatriz', 'srv-fono-avaliacao');

  // 10. Grade Semanal de Horários (Segunda a Sexta das 08:00 às 18:00 com almoço 12:00 às 13:30)
  const insertSchedule = db.prepare(`
    INSERT INTO schedules (id, tenant_id, professional_id, day_of_week, start_time, end_time, break_start, break_end, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const pros = ['pro-camila', 'pro-lucas', 'pro-beatriz'];
  let schedCount = 1;
  for (const profId of pros) {
    for (let day = 1; day <= 5; day++) { // Segunda a Sexta
      insertSchedule.run(`sch-${schedCount++}`, 'tenant-viver-bem', profId, day, '08:00', '18:00', '12:00', '13:30', 1);
    }
  }

  // 11. Pacientes / Clientes (Adulto e Pediátrico com Responsáveis)
  const insertPatient = db.prepare(`
    INSERT INTO patients (id, tenant_id, full_name, social_name, birth_date, cpf, email, phone, whatsapp, address, city, state, zip_code, emergency_contact, emergency_phone, notes_admin, is_child, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Paciente Adulta: Mariana Silva
  insertPatient.run(
    'pat-mariana',
    'tenant-viver-bem',
    'Mariana Silva Santos',
    null,
    '1992-05-14',
    '234.567.890-12',
    'paciente@email.com',
    '(11) 96666-5001',
    '(11) 96666-5001',
    'Rua das Palmeiras, 120, Apto 42',
    'São Paulo',
    'SP',
    '01226-010',
    'Carlos Santos (Esposo)',
    '(11) 96666-9999',
    'Prefere atendimentos no período matutino.',
    0,
    1
  );

  // Paciente Pediátrico: Enzo Gabriel (6 anos)
  insertPatient.run(
    'pat-enzo',
    'tenant-viver-bem',
    'Enzo Gabriel de Oliveira',
    null,
    '2020-04-10',
    '543.210.987-65',
    'responsavel.enzo@gmail.com',
    '(11) 95555-6001',
    '(11) 95555-6001',
    'Av. Pompeia, 850, Bloco B',
    'São Paulo',
    'SP',
    '05022-000',
    'Fernanda de Oliveira (Mãe)',
    '(11) 95555-6001',
    'Criança em acompanhamento fonoaudiológico e comportamental.',
    1,
    1
  );

  // Paciente Adulto: Rodrigo Almeida
  insertPatient.run(
    'pat-rodrigo',
    'tenant-viver-bem',
    'Rodrigo Almeida Prado',
    null,
    '1985-11-22',
    '123.987.456-33',
    'rodrigo.prado@empresa.com.br',
    '(11) 94444-7001',
    '(11) 94444-7001',
    'Rua Augusta, 2100, Conj 51',
    'São Paulo',
    'SP',
    '01412-000',
    'Patrícia Prado (Irmã)',
    '(11) 94444-8888',
    'Atendimento online preferencialmente.',
    0,
    1
  );

  // 12. Responsáveis Legais do Paciente Infantil (Enzo Gabriel)
  const insertGuardian = db.prepare(`
    INSERT INTO guardians (id, tenant_id, patient_id, full_name, relationship, cpf, phone, email, is_primary, authorization_signed)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertGuardian.run(
    'grd-fernanda',
    'tenant-viver-bem',
    'pat-enzo',
    'Fernanda de Oliveira',
    'mother',
    '456.789.012-34',
    '(11) 95555-6001',
    'fernanda.oliveira@gmail.com',
    1,
    1
  );

  insertGuardian.run(
    'grd-marcelo',
    'tenant-viver-bem',
    'pat-enzo',
    'Marcelo de Oliveira',
    'father',
    '987.654.321-00',
    '(11) 95555-6002',
    'marcelo.oliveira@gmail.com',
    0,
    1
  );

  // 13. Agendamentos representativos em múltiplos status
  const today = new Date();
  const formatYMD = (d: Date) => d.toISOString().split('T')[0];

  const todayStr = formatYMD(today);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = formatYMD(tomorrow);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = formatYMD(yesterday);

  const insertAppt = db.prepare(`
    INSERT INTO appointments (id, tenant_id, appointment_number, patient_id, professional_id, service_id, room_id, start_time, end_time, status, modality, patient_notes, internal_notes, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Hoje: Mariana com Dr. Lucas (Confirmado)
  insertAppt.run(
    'apt-today-1',
    'tenant-viver-bem',
    'AG-2026-001',
    'pat-mariana',
    'pro-lucas',
    'srv-psi-adulto',
    'room-1',
    `${todayStr}T09:00:00`,
    `${todayStr}T09:50:00`,
    'confirmed',
    'presential',
    'Continuar discussão sobre ansiedade no trabalho.',
    'Paciente assídua, sessão 8 do plano.',
    'usr-rec-juliana'
  );

  // Hoje: Enzo com Fga. Beatriz (Agendado)
  insertAppt.run(
    'apt-today-2',
    'tenant-viver-bem',
    'AG-2026-002',
    'pat-enzo',
    'pro-beatriz',
    'srv-fono-avaliacao',
    'room-2',
    `${todayStr}T14:00:00`,
    `${todayStr}T14:45:00`,
    'scheduled',
    'presential',
    'Primeira avaliação de trocas fonêmicas.',
    'Mãe Fernanda acompanhará.',
    'usr-rec-juliana'
  );

  // Hoje: Rodrigo com Dra. Camila (Em Atendimento)
  insertAppt.run(
    'apt-today-3',
    'tenant-viver-bem',
    'AG-2026-003',
    'pat-rodrigo',
    'pro-camila',
    'srv-psiq-consulta',
    'room-3',
    `${todayStr}T10:30:00`,
    `${todayStr}T11:15:00`,
    'in_progress',
    'online',
    'Consulta de acompanhamento medicamentoso.',
    'Link do Google Meet enviado.',
    'usr-pat-mariana'
  );

  // Ontem: Concluído
  insertAppt.run(
    'apt-yesterday-1',
    'tenant-viver-bem',
    'AG-2026-004',
    'pat-mariana',
    'pro-camila',
    'srv-psiq-consulta',
    'room-3',
    `${yesterdayStr}T15:00:00`,
    `${yesterdayStr}T15:45:00`,
    'completed',
    'presential',
    'Revisão de posologia.',
    'Atendimento finalizado e prontuário preenchido.',
    'usr-rec-juliana'
  );

  // Amanhã: Mariana com Dr. Lucas (Confirmado)
  insertAppt.run(
    'apt-tomorrow-1',
    'tenant-viver-bem',
    'AG-2026-005',
    'pat-mariana',
    'pro-lucas',
    'srv-psi-adulto',
    'room-1',
    `${tomorrowStr}T11:00:00`,
    `${tomorrowStr}T11:50:00`,
    'confirmed',
    'presential',
    'Atendimento regular.',
    null,
    'usr-rec-juliana'
  );

  // 14. Prontuários Clínicos Sigilosos (Records)
  const insertRecord = db.prepare(`
    INSERT INTO records (id, tenant_id, patient_id, appointment_id, professional_id, session_date, title, clinical_evolution, technical_notes, private_notes, is_sealed)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertRecord.run(
    'rec-1',
    'tenant-viver-bem',
    'pat-mariana',
    'apt-yesterday-1',
    'pro-camila',
    yesterdayStr,
    'Evolução Psiquiátrica - Avaliação de Resposta Terapêutica',
    'Paciente relata melhora significativa nos episódios de insônia inicial e estabilização do humor nas últimas 3 semanas. Sem efeitos adversos relatados.',
    'Conduta: Mantida posologia atual. Retorno agendado em 60 dias.',
    'Verificar na próxima sessão se mantém rotina de higiene do sono.',
    1
  );

  // 15. Pagamentos e Módulo Financeiro
  const insertPayment = db.prepare(`
    INSERT INTO payments (id, tenant_id, appointment_id, patient_id, amount, payment_method, status, transaction_id, payment_date, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertPayment.run(
    'pay-1',
    'tenant-viver-bem',
    'apt-yesterday-1',
    'pat-mariana',
    350.00,
    'pix',
    'paid',
    'PIX-E2E-20260909153000-8812',
    yesterdayStr,
    'Pagamento recebido via chave PIX CNPJ. Recibo emitido.'
  );

  insertPayment.run(
    'pay-2',
    'tenant-viver-bem',
    'apt-today-1',
    'pat-mariana',
    180.00,
    'credit_card',
    'paid',
    'CC-AUTH-981245',
    todayStr,
    'Cartão de Crédito 1x.'
  );

  insertPayment.run(
    'pay-3',
    'tenant-viver-bem',
    'apt-today-2',
    'pat-enzo',
    220.00,
    'pix',
    'pending',
    null,
    null,
    'Aguardando confirmação na recepção.'
  );

  // 16. Configurações Padrão da Clínica
  const insertSetting = db.prepare(`
    INSERT INTO settings (id, tenant_id, setting_key, setting_value)
    VALUES (?, ?, ?, ?)
  `);

  insertSetting.run('set-1', 'tenant-viver-bem', 'business_hours_start', '08:00');
  insertSetting.run('set-2', 'tenant-viver-bem', 'business_hours_end', '19:00');
  insertSetting.run('set-3', 'tenant-viver-bem', 'default_buffer_minutes', '10');
  insertSetting.run('set-4', 'tenant-viver-bem', 'allow_online_booking', 'true');
  insertSetting.run('set-5', 'tenant-viver-bem', 'reminder_whatsapp_hours_before', '24');
  insertSetting.run('set-6', 'tenant-viver-bem', 'cancellation_min_hours_before', '24');

  // 17. Log de Auditoria Inicial (LGPD Compliance)
  const insertAudit = db.prepare(`
    INSERT INTO audit_logs (id, tenant_id, user_id, action, entity, entity_id, ip_address, user_agent, details_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertAudit.run(
    'aud-1',
    'tenant-viver-bem',
    'usr-admin-viverbem',
    'SYSTEM_INITIALIZED',
    'tenants',
    'tenant-viver-bem',
    '127.0.0.1',
    'SaaS-Core/1.0',
    JSON.stringify({ message: 'Clínica e ambiente SaaS configurados com sucesso' })
  );
}
