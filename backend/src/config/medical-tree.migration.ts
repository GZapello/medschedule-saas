import { DatabaseSync } from 'node:sqlite';

export function migrateMedicalTree(rawDb: DatabaseSync): void {
  // 1. Criação das tabelas da árvore médica
  rawDb.exec(`
    -- Tabela de Especialidades Médicas Oficiais
    CREATE TABLE IF NOT EXISTS medical_specialties (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description TEXT,
      icon_name TEXT,
      focus_areas_json TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_med_spec_active ON medical_specialties(active, sort_order);

    -- Tabela de Áreas de Atuação / Subáreas Médicas
    CREATE TABLE IF NOT EXISTS medical_practice_areas (
      id TEXT PRIMARY KEY,
      medical_specialty_id TEXT NOT NULL,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      description TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (medical_specialty_id) REFERENCES medical_specialties(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_med_pa_spec ON medical_practice_areas(medical_specialty_id, active, sort_order);

    -- Vínculo Usuário x Especialidades Médicas (Múltiplas)
    CREATE TABLE IF NOT EXISTS user_medical_specialties (
      user_id TEXT NOT NULL,
      medical_specialty_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, medical_specialty_id, tenant_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (medical_specialty_id) REFERENCES medical_specialties(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_user_med_spec ON user_medical_specialties(user_id, tenant_id);

    -- Vínculo Usuário x Áreas de Atuação Médicas (Múltiplas)
    CREATE TABLE IF NOT EXISTS user_medical_practice_areas (
      user_id TEXT NOT NULL,
      medical_practice_area_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, medical_practice_area_id, tenant_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (medical_practice_area_id) REFERENCES medical_practice_areas(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_user_med_pa ON user_medical_practice_areas(user_id, tenant_id);

    -- Capabilities padrão/opcionais da Especialidade Médica
    CREATE TABLE IF NOT EXISTS medical_specialty_capabilities (
      medical_specialty_id TEXT NOT NULL,
      capability_id TEXT NOT NULL,
      rule TEXT NOT NULL CHECK(rule IN ('DEFAULT', 'OPTIONAL', 'HIDDEN')),
      PRIMARY KEY (medical_specialty_id, capability_id),
      FOREIGN KEY (medical_specialty_id) REFERENCES medical_specialties(id) ON DELETE CASCADE,
      FOREIGN KEY (capability_id) REFERENCES capabilities(id) ON DELETE CASCADE
    );

    -- Capabilities da Área de Atuação Médica
    CREATE TABLE IF NOT EXISTS medical_practice_area_capabilities (
      medical_practice_area_id TEXT NOT NULL,
      capability_id TEXT NOT NULL,
      rule TEXT NOT NULL CHECK(rule IN ('DEFAULT', 'OPTIONAL', 'HIDDEN')),
      PRIMARY KEY (medical_practice_area_id, capability_id),
      FOREIGN KEY (medical_practice_area_id) REFERENCES medical_practice_areas(id) ON DELETE CASCADE,
      FOREIGN KEY (capability_id) REFERENCES capabilities(id) ON DELETE CASCADE
    );
  `);

  // 2. Seed das 15 especialidades médicas
  seedMedicalSpecialties(rawDb);

  // 3. Seed das áreas de atuação por especialidade
  seedMedicalPracticeAreas(rawDb);

  // 4. Seed da matriz de capabilities por especialidade médica
  seedMedicalCapabilitiesMatrix(rawDb);

  // 5. Migração retroativa e mapeamento para contas existentes
  reconcileExistingMedicalUsers(rawDb);
}

interface SpecialtySeed {
  id: string;
  name: string;
  slug: string;
  description: string;
  iconName: string;
  focusAreas: string[];
  sortOrder: number;
}

const MEDICAL_SPECIALTIES_SEED: SpecialtySeed[] = [
  {
    id: 'med-spec-clinica',
    name: 'Clínica Médica',
    slug: 'clinica-medica',
    description: 'Atendimento geral do adulto, investigação diagnóstica e acompanhamento de condições crônicas.',
    iconName: 'Stethoscope',
    focusAreas: ['Doenças Crônicas', 'Medicina Preventiva', 'Risco Cirúrgico', 'Investigação Diagnóstica'],
    sortOrder: 1
  },
  {
    id: 'med-spec-neuro',
    name: 'Neurologia',
    slug: 'neurologia',
    description: 'Exame neurológico completo, cefaleias, AVC, epilepsia, distúrbios do movimento e demências.',
    iconName: 'Brain',
    focusAreas: ['Exame Neurológico', 'AVC & Cognição', 'Cefaleias & Enxaqueca', 'Parkinson & Tremores'],
    sortOrder: 2
  },
  {
    id: 'med-spec-psiquiatria',
    name: 'Psiquiatria',
    slug: 'psiquiatria',
    description: 'Avaliação do estado mental, psicopatologia, transtornos de humor, ansiedade e conduta psicofarmacológica.',
    iconName: 'Smile',
    focusAreas: ['Humor & Afeto', 'Ansiedade & Pânico', 'Sono & Apetite', 'Psicofármacos'],
    sortOrder: 3
  },
  {
    id: 'med-spec-pediatria',
    name: 'Pediatria',
    slug: 'pediatria',
    description: 'Puericultura, acompanhamento do desenvolvimento neuropsicomotor, vacinação e doenças da infância.',
    iconName: 'Baby',
    focusAreas: ['Puericultura', 'Marcos DNPM', 'Curvas de Crescimento', 'Vacinação Infantil'],
    sortOrder: 4
  },
  {
    id: 'med-spec-geriatria',
    name: 'Geriatria',
    slug: 'geriatria',
    description: 'Avaliação geriátrica ampla (AGA), polifarmácia, fragilidade, prevenção de quedas e autonomia funcional.',
    iconName: 'Shield',
    focusAreas: ['AGA', 'Polifarmácia & Desprescrição', 'Risco de Quedas', 'AVD / AIVD'],
    sortOrder: 5
  },
  {
    id: 'med-spec-endocrino',
    name: 'Endocrinologia e Metabologia',
    slug: 'endocrinologia',
    description: 'Manejo de diabetes, afecções da tireoide, obesidade, síndrome metabólica e osteometabolismo.',
    iconName: 'Scale',
    focusAreas: ['Diabetes Mellitus', 'Tireoide', 'Metabolismo & Obesidade', 'Osteometabolismo'],
    sortOrder: 6
  },
  {
    id: 'med-spec-ortopedia',
    name: 'Ortopedia e Traumatologia',
    slug: 'ortopedia',
    description: 'Avaliação osteoarticular, amplitude de movimento, testes especiais, fraturas e afecções da coluna e membros.',
    iconName: 'Activity',
    focusAreas: ['Aparelho Locomotor', 'Coluna Vertebral', 'Membros Superiores & Inferiores', 'Dor Osteomuscular'],
    sortOrder: 7
  },
  {
    id: 'med-spec-cardio',
    name: 'Cardiologia',
    slug: 'cardiologia',
    description: 'Estratificação de risco cardiovascular, hipertensão arterial, insuficiência cardíaca, ausculta e arritmias.',
    iconName: 'Heart',
    focusAreas: ['Risco Cardiovascular', 'Hipertensão Arterial', 'Ausculta Cardíaca', 'Arritmias & IC'],
    sortOrder: 8
  },
  {
    id: 'med-spec-dermato',
    name: 'Dermatologia',
    slug: 'dermatologia',
    description: 'Mapeamento de lesões elementares, fototipos, afecções cutâneas inflamatórias, neoplásicas e anexos.',
    iconName: 'Flame',
    focusAreas: ['Lesões Cutâneas', 'Acne & Afecções', 'Pele & Anexos', 'Rastreamento Neoplásico'],
    sortOrder: 9
  },
  {
    id: 'med-spec-reumato',
    name: 'Reumatologia',
    slug: 'reumatologia',
    description: 'Manejo de doenças autoimunes sistêmicas, artrites inflamatórias, fibromialgia e dor crônica.',
    iconName: 'Activity',
    focusAreas: ['Artropatias Inflamatórias', 'Doenças Autoimunes', 'Fibromialgia', 'Osteoporose'],
    sortOrder: 10
  },
  {
    id: 'med-spec-gineco',
    name: 'Ginecologia e Obstetrícia',
    slug: 'ginecologia-obstetricia',
    description: 'Saúde integral da mulher, pré-natal, rastreamento ginecológico, climatério e planejamento reprodutivo.',
    iconName: 'HeartHandshake',
    focusAreas: ['Saúde da Mulher', 'Pré-Natal', 'Climatério & Menopausa', 'Rastreamento Ginecológico'],
    sortOrder: 11
  },
  {
    id: 'med-spec-gastro',
    name: 'Gastroenterologia',
    slug: 'gastroenterologia',
    description: 'Doenças do trato gastrointestinal alto e baixo, hepatologia clínica e distúrbios funcionais digestivos.',
    iconName: 'Stethoscope',
    focusAreas: ['DRGE & Gastrites', 'Doenças Intestinais', 'Hepatologia Clínica', 'Distúrbios Funcionais'],
    sortOrder: 12
  },
  {
    id: 'med-spec-oftalmo',
    name: 'Oftalmologia',
    slug: 'oftalmologia',
    description: 'Acuidade visual, refração, rastreamento de glaucoma, doenças da córnea e avaliação da retina.',
    iconName: 'Eye',
    focusAreas: ['Refração & Acuidade', 'Glaucoma', 'Superfície Ocular', 'Retina'],
    sortOrder: 13
  },
  {
    id: 'med-spec-otorrino',
    name: 'Otorrinolaringologia',
    slug: 'otorrinolaringologia',
    description: 'Doenças do ouvido, nariz e garganta, avaliação de vertigem, distúrbios da voz e do sono.',
    iconName: 'Headphones',
    focusAreas: ['Rinologia', 'Otologia & Vertigem', 'Laringe & Voz', 'Distúrbios do Sono'],
    sortOrder: 14
  },
  {
    id: 'med-spec-urologia',
    name: 'Urologia',
    slug: 'urologia',
    description: 'Saúde urológica e andrológica, afecções da próstata, litíase urinária e incontinência.',
    iconName: 'ShieldCheck',
    focusAreas: ['Próstata & Rastreamento', 'Litíase Urinária', 'Saúde do Homem', 'Incontinência Urinária'],
    sortOrder: 15
  }
];

function seedMedicalSpecialties(rawDb: DatabaseSync): void {
  const insertSpec = rawDb.prepare(`
    INSERT OR IGNORE INTO medical_specialties (
      id, name, slug, description, icon_name, focus_areas_json, active, sort_order
    ) VALUES (?, ?, ?, ?, ?, ?, 1, ?)
  `);

  const insertLegacySpec = rawDb.prepare(`
    INSERT OR IGNORE INTO specialties (
      id, profession_id, name, slug, color, active
    ) VALUES (?, 'prof-medico', ?, ?, '#0d9488', 1)
  `);

  for (const s of MEDICAL_SPECIALTIES_SEED) {
    insertSpec.run(
      s.id,
      s.name,
      s.slug,
      s.description,
      s.iconName,
      JSON.stringify(s.focusAreas),
      s.sortOrder
    );

    // Garante que a tabela legada 'specialties' também conheça a especialidade para integridade referencial
    insertLegacySpec.run(s.id, s.name, s.slug);
  }
}

interface AreaSeed {
  id: string;
  specialtyId: string;
  name: string;
  slug: string;
  sortOrder: number;
}

const MEDICAL_PRACTICE_AREAS_SEED: AreaSeed[] = [
  // 1. Clínica Médica
  { id: 'med-pa-clinica-cronicas', specialtyId: 'med-spec-clinica', name: 'Doenças Crônicas', slug: 'doencas-cronicas', sortOrder: 1 },
  { id: 'med-pa-clinica-preventiva', specialtyId: 'med-spec-clinica', name: 'Medicina Preventiva', slug: 'medicina-preventiva', sortOrder: 2 },
  { id: 'med-pa-clinica-risco', specialtyId: 'med-spec-clinica', name: 'Risco Cirúrgico', slug: 'risco-cirurgico', sortOrder: 3 },
  { id: 'med-pa-clinica-diagnostica', specialtyId: 'med-spec-clinica', name: 'Investigação Diagnóstica', slug: 'investigacao-diagnostica', sortOrder: 4 },
  { id: 'med-pa-clinica-paliativos', specialtyId: 'med-spec-clinica', name: 'Cuidados Paliativos', slug: 'cuidados-paliativos', sortOrder: 5 },

  // 2. Neurologia
  { id: 'med-pa-neuro-avc', specialtyId: 'med-spec-neuro', name: 'AVC e Doenças Cerebrovasculares', slug: 'avc-cerebrovascular', sortOrder: 1 },
  { id: 'med-pa-neuro-epilepsia', specialtyId: 'med-spec-neuro', name: 'Epilepsia e Crises Convulsivas', slug: 'epilepsia', sortOrder: 2 },
  { id: 'med-pa-neuro-demencias', specialtyId: 'med-spec-neuro', name: 'Demências e Cognição', slug: 'demencias-cognicao', sortOrder: 3 },
  { id: 'med-pa-neuro-parkinson', specialtyId: 'med-spec-neuro', name: 'Doença de Parkinson e Movimento', slug: 'parkinson-movimento', sortOrder: 4 },
  { id: 'med-pa-neuro-cefaleias', specialtyId: 'med-spec-neuro', name: 'Cefaleias e Enxaqueca', slug: 'cefaleias-enxaqueca', sortOrder: 5 },
  { id: 'med-pa-neuro-neuromuscular', specialtyId: 'med-spec-neuro', name: 'Doenças Neuromusculares', slug: 'doencas-neuromusculares', sortOrder: 6 },
  { id: 'med-pa-neuro-geral', specialtyId: 'med-spec-neuro', name: 'Neurologia Geral', slug: 'neurologia-geral', sortOrder: 7 },

  // 3. Psiquiatria
  { id: 'med-pa-psic-ansiedade', specialtyId: 'med-spec-psiquiatria', name: 'Transtornos de Ansiedade', slug: 'ansiedade', sortOrder: 1 },
  { id: 'med-pa-psic-humor', specialtyId: 'med-spec-psiquiatria', name: 'Transtornos do Humor (Depressão / Bipolaridade)', slug: 'transtornos-humor', sortOrder: 2 },
  { id: 'med-pa-psic-infancia', specialtyId: 'med-spec-psiquiatria', name: 'Psiquiatria da Infância e Adolescência', slug: 'infancia-adolescencia', sortOrder: 3 },
  { id: 'med-pa-psic-psicogeriatria', specialtyId: 'med-spec-psiquiatria', name: 'Psicogeriatria', slug: 'psicogeriatria', sortOrder: 4 },
  { id: 'med-pa-psic-dependencia', specialtyId: 'med-spec-psiquiatria', name: 'Dependência Química', slug: 'dependencia-quimica', sortOrder: 5 },
  { id: 'med-pa-psic-psicoticos', specialtyId: 'med-spec-psiquiatria', name: 'Transtornos Psicóticos', slug: 'transtornos-psicoticos', sortOrder: 6 },
  { id: 'med-pa-psic-geral', specialtyId: 'med-spec-psiquiatria', name: 'Psiquiatria Geral', slug: 'psiquiatria-geral', sortOrder: 7 },

  // 4. Pediatria
  { id: 'med-pa-ped-puericultura', specialtyId: 'med-spec-pediatria', name: 'Puericultura e Crescimento', slug: 'puericultura', sortOrder: 1 },
  { id: 'med-pa-ped-desenvolvimento', specialtyId: 'med-spec-pediatria', name: 'Pediatria do Desenvolvimento', slug: 'desenvolvimento', sortOrder: 2 },
  { id: 'med-pa-ped-respiratorias', specialtyId: 'med-spec-pediatria', name: 'Doenças Respiratórias Pediátricas', slug: 'respiratorias-pediatricas', sortOrder: 3 },
  { id: 'med-pa-ped-infeccoes', specialtyId: 'med-spec-pediatria', name: 'Infecções Prevalentes na Infância', slug: 'infeccoes-infantis', sortOrder: 4 },
  { id: 'med-pa-ped-aleitamento', specialtyId: 'med-spec-pediatria', name: 'Aleitamento e Nutrição Infantil', slug: 'aleitamento-nutricao', sortOrder: 5 },
  { id: 'med-pa-ped-geral', specialtyId: 'med-spec-pediatria', name: 'Pediatria Geral', slug: 'pediatria-geral', sortOrder: 6 },

  // 5. Geriatria
  { id: 'med-pa-ger-fragilidade', specialtyId: 'med-spec-geriatria', name: 'Fragilidade e Prevenção de Quedas', slug: 'fragilidade-quedas', sortOrder: 1 },
  { id: 'med-pa-ger-aga', specialtyId: 'med-spec-geriatria', name: 'Avaliação Geriátrica Ampla (AGA)', slug: 'aga', sortOrder: 2 },
  { id: 'med-pa-ger-polifarmacia', specialtyId: 'med-spec-geriatria', name: 'Polifarmácia e Desprescrição', slug: 'polifarmacia', sortOrder: 3 },
  { id: 'med-pa-ger-neurodegenerativas', specialtyId: 'med-spec-geriatria', name: 'Doenças Neurodegenerativas do Idoso', slug: 'neurodegenerativas-idoso', sortOrder: 4 },
  { id: 'med-pa-ger-longevidade', specialtyId: 'med-spec-geriatria', name: 'Longevidade e Prevenção', slug: 'longevidade-prevencao', sortOrder: 5 },
  { id: 'med-pa-ger-geral', specialtyId: 'med-spec-geriatria', name: 'Geriatria Geral', slug: 'geriatria-geral', sortOrder: 6 },

  // 6. Endocrinologia e Metabologia
  { id: 'med-pa-end-diabetes', specialtyId: 'med-spec-endocrino', name: 'Diabetes Mellitus', slug: 'diabetes-mellitus', sortOrder: 1 },
  { id: 'med-pa-end-tireoide', specialtyId: 'med-spec-endocrino', name: 'Doenças da Tireoide', slug: 'doencas-tireoide', sortOrder: 2 },
  { id: 'med-pa-end-obesidade', specialtyId: 'med-spec-endocrino', name: 'Obesidade e Síndrome Metabólica', slug: 'obesidade-sindrome-metabolica', sortOrder: 3 },
  { id: 'med-pa-end-osteometabolicas', specialtyId: 'med-spec-endocrino', name: 'Doenças Osteometabólicas', slug: 'osteometabolicas', sortOrder: 4 },
  { id: 'med-pa-end-geral', specialtyId: 'med-spec-endocrino', name: 'Endocrinologia Geral', slug: 'endocrinologia-geral', sortOrder: 5 },

  // 7. Ortopedia e Traumatologia
  { id: 'med-pa-ort-traumatologia', specialtyId: 'med-spec-ortopedia', name: 'Traumatologia Geral', slug: 'traumatologia-geral', sortOrder: 1 },
  { id: 'med-pa-ort-coluna', specialtyId: 'med-spec-ortopedia', name: 'Coluna Vertebral', slug: 'coluna-vertebral', sortOrder: 2 },
  { id: 'med-pa-ort-mmss', specialtyId: 'med-spec-ortopedia', name: 'Membros Superiores (Ombro / Cotovelo / Mão)', slug: 'membros-superiores', sortOrder: 3 },
  { id: 'med-pa-ort-mmii', specialtyId: 'med-spec-ortopedia', name: 'Membros Inferiores (Quadril / Joelho / Pé)', slug: 'membros-inferiores', sortOrder: 4 },
  { id: 'med-pa-ort-dor-cronica', specialtyId: 'med-spec-ortopedia', name: 'Dor Crônica Osteomuscular', slug: 'dor-cronica-osteomuscular', sortOrder: 5 },
  { id: 'med-pa-ort-geral', specialtyId: 'med-spec-ortopedia', name: 'Ortopedia Geral', slug: 'ortopedia-geral', sortOrder: 6 },

  // 8. Cardiologia
  { id: 'med-pa-car-hipertensao', specialtyId: 'med-spec-cardio', name: 'Hipertensão Arterial Sistêmica', slug: 'hipertensao-arterial', sortOrder: 1 },
  { id: 'med-pa-car-ic', specialtyId: 'med-spec-cardio', name: 'Insuficiência Cardíaca', slug: 'insuficiencia-cardiaca', sortOrder: 2 },
  { id: 'med-pa-car-arritmias', specialtyId: 'med-spec-cardio', name: 'Arritmias Cardíacas', slug: 'arritmias-cardiacas', sortOrder: 3 },
  { id: 'med-pa-car-coronariopatias', specialtyId: 'med-spec-cardio', name: 'Coronariopatias e Prevenção', slug: 'coronariopatias-prevencao', sortOrder: 4 },
  { id: 'med-pa-car-perioperatoria', specialtyId: 'med-spec-cardio', name: 'Avaliação Perioperatória', slug: 'avaliacao-perioperatoria', sortOrder: 5 },
  { id: 'med-pa-car-geral', specialtyId: 'med-spec-cardio', name: 'Cardiologia Geral', slug: 'cardiologia-geral', sortOrder: 6 },

  // 9. Dermatologia
  { id: 'med-pa-der-geral', specialtyId: 'med-spec-dermato', name: 'Dermatologia Clínica Geral', slug: 'dermatologia-geral', sortOrder: 1 },
  { id: 'med-pa-der-acne', specialtyId: 'med-spec-dermato', name: 'Acne e Afecções Sebáceas', slug: 'acne-afeccoes-sebaceas', sortOrder: 2 },
  { id: 'med-pa-der-psoriase', specialtyId: 'med-spec-dermato', name: 'Psoríase e Doenças Inflamatórias', slug: 'psoriase-inflamatorias', sortOrder: 3 },
  { id: 'med-pa-der-tricologia', specialtyId: 'med-spec-dermato', name: 'Queda de Cabelo e Alopecias (Tricologia)', slug: 'tricologia-alopecias', sortOrder: 4 },
  { id: 'med-pa-der-neoplasias', specialtyId: 'med-spec-dermato', name: 'Neoplasias Cutâneas e Lesões de Pele', slug: 'neoplasias-lesoes-pele', sortOrder: 5 },

  // 10. Reumatologia
  { id: 'med-pa-reu-artrites', specialtyId: 'med-spec-reumato', name: 'Artrites e Artropatias Inflamatórias', slug: 'artrites-inflamatorias', sortOrder: 1 },
  { id: 'med-pa-reu-autoimunes', specialtyId: 'med-spec-reumato', name: 'Doenças Autoimunes Sistêmicas (LES, Sjögren)', slug: 'autoimunes-sistemicas', sortOrder: 2 },
  { id: 'med-pa-reu-fibromialgia', specialtyId: 'med-spec-reumato', name: 'Fibromialgia e Síndromes Dolorosas', slug: 'fibromialgia-dor', sortOrder: 3 },
  { id: 'med-pa-reu-osteoartrite', specialtyId: 'med-spec-reumato', name: 'Osteoartrite e Osteoporose', slug: 'osteoartrite-osteoporose', sortOrder: 4 },
  { id: 'med-pa-reu-geral', specialtyId: 'med-spec-reumato', name: 'Reumatologia Geral', slug: 'reumatologia-geral', sortOrder: 5 },

  // 11. Ginecologia e Obstetrícia
  { id: 'med-pa-gin-geral', specialtyId: 'med-spec-gineco', name: 'Ginecologia Clínica Geral', slug: 'ginecologia-geral', sortOrder: 1 },
  { id: 'med-pa-gin-prenatal', specialtyId: 'med-spec-gineco', name: 'Pré-Natal e Assistência Obstétrica', slug: 'pre-natal-obstetrica', sortOrder: 2 },
  { id: 'med-pa-gin-climaterio', specialtyId: 'med-spec-gineco', name: 'Climatério e Menopausa', slug: 'climaterio-menopausa', sortOrder: 3 },
  { id: 'med-pa-gin-anticoncepcao', specialtyId: 'med-spec-gineco', name: 'Anticoncepção e Planejamento Familiar', slug: 'anticoncepcao-planejamento', sortOrder: 4 },
  { id: 'med-pa-gin-rastreamento', specialtyId: 'med-spec-gineco', name: 'Rastreamento e Prevenção Ginecológica', slug: 'rastreamento-prevencao', sortOrder: 5 },

  // 12. Gastroenterologia
  { id: 'med-pa-gas-esofago-estomago', specialtyId: 'med-spec-gastro', name: 'Doenças do Esôfago e Estômago (DRGE / Gastrites)', slug: 'esofago-estomago', sortOrder: 1 },
  { id: 'med-pa-gas-dii', specialtyId: 'med-spec-gastro', name: 'Doenças Inflamatórias Intestinais (Crohn / RCU)', slug: 'doencas-inflamatorias-intestinais', sortOrder: 2 },
  { id: 'med-pa-gas-funcionais', specialtyId: 'med-spec-gastro', name: 'Doenças Funcionais do Intestino (SII)', slug: 'funcionais-intestino', sortOrder: 3 },
  { id: 'med-pa-gas-hepatologia', specialtyId: 'med-spec-gastro', name: 'Hepatologia Clínica', slug: 'hepatologia-clinica', sortOrder: 4 },
  { id: 'med-pa-gas-geral', specialtyId: 'med-spec-gastro', name: 'Gastroenterologia Geral', slug: 'gastroenterologia-geral', sortOrder: 5 },

  // 13. Oftalmologia
  { id: 'med-pa-oft-refracao', specialtyId: 'med-spec-oftalmo', name: 'Refração e Acuidade Visual', slug: 'refracao-acuidade', sortOrder: 1 },
  { id: 'med-pa-oft-glaucoma', specialtyId: 'med-spec-oftalmo', name: 'Glaucoma e Rastreamento de Pressão Ocular', slug: 'glaucoma-rastreamento', sortOrder: 2 },
  { id: 'med-pa-oft-cornea', specialtyId: 'med-spec-oftalmo', name: 'Doenças da Córnea e Superfície Ocular', slug: 'cornea-superficie', sortOrder: 3 },
  { id: 'med-pa-oft-retina', specialtyId: 'med-spec-oftalmo', name: 'Doenças da Retina e Fundo de Olho', slug: 'retina-fundo-olho', sortOrder: 4 },
  { id: 'med-pa-oft-geral', specialtyId: 'med-spec-oftalmo', name: 'Oftalmologia Geral', slug: 'oftalmologia-geral', sortOrder: 5 },

  // 14. Otorrinolaringologia
  { id: 'med-pa-oto-rinologia', specialtyId: 'med-spec-otorrino', name: 'Rinologia e Doenças Nasossinusais', slug: 'rinologia-nasossinusal', sortOrder: 1 },
  { id: 'med-pa-oto-vertigem', specialtyId: 'med-spec-otorrino', name: 'Otologia e Vertigem / Tontura', slug: 'otologia-vertigem', sortOrder: 2 },
  { id: 'med-pa-oto-laringologia', specialtyId: 'med-spec-otorrino', name: 'Laringologia e Voz', slug: 'laringologia-voz', sortOrder: 3 },
  { id: 'med-pa-oto-sono', specialtyId: 'med-spec-otorrino', name: 'Distúrbios do Sono e Ronco', slug: 'disturbios-sono-ronco', sortOrder: 4 },
  { id: 'med-pa-oto-geral', specialtyId: 'med-spec-otorrino', name: 'Otorrinolaringologia Geral', slug: 'otorrinolaringologia-geral', sortOrder: 5 },

  // 15. Urologia
  { id: 'med-pa-uro-geral', specialtyId: 'med-spec-urologia', name: 'Urologia Geral', slug: 'urologia-geral', sortOrder: 1 },
  { id: 'med-pa-uro-prostata', specialtyId: 'med-spec-urologia', name: 'Doenças da Próstata (HPB e Rastreamento)', slug: 'prostata-rastreamento', sortOrder: 2 },
  { id: 'med-pa-uro-litiase', specialtyId: 'med-spec-urologia', name: 'Litíase Urinária (Cálculo Renal)', slug: 'litiase-urinaria', sortOrder: 3 },
  { id: 'med-pa-uro-andrologia', specialtyId: 'med-spec-urologia', name: 'Andrologia e Saúde do Homem', slug: 'andrologia-saude-homem', sortOrder: 4 },
  { id: 'med-pa-uro-incontinencia', specialtyId: 'med-spec-urologia', name: 'Incontinência Urinária e Bexiga Hiperativa', slug: 'incontinencia-bexiga', sortOrder: 5 }
];

function seedMedicalPracticeAreas(rawDb: DatabaseSync): void {
  const insertPa = rawDb.prepare(`
    INSERT OR IGNORE INTO medical_practice_areas (
      id, medical_specialty_id, name, slug, active, sort_order
    ) VALUES (?, ?, ?, ?, 1, ?)
  `);

  for (const pa of MEDICAL_PRACTICE_AREAS_SEED) {
    insertPa.run(pa.id, pa.specialtyId, pa.name, pa.slug, pa.sortOrder);
  }
}

function seedMedicalCapabilitiesMatrix(rawDb: DatabaseSync): void {
  const insertSpecCap = rawDb.prepare(`
    INSERT OR IGNORE INTO medical_specialty_capabilities (medical_specialty_id, capability_id, rule)
    VALUES (?, ?, ?)
  `);

  const baseCaps = [
    'MEDICAL_BASE',
    'MEDICAL_VITAL_SIGNS',
    'MEDICAL_PHYSICAL_EXAM',
    'MEDICAL_SOAP',
    'MEDICAL_CID',
    'CORE_RECORDS',
    'CORE_DOCUMENTS',
    'CORE_PRESCRIPTIONS',
    'CORE_EXAM_REQUEST',
    'CORE_EXAMS_RECEIVED',
    'CORE_SCHEDULE',
    'CORE_PATIENTS',
    'CORE_TIMELINE'
  ];

  for (const s of MEDICAL_SPECIALTIES_SEED) {
    for (const c of baseCaps) {
      insertSpecCap.run(s.id, c, 'DEFAULT');
    }
  }

  // Presets específicos por especialidade
  // 1. Clínica Médica
  ['CLINICAL_SCALES'].forEach(c => insertSpecCap.run('med-spec-clinica', c, 'DEFAULT'));

  // 2. Neurologia
  ['MEDICAL_NEURO', 'CLINICAL_SCALES', 'BODY_MAP', 'MOBILITY_ASSESSMENT', 'POSTURE_GAIT', 'MUSCLE_STRENGTH'].forEach(c => {
    insertSpecCap.run('med-spec-neuro', c, 'DEFAULT');
  });
  ['COMMUNICATION_ASSESSMENT', 'ADL_ASSESSMENT', 'ANTHROPOMETRY'].forEach(c => {
    insertSpecCap.run('med-spec-neuro', c, 'OPTIONAL');
  });

  // 3. Psiquiatria
  ['BEHAVIOR_ASSESSMENT', 'CLINICAL_SCALES'].forEach(c => {
    insertSpecCap.run('med-spec-psiquiatria', c, 'DEFAULT');
  });
  ['COMMUNICATION_ASSESSMENT', 'LEARNING_ASSESSMENT', 'CORE_AI'].forEach(c => {
    insertSpecCap.run('med-spec-psiquiatria', c, 'OPTIONAL');
  });

  // 4. Pediatria
  ['ANTHROPOMETRY', 'CLINICAL_SCALES'].forEach(c => {
    insertSpecCap.run('med-spec-pediatria', c, 'DEFAULT');
  });
  ['LEARNING_ASSESSMENT', 'COMMUNICATION_ASSESSMENT', 'BODY_MAP', 'BEHAVIOR_ASSESSMENT'].forEach(c => {
    insertSpecCap.run('med-spec-pediatria', c, 'OPTIONAL');
  });

  // 5. Geriatria
  ['CLINICAL_SCALES', 'ADL_ASSESSMENT', 'MOBILITY_ASSESSMENT', 'POSTURE_GAIT', 'PAIN_ASSESSMENT', 'MUSCLE_STRENGTH'].forEach(c => {
    insertSpecCap.run('med-spec-geriatria', c, 'DEFAULT');
  });
  ['ANTHROPOMETRY', 'BODY_MAP'].forEach(c => {
    insertSpecCap.run('med-spec-geriatria', c, 'OPTIONAL');
  });

  // 6. Endocrinologia
  ['ANTHROPOMETRY', 'BODY_COMPOSITION', 'CLINICAL_SCALES'].forEach(c => {
    insertSpecCap.run('med-spec-endocrino', c, 'DEFAULT');
  });

  // 7. Ortopedia
  ['BODY_MAP', 'PAIN_ASSESSMENT', 'MOBILITY_ASSESSMENT', 'MUSCLE_STRENGTH', 'FUNCTIONAL_TESTS'].forEach(c => {
    insertSpecCap.run('med-spec-ortopedia', c, 'DEFAULT');
  });
  ['HOME_EXERCISES'].forEach(c => {
    insertSpecCap.run('med-spec-ortopedia', c, 'OPTIONAL');
  });

  // 8. Cardiologia
  ['ANTHROPOMETRY', 'CLINICAL_SCALES'].forEach(c => {
    insertSpecCap.run('med-spec-cardio', c, 'DEFAULT');
  });
  ['BODY_MAP'].forEach(c => {
    insertSpecCap.run('med-spec-cardio', c, 'OPTIONAL');
  });

  // 9. Dermatologia
  ['BODY_MAP'].forEach(c => {
    insertSpecCap.run('med-spec-dermato', c, 'DEFAULT');
  });
  ['CLINICAL_SCALES'].forEach(c => {
    insertSpecCap.run('med-spec-dermato', c, 'OPTIONAL');
  });

  // 10. Reumatologia
  ['BODY_MAP', 'PAIN_ASSESSMENT', 'MOBILITY_ASSESSMENT', 'FUNCTIONAL_ASSESSMENT'].forEach(c => {
    insertSpecCap.run('med-spec-reumato', c, 'DEFAULT');
  });
  ['CLINICAL_SCALES', 'MUSCLE_STRENGTH'].forEach(c => {
    insertSpecCap.run('med-spec-reumato', c, 'OPTIONAL');
  });

  // 11. Ginecologia e Obstetrícia
  ['ANTHROPOMETRY', 'CLINICAL_SCALES'].forEach(c => {
    insertSpecCap.run('med-spec-gineco', c, 'DEFAULT');
  });
  ['BODY_MAP'].forEach(c => {
    insertSpecCap.run('med-spec-gineco', c, 'OPTIONAL');
  });

  // 12. Gastroenterologia
  ['BODY_MAP', 'ANTHROPOMETRY', 'CLINICAL_SCALES'].forEach(c => {
    insertSpecCap.run('med-spec-gastro', c, 'DEFAULT');
  });

  // 13. Oftalmologia
  ['CLINICAL_SCALES'].forEach(c => {
    insertSpecCap.run('med-spec-oftalmo', c, 'DEFAULT');
  });

  // 14. Otorrinolaringologia
  ['AUDIOLOGY', 'COMMUNICATION_ASSESSMENT', 'CLINICAL_SCALES'].forEach(c => {
    insertSpecCap.run('med-spec-otorrino', c, 'DEFAULT');
  });

  // 15. Urologia
  ['CLINICAL_SCALES', 'BODY_MAP'].forEach(c => {
    insertSpecCap.run('med-spec-urologia', c, 'DEFAULT');
  });
}

/**
 * Migra com segurança vínculos médicos existentes para as novas tabelas sem perda de dados
 */
function reconcileExistingMedicalUsers(rawDb: DatabaseSync): void {
  try {
    const legacyAreaToSpecMap: Record<string, { specId: string; defaultPaId: string }> = {
      'pa-med-clinica': { specId: 'med-spec-clinica', defaultPaId: 'med-pa-clinica-cronicas' },
      'pa-med-neuro': { specId: 'med-spec-neuro', defaultPaId: 'med-pa-neuro-geral' },
      'pa-med-psiquiatria': { specId: 'med-spec-psiquiatria', defaultPaId: 'med-pa-psic-geral' },
      'pa-med-pediatria': { specId: 'med-spec-pediatria', defaultPaId: 'med-pa-ped-geral' },
      'pa-med-geriatria': { specId: 'med-spec-geriatria', defaultPaId: 'med-pa-ger-geral' },
      'pa-med-endocrino': { specId: 'med-spec-endocrino', defaultPaId: 'med-pa-end-geral' },
      'pa-med-ortopedia': { specId: 'med-spec-ortopedia', defaultPaId: 'med-pa-ort-geral' },
      'pa-med-cardio': { specId: 'med-spec-cardio', defaultPaId: 'med-pa-car-geral' },
      'pa-med-dermato': { specId: 'med-spec-dermato', defaultPaId: 'med-pa-der-geral' },
      'pa-med-reumato': { specId: 'med-spec-reumato', defaultPaId: 'med-pa-reu-geral' },
      'pa-med-gineco': { specId: 'med-spec-gineco', defaultPaId: 'med-pa-gin-geral' }
    };

    const insUserSpec = rawDb.prepare(`
      INSERT OR IGNORE INTO user_medical_specialties (user_id, medical_specialty_id, tenant_id)
      VALUES (?, ?, ?)
    `);

    const insUserPa = rawDb.prepare(`
      INSERT OR IGNORE INTO user_medical_practice_areas (user_id, medical_practice_area_id, tenant_id)
      VALUES (?, ?, ?)
    `);

    // 1. Migra usuários com user_practice_areas iniciados por pa-med-*
    const existingMedicalUserAreas = rawDb.prepare(`
      SELECT user_id, practice_area_id, tenant_id FROM user_practice_areas
      WHERE practice_area_id LIKE 'pa-med-%'
    `).all() as any[];

    for (const row of existingMedicalUserAreas) {
      const mapping = legacyAreaToSpecMap[row.practice_area_id];
      if (mapping) {
        insUserSpec.run(row.user_id, mapping.specId, row.tenant_id);
        insUserPa.run(row.user_id, mapping.defaultPaId, row.tenant_id);
      }
    }

    // 2. Para profissionais médicos sem vínculos na nova tabela, mapeia a partir da profissão/especialidade
    const medicalDoctors = rawDb.prepare(`
      SELECT p.id as prof_id, p.user_id, p.tenant_id, p.profession_id, p.specialty_id,
             u.profession_name as user_prof_name
      FROM professionals p
      LEFT JOIN users u ON u.id = p.user_id
      WHERE p.zemda_med_enabled = 1
         OR p.profession_id = 'prof-medico'
         OR p.profession_id LIKE 'prof-%med%'
         OR p.profession_id IN (
           'prof-neurologista', 'prof-cardiologista', 'prof-psiquiatra', 'prof-pediatra',
           'prof-geriatra', 'prof-endocrinologista', 'prof-ortopedista', 'prof-reumatologista',
           'prof-ginecologista', 'prof-clinico-geral'
         )
    `).all() as any[];

    for (const doc of medicalDoctors) {
      if (!doc.user_id || !doc.tenant_id) continue;

      const hasSpec = rawDb.prepare(`
        SELECT count(*) as c FROM user_medical_specialties
        WHERE user_id = ? AND tenant_id = ?
      `).get(doc.user_id, doc.tenant_id) as any;

      if (!hasSpec || hasSpec.c === 0) {
        let targetSpec = 'med-spec-clinica';
        let targetPa = 'med-pa-clinica-cronicas';

        const pKey = (doc.profession_id || doc.user_prof_name || '').toLowerCase();
        if (pKey.includes('neuro')) {
          targetSpec = 'med-spec-neuro';
          targetPa = 'med-pa-neuro-geral';
        } else if (pKey.includes('cardio')) {
          targetSpec = 'med-spec-cardio';
          targetPa = 'med-pa-car-geral';
        } else if (pKey.includes('psiqui')) {
          targetSpec = 'med-spec-psiquiatria';
          targetPa = 'med-pa-psic-geral';
        } else if (pKey.includes('pediat')) {
          targetSpec = 'med-spec-pediatria';
          targetPa = 'med-pa-ped-geral';
        } else if (pKey.includes('geriat')) {
          targetSpec = 'med-spec-geriatria';
          targetPa = 'med-pa-ger-geral';
        } else if (pKey.includes('endocrin')) {
          targetSpec = 'med-spec-endocrino';
          targetPa = 'med-pa-end-geral';
        } else if (pKey.includes('ortoped')) {
          targetSpec = 'med-spec-ortopedia';
          targetPa = 'med-pa-ort-geral';
        } else if (pKey.includes('reumat')) {
          targetSpec = 'med-spec-reumato';
          targetPa = 'med-pa-reu-geral';
        } else if (pKey.includes('gineco') || pKey.includes('obstetr')) {
          targetSpec = 'med-spec-gineco';
          targetPa = 'med-pa-gin-geral';
        }

        insUserSpec.run(doc.user_id, targetSpec, doc.tenant_id);
        insUserPa.run(doc.user_id, targetPa, doc.tenant_id);
      }
    }
  } catch (err) {
    console.warn('[MedicalTreeMigration] Reconciliação retroativa executada com resiliência:', err);
  }
}
