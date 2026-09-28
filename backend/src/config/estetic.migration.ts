import { DatabaseSync } from 'node:sqlite';

export function migrateEstetic(rawDb: DatabaseSync): void {
  const addColIfMissing = (table: string, col: string, typeDef: string) => {
    try {
      const cols = (rawDb.prepare(`PRAGMA table_info(${table})`).all() as any[]).map(c => c.name);
      if (cols.length > 0 && !cols.includes(col)) {
        rawDb.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${typeDef};`);
      }
    } catch (_) {}
  };

  // 1. Colunas de habilitação explícita do ZemdaEstetic
  addColIfMissing('users', 'zemda_estetic_enabled', 'INTEGER DEFAULT 0');
  addColIfMissing('clinic_users', 'zemda_estetic_enabled', 'INTEGER DEFAULT 0');
  addColIfMissing('professionals', 'zemda_estetic_enabled', 'INTEGER DEFAULT 0');

  // 2. Criação das tabelas do ZemdaEstetic
  rawDb.exec(`
    -- Catálogo Central de Procedimentos Estéticos
    CREATE TABLE IF NOT EXISTS estetic_procedure_catalog (
      id TEXT PRIMARY KEY,
      tenant_id TEXT, -- NULL para catálogo padrão global da plataforma, ou ID da clínica para personalizados
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      applicable_areas_json TEXT NOT NULL DEFAULT '["FACIAL"]', -- JSON array: ["FACIAL"], ["CORPORAL"], ["CAPILAR"]
      applicable_regions_json TEXT DEFAULT '[]',
      description TEXT,
      default_unit TEXT DEFAULT 'ml',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_estetic_catalog_tenant ON estetic_procedure_catalog(tenant_id, active);

    -- Avaliações Estéticas Clínicas
    CREATE TABLE IF NOT EXISTS estetic_assessments (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      patient_id TEXT NOT NULL,
      professional_id TEXT NOT NULL,
      appointment_id TEXT,
      area TEXT NOT NULL CHECK(area IN ('FACIAL', 'CORPORAL', 'CAPILAR', 'OUTRA')),
      assessment_date TEXT NOT NULL,
      chief_complaint TEXT,
      objectives TEXT,
      clinical_history TEXT,
      specific_data_json TEXT NOT NULL DEFAULT '{}',
      observations TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_estetic_assessments_patient ON estetic_assessments(tenant_id, patient_id, area);
    CREATE INDEX IF NOT EXISTS idx_estetic_assessments_date ON estetic_assessments(tenant_id, assessment_date);

    -- Planejamentos Estéticos
    CREATE TABLE IF NOT EXISTS estetic_plans (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      patient_id TEXT NOT NULL,
      professional_id TEXT NOT NULL,
      area TEXT NOT NULL CHECK(area IN ('FACIAL', 'CORPORAL', 'CAPILAR', 'OUTRA')),
      title TEXT,
      items_json TEXT NOT NULL DEFAULT '[]',
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'PLANEJADO' CHECK(status IN ('PLANEJADO', 'EM_ANDAMENTO', 'CONCLUIDO', 'CANCELADO')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_estetic_plans_patient ON estetic_plans(tenant_id, patient_id, area);

    -- Procedimentos Estéticos Realizados
    CREATE TABLE IF NOT EXISTS estetic_procedures (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      patient_id TEXT NOT NULL,
      professional_id TEXT NOT NULL,
      appointment_id TEXT,
      plan_id TEXT,
      plan_item_id TEXT,
      area TEXT NOT NULL CHECK(area IN ('FACIAL', 'CORPORAL', 'CAPILAR', 'OUTRA')),
      region TEXT NOT NULL,
      procedure_id TEXT,
      procedure_name TEXT NOT NULL,
      product_id TEXT,
      product_name TEXT,
      manufacturer TEXT,
      batch_lot TEXT,
      expiry_date TEXT,
      quantity REAL,
      unit TEXT DEFAULT 'ml',
      observation TEXT,
      technique_notes TEXT,
      adverse_events TEXT,
      return_date TEXT,
      anatomical_map_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_estetic_proc_patient ON estetic_procedures(tenant_id, patient_id, area);
    CREATE INDEX IF NOT EXISTS idx_estetic_proc_created ON estetic_procedures(tenant_id, created_at);

    -- Evoluções Estéticas
    CREATE TABLE IF NOT EXISTS estetic_evolutions (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      patient_id TEXT NOT NULL,
      professional_id TEXT NOT NULL,
      appointment_id TEXT,
      procedure_id TEXT,
      area TEXT NOT NULL CHECK(area IN ('FACIAL', 'CORPORAL', 'CAPILAR', 'OUTRA')),
      evolution_text TEXT NOT NULL,
      observed_response TEXT,
      adverse_events TEXT,
      conduct TEXT,
      return_date TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_estetic_evolutions_patient ON estetic_evolutions(tenant_id, patient_id, area);

    -- Retornos Estéticos
    CREATE TABLE IF NOT EXISTS estetic_returns (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      patient_id TEXT NOT NULL,
      professional_id TEXT NOT NULL,
      procedure_record_id TEXT,
      area TEXT NOT NULL CHECK(area IN ('FACIAL', 'CORPORAL', 'CAPILAR', 'OUTRA')),
      return_assessment TEXT NOT NULL,
      adverse_events TEXT,
      conduct TEXT,
      next_return_date TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_estetic_returns_patient ON estetic_returns(tenant_id, patient_id, area);

    -- Fotografias Clínicas Estéticas
    CREATE TABLE IF NOT EXISTS estetic_photos (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      patient_id TEXT NOT NULL,
      professional_id TEXT NOT NULL,
      appointment_id TEXT,
      procedure_id TEXT,
      area TEXT NOT NULL CHECK(area IN ('FACIAL', 'CORPORAL', 'CAPILAR', 'OUTRA')),
      view_type TEXT NOT NULL, -- FRONTAL, PERFIL_DIR, PERFIL_ESQ, TRES_QUARTOS_DIR, TRES_QUARTOS_ESQ, DETALHE, OUTRA
      file_url TEXT NOT NULL,
      file_key TEXT,
      observation TEXT,
      photo_date TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_estetic_photos_patient ON estetic_photos(tenant_id, patient_id, area, photo_date);
  `);

  // 3. Área de Atuação Capilar no Catálogo Geral (se ausente)
  const capilarExists = rawDb.prepare("SELECT id FROM practice_areas WHERE id = 'pa-estet-capilar'").get();
  if (!capilarExists) {
    rawDb.prepare(`
      INSERT OR IGNORE INTO practice_areas (id, profession_id, name, slug, type, description, active)
      VALUES ('pa-estet-capilar', 'prof-esteticista', 'Tricologia e Estética Capilar', 'estetica-capilar', 'AREA', 'Avaliação e procedimentos de saúde capilar e couro cabeludo', 1)
    `).run();
  }

  // 4. Catálogo Universal de Capabilities Estéticas
  const aestheticCapabilities = [
    { id: 'ESTETIC_FACIAL', category: 'ESTETIC', name: 'Estética Facial', description: 'Procedimentos e acompanhamento de estética facial e rejuvenescimento' },
    { id: 'ESTETIC_BODY', category: 'ESTETIC', name: 'Estética Corporal', description: 'Procedimentos e acompanhamento de estética corporal, contorno e drenagem' },
    { id: 'ESTETIC_HAIR', category: 'ESTETIC', name: 'Estética Capilar', description: 'Procedimentos e acompanhamento de tricologia e estética capilar' },
    { id: 'ESTETIC_ASSESSMENT', category: 'ESTETIC', name: 'Avaliação Estética', description: 'Fichas clínicas de anamnese e avaliação estética especializada' },
    { id: 'ESTETIC_PHOTOS', category: 'ESTETIC', name: 'Fotografias Clínicas Estéticas', description: 'Galeria padronizada de imagens clínicas por áreas e vistas' },
    { id: 'ESTETIC_PLANNING', category: 'ESTETIC', name: 'Planejamento Estético', description: 'Elaboração e acompanhamento de planos de tratamento estéticos' },
    { id: 'ESTETIC_PROCEDURES', category: 'ESTETIC', name: 'Registro de Procedimentos', description: 'Registro detalhado com lote, validade, técnica e insumos' },
    { id: 'ESTETIC_PRODUCTS', category: 'ESTETIC', name: 'Rastreabilidade de Produtos e Estoque', description: 'Integração de insumos e produtos com controle de estoque' },
    { id: 'ESTETIC_BEFORE_AFTER', category: 'ESTETIC', name: 'Antes × Depois', description: 'Comparador fotográfico lado a lado com alinhamento de vistas' },
    { id: 'ESTETIC_EVOLUTION', category: 'ESTETIC', name: 'Evolução Estética', description: 'Evolução clínica e acompanhamento de resposta aos procedimentos' },
    { id: 'ESTETIC_RETURNS', category: 'ESTETIC', name: 'Retorno Estético', description: 'Controle de retornos pós-procedimento e condutas' },
    { id: 'ESTETIC_HISTORY', category: 'ESTETIC', name: 'Histórico e Linha do Tempo', description: 'Timeline completa e longitudinal de atendimentos estéticos' },
    { id: 'ESTETIC_360_FACE', category: 'ESTETIC', name: 'Zemda360 Facial', description: 'Integração anatômica visual facial com mapa interativo' },
    { id: 'ESTETIC_360_BODY', category: 'ESTETIC', name: 'Zemda360 Corporal', description: 'Integração anatômica visual corporal com mapa interativo' }
  ];

  const insertCapStmt = rawDb.prepare(`
    INSERT OR REPLACE INTO capabilities (id, category, name, description, active)
    VALUES (?, ?, ?, ?, 1)
  `);
  for (const c of aestheticCapabilities) {
    insertCapStmt.run(c.id, c.category, c.name, c.description);
  }

  // 5. Mapeamento Profissão x Capabilities (Regras DEFAULT para prof-esteticista)
  const esteticistaCaps = [
    'ESTETIC_FACIAL', 'ESTETIC_BODY', 'ESTETIC_HAIR',
    'ESTETIC_ASSESSMENT', 'ESTETIC_PHOTOS', 'ESTETIC_PLANNING',
    'ESTETIC_PROCEDURES', 'ESTETIC_PRODUCTS', 'ESTETIC_BEFORE_AFTER',
    'ESTETIC_EVOLUTION', 'ESTETIC_RETURNS', 'ESTETIC_HISTORY',
    'ESTETIC_360_FACE', 'ESTETIC_360_BODY'
  ];
  const insertProfCapStmt = rawDb.prepare(`
    INSERT OR REPLACE INTO profession_capabilities (profession_id, capability_id, rule)
    VALUES (?, ?, ?)
  `);
  for (const capId of esteticistaCaps) {
    insertProfCapStmt.run('prof-esteticista', capId, 'DEFAULT');
  }

  // 6. Mapeamento Área de Atuação x Capabilities
  const insertPaCapStmt = rawDb.prepare(`
    INSERT OR REPLACE INTO practice_area_capabilities (practice_area_id, capability_id, rule)
    VALUES (?, ?, 'DEFAULT')
  `);

  // Facial
  const facialCaps = [
    'ESTETIC_FACIAL', 'ESTETIC_ASSESSMENT', 'ESTETIC_PHOTOS',
    'ESTETIC_PLANNING', 'ESTETIC_PROCEDURES', 'ESTETIC_PRODUCTS',
    'ESTETIC_BEFORE_AFTER', 'ESTETIC_EVOLUTION', 'ESTETIC_RETURNS',
    'ESTETIC_HISTORY', 'ESTETIC_360_FACE'
  ];
  for (const cap of facialCaps) {
    insertPaCapStmt.run('pa-estet-facial', cap);
    // Harmonização Orofacial e Estética (Cirurgião-Dentista com especialidade HOF)
    insertPaCapStmt.run('pa-odonto-estetica', cap);
  }

  // Corporal
  const corporalCaps = [
    'ESTETIC_BODY', 'ESTETIC_ASSESSMENT', 'ESTETIC_PHOTOS',
    'ESTETIC_PLANNING', 'ESTETIC_PROCEDURES', 'ESTETIC_PRODUCTS',
    'ESTETIC_BEFORE_AFTER', 'ESTETIC_EVOLUTION', 'ESTETIC_RETURNS',
    'ESTETIC_HISTORY', 'ESTETIC_360_BODY'
  ];
  for (const cap of corporalCaps) {
    insertPaCapStmt.run('pa-estet-corporal', cap);
  }

  // Capilar
  const capilarCaps = [
    'ESTETIC_HAIR', 'ESTETIC_ASSESSMENT', 'ESTETIC_PHOTOS',
    'ESTETIC_PLANNING', 'ESTETIC_PROCEDURES', 'ESTETIC_PRODUCTS',
    'ESTETIC_BEFORE_AFTER', 'ESTETIC_EVOLUTION', 'ESTETIC_RETURNS',
    'ESTETIC_HISTORY'
  ];
  for (const cap of capilarCaps) {
    insertPaCapStmt.run('pa-estet-capilar', cap);
  }

  // Biomedicina e Farmácia Estética
  for (const cap of [...facialCaps, ...corporalCaps, ...capilarCaps]) {
    insertPaCapStmt.run('pa-biomed-estetica', cap);
    insertPaCapStmt.run('pa-farm-estetica', cap);
  }

  // 7. Catálogo Padrão de Procedimentos Clínicos Estéticos
  const defaultCatalog = [
    // Facial
    {
      id: 'proc-toxina-botulinica',
      name: 'Toxina Botulínica (Terço Superior/Facial)',
      category: 'Toxina Botulínica',
      applicable_areas_json: JSON.stringify(['FACIAL']),
      applicable_regions_json: JSON.stringify(['forehead', 'glabella', 'crows_feet', 'nasal']),
      description: 'Aplicação para modulação muscular e suavização de rugas dinâmicas',
      default_unit: 'UI'
    },
    {
      id: 'proc-preenchimento-labial',
      name: 'Preenchimento Labial com Ácido Hialurônico',
      category: 'Injetáveis e Preenchedores',
      applicable_areas_json: JSON.stringify(['FACIAL']),
      applicable_regions_json: JSON.stringify(['lips_upper', 'lips_lower', 'philtrum']),
      description: 'Definição de contorno, hidratação e volumização labial',
      default_unit: 'ml'
    },
    {
      id: 'proc-preenchimento-malar',
      name: 'Preenchimento Malar e Zigomático',
      category: 'Injetáveis e Preenchedores',
      applicable_areas_json: JSON.stringify(['FACIAL']),
      applicable_regions_json: JSON.stringify(['malar_right', 'malar_left', 'zygomatic']),
      description: 'Sustentação do terço médio da face e restauração de volume',
      default_unit: 'ml'
    },
    {
      id: 'proc-preenchimento-mandibular',
      name: 'Preenchimento e Contorno Mandibular',
      category: 'Injetáveis e Preenchedores',
      applicable_areas_json: JSON.stringify(['FACIAL']),
      applicable_regions_json: JSON.stringify(['mandible', 'chin']),
      description: 'Definição do ângulo mandibular e projeção mentoniana',
      default_unit: 'ml'
    },
    {
      id: 'proc-bioestimulador-facial',
      name: 'Bioestimulador de Colágeno Facial (Sculptra / Radiesse)',
      category: 'Bioestimuladores de Colágeno',
      applicable_areas_json: JSON.stringify(['FACIAL']),
      applicable_regions_json: JSON.stringify(['cheek_right', 'cheek_left', 'preauricular', 'temple']),
      description: 'Estímulo neocolagênese para combate à flacidez e melhoria dérmica',
      default_unit: 'frasco'
    },
    {
      id: 'proc-fios-pdo-facial',
      name: 'Fios de PDO (Sustentação / Estímulo Dérmico)',
      category: 'Fios de Sustentação',
      applicable_areas_json: JSON.stringify(['FACIAL']),
      applicable_regions_json: JSON.stringify(['cheek_right', 'cheek_left', 'mandible', 'eyebrow']),
      description: 'Tração tecidual e indução contínua de colágeno',
      default_unit: 'fios'
    },
    {
      id: 'proc-peeling-quimico-facial',
      name: 'Peeling Químico Facial (Médio / Superficial)',
      category: 'Peelings Químicos',
      applicable_areas_json: JSON.stringify(['FACIAL']),
      applicable_regions_json: JSON.stringify(['face_all']),
      description: 'Renovação celular, despigmentação e controle de oleosidade/textura',
      default_unit: 'sessão'
    },
    {
      id: 'proc-limpeza-pele-profunda',
      name: 'Limpeza de Pele Profunda e Fototerapia',
      category: 'Limpeza e Revitalização',
      applicable_areas_json: JSON.stringify(['FACIAL']),
      applicable_regions_json: JSON.stringify(['face_all']),
      description: 'Higienização, emoliência, extração de comedões e máscara regeneradora',
      default_unit: 'sessão'
    },
    {
      id: 'proc-microagulhamento-facial',
      name: 'Microagulhamento Dérmico / Drug Delivery Facial',
      category: 'Tecnologias e Indução de Colágeno',
      applicable_areas_json: JSON.stringify(['FACIAL']),
      applicable_regions_json: JSON.stringify(['face_all']),
      description: 'Indução percutânea de colágeno com ativos estéreis',
      default_unit: 'sessão'
    },

    // Corporal
    {
      id: 'proc-bioestimulador-gluteo',
      name: 'Bioestimulador de Colágeno Glúteo / Corporal',
      category: 'Bioestimuladores de Colágeno',
      applicable_areas_json: JSON.stringify(['CORPORAL']),
      applicable_regions_json: JSON.stringify(['gluteus_right', 'gluteus_left', 'abdomen', 'thigh_inner']),
      description: 'Bioestímulo para firmeza, contorno e tratamento de celulite/flacidez',
      default_unit: 'frasco'
    },
    {
      id: 'proc-enzimas-gordura',
      name: 'Intradermoterapia / Lipolíticos (Gordura Localizada)',
      category: 'Estética Corporal',
      applicable_areas_json: JSON.stringify(['CORPORAL', 'FACIAL']),
      applicable_regions_json: JSON.stringify(['abdomen', 'flanks', 'submental', 'arms']),
      description: 'Aplicação de mesclas lipolíticas em tecido adiposo subcutâneo',
      default_unit: 'sessão'
    },
    {
      id: 'proc-drenagem-linfatica',
      name: 'Drenagem Linfática Manual Especializada',
      category: 'Estética Corporal',
      applicable_areas_json: JSON.stringify(['CORPORAL']),
      applicable_regions_json: JSON.stringify(['abdomen', 'legs', 'flanks', 'arms']),
      description: 'Estimulação do sistema linfático para redução de edema e retenção',
      default_unit: 'sessão'
    },
    {
      id: 'proc-radiofrequencia-corporal',
      name: 'Radiofrequência Corporal / Flacidez Tissular',
      category: 'Laser e Tecnologias',
      applicable_areas_json: JSON.stringify(['CORPORAL']),
      applicable_regions_json: JSON.stringify(['abdomen', 'gluteus', 'thighs']),
      description: 'Hipertermia controlada para contração e remodelamento de fibras elásticas',
      default_unit: 'sessão'
    },

    // Capilar
    {
      id: 'proc-mmp-capilar',
      name: 'Microinfusão de Medicamentos na Pele (MMP Capilar)',
      category: 'Tricologia e Capilar',
      applicable_areas_json: JSON.stringify(['CAPILAR']),
      applicable_regions_json: JSON.stringify(['scalp_frontal', 'scalp_vertex', 'scalp_crown']),
      description: 'Entrega transdérmica de fatores de crescimento e vitaminas no folículo',
      default_unit: 'sessão'
    },
    {
      id: 'proc-mesoterapia-capilar',
      name: 'Mesoterapia / Intradermoterapia Capilar',
      category: 'Tricologia e Capilar',
      applicable_areas_json: JSON.stringify(['CAPILAR']),
      applicable_regions_json: JSON.stringify(['scalp_all']),
      description: 'Injeção de nutrientes e estimulantes do ciclo anágeno folicular',
      default_unit: 'sessão'
    },
    {
      id: 'proc-ledterapia-capilar',
      name: 'Fotobiomodulação / Laser de Baixa Potência Capilar',
      category: 'Tricologia e Capilar',
      applicable_areas_json: JSON.stringify(['CAPILAR']),
      applicable_regions_json: JSON.stringify(['scalp_all']),
      description: 'Bioestimulação mitocondrial celular para oxigenação capilar',
      default_unit: 'sessão'
    }
  ];

  const insertCatalogStmt = rawDb.prepare(`
    INSERT OR REPLACE INTO estetic_procedure_catalog (
      id, tenant_id, name, category, applicable_areas_json, applicable_regions_json, description, default_unit, active
    ) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, 1)
  `);

  for (const item of defaultCatalog) {
    insertCatalogStmt.run(
      item.id,
      item.name,
      item.category,
      item.applicable_areas_json,
      item.applicable_regions_json,
      item.description,
      item.default_unit
    );
  }
}
