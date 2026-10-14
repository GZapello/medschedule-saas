import Database from 'better-sqlite3';
import path from 'path';

const dbPath = process.env.DATABASE_PATH || path.resolve(__dirname, '../../medschedule.db');
export const db = new Database(dbPath);

// Configuração do SQLite para máxima performance e concorrência local
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initializeDatabase(): void {
  // Tabela de Profissionais de Saúde
  db.exec(`
    CREATE TABLE IF NOT EXISTS professionals (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      specialty TEXT NOT NULL CHECK(specialty IN ('medical', 'psychology', 'speech_therapy')),
      registration_number TEXT NOT NULL,
      default_duration_minutes INTEGER NOT NULL,
      buffer_minutes INTEGER NOT NULL DEFAULT 0,
      working_hours_start TEXT NOT NULL DEFAULT '08:00',
      working_hours_end TEXT NOT NULL DEFAULT '18:00',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Tabela de Agendamentos com suporte a Soft Delete e Versionamento para Sincronização Local-First
  db.exec(`
    CREATE TABLE IF NOT EXISTS appointments (
      id TEXT PRIMARY KEY,
      patient_name TEXT NOT NULL,
      patient_phone TEXT NOT NULL,
      patient_email TEXT,
      professional_id TEXT NOT NULL,
      specialty TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show')),
      notes TEXT,
      clinical_metadata TEXT, -- JSON serializado com dados específicos da especialidade
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (professional_id) REFERENCES professionals(id)
    );
  `);

  // Índices para otimizar busca temporal e detecção de sobreposição/conflitos
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_appointments_time_prof 
    ON appointments (professional_id, start_time, end_time, is_deleted);

    CREATE INDEX IF NOT EXISTS idx_appointments_sync 
    ON appointments (updated_at, is_deleted);
  `);

  // Tabela de Usuários com RBAC (Role-Based Access Control)
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('professional', 'client')),
      profession_category TEXT,
      profession_id TEXT,
      phone TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  `);

  // Seed de profissionais representativos das três especialidades requeridas
  const countStmt = db.prepare('SELECT COUNT(*) as count FROM professionals');
  const count = (countStmt.get() as { count: number }).count;

  if (count === 0) {
    const insertProf = db.prepare(`
      INSERT INTO professionals (id, name, specialty, registration_number, default_duration_minutes, buffer_minutes)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    insertProf.run('prof-med-1', 'Dra. Camila Torres', 'medical', 'CRM/SP 145982', 30, 0);
    insertProf.run('prof-psi-1', 'Dr. Lucas Silveira', 'psychology', 'CRP 06/98214', 50, 10);
    insertProf.run('prof-fono-1', 'Fga. Beatriz Duarte', 'speech_therapy', 'CRFa 2-18452', 40, 5);
  }

  // Seed de usuários iniciais (Médico, Psicólogo, Paciente)
  const userCountStmt = db.prepare('SELECT COUNT(*) as count FROM users');
  const userCount = (userCountStmt.get() as { count: number }).count;

  if (userCount === 0) {
    // Hash de '123456' usando SHA-256 fixo para demonstração
    const demoHash = 'ba3253876aed6bc22d4a6ff53d8406c6ad864195ed144ab5c87621b6c233b548'; // sha256('123456')

    const insertUser = db.prepare(`
      INSERT INTO users (id, name, email, password_hash, role, profession_category, profession_id, phone, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `);

    insertUser.run(
      'user-prof-1',
      'Dra. Camila Torres',
      'dra.camila@clinica.com',
      demoHash,
      'professional',
      'health_wellness',
      'med_general',
      '(11) 98765-4321'
    );

    insertUser.run(
      'user-prof-2',
      'Dr. Lucas Silveira',
      'dr.lucas@clinica.com',
      demoHash,
      'professional',
      'health_wellness',
      'psychology',
      '(11) 97654-3210'
    );

    insertUser.run(
      'user-client-1',
      'Mariana Silva',
      'mariana@email.com',
      demoHash,
      'client',
      null,
      null,
      '(11) 91234-5678'
    );
  }
}

