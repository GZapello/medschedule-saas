import { DatabaseSync } from 'node:sqlite';

/**
 * Migração de Normalização Estrutural de Profissões, Especialidades e Funções do Zemda
 * 
 * Regras:
 * 1. PROFISSÃO representa a profissão-base canônica (Médico, Cirurgião-Dentista, Fonoaudiólogo, etc.)
 * 2. ESPECIALIDADES médicas e odontológicas NÃO são profissões no catálogo principal
 * 3. FUNÇÕES ADMINISTRATIVAS (Gestor da Clínica, Coordenação Clínica, etc.) são papéis/funções no sistema (RBAC)
 * 4. Migração 100% não-destrutiva: nenhum usuário, prontuário, agendamento ou permissão é apagado
 */
export function migrateProfessionsNormalization(rawDb: DatabaseSync): void {
  // Helper para adicionar coluna com segurança
  const addColIfMissing = (table: string, col: string, typeDef: string) => {
    try {
      const cols = (rawDb.prepare(`PRAGMA table_info(${table})`).all() as any[]).map(c => c.name);
      if (cols.length > 0 && !cols.includes(col)) {
        rawDb.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${typeDef};`);
      }
    } catch (_) {}
  };

  addColIfMissing('professions', 'is_canonical', 'INTEGER NOT NULL DEFAULT 1');
  addColIfMissing('professionals', 'system_role', "TEXT DEFAULT 'professional'");
  addColIfMissing('users', 'system_role', "TEXT DEFAULT 'professional'");

  // 1. Atualiza e Padroniza as Profissões-Base Canônicas em 'professions'
  const canonicalProfessions = [
    { id: 'prof-medico', name: 'Médico', slug: 'medico', reg_label: 'CRM', reg_req: 1, cat_id: 'cat-med' },
    { id: 'prof-dentista', name: 'Cirurgião-Dentista', slug: 'dentista', reg_label: 'CRO', reg_req: 1, cat_id: 'cat-odonto' },
    { id: 'prof-fisioterapeuta', name: 'Fisioterapeuta', slug: 'fisioterapeuta', reg_label: 'CREFITO', reg_req: 1, cat_id: 'cat-reab' },
    { id: 'prof-fonoaudiologo', name: 'Fonoaudiólogo', slug: 'fonoaudiologo', reg_label: 'CRFa', reg_req: 1, cat_id: 'cat-fono' },
    { id: 'prof-nutricionista', name: 'Nutricionista', slug: 'nutricionista', reg_label: 'CRN', reg_req: 1, cat_id: 'cat-nutri' },
    { id: 'prof-psicologo', name: 'Psicólogo', slug: 'psicologo', reg_label: 'CRP', reg_req: 1, cat_id: 'cat-mental' },
    { id: 'prof-psicanalista', name: 'Psicanalista', slug: 'psicanalista', reg_label: 'Registro Associação', reg_req: 0, cat_id: 'cat-mental' },
    { id: 'prof-psicoterapeuta', name: 'Psicoterapeuta', slug: 'psicoterapeuta', reg_label: 'CRP / Associação', reg_req: 0, cat_id: 'cat-mental' },
    { id: 'prof-terapeuta-ocupacional', name: 'Terapeuta Ocupacional', slug: 'terapeuta-ocupacional', reg_label: 'CREFITO', reg_req: 1, cat_id: 'cat-reab' },
    { id: 'prof-psicopedagogo', name: 'Psicopedagogo', slug: 'psicopedagogo', reg_label: 'ABPp', reg_req: 0, cat_id: 'cat-mental' },
    { id: 'prof-personal-trainer', name: 'Profissional de Educação Física', slug: 'personal-trainer', reg_label: 'CREF', reg_req: 1, cat_id: 'cat-esporte' },
    { id: 'prof-enfermeiro', name: 'Enfermeiro', slug: 'enfermeiro', reg_label: 'COREN', reg_req: 1, cat_id: 'cat-enfermagem' },
    { id: 'prof-tec-enfermagem', name: 'Técnico de Enfermagem', slug: 'tecnico-enfermagem', reg_label: 'COREN', reg_req: 1, cat_id: 'cat-enfermagem' },
    { id: 'prof-biomedicina', name: 'Biomédico', slug: 'biomedicina', reg_label: 'CRBM', reg_req: 1, cat_id: 'cat-outros' },
    { id: 'prof-farmacia', name: 'Farmacêutico', slug: 'farmacia', reg_label: 'CRF', reg_req: 1, cat_id: 'cat-outros' },
    { id: 'prof-servico-social', name: 'Assistente Social', slug: 'servico-social', reg_label: 'CRESS', reg_req: 1, cat_id: 'cat-outros' },
    { id: 'prof-esteticista', name: 'Esteticista', slug: 'esteticista', reg_label: 'Registro Técnico', reg_req: 0, cat_id: 'cat-beleza' },
    { id: 'prof-acupuntura', name: 'Acupunturista', slug: 'acupuntura', reg_label: 'Registro', reg_req: 0, cat_id: 'cat-integrativa' },
    { id: 'prof-osteopata', name: 'Osteopata', slug: 'osteopata', reg_label: 'Registro', reg_req: 0, cat_id: 'cat-reab' },
    { id: 'prof-quiropraxista', name: 'Quiropraxista', slug: 'quiropraxista', reg_label: 'ABQ', reg_req: 0, cat_id: 'cat-reab' },
    { id: 'prof-podologia', name: 'Podólogo', slug: 'podologia', reg_label: 'Registro Técnico', reg_req: 0, cat_id: 'cat-beleza' },
    { id: 'prof-musicoterapia', name: 'Musicoterapeuta', slug: 'musicoterapia', reg_label: 'UBAM', reg_req: 0, cat_id: 'cat-integrativa' },
    { id: 'prof-arteterapia', name: 'Arteterapeuta', slug: 'arteterapia', reg_label: 'UBAAT', reg_req: 0, cat_id: 'cat-integrativa' },
    { id: 'prof-doula', name: 'Doula / Consultora de Amamentação', slug: 'doula', reg_label: 'Certificação', reg_req: 0, cat_id: 'cat-maternidade' },
    { id: 'prof-instrutor-pilates', name: 'Instrutor de Pilates', slug: 'instrutor-pilates', reg_label: 'Certificação', reg_req: 0, cat_id: 'cat-esporte' },
    { id: 'prof-outro-saude', name: 'Outro profissional da saúde', slug: 'outro-saude', reg_label: 'Conselho/Registro', reg_req: 0, cat_id: 'cat-outros' },
    { id: 'prof-outro', name: 'Outro Profissional', slug: 'outro', reg_label: 'Registro', reg_req: 0, cat_id: 'cat-outros' }
  ];

  const upsertProf = rawDb.prepare(`
    INSERT INTO professions (id, category_id, name, slug, registration_board_label, registration_required, active, is_canonical)
    VALUES (?, ?, ?, ?, ?, ?, 1, 1)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      registration_board_label = excluded.registration_board_label,
      registration_required = excluded.registration_required,
      active = 1,
      is_canonical = 1
  `);

  for (const p of canonicalProfessions) {
    try {
      upsertProf.run(p.id, p.cat_id, p.name, p.slug, p.reg_label, p.reg_req);
    } catch (_) {}
  }

  // 2. Marca registros de especialidades e cargos como is_canonical = 0 (preserva o registro no banco para FKs antigas)
  const legacyNonCanonicalIds = [
    // Especialidades médicas cadastradas incorretamente como profissões
    'prof-cardiologista', 'prof-dermatologista', 'prof-endocrinologista', 'prof-geriatra',
    'prof-ginecologista', 'prof-neurologista', 'prof-ortopedista', 'prof-pediatra',
    'prof-psiquiatra', 'prof-reumatologista', 'prof-clinico-geral', 'prof-medicina',
    // Especialidades / nomes de área odontológicos
    'prof-odontologia', 'prof-ortodontista',
    // Especialidades / nomes de área de psicologia
    'prof-psicologia', 'prof-neuropsicologo', 'prof-terapeuta-familiar',
    // Variações de área x profissional
    'prof-fisioterapia', 'prof-fonoaudiologia', 'prof-enfermagem', 'prof-nutricao',
    'prof-terapia-ocupacional', 'prof-psicopedagogia', 'prof-educacao-fisica',
    // Cargos e funções administrativas (não são profissões clínicas)
    'prof-administrador', 'prof-gestor', 'prof-auxiliar-adm', 'prof-recepcionista',
    'prof-secretaria', 'prof-financeiro', 'prof-rh', 'prof-coord-clinica', 'prof-direcao-tecnica'
  ];

  const updateCanonicalZero = rawDb.prepare(`
    UPDATE professions SET is_canonical = 0 WHERE id = ?
  `);
  for (const id of legacyNonCanonicalIds) {
    try {
      updateCanonicalZero.run(id);
    } catch (_) {}
  }

  try {
    rawDb.prepare(`
      UPDATE professions 
      SET active = 1, is_canonical = 1, category_id = 'cat-mental', registration_board_label = 'Registro Associação'
      WHERE id = 'prof-psicanalista'
    `).run();
    rawDb.prepare(`
      UPDATE professions 
      SET active = 1, is_canonical = 1, category_id = 'cat-mental', registration_board_label = 'CRP / Associação'
      WHERE id = 'prof-psicoterapeuta'
    `).run();
    rawDb.prepare(`
      UPDATE professions 
      SET active = 1, is_canonical = 1 
      WHERE id IN ('prof-fonoaudiologo', 'prof-psicopedagogo', 'prof-terapeuta-ocupacional')
    `).run();
    rawDb.prepare(`
      DELETE FROM deleted_global_professions 
      WHERE id IN (
        'prof-fonoaudiologo', 
        'prof-psicopedagogo', 
        'prof-terapeuta-ocupacional', 
        'prof-psicanalista', 
        'prof-psicoterapeuta'
      )
    `).run();
  } catch (_) {}

  // 3. Semeia e Padroniza Especialidades Odontológicas em 'specialties' (prof_id = 'prof-dentista')
  const dentalSpecialties = [
    { id: 'spec-odonto-geral', name: 'Clínica Geral', slug: 'clinica-geral', color: '#3b82f6' },
    { id: 'spec-odonto-orto', name: 'Ortodontia', slug: 'ortodontia', color: '#6366f1' },
    { id: 'spec-odonto-endo', name: 'Endodontia', slug: 'endodontia', color: '#ef4444' },
    { id: 'spec-odonto-perio', name: 'Periodontia', slug: 'periodontia', color: '#10b981' },
    { id: 'spec-odonto-implante', name: 'Implantodontia', slug: 'implantodontia', color: '#06b6d4' },
    { id: 'spec-odonto-protese', name: 'Prótese Dentária', slug: 'protese-dentaria', color: '#8b5cf6' },
    { id: 'spec-odonto-pediatria', name: 'Odontopediatria', slug: 'odontopediatria', color: '#ec4899' },
    { id: 'spec-odonto-buco', name: 'Cirurgia e Traumatologia Bucomaxilofacial', slug: 'bucomaxilofacial', color: '#f59e0b' },
    { id: 'spec-odonto-dtm', name: 'DTM e Dor Orofacial', slug: 'dtm-dor-orofacial', color: '#d97706' },
    { id: 'spec-odonto-hof', name: 'Harmonização Orofacial', slug: 'harmonizacao-orofacial', color: '#14b8a6' }
  ];

  const upsertSpec = rawDb.prepare(`
    INSERT INTO specialties (id, profession_id, name, slug, color, active)
    VALUES (?, ?, ?, ?, ?, 1)
    ON CONFLICT(id) DO UPDATE SET
      profession_id = excluded.profession_id,
      name = excluded.name,
      slug = excluded.slug,
      active = 1
  `);

  for (const s of dentalSpecialties) {
    try {
      upsertSpec.run(s.id, 'prof-dentista', s.name, s.slug, s.color);
    } catch (_) {}
  }

  // 4. Semeia e Padroniza Especialidades Médicas em 'specialties' (prof_id = 'prof-medico')
  const medicalSpecialties = [
    { id: 'med-spec-clinica', name: 'Clínica Médica', slug: 'clinica-medica', color: '#3b82f6' },
    { id: 'med-spec-cardio', name: 'Cardiologia', slug: 'cardiologia', color: '#ef4444' },
    { id: 'med-spec-dermato', name: 'Dermatologia', slug: 'dermatologia', color: '#f59e0b' },
    { id: 'med-spec-endocrino', name: 'Endocrinologia e Metabologia', slug: 'endocrinologia', color: '#8b5cf6' },
    { id: 'med-spec-geriatria', name: 'Geriatria', slug: 'geriatria', color: '#6366f1' },
    { id: 'med-spec-gineco', name: 'Ginecologia e Obstetrícia', slug: 'ginecologia-obstetricia', color: '#ec4899' },
    { id: 'med-spec-neurologia', name: 'Neurologia', slug: 'neurologia', color: '#14b8a6' },
    { id: 'med-spec-ortopedia', name: 'Ortopedia e Traumatologia', slug: 'ortopedia', color: '#0ea5e9' },
    { id: 'med-spec-pediatria', name: 'Pediatria', slug: 'pediatria', color: '#10b981' },
    { id: 'med-spec-psiquiatria', name: 'Psiquiatria', slug: 'psiquiatria', color: '#a855f7' },
    { id: 'med-spec-reumato', name: 'Reumatologia', slug: 'reumatologia', color: '#d97706' },
    { id: 'med-spec-gastro', name: 'Gastroenterologia', slug: 'gastroenterologia', color: '#84cc16' },
    { id: 'med-spec-oftalmo', name: 'Oftalmologia', slug: 'oftalmologia', color: '#06b6d4' },
    { id: 'med-spec-otorrino', name: 'Otorrinolaringologia', slug: 'otorrinolaringologia', color: '#64748b' },
    { id: 'med-spec-urologia', name: 'Urologia', slug: 'urologia', color: '#0284c7' }
  ];

  for (const s of medicalSpecialties) {
    try {
      upsertSpec.run(s.id, 'prof-medico', s.name, s.slug, s.color);
    } catch (_) {}
  }

  // 5. Migração retroativa de usuários, profissionais e vínculos (Não-destrutiva)
  // Mapeamento de migração: ID Antigo -> { canonicalProfId, canonicalProfName, specialtyId, specialtyName, systemRole? }
  const migrationMap: Record<string, {
    canonicalProfId: string;
    canonicalProfName: string;
    specialtyId?: string;
    specialtyName?: string;
    systemRole?: string;
  }> = {
    // Especialidades médicas
    'prof-cardiologista': { canonicalProfId: 'prof-medico', canonicalProfName: 'Médico', specialtyId: 'med-spec-cardio', specialtyName: 'Cardiologia' },
    'prof-dermatologista': { canonicalProfId: 'prof-medico', canonicalProfName: 'Médico', specialtyId: 'med-spec-dermato', specialtyName: 'Dermatologia' },
    'prof-endocrinologista': { canonicalProfId: 'prof-medico', canonicalProfName: 'Médico', specialtyId: 'med-spec-endocrino', specialtyName: 'Endocrinologia e Metabologia' },
    'prof-geriatra': { canonicalProfId: 'prof-medico', canonicalProfName: 'Médico', specialtyId: 'med-spec-geriatria', specialtyName: 'Geriatria' },
    'prof-ginecologista': { canonicalProfId: 'prof-medico', canonicalProfName: 'Médico', specialtyId: 'med-spec-gineco', specialtyName: 'Ginecologia e Obstetrícia' },
    'prof-neurologista': { canonicalProfId: 'prof-medico', canonicalProfName: 'Médico', specialtyId: 'med-spec-neurologia', specialtyName: 'Neurologia' },
    'prof-ortopedista': { canonicalProfId: 'prof-medico', canonicalProfName: 'Médico', specialtyId: 'med-spec-ortopedia', specialtyName: 'Ortopedia e Traumatologia' },
    'prof-pediatra': { canonicalProfId: 'prof-medico', canonicalProfName: 'Médico', specialtyId: 'med-spec-pediatria', specialtyName: 'Pediatria' },
    'prof-psiquiatra': { canonicalProfId: 'prof-medico', canonicalProfName: 'Médico', specialtyId: 'med-spec-psiquiatria', specialtyName: 'Psiquiatria' },
    'prof-reumatologista': { canonicalProfId: 'prof-medico', canonicalProfName: 'Médico', specialtyId: 'med-spec-reumato', specialtyName: 'Reumatologia' },
    'prof-clinico-geral': { canonicalProfId: 'prof-medico', canonicalProfName: 'Médico', specialtyId: 'med-spec-clinica', specialtyName: 'Clínica Médica' },
    'prof-medicina': { canonicalProfId: 'prof-medico', canonicalProfName: 'Médico' },

    // Odontologia
    'prof-ortodontista': { canonicalProfId: 'prof-dentista', canonicalProfName: 'Cirurgião-Dentista', specialtyId: 'spec-odonto-orto', specialtyName: 'Ortodontia' },
    'prof-odontologia': { canonicalProfId: 'prof-dentista', canonicalProfName: 'Cirurgião-Dentista' },

    // Psicologia
    'prof-psicologia': { canonicalProfId: 'prof-psicologo', canonicalProfName: 'Psicólogo' },
    'prof-neuropsicologo': { canonicalProfId: 'prof-psicologo', canonicalProfName: 'Psicólogo', specialtyId: 'spec-psi-neuropsi', specialtyName: 'Neuropsicologia Clínica' },
    'prof-psicanalista': { canonicalProfId: 'prof-psicologo', canonicalProfName: 'Psicólogo', specialtyId: 'spec-psi-psicanalise', specialtyName: 'Psicanálise' },
    'prof-psicoterapeuta': { canonicalProfId: 'prof-psicologo', canonicalProfName: 'Psicólogo' },
    'prof-psicoterapia': { canonicalProfId: 'prof-psicologo', canonicalProfName: 'Psicólogo' },
    'prof-terapeuta-familiar': { canonicalProfId: 'prof-psicologo', canonicalProfName: 'Psicólogo', specialtyId: 'spec-psi-casal', specialtyName: 'Terapia Familiar e de Casal' },

    // Nomes de área
    'prof-fisioterapia': { canonicalProfId: 'prof-fisioterapeuta', canonicalProfName: 'Fisioterapeuta' },
    'prof-fonoaudiologia': { canonicalProfId: 'prof-fonoaudiologo', canonicalProfName: 'Fonoaudiólogo' },
    'prof-enfermagem': { canonicalProfId: 'prof-enfermeiro', canonicalProfName: 'Enfermeiro' },
    'prof-nutricao': { canonicalProfId: 'prof-nutricionista', canonicalProfName: 'Nutricionista' },
    'prof-terapia-ocupacional': { canonicalProfId: 'prof-terapeuta-ocupacional', canonicalProfName: 'Terapeuta Ocupacional' },
    'prof-psicopedagogia': { canonicalProfId: 'prof-psicopedagogo', canonicalProfName: 'Psicopedagogo' },
    'prof-educacao-fisica': { canonicalProfId: 'prof-personal-trainer', canonicalProfName: 'Profissional de Educação Física' },
    'prof-educador-fisico': { canonicalProfId: 'prof-personal-trainer', canonicalProfName: 'Profissional de Educação Física' },

    // Funções Administrativas
    'prof-gestor': { canonicalProfId: '', canonicalProfName: '', systemRole: 'clinic_admin' },
    'prof-administrador': { canonicalProfId: '', canonicalProfName: '', systemRole: 'clinic_admin' },
    'prof-coord-clinica': { canonicalProfId: '', canonicalProfName: '', systemRole: 'clinical_coordinator' },
    'prof-direcao-tecnica': { canonicalProfId: '', canonicalProfName: '', systemRole: 'technical_director' },
    'prof-rh': { canonicalProfId: '', canonicalProfName: '', systemRole: 'hr' },
    'prof-recepcionista': { canonicalProfId: '', canonicalProfName: '', systemRole: 'receptionist' },
    'prof-secretaria': { canonicalProfId: '', canonicalProfName: '', systemRole: 'secretary' },
    'prof-auxiliar-adm': { canonicalProfId: '', canonicalProfName: '', systemRole: 'assistant' },
    'prof-financeiro': { canonicalProfId: '', canonicalProfName: '', systemRole: 'financial' }
  };

  // Executa migração em transação protegida
  try {
    rawDb.exec('BEGIN TRANSACTION;');

    for (const [oldId, mapping] of Object.entries(migrationMap)) {
      if (mapping.canonicalProfId) {
        // Atualiza professionals
        rawDb.prepare(`
          UPDATE professionals
          SET profession_id = ?,
              profession_name = ?,
              specialty_id = COALESCE(specialty_id, ?),
              specialty_custom = COALESCE(specialty_custom, ?)
          WHERE profession_id = ?
        `).run(
          mapping.canonicalProfId,
          mapping.canonicalProfName,
          mapping.specialtyId || null,
          mapping.specialtyName || null,
          oldId
        );

        // Atualiza users
        rawDb.prepare(`
          UPDATE users
          SET profession_id = ?,
              profession_name = ?
          WHERE profession_id = ?
        `).run(
          mapping.canonicalProfId,
          mapping.canonicalProfName,
          oldId
        );

        // Atualiza clinic_users
        rawDb.prepare(`
          UPDATE clinic_users
          SET profession_id = ?,
              profession_name = ?
          WHERE profession_id = ?
        `).run(
          mapping.canonicalProfId,
          mapping.canonicalProfName,
          oldId
        );

        // Atualiza appointments
        rawDb.prepare(`
          UPDATE appointments
          SET profession_id = ?
          WHERE profession_id = ?
        `).run(
          mapping.canonicalProfId,
          oldId
        );

        // Atualiza invites
        rawDb.prepare(`
          UPDATE invites
          SET profession_id = ?,
              specialty_id = COALESCE(specialty_id, ?)
          WHERE profession_id = ?
        `).run(
          mapping.canonicalProfId,
          mapping.specialtyId || null,
          oldId
        );
      } else if (mapping.systemRole) {
        // Caso de funções administrativas atribuídas a profession_id:
        // Ajusta role no users e clinic_users, e limpa profession_id se não for clínico
        rawDb.prepare(`
          UPDATE users
          SET role = CASE WHEN role = 'professional' OR role = 'patient' THEN ? ELSE role END,
              profession_id = NULL,
              profession_name = NULL
          WHERE profession_id = ?
        `).run(mapping.systemRole, oldId);

        rawDb.prepare(`
          UPDATE clinic_users
          SET role = CASE WHEN role = 'professional' THEN ? ELSE role END,
              profession_id = NULL,
              profession_name = NULL,
              is_manager = CASE WHEN ? IN ('clinic_admin', 'clinical_coordinator') THEN 1 ELSE is_manager END
          WHERE profession_id = ?
        `).run(mapping.systemRole, mapping.systemRole, oldId);
      }
    }

    // Normaliza nomes de profissionais padrão que possam estar nulos ou com formato antigo
    rawDb.exec(`
      UPDATE users SET profession_name = 'Cirurgião-Dentista' WHERE profession_id = 'prof-dentista' AND (profession_name IS NULL OR profession_name = 'Odontologia' OR profession_name = 'Dentista');
      UPDATE professionals SET profession_name = 'Cirurgião-Dentista' WHERE profession_id = 'prof-dentista' AND (profession_name IS NULL OR profession_name = 'Odontologia' OR profession_name = 'Dentista');
      UPDATE users SET profession_name = 'Médico' WHERE profession_id = 'prof-medico' AND (profession_name IS NULL OR profession_name = 'Medicina');
      UPDATE professionals SET profession_name = 'Médico' WHERE profession_id = 'prof-medico' AND (profession_name IS NULL OR profession_name = 'Medicina');
      UPDATE users SET profession_name = 'Psicólogo' WHERE profession_id = 'prof-psicologo' AND (profession_name IS NULL OR profession_name = 'Psicologia');
      UPDATE professionals SET profession_name = 'Psicólogo' WHERE profession_id = 'prof-psicologo' AND (profession_name IS NULL OR profession_name = 'Psicologia');
      UPDATE users SET profession_name = 'Psicanalista' WHERE profession_id = 'prof-psicanalista' AND (profession_name IS NULL OR profession_name = '');
      UPDATE professionals SET profession_name = 'Psicanalista' WHERE profession_id = 'prof-psicanalista' AND (profession_name IS NULL OR profession_name = '');
      UPDATE users SET profession_name = 'Psicoterapeuta' WHERE profession_id = 'prof-psicoterapeuta' AND (profession_name IS NULL OR profession_name = '');
      UPDATE professionals SET profession_name = 'Psicoterapeuta' WHERE profession_id = 'prof-psicoterapeuta' AND (profession_name IS NULL OR profession_name = '');
      UPDATE users SET profession_name = 'Fisioterapeuta' WHERE profession_id = 'prof-fisioterapeuta' AND (profession_name IS NULL OR profession_name = 'Fisioterapia');
      UPDATE professionals SET profession_name = 'Fisioterapeuta' WHERE profession_id = 'prof-fisioterapeuta' AND (profession_name IS NULL OR profession_name = 'Fisioterapia');
      UPDATE users SET profession_name = 'Fonoaudiólogo' WHERE profession_id = 'prof-fonoaudiologo' AND (profession_name IS NULL OR profession_name = 'Fonoaudiologia');
      UPDATE professionals SET profession_name = 'Fonoaudiólogo' WHERE profession_id = 'prof-fonoaudiologo' AND (profession_name IS NULL OR profession_name = 'Fonoaudiologia');
      UPDATE users SET profession_name = 'Nutricionista' WHERE profession_id = 'prof-nutricionista' AND (profession_name IS NULL OR profession_name = 'Nutrição');
      UPDATE professionals SET profession_name = 'Nutricionista' WHERE profession_id = 'prof-nutricionista' AND (profession_name IS NULL OR profession_name = 'Nutrição');
      UPDATE users SET profession_name = 'Terapeuta Ocupacional' WHERE profession_id = 'prof-terapeuta-ocupacional' AND (profession_name IS NULL OR profession_name = 'Terapia Ocupacional');
      UPDATE professionals SET profession_name = 'Terapeuta Ocupacional' WHERE profession_id = 'prof-terapeuta-ocupacional' AND (profession_name IS NULL OR profession_name = 'Terapia Ocupacional');
      UPDATE users SET profession_name = 'Psicopedagogo' WHERE profession_id = 'prof-psicopedagogo' AND (profession_name IS NULL OR profession_name = 'Psicopedagogia');
      UPDATE professionals SET profession_name = 'Psicopedagogo' WHERE profession_id = 'prof-psicopedagogo' AND (profession_name IS NULL OR profession_name = 'Psicopedagogia');
      UPDATE users SET profession_name = 'Profissional de Educação Física' WHERE profession_id = 'prof-personal-trainer' AND (profession_name IS NULL OR profession_name = 'Educação Física' OR profession_name = 'Personal Trainer');
      UPDATE professionals SET profession_name = 'Profissional de Educação Física' WHERE profession_id = 'prof-personal-trainer' AND (profession_name IS NULL OR profession_name = 'Educação Física' OR profession_name = 'Personal Trainer');
    `);

    rawDb.exec('COMMIT;');
    console.log('[Migration] migrateProfessionsNormalization executada com sucesso.');
  } catch (err: any) {
    try { rawDb.exec('ROLLBACK;'); } catch (_) {}
    console.error('[Migration] Erro em migrateProfessionsNormalization:', err?.message);
  }
}
