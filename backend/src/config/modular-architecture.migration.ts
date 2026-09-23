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
  const count = (rawDb.prepare('SELECT count(*) as c FROM capabilities').get() as any)?.c || 0;
  if (count > 0) return;

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
    { id: 'CLINICAL_SCALES', category: 'MEDICAL', name: 'Escalas Clínicas Configuráveis', description: 'Escalas psiquiátricas, geriátricas e funcionais' }
  ];

  const stmt = rawDb.prepare(`
    INSERT OR IGNORE INTO capabilities (id, category, name, description, active)
    VALUES (?, ?, ?, ?, 1)
  `);

  for (const c of caps) {
    stmt.run(c.id, c.category, c.name, c.description);
  }
}

function seedPracticeAreas(rawDb: DatabaseSync): void {
  const count = (rawDb.prepare('SELECT count(*) as c FROM practice_areas').get() as any)?.c || 0;
  if (count > 0) return;

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
    { id: 'pa-med-outro', professionId: 'prof-medico', name: 'Outra especialidade Médica', slug: 'outra-area-med', type: 'SPECIALTY' }
  ];

  const stmt = rawDb.prepare(`
    INSERT OR IGNORE INTO practice_areas (id, profession_id, name, slug, type, active)
    VALUES (?, ?, ?, ?, ?, 1)
  `);

  for (const a of areas) {
    stmt.run(a.id, a.professionId, a.name, a.slug, a.type);
  }
}

function seedCapabilitiesMatrix(rawDb: DatabaseSync): void {
  const count = (rawDb.prepare('SELECT count(*) as c FROM profession_capabilities').get() as any)?.c || 0;
  if (count > 0) return;

  const insertProfCap = rawDb.prepare(`
    INSERT OR IGNORE INTO profession_capabilities (profession_id, capability_id, rule)
    VALUES (?, ?, ?)
  `);

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

  // Regras por área médica específica (Presets médicos):
  const insertAreaCap = rawDb.prepare(`
    INSERT OR IGNORE INTO practice_area_capabilities (practice_area_id, capability_id, rule)
    VALUES (?, ?, ?)
  `);

  // Neurologia
  ['MEDICAL_NEURO', 'BODY_MAP', 'FUNCTIONAL_ASSESSMENT', 'MUSCLE_STRENGTH', 'POSTURE_GAIT', 'MOBILITY_ASSESSMENT', 'FUNCTIONAL_TESTS', 'CLINICAL_SCALES'].forEach(c => {
    insertAreaCap.run('pa-med-neuro', c, 'DEFAULT');
  });
  ['ADL_ASSESSMENT', 'COMMUNICATION_ASSESSMENT', 'ANTHROPOMETRY'].forEach(c => {
    insertAreaCap.run('pa-med-neuro', c, 'OPTIONAL');
  });

  // Psiquiatria
  ['BEHAVIOR_ASSESSMENT', 'CLINICAL_SCALES'].forEach(c => {
    insertAreaCap.run('pa-med-psiquiatria', c, 'DEFAULT');
  });
  ['CORE_AI', 'LEARNING_ASSESSMENT'].forEach(c => {
    insertAreaCap.run('pa-med-psiquiatria', c, 'OPTIONAL');
  });

  // Pediatria
  ['ANTHROPOMETRY', 'CLINICAL_SCALES'].forEach(c => {
    insertAreaCap.run('pa-med-pediatria', c, 'DEFAULT');
  });
  ['LEARNING_ASSESSMENT', 'COMMUNICATION_ASSESSMENT', 'BODY_MAP'].forEach(c => {
    insertAreaCap.run('pa-med-pediatria', c, 'OPTIONAL');
  });

  // Geriatria
  ['ADL_ASSESSMENT', 'MOBILITY_ASSESSMENT', 'MUSCLE_STRENGTH', 'POSTURE_GAIT', 'PAIN_ASSESSMENT', 'CLINICAL_SCALES'].forEach(c => {
    insertAreaCap.run('pa-med-geriatria', c, 'DEFAULT');
  });

  // Ortopedia
  ['BODY_MAP', 'PAIN_ASSESSMENT', 'MOBILITY_ASSESSMENT', 'MUSCLE_STRENGTH', 'FUNCTIONAL_TESTS'].forEach(c => {
    insertAreaCap.run('pa-med-ortopedia', c, 'DEFAULT');
  });

  // Cardiologia
  ['MEDICAL_VITAL_SIGNS', 'ANTHROPOMETRY'].forEach(c => {
    insertAreaCap.run('pa-med-cardio', c, 'DEFAULT');
  });

  // Dermatologia
  ['BODY_MAP'].forEach(c => {
    insertAreaCap.run('pa-med-dermato', c, 'DEFAULT');
  });

  // Endocrinologia
  ['ANTHROPOMETRY', 'BODY_COMPOSITION'].forEach(c => {
    insertAreaCap.run('pa-med-endocrino', c, 'DEFAULT');
  });

  // Reumatologia
  ['PAIN_ASSESSMENT', 'MOBILITY_ASSESSMENT', 'BODY_MAP', 'FUNCTIONAL_ASSESSMENT'].forEach(c => {
    insertAreaCap.run('pa-med-reumato', c, 'DEFAULT');
  });

  // Regras de Planos Comerciais (plan_capabilities)
  const insertPlanCap = rawDb.prepare(`
    INSERT OR IGNORE INTO plan_capabilities (plan_id, capability_id)
    VALUES (?, ?)
  `);

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

      // Se usuário não tiver áreas cadastradas mas houver área inferida, vincula na tabela
      if (p.user_id && p.tenant_id && resolution.inferredAreaId) {
        try {
          const countRow = rawDb.prepare('SELECT count(*) as c FROM user_practice_areas WHERE user_id = ? AND tenant_id = ?').get(p.user_id, p.tenant_id) as any;
          if (!countRow || countRow.c === 0) {
            rawDb.prepare(`
              INSERT OR IGNORE INTO user_practice_areas (user_id, practice_area_id, tenant_id)
              VALUES (?, ?, ?)
            `).run(p.user_id, resolution.inferredAreaId, p.tenant_id);
          }
        } catch (_) {}
      }
    }
  } catch (err) {
    console.warn('[ModularMigration] Reconciliação legada executada com resiliência:', err);
  }
}
