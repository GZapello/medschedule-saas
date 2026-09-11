import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';
import { runSeed } from './seed';

const dbPath = process.env.DATABASE_PATH || path.resolve(__dirname, '../../saas_schedule.db');
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}
const rawDb = new DatabaseSync(dbPath);

// Configurações de alta performance e integridade referencial
rawDb.exec('PRAGMA journal_mode = WAL;');
rawDb.exec('PRAGMA foreign_keys = ON;');

export interface ISafeStatement {
  run(...params: any[]): { changes: number; lastInsertRowid: number | bigint };
  get(...params: any[]): any;
  all(...params: any[]): any[];
}

class SafeDatabase {
  exec(sql: string): void {
    rawDb.exec(sql);
  }

  prepare(sql: string): ISafeStatement {
    const stmt = rawDb.prepare(sql);
    return {
      run: (...params: any[]) => {
        const safeParams = params.map(p => (p === undefined ? null : p));
        return (stmt as any).run(...safeParams);
      },
      get: (...params: any[]) => {
        const safeParams = params.map(p => (p === undefined ? null : p));
        return (stmt as any).get(...safeParams);
      },
      all: (...params: any[]) => {
        const safeParams = params.map(p => (p === undefined ? null : p));
        return (stmt as any).all(...safeParams);
      }
    };
  }
}

export const db = new SafeDatabase();

export function initializeDatabase(): void {
  let schemaPath = path.resolve(__dirname, 'schema.sql');
  if (!fs.existsSync(schemaPath)) {
    schemaPath = path.resolve(__dirname, '../../src/config/schema.sql');
  }
  if (fs.existsSync(schemaPath)) {
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    rawDb.exec(schemaSql);
  } else {
    console.warn('[Database] Arquivo schema.sql não encontrado em', schemaPath);
  }

  // Migrações dinâmicas para adicionar colunas em tabelas existentes
  try {
    const tableColumns = (table: string): string[] => {
      try {
        const info = rawDb.prepare(`PRAGMA table_info(${table})`).all() as any[];
        return info.map(c => c.name);
      } catch {
        return [];
      }
    };

    const addColIfMissing = (table: string, col: string, typeDef: string) => {
      const cols = tableColumns(table);
      if (cols.length > 0 && !cols.includes(col)) {
        try {
          rawDb.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${typeDef};`);
        } catch (e) {
          console.warn(`[Migration] Coluna ${col} na tabela ${table} não pôde ser adicionada:`, e);
        }
      }
    };

    // Colunas em tenants
    addColIfMissing('tenants', 'corporate_name', 'TEXT');
    addColIfMissing('tenants', 'trade_name', 'TEXT');
    addColIfMissing('tenants', 'person_type', "TEXT DEFAULT 'pj'");
    addColIfMissing('tenants', 'municipal_registration', 'TEXT');
    addColIfMissing('tenants', 'state_registration', 'TEXT');
    addColIfMissing('tenants', 'professional_board', 'TEXT');
    addColIfMissing('tenants', 'professional_registry', 'TEXT');
    addColIfMissing('tenants', 'responsible_name', 'TEXT');
    addColIfMissing('tenants', 'responsible_cpf', 'TEXT');
    addColIfMissing('tenants', 'responsible_email', 'TEXT');
    addColIfMissing('tenants', 'responsible_phone', 'TEXT');
    addColIfMissing('tenants', 'responsible_role', 'TEXT');
    addColIfMissing('tenants', 'onboarding_completed', 'INTEGER DEFAULT 0');
    addColIfMissing('tenants', 'onboarding_step', 'INTEGER DEFAULT 1');
    addColIfMissing('tenants', 'manager_confirmed', 'INTEGER DEFAULT 0');
    addColIfMissing('tenants', 'terms_accepted', 'INTEGER DEFAULT 1');
    addColIfMissing('tenants', 'terms_accepted_at', 'TEXT');
    addColIfMissing('tenants', 'privacy_accepted', 'INTEGER DEFAULT 1');
    addColIfMissing('tenants', 'privacy_accepted_at', 'TEXT');
    addColIfMissing('tenants', 'rejection_reason', 'TEXT');
    addColIfMissing('tenants', 'street', 'TEXT');
    addColIfMissing('tenants', 'number', 'TEXT');
    addColIfMissing('tenants', 'complement', 'TEXT');
    addColIfMissing('tenants', 'neighborhood', 'TEXT');
    addColIfMissing('tenants', 'country', "TEXT DEFAULT 'Brasil'");
    addColIfMissing('tenants', 'mobile', 'TEXT');
    addColIfMissing('tenants', 'whatsapp', 'TEXT');
    addColIfMissing('tenants', 'website', 'TEXT');
    addColIfMissing('tenants', 'description', 'TEXT');

    // Novas colunas para profissão estruturada e atendimentos/áreas de atuação livres
    addColIfMissing('clinic_users', 'profession_custom', 'TEXT');
    addColIfMissing('clinic_users', 'practice_areas', 'TEXT');
    addColIfMissing('professionals', 'practice_areas', 'TEXT');

    // Assegura que a lista detalhada de profissões de saúde e administração exista no banco
    const allDetailedProfessions = [
      // Saúde
      { id: 'prof-fonoaudiologia', cat_id: 'cat-fono', name: 'Fonoaudiologia', slug: 'fonoaudiologia', reg_label: 'CRFa', reg_req: 1 },
      { id: 'prof-psicologia', cat_id: 'cat-mental', name: 'Psicologia', slug: 'psicologia', reg_label: 'CRP', reg_req: 1 },
      { id: 'prof-medicina', cat_id: 'cat-med', name: 'Medicina', slug: 'medicina', reg_label: 'CRM', reg_req: 1 },
      { id: 'prof-odontologia', cat_id: 'cat-odonto', name: 'Odontologia', slug: 'odontologia', reg_label: 'CRO', reg_req: 1 },
      { id: 'prof-enfermagem', cat_id: 'cat-enfermagem', name: 'Enfermagem', slug: 'enfermagem', reg_label: 'COREN', reg_req: 1 },
      { id: 'prof-tec-enfermagem', cat_id: 'cat-enfermagem', name: 'Técnico de Enfermagem', slug: 'tecnico-enfermagem', reg_label: 'COREN', reg_req: 1 },
      { id: 'prof-fisioterapia', cat_id: 'cat-reab', name: 'Fisioterapia', slug: 'fisioterapia', reg_label: 'CREFITO', reg_req: 1 },
      { id: 'prof-terapia-ocupacional', cat_id: 'cat-reab', name: 'Terapia Ocupacional', slug: 'terapia-ocupacional', reg_label: 'CREFITO', reg_req: 1 },
      { id: 'prof-nutricao', cat_id: 'cat-nutri', name: 'Nutrição', slug: 'nutricao', reg_label: 'CRN', reg_req: 1 },
      { id: 'prof-psicopedagogia', cat_id: 'cat-mental', name: 'Psicopedagogia', slug: 'psicopedagogia', reg_label: 'ABPp', reg_req: 0 },
      { id: 'prof-educacao-fisica', cat_id: 'cat-esporte', name: 'Educação Física', slug: 'educacao-fisica', reg_label: 'CREF', reg_req: 1 },
      { id: 'prof-servico-social', cat_id: 'cat-outros', name: 'Serviço Social', slug: 'servico-social', reg_label: 'CRESS', reg_req: 1 },
      { id: 'prof-farmacia', cat_id: 'cat-med', name: 'Farmácia', slug: 'farmacia', reg_label: 'CRF', reg_req: 1 },
      { id: 'prof-biomedicina', cat_id: 'cat-med', name: 'Biomedicina', slug: 'biomedicina', reg_label: 'CRBM', reg_req: 1 },
      { id: 'prof-musicoterapia', cat_id: 'cat-integrativa', name: 'Musicoterapia', slug: 'musicoterapia', reg_label: 'UBAM', reg_req: 0 },
      { id: 'prof-arteterapia', cat_id: 'cat-integrativa', name: 'Arteterapia', slug: 'arteterapia', reg_label: 'UBAAT', reg_req: 0 },
      { id: 'prof-podologia', cat_id: 'cat-beleza', name: 'Podologia', slug: 'podologia', reg_label: 'Registro', reg_req: 0 },
      { id: 'prof-acupuntura', cat_id: 'cat-integrativa', name: 'Acupuntura', slug: 'acupuntura', reg_label: 'Registro', reg_req: 0 },
      { id: 'prof-medicina-veterinaria', cat_id: 'cat-pets', name: 'Medicina Veterinária', slug: 'medicina-veterinaria', reg_label: 'CRMV', reg_req: 1 },
      { id: 'prof-outro-saude', cat_id: 'cat-outros', name: 'Outro profissional da saúde', slug: 'outro-saude', reg_label: 'Registro', reg_req: 0 },
      // Gestão e Administração
      { id: 'prof-gestor', cat_id: 'cat-outros', name: 'Gestor da Clínica', slug: 'gestor-clinica', reg_label: null, reg_req: 0 },
      { id: 'prof-administrador', cat_id: 'cat-outros', name: 'Administrador', slug: 'administrador', reg_label: 'CRA', reg_req: 0 },
      { id: 'prof-recepcionista', cat_id: 'cat-outros', name: 'Recepcionista', slug: 'recepcionista', reg_label: null, reg_req: 0 },
      { id: 'prof-secretaria', cat_id: 'cat-outros', name: 'Secretário(a)', slug: 'secretaria', reg_label: null, reg_req: 0 },
      { id: 'prof-auxiliar-adm', cat_id: 'cat-outros', name: 'Auxiliar Administrativo', slug: 'auxiliar-administrativo', reg_label: null, reg_req: 0 },
      { id: 'prof-financeiro', cat_id: 'cat-outros', name: 'Financeiro', slug: 'financeiro', reg_label: null, reg_req: 0 },
      { id: 'prof-rh', cat_id: 'cat-outros', name: 'Recursos Humanos', slug: 'recursos-humanos', reg_label: null, reg_req: 0 },
      { id: 'prof-coord-clinica', cat_id: 'cat-outros', name: 'Coordenação Clínica', slug: 'coordenacao-clinica', reg_label: null, reg_req: 0 },
      { id: 'prof-direcao-tecnica', cat_id: 'cat-outros', name: 'Direção Técnica', slug: 'direcao-tecnica', reg_label: null, reg_req: 0 },
      { id: 'prof-outro', cat_id: 'cat-outros', name: 'Outro', slug: 'outro', reg_label: null, reg_req: 0 }
    ];

    const insertProfStmt = rawDb.prepare(`
      INSERT OR IGNORE INTO professions (id, category_id, name, slug, registration_board_label, registration_required)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (const p of allDetailedProfessions) {
      insertProfStmt.run(p.id, p.cat_id, p.name, p.slug, p.reg_label, p.reg_req);
    }

    // Assegura que o tenant inicial "Espaço Viver Bem" esteja ativo e com onboarding concluído
    rawDb.exec(`
      UPDATE tenants SET
        onboarding_completed = 1,
        manager_confirmed = 1,
        status = 'active',
        corporate_name = COALESCE(corporate_name, name),
        trade_name = COALESCE(trade_name, name),
        responsible_name = COALESCE(responsible_name, 'Dra. Camila Santos'),
        responsible_email = COALESCE(responsible_email, 'diretoria@viverbem.com'),
        responsible_phone = COALESCE(responsible_phone, '(11) 3344-5566')
      WHERE slug = 'clinica-viver-bem';
    `);

    // Inicializa configuração de recibos padrão para tenants ativos se inexistente
    rawDb.exec(`
      INSERT OR IGNORE INTO receipt_settings (
        id, tenant_id, emitter_type, emitter_name, emitter_trade_name, emitter_document,
        emitter_board_name, emitter_registry_number, emitter_registry_state,
        emitter_street, emitter_number, emitter_neighborhood, emitter_city, emitter_state, emitter_zip_code,
        emitter_phone, emitter_email, receipt_prefix, next_sequence, is_configured
      )
      SELECT 
        'rec-set-' || id, id, 'pj', name, COALESCE(trade_name, name), COALESCE(cnpj_cpf, '12.345.678/0001-90'),
        'CRM', '123456', 'SP',
        'Av. Paulista', '1000, Conjunto 501', 'Bela Vista', 'São Paulo', 'SP', '01310-100',
        phone, email, 'REC-', 1, 1
      FROM tenants
      WHERE status = 'active';
    `);
  } catch (migErr) {
    console.warn('[Database] Aviso nas migrações dinâmicas:', migErr);
  }

  // Executa seed caso não existam categorias cadastradas
  try {
    const checkStmt = db.prepare("SELECT count(*) as total FROM categories");
    const result = checkStmt.get() as { total: number };
    if (!result || result.total === 0) {
      console.log('[Database] Executando Seed inicial de taxonomia e dados...');
      runSeed(rawDb);
      console.log('[Database] Seed concluído com sucesso.');
    }
  } catch (err) {
    console.error('[Database] Erro ao inicializar banco de dados:', err);
  }
}
