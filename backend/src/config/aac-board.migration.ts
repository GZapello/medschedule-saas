import { DatabaseSync } from 'node:sqlite';

export function migrateAACBoard(rawDb: DatabaseSync): void {
  // 1. Criação das tabelas da Prancha de Comunicação CAA
  rawDb.exec(`
    CREATE TABLE IF NOT EXISTS aac_boards (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      patient_id TEXT NOT NULL,
      created_by_professional_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      context TEXT DEFAULT 'Geral',
      columns INTEGER NOT NULL DEFAULT 4,
      status TEXT NOT NULL DEFAULT 'active',
      is_template INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_aac_boards_tenant_patient ON aac_boards(tenant_id, patient_id);

    CREATE TABLE IF NOT EXISTS aac_pages (
      id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL,
      name TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      icon TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (board_id) REFERENCES aac_boards(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_aac_pages_board_pos ON aac_pages(board_id, position);

    CREATE TABLE IF NOT EXISTS aac_cards (
      id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL,
      page_id TEXT NOT NULL,
      label TEXT NOT NULL,
      spoken_text TEXT NOT NULL,
      image_url TEXT,
      symbol_type TEXT DEFAULT 'symbol',
      category TEXT DEFAULT 'action',
      color TEXT DEFAULT '#f1f5f9',
      position INTEGER NOT NULL DEFAULT 0,
      target_page_id TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (board_id) REFERENCES aac_boards(id) ON DELETE CASCADE,
      FOREIGN KEY (page_id) REFERENCES aac_pages(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_aac_cards_page_pos ON aac_cards(page_id, position);
    CREATE INDEX IF NOT EXISTS idx_aac_cards_board ON aac_cards(board_id);
  `);

  // 2. Registro das Capabilities no Catálogo Universal
  const insCapStmt = rawDb.prepare(`
    INSERT OR IGNORE INTO capabilities (id, category, name, description, active)
    VALUES (?, ?, ?, ?, 1)
  `);

  insCapStmt.run(
    'AAC_BOARD_USE',
    'COMMUNICATION',
    'Prancha CAA (Utilização)',
    'Permite abrir, navegar, reproduzir voz e utilizar pranchas de CAA em consultas.'
  );

  insCapStmt.run(
    'AAC_BOARD_MANAGE',
    'COMMUNICATION',
    'Prancha CAA (Gestão e Edição)',
    'Permite criar, editar, personalizar, duplicar e excluir pranchas, páginas e cartões de CAA.'
  );

  // 3. Mapeamento de Regras por Profissão (profession_capabilities)
  const insProfCap = rawDb.prepare(`
    INSERT OR REPLACE INTO profession_capabilities (profession_id, capability_id, rule)
    VALUES (?, ?, ?)
  `);

  let existingProfIds = new Set<string>();
  try {
    existingProfIds = new Set(
      rawDb.prepare('SELECT id FROM professions').all().map((r: any) => r.id)
    );
  } catch (_) {}

  const safeProfCap = (profId: string, capId: string, rule: string) => {
    if (existingProfIds.has(profId)) {
      insProfCap.run(profId, capId, rule);
    }
  };

  // Fonoaudiologia: total acesso padrão incondicional (reconciliação direta em banco existente)
  try {
    rawDb.prepare(`
      INSERT OR REPLACE INTO profession_capabilities (profession_id, capability_id, rule)
      VALUES ('prof-fonoaudiologo', 'AAC_BOARD_USE', 'DEFAULT')
    `).run();
    rawDb.prepare(`
      INSERT OR REPLACE INTO profession_capabilities (profession_id, capability_id, rule)
      VALUES ('prof-fonoaudiologo', 'AAC_BOARD_MANAGE', 'DEFAULT')
    `).run();
    rawDb.prepare(`
      INSERT OR REPLACE INTO profession_capabilities (profession_id, capability_id, rule)
      VALUES ('prof-fonoaudiologia', 'AAC_BOARD_USE', 'DEFAULT')
    `).run();
    rawDb.prepare(`
      INSERT OR REPLACE INTO profession_capabilities (profession_id, capability_id, rule)
      VALUES ('prof-fonoaudiologia', 'AAC_BOARD_MANAGE', 'DEFAULT')
    `).run();
  } catch (_) {}

  safeProfCap('prof-fonoaudiologo', 'AAC_BOARD_USE', 'DEFAULT');
  safeProfCap('prof-fonoaudiologo', 'AAC_BOARD_MANAGE', 'DEFAULT');
  safeProfCap('prof-fonoaudiologia', 'AAC_BOARD_USE', 'DEFAULT');
  safeProfCap('prof-fonoaudiologia', 'AAC_BOARD_MANAGE', 'DEFAULT');

  // Terapia Ocupacional: ativável / opcional na profissão, default nas áreas compatíveis
  safeProfCap('prof-terapeuta-ocupacional', 'AAC_BOARD_USE', 'OPTIONAL');
  safeProfCap('prof-terapeuta-ocupacional', 'AAC_BOARD_MANAGE', 'OPTIONAL');

  // Medicina: ativável / opcional na profissão
  safeProfCap('prof-medico', 'AAC_BOARD_USE', 'OPTIONAL');

  // Fisioterapia: ativável / opcional
  safeProfCap('prof-fisioterapeuta', 'AAC_BOARD_USE', 'OPTIONAL');

  // Psicologia: ativável / opcional
  safeProfCap('prof-psicologo', 'AAC_BOARD_USE', 'OPTIONAL');

  // Psicopedagogia: ativável / opcional
  safeProfCap('prof-psicopedagogo', 'AAC_BOARD_USE', 'OPTIONAL');

  // Enfermagem: ativável / opcional
  safeProfCap('prof-enfermeiro', 'AAC_BOARD_USE', 'OPTIONAL');
  safeProfCap('prof-tec-enfermagem', 'AAC_BOARD_USE', 'OPTIONAL');

  // Musicoterapia e Arteterapia: ativável / opcional
  safeProfCap('prof-musicoterapia', 'AAC_BOARD_USE', 'OPTIONAL');
  safeProfCap('prof-arteterapia', 'AAC_BOARD_USE', 'OPTIONAL');

  // Odontologia: estritamente oculta (não aplicável)
  safeProfCap('prof-dentista', 'AAC_BOARD_USE', 'HIDDEN');
  safeProfCap('prof-dentista', 'AAC_BOARD_MANAGE', 'HIDDEN');

  // 4. Mapeamento por Áreas de Atuação (practice_area_capabilities)
  const insAreaCap = rawDb.prepare(`
    INSERT OR REPLACE INTO practice_area_capabilities (practice_area_id, capability_id, rule)
    VALUES (?, ?, ?)
  `);

  let existingAreaIds = new Set<string>();
  try {
    existingAreaIds = new Set(
      rawDb.prepare('SELECT id FROM practice_areas').all().map((r: any) => r.id)
    );
  } catch (_) {}

  const safeAreaCap = (areaId: string, capId: string, rule: string) => {
    if (existingAreaIds.has(areaId)) {
      insAreaCap.run(areaId, capId, rule);
    }
  };

  // Assegura existência da especialidade/área de Comunicação e Linguagem na Terapia Ocupacional
  try {
    rawDb.prepare(`
      INSERT OR IGNORE INTO practice_areas (id, profession_id, name, slug, type, description, active)
      VALUES (
        'pa-to-comunicacao',
        'prof-terapeuta-ocupacional',
        'Comunicação e Linguagem',
        'comunicacao-linguagem',
        'SPECIALTY',
        'Comunicação Aumentativa e Alternativa (CAA) e intervenções de comunicação funcional na TO',
        1
      )
    `).run();
    existingAreaIds.add('pa-to-comunicacao');
  } catch (_) {}

  // Terapia Ocupacional - Áreas com AAC DEFAULT (USE e MANAGE)
  const toAacAreas = [
    'pa-to-comunicacao',
    'pa-to-neuro',
    'pa-to-pediatria',
    'pa-to-tec-assistiva',
    'pa-to-estimulacao',
    'pa-to-integ-sensorial',
    'pa-to-aba'
  ];
  for (const aId of toAacAreas) {
    safeAreaCap(aId, 'AAC_BOARD_USE', 'DEFAULT');
    safeAreaCap(aId, 'AAC_BOARD_MANAGE', 'DEFAULT');
  }
  safeAreaCap('pa-to-comunicacao', 'COMMUNICATION_ASSESSMENT', 'DEFAULT');
  safeAreaCap('pa-to-comunicacao', 'AAC_COMMUNICATION', 'DEFAULT');

  // Fonoaudiologia - Áreas específicas com AAC DEFAULT
  const fonoAacAreas = [
    'pa-fono-tea',
    'pa-fono-aba',
    'pa-fono-comunicacao',
    'pa-fono-linguagem',
    'pa-fono-ling-infantil',
    'pa-fono-disfagia'
  ];
  for (const aId of fonoAacAreas) {
    safeAreaCap(aId, 'AAC_BOARD_USE', 'DEFAULT');
    safeAreaCap(aId, 'AAC_BOARD_MANAGE', 'DEFAULT');
  }

  // Medicina - Presets de Áreas
  safeAreaCap('pa-med-neuro', 'AAC_BOARD_USE', 'DEFAULT');
  safeAreaCap('pa-med-pediatria', 'AAC_BOARD_USE', 'OPTIONAL');
  safeAreaCap('pa-med-geriatria', 'AAC_BOARD_USE', 'OPTIONAL');
  safeAreaCap('pa-med-psiquiatria', 'AAC_BOARD_USE', 'OPTIONAL');

  // Fisioterapia - Presets de Áreas
  safeAreaCap('pa-fisio-neuro', 'AAC_BOARD_USE', 'OPTIONAL');
  safeAreaCap('pa-fisio-pediatrica', 'AAC_BOARD_USE', 'OPTIONAL');
  safeAreaCap('pa-fisio-geronto', 'AAC_BOARD_USE', 'OPTIONAL');

  // Psicologia - Presets de Áreas
  safeAreaCap('pa-psico-infantil', 'AAC_BOARD_USE', 'OPTIONAL');
  safeAreaCap('pa-psico-neuro', 'AAC_BOARD_USE', 'OPTIONAL');
  safeAreaCap('pa-psico-aba', 'AAC_BOARD_USE', 'OPTIONAL');

  // Psicopedagogia - Presets de Áreas
  safeAreaCap('pa-pp-clinica', 'AAC_BOARD_USE', 'OPTIONAL');
  safeAreaCap('pa-pp-aprendizagem', 'AAC_BOARD_USE', 'OPTIONAL');
  safeAreaCap('pa-pp-desenvolvimento', 'AAC_BOARD_USE', 'OPTIONAL');

  // Nutrição - Presets opcionais para reabilitação/geriatria
  safeAreaCap('pa-nutri-geronto', 'AAC_BOARD_USE', 'OPTIONAL');
  safeAreaCap('pa-nutri-materno', 'AAC_BOARD_USE', 'OPTIONAL');

  // 5. Mapeamento por Especialidades Médicas (medical_specialty_capabilities)
  try {
    const insMedSpecCap = rawDb.prepare(`
      INSERT OR REPLACE INTO medical_specialty_capabilities (medical_specialty_id, capability_id, rule)
      VALUES (?, ?, ?)
    `);

    let existingMedSpecIds = new Set<string>();
    try {
      existingMedSpecIds = new Set(
        rawDb.prepare('SELECT id FROM medical_specialties').all().map((r: any) => r.id)
      );
    } catch (_) {}

    const safeMedSpecCap = (specId: string, capId: string, rule: string) => {
      if (existingMedSpecIds.has(specId)) {
        insMedSpecCap.run(specId, capId, rule);
      }
    };

    // Neurologia médica: AAC_BOARD_USE como DEFAULT
    safeMedSpecCap('med-spec-neuro', 'AAC_BOARD_USE', 'DEFAULT');

    // Pediatria, Geriatria e Psiquiatria: AAC_BOARD_USE como OPTIONAL
    safeMedSpecCap('med-spec-pediatria', 'AAC_BOARD_USE', 'OPTIONAL');
    safeMedSpecCap('med-spec-geriatria', 'AAC_BOARD_USE', 'OPTIONAL');
    safeMedSpecCap('med-spec-psiquiatria', 'AAC_BOARD_USE', 'OPTIONAL');
  } catch (err) {
    console.warn('[AAC Migration] Tabela medical_specialty_capabilities não encontrada ou ignorada:', err);
  }

  // 6. Planos Comerciais (plan_capabilities)
  try {
    const insPlanCap = rawDb.prepare(`
      INSERT OR IGNORE INTO plan_capabilities (plan_id, capability_id)
      VALUES (?, ?)
    `);

    let existingPlanIds = new Set<string>();
    try {
      existingPlanIds = new Set(
        rawDb.prepare('SELECT id FROM plans').all().map((r: any) => r.id)
      );
    } catch (_) {}

    const plansToLiberate = [
      'zemda-CLINIC',
      'plan-clinic',
      'zemda-TEAM',
      'plan-pro',
      'zemda-SOLO',
      'plan-basic'
    ];

    for (const planId of plansToLiberate) {
      if (existingPlanIds.has(planId)) {
        insPlanCap.run(planId, 'AAC_BOARD_USE');
        insPlanCap.run(planId, 'AAC_BOARD_MANAGE');
      }
    }
  } catch (err) {
    console.warn('[AAC Migration] Erro ao associar planos:', err);
  }

  // 7. Sanitização de falas de cartões de templates antigos existentes no banco (restringe clique unitário à palavra do cartão)
  try {
    rawDb.exec(`
      UPDATE aac_cards
      SET spoken_text = label
      WHERE spoken_text LIKE 'Eu quero%'
         OR spoken_text LIKE 'Eu não quero%'
         OR spoken_text LIKE 'Preciso%'
         OR spoken_text LIKE 'Estou com%'
         OR spoken_text LIKE 'Quero%'
         OR spoken_text LIKE 'Vou abrir%'
         OR spoken_text LIKE 'Vamos escolher%'
         OR spoken_text LIKE 'Muito obrigado%'
         OR spoken_text LIKE 'Oi,%'
         OR spoken_text LIKE 'Tchau,%'
         OR spoken_text LIKE 'Voltar para%'
         OR spoken_text LIKE 'Está doendo%'
         OR spoken_text LIKE 'Nossa sessão%';
    `);
  } catch (err) {
    console.warn('[AAC Migration] Aviso ao sanitizar falas de cartões no banco:', err);
  }
}
