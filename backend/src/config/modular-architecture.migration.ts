import { DatabaseSync } from 'node:sqlite';
import { resolveCanonicalProfession } from '../utils/profession-module';

export function migrateModularArchitecture(rawDb: DatabaseSync): void {
  // Helper de colunas
  const addColIfMissing = (table: string, col: string, typeDef: string) => {
    try {
      const cols = (rawDb.prepare(`PRAGMA table_info(${table})`).all() as any[]).map(c => c.name);
      if (cols.length > 0 && !cols.includes(col)) {
        rawDb.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${typeDef};`);
      }
    } catch (_) {}
  };

  rawDb.exec(`
    -- 1. Catálogo de Áreas de Atuação / Abordagens
    CREATE TABLE IF NOT EXISTS practice_areas (
      id TEXT PRIMARY KEY,
      profession_id TEXT NOT NULL,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'AREA' CHECK(type IN ('SPECIALTY', 'AREA', 'APPROACH', 'METHOD')),
      description TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (profession_id) REFERENCES professions(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_practice_areas_prof ON practice_areas(profession_id, active);

    -- 2. Catálogo Universal de Capabilities
    CREATE TABLE IF NOT EXISTS capabilities (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      active INTEGER NOT NULL DEFAULT 1
    );

    -- 3. Mapeamento Profissão x Capabilities (Regras DEFAULT, OPTIONAL, HIDDEN)
    CREATE TABLE IF NOT EXISTS profession_capabilities (
      profession_id TEXT NOT NULL,
      capability_id TEXT NOT NULL,
      rule TEXT NOT NULL CHECK(rule IN ('DEFAULT', 'OPTIONAL', 'HIDDEN')),
      PRIMARY KEY (profession_id, capability_id),
      FOREIGN KEY (profession_id) REFERENCES professions(id) ON DELETE CASCADE,
      FOREIGN KEY (capability_id) REFERENCES capabilities(id) ON DELETE CASCADE
    );

    -- 4. Mapeamento Área de Atuação x Capabilities
    CREATE TABLE IF NOT EXISTS practice_area_capabilities (
      practice_area_id TEXT NOT NULL,
      capability_id TEXT NOT NULL,
      rule TEXT NOT NULL CHECK(rule IN ('DEFAULT', 'OPTIONAL', 'HIDDEN')),
      PRIMARY KEY (practice_area_id, capability_id),
      FOREIGN KEY (practice_area_id) REFERENCES practice_areas(id) ON DELETE CASCADE,
      FOREIGN KEY (capability_id) REFERENCES capabilities(id) ON DELETE CASCADE
    );

    -- 5. Áreas de Atuação Escolhidas pelo Profissional (Múltiplas)
    CREATE TABLE IF NOT EXISTS user_practice_areas (
      user_id TEXT NOT NULL,
      practice_area_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, practice_area_id, tenant_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (practice_area_id) REFERENCES practice_areas(id) ON DELETE CASCADE
    );

    -- 6. Recursos Opcionais Ativados pelo Próprio Profissional
    CREATE TABLE IF NOT EXISTS user_optional_capabilities (
      user_id TEXT NOT NULL,
      capability_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, capability_id, tenant_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (capability_id) REFERENCES capabilities(id) ON DELETE CASCADE
    );

    -- 7. Limites e Recursos Liberados por Plano Comercial
    CREATE TABLE IF NOT EXISTS plan_capabilities (
      plan_id TEXT NOT NULL,
      capability_id TEXT NOT NULL,
      PRIMARY KEY (plan_id, capability_id),
      FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE,
      FOREIGN KEY (capability_id) REFERENCES capabilities(id) ON DELETE CASCADE
    );

    -- 8. Sessões Temporárias do Laboratório SuperAdmin
    CREATE TABLE IF NOT EXISTS sandbox_test_sessions (
      id TEXT PRIMARY KEY,
      admin_user_id TEXT NOT NULL,
      profession_id TEXT NOT NULL,
      practice_areas_json TEXT NOT NULL,
      plan_code TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      sandbox_tenant_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL,
      FOREIGN KEY (admin_user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- 9. Consultas e Registros Clínicos do ZemdaMed
    CREATE TABLE IF NOT EXISTS medical_consultations (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      patient_id TEXT NOT NULL,
      appointment_id TEXT,
      professional_id TEXT NOT NULL,
      specialty_preset TEXT NOT NULL,
      chief_complaint TEXT,
      hpi TEXT,
      past_medical_history TEXT,
      family_history TEXT,
      habits_lifestyle TEXT,
      vital_signs_json TEXT,
      physical_exam_json TEXT,
      neurological_exam_json TEXT,
      diagnostic_hypotheses_json TEXT,
      cid_code TEXT,
      cid_description TEXT,
      clinical_conduct TEXT,
      soap_notes_json TEXT,
      return_in_days INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
      FOREIGN KEY (professional_id) REFERENCES professionals(id)
    );
    CREATE INDEX IF NOT EXISTS idx_med_cons_pat ON medical_consultations(patient_id, tenant_id);
    CREATE INDEX IF NOT EXISTS idx_med_cons_prof ON medical_consultations(professional_id, tenant_id);
  `);

  addColIfMissing('clinic_users', 'zemda_med_enabled', 'INTEGER DEFAULT 0');
  addColIfMissing('users', 'zemda_med_enabled', 'INTEGER DEFAULT 0');
  addColIfMissing('professionals', 'zemda_med_enabled', 'INTEGER DEFAULT 0');

  // Assegura existência idempotente de profissões canônicas (sem reativar desativadas)
  ensureCanonicalProfessions(rawDb);

  // Seed de Capabilities
  seedCapabilities(rawDb);

  // Seed de Áreas de Atuação
  seedPracticeAreas(rawDb);

  // Seed da Matriz de Regras de Capabilities
  seedCapabilitiesMatrix(rawDb);

  // Reconciliação retroativa e compatibilidade para contas existentes
  reconcileLegacyProfessionsAndCapabilities(rawDb);
}

function seedCapabilities(rawDb: DatabaseSync): void {
  const caps = [
    // CORE
    { id: 'CORE_SCHEDULE', category: 'CORE', name: 'Agenda Interativa', description: 'Agendamentos, horários, salas e slots' },
    { id: 'CORE_PATIENTS', category: 'CORE', name: 'Gestão de Pacientes', description: 'Cadastro, responsáveis e histórico geral' },
    { id: 'CORE_RECORDS', category: 'CORE', name: 'Prontuário & Evolução', description: 'Prontuário eletrônico confidencial e evolução' },
    { id: 'CORE_DOCUMENTS', category: 'CORE', name: 'Documentos e Atestados', description: 'Atestados, declarações e relatórios' },
    { id: 'CORE_PRESCRIPTIONS', category: 'CORE', name: 'Prescrição & Receituário', description: 'Receitas simples e de controle especial' },
    { id: 'CORE_EXAM_REQUEST', category: 'CORE', name: 'Solicitação de Exames', description: 'Pedidos estruturados de exames laboratoriais e imagem' },
    { id: 'CORE_EXAMS_RECEIVED', category: 'CORE', name: 'Exames Recebidos', description: 'Upload, controle e laudos de exames' },
    { id: 'CORE_REFERRALS', category: 'CORE', name: 'Encaminhamentos', description: 'Encaminhamento interprofissional e contrarreferência' },
    { id: 'CORE_AI', category: 'CORE', name: 'Assistente Zemda IA', description: 'Copilot para auxílio clínico e insights' },
    { id: 'CORE_TIMELINE', category: 'CORE', name: 'Histórico e Linha do Tempo', description: 'Visualização cronológica 360° do paciente' },

    // BODY
    { id: 'BODY_MAP', category: 'BODY', name: 'ZemdaBody (Mapa Corporal)', description: 'Mapeamento anatômico, marcações de queixas e histórico' },

    // ANTHROPOMETRY & COMPOSITION
    { id: 'ANTHROPOMETRY', category: 'ANTHROPOMETRY', name: 'Antropometria', description: 'Peso, altura, IMC, circunferências corporais e medidas' },
    { id: 'BODY_COMPOSITION', category: 'BODY_COMPOSITION', name: 'Composição Corporal', description: 'Bioimpedância, dobras cutâneas, TAV e massas magra/gorda' },

    // FUNCTIONAL & MOBILITY
    { id: 'FUNCTIONAL_ASSESSMENT', category: 'FUNCTIONAL', name: 'Avaliação Funcional', description: 'Autonomia, desempenho funcional e comparação evolutiva' },
    { id: 'MOBILITY_ASSESSMENT', category: 'MOBILITY', name: 'Mobilidade & ADM', description: 'Goniometria articular estruturada' },
    { id: 'PAIN_ASSESSMENT', category: 'MOBILITY', name: 'Avaliação da Dor', description: 'Escala EVA, tipo, localização e comportamento da dor' },
    { id: 'MUSCLE_STRENGTH', category: 'MOBILITY', name: 'Força Muscular', description: 'Graduação de força por grupos musculares (Oxford 0-5)' },
    { id: 'POSTURE_GAIT', category: 'MOBILITY', name: 'Postura & Marcha', description: 'Avaliação postural estática e análise de marcha' },
    { id: 'FUNCTIONAL_TESTS', category: 'MOBILITY', name: 'Testes Funcionais', description: 'Bateria de testes ortopédicos e neuromusculares' },
    { id: 'HOME_EXERCISES', category: 'MOBILITY', name: 'Exercícios Domiciliares', description: 'Prescrição e orientações de exercícios para casa' },

    // ADL
    { id: 'ADL_ASSESSMENT', category: 'ADL', name: 'AVD e AIVD', description: 'Atividades Básicas e Instrumentais de Vida Diária' },
    { id: 'OCCUPATIONAL_PART', category: 'ADL', name: 'Participação Ocupacional', description: 'Análise de tarefas, rotina diária e tecnologia assistiva' },

    // SENSORY
    { id: 'SENSORY_ASSESSMENT', category: 'SENSORY', name: 'Perfil & Integração Sensorial', description: 'Processamento sensorial, estímulos e modulação' },

    // COMMUNICATION
    { id: 'COMMUNICATION_ASSESSMENT', category: 'COMMUNICATION', name: 'Comunicação & Linguagem', description: 'Desenvolvimento comunicativo, fala e linguagem' },
    { id: 'AAC_COMMUNICATION', category: 'COMMUNICATION', name: 'Comunicação Alternativa (CAA)', description: 'Sistemas e recursos de CAA' },
    { id: 'AUDIOLOGY', category: 'COMMUNICATION', name: 'Audiologia Clínica', description: 'Audiometria tonal, vocal e imitanciometria' },

    // LEARNING
    { id: 'LEARNING_ASSESSMENT', category: 'LEARNING', name: 'Avaliação da Aprendizagem', description: 'Leitura, escrita, cálculo, funções executivas e desempenho acadêmico' },

    // BEHAVIOR
    { id: 'BEHAVIOR_ASSESSMENT', category: 'BEHAVIOR', name: 'Registro Comportamental', description: 'Acompanhamento longitudinal de comportamento, humor e sono' },

    // FONO_SPECIFIC
    { id: 'FONO_SPECIFIC', category: 'FONO_SPECIFIC', name: 'Ferramentas Fonoaudiológicas', description: 'Motricidade Orofacial, Voz, Disfagia e Fluência' },

    // NUTRITION
    { id: 'NUTRITION_SPECIFIC', category: 'NUTRITION', name: 'Avaliação & Plano Nutricional', description: 'Recordatório 24h, gasto energético, tabela TACO e plano alimentar' },

    // PHYSICAL & TRAINING
    { id: 'PHYSICAL_ASSESSMENT', category: 'PHYSICAL', name: 'Avaliação Física', description: 'Testes cardiorrespiratórios, neuromotores e aptidão física' },
    { id: 'TRAINING_PRESCRIBE', category: 'TRAINING', name: 'Prescrição de Treino', description: 'Montagem de treinos, séries, repetições, carga e biblioteca de exercícios' },

    // ODONTO
    { id: 'ODONTO_SPECIFIC', category: 'ODONTO', name: 'Odontograma & Procedimentos', description: 'Odontograma interativo, periodontograma, implantes e ortodontia' },

    // MEDICAL
    { id: 'MEDICAL_BASE', category: 'MEDICAL', name: 'Consulta Médica Base', description: 'Anamnese completa, queixa, HDA, antecedentes e conduta' },
    { id: 'MEDICAL_VITAL_SIGNS', category: 'MEDICAL', name: 'Sinais Vitais', description: 'PA, FC, FR, Temperatura, Saturação e Glicemia capilar' },
    { id: 'MEDICAL_PHYSICAL_EXAM', category: 'MEDICAL', name: 'Exame Físico Geral', description: 'Ectoscopia, ausculta cardiopulmonar e exame segmentar' },
    { id: 'MEDICAL_NEURO', category: 'MEDICAL', name: 'Exame Neurológico Estruturado', description: 'Pares cranianos, sensibilidade, reflexos, coordenação e equilíbrio' },
    { id: 'MEDICAL_SOAP', category: 'MEDICAL', name: 'Evolução Médica SOAP', description: 'Subjetivo, Objetivo, Avaliação e Plano' },
    { id: 'MEDICAL_CID', category: 'MEDICAL', name: 'Classificação CID', description: 'Diagnóstico com código nosológico CID-10 / CID-11' },
    { id: 'CLINICAL_SCALES', category: 'MEDICAL', name: 'Escalas Clínicas Configuráveis', description: 'Escalas psiquiátricas, geriátricas e funcionais' },

    // RECURSOS TRANSVERSAIS / ATENDIMENTO CLÍNICO GERAL & SAÚDE INTEGRAL
    { id: 'CLINICAL_EVOLUTION', category: 'CLINICAL', name: 'Evolução Clínica Geral', description: 'Registro longitudinal de consultas, condutas e orientações' },
    { id: 'THERAPEUTIC_GOALS', category: 'CLINICAL', name: 'Metas Terapêuticas', description: 'Definição e acompanhamento de metas e objetivos terapêuticos' },
    { id: 'GESTATIONAL_FOLLOWUP', category: 'MATERNAL', name: 'Acompanhamento Gestacional e Parto', description: 'Plano de parto, IG, DPP, amamentação e puerpério' },
    { id: 'PHOTO_MONITORING', category: 'CLINICAL', name: 'Acompanhamento Fotográfico / Lesões', description: 'Registro fotográfico evolutivo de feridas, podologia ou estética' }
  ];

  const stmt = rawDb.prepare(`
    INSERT OR IGNORE INTO capabilities (id, category, name, description, active)
    VALUES (?, ?, ?, ?, 1)
  `);

  for (const c of caps) {
    stmt.run(c.id, c.category, c.name, c.description);
  }
}

function ensureCanonicalProfessions(rawDb: DatabaseSync): void {
  // Assegura existência prévia de categorias essenciais de saúde para integridade referencial
  try {
    const insCatStmt = rawDb.prepare(`
      INSERT OR IGNORE INTO categories (id, name, slug, icon, default_terminology, is_clinical, active)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `);
    insCatStmt.run('cat-enfermagem', 'Enfermagem e Cuidados', 'enfermagem', 'ShieldCheck', 'patient', 1);
    insCatStmt.run('cat-beleza', 'Estética e Saúde', 'estetica-saude', 'Sparkles', 'client', 0);
    insCatStmt.run('cat-maternidade', 'Atendimento para Gestantes, Mães e Famílias', 'gestantes-familias', 'HeartHandshake', 'patient', 1);
    insCatStmt.run('cat-integrativa', 'Saúde e Bem-Estar Complementar', 'saude-complementar', 'Sun', 'client', 0);
    insCatStmt.run('cat-outros', 'Outras Atividades de Saúde', 'outras-atividades', 'Layers', 'client', 0);
  } catch (_) {}

  const baseProfs = [
    { id: 'prof-medico', cat_id: 'cat-med', name: 'Medicina', slug: 'medicina', reg_label: 'CRM', reg_req: 1 },
    { id: 'prof-fisioterapeuta', cat_id: 'cat-reab', name: 'Fisioterapia', slug: 'fisioterapia', reg_label: 'CREFITO', reg_req: 1 },
    { id: 'prof-fonoaudiologo', cat_id: 'cat-fono', name: 'Fonoaudiologia', slug: 'fonoaudiologia', reg_label: 'CRFa', reg_req: 1 },
    { id: 'prof-terapeuta-ocupacional', cat_id: 'cat-reab', name: 'Terapia Ocupacional', slug: 'terapia-ocupacional', reg_label: 'CREFITO', reg_req: 1 },
    { id: 'prof-psicologo', cat_id: 'cat-mental', name: 'Psicologia', slug: 'psicologia', reg_label: 'CRP', reg_req: 1 },
    { id: 'prof-psicopedagogo', cat_id: 'cat-mental', name: 'Psicopedagogia', slug: 'psicopedagogia', reg_label: 'ABPp', reg_req: 0 },
    { id: 'prof-nutricionista', cat_id: 'cat-nutri', name: 'Nutrição', slug: 'nutricao', reg_label: 'CRN', reg_req: 1 },
    { id: 'prof-personal-trainer', cat_id: 'cat-esporte', name: 'Personal Trainer', slug: 'personal-trainer', reg_label: 'CREF', reg_req: 1 },
    { id: 'prof-dentista', cat_id: 'cat-odonto', name: 'Odontologia', slug: 'odontologia', reg_label: 'CRO', reg_req: 1 },
    { id: 'prof-administrador', cat_id: 'cat-outros', name: 'Administrador da Clínica', slug: 'administrador', reg_label: 'CRA', reg_req: 0 },

    // Especialidades com ID próprio
    { id: 'prof-neurologista', cat_id: 'cat-med', name: 'Neurologista', slug: 'neurologista', reg_label: 'CRM', reg_req: 1 },
    { id: 'prof-geriatra', cat_id: 'cat-med', name: 'Geriatra', slug: 'geriatra', reg_label: 'CRM', reg_req: 1 },
    { id: 'prof-endocrinologista', cat_id: 'cat-med', name: 'Endocrinologista', slug: 'endocrinologista', reg_label: 'CRM', reg_req: 1 },
    { id: 'prof-ortopedista', cat_id: 'cat-med', name: 'Ortopedista', slug: 'ortopedista', reg_label: 'CRM', reg_req: 1 },
    { id: 'prof-reumatologista', cat_id: 'cat-med', name: 'Reumatologista', slug: 'reumatologista', reg_label: 'CRM', reg_req: 1 },
    { id: 'prof-clinico-geral', cat_id: 'cat-med', name: 'Clínico Geral', slug: 'clinico-geral', reg_label: 'CRM', reg_req: 1 },
    { id: 'prof-ginecologista', cat_id: 'cat-med', name: 'Ginecologista e Obstetra', slug: 'ginecologista', reg_label: 'CRM', reg_req: 1 },
    { id: 'prof-ortodontista', cat_id: 'cat-odonto', name: 'Ortodontista', slug: 'ortodontista', reg_label: 'CRO', reg_req: 1 },

    // Profissões de Apoio à Saúde (HEALTH_SUPPORT)
    { id: 'prof-enfermeiro', cat_id: 'cat-enfermagem', name: 'Enfermeiro(a)', slug: 'enfermeiro', reg_label: 'COREN', reg_req: 1 },
    { id: 'prof-tec-enfermagem', cat_id: 'cat-enfermagem', name: 'Técnico(a) de Enfermagem', slug: 'tecnico-enfermagem', reg_label: 'COREN', reg_req: 1 },
    { id: 'prof-biomedicina', cat_id: 'cat-outros', name: 'Biomédico(a)', slug: 'biomedicina', reg_label: 'CRBM', reg_req: 1 },
    { id: 'prof-farmacia', cat_id: 'cat-outros', name: 'Farmacêutico(a)', slug: 'farmacia', reg_label: 'CRF', reg_req: 1 },
    { id: 'prof-servico-social', cat_id: 'cat-outros', name: 'Assistente Social', slug: 'servico-social', reg_label: 'CRESS', reg_req: 1 },
    { id: 'prof-musicoterapia', cat_id: 'cat-integrativa', name: 'Musicoterapeuta', slug: 'musicoterapia', reg_label: 'UBAM', reg_req: 0 },
    { id: 'prof-arteterapia', cat_id: 'cat-integrativa', name: 'Arteterapeuta', slug: 'arteterapia', reg_label: 'UBAAT', reg_req: 0 },
    { id: 'prof-podologia', cat_id: 'cat-beleza', name: 'Podólogo(a)', slug: 'podologia', reg_label: 'Registro Técnico', reg_req: 0 },
    { id: 'prof-acupuntura', cat_id: 'cat-integrativa', name: 'Acupunturista', slug: 'acupuntura', reg_label: 'Registro', reg_req: 0 },
    { id: 'prof-esteticista', cat_id: 'cat-beleza', name: 'Esteticista', slug: 'esteticista', reg_label: 'Registro Técnico', reg_req: 0 },
    { id: 'prof-doula', cat_id: 'cat-maternidade', name: 'Doula / Consultora de Amamentação', slug: 'doula', reg_label: 'Certificação', reg_req: 0 },
    { id: 'prof-instrutor-pilates', cat_id: 'cat-esporte', name: 'Instrutor de Pilates', slug: 'instrutor-pilates', reg_label: 'Certificação', reg_req: 0 },
    { id: 'prof-outro-saude', cat_id: 'cat-outros', name: 'Outro Profissional da Saúde', slug: 'outro-profissional-saude', reg_label: 'Registro', reg_req: 0 }
  ];

  let deletedProfIds = new Set<string>();
  try {
    deletedProfIds = new Set(
      rawDb.prepare('SELECT id FROM deleted_global_professions').all().map((r: any) => r.id)
    );
  } catch (_) {}

  const insProfStmt = rawDb.prepare(`
    INSERT OR IGNORE INTO professions (id, category_id, name, slug, registration_board_label, registration_required, active)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `);

  for (const bp of baseProfs) {
    if (deletedProfIds.has(bp.id)) continue;
    insProfStmt.run(bp.id, bp.cat_id, bp.name, bp.slug, bp.reg_label, bp.reg_req);
  }
}

function seedPracticeAreas(rawDb: DatabaseSync): void {
  const areas: { id: string; professionId: string; name: string; slug: string; type: string }[] = [
    // 1. Fisioterapia (prof-fisioterapeuta)
    { id: 'pa-fisio-traumato', professionId: 'prof-fisioterapeuta', name: 'Traumato-Ortopédica', slug: 'traumato-ortopedica', type: 'SPECIALTY' },
    { id: 'pa-fisio-neuro', professionId: 'prof-fisioterapeuta', name: 'Neurofuncional', slug: 'neurofuncional', type: 'SPECIALTY' },
    { id: 'pa-fisio-esportiva', professionId: 'prof-fisioterapeuta', name: 'Esportiva', slug: 'esportiva', type: 'SPECIALTY' },
    { id: 'pa-fisio-respiratoria', professionId: 'prof-fisioterapeuta', name: 'Respiratória', slug: 'respiratoria', type: 'SPECIALTY' },
    { id: 'pa-fisio-cardio', professionId: 'prof-fisioterapeuta', name: 'Cardiovascular', slug: 'cardiovascular', type: 'SPECIALTY' },
    { id: 'pa-fisio-pediatrica', professionId: 'prof-fisioterapeuta', name: 'Pediátrica', slug: 'pediatrica', type: 'SPECIALTY' },
    { id: 'pa-fisio-geronto', professionId: 'prof-fisioterapeuta', name: 'Gerontologia', slug: 'gerontologia', type: 'SPECIALTY' },
    { id: 'pa-fisio-mulher', professionId: 'prof-fisioterapeuta', name: 'Saúde da Mulher', slug: 'saude-da-mulher', type: 'AREA' },
    { id: 'pa-fisio-dermato', professionId: 'prof-fisioterapeuta', name: 'Dermato-Funcional', slug: 'dermato-funcional', type: 'SPECIALTY' },
    { id: 'pa-fisio-quiro', professionId: 'prof-fisioterapeuta', name: 'Quiropraxia', slug: 'quiropraxia', type: 'APPROACH' },
    { id: 'pa-fisio-osteo', professionId: 'prof-fisioterapeuta', name: 'Osteopatia', slug: 'osteopatia', type: 'APPROACH' },
    { id: 'pa-fisio-outro', professionId: 'prof-fisioterapeuta', name: 'Outra área de Fisioterapia', slug: 'outra-area-fisio', type: 'AREA' },

    // 2. Fonoaudiologia (prof-fonoaudiologo)
    { id: 'pa-fono-linguagem', professionId: 'prof-fonoaudiologo', name: 'Linguagem', slug: 'linguagem', type: 'SPECIALTY' },
    { id: 'pa-fono-ling-infantil', professionId: 'prof-fonoaudiologo', name: 'Linguagem Infantil', slug: 'linguagem-infantil', type: 'AREA' },
    { id: 'pa-fono-mo', professionId: 'prof-fonoaudiologo', name: 'Motricidade Orofacial', slug: 'motricidade-orofacial', type: 'SPECIALTY' },
    { id: 'pa-fono-voz', professionId: 'prof-fonoaudiologo', name: 'Voz', slug: 'voz', type: 'SPECIALTY' },
    { id: 'pa-fono-audio', professionId: 'prof-fonoaudiologo', name: 'Audiologia', slug: 'audiologia', type: 'SPECIALTY' },
    { id: 'pa-fono-disfagia', professionId: 'prof-fonoaudiologo', name: 'Disfagia', slug: 'disfagia', type: 'SPECIALTY' },
    { id: 'pa-fono-fluencia', professionId: 'prof-fonoaudiologo', name: 'Fluência', slug: 'fluencia', type: 'SPECIALTY' },
    { id: 'pa-fono-aprendizagem', professionId: 'prof-fonoaudiologo', name: 'Aprendizagem', slug: 'aprendizagem', type: 'AREA' },
    { id: 'pa-fono-comunicacao', professionId: 'prof-fonoaudiologo', name: 'Comunicação Aumentativa (CAA)', slug: 'comunicacao-caa', type: 'APPROACH' },
    { id: 'pa-fono-tea', professionId: 'prof-fonoaudiologo', name: 'TEA (Transtorno do Espectro Autista)', slug: 'tea', type: 'AREA' },
    { id: 'pa-fono-aba', professionId: 'prof-fonoaudiologo', name: 'Abordagem ABA', slug: 'abordagem-aba', type: 'METHOD' },
    { id: 'pa-fono-outro', professionId: 'prof-fonoaudiologo', name: 'Outra área de Fonoaudiologia', slug: 'outra-area-fono', type: 'AREA' },

    // 3. Terapia Ocupacional (prof-terapeuta-ocupacional)
    { id: 'pa-to-pediatria', professionId: 'prof-terapeuta-ocupacional', name: 'Pediatria', slug: 'pediatria', type: 'AREA' },
    { id: 'pa-to-neuro', professionId: 'prof-terapeuta-ocupacional', name: 'Neurologia / Neurofuncional', slug: 'neurologia', type: 'SPECIALTY' },
    { id: 'pa-to-geronto', professionId: 'prof-terapeuta-ocupacional', name: 'Gerontologia', slug: 'gerontologia', type: 'SPECIALTY' },
    { id: 'pa-to-mental', professionId: 'prof-terapeuta-ocupacional', name: 'Saúde Mental', slug: 'saude-mental', type: 'SPECIALTY' },
    { id: 'pa-to-escolar', professionId: 'prof-terapeuta-ocupacional', name: 'Contexto Escolar', slug: 'contexto-escolar', type: 'AREA' },
    { id: 'pa-to-reab-fisica', professionId: 'prof-terapeuta-ocupacional', name: 'Reabilitação Física', slug: 'reabilitacao-fisica', type: 'SPECIALTY' },
    { id: 'pa-to-integ-sensorial', professionId: 'prof-terapeuta-ocupacional', name: 'Integração Sensorial', slug: 'integracao-sensorial', type: 'APPROACH' },
    { id: 'pa-to-aba', professionId: 'prof-terapeuta-ocupacional', name: 'Intervenção ABA', slug: 'intervencao-aba', type: 'METHOD' },
    { id: 'pa-to-tec-assistiva', professionId: 'prof-terapeuta-ocupacional', name: 'Tecnologia Assistiva', slug: 'tecnologia-assistiva', type: 'AREA' },
    { id: 'pa-to-avd', professionId: 'prof-terapeuta-ocupacional', name: 'Treino de AVD / AIVD', slug: 'treino-avd', type: 'METHOD' },
    { id: 'pa-to-estimulacao', professionId: 'prof-terapeuta-ocupacional', name: 'Estimulação Sensorial', slug: 'estimulacao-sensorial', type: 'APPROACH' },
    { id: 'pa-to-outro', professionId: 'prof-terapeuta-ocupacional', name: 'Outra área de Terapia Ocupacional', slug: 'outra-area-to', type: 'AREA' },

    // 4. Psicologia (prof-psicologo)
    { id: 'pa-psico-clinica', professionId: 'prof-psicologo', name: 'Psicologia Clínica', slug: 'psicologia-clinica', type: 'AREA' },
    { id: 'pa-psico-infantil', professionId: 'prof-psicologo', name: 'Infantil / Ludoterapia', slug: 'infantil', type: 'AREA' },
    { id: 'pa-psico-adolescente', professionId: 'prof-psicologo', name: 'Adolescente', slug: 'adolescente', type: 'AREA' },
    { id: 'pa-psico-adulto', professionId: 'prof-psicologo', name: 'Adulto', slug: 'adulto', type: 'AREA' },
    { id: 'pa-psico-neuro', professionId: 'prof-psicologo', name: 'Neuropsicologia', slug: 'neuropsicologia', type: 'SPECIALTY' },
    { id: 'pa-psico-hospitalar', professionId: 'prof-psicologo', name: 'Psicologia Hospitalar', slug: 'psicologia-hospitalar', type: 'SPECIALTY' },
    { id: 'pa-psico-tcc', professionId: 'prof-psicologo', name: 'Terapia Cognitivo-Comportamental (TCC)', slug: 'tcc', type: 'APPROACH' },
    { id: 'pa-psico-psicanalise', professionId: 'prof-psicologo', name: 'Psicanálise', slug: 'psicanalise', type: 'APPROACH' },
    { id: 'pa-psico-aba', professionId: 'prof-psicologo', name: 'Análise do Comportamento Aplicada (ABA)', slug: 'aba', type: 'APPROACH' },
    { id: 'pa-psico-familia', professionId: 'prof-psicologo', name: 'Terapia Familiar e de Casal', slug: 'terapia-familiar-casal', type: 'APPROACH' },
    { id: 'pa-psico-outro', professionId: 'prof-psicologo', name: 'Outra abordagem de Psicologia', slug: 'outra-abordagem-psico', type: 'APPROACH' },

    // 5. Psicopedagogia (prof-psicopedagogo)
    { id: 'pa-pp-clinica', professionId: 'prof-psicopedagogo', name: 'Psicopedagogia Clínica', slug: 'clinica', type: 'AREA' },
    { id: 'pa-pp-escolar', professionId: 'prof-psicopedagogo', name: 'Psicopedagogia Institucional / Escolar', slug: 'escolar', type: 'AREA' },
    { id: 'pa-pp-aprendizagem', professionId: 'prof-psicopedagogo', name: 'Dificuldades de Aprendizagem', slug: 'aprendizagem', type: 'AREA' },
    { id: 'pa-pp-leitura-escrita', professionId: 'prof-psicopedagogo', name: 'Leitura e Escrita', slug: 'leitura-escrita', type: 'METHOD' },
    { id: 'pa-pp-matematica', professionId: 'prof-psicopedagogo', name: 'Raciocínio Lógico e Matemática', slug: 'matematica', type: 'METHOD' },
    { id: 'pa-pp-funcoes-exec', professionId: 'prof-psicopedagogo', name: 'Funções Executivas', slug: 'funcoes-executivas', type: 'APPROACH' },
    { id: 'pa-pp-atencao-memoria', professionId: 'prof-psicopedagogo', name: 'Atenção e Memória', slug: 'atencao-memoria', type: 'APPROACH' },
    { id: 'pa-pp-desenvolvimento', professionId: 'prof-psicopedagogo', name: 'Desenvolvimento Cognitivo', slug: 'desenvolvimento', type: 'AREA' },
    { id: 'pa-pp-outro', professionId: 'prof-psicopedagogo', name: 'Outra área de Psicopedagogia', slug: 'outra-area-pp', type: 'AREA' },

    // 6. Nutrição (prof-nutricionista)
    { id: 'pa-nutri-clinica', professionId: 'prof-nutricionista', name: 'Nutrição Clínica', slug: 'clinica', type: 'SPECIALTY' },
    { id: 'pa-nutri-esportiva', professionId: 'prof-nutricionista', name: 'Nutrição Esportiva', slug: 'esportiva', type: 'SPECIALTY' },
    { id: 'pa-nutri-materno', professionId: 'prof-nutricionista', name: 'Materno-Infantil', slug: 'materno-infantil', type: 'SPECIALTY' },
    { id: 'pa-nutri-comportamental', professionId: 'prof-nutricionista', name: 'Comportamental', slug: 'comportamental', type: 'APPROACH' },
    { id: 'pa-nutri-mulher', professionId: 'prof-nutricionista', name: 'Saúde da Mulher', slug: 'saude-mulher', type: 'AREA' },
    { id: 'pa-nutri-geronto', professionId: 'prof-nutricionista', name: 'Gerontologia', slug: 'gerontologia', type: 'AREA' },
    { id: 'pa-nutri-outro', professionId: 'prof-nutricionista', name: 'Outra área de Nutrição', slug: 'outra-area-nutri', type: 'AREA' },

    // 7. Personal Trainer / Educação Física (prof-personal-trainer)
    { id: 'pa-personal-musculacao', professionId: 'prof-personal-trainer', name: 'Musculação & Hipertrofia', slug: 'musculacao', type: 'AREA' },
    { id: 'pa-personal-funcional', professionId: 'prof-personal-trainer', name: 'Treinamento Funcional', slug: 'funcional', type: 'APPROACH' },
    { id: 'pa-personal-condicionamento', professionId: 'prof-personal-trainer', name: 'Condicionamento Físico', slug: 'condicionamento', type: 'AREA' },
    { id: 'pa-personal-esportivo', professionId: 'prof-personal-trainer', name: 'Preparação Esportiva', slug: 'esportivo', type: 'SPECIALTY' },
    { id: 'pa-personal-idosos', professionId: 'prof-personal-trainer', name: 'Atividade Física para Idosos', slug: 'idosos', type: 'AREA' },
    { id: 'pa-personal-gestantes', professionId: 'prof-personal-trainer', name: 'Atividade para Gestantes', slug: 'gestantes', type: 'AREA' },
    { id: 'pa-personal-emagrecimento', professionId: 'prof-personal-trainer', name: 'Emagrecimento Saudável', slug: 'emagrecimento', type: 'AREA' },
    { id: 'pa-personal-outro', professionId: 'prof-personal-trainer', name: 'Outra área de Educação Física', slug: 'outra-area-personal', type: 'AREA' },

    // 8. Odontologia (prof-dentista)
    { id: 'pa-odonto-geral', professionId: 'prof-dentista', name: 'Clínica Geral', slug: 'clinica-geral', type: 'AREA' },
    { id: 'pa-odonto-orto', professionId: 'prof-dentista', name: 'Ortodontia', slug: 'ortodontia', type: 'SPECIALTY' },
    { id: 'pa-odonto-endo', professionId: 'prof-dentista', name: 'Endodontia', slug: 'endodontia', type: 'SPECIALTY' },
    { id: 'pa-odonto-perio', professionId: 'prof-dentista', name: 'Periodontia', slug: 'periodontia', type: 'SPECIALTY' },
    { id: 'pa-odonto-implante', professionId: 'prof-dentista', name: 'Implantodontia', slug: 'implantodontia', type: 'SPECIALTY' },
    { id: 'pa-odonto-pediatria', professionId: 'prof-dentista', name: 'Odontopediatria', slug: 'odontopediatria', type: 'SPECIALTY' },
    { id: 'pa-odonto-cirurgia', professionId: 'prof-dentista', name: 'Cirurgia Bucomaxilofacial', slug: 'cirurgia', type: 'SPECIALTY' },
    { id: 'pa-odonto-protese', professionId: 'prof-dentista', name: 'Prótese Dentária', slug: 'protese', type: 'SPECIALTY' },
    { id: 'pa-odonto-estetica', professionId: 'prof-dentista', name: 'Harmonização Orofacial e Estética', slug: 'estetica-hof', type: 'SPECIALTY' },
    { id: 'pa-odonto-outro', professionId: 'prof-dentista', name: 'Outra especialidade Odontológica', slug: 'outra-area-odonto', type: 'AREA' },

    // 9. Medicina (prof-medico e subespecialidades médicas)
    { id: 'pa-med-clinica', professionId: 'prof-medico', name: 'Clínica Médica', slug: 'clinica-medica', type: 'SPECIALTY' },
    { id: 'pa-med-neuro', professionId: 'prof-medico', name: 'Neurologia', slug: 'neurologia', type: 'SPECIALTY' },
    { id: 'pa-med-psiquiatria', professionId: 'prof-medico', name: 'Psiquiatria', slug: 'psiquiatria', type: 'SPECIALTY' },
    { id: 'pa-med-pediatria', professionId: 'prof-medico', name: 'Pediatria', slug: 'pediatria', type: 'SPECIALTY' },
    { id: 'pa-med-geriatria', professionId: 'prof-medico', name: 'Geriatria', slug: 'geriatria', type: 'SPECIALTY' },
    { id: 'pa-med-endocrino', professionId: 'prof-medico', name: 'Endocrinologia', slug: 'endocrinologia', type: 'SPECIALTY' },
    { id: 'pa-med-ortopedia', professionId: 'prof-medico', name: 'Ortopedia e Traumatologia', slug: 'ortopedia', type: 'SPECIALTY' },
    { id: 'pa-med-cardio', professionId: 'prof-medico', name: 'Cardiologia', slug: 'cardiologia', type: 'SPECIALTY' },
    { id: 'pa-med-dermato', professionId: 'prof-medico', name: 'Dermatologia', slug: 'dermatologia', type: 'SPECIALTY' },
    { id: 'pa-med-reumato', professionId: 'prof-medico', name: 'Reumatologia', slug: 'reumatologia', type: 'SPECIALTY' },
    { id: 'pa-med-gineco', professionId: 'prof-medico', name: 'Ginecologia e Obstetrícia', slug: 'ginecologia-obstetricia', type: 'SPECIALTY' },
    { id: 'pa-med-outro', professionId: 'prof-medico', name: 'Outra especialidade Médica', slug: 'outra-area-med', type: 'SPECIALTY' },

    // 10. Enfermagem (prof-enfermeiro)
    { id: 'pa-enf-saude-familia', professionId: 'prof-enfermeiro', name: 'Saúde da Família e Atenção Básica', slug: 'saude-da-familia', type: 'SPECIALTY' },
    { id: 'pa-enf-estomaterapia', professionId: 'prof-enfermeiro', name: 'Estomaterapia e Feridas', slug: 'estomaterapia-feridas', type: 'SPECIALTY' },
    { id: 'pa-enf-materno-infantil', professionId: 'prof-enfermeiro', name: 'Enfermagem Obstétrica e Neonatal', slug: 'obstetrica-neonatal', type: 'SPECIALTY' },
    { id: 'pa-enf-uti-urgencia', professionId: 'prof-enfermeiro', name: 'Cuidados Críticos e Urgência', slug: 'cuidados-criticos', type: 'SPECIALTY' },
    { id: 'pa-enf-gerontologia', professionId: 'prof-enfermeiro', name: 'Gerontologia e Home Care', slug: 'gerontologia-homecare', type: 'SPECIALTY' },
    { id: 'pa-enf-saude-mental', professionId: 'prof-enfermeiro', name: 'Saúde Mental e Psiquiatria', slug: 'saude-mental', type: 'SPECIALTY' },
    { id: 'pa-enf-outro', professionId: 'prof-enfermeiro', name: 'Outra área de Enfermagem', slug: 'outra-area-enf', type: 'AREA' },

    // 11. Técnico de Enfermagem (prof-tec-enfermagem)
    { id: 'pa-tecenf-domiciliar', professionId: 'prof-tec-enfermagem', name: 'Home Care e Cuidados Domiciliares', slug: 'home-care', type: 'AREA' },
    { id: 'pa-tecenf-curativos', professionId: 'prof-tec-enfermagem', name: 'Curativos e Cuidados de Feridas', slug: 'curativos-feridas', type: 'AREA' },
    { id: 'pa-tecenf-sinais-vitais', professionId: 'prof-tec-enfermagem', name: 'Triagem e Sinais Vitais', slug: 'triagem-sinais-vitais', type: 'AREA' },
    { id: 'pa-tecenf-materno', professionId: 'prof-tec-enfermagem', name: 'Cuidados Neonatais e Maternos', slug: 'cuidados-neonatais', type: 'AREA' },
    { id: 'pa-tecenf-outro', professionId: 'prof-tec-enfermagem', name: 'Outra área de Atuação Técnica', slug: 'outra-area-tecenf', type: 'AREA' },

    // 12. Biomedicina (prof-biomedicina)
    { id: 'pa-biomed-estetica', professionId: 'prof-biomedicina', name: 'Biomedicina Estética', slug: 'biomedicina-estetica', type: 'SPECIALTY' },
    { id: 'pa-biomed-analises', professionId: 'prof-biomedicina', name: 'Patologia e Análises Clínicas', slug: 'analises-clinicas', type: 'SPECIALTY' },
    { id: 'pa-biomed-acupuntura', professionId: 'prof-biomedicina', name: 'Práticas Integrativas e Acupuntura', slug: 'acupuntura-biomedica', type: 'SPECIALTY' },
    { id: 'pa-biomed-reproducao', professionId: 'prof-biomedicina', name: 'Reprodução Humana e Genética', slug: 'reproducao-humana', type: 'SPECIALTY' },
    { id: 'pa-biomed-outro', professionId: 'prof-biomedicina', name: 'Outra área de Biomedicina', slug: 'outra-area-biomed', type: 'AREA' },

    // 13. Farmácia (prof-farmacia)
    { id: 'pa-farm-clinica', professionId: 'prof-farmacia', name: 'Farmácia Clínica e Prescrição', slug: 'farmacia-clinica', type: 'SPECIALTY' },
    { id: 'pa-farm-estetica', professionId: 'prof-farmacia', name: 'Farmácia Estética', slug: 'farmacia-estetica', type: 'SPECIALTY' },
    { id: 'pa-farm-hospitalar', professionId: 'prof-farmacia', name: 'Farmácia Hospitalar e Cuidados Paliativos', slug: 'farmacia-hospitalar', type: 'SPECIALTY' },
    { id: 'pa-farm-homeopatia', professionId: 'prof-farmacia', name: 'Homeopatia e Fitoterapia', slug: 'homeopatia-fitoterapia', type: 'SPECIALTY' },
    { id: 'pa-farm-outro', professionId: 'prof-farmacia', name: 'Outra área de Farmácia', slug: 'outra-area-farm', type: 'AREA' },

    // 14. Serviço Social (prof-servico-social)
    { id: 'pa-ss-saude-coletiva', professionId: 'prof-servico-social', name: 'Saúde Coletiva e Políticas Públicas', slug: 'saude-coletiva', type: 'AREA' },
    { id: 'pa-ss-hospitalar', professionId: 'prof-servico-social', name: 'Serviço Social Hospitalar', slug: 'servico-social-hospitalar', type: 'AREA' },
    { id: 'pa-ss-saude-mental', professionId: 'prof-servico-social', name: 'Reabilitação e Saúde Mental', slug: 'saude-mental-social', type: 'AREA' },
    { id: 'pa-ss-sociojuridico', professionId: 'prof-servico-social', name: 'Proteção Social e Rede de Apoio', slug: 'protecao-social', type: 'AREA' },
    { id: 'pa-ss-outro', professionId: 'prof-servico-social', name: 'Outra área de Serviço Social', slug: 'outra-area-ss', type: 'AREA' },

    // 15. Musicoterapia (prof-musicoterapia)
    { id: 'pa-musico-neuro', professionId: 'prof-musicoterapia', name: 'Neuromusicoterapia e Cognição', slug: 'neuromusicoterapia', type: 'APPROACH' },
    { id: 'pa-musico-infantil', professionId: 'prof-musicoterapia', name: 'Desenvolvimento Infantil e TEA', slug: 'musicoterapia-tea', type: 'APPROACH' },
    { id: 'pa-musico-saude-mental', professionId: 'prof-musicoterapia', name: 'Saúde Mental e Psicoterapia Sonora', slug: 'saude-mental-musico', type: 'APPROACH' },
    { id: 'pa-musico-geronto', professionId: 'prof-musicoterapia', name: 'Gerontologia e Demências', slug: 'gerontologia-musico', type: 'APPROACH' },
    { id: 'pa-musico-outro', professionId: 'prof-musicoterapia', name: 'Outra abordagem em Musicoterapia', slug: 'outra-area-musico', type: 'AREA' },

    // 16. Arteterapia (prof-arteterapia)
    { id: 'pa-arte-infantojuvenil', professionId: 'prof-arteterapia', name: 'Infanto-Juvenil e Expressão Criativa', slug: 'arte-infantojuvenil', type: 'APPROACH' },
    { id: 'pa-arte-saude-mental', professionId: 'prof-arteterapia', name: 'Saúde Mental e Suporte Emocional', slug: 'arte-saude-mental', type: 'APPROACH' },
    { id: 'pa-arte-hospitalar', professionId: 'prof-arteterapia', name: 'Arteterapia Hospitalar e Cuidados Paliativos', slug: 'arte-hospitalar', type: 'APPROACH' },
    { id: 'pa-arte-terceira-idade', professionId: 'prof-arteterapia', name: 'Envelhecimento Ativo e Cognição', slug: 'arte-idosos', type: 'APPROACH' },
    { id: 'pa-arte-outro', professionId: 'prof-arteterapia', name: 'Outra abordagem em Arteterapia', slug: 'outra-area-arte', type: 'AREA' },

    // 17. Podologia (prof-podologia)
    { id: 'pa-podo-diabetico', professionId: 'prof-podologia', name: 'Pé Diabético e Prevenção', slug: 'pe-diabetico', type: 'SPECIALTY' },
    { id: 'pa-podo-geral', professionId: 'prof-podologia', name: 'Podologia Clínica Geral', slug: 'podologia-geral', type: 'AREA' },
    { id: 'pa-podo-esportiva', professionId: 'prof-podologia', name: 'Podologia Esportiva', slug: 'podologia-esportiva', type: 'SPECIALTY' },
    { id: 'pa-podo-infantil', professionId: 'prof-podologia', name: 'Podopediatria', slug: 'podopediatria', type: 'AREA' },
    { id: 'pa-podo-geronto', professionId: 'prof-podologia', name: 'Podogeriatria', slug: 'podogeriatria', type: 'AREA' },
    { id: 'pa-podo-outro', professionId: 'prof-podologia', name: 'Outra área de Podologia', slug: 'outra-area-podo', type: 'AREA' },

    // 18. Acupuntura (prof-acupuntura)
    { id: 'pa-acup-dor', professionId: 'prof-acupuntura', name: 'Manejo da Dor e Ortopedia', slug: 'acupuntura-dor', type: 'APPROACH' },
    { id: 'pa-acup-emocional', professionId: 'prof-acupuntura', name: 'Saúde Emocional, Ansiedade e Sono', slug: 'acupuntura-emocional', type: 'APPROACH' },
    { id: 'pa-acup-saude-mulher', professionId: 'prof-acupuntura', name: 'Saúde da Mulher e Fertilidade', slug: 'acupuntura-mulher', type: 'APPROACH' },
    { id: 'pa-acup-auricular', professionId: 'prof-acupuntura', name: 'Auriculoterapia e Microssistemas', slug: 'auriculoterapia', type: 'METHOD' },
    { id: 'pa-acup-outro', professionId: 'prof-acupuntura', name: 'Outra especialidade em Acupuntura', slug: 'outra-area-acup', type: 'AREA' },

    // 19. Estética (prof-esteticista)
    { id: 'pa-estet-facial', professionId: 'prof-esteticista', name: 'Estética Facial e Rejuvenescimento', slug: 'estetica-facial', type: 'AREA' },
    { id: 'pa-estet-corporal', professionId: 'prof-esteticista', name: 'Estética Corporal e Drenagem', slug: 'estetica-corporal', type: 'AREA' },
    { id: 'pa-estet-pos-operatorio', professionId: 'prof-esteticista', name: 'Pós-Operatório Cirúrgico', slug: 'pos-operatorio', type: 'AREA' },
    { id: 'pa-estet-terapias', professionId: 'prof-esteticista', name: 'Terapias Manuais e Spaterapia', slug: 'spaterapia', type: 'APPROACH' },
    { id: 'pa-estet-outro', professionId: 'prof-esteticista', name: 'Outra área de Estética', slug: 'outra-area-estet', type: 'AREA' },

    // 20. Doula / Consultoria de Amamentação (prof-doula)
    { id: 'pa-doula-parto', professionId: 'prof-doula', name: 'Acompanhamento do Parto e Pré-Parto', slug: 'doula-parto', type: 'AREA' },
    { id: 'pa-doula-amamentacao', professionId: 'prof-doula', name: 'Consultoria de Amamentação', slug: 'consultoria-amamentacao', type: 'AREA' },
    { id: 'pa-doula-puerperio', professionId: 'prof-doula', name: 'Cuidados no Puerpério e Pós-Parto', slug: 'doula-puerperio', type: 'AREA' },
    { id: 'pa-doula-educacao', professionId: 'prof-doula', name: 'Educação Perinatal e Apoio Familiar', slug: 'educacao-perinatal', type: 'AREA' },
    { id: 'pa-doula-outro', professionId: 'prof-doula', name: 'Outra área em Cuidados Perinatais', slug: 'outra-area-doula', type: 'AREA' },

    // 21. Instrutor de Pilates (prof-instrutor-pilates)
    { id: 'pa-pilates-solo', professionId: 'prof-instrutor-pilates', name: 'Pilates Solo (Mat Pilates)', slug: 'pilates-solo', type: 'METHOD' },
    { id: 'pa-pilates-aparelhos', professionId: 'prof-instrutor-pilates', name: 'Pilates em Aparelhos', slug: 'pilates-aparelhos', type: 'METHOD' },
    { id: 'pa-pilates-reab', professionId: 'prof-instrutor-pilates', name: 'Pilates Clínico e Reabilitação Postural', slug: 'pilates-reabilitacao', type: 'APPROACH' },
    { id: 'pa-pilates-gestantes', professionId: 'prof-instrutor-pilates', name: 'Pilates para Gestantes e Pós-Parto', slug: 'pilates-gestantes', type: 'AREA' },
    { id: 'pa-pilates-idosos', professionId: 'prof-instrutor-pilates', name: 'Pilates para Terceira Idade', slug: 'pilates-idosos', type: 'AREA' },
    { id: 'pa-pilates-outro', professionId: 'prof-instrutor-pilates', name: 'Outra abordagem de Pilates', slug: 'outra-area-pilates', type: 'AREA' },

    // 22. Outro Profissional da Saúde (prof-outro-saude)
    { id: 'pa-outro-atendimento-geral', professionId: 'prof-outro-saude', name: 'Atendimento Clínico Multiprofissional', slug: 'atendimento-geral', type: 'AREA' },
    { id: 'pa-outro-terapias-apoio', professionId: 'prof-outro-saude', name: 'Terapias Complementares e de Apoio', slug: 'terapias-apoio', type: 'APPROACH' },
    { id: 'pa-outro-prevencao', professionId: 'prof-outro-saude', name: 'Promoção da Saúde e Prevenção', slug: 'prevencao-saude', type: 'AREA' },
    { id: 'pa-outro-especializado', professionId: 'prof-outro-saude', name: 'Atendimento Especializado', slug: 'atendimento-especializado', type: 'AREA' }
  ];

  const stmt = rawDb.prepare(`
    INSERT OR IGNORE INTO practice_areas (id, profession_id, name, slug, type, active)
    VALUES (?, ?, ?, ?, ?, 1)
  `);

  const stmtSpec = rawDb.prepare(`
    INSERT OR IGNORE INTO specialties (id, profession_id, name, slug, color, active)
    VALUES (?, ?, ?, ?, ?, 1)
  `);

  let deletedProfIds = new Set<string>();
  try {
    deletedProfIds = new Set(
      rawDb.prepare('SELECT id FROM deleted_global_professions').all().map((r: any) => r.id)
    );
  } catch (_) {}

  let existingProfIds = new Set<string>();
  try {
    existingProfIds = new Set(
      rawDb.prepare('SELECT id FROM professions').all().map((r: any) => r.id)
    );
  } catch (_) {}

  for (const a of areas) {
    if (deletedProfIds.has(a.professionId)) continue;
    if (!existingProfIds.has(a.professionId)) continue;
    stmt.run(a.id, a.professionId, a.name, a.slug, a.type);
    stmtSpec.run(a.id, a.professionId, a.name, a.slug, '#6366f1');
  }
}

function seedCapabilitiesMatrix(rawDb: DatabaseSync): void {
  const insertProfCapRaw = rawDb.prepare(`
    INSERT OR IGNORE INTO profession_capabilities (profession_id, capability_id, rule)
    VALUES (?, ?, ?)
  `);

  let existingProfIds = new Set<string>();
  try {
    existingProfIds = new Set(
      rawDb.prepare('SELECT id FROM professions').all().map((r: any) => r.id)
    );
  } catch (_) {}

  const insertProfCap = {
    run: (profId: string, capId: string, rule: string) => {
      if (existingProfIds.has(profId)) {
        insertProfCapRaw.run(profId, capId, rule);
      }
    }
  };

  // Regras padrão de cada profissão (DEFAULT, OPTIONAL, HIDDEN)
  // 1. Fisioterapia
  const fisioDefaults = ['CORE_SCHEDULE', 'CORE_PATIENTS', 'CORE_RECORDS', 'CORE_DOCUMENTS', 'CORE_AI', 'CORE_TIMELINE', 'BODY_MAP', 'PAIN_ASSESSMENT', 'MOBILITY_ASSESSMENT', 'MUSCLE_STRENGTH', 'FUNCTIONAL_ASSESSMENT', 'POSTURE_GAIT', 'FUNCTIONAL_TESTS', 'HOME_EXERCISES'];
  const fisioOptionals = ['ANTHROPOMETRY', 'BODY_COMPOSITION', 'PHYSICAL_ASSESSMENT', 'ADL_ASSESSMENT'];
  const fisioHiddens = ['ODONTO_SPECIFIC', 'AUDIOLOGY', 'AAC_COMMUNICATION', 'MEDICAL_BASE', 'MEDICAL_NEURO', 'MEDICAL_VITAL_SIGNS'];
  fisioDefaults.forEach(c => insertProfCap.run('prof-fisioterapeuta', c, 'DEFAULT'));
  fisioOptionals.forEach(c => insertProfCap.run('prof-fisioterapeuta', c, 'OPTIONAL'));
  fisioHiddens.forEach(c => insertProfCap.run('prof-fisioterapeuta', c, 'HIDDEN'));

  // 2. Fonoaudiologia
  const fonoDefaults = ['CORE_SCHEDULE', 'CORE_PATIENTS', 'CORE_RECORDS', 'CORE_DOCUMENTS', 'CORE_AI', 'CORE_TIMELINE', 'COMMUNICATION_ASSESSMENT', 'FONO_SPECIFIC', 'AUDIOLOGY', 'AAC_COMMUNICATION'];
  const fonoOptionals = ['LEARNING_ASSESSMENT', 'BODY_MAP', 'BEHAVIOR_ASSESSMENT', 'ADL_ASSESSMENT'];
  const fonoHiddens = ['ODONTO_SPECIFIC', 'TRAINING_PRESCRIBE', 'BODY_COMPOSITION', 'MEDICAL_BASE'];
  fonoDefaults.forEach(c => insertProfCap.run('prof-fonoaudiologo', c, 'DEFAULT'));
  fonoOptionals.forEach(c => insertProfCap.run('prof-fonoaudiologo', c, 'OPTIONAL'));
  fonoHiddens.forEach(c => insertProfCap.run('prof-fonoaudiologo', c, 'HIDDEN'));

  // 3. Terapia Ocupacional
  const toDefaults = ['CORE_SCHEDULE', 'CORE_PATIENTS', 'CORE_RECORDS', 'CORE_DOCUMENTS', 'CORE_AI', 'CORE_TIMELINE', 'ADL_ASSESSMENT', 'OCCUPATIONAL_PART', 'FUNCTIONAL_ASSESSMENT', 'SENSORY_ASSESSMENT'];
  const toOptionals = ['BODY_MAP', 'BEHAVIOR_ASSESSMENT', 'MOBILITY_ASSESSMENT', 'MUSCLE_STRENGTH', 'COMMUNICATION_ASSESSMENT', 'AAC_COMMUNICATION', 'ANTHROPOMETRY'];
  const toHiddens = ['ODONTO_SPECIFIC', 'TRAINING_PRESCRIBE', 'NUTRITION_SPECIFIC', 'MEDICAL_BASE'];
  toDefaults.forEach(c => insertProfCap.run('prof-terapeuta-ocupacional', c, 'DEFAULT'));
  toOptionals.forEach(c => insertProfCap.run('prof-terapeuta-ocupacional', c, 'OPTIONAL'));
  toHiddens.forEach(c => insertProfCap.run('prof-terapeuta-ocupacional', c, 'HIDDEN'));

  // 4. Psicologia
  const psicoDefaults = ['CORE_SCHEDULE', 'CORE_PATIENTS', 'CORE_RECORDS', 'CORE_DOCUMENTS', 'CORE_AI', 'CORE_TIMELINE', 'BEHAVIOR_ASSESSMENT'];
  const psicoOptionals = ['LEARNING_ASSESSMENT', 'SENSORY_ASSESSMENT', 'ADL_ASSESSMENT'];
  const psicoHiddens = ['ODONTO_SPECIFIC', 'TRAINING_PRESCRIBE', 'NUTRITION_SPECIFIC', 'BODY_MAP', 'BODY_COMPOSITION', 'MOBILITY_ASSESSMENT', 'MEDICAL_BASE'];
  psicoDefaults.forEach(c => insertProfCap.run('prof-psicologo', c, 'DEFAULT'));
  psicoOptionals.forEach(c => insertProfCap.run('prof-psicologo', c, 'OPTIONAL'));
  psicoHiddens.forEach(c => insertProfCap.run('prof-psicologo', c, 'HIDDEN'));

  // 5. Psicopedagogia
  const ppDefaults = ['CORE_SCHEDULE', 'CORE_PATIENTS', 'CORE_RECORDS', 'CORE_DOCUMENTS', 'CORE_AI', 'CORE_TIMELINE', 'LEARNING_ASSESSMENT'];
  const ppOptionals = ['COMMUNICATION_ASSESSMENT', 'BEHAVIOR_ASSESSMENT', 'SENSORY_ASSESSMENT'];
  const ppHiddens = ['ODONTO_SPECIFIC', 'TRAINING_PRESCRIBE', 'NUTRITION_SPECIFIC', 'BODY_MAP', 'BODY_COMPOSITION', 'MEDICAL_BASE'];
  ppDefaults.forEach(c => insertProfCap.run('prof-psicopedagogo', c, 'DEFAULT'));
  ppOptionals.forEach(c => insertProfCap.run('prof-psicopedagogo', c, 'OPTIONAL'));
  ppHiddens.forEach(c => insertProfCap.run('prof-psicopedagogo', c, 'HIDDEN'));

  // 6. Nutrição
  const nutriDefaults = ['CORE_SCHEDULE', 'CORE_PATIENTS', 'CORE_RECORDS', 'CORE_DOCUMENTS', 'CORE_AI', 'CORE_TIMELINE', 'NUTRITION_SPECIFIC', 'ANTHROPOMETRY', 'BODY_COMPOSITION'];
  const nutriOptionals = ['BODY_MAP', 'BEHAVIOR_ASSESSMENT', 'PHYSICAL_ASSESSMENT'];
  const nutriHiddens = ['ODONTO_SPECIFIC', 'AUDIOLOGY', 'AAC_COMMUNICATION', 'MEDICAL_BASE'];
  nutriDefaults.forEach(c => insertProfCap.run('prof-nutricionista', c, 'DEFAULT'));
  nutriOptionals.forEach(c => insertProfCap.run('prof-nutricionista', c, 'OPTIONAL'));
  nutriHiddens.forEach(c => insertProfCap.run('prof-nutricionista', c, 'HIDDEN'));

  // 7. Personal Trainer
  const personalDefaults = ['CORE_SCHEDULE', 'CORE_PATIENTS', 'CORE_RECORDS', 'CORE_DOCUMENTS', 'CORE_AI', 'CORE_TIMELINE', 'TRAINING_PRESCRIBE', 'PHYSICAL_ASSESSMENT', 'ANTHROPOMETRY', 'BODY_COMPOSITION', 'BODY_MAP'];
  const personalOptionals = ['POSTURE_GAIT', 'MOBILITY_ASSESSMENT', 'MUSCLE_STRENGTH'];
  const personalHiddens = ['ODONTO_SPECIFIC', 'AUDIOLOGY', 'AAC_COMMUNICATION', 'MEDICAL_BASE', 'CORE_PRESCRIPTIONS'];
  personalDefaults.forEach(c => insertProfCap.run('prof-personal-trainer', c, 'DEFAULT'));
  personalOptionals.forEach(c => insertProfCap.run('prof-personal-trainer', c, 'OPTIONAL'));
  personalHiddens.forEach(c => insertProfCap.run('prof-personal-trainer', c, 'HIDDEN'));

  // 8. Odontologia
  const odontoDefaults = ['CORE_SCHEDULE', 'CORE_PATIENTS', 'CORE_RECORDS', 'CORE_DOCUMENTS', 'CORE_PRESCRIPTIONS', 'CORE_AI', 'CORE_TIMELINE', 'ODONTO_SPECIFIC'];
  const odontoOptionals = ['BODY_MAP', 'PAIN_ASSESSMENT', 'ANTHROPOMETRY'];
  const odontoHiddens = ['TRAINING_PRESCRIBE', 'AUDIOLOGY', 'PHYSICAL_ASSESSMENT', 'LEARNING_ASSESSMENT'];
  odontoDefaults.forEach(c => insertProfCap.run('prof-dentista', c, 'DEFAULT'));
  odontoOptionals.forEach(c => insertProfCap.run('prof-dentista', c, 'OPTIONAL'));
  odontoHiddens.forEach(c => insertProfCap.run('prof-dentista', c, 'HIDDEN'));

  // 9. Medicina (prof-medico)
  const medDefaults = ['CORE_SCHEDULE', 'CORE_PATIENTS', 'CORE_RECORDS', 'CORE_DOCUMENTS', 'CORE_PRESCRIPTIONS', 'CORE_EXAM_REQUEST', 'CORE_EXAMS_RECEIVED', 'CORE_REFERRALS', 'CORE_AI', 'CORE_TIMELINE', 'MEDICAL_BASE', 'MEDICAL_VITAL_SIGNS', 'MEDICAL_PHYSICAL_EXAM', 'MEDICAL_SOAP', 'MEDICAL_CID', 'CLINICAL_SCALES'];
  const medOptionals = ['BODY_MAP', 'ANTHROPOMETRY', 'BODY_COMPOSITION', 'FUNCTIONAL_ASSESSMENT', 'MOBILITY_ASSESSMENT', 'ADL_ASSESSMENT', 'BEHAVIOR_ASSESSMENT', 'COMMUNICATION_ASSESSMENT'];
  const medHiddens = ['ODONTO_SPECIFIC', 'TRAINING_PRESCRIBE'];
  medDefaults.forEach(c => insertProfCap.run('prof-medico', c, 'DEFAULT'));
  medOptionals.forEach(c => insertProfCap.run('prof-medico', c, 'OPTIONAL'));
  medHiddens.forEach(c => insertProfCap.run('prof-medico', c, 'HIDDEN'));

  // 10. Administrador da Clínica (Acesso operacional/administrativo geral)
  const adminDefaults = ['CORE_SCHEDULE', 'CORE_PATIENTS', 'CORE_TIMELINE'];
  const adminOptionals: string[] = [];
  const adminHiddens = ['MEDICAL_BASE', 'ODONTO_SPECIFIC', 'FONO_SPECIFIC', 'NUTRITION_SPECIFIC', 'TRAINING_PRESCRIBE'];
  adminDefaults.forEach(c => insertProfCap.run('prof-administrador', c, 'DEFAULT'));
  adminOptionals.forEach(c => insertProfCap.run('prof-administrador', c, 'OPTIONAL'));
  adminHiddens.forEach(c => insertProfCap.run('prof-administrador', c, 'HIDDEN'));

  // 11. Enfermagem
  const enfDefaults = ['CORE_SCHEDULE', 'CORE_PATIENTS', 'CORE_RECORDS', 'CORE_DOCUMENTS', 'CORE_AI', 'CORE_TIMELINE', 'CLINICAL_EVOLUTION', 'MEDICAL_VITAL_SIGNS', 'BODY_MAP', 'PHOTO_MONITORING'];
  const enfOptionals = ['THERAPEUTIC_GOALS', 'PAIN_ASSESSMENT', 'CORE_PRESCRIPTIONS', 'CORE_EXAM_REQUEST', 'CORE_EXAMS_RECEIVED', 'CORE_REFERRALS', 'ADL_ASSESSMENT', 'ANTHROPOMETRY', 'GESTATIONAL_FOLLOWUP'];
  const enfHiddens = ['ODONTO_SPECIFIC', 'FONO_SPECIFIC', 'AUDIOLOGY', 'TRAINING_PRESCRIBE', 'NUTRITION_SPECIFIC', 'MEDICAL_NEURO'];
  enfDefaults.forEach(c => insertProfCap.run('prof-enfermeiro', c, 'DEFAULT'));
  enfOptionals.forEach(c => insertProfCap.run('prof-enfermeiro', c, 'OPTIONAL'));
  enfHiddens.forEach(c => insertProfCap.run('prof-enfermeiro', c, 'HIDDEN'));

  // 12. Técnico de Enfermagem
  const tecEnfDefaults = ['CORE_SCHEDULE', 'CORE_PATIENTS', 'CORE_RECORDS', 'CORE_DOCUMENTS', 'CORE_TIMELINE', 'CLINICAL_EVOLUTION', 'MEDICAL_VITAL_SIGNS', 'PHOTO_MONITORING'];
  const tecEnfOptionals = ['BODY_MAP', 'PAIN_ASSESSMENT', 'CORE_AI', 'ADL_ASSESSMENT'];
  const tecEnfHiddens = ['ODONTO_SPECIFIC', 'FONO_SPECIFIC', 'AUDIOLOGY', 'TRAINING_PRESCRIBE', 'NUTRITION_SPECIFIC', 'CORE_PRESCRIPTIONS', 'MEDICAL_BASE', 'MEDICAL_NEURO'];
  tecEnfDefaults.forEach(c => insertProfCap.run('prof-tec-enfermagem', c, 'DEFAULT'));
  tecEnfOptionals.forEach(c => insertProfCap.run('prof-tec-enfermagem', c, 'OPTIONAL'));
  tecEnfHiddens.forEach(c => insertProfCap.run('prof-tec-enfermagem', c, 'HIDDEN'));

  // 13. Biomedicina
  const biomedDefaults = ['CORE_SCHEDULE', 'CORE_PATIENTS', 'CORE_RECORDS', 'CORE_DOCUMENTS', 'CORE_TIMELINE', 'CORE_AI', 'CLINICAL_EVOLUTION', 'PHOTO_MONITORING'];
  const biomedOptionals = ['BODY_MAP', 'ANTHROPOMETRY', 'CORE_EXAM_REQUEST', 'CORE_EXAMS_RECEIVED', 'THERAPEUTIC_GOALS', 'MEDICAL_VITAL_SIGNS'];
  const biomedHiddens = ['ODONTO_SPECIFIC', 'FONO_SPECIFIC', 'AUDIOLOGY', 'TRAINING_PRESCRIBE', 'NUTRITION_SPECIFIC', 'MEDICAL_NEURO'];
  biomedDefaults.forEach(c => insertProfCap.run('prof-biomedicina', c, 'DEFAULT'));
  biomedOptionals.forEach(c => insertProfCap.run('prof-biomedicina', c, 'OPTIONAL'));
  biomedHiddens.forEach(c => insertProfCap.run('prof-biomedicina', c, 'HIDDEN'));

  // 14. Farmácia
  const farmDefaults = ['CORE_SCHEDULE', 'CORE_PATIENTS', 'CORE_RECORDS', 'CORE_DOCUMENTS', 'CORE_TIMELINE', 'CORE_AI', 'CLINICAL_EVOLUTION', 'CORE_PRESCRIPTIONS'];
  const farmOptionals = ['MEDICAL_VITAL_SIGNS', 'ANTHROPOMETRY', 'THERAPEUTIC_GOALS', 'CORE_EXAMS_RECEIVED', 'CORE_REFERRALS', 'PHOTO_MONITORING'];
  const farmHiddens = ['ODONTO_SPECIFIC', 'FONO_SPECIFIC', 'AUDIOLOGY', 'TRAINING_PRESCRIBE', 'NUTRITION_SPECIFIC', 'MEDICAL_NEURO'];
  farmDefaults.forEach(c => insertProfCap.run('prof-farmacia', c, 'DEFAULT'));
  farmOptionals.forEach(c => insertProfCap.run('prof-farmacia', c, 'OPTIONAL'));
  farmHiddens.forEach(c => insertProfCap.run('prof-farmacia', c, 'HIDDEN'));

  // 15. Serviço Social
  const ssDefaults = ['CORE_SCHEDULE', 'CORE_PATIENTS', 'CORE_RECORDS', 'CORE_DOCUMENTS', 'CORE_TIMELINE', 'CORE_AI', 'CLINICAL_EVOLUTION', 'THERAPEUTIC_GOALS', 'CORE_REFERRALS'];
  const ssOptionals = ['ADL_ASSESSMENT', 'OCCUPATIONAL_PART', 'BEHAVIOR_ASSESSMENT'];
  const ssHiddens = ['ODONTO_SPECIFIC', 'FONO_SPECIFIC', 'AUDIOLOGY', 'TRAINING_PRESCRIBE', 'NUTRITION_SPECIFIC', 'BODY_MAP', 'MEDICAL_BASE', 'MEDICAL_NEURO', 'MEDICAL_VITAL_SIGNS'];
  ssDefaults.forEach(c => insertProfCap.run('prof-servico-social', c, 'DEFAULT'));
  ssOptionals.forEach(c => insertProfCap.run('prof-servico-social', c, 'OPTIONAL'));
  ssHiddens.forEach(c => insertProfCap.run('prof-servico-social', c, 'HIDDEN'));

  // 16. Musicoterapia
  const musicoDefaults = ['CORE_SCHEDULE', 'CORE_PATIENTS', 'CORE_RECORDS', 'CORE_DOCUMENTS', 'CORE_TIMELINE', 'CORE_AI', 'CLINICAL_EVOLUTION', 'THERAPEUTIC_GOALS', 'BEHAVIOR_ASSESSMENT'];
  const musicoOptionals = ['COMMUNICATION_ASSESSMENT', 'SENSORY_ASSESSMENT', 'LEARNING_ASSESSMENT', 'FUNCTIONAL_ASSESSMENT'];
  const musicoHiddens = ['ODONTO_SPECIFIC', 'FONO_SPECIFIC', 'AUDIOLOGY', 'TRAINING_PRESCRIBE', 'NUTRITION_SPECIFIC', 'MEDICAL_BASE', 'MEDICAL_NEURO', 'BODY_COMPOSITION'];
  musicoDefaults.forEach(c => insertProfCap.run('prof-musicoterapia', c, 'DEFAULT'));
  musicoOptionals.forEach(c => insertProfCap.run('prof-musicoterapia', c, 'OPTIONAL'));
  musicoHiddens.forEach(c => insertProfCap.run('prof-musicoterapia', c, 'HIDDEN'));

  // 17. Arteterapia
  const arteDefaults = ['CORE_SCHEDULE', 'CORE_PATIENTS', 'CORE_RECORDS', 'CORE_DOCUMENTS', 'CORE_TIMELINE', 'CORE_AI', 'CLINICAL_EVOLUTION', 'THERAPEUTIC_GOALS', 'BEHAVIOR_ASSESSMENT'];
  const arteOptionals = ['PHOTO_MONITORING', 'SENSORY_ASSESSMENT', 'COMMUNICATION_ASSESSMENT', 'LEARNING_ASSESSMENT'];
  const arteHiddens = ['ODONTO_SPECIFIC', 'FONO_SPECIFIC', 'AUDIOLOGY', 'TRAINING_PRESCRIBE', 'NUTRITION_SPECIFIC', 'MEDICAL_BASE', 'MEDICAL_NEURO', 'BODY_COMPOSITION'];
  arteDefaults.forEach(c => insertProfCap.run('prof-arteterapia', c, 'DEFAULT'));
  arteOptionals.forEach(c => insertProfCap.run('prof-arteterapia', c, 'OPTIONAL'));
  arteHiddens.forEach(c => insertProfCap.run('prof-arteterapia', c, 'HIDDEN'));

  // 18. Podologia
  const podoDefaults = ['CORE_SCHEDULE', 'CORE_PATIENTS', 'CORE_RECORDS', 'CORE_DOCUMENTS', 'CORE_TIMELINE', 'CORE_AI', 'CLINICAL_EVOLUTION', 'BODY_MAP', 'PHOTO_MONITORING', 'PAIN_ASSESSMENT'];
  const podoOptionals = ['THERAPEUTIC_GOALS', 'POSTURE_GAIT', 'MOBILITY_ASSESSMENT', 'MEDICAL_VITAL_SIGNS'];
  const podoHiddens = ['ODONTO_SPECIFIC', 'FONO_SPECIFIC', 'AUDIOLOGY', 'TRAINING_PRESCRIBE', 'NUTRITION_SPECIFIC', 'MEDICAL_BASE', 'MEDICAL_NEURO', 'LEARNING_ASSESSMENT'];
  podoDefaults.forEach(c => insertProfCap.run('prof-podologia', c, 'DEFAULT'));
  podoOptionals.forEach(c => insertProfCap.run('prof-podologia', c, 'OPTIONAL'));
  podoHiddens.forEach(c => insertProfCap.run('prof-podologia', c, 'HIDDEN'));

  // 19. Acupuntura
  const acupDefaults = ['CORE_SCHEDULE', 'CORE_PATIENTS', 'CORE_RECORDS', 'CORE_DOCUMENTS', 'CORE_TIMELINE', 'CORE_AI', 'CLINICAL_EVOLUTION', 'BODY_MAP', 'PAIN_ASSESSMENT'];
  const acupOptionals = ['THERAPEUTIC_GOALS', 'FUNCTIONAL_ASSESSMENT', 'MOBILITY_ASSESSMENT', 'BEHAVIOR_ASSESSMENT', 'POSTURE_GAIT'];
  const acupHiddens = ['ODONTO_SPECIFIC', 'FONO_SPECIFIC', 'AUDIOLOGY', 'TRAINING_PRESCRIBE', 'NUTRITION_SPECIFIC', 'MEDICAL_BASE', 'MEDICAL_NEURO'];
  acupDefaults.forEach(c => insertProfCap.run('prof-acupuntura', c, 'DEFAULT'));
  acupOptionals.forEach(c => insertProfCap.run('prof-acupuntura', c, 'OPTIONAL'));
  acupHiddens.forEach(c => insertProfCap.run('prof-acupuntura', c, 'HIDDEN'));

  // 20. Estética
  const estetDefaults = ['CORE_SCHEDULE', 'CORE_PATIENTS', 'CORE_RECORDS', 'CORE_DOCUMENTS', 'CORE_TIMELINE', 'CORE_AI', 'CLINICAL_EVOLUTION', 'PHOTO_MONITORING', 'BODY_MAP'];
  const estetOptionals = ['ANTHROPOMETRY', 'BODY_COMPOSITION', 'THERAPEUTIC_GOALS'];
  const estetHiddens = ['ODONTO_SPECIFIC', 'FONO_SPECIFIC', 'AUDIOLOGY', 'TRAINING_PRESCRIBE', 'NUTRITION_SPECIFIC', 'MEDICAL_BASE', 'MEDICAL_NEURO'];
  estetDefaults.forEach(c => insertProfCap.run('prof-esteticista', c, 'DEFAULT'));
  estetOptionals.forEach(c => insertProfCap.run('prof-esteticista', c, 'OPTIONAL'));
  estetHiddens.forEach(c => insertProfCap.run('prof-esteticista', c, 'HIDDEN'));

  // 21. Doula / Consultora de Amamentação
  const doulaDefaults = ['CORE_SCHEDULE', 'CORE_PATIENTS', 'CORE_RECORDS', 'CORE_DOCUMENTS', 'CORE_TIMELINE', 'CORE_AI', 'CLINICAL_EVOLUTION', 'GESTATIONAL_FOLLOWUP', 'THERAPEUTIC_GOALS'];
  const doulaOptionals = ['PAIN_ASSESSMENT', 'BODY_MAP', 'PHOTO_MONITORING', 'BEHAVIOR_ASSESSMENT'];
  const doulaHiddens = ['ODONTO_SPECIFIC', 'FONO_SPECIFIC', 'AUDIOLOGY', 'TRAINING_PRESCRIBE', 'NUTRITION_SPECIFIC', 'MEDICAL_BASE', 'MEDICAL_NEURO'];
  doulaDefaults.forEach(c => insertProfCap.run('prof-doula', c, 'DEFAULT'));
  doulaOptionals.forEach(c => insertProfCap.run('prof-doula', c, 'OPTIONAL'));
  doulaHiddens.forEach(c => insertProfCap.run('prof-doula', c, 'HIDDEN'));

  // 22. Instrutor de Pilates
  const pilatesDefaults = ['CORE_SCHEDULE', 'CORE_PATIENTS', 'CORE_RECORDS', 'CORE_DOCUMENTS', 'CORE_TIMELINE', 'CORE_AI', 'CLINICAL_EVOLUTION', 'POSTURE_GAIT', 'MOBILITY_ASSESSMENT', 'FUNCTIONAL_ASSESSMENT'];
  const pilatesOptionals = ['PAIN_ASSESSMENT', 'MUSCLE_STRENGTH', 'BODY_MAP', 'ANTHROPOMETRY', 'TRAINING_PRESCRIBE', 'THERAPEUTIC_GOALS'];
  const pilatesHiddens = ['ODONTO_SPECIFIC', 'FONO_SPECIFIC', 'AUDIOLOGY', 'NUTRITION_SPECIFIC', 'MEDICAL_BASE', 'MEDICAL_NEURO'];
  pilatesDefaults.forEach(c => insertProfCap.run('prof-instrutor-pilates', c, 'DEFAULT'));
  pilatesOptionals.forEach(c => insertProfCap.run('prof-instrutor-pilates', c, 'OPTIONAL'));
  pilatesHiddens.forEach(c => insertProfCap.run('prof-instrutor-pilates', c, 'HIDDEN'));

  // 23. Outro Profissional da Saúde
  const outroDefaults = ['CORE_SCHEDULE', 'CORE_PATIENTS', 'CORE_RECORDS', 'CORE_DOCUMENTS', 'CORE_TIMELINE', 'CORE_AI', 'CLINICAL_EVOLUTION', 'THERAPEUTIC_GOALS'];
  const outroOptionals = ['BODY_MAP', 'PAIN_ASSESSMENT', 'FUNCTIONAL_ASSESSMENT', 'PHOTO_MONITORING', 'BEHAVIOR_ASSESSMENT', 'POSTURE_GAIT', 'ANTHROPOMETRY'];
  const outroHiddens = ['ODONTO_SPECIFIC', 'FONO_SPECIFIC', 'AUDIOLOGY', 'TRAINING_PRESCRIBE', 'MEDICAL_BASE', 'MEDICAL_NEURO'];
  outroDefaults.forEach(c => insertProfCap.run('prof-outro-saude', c, 'DEFAULT'));
  outroOptionals.forEach(c => insertProfCap.run('prof-outro-saude', c, 'OPTIONAL'));
  outroHiddens.forEach(c => insertProfCap.run('prof-outro-saude', c, 'HIDDEN'));

  // Regras por área de atuação / especialidade (Presets por Practice Area):
  const insertAreaCapRaw = rawDb.prepare(`
    INSERT OR IGNORE INTO practice_area_capabilities (practice_area_id, capability_id, rule)
    VALUES (?, ?, ?)
  `);

  let existingAreaIds = new Set<string>();
  try {
    existingAreaIds = new Set(
      rawDb.prepare('SELECT id FROM practice_areas').all().map((r: any) => r.id)
    );
  } catch (_) {}

  const insertAreaCap = {
    run: (areaId: string, capId: string, rule: string) => {
      if (existingAreaIds.has(areaId)) {
        insertAreaCapRaw.run(areaId, capId, rule);
      }
    }
  };

  // Presets - Fisioterapia
  ['BODY_MAP', 'PAIN_ASSESSMENT', 'MOBILITY_ASSESSMENT', 'MUSCLE_STRENGTH', 'FUNCTIONAL_TESTS', 'HOME_EXERCISES'].forEach(c => insertAreaCap.run('pa-fisio-traumato', c, 'DEFAULT'));
  ['FUNCTIONAL_ASSESSMENT', 'POSTURE_GAIT', 'MOBILITY_ASSESSMENT', 'MUSCLE_STRENGTH', 'ADL_ASSESSMENT'].forEach(c => insertAreaCap.run('pa-fisio-neuro', c, 'DEFAULT'));
  ['FUNCTIONAL_TESTS', 'MOBILITY_ASSESSMENT', 'MUSCLE_STRENGTH', 'BODY_MAP', 'PAIN_ASSESSMENT'].forEach(c => insertAreaCap.run('pa-fisio-esportiva', c, 'DEFAULT'));
  ['ANTHROPOMETRY', 'BODY_COMPOSITION'].forEach(c => insertAreaCap.run('pa-fisio-esportiva', c, 'OPTIONAL'));
  ['FUNCTIONAL_ASSESSMENT', 'PAIN_ASSESSMENT'].forEach(c => insertAreaCap.run('pa-fisio-respiratoria', c, 'DEFAULT'));
  ['FUNCTIONAL_ASSESSMENT', 'PHYSICAL_ASSESSMENT'].forEach(c => insertAreaCap.run('pa-fisio-cardio', c, 'DEFAULT'));
  ['FUNCTIONAL_ASSESSMENT', 'POSTURE_GAIT', 'ADL_ASSESSMENT'].forEach(c => insertAreaCap.run('pa-fisio-pediatrica', c, 'DEFAULT'));
  ['FUNCTIONAL_ASSESSMENT', 'POSTURE_GAIT', 'ADL_ASSESSMENT', 'PAIN_ASSESSMENT', 'MOBILITY_ASSESSMENT'].forEach(c => insertAreaCap.run('pa-fisio-geronto', c, 'DEFAULT'));
  ['BODY_MAP', 'PAIN_ASSESSMENT', 'FUNCTIONAL_ASSESSMENT'].forEach(c => insertAreaCap.run('pa-fisio-mulher', c, 'DEFAULT'));
  ['BODY_MAP', 'ANTHROPOMETRY'].forEach(c => insertAreaCap.run('pa-fisio-dermato', c, 'DEFAULT'));
  ['BODY_MAP', 'PAIN_ASSESSMENT', 'MOBILITY_ASSESSMENT', 'POSTURE_GAIT'].forEach(c => {
    insertAreaCap.run('pa-fisio-quiro', c, 'DEFAULT');
    insertAreaCap.run('pa-fisio-osteo', c, 'DEFAULT');
  });

  // Presets - Fonoaudiologia
  ['COMMUNICATION_ASSESSMENT', 'FONO_SPECIFIC'].forEach(c => {
    insertAreaCap.run('pa-fono-linguagem', c, 'DEFAULT');
    insertAreaCap.run('pa-fono-ling-infantil', c, 'DEFAULT');
  });
  ['LEARNING_ASSESSMENT'].forEach(c => insertAreaCap.run('pa-fono-linguagem', c, 'OPTIONAL'));
  ['AUDIOLOGY'].forEach(c => insertAreaCap.run('pa-fono-audio', c, 'DEFAULT'));
  ['FONO_SPECIFIC', 'COMMUNICATION_ASSESSMENT'].forEach(c => {
    insertAreaCap.run('pa-fono-mo', c, 'DEFAULT');
    insertAreaCap.run('pa-fono-voz', c, 'DEFAULT');
    insertAreaCap.run('pa-fono-fluencia', c, 'DEFAULT');
  });
  ['FONO_SPECIFIC', 'ADL_ASSESSMENT'].forEach(c => insertAreaCap.run('pa-fono-disfagia', c, 'DEFAULT'));
  ['COMMUNICATION_ASSESSMENT', 'AAC_COMMUNICATION', 'BEHAVIOR_ASSESSMENT', 'FONO_SPECIFIC'].forEach(c => {
    insertAreaCap.run('pa-fono-tea', c, 'DEFAULT');
    insertAreaCap.run('pa-fono-aba', c, 'DEFAULT');
  });
  ['AAC_COMMUNICATION', 'COMMUNICATION_ASSESSMENT'].forEach(c => insertAreaCap.run('pa-fono-comunicacao', c, 'DEFAULT'));
  ['LEARNING_ASSESSMENT', 'COMMUNICATION_ASSESSMENT'].forEach(c => insertAreaCap.run('pa-fono-aprendizagem', c, 'DEFAULT'));

  // Presets - Terapia Ocupacional
  ['SENSORY_ASSESSMENT', 'ADL_ASSESSMENT', 'OCCUPATIONAL_PART'].forEach(c => {
    insertAreaCap.run('pa-to-integ-sensorial', c, 'DEFAULT');
    insertAreaCap.run('pa-to-estimulacao', c, 'DEFAULT');
  });
  ['ADL_ASSESSMENT', 'OCCUPATIONAL_PART', 'FUNCTIONAL_ASSESSMENT'].forEach(c => insertAreaCap.run('pa-to-avd', c, 'DEFAULT'));
  ['ADL_ASSESSMENT', 'OCCUPATIONAL_PART', 'SENSORY_ASSESSMENT'].forEach(c => insertAreaCap.run('pa-to-pediatria', c, 'DEFAULT'));
  ['BEHAVIOR_ASSESSMENT'].forEach(c => insertAreaCap.run('pa-to-pediatria', c, 'OPTIONAL'));
  ['ADL_ASSESSMENT', 'OCCUPATIONAL_PART', 'FUNCTIONAL_ASSESSMENT', 'MOBILITY_ASSESSMENT', 'MUSCLE_STRENGTH'].forEach(c => {
    insertAreaCap.run('pa-to-neuro', c, 'DEFAULT');
    insertAreaCap.run('pa-to-reab-fisica', c, 'DEFAULT');
  });
  ['ADL_ASSESSMENT', 'OCCUPATIONAL_PART', 'FUNCTIONAL_ASSESSMENT', 'SENSORY_ASSESSMENT'].forEach(c => insertAreaCap.run('pa-to-geronto', c, 'DEFAULT'));
  ['OCCUPATIONAL_PART', 'ADL_ASSESSMENT', 'BEHAVIOR_ASSESSMENT'].forEach(c => insertAreaCap.run('pa-to-mental', c, 'DEFAULT'));
  ['OCCUPATIONAL_PART', 'ADL_ASSESSMENT', 'AAC_COMMUNICATION'].forEach(c => insertAreaCap.run('pa-to-tec-assistiva', c, 'DEFAULT'));
  ['BEHAVIOR_ASSESSMENT', 'ADL_ASSESSMENT', 'OCCUPATIONAL_PART'].forEach(c => insertAreaCap.run('pa-to-aba', c, 'DEFAULT'));

  // Presets - Psicologia
  ['BEHAVIOR_ASSESSMENT'].forEach(c => {
    insertAreaCap.run('pa-psico-clinica', c, 'DEFAULT');
    insertAreaCap.run('pa-psico-tcc', c, 'DEFAULT');
    insertAreaCap.run('pa-psico-psicanalise', c, 'DEFAULT');
    insertAreaCap.run('pa-psico-aba', c, 'DEFAULT');
    insertAreaCap.run('pa-psico-familia', c, 'DEFAULT');
    insertAreaCap.run('pa-psico-infantil', c, 'DEFAULT');
    insertAreaCap.run('pa-psico-adolescente', c, 'DEFAULT');
    insertAreaCap.run('pa-psico-adulto', c, 'DEFAULT');
    insertAreaCap.run('pa-psico-hospitalar', c, 'DEFAULT');
  });
  ['LEARNING_ASSESSMENT'].forEach(c => insertAreaCap.run('pa-psico-neuro', c, 'DEFAULT'));
  ['BEHAVIOR_ASSESSMENT'].forEach(c => insertAreaCap.run('pa-psico-neuro', c, 'DEFAULT'));
  ['LEARNING_ASSESSMENT'].forEach(c => insertAreaCap.run('pa-psico-infantil', c, 'OPTIONAL'));

  // Presets - Psicopedagogia
  ['LEARNING_ASSESSMENT'].forEach(c => {
    insertAreaCap.run('pa-pp-clinica', c, 'DEFAULT');
    insertAreaCap.run('pa-pp-escolar', c, 'DEFAULT');
    insertAreaCap.run('pa-pp-aprendizagem', c, 'DEFAULT');
    insertAreaCap.run('pa-pp-leitura-escrita', c, 'DEFAULT');
    insertAreaCap.run('pa-pp-matematica', c, 'DEFAULT');
    insertAreaCap.run('pa-pp-funcoes-exec', c, 'DEFAULT');
    insertAreaCap.run('pa-pp-atencao-memoria', c, 'DEFAULT');
    insertAreaCap.run('pa-pp-desenvolvimento', c, 'DEFAULT');
  });
  ['BEHAVIOR_ASSESSMENT'].forEach(c => {
    insertAreaCap.run('pa-pp-funcoes-exec', c, 'OPTIONAL');
    insertAreaCap.run('pa-pp-atencao-memoria', c, 'OPTIONAL');
  });

  // Presets - Nutrição
  ['NUTRITION_SPECIFIC', 'ANTHROPOMETRY', 'BODY_COMPOSITION'].forEach(c => {
    insertAreaCap.run('pa-nutri-clinica', c, 'DEFAULT');
    insertAreaCap.run('pa-nutri-esportiva', c, 'DEFAULT');
  });
  ['PHYSICAL_ASSESSMENT'].forEach(c => insertAreaCap.run('pa-nutri-esportiva', c, 'OPTIONAL'));
  ['NUTRITION_SPECIFIC', 'ANTHROPOMETRY'].forEach(c => {
    insertAreaCap.run('pa-nutri-materno', c, 'DEFAULT');
    insertAreaCap.run('pa-nutri-mulher', c, 'DEFAULT');
    insertAreaCap.run('pa-nutri-geronto', c, 'DEFAULT');
  });
  ['NUTRITION_SPECIFIC', 'BEHAVIOR_ASSESSMENT'].forEach(c => insertAreaCap.run('pa-nutri-comportamental', c, 'DEFAULT'));

  // Presets - Personal Trainer
  ['TRAINING_PRESCRIBE', 'PHYSICAL_ASSESSMENT', 'ANTHROPOMETRY', 'BODY_COMPOSITION'].forEach(c => {
    insertAreaCap.run('pa-personal-musculacao', c, 'DEFAULT');
    insertAreaCap.run('pa-personal-funcional', c, 'DEFAULT');
    insertAreaCap.run('pa-personal-condicionamento', c, 'DEFAULT');
  });
  ['MOBILITY_ASSESSMENT', 'POSTURE_GAIT'].forEach(c => {
    insertAreaCap.run('pa-personal-funcional', c, 'OPTIONAL');
    insertAreaCap.run('pa-personal-musculacao', c, 'OPTIONAL');
  });
  ['TRAINING_PRESCRIBE', 'PHYSICAL_ASSESSMENT', 'FUNCTIONAL_ASSESSMENT', 'MOBILITY_ASSESSMENT'].forEach(c => {
    insertAreaCap.run('pa-personal-idosos', c, 'DEFAULT');
  });
  ['TRAINING_PRESCRIBE', 'PHYSICAL_ASSESSMENT', 'BODY_COMPOSITION', 'FUNCTIONAL_TESTS'].forEach(c => {
    insertAreaCap.run('pa-personal-esportivo', c, 'DEFAULT');
  });
  ['TRAINING_PRESCRIBE', 'PHYSICAL_ASSESSMENT', 'ANTHROPOMETRY'].forEach(c => {
    insertAreaCap.run('pa-personal-emagrecimento', c, 'DEFAULT');
    insertAreaCap.run('pa-personal-gestantes', c, 'DEFAULT');
  });

  // Presets - Odontologia
  ['pa-odonto-geral', 'pa-odonto-orto', 'pa-odonto-endo', 'pa-odonto-perio', 'pa-odonto-implante', 'pa-odonto-pediatria', 'pa-odonto-cirurgia', 'pa-odonto-protese', 'pa-odonto-estetica', 'pa-odonto-outro'].forEach(areaId => {
    insertAreaCap.run(areaId, 'ODONTO_SPECIFIC', 'DEFAULT');
  });

  // Presets - Medicina
  ['CORE_DOCUMENTS', 'CORE_PRESCRIPTIONS', 'CORE_EXAM_REQUEST', 'CORE_EXAMS_RECEIVED', 'MEDICAL_BASE', 'MEDICAL_VITAL_SIGNS', 'MEDICAL_PHYSICAL_EXAM'].forEach(c => {
    insertAreaCap.run('pa-med-clinica', c, 'DEFAULT');
  });
  ['MEDICAL_NEURO', 'BODY_MAP', 'FUNCTIONAL_ASSESSMENT', 'MUSCLE_STRENGTH', 'POSTURE_GAIT', 'MOBILITY_ASSESSMENT', 'FUNCTIONAL_TESTS', 'CLINICAL_SCALES'].forEach(c => {
    insertAreaCap.run('pa-med-neuro', c, 'DEFAULT');
  });
  ['ADL_ASSESSMENT', 'COMMUNICATION_ASSESSMENT', 'ANTHROPOMETRY'].forEach(c => {
    insertAreaCap.run('pa-med-neuro', c, 'OPTIONAL');
  });
  ['BEHAVIOR_ASSESSMENT', 'CLINICAL_SCALES'].forEach(c => {
    insertAreaCap.run('pa-med-psiquiatria', c, 'DEFAULT');
  });
  ['CORE_AI', 'LEARNING_ASSESSMENT'].forEach(c => {
    insertAreaCap.run('pa-med-psiquiatria', c, 'OPTIONAL');
  });
  ['ANTHROPOMETRY', 'CLINICAL_SCALES'].forEach(c => {
    insertAreaCap.run('pa-med-pediatria', c, 'DEFAULT');
  });
  ['LEARNING_ASSESSMENT', 'COMMUNICATION_ASSESSMENT', 'BODY_MAP'].forEach(c => {
    insertAreaCap.run('pa-med-pediatria', c, 'OPTIONAL');
  });
  ['ADL_ASSESSMENT', 'MOBILITY_ASSESSMENT', 'MUSCLE_STRENGTH', 'POSTURE_GAIT', 'PAIN_ASSESSMENT', 'CLINICAL_SCALES'].forEach(c => {
    insertAreaCap.run('pa-med-geriatria', c, 'DEFAULT');
  });
  ['BODY_MAP', 'PAIN_ASSESSMENT', 'MOBILITY_ASSESSMENT', 'MUSCLE_STRENGTH', 'FUNCTIONAL_TESTS'].forEach(c => {
    insertAreaCap.run('pa-med-ortopedia', c, 'DEFAULT');
  });
  ['MEDICAL_VITAL_SIGNS', 'ANTHROPOMETRY'].forEach(c => {
    insertAreaCap.run('pa-med-cardio', c, 'DEFAULT');
  });
  ['BODY_MAP'].forEach(c => {
    insertAreaCap.run('pa-med-dermato', c, 'DEFAULT');
  });
  ['ANTHROPOMETRY', 'BODY_COMPOSITION'].forEach(c => {
    insertAreaCap.run('pa-med-endocrino', c, 'DEFAULT');
  });
  ['PAIN_ASSESSMENT', 'MOBILITY_ASSESSMENT', 'BODY_MAP', 'FUNCTIONAL_ASSESSMENT'].forEach(c => {
    insertAreaCap.run('pa-med-reumato', c, 'DEFAULT');
  });
  ['CORE_DOCUMENTS', 'CORE_PRESCRIPTIONS', 'CORE_EXAM_REQUEST', 'CORE_EXAMS_RECEIVED', 'MEDICAL_BASE', 'MEDICAL_VITAL_SIGNS', 'MEDICAL_PHYSICAL_EXAM', 'ANTHROPOMETRY'].forEach(c => {
    insertAreaCap.run('pa-med-gineco', c, 'DEFAULT');
  });

  // Presets - HEALTH_SUPPORT
  ['PHOTO_MONITORING', 'BODY_MAP', 'PAIN_ASSESSMENT'].forEach(c => {
    insertAreaCap.run('pa-enf-estomaterapia', c, 'DEFAULT');
    insertAreaCap.run('pa-tecenf-curativos', c, 'DEFAULT');
    insertAreaCap.run('pa-podo-diabetico', c, 'DEFAULT');
  });
  ['GESTATIONAL_FOLLOWUP', 'MEDICAL_VITAL_SIGNS'].forEach(c => {
    insertAreaCap.run('pa-enf-materno-infantil', c, 'DEFAULT');
  });
  ['GESTATIONAL_FOLLOWUP'].forEach(c => {
    insertAreaCap.run('pa-doula-parto', c, 'DEFAULT');
    insertAreaCap.run('pa-doula-amamentacao', c, 'DEFAULT');
    insertAreaCap.run('pa-doula-puerperio', c, 'DEFAULT');
    insertAreaCap.run('pa-doula-educacao', c, 'DEFAULT');
    insertAreaCap.run('pa-pilates-gestantes', c, 'DEFAULT');
  });
  ['PHOTO_MONITORING', 'BODY_MAP'].forEach(c => {
    insertAreaCap.run('pa-biomed-estetica', c, 'DEFAULT');
    insertAreaCap.run('pa-farm-estetica', c, 'DEFAULT');
    insertAreaCap.run('pa-estet-facial', c, 'DEFAULT');
    insertAreaCap.run('pa-estet-corporal', c, 'DEFAULT');
    insertAreaCap.run('pa-estet-pos-operatorio', c, 'DEFAULT');
  });
  ['BODY_MAP', 'PAIN_ASSESSMENT'].forEach(c => {
    insertAreaCap.run('pa-acup-dor', c, 'DEFAULT');
    insertAreaCap.run('pa-biomed-acupuntura', c, 'DEFAULT');
  });
  ['POSTURE_GAIT', 'MOBILITY_ASSESSMENT', 'PAIN_ASSESSMENT'].forEach(c => {
    insertAreaCap.run('pa-pilates-reab', c, 'DEFAULT');
    insertAreaCap.run('pa-podo-esportiva', c, 'DEFAULT');
  });
  ['BEHAVIOR_ASSESSMENT', 'THERAPEUTIC_GOALS'].forEach(c => {
    insertAreaCap.run('pa-musico-saude-mental', c, 'DEFAULT');
    insertAreaCap.run('pa-arte-saude-mental', c, 'DEFAULT');
    insertAreaCap.run('pa-ss-saude-mental', c, 'DEFAULT');
    insertAreaCap.run('pa-enf-saude-mental', c, 'DEFAULT');
  });

  // Regras de Planos Comerciais (plan_capabilities)
  const insertPlanCapRaw = rawDb.prepare(`
    INSERT OR IGNORE INTO plan_capabilities (plan_id, capability_id)
    VALUES (?, ?)
  `);

  let existingPlanIds = new Set<string>();
  try {
    existingPlanIds = new Set(
      rawDb.prepare('SELECT id FROM plans').all().map((r: any) => r.id)
    );
  } catch (_) {}

  const insertPlanCap = {
    run: (planId: string, capId: string) => {
      if (existingPlanIds.has(planId)) {
        insertPlanCapRaw.run(planId, capId);
      }
    }
  };

  const allCaps = (rawDb.prepare('SELECT id FROM capabilities').all() as any[]).map(c => c.id);
  // No plano 'zemda-CLINIC' e 'plan-clinic', todas as capabilities estão disponíveis:
  for (const capId of allCaps) {
    insertPlanCap.run('zemda-CLINIC', capId);
    insertPlanCap.run('plan-clinic', capId);
    insertPlanCap.run('zemda-TEAM', capId);
    insertPlanCap.run('plan-pro', capId);
    insertPlanCap.run('zemda-SOLO', capId);
    insertPlanCap.run('plan-basic', capId);
  }
}

/**
 * Reconciliação segura para contas e profissionais existentes no banco.
 * Garante que aliases legados recebam a profissão canônica, módulo comercial e áreas de atuação.
 */
function reconcileLegacyProfessionsAndCapabilities(rawDb: DatabaseSync): void {
  try {
    // Assegura que especialidades médicas e odontológicas existam na tabela professions
    const detailedProfs = [
      { id: 'prof-neurologista', cat_id: 'cat-med', name: 'Neurologista', slug: 'neurologista', reg_label: 'CRM', reg_req: 1 },
      { id: 'prof-geriatra', cat_id: 'cat-med', name: 'Geriatra', slug: 'geriatra', reg_label: 'CRM', reg_req: 1 },
      { id: 'prof-endocrinologista', cat_id: 'cat-med', name: 'Endocrinologista', slug: 'endocrinologista', reg_label: 'CRM', reg_req: 1 },
      { id: 'prof-ortopedista', cat_id: 'cat-med', name: 'Ortopedista', slug: 'ortopedista', reg_label: 'CRM', reg_req: 1 },
      { id: 'prof-reumatologista', cat_id: 'cat-med', name: 'Reumatologista', slug: 'reumatologista', reg_label: 'CRM', reg_req: 1 },
      { id: 'prof-clinico-geral', cat_id: 'cat-med', name: 'Clínico Geral', slug: 'clinico-geral', reg_label: 'CRM', reg_req: 1 },
      { id: 'prof-ginecologista', cat_id: 'cat-med', name: 'Ginecologista e Obstetra', slug: 'ginecologista', reg_label: 'CRM', reg_req: 1 },
      { id: 'prof-ortodontista', cat_id: 'cat-odonto', name: 'Ortodontista', slug: 'ortodontista', reg_label: 'CRO', reg_req: 1 }
    ];

    let deletedProfIds = new Set<string>();
    try {
      deletedProfIds = new Set(
        rawDb.prepare('SELECT id FROM deleted_global_professions').all().map((r: any) => r.id)
      );
    } catch (_) {}

    const insProfStmt = rawDb.prepare(`
      INSERT OR IGNORE INTO professions (id, category_id, name, slug, registration_board_label, registration_required, active)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `);
    for (const dp of detailedProfs) {
      if (deletedProfIds.has(dp.id)) continue;
      insProfStmt.run(dp.id, dp.cat_id, dp.name, dp.slug, dp.reg_label, dp.reg_req);
    }

    const profs = rawDb.prepare(`
      SELECT p.id as prof_id, p.user_id, p.tenant_id, p.profession_id, p.name as prof_name,
             u.profession_name as user_prof_name, u.profession_id as user_prof_id
      FROM professionals p
      LEFT JOIN users u ON u.id = p.user_id
    `).all() as any[];

    for (const p of profs) {
      const pId = p.profession_id || p.user_prof_id;
      const pName = p.prof_name || p.user_prof_name || '';
      const resolution = resolveCanonicalProfession({ id: pId, name: pName });

      if (resolution.canonicalId && resolution.canonicalId !== p.profession_id) {
        try {
          rawDb.prepare('UPDATE professionals SET profession_id = ? WHERE id = ?').run(resolution.canonicalId, p.prof_id);
        } catch (_) {}
      }

      if (p.user_id && resolution.canonicalId && resolution.canonicalId !== p.user_prof_id) {
        try {
          rawDb.prepare('UPDATE users SET profession_id = ? WHERE id = ?').run(resolution.canonicalId, p.user_id);
        } catch (_) {}
      }

      // Se for Educação Física / Personal Trainer, ativa flag correspondente
      if (resolution.commercialModule === 'ZemdaPersonal') {
        try {
          rawDb.prepare('UPDATE professionals SET zemda_personal_enabled = 1 WHERE id = ?').run(p.prof_id);
          if (p.user_id) {
            rawDb.prepare('UPDATE users SET zemda_personal_enabled = 1 WHERE id = ?').run(p.user_id);
            if (p.tenant_id) {
              rawDb.prepare('UPDATE clinic_users SET zemda_personal_enabled = 1 WHERE user_id = ? AND tenant_id = ?').run(p.user_id, p.tenant_id);
            }
          }
        } catch (_) {}
      }

      // Se for Medicina / ZemdaMed, ativa flag correspondente
      if (resolution.commercialModule === 'ZemdaMed') {
        try {
          rawDb.prepare('UPDATE professionals SET zemda_med_enabled = 1 WHERE id = ?').run(p.prof_id);
          if (p.user_id) {
            rawDb.prepare('UPDATE users SET zemda_med_enabled = 1 WHERE id = ?').run(p.user_id);
            if (p.tenant_id) {
              rawDb.prepare('UPDATE clinic_users SET zemda_med_enabled = 1 WHERE user_id = ? AND tenant_id = ?').run(p.user_id, p.tenant_id);
            }
          }
        } catch (_) {}
      }

      // Se usuário não tiver áreas cadastradas mas houver área automática/inferida, vincula na tabela
      const autoArea = resolution.automaticPracticeAreaId || resolution.inferredAreaId;
      if (p.user_id && p.tenant_id && autoArea) {
        try {
          const countRow = rawDb.prepare('SELECT count(*) as c FROM user_practice_areas WHERE user_id = ? AND tenant_id = ?').get(p.user_id, p.tenant_id) as any;
          if (!countRow || countRow.c === 0) {
            rawDb.prepare(`
              INSERT OR IGNORE INTO user_practice_areas (user_id, practice_area_id, tenant_id)
              VALUES (?, ?, ?)
            `).run(p.user_id, autoArea, p.tenant_id);
          }
        } catch (_) {}
      }
    }
  } catch (err) {
    console.warn('[ModularMigration] Reconciliação legada executada com resiliência:', err);
  }
}
